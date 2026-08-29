/**
 * Anomaly detection — Phase 6 (AI/ML).
 *
 * Deterministic, dependency-free detectors over a stream of credential
 * verification events. Designed for explainability: every finding carries
 * the rule that fired, its severity and a 0-100 magnitude score.
 *
 * All functions are pure — no I/O, no randomness — so results are stable
 * and fully unit-testable.
 */

export interface AnomalyEvent {
  /** ISO 8601 timestamp of the verification attempt. */
  timestamp: string;
  /** Whether the verification succeeded. */
  success: boolean;
  /** Round-trip verification latency in ms (optional). */
  latencyMs?: number;
  /** Event location, used for impossible-travel checks (optional). */
  latitude?: number;
  longitude?: number;
}

export type AnomalyType = "burst" | "failure_streak" | "geo_jump" | "off_hours" | "latency_spike";
export type AnomalySeverity = "low" | "medium" | "high";

export interface AnomalyFinding {
  type: AnomalyType;
  severity: AnomalySeverity;
  /** 0-100 magnitude within this rule. */
  score: number;
  detail: string;
}

export interface AnomalyStats {
  count: number;
  successRate: number;
  medianLatencyMs: number | null;
}

export interface AnomalyReport {
  /** True when riskScore crosses the alerting threshold. */
  isAnomalous: boolean;
  /** Aggregated 0-100 risk across all findings. */
  riskScore: number;
  findings: AnomalyFinding[];
  stats: AnomalyStats;
}

// ─── Small statistics helpers ────────────────────────────────────────────────

export function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Median Absolute Deviation — robust spread estimator. */
export function medianAbsoluteDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const med = median(values);
  return median(values.map((v) => Math.abs(v - med)));
}

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance between two coordinates in km. */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

function byTimeAsc(events: AnomalyEvent[]): AnomalyEvent[] {
  return [...events].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

// ─── Detectors ───────────────────────────────────────────────────────────────

export interface BurstOptions {
  windowMs?: number;
  maxInWindow?: number;
}

/**
 * Sliding-window rate check: more than `maxInWindow` attempts inside
 * `windowMs` indicates scripted/credential-stuffing behaviour.
 */
export function detectBursts(
  events: AnomalyEvent[],
  { windowMs = 5 * 60_000, maxInWindow = 10 }: BurstOptions = {}
): AnomalyFinding | null {
  const sorted = byTimeAsc(events);
  const times = sorted.map((e) => Date.parse(e.timestamp));
  let worst = 0;

  let left = 0;
  for (let right = 0; right < times.length; right++) {
    while (times[right] - times[left] > windowMs) left++;
    worst = Math.max(worst, right - left + 1);
  }

  if (worst <= maxInWindow) return null;
  const excess = (worst - maxInWindow) / maxInWindow;
  const severity: AnomalySeverity = worst >= maxInWindow * 3 ? "high" : worst >= maxInWindow * 2 ? "medium" : "low";
  return {
    type: "burst",
    severity,
    score: clamp(40 + excess * 60),
    detail: `${worst} verifications inside ${Math.round(windowMs / 60_000)} min (limit ${maxInWindow}).`,
  };
}

/**
 * Consecutive failures at the tail of the stream suggest probing,
 * replay attempts or a compromised holder.
 */
export function detectFailureStreak(
  events: AnomalyEvent[],
  minStreak = 3
): AnomalyFinding | null {
  const sorted = byTimeAsc(events);
  let streak = 0;
  for (let i = sorted.length - 1; i >= 0 && !sorted[i].success; i--) streak++;

  if (streak < minStreak) return null;
  const severity: AnomalySeverity = streak >= minStreak * 3 ? "high" : streak >= minStreak * 2 ? "medium" : "low";
  return {
    type: "failure_streak",
    severity,
    score: clamp(30 + ((streak - minStreak) / (minStreak * 2)) * 70),
    detail: `${streak} consecutive failed verifications.`,
  };
}

export interface GeoJumpOptions {
  /** Max plausible travel speed in km/h between consecutive events. */
  maxSpeedKmh?: number;
}

/**
 * Impossible travel: two consecutive located events whose implied speed
 * exceeds commercial flight speed.
 */
export function detectGeoJumps(events: AnomalyEvent[], { maxSpeedKmh = 900 }: GeoJumpOptions = {}): AnomalyFinding | null {
  const sorted = byTimeAsc(events).filter((e) => e.latitude !== undefined && e.longitude !== undefined);

  let worstKmh = 0;
  let worstPair: [AnomalyEvent, AnomalyEvent] | null = null;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const hours = (Date.parse(curr.timestamp) - Date.parse(prev.timestamp)) / 3_600_000;
    if (hours <= 0) continue; // same instant — ignore clock skew
    const distance = haversineKm(prev.latitude!, prev.longitude!, curr.latitude!, curr.longitude!);
    const speed = distance / hours;
    if (speed > worstKmh) {
      worstKmh = speed;
      worstPair = [prev, curr];
    }
  }

  if (!worstPair || worstKmh <= maxSpeedKmh) return null;
  const ratio = worstKmh / maxSpeedKmh;
  const severity: AnomalySeverity = ratio >= 4 ? "high" : ratio >= 2 ? "medium" : "low";
  return {
    type: "geo_jump",
    severity,
    score: clamp(35 + (ratio - 1) * 15),
    detail: `${Math.round(worstKmh)} km/h implied travel between two verifications.`,
  };
}

