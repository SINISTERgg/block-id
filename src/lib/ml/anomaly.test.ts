import { describe, it, expect } from "vitest";
import {
  analyzeAnomalies,
  clamp,
  detectBursts,
  detectFailureStreak,
  detectGeoJumps,
  detectLatencySpike,
  detectOffHours,
  haversineKm,
  mean,
  median,
  medianAbsoluteDeviation,
  type AnomalyEvent,
} from "./anomaly";

const BASE = Date.parse("2026-06-15T12:00:00.000Z");

/** Build an event `offsetMs` after BASE with local-hour control for off-hours tests. */
function ev(offsetMs = 0, success = true, extra: Partial<AnomalyEvent> = {}): AnomalyEvent {
  return { timestamp: new Date(BASE + offsetMs).toISOString(), success, ...extra };
}

/** Local-time event helper (TZ-independent off-hours testing). */
function localEv(hour: number, minute = 0): AnomalyEvent {
  const d = new Date(2026, 5, 10 + Math.floor(hour / 24), hour % 24, minute);
  return { timestamp: d.toISOString(), success: true };
}

describe("statistics helpers", () => {
  it("clamp bounds values", () => {
    expect(clamp(-5)).toBe(0);
    expect(clamp(150)).toBe(100);
    expect(clamp(42)).toBe(42);
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("mean averages values", () => {
    expect(mean([2, 4, 6])).toBe(4);
    expect(mean([])).toBe(0);
  });

  it("median handles odd/even lengths", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  it("medianAbsoluteDeviation is robust", () => {
    expect(medianAbsoluteDeviation([100, 100, 100])).toBe(0);
    expect(medianAbsoluteDeviation([90, 100, 110])).toBe(10);
  });
});

describe("haversineKm", () => {
  it("returns ~0 for identical coordinates", () => {
    expect(haversineKm(48.85, 2.35, 48.85, 2.35)).toBeCloseTo(0, 5);
  });

  it("measures known distances (Paris → London ≈ 344 km)", () => {
    const d = haversineKm(48.8566, 2.3522, 51.5074, -0.1278);
    expect(d).toBeGreaterThan(330);
    expect(d).toBeLessThan(360);
  });
});

describe("detectBursts", () => {
  it("ignores traffic within the limit", () => {
    const events = Array.from({ length: 10 }, (_, i) => ev(i * 1000));
    expect(detectBursts(events)).toBeNull();
  });

  it("flags a low-severity burst slightly over the limit", () => {
    const events = Array.from({ length: 12 }, (_, i) => ev(i * 1000));
    const finding = detectBursts(events)!;
    expect(finding.type).toBe("burst");
    expect(finding.severity).toBe("low");
    expect(finding.score).toBeGreaterThan(40);
  });

  it("escalates severity as the rate multiplies", () => {
    const medium = detectBursts(Array.from({ length: 22 }, (_, i) => ev(i * 1000)))!;
    expect(medium.severity).toBe("medium");
    const high = detectBursts(Array.from({ length: 35 }, (_, i) => ev(i * 1000)))!;
    expect(high.severity).toBe("high");
    expect(high.score).toBe(100);
  });

  it("respects the sliding window — spread events are fine", () => {
    // one event every 31 s → never more than 10 inside a 5 min window
    const events = Array.from({ length: 30 }, (_, i) => ev(i * 31_000));
    expect(detectBursts(events)).toBeNull();
  });
});

describe("detectFailureStreak", () => {
  it("requires failures at the tail of the stream", () => {
    const mixed = [ev(0, false), ev(1000, false), ev(2000, false), ev(3000, true)];
    expect(detectFailureStreak(mixed)).toBeNull();
  });

  it("flags short streaks as low severity", () => {
    const finding = detectFailureStreak([ev(0, true), ev(1000, false), ev(2000, false), ev(3000, false)])!;
    expect(finding.type).toBe("failure_streak");
    expect(finding.severity).toBe("low");
  });

  it("escalates with streak length", () => {
    const medium = Array.from({ length: 6 }, (_, i) => ev(i * 1000, false));
    expect(detectFailureStreak(medium)!.severity).toBe("medium");
    const high = Array.from({ length: 9 }, (_, i) => ev(i * 1000, false));
    expect(detectFailureStreak(high)!.severity).toBe("high");
  });
});

describe("detectGeoJumps", () => {
  const PARIS = { latitude: 48.8566, longitude: 2.3522 };
  const NYC = { latitude: 40.7128, longitude: -74.006 };

  it("skips events without coordinates", () => {
    expect(detectGeoJumps([ev(0, true), ev(60_000, true)])).toBeNull();
  });

  it("allows plausible travel", () => {
    const events = [ev(0, true, PARIS), ev(3_600_000, true, { ...PARIS, latitude: 49 })];
    expect(detectGeoJumps(events)).toBeNull();
  });

  it("flags impossible travel between distant points", () => {
    // Paris → NYC in 20 minutes ⇒ ~13,500 km/h
    const events = [ev(0, true, PARIS), ev(20 * 60_000, true, NYC)];
    const finding = detectGeoJumps(events)!;
    expect(finding.type).toBe("geo_jump");
    expect(finding.severity).toBe("high");
    expect(finding.score).toBe(100);
  });

  it("ignores same-instant events to avoid clock-skew noise", () => {
    const sameInstant = [ev(0, true, PARIS), ev(0, true, NYC)];
    expect(detectGeoJumps(sameInstant)).toBeNull();
  });
});

describe("detectOffHours", () => {
  it("needs at least three events", () => {
    expect(detectOffHours([localEv(2), localEv(2)])).toBeNull();
  });

  it("flags when recent activity is mostly nocturnal", () => {
    const events = [localEv(2), localEv(3), localEv(2), localEv(3)];
    const finding = detectOffHours(events)!;
    expect(finding.type).toBe("off_hours");
    expect(finding.severity).toBe("medium"); // 100% in-window
    expect(finding.detail).toContain("00:00 and 05:00");
  });

  it("stays quiet for daytime usage", () => {
    const events = [localEv(9), localEv(14), localEv(11), localEv(16)];
    expect(detectOffHours(events)).toBeNull();
  });

  it("only considers the ten most recent events", () => {
    const oldNight = Array.from({ length: 7 }, () => localEv(2));
    const recentDay = [localEv(9), localEv(10), localEv(11), localEv(14), localEv(13), localEv(12)];
    expect(detectOffHours([...oldNight, ...recentDay])).toBeNull();
  });
});

describe("detectLatencySpike", () => {
  it("needs a minimum baseline sample size", () => {
    const few = [
      { timestamp: new Date(BASE).toISOString(), success: true, latencyMs: 100 },
      { timestamp: new Date(BASE + 1).toISOString(), success: true, latencyMs: 9000 },
    ];
    expect(detectLatencySpike(few)).toBeNull();
  });

  it("tolerates normal jitter", () => {
    const events = [100, 110, 95, 105, 98].map((latencyMs, i) => ({
      ...ev(i * 1000),
      latencyMs,
    }));
    expect(detectLatencySpike(events)).toBeNull();
  });

  it("flags a spike even when historical variance is zero", () => {
    const events = [...Array(5).fill(100), 8000].map((latencyMs, i) => ({
      ...ev(i * 1000),
      latencyMs,
    }));
    const finding = detectLatencySpike(events)!;
    expect(finding.type).toBe("latency_spike");
    expect(finding.detail).toMatch(/8000ms vs typical 100ms/);
  });

  it("only flags upward spikes", () => {
    const events = [...Array(5).fill(5000), 50].map((latencyMs, i) => ({
      ...ev(i * 1000),
      latencyMs,
    }));
    expect(detectLatencySpike(events)).toBeNull();
  });

  it("ignores non-numeric latencies", () => {
    const events = [100, 100, 100, 100, undefined, 9999].map((latencyMs, i) => ({
      ...ev(i * 1000),
      latencyMs,
    })) as AnomalyEvent[];
    const finding = detectLatencySpike(events, { minSamples: 5 });
    expect(finding).not.toBeNull();
  });
});

describe("analyzeAnomalies", () => {
  it("produces a clean report for empty input", () => {
    const report = analyzeAnomalies([]);
    expect(report.isAnomalous).toBe(false);
    expect(report.riskScore).toBe(0);
    expect(report.findings).toHaveLength(0);
    expect(report.stats.count).toBe(0);
    expect(report.stats.medianLatencyMs).toBeNull();
  });

  it("reports healthy streams without findings", () => {
    const report = analyzeAnomalies([ev(0), ev(60_000), ev(120_000)]);
    expect(report.findings).toHaveLength(0);
    expect(report.stats.successRate).toBe(1);
  });

  it("sorts findings by score descending and aggregates risk", () => {
    // burst of 12 rapid calls where the final 3 also fail
    const events = Array.from({ length: 12 }, (_, i) => ev(i * 1000, i < 9));
    const report = analyzeAnomalies(events);

    expect(report.findings.length).toBeGreaterThanOrEqual(2);
    const scores = report.findings.map((f) => f.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);

    const primary = scores[0];
    const boost = scores.slice(1).reduce((acc, s) => acc + s * 0.15, 0);
    expect(report.riskScore).toBe(Math.round(Math.min(100, primary + boost)));
    expect(report.isAnomalous).toBe(true);
  });

  it("computes median latency across the stream", () => {
    const events = [100, 200, 300].map((latencyMs, i) => ({ ...ev(i * 1000), latencyMs }));
    expect(analyzeAnomalies(events).stats.medianLatencyMs).toBe(200);
  });
});
