/**
 * generate-anomaly-dataset.mjs
 *
 * Generates a reproducible 500-event synthetic verification dataset for
 * evaluating the BLOCKID anomaly detection engine (src/lib/ml/anomaly.ts).
 *
 * Dataset composition (deterministic, seeded):
 *   350 — Normal baseline events (variable hours, realistic coordinates)
 *    50 — Burst attack events       (>10 events within a 5-min sliding window)
 *    35 — Failure streak events     (consecutive failed verifications)
 *    30 — Geo velocity jump events  (Haversine velocity > 900 km/h)
 *    20 — Temporal off-hours events (00:00–05:00 local hour)
 *    15 — Latency spike events      (modified z-score > 3.5× MAD baseline)
 *   ────
 *   500 total
 *
 * Each event includes:
 *   - timestamp     : ISO 8601 UTC
 *   - success       : boolean
 *   - latencyMs     : number
 *   - latitude      : number | undefined
 *   - longitude     : number | undefined
 *   - label         : "normal" | "burst" | "failure_streak" | "geo_jump" |
 *                     "off_hours" | "latency_spike"  (ground truth for eval)
 *
 * Output: data/anomaly-dataset.json
 *
 * Usage:
 *   node scripts/generate-anomaly-dataset.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "data");
const outFile = path.join(outDir, "anomaly-dataset.json");

// ── Deterministic LCG pseudo-random number generator ────────────────────────
// This is intentionally not crypto-secure — reproducibility is the goal.
// Same seed → same dataset across all machines.
let lcgState = 0xdeadbeef;
function lcg() {
  lcgState = Math.imul(lcgState, 1664525) + 1013904223;
  return ((lcgState >>> 0) / 0xffffffff);
}
function randRange(min, max) { return min + lcg() * (max - min); }
function randInt(min, max) { return Math.floor(randRange(min, max + 1)); }
function randBool(p = 0.5) { return lcg() < p; }

// ── Reference time: 2026-01-15 12:00:00 UTC ─────────────────────────────────
const EPOCH_MS = new Date("2026-01-15T12:00:00Z").getTime();

function isoAt(ms) { return new Date(ms).toISOString(); }

// ── Realistic coordinate pools ───────────────────────────────────────────────
// Major cities used for normal events
const CITIES = [
  [51.5074, -0.1278],   // London
  [40.7128, -74.0060],  // New York
  [35.6762, 139.6503],  // Tokyo
  [48.8566, 2.3522],    // Paris
  [55.7558, 37.6173],   // Moscow
  [-33.8688, 151.2093], // Sydney
  [28.6139, 77.2090],   // Delhi
  [23.1291, 113.2644],  // Guangzhou
  [-23.5505, -46.6333], // São Paulo
  [30.0444, 31.2357],   // Cairo
];

function pickCity() {
  return CITIES[randInt(0, CITIES.length - 1)];
}
function jitterCoord([lat, lon], jitter = 0.3) {
  return [lat + randRange(-jitter, jitter), lon + randRange(-jitter, jitter)];
}

// ── Event factories ──────────────────────────────────────────────────────────

function makeNormalEvent(offsetMs) {
  const [lat, lon] = jitterCoord(pickCity());
  const hour = randInt(7, 21); // daytime
  const ts = new Date(EPOCH_MS + offsetMs);
  ts.setUTCHours(hour, randInt(0, 59), randInt(0, 59), 0);
  return {
    timestamp: ts.toISOString(),
    success: randBool(0.94),
    latencyMs: Math.round(randRange(80, 350)),
    latitude: lat,
    longitude: lon,
    label: "normal",
  };
}

/**
 * Burst: inject N events within a 90-second window, all from the same origin.
 * The short timing window (< 5 min) triggers the sliding-window burst detector.
 */
function makeBurstCluster(anchorMs, clusterSize = 14) {
  const [lat, lon] = jitterCoord(CITIES[randInt(0, CITIES.length - 1)], 0.01);
  return Array.from({ length: clusterSize }, (_, i) => ({
    timestamp: isoAt(anchorMs + i * 6_000), // 6 s apart → 14×6s = 84s window
    success: randBool(0.6),
    latencyMs: Math.round(randRange(50, 150)),
    latitude: lat,
    longitude: lon,
    label: "burst",
  }));
}

/**
 * Failure streak: all events are failures (success=false) at the tail.
 * 5 consecutive failures exceeds the minStreak=3 detector threshold.
 */