/**
 * Off-hours activity: majority of recent verifications between
 * `startHour` (inclusive) and `endHour` (exclusive).
 */
export function detectOffHours(
  events: AnomalyEvent[],
  startHour = 0,
  endHour = 5
): AnomalyFinding | null {
  if (events.length < 3) return null;
  const recent = byTimeAsc(events).slice(-10);
  const offHours = recent.filter((e) => {
    const hour = new Date(e.timestamp).getHours();
    return startHour <= endHour
      ? hour >= startHour && hour < endHour
      : hour >= startHour || hour < endHour;
  }).length;

  const fraction = offHours / recent.length;
  if (fraction < 0.5) return null;
  return {
    type: "off_hours",
    severity: fraction >= 0.9 ? "medium" : "low",
    score: clamp(fraction * 55),
    detail: `${Math.round(fraction * 100)}% of recent verifications occurred between ${String(startHour).padStart(2, "0")}:00 and ${String(endHour).padStart(2, "0")}:00.`,
  };
}

export interface LatencySpikeOptions {
  /** Robust z-score threshold (modified z using MAD). */
  zThreshold?: number;
  /** Baseline needs at least this many samples before flagging. */
  minSamples?: number;
}

/**
 * Latency outlier via modified z-score (median/MAD based, resilient to
 * small samples and heavy tails).
 */
export function detectLatencySpike(
  events: AnomalyEvent[],
  { zThreshold = 3.5, minSamples = 5 }: LatencySpikeOptions = {}
): AnomalyFinding | null {
  const withLatency = byTimeAsc(events)
    .map((e) => e.latencyMs)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (withLatency.length < minSamples) return null;

  const baseline = withLatency.slice(0, -1);
  const latest = withLatency[withLatency.length - 1];
  const med = median(baseline);
  const mad = medianAbsoluteDeviation(baseline);

  // MAD == 0 (identical latencies): fall back to relative deviation.
  const deviation = mad > 0 ? (latest - med) / (mad * 1.4826) : med > 0 ? (latest - med) / med : 0;
  const z = Math.abs(deviation);
  if (z < zThreshold || latest <= med) return null;

  const ratio = z / zThreshold;
  return {
    type: "latency_spike",
    severity: ratio >= 3 ? "medium" : "low",
    score: clamp(25 + (ratio - 1) * 20),
    detail: `Latest verification took ${Math.round(latest)}ms vs typical ${Math.round(med)}ms.`,
  };
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

const RISK_ALERT_THRESHOLD = 40;

/** Run every detector and aggregate findings into a single report. */
export function analyzeAnomalies(events: AnomalyEvent[]): AnomalyReport {
  const sorted = byTimeAsc(events);
  const successes = sorted.filter((e) => e.success).length;
  const latencies = sorted
    .map((e) => e.latencyMs)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  const candidates = [
    detectBursts(sorted),
    detectFailureStreak(sorted),
    detectGeoJumps(sorted),
    detectOffHours(sorted),
    detectLatencySpike(sorted),
  ].filter((f): f is AnomalyFinding => f !== null);

  candidates.sort((a, b) => b.score - a.score);

  // Primary finding dominates; secondary findings add diminishing weight.
  const primary = candidates[0]?.score ?? 0;
  const secondaryBoost = candidates.slice(1).reduce((acc, f) => acc + f.score * 0.15, 0);
  const riskScore = candidates.length ? Math.round(clamp(primary + secondaryBoost)) : 0;

  return {
    isAnomalous: riskScore >= RISK_ALERT_THRESHOLD,
    riskScore,
    findings: candidates,
    stats: {
      count: sorted.length,
      successRate: sorted.length ? successes / sorted.length : 0,
      medianLatencyMs: latencies.length ? Math.round(median(latencies)) : null,
    },
  };
}
