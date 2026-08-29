/**
 * Phase 8 — liveness detection scoring (pure, DOM-free).
 *
 * The camera loop in LivenessDetector.tsx downsamples video frames to small
 * luma grids; this module turns those grids into a liveness verdict using
 * lightweight, dependency-free heuristics:
 *
 *  - motion:      consecutive-frame energy (mean absolute luma difference)
 *  - texture:     per-frame spatial variance (flat printed photos score low)
 *  - brightness:  global luminance sanity band
 *
 * A replayed photo/video tends to fail on texture + motion dynamics.
 */

export const LIVENESS_MIN_FRAMES = 6;
/** Average frame-to-frame energy required (luma units, 0–255 scale). */
export const MOTION_MIN_AVG_ENERGY = 0.6;
/** Minimum per-frame spatial variance — flat screens/prints score below this. */
export const TEXTURE_MIN_VARIANCE = 40;
/** Global brightness sanity band (mean luma). */
export const BRIGHTNESS_MIN = 30;
export const BRIGHTNESS_MAX = 235;
/** Score (0–100) required to pass. */
export const LIVENESS_PASS_SCORE = 60;

export interface LivenessResult {
  score: number;
  passed: boolean;
  framesAnalyzed: number;
  avgMotionEnergy: number;
  avgTextureVariance: number;
  avgBrightness: number;
  reasons: string[];
}

// ─── Primitives ──────────────────────────────────────────────────────────────

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Mean of a numeric series (0 for empty input). */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Spatial variance of one luma frame grid.
 * High variance ⇒ textured real-world capture; low ⇒ flat screen/print.
 */
export function frameVariance(frame: number[]): number {
  if (frame.length === 0) return 0;
  const m = mean(frame);
  return mean(frame.map((v) => (v - m) ** 2));
}

/**
 * Frame-to-frame energy: mean absolute difference between two grids.
 */
export function frameEnergy(prev: number[], curr: number[]): number {
  if (prev.length === 0 || prev.length !== curr.length) return 0;
  let total = 0;
  for (let i = 0; i < prev.length; i++) total += Math.abs(prev[i] - curr[i]);
  return total / prev.length;
}

// ─── Aggregation ────────────────────────────────────────────────────────────

/**
 * Evaluate a captured frame sequence and produce a liveness verdict.
 *
 * Scoring model (each subscore 0..100, weighted sum):
 *   - motion  (weight 45): ramps from MOTION_MIN_AVG_ENERGY up to ~4x that
 *   - texture (weight 35): ramps from TEXTURE_MIN_VARIANCE up to ~3x that
 *   - exposure(weight 20): full marks inside the brightness band, decays outside
 *
 * Hard-failure reasons are reported even when the weighted score passes.
 */
export function evaluateLiveness(frames: number[][]): LivenessResult {
  const reasons: string[] = [];

  if (frames.length < LIVENESS_MIN_FRAMES) {
    return {
      score: 0,
      passed: false,
      framesAnalyzed: frames.length,
      avgMotionEnergy: 0,
      avgTextureVariance: 0,
      avgBrightness: 0,
      reasons: [`not enough frames captured (${frames.length}/${LIVENESS_MIN_FRAMES})`],
    };
  }

  // Reject inconsistent grids (camera resize mid-capture).
  const size = frames[0].length;
  if (frames.some((f) => f.length !== size)) {
    reasons.push("inconsistent frame sizes");
    return {
      score: 0,
      passed: false,
      framesAnalyzed: frames.length,
      avgMotionEnergy: 0,
      avgTextureVariance: 0,
      avgBrightness: 0,
      reasons,
    };
  }

  const energies: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    energies.push(frameEnergy(frames[i - 1], frames[i]));
  }
  const variances = frames.map(frameVariance);
  const brightnesses = frames.map(mean);

  const avgEnergy = mean(energies);
  const avgVariance = mean(variances);
  const avgBrightness = mean(brightnesses);

  // Motion subscore: 0 at MOTION_MIN_AVG_ENERGY → 100 at 4× that.
  const motionScore = clamp(((avgEnergy - MOTION_MIN_AVG_ENERGY) / (MOTION_MIN_AVG_ENERGY * 3)) * 100, 0, 100);

  // Texture subscore: 0 at TEXTURE_MIN_VARIANCE → 100 at 3× that.
  const textureScore = clamp(((avgVariance - TEXTURE_MIN_VARIANCE) / (TEXTURE_MIN_VARIANCE * 2)) * 100, 0, 100);

  // Exposure subscore: full marks inside the band, linear decay outside.
  let exposureScore = 100;
  if (avgBrightness < BRIGHTNESS_MIN) exposureScore = clamp((avgBrightness / BRIGHTNESS_MIN) * 100, 0, 100);
  else if (avgBrightness > BRIGHTNESS_MAX) exposureScore = clamp(100 - ((avgBrightness - BRIGHTNESS_MAX) / 25) * 100, 0, 100);

  const score = Math.round(motionScore * 0.45 + textureScore * 0.35 + exposureScore * 0.2);

  if (avgEnergy < MOTION_MIN_AVG_ENERGY) reasons.push("insufficient motion — hold the device naturally or blink");
  if (avgVariance < TEXTURE_MIN_VARIANCE) reasons.push("low facial texture — avoid screens or printed photos");
  if (avgBrightness < BRIGHTNESS_MIN || avgBrightness > BRIGHTNESS_MAX) reasons.push("poor lighting conditions");

  return {
    score,
    passed: score >= LIVENESS_PASS_SCORE && reasons.length === 0,
    framesAnalyzed: frames.length,
    avgMotionEnergy: avgEnergy,
    avgTextureVariance: avgVariance,
    avgBrightness,
    reasons,
  };
}
