import { describe, it, expect, beforeEach } from "vitest";
import {
  chargeAiBudget,
  aiBudgetRemaining,
  aiBudgetExceeded,
  resetAiBudgets,
} from "../../../supabase/functions/_shared/aiBudget";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

describe("chargeAiBudget", () => {
  beforeEach(() => resetAiBudgets());

  it("allows calls up to the surface limit", () => {
    for (let i = 0; i < 20; i++) {
      expect(chargeAiBudget(USER_A, "ai-ask").allowed).toBe(true);
    }
    expect(chargeAiBudget(USER_A, "ai-ask").allowed).toBe(false);
  });

  it("reports how much of the budget was spent", () => {
    chargeAiBudget(USER_A, "ai-ask");
    chargeAiBudget(USER_A, "ai-ask");
    const third = chargeAiBudget(USER_A, "ai-ask");
    expect(third.used).toBe(3);
    expect(third.limit).toBe(20);
  });

  it("keeps budgets separate per user", () => {
    for (let i = 0; i < 20; i++) chargeAiBudget(USER_A, "ai-ask");
    expect(chargeAiBudget(USER_A, "ai-ask").allowed).toBe(false);
    // User B must be unaffected by user A exhausting their budget. This is the
    // whole point: the IP limiter alone would have throttled them together.
    expect(chargeAiBudget(USER_B, "ai-ask").allowed).toBe(true);
  });

  it("keeps budgets separate per surface", () => {
    for (let i = 0; i < 20; i++) chargeAiBudget(USER_A, "ai-verify-credential");
    expect(chargeAiBudget(USER_A, "ai-verify-credential").allowed).toBe(false);
    expect(chargeAiBudget(USER_A, "verify-credential").allowed).toBe(true);
    expect(chargeAiBudget(USER_A, "ai-ask").allowed).toBe(true);
  });

  it("gives ai-ask a tighter budget than the verification surfaces", () => {
    for (let i = 0; i < 20; i++) chargeAiBudget(USER_A, "ai-ask");
    expect(chargeAiBudget(USER_A, "ai-ask").allowed).toBe(false);
    // verify-credential allows 30, so the same user still gets narratives on
    // real verifications after their chat budget is gone.
    expect(chargeAiBudget(USER_A, "verify-credential").allowed).toBe(true);
  });

  it("treats a missing user id as over budget rather than unlimited", () => {
    // Failing open here would let an unauthenticated caller that got past the
    // IP limiter spend metered model calls for free.
    expect(chargeAiBudget(null, "ai-ask").allowed).toBe(false);
    expect(chargeAiBudget(undefined, "ai-ask").allowed).toBe(false);
    expect(chargeAiBudget("", "ai-ask").allowed).toBe(false);
  });

  it("reports a positive retry window", () => {
    const result = chargeAiBudget(USER_A, "ai-ask");
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("counts a blocked call too, so a flood cannot reset the window", () => {
    for (let i = 0; i < 100; i++) chargeAiBudget(USER_A, "ai-ask");
    expect(chargeAiBudget(USER_A, "ai-ask").allowed).toBe(false);
  });

  it("honours an explicit override", () => {
    expect(chargeAiBudget(USER_A, "ai-ask", 2).used).toBe(1);
    chargeAiBudget(USER_A, "ai-ask", 2);
    expect(chargeAiBudget(USER_A, "ai-ask", 2).allowed).toBe(false);
  });
});

describe("aiBudgetRemaining", () => {
  beforeEach(() => resetAiBudgets());

  it("reports the full budget before any spend", () => {
    expect(aiBudgetRemaining(USER_A, "ai-ask")).toEqual({ remaining: 20, limit: 20 });
  });

  it("does not charge the budget", () => {
    chargeAiBudget(USER_A, "ai-ask");
    chargeAiBudget(USER_A, "ai-ask");
    expect(aiBudgetRemaining(USER_A, "ai-ask").remaining).toBe(18);
    expect(aiBudgetRemaining(USER_A, "ai-ask").remaining).toBe(18);
  });

  it("never reports a negative remainder", () => {
    for (let i = 0; i < 30; i++) chargeAiBudget(USER_A, "ai-ask");
    expect(aiBudgetRemaining(USER_A, "ai-ask").remaining).toBe(0);
  });

  it("reports nothing available without a user", () => {
    expect(aiBudgetRemaining(null, "ai-ask").remaining).toBe(0);
  });
});

describe("aiBudgetExceeded", () => {
  it("returns 429 with a retry hint and a machine-readable reason", async () => {
    const res = aiBudgetExceeded({ "Access-Control-Allow-Origin": "*" }, 42);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");

    const body = await res.json();
    // `available: false` keeps the client's existing degraded path working
    // without it having to special-case a 429.
    expect(body.available).toBe(false);
    expect(body.reason).toBe("rate_limited");
  });

  it("always emits a positive Retry-After", () => {
    expect(aiBudgetExceeded({}, 0).headers.get("Retry-After")).toBe("1");
    expect(aiBudgetExceeded({}, -5).headers.get("Retry-After")).toBe("1");
  });
});
