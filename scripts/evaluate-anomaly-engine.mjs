/**
 * evaluate-anomaly-engine.mjs
 *
 * Runs the BLOCKID anomaly detection engine (src/lib/ml/anomaly.ts) against
 * the 500-event synthetic dataset produced by generate-anomaly-dataset.mjs and
 * computes a rigorous empirical evaluation:
 *
 *   - Per-detector Confusion Matrix (TP, FP, TN, FN)
 *   - Precision, Recall, F1-Score per detector
 *   - Overall weighted F1 and macro-average F1
 *   - ROC curve data points (TPR vs FPR at multiple score thresholds)
 *   - Area Under the ROC Curve (AUC-ROC) via trapezoidal integration
 *
 * Outputs: data/anomaly-evaluation-results.json
 *
 * Usage:
 *   node scripts/generate-anomaly-dataset.mjs   # generate dataset first
 *   node scripts/evaluate-anomaly-engine.mjs     # then evaluate
 *
 * Implementation note
 * ───────────────────
 * The anomaly engine (analyzeAnomalies) works over a WINDOW of events, not
 * single events. We use a rolling window approach: for each event at position i,
 * we feed events[0..i] to the engine and read whether the engine flagged it.
 * The detector's finding type determines which anomaly class it targets.
 * Ground truth comes from the dataset label field.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// ── Load dataset ──────────────────────────────────────────────────────────────
const datasetPath = path.join(root, "data", "anomaly-dataset.json");
if (!fs.existsSync(datasetPath)) {
  console.error("❌ Dataset not found. Run generate-anomaly-dataset.mjs first.");
  process.exit(1);
}
const { events } = JSON.parse(fs.readFileSync(datasetPath, "utf8"));

// ── Load anomaly engine via tsx / dynamic import ──────────────────────────────
// The engine is TypeScript; we use tsx (already a dev dep via test:contract) or
// fall back to a pure-JS transliteration embedded here.

let analyzeAnomalies;

try {
  // Attempt to load compiled JS from Vite cache or a pre-built bundle
  const enginePath = path.join(root, "src", "lib", "ml", "anomaly.ts");
  // Use a dynamic eval-based loader for .ts files via node --loader tsx
  // When called via: node --import tsx scripts/evaluate-anomaly-engine.mjs
  const mod = await import(pathToFileURL(enginePath).href);
  analyzeAnomalies = mod.analyzeAnomalies;
  console.log("✔ Loaded anomaly engine from TypeScript source via tsx loader.");
} catch {
  console.warn("⚠ tsx loader not available. Using inlined JS port of the anomaly engine.");
  // Inlined pure-JS equivalent (mirrors the TypeScript source exactly)
  analyzeAnomalies = buildInlinedEngine();
}

// ── Evaluation ────────────────────────────────────────────────────────────────

// Detector name ↔ AnomalyType mapping
const DETECTOR_TYPES = ["burst", "failure_streak", "geo_jump", "off_hours", "latency_spike"];

// Label sets — events labelled "normal" are negative; anything else is positive
// for the corresponding detector type.
const ANOMALY_LABELS = new Set(DETECTOR_TYPES);

// Per-detector confusion matrix counters
const cm = {};
for (const type of DETECTOR_TYPES) {
  cm[type] = { TP: 0, FP: 0, TN: 0, FN: 0, scores: [] };
}
// Overall
const overall = { TP: 0, FP: 0, TN: 0, FN: 0 };

// Rolling evaluation: feed events[0..i] to the engine at each step
// Keep a running window of up to 50 events for efficiency
const WINDOW = 50;

for (let i = 0; i < events.length; i++) {
  const window = events.slice(Math.max(0, i - WINDOW + 1), i + 1);
  const report = analyzeAnomalies(window);
  const groundTruth = events[i].label;
  const isPositive = ANOMALY_LABELS.has(groundTruth);

  // Determine detected type (if any)
  const detectedType = report.findings.length > 0 ? report.findings[0].type : null;
  const detectedScore = report.riskScore;
  const isDetected = report.isAnomalous;

  // Overall confusion
  if (isPositive && isDetected) overall.TP++;
  else if (isPositive && !isDetected) overall.FN++;
  else if (!isPositive && isDetected) overall.FP++;
  else overall.TN++;

  // Per-detector confusion
  for (const type of DETECTOR_TYPES) {
    const groundTruthForDetector = groundTruth === type;
    const detectedByThisDetector = report.findings.some((f) => f.type === type);
    const detectorScore = report.findings.find((f) => f.type === type)?.score ?? 0;

    cm[type].scores.push({ score: detectorScore, isPositive: groundTruthForDetector });

    if (groundTruthForDetector && detectedByThisDetector) cm[type].TP++;
    else if (groundTruthForDetector && !detectedByThisDetector) cm[type].FN++;
    else if (!groundTruthForDetector && detectedByThisDetector) cm[type].FP++;
    else cm[type].TN++;
  }
}

// ── Metric calculations ───────────────────────────────────────────────────────

function metrics(m) {
  const precision = m.TP + m.FP > 0 ? m.TP / (m.TP + m.FP) : 0;
  const recall = m.TP + m.FN > 0 ? m.TP / (m.TP + m.FN) : 0;
  const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
  const accuracy = (m.TP + m.TN) / (m.TP + m.TN + m.FP + m.FN);
  return { precision, recall, f1, accuracy };
}

function rocCurve(scores) {
  // Sort descending by score
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const positives = sorted.filter((s) => s.isPositive).length;
  const negatives = sorted.length - positives;
  if (positives === 0 || negatives === 0) return { points: [], auc: 0.5 };

  let tp = 0, fp = 0;
  const points = [{ fpr: 0, tpr: 0 }];
  for (const { isPositive } of sorted) {
    if (isPositive) tp++;
    else fp++;
    points.push({ fpr: fp / negatives, tpr: tp / positives });
  }
  points.push({ fpr: 1, tpr: 1 });

  // Trapezoidal AUC
  let auc = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].fpr - points[i - 1].fpr;
    const avgY = (points[i].tpr + points[i - 1].tpr) / 2;
    auc += dx * avgY;
  }
  return { points: points.filter((_, i) => i % 10 === 0), auc }; // downsample for file size
}

// Build per-detector results
const detectorResults = {};
for (const type of DETECTOR_TYPES) {
  const m = cm[type];
  const met = metrics(m);
  const roc = rocCurve(m.scores);
  detectorResults[type] = {
    confusionMatrix: { TP: m.TP, FP: m.FP, TN: m.TN, FN: m.FN },
    precision: round3(met.precision),
    recall: round3(met.recall),
    f1: round3(met.f1),
    accuracy: round3(met.accuracy),
    auc_roc: round3(roc.auc),
    roc_curve_sample: roc.points.slice(0, 20),
  };
}

const overallMet = metrics(overall);
const macroF1 = DETECTOR_TYPES.reduce((s, t) => s + detectorResults[t].f1, 0) / DETECTOR_TYPES.length;

function round3(x) { return Math.round(x * 1000) / 1000; }

// ── Print summary table ───────────────────────────────────────────────────────

console.log("\n╔══════════════════════════════════════════════════════════════════════╗");
console.log("║           BLOCKID Anomaly Detector Evaluation Results               ║");
console.log("╚══════════════════════════════════════════════════════════════════════╝\n");
console.log(
  `${"Detector".padEnd(22)} ${"Precision".padStart(10)} ${"Recall".padStart(10)} ${"F1".padStart(10)} ${"AUC-ROC".padStart(10)} ${"TP/FP/TN/FN"}`
);
console.log("─".repeat(90));
for (const type of DETECTOR_TYPES) {
  const r = detectorResults[type];
  const m = r.confusionMatrix;
  console.log(
    `${type.padEnd(22)} ${String(r.precision).padStart(10)} ${String(r.recall).padStart(10)} ${String(r.f1).padStart(10)} ${String(r.auc_roc).padStart(10)}    ${m.TP}/${m.FP}/${m.TN}/${m.FN}`
  );
}
console.log("─".repeat(90));
console.log(`\nOverall:  Precision=${round3(overallMet.precision)}  Recall=${round3(overallMet.recall)}  F1=${round3(overallMet.f1)}  Macro-F1=${round3(macroF1)}`);
console.log(`Overall CM: TP=${overall.TP}  FP=${overall.FP}  TN=${overall.TN}  FN=${overall.FN}\n`);

// ── Write results ─────────────────────────────────────────────────────────────

const outDir = path.join(root, "data");
const outFile = path.join(outDir, "anomaly-evaluation-results.json");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  outFile,
  JSON.stringify(
    {
      metadata: {
        evaluatedAt: new Date().toISOString(),
        datasetEvents: events.length,
        windowSize: WINDOW,
        alertThreshold: 40,
      },
      overall: {
        confusionMatrix: overall,
        precision: round3(overallMet.precision),
        recall: round3(overallMet.recall),
        f1: round3(overallMet.f1),
        accuracy: round3(overallMet.accuracy),
        macroF1: round3(macroF1),
      },
      perDetector: detectorResults,
    },
    null,
    2
  )
);
console.log(`✔ Evaluation results written to ${outFile}`);

// ── Inlined pure-JS anomaly engine (fallback when tsx is not available) ───────
// Mirrors src/lib/ml/anomaly.ts exactly — edit both in tandem.

function buildInlinedEngine() {
  const ALERT_THRESHOLD = 40;
  function clamp(v, mn = 0, mx = 100) { return Math.min(mx, Math.max(mn, v)); }
  function median(arr) {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function mad(arr) {
    const med = median(arr);
    return median(arr.map((v) => Math.abs(v - med)));
  }
  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  function byTime(evts) { return [...evts].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)); }

  function detectBursts(evts, { windowMs = 300_000, maxInWindow = 10 } = {}) {
    const sorted = byTime(evts);
    const times = sorted.map((e) => Date.parse(e.timestamp));
    let worst = 0, left = 0;
    for (let r = 0; r < times.length; r++) {
      while (times[r] - times[left] > windowMs) left++;
      worst = Math.max(worst, r - left + 1);
    }
    if (worst <= maxInWindow) return null;
    const excess = (worst - maxInWindow) / maxInWindow;
    return { type: "burst", severity: worst >= maxInWindow * 3 ? "high" : "medium", score: clamp(40 + excess * 60), detail: "" };
  }
  function detectFailureStreak(evts, minStreak = 3) {
    const sorted = byTime(evts);
    let streak = 0;
    for (let i = sorted.length - 1; i >= 0 && !sorted[i].success; i--) streak++;
    if (streak < minStreak) return null;
    return { type: "failure_streak", severity: streak >= minStreak * 3 ? "high" : "medium", score: clamp(30 + ((streak - minStreak) / (minStreak * 2)) * 70), detail: "" };
  }
  function detectGeoJumps(evts, { maxSpeedKmh = 900 } = {}) {
    const sorted = byTime(evts).filter((e) => e.latitude != null && e.longitude != null);
    let worstKmh = 0;
    for (let i = 1; i < sorted.length; i++) {
      const hours = (Date.parse(sorted[i].timestamp) - Date.parse(sorted[i - 1].timestamp)) / 3_600_000;
      if (hours <= 0) continue;
      const d = haversineKm(sorted[i - 1].latitude, sorted[i - 1].longitude, sorted[i].latitude, sorted[i].longitude);
      worstKmh = Math.max(worstKmh, d / hours);
    }
    if (worstKmh <= maxSpeedKmh) return null;
    const ratio = worstKmh / maxSpeedKmh;
    return { type: "geo_jump", severity: ratio >= 4 ? "high" : "medium", score: clamp(35 + (ratio - 1) * 15), detail: "" };
  }
  function detectOffHours(evts, startHour = 0, endHour = 5) {
    if (evts.length < 3) return null;
    const recent = byTime(evts).slice(-10);
    const off = recent.filter((e) => { const h = new Date(e.timestamp).getUTCHours(); return h >= startHour && h < endHour; }).length;
    const fraction = off / recent.length;
    if (fraction < 0.5) return null;
    return { type: "off_hours", severity: "low", score: clamp(fraction * 55), detail: "" };
  }
  function detectLatencySpike(evts, { zThreshold = 3.5, minSamples = 5 } = {}) {
    const latencies = byTime(evts).map((e) => e.latencyMs).filter((v) => typeof v === "number" && isFinite(v));
    if (latencies.length < minSamples) return null;
    const baseline = latencies.slice(0, -1);
    const latest = latencies[latencies.length - 1];
    const med = median(baseline);
    const madVal = mad(baseline);
    const z = Math.abs(madVal > 0 ? (latest - med) / (madVal * 1.4826) : med > 0 ? (latest - med) / med : 0);
    if (z < zThreshold || latest <= med) return null;
    return { type: "latency_spike", severity: "low", score: clamp(25 + (z / zThreshold - 1) * 20), detail: "" };
  }

  return function analyzeAnomalies(evts) {
    const candidates = [
      detectBursts(evts), detectFailureStreak(evts), detectGeoJumps(evts),
      detectOffHours(evts), detectLatencySpike(evts),
    ].filter(Boolean);
    candidates.sort((a, b) => b.score - a.score);
    const primary = candidates[0]?.score ?? 0;
    const boost = candidates.slice(1).reduce((s, f) => s + f.score * 0.15, 0);
    const riskScore = candidates.length ? Math.round(clamp(primary + boost)) : 0;
    return { isAnomalous: riskScore >= ALERT_THRESHOLD, riskScore, findings: candidates };
  };
}
