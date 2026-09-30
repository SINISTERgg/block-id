import { describe, it, expect } from "vitest";
import {
  EXPIRY_PRESETS,
  NEVER_EXPIRES,
  addMonthsClamped,
  daysUntil,
  describeExpiry,
  resolveExpiry,
  toLocalInputValue,
} from "./expiry";

const local = (y: number, m: number, d: number, h = 12, min = 0) =>
  new Date(y, m - 1, d, h, min, 0, 0);

describe("toLocalInputValue", () => {
  it("emits the YYYY-MM-DDTHH:mm shape a datetime-local input requires", () => {
    expect(toLocalInputValue(local(2026, 9, 29, 19, 5))).toBe("2026-09-29T19:05");
  });

  it("zero-pads single-digit months, days, hours and minutes", () => {
    expect(toLocalInputValue(local(2027, 1, 2, 3, 4))).toBe("2027-01-02T03:04");
  });
});

describe("addMonthsClamped", () => {
  it("adds whole months when the target month is long enough", () => {
    expect(addMonthsClamped(local(2026, 1, 15), 6).getMonth()).toBe(6); // July
    expect(addMonthsClamped(local(2026, 1, 15), 6).getDate()).toBe(15);
  });

  it("clamps to the last valid day instead of rolling into the next month", () => {
    // Jan 31 + 1 month must land in February, not March 2-3.
    const feb = addMonthsClamped(local(2026, 1, 31), 1);
    expect(feb.getMonth()).toBe(1);
    expect(feb.getDate()).toBe(28);

    // May 31 + 6 months must land in November (30 days), not December 1.
    const nov = addMonthsClamped(local(2026, 5, 31), 6);
    expect(nov.getMonth()).toBe(10);
    expect(nov.getDate()).toBe(30);
  });

  it("handles the 31st into a 30-day month across the year boundary", () => {
    const res = addMonthsClamped(local(2026, 8, 31), 6); // Aug 31 + 6M
    expect(res.getFullYear()).toBe(2027);
    expect(res.getMonth()).toBe(1); // February, not March
    expect(res.getDate()).toBe(28);
  });

  it("resolves the leap-year clamp to Feb 29", () => {
    const res = addMonthsClamped(local(2028, 1, 31), 1); // 2028 is a leap year
    expect(res.getMonth()).toBe(1);
    expect(res.getDate()).toBe(29);
  });

  it("crosses a year boundary correctly", () => {
    const res = addMonthsClamped(local(2026, 11, 10), 3);
    expect(res.getFullYear()).toBe(2027);
    expect(res.getMonth()).toBe(1);
  });

  it("does not mutate the input date", () => {
    const base = local(2026, 1, 31);
    addMonthsClamped(base, 6);
    expect(base.getMonth()).toBe(0);
    expect(base.getDate()).toBe(31);
  });
});

describe("resolveExpiry", () => {
  it("resolves every advertised preset to a date strictly in the future", () => {
    const now = local(2026, 8, 31, 12); // worst case for month-end clamping
    for (const preset of EXPIRY_PRESETS) {
      const resolved = resolveExpiry(preset, now);
      expect(resolved).not.toBeNull();
      expect(resolved!.getTime()).toBeGreaterThan(now.getTime());
    }
  });

  it("resolves NEVER_EXPIRES to null so the field clears", () => {
    expect(resolveExpiry(NEVER_EXPIRES, local(2026, 9, 29))).toBeNull();
  });

  it("adds whole years for the year presets", () => {
    const now = local(2026, 2, 29, 12); // Feb 29 in a leap year
    const resolved = resolveExpiry({ id: "1y", label: "+1Y", title: "", years: 1 }, now);
    expect(resolved!.getFullYear()).toBe(2027);
  });

  it("clamps Feb 29 + 1 year onto a non-existent Feb 29 rather than overflowing", () => {
    const now = local(2028, 2, 29, 12); // 2028 is a leap year
    const resolved = resolveExpiry({ id: "1y", label: "+1Y", title: "", years: 1 }, now);
    expect(resolved!.getFullYear()).toBe(2029);
    expect(resolved!.getMonth()).toBe(1); // still February
  });

  it("returns null for an empty selection", () => {
    expect(resolveExpiry({ id: "x", label: "x", title: "" } as never, local(2026, 9, 29))).toBeNull();
  });
});

describe("describeExpiry", () => {
  it("returns null for an empty or unparseable value", () => {
    expect(describeExpiry("")).toBeNull();
    expect(describeExpiry("not-a-date")).toBeNull();
  });

  it("renders a readable date for a valid value", () => {
    expect(describeExpiry("2027-09-29T19:05")).toMatch(/2027/);
  });
});

describe("daysUntil", () => {
  it("returns null when no date is set", () => {
    expect(daysUntil("", local(2026, 9, 29))).toBeNull();
    expect(daysUntil("garbage", local(2026, 9, 29))).toBeNull();
  });

  it("counts whole days forward", () => {
    expect(daysUntil("2026-10-29T12:00", local(2026, 9, 29, 12))).toBe(30);
  });

  it("never returns a negative count for a past date", () => {
    expect(daysUntil("2020-01-01T12:00", local(2026, 9, 29, 12))).toBe(0);
  });
});