function makeFailureStreakCluster(anchorMs, streakLen = 5) {
  return Array.from({ length: streakLen }, (_, i) => ({
    timestamp: isoAt(anchorMs + i * 30_000),
    success: false,
    latencyMs: Math.round(randRange(100, 400)),
    latitude: undefined,
    longitude: undefined,
    label: "failure_streak",
  }));
}

/**
 * Geo velocity jump: two events 3 min apart but ~11,000 km away (London→NYC).
 * Implied speed: 11000km / 0.05h ≈ 220,000 km/h → strongly flagged.
 */
function makeGeoJumpPair(anchorMs) {
  return [
    {
      timestamp: isoAt(anchorMs),
      success: true,
      latencyMs: Math.round(randRange(120, 300)),
      latitude: 51.5074,
      longitude: -0.1278,
      label: "geo_jump",
    },
    {
      timestamp: isoAt(anchorMs + 3 * 60_000), // 3 minutes later
      success: true,
      latencyMs: Math.round(randRange(120, 300)),
      latitude: 40.7128,
      longitude: -74.006,
      label: "geo_jump",
    },
  ];
}

/**
 * Off-hours: events between 01:00-04:00 UTC.
 * The off-hours detector checks events 00:00-05:00 by default.
 */
function makeOffHoursEvent(anchorMs) {
  const ts = new Date(anchorMs);
  ts.setUTCHours(randInt(1, 4), randInt(0, 59), randInt(0, 59), 0);
  return {
    timestamp: ts.toISOString(),
    success: randBool(0.85),
    latencyMs: Math.round(randRange(90, 280)),
    latitude: undefined,
    longitude: undefined,
    label: "off_hours",
  };
}

/**
 * Latency spike: one event with 10× the baseline median.
 * Modified z-score = (spike - median) / (MAD * 1.4826); values >3.5 are flagged.
 */
function makeLatencySpikeEvent(anchorMs, baselineMs = 200) {
  return {
    timestamp: isoAt(anchorMs),
    success: true,
    latencyMs: Math.round(baselineMs * (8 + randRange(0, 4))), // 8-12× baseline
    latitude: undefined,
    longitude: undefined,
    label: "latency_spike",
  };
}

// ── Compose dataset ───────────────────────────────────────────────────────────

function generateDataset() {
  const events = [];
  let t = EPOCH_MS;
  const advance = (minMs, maxMs) => { t += randRange(minMs, maxMs); };

  // 350 normal events spread over ~8 days
  for (let i = 0; i < 350; i++) {
    advance(1_200_000, 2_400_000); // 20-40 min apart
    events.push(makeNormalEvent(t - EPOCH_MS));
  }

  // 50 burst events (4 clusters of ~13 events each)
  for (let b = 0; b < 4; b++) {
    advance(3_600_000, 7_200_000);
    const cluster = makeBurstCluster(t, 13);
    events.push(...cluster);
    t += 90_000; // skip past the cluster
  }

  // 35 failure streak events (7 streaks of 5)
  for (let s = 0; s < 7; s++) {
    advance(2_400_000, 4_800_000);
    events.push(...makeFailureStreakCluster(t, 5));
    t += 150_000;
  }

  // 30 geo jump events (15 pairs)
  for (let g = 0; g < 15; g++) {
    advance(3_600_000, 10_800_000);
    events.push(...makeGeoJumpPair(t));
    t += 4 * 60_000;
  }

  // 20 off-hours events
  for (let o = 0; o < 20; o++) {
    advance(3_600_000, 14_400_000);
    events.push(makeOffHoursEvent(t));
  }

  // 15 latency spike events
  for (let l = 0; l < 15; l++) {
    advance(1_800_000, 5_400_000);
    events.push(makeLatencySpikeEvent(t));
  }

  // Sort chronologically (mixed injection order)
  events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return events;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const dataset = generateDataset();

// Verify composition
const composition = dataset.reduce((acc, e) => {
  acc[e.label] = (acc[e.label] ?? 0) + 1;
  return acc;
}, {});

console.log("Dataset composition:");
for (const [label, count] of Object.entries(composition)) {
  console.log(`  ${label.padEnd(20)} ${count}`);
}
console.log(`  ${"TOTAL".padEnd(20)} ${dataset.length}`);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  outFile,
  JSON.stringify(
    {
      metadata: {
        generated: new Date().toISOString(),
        seed: "0xdeadbeef",
        totalEvents: dataset.length,
        composition,
        description:
          "Synthetic 500-event verification dataset for BLOCKID anomaly detector evaluation. " +
          "Labels are ground truth for computing Confusion Matrix, Precision, Recall, and F1.",
      },
      events: dataset,
    },
    null,
    2
  )
);

console.log(`\n✔ Dataset written to ${outFile}`);
