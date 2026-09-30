/**
 * Per-user AI budget.
 * ─────────────────────
 * `rateLimited()` in `_shared/security.ts` is keyed on IP. That is the right
 * default for cheap endpoints, but it is the wrong control for the AI surfaces:
 *
 *   • Every call to `ai-ask` is a metered LLM call. The IP limiter lets one user
 *     on a rotating IP range spend the budget of many.
 *   • The reverse also breaks: an office behind a single NAT egress shares one
 *     bucket, so one user's chat traffic can lock out everyone else in the
 *     building. That is a real, user-visible failure, not a theoretical one.
 *
 * This module adds a second, independent limiter keyed on the authenticated
 * user id, so cost is bounded per account and a shared egress is no longer a
 * shared allowance. It is deliberately additive: the IP limiter still runs, so
 * a flood from one host is cut off even if the account is not yet over budget.
 *
 * The counter is in-memory, so it is best-effort across an ephemeral edge
 * runtime — the same caveat as the existing IP limiter. It meaningfully bounds
 * a single warm instance and a sustained run, and is not a substitute for a
 * shared WAF or a durable quota. The `ai_engine_calls` table (populated by
 * `_shared/aiTelemetry.ts`) is the durable record to alert on.
 *
 * Only calls that would actually reach the model are counted. The deterministic
 * engine is free and unbounded by design: refusing a verification because a
 * user asked a lot of questions would trade a security property for a cost
 * one, which is exactly the wrong direction.
 */

export type AiBudgetSurface = "verify-credential" | "ai-verify-credential" | "ai-ask";

interface Budget {
  count: number;
  resetAt: number;
}

export interface AiBudgetResult {
  allowed: boolean;
  /** Calls already spent in this window, including the current one. */
  used: number;
  limit: number;
  /** Seconds until the window resets. Sent to the client as Retry-After. */
  retryAfterSeconds: number;
}

/**
 * Per-surface budgets over a 60s window.
 *
 * These count calls that would actually reach the model. `ai-ask` is tightest:
 * it is the only surface where the holder of a valid session can drive an
 * unbounded number of model calls from a single button. The verification
 * surfaces are looser because each call is anchored to a real credential and a
 * real request, so they are naturally self-limiting.
 *
 * `oid4vp` is deliberately absent. It runs the deterministic engine only and
 * makes no model call, so metering it would throttle verifications for no cost
 * reason. If it is ever given a narrative layer, add it here deliberately.
 */
const BUDGETS: Readonly<Record<AiBudgetSurface, number>> = Object.freeze({
  "ai-ask": 20,
  "verify-credential": 30,
  "ai-verify-credential": 20,
});

const WINDOW_MS = 60_000;

/**
 * Hard ceiling on tracked keys.
 *
 * The map is swept lazily, but a long-lived warm instance that sees many
 * distinct users between sweeps would otherwise retain an entry per user
 * indefinitely. At the cap we drop the oldest window rather than refuse to
 * track anyone — evicting a bucket can only ever grant a *fresh* allowance to
 * one key, and forgetting the oldest (most likely already reset) is the
 * cheapest way to bound memory.
 */
const MAX_TRACKED_KEYS = 10_000;

const buckets = new Map<string, Budget>();
let lastSweepAt = 0;

/** Drop expired buckets. Cheap: at most one full scan per window. */
function sweep(now: number): void {
  if (now - lastSweepAt < WINDOW_MS && buckets.size < MAX_TRACKED_KEYS) return;
  lastSweepAt = now;
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(key);
  }
  // Still oversized after dropping expired windows: shed oldest-first.
  if (buckets.size > MAX_TRACKED_KEYS) {
    const ordered = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    for (let i = 0; i < ordered.length - MAX_TRACKED_KEYS; i++) {
      buckets.delete(ordered[i][0]);
    }
  }
}

/**
 * Charge one AI call against a user's budget.
 *
 * Returns `allowed: false` once the surface budget is spent. A missing or
 * malformed user id is treated as over budget rather than unlimited: the IP
 * limiter is the outer guard, and failing open here would let an unauthenticated
 * caller who somehow got past it spend metered model calls for free.
 */
export function chargeAiBudget(
  userId: string | null | undefined,
  surface: AiBudgetSurface,
  limit?: number,
): AiBudgetResult {
  const max = limit ?? BUDGETS[surface] ?? 20;
  const now = Date.now();

  if (!userId) {
    return { allowed: false, used: 0, limit: max, retryAfterSeconds: Math.ceil(WINDOW_MS / 1000) };
  }

  sweep(now);

  const key = `${surface}:${userId}`;
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, used: 1, limit: max, retryAfterSeconds: Math.ceil(WINDOW_MS / 1000) };
  }

  bucket.count += 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return {
    allowed: bucket.count <= max,
    used: bucket.count,
    limit: max,
    retryAfterSeconds,
  };
}

/** Peek without charging. Used for logging/tests, not for enforcement. */
export function aiBudgetRemaining(
  userId: string | null | undefined,
  surface: AiBudgetSurface,
): { remaining: number; limit: number } {
  const limit = BUDGETS[surface] ?? 20;
  if (!userId) return { remaining: 0, limit };
  const bucket = buckets.get(`${surface}:${userId}`);
  if (!bucket || Date.now() > bucket.resetAt) return { remaining: limit, limit };
  return { remaining: Math.max(0, limit - bucket.count), limit };
}

/** 429 response for an exhausted AI budget. */
export function aiBudgetExceeded(corsHeaders: Record<string, string>, retryAfterSeconds: number): Response {
  return new Response(
    JSON.stringify({ available: false, reason: "rate_limited", error: "Too many AI requests. Please try again shortly." }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(Math.max(1, Math.round(retryAfterSeconds))),
      },
    },
  );
}

/** Test seam: forget everything. */
export function resetAiBudgets(): void {
  buckets.clear();
  lastSweepAt = 0;
}
