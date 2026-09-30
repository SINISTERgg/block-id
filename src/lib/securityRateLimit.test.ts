import { describe, it, expect } from "vitest";
import { rateLimited, clientIp } from "../../supabase/functions/_shared/security.ts";

/** Minimal Request stand-in — `clientIp` only reads headers. */
const req = (headers: Record<string, string>) =>
  new Request("https://example.test", { headers });

describe("clientIp", () => {
  it("prefers the first entry of x-forwarded-for", () => {
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    expect(clientIp(req({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
  });

  it("returns a stable sentinel when no proxy header is present", () => {
    // All unidentified callers share one bucket. That is intentional: absent a
    // proxy header there is nothing better to key on, and lumping them together
    // is the safer direction for a limiter.
    expect(clientIp(req({}))).toBe("unknown");
  });
});

describe("rateLimited", () => {
  it("allows requests up to the limit and blocks past it", () => {
    const ip = `10.0.0.${Date.now() % 250}`;
    for (let i = 0; i < 5; i++) {
      expect(rateLimited(ip, 60_000, 5)).toBe(false);
    }
    expect(rateLimited(ip, 60_000, 5)).toBe(true);
  });

  it("does not block when no identifier is available", () => {
    expect(rateLimited("", 60_000, 1)).toBe(false);
  });

  it("keeps separate buckets per identifier", () => {
    const a = `10.1.1.${Date.now() % 250}`;
    const b = `10.2.2.${Date.now() % 250}`;
    for (let i = 0; i < 5; i++) rateLimited(a, 60_000, 5);
    expect(rateLimited(a, 60_000, 5)).toBe(true);
    expect(rateLimited(b, 60_000, 5)).toBe(false);
  });

  it("gives each scope its own counter for the same identifier", () => {
    // The regression this guards: buckets used to be keyed by address alone, so
    // every route in an edge function shared one counter. The verifier's
    // 3-second /status poll then exhausted the window and the issuer's /offer
    // on the same egress address started returning 429.
    const ip = `10.5.5.${Date.now() % 250}`;
    for (let i = 0; i < 20; i++) rateLimited(ip, 60_000, 15, "oid4vci:credential");
    expect(rateLimited(ip, 60_000, 15, "oid4vci:credential")).toBe(true);
    // A different route on the same address is unaffected.
    expect(rateLimited(ip, 60_000, 30, "oid4vci:offer")).toBe(false);
    expect(rateLimited(ip, 60_000, 30, "oid4vp:status")).toBe(false);
  });

  it("still shares a counter within the same scope", () => {
    const ip = `10.6.6.${Date.now() % 250}`;
    for (let i = 0; i < 3; i++) rateLimited(ip, 60_000, 3, "scoped");
    expect(rateLimited(ip, 60_000, 3, "scoped")).toBe(true);
  });

  it("keeps the default scope compatible with unscoped callers", () => {
    const ip = `10.7.7.${Date.now() % 250}`;
    rateLimited(ip, 60_000, 1);
    // An explicit "default" scope and an omitted scope are the same bucket.
    expect(rateLimited(ip, 60_000, 1, "default")).toBe(true);
  });
});
