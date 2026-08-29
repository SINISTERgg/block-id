import { describe, it, expect } from "vitest";
import {
  BRIGHTNESS_MAX,
  BRIGHTNESS_MIN,
  LIVENESS_MIN_FRAMES,
  LIVENESS_PASS_SCORE,
  MOTION_MIN_AVG_ENERGY,
  TEXTURE_MIN_VARIANCE,
  clamp,
  evaluateLiveness,
  frameEnergy,
  frameVariance,
  mean,
} from "./liveness";

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** A noisy, textured frame (real-camera-like): random-ish values around mid-gray. */
function texturedFrame(seed: number, size = 64): number[] {
  const grid: number[] = [];
  let state = seed;
  for (let i = 0; i < size; i++) {
    // xorshift for deterministic pseudo-noise
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    grid.push(128 + ((state % 120) - 60));
  }
  return grid;
}

/** Shift a textured frame slightly — simulates natural micro-motion. */
function shifted(frame: number[], delta: number): number[] {
  return frame.map((v) => Math.min(255, Math.max(0, v + delta)));
}

/** Flat frame — like a printed photo or dark screen. */
const flatFrame = (value: number, size = 64) => new Array(size).fill(value);

/** A believable live-capture sequence: texture + gentle motion + good light. */
function liveSequence(frames = LIVENESS_MIN_FRAMES + 2): number[][] {
  const base = texturedFrame(42);
  return Array.from({ length: frames }, (_, i) => shifted(base, i % 2 === 0 ? i : -i));
}

// ─── Primitives ──────────────────────────────────────────────────────────────

describe("primitives", () => {
  it("clamp bounds values", () => {
    expect(clamp(-1, 0, 100)).toBe(0);
    expect(clamp(50, 0, 100)).toBe(50);
    expect(clamp(150, 0, 100)).toBe(100);
  });

  it("mean of empty series is 0", () => {
    expect(mean([])).toBe(0);
    expect(mean([2, 4, 6])).toBe(4);
  });

  it("frameVariance is 0 for flat frames", () => {
    expect(frameVariance(flatFrame(128))).toBe(0);
  });

  it("frameVariance is positive and larger for noisier frames", () => {
    const mild = frameVariance(texturedFrame(1));
    const wild = frameVariance(texturedFrame(7));
    expect(mild).toBeGreaterThan(TEXTURE_MIN_VARIANCE / 4);
    expect(wild).toBeGreaterThanOrEqual(mild);
  });

  it("frameEnergy is 0 for identical frames", () => {
    const f = texturedFrame(3);
    expect(frameEnergy(f, [...f])).toBe(0);
  });

  it.each([
    ["empty prev", [], [1, 2]],
    ["length mismatch", [1], [1, 2]],
  ])("frameEnergy returns 0 for %s", (_label, prev, curr) => {
    expect(frameEnergy(prev as number[], curr as number[])).toBe(0);
  });

  it("frameEnergy measures mean absolute difference", () => {
    expect(frameEnergy([10, 20, 30], [12, 18, 33])).toBeCloseTo((2 + 2 + 3) / 3, 10);
  });
});

// ─── evaluateLiveness ────────────────────────────────────────────────────────

describe("evaluateLiveness", () => {
  it("rejects sequences with too few frames", () => {
    const res = evaluateLiveness(liveSequence(LIVENESS_MIN_FRAMES - 1));
    expect(res.passed).toBe(false);
    expect(res.score).toBe(0);
    expect(res.reasons[0]).toMatch(/not enough frames/);
  });

  it("rejects inconsistent frame sizes outright", () => {
    const seq = liveSequence();
    seq[2] = flatFrame(128, 32); // wrong size
    const res = evaluateLiveness(seq);
    expect(res.passed).toBe(false);
    expect(res.score).toBe(0);
    expect(res.reasons).toContain("inconsistent frame sizes");
  });

  it("passes a realistic live capture", () => {
    const res = evaluateLiveness(liveSequence());
    expect(res.framesAnalyzed).toBe(LIVENESS_MIN_FRAMES + 2);
    expect(res.avgMotionEnergy).toBeGreaterThan(MOTION_MIN_AVG_ENERGY);
    expect(res.avgTextureVariance).toBeGreaterThan(TEXTURE_MIN_VARIANCE);
    expect(res.avgBrightness).toBeGreaterThan(BRIGHTNESS_MIN);
    expect(res.avgBrightness).toBeLessThan(BRIGHTNESS_MAX);
    expect(res.reasons).toEqual([]);
    expect(res.score).toBeGreaterThanOrEqual(LIVENESS_PASS_SCORE);
    expect(res.passed).toBe(true);
  });

  it("fails a static replay (identical frames → no motion)", () => {
    const frozen = Array.from({ length: 8 }, () => texturedFrame(99));
    const res = evaluateLiveness(frozen);
    expect(res.avgMotionEnergy).toBeLessThan(MOTION_MIN_AVG_ENERGY);
    expect(res.passed).toBe(false);
    expect(res.reasons.join(" ")).toMatch(/insufficient motion/);
  });

  it("fails a printed photo (flat frames → low texture)", () => {
    const print = Array.from({ length: 8 }, (_, i) => shifted(flatFrame(140), i % 2 ? 2 : -2));
    const res = evaluateLiveness(print);
    expect(res.avgTextureVariance).toBeLessThan(TEXTURE_MIN_VARIANCE);
    expect(res.passed).toBe(false);
    expect(res.reasons.join(" ")).toMatch(/low facial texture/);
  });

  it("fails in darkness", () => {
    const dark = liveSequence().map((f) => f.map((v) => Math.floor(v / 40))); // ~0–6 luma
    const res = evaluateLiveness(dark);
    expect(res.avgBrightness).toBeLessThan(BRIGHTNESS_MIN);
    expect(res.passed).toBe(false);
    expect(res.reasons.join(" ")).toMatch(/poor lighting/);
  });

  it("fails when blown out white", () => {
    const blown = liveSequence().map(() => flatFrame(250));
    const res = evaluateLiveness(blown);
    expect(res.passed).toBe(false);
    expect(res.reasons.length).toBeGreaterThan(0);
  });

  it("is deterministic for identical input", () => {
    const seq = liveSequence();
    expect(evaluateLiveness(seq)).toEqual(evaluateLiveness([...seq]));
  });

  it("never reports passed=true while reasons are non-empty", () => {
    const cases = [
      liveSequence(6),
      Array.from({ length: 8 }, () => texturedFrame(5)),
      liveSequence().map((f) => f.map((v) => v * 0.05)),
      liveSequence().map(() => flatFrame(255)),
    ];
    for (const seq of cases) {
      const res = evaluateLiveness(seq);
      if (res.reasons.length > 0) expect(res.passed).toBe(false);
      else expect(res.score).toBeGreaterThanOrEqual(0);
    }
  });

  it("scores stay within 0..100", () => {
    for (const seq of [liveSequence(), liveSequence().map(() => flatFrame(0)), liveSequence().map(() => flatFrame(255))]) {
      const res = evaluateLiveness(seq.map((f) => [...f]));
      expect(res.score).toBeGreaterThanOrEqual(0);
      expect(res.score).toBeLessThanOrEqual(100);
    }
  });
});
