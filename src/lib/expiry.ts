/**
 * Expiration-date presets for credential issuance.
 *
 * Kept out of the component so the month arithmetic can be unit-tested — the
 * naive `setMonth(getMonth() + n)` form silently rolls over whenever the target
 * month is shorter than today (Aug 31 + 6M lands in March, not February).
 */

export interface ExpiryPreset {
  id: string;
  label: string;
  /** Longer human label used in tooltips and the resolved-date summary. */
  title: string;
  months?: number;
  years?: number;
}

export const EXPIRY_PRESETS: ExpiryPreset[] = [
  { id: "6m", label: "+6M", title: "6 months from now", months: 6 },
  { id: "1y", label: "+1Y", title: "1 year from now", years: 1 },
  { id: "2y", label: "+2Y", title: "2 years from now", years: 2 },
  { id: "4y", label: "+4Y", title: "4 years from now", years: 4 },
];

/** Sentinel for the "Never expires" option — clears the field entirely. */
export const NEVER_EXPIRES = "never" as const;

export type ExpirySelection = ExpiryPreset | typeof NEVER_EXPIRES;

const pad = (n: number) => String(n).padStart(2, "0");

/** Format a Date as the `YYYY-MM-DDTHH:mm` string a `datetime-local` input wants. */
export function toLocalInputValue(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** Number of days in the given month (0-indexed month, any year). */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Add whole months, clamping the day to the last valid day of the target month
 * instead of overflowing into the following one.
 */
export function addMonthsClamped(base: Date, months: number): Date {
  const result = new Date(base.getTime());
  const targetMonthIndex = result.getMonth() + months;

  // Re-anchor the day to the 1st first, so a long day-of-month can't overflow
  // the month while we normalise the year.
  const dayOfMonth = result.getDate();
  result.setDate(1);
  result.setMonth(targetMonthIndex);

  const lastDay = daysInMonth(result.getFullYear(), result.getMonth());
  result.setDate(Math.min(dayOfMonth, lastDay));
  return result;
}

/**
 * Resolve a preset into an absolute date.
 * `NEVER_EXPIRES` and unknown selections return null (clear the field).
 *
 * Years are routed through the same month arithmetic rather than `setFullYear`,
 * because Feb 29 + 1 year would otherwise roll forward into March.
 */
export function resolveExpiry(selection: ExpirySelection, now: Date = new Date()): Date | null {
  if (selection === NEVER_EXPIRES) return null;
  if (selection.months !== undefined) return addMonthsClamped(now, selection.months);
  if (selection.years !== undefined) return addMonthsClamped(now, selection.years * 12);
  return null;
}

/** Human-readable rendering of a `datetime-local` value, or null when empty. */
export function describeExpiry(localValue: string): string | null {
  if (!localValue) return null;
  const parsed = new Date(localValue);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Whole days between now and the given `datetime-local` value; null when unset. */
export function daysUntil(localValue: string, now: Date = new Date()): number | null {
  if (!localValue) return null;
  const parsed = new Date(localValue);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.max(0, Math.round((parsed.getTime() - now.getTime()) / 86_400_000));
}
