import { describe, it, expect } from "vitest";
import {
  computeTrustScore,
  maturityValue,
  scoreToTier,
  TIER_LABELS,
  TRUST_WEIGHTS,
  type TrustFactors,
} from "./trustScore";

const perfect: TrustFactors = {
  signatureValid: true,
  anchoredOnChain: true,
  notRevoked: true,
  notExpired: true,
  issuerReputation: 100,
  verificationSuccessRate: 1,
  zkProofVerified: true,
  credentialAgeDays: 400,
  hasSmartWallet: true,
  biometricBound: true,
};

describe("TRUST_WEIGHTS", () => {
  it("sums to exactly 100", () => {
    const total = Object.values(TRUST_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });
});

describe("maturityValue", () => {
  it.each([
    [undefined, 0.25],
    [-5, 0.25],
    [NaN, 0.25],
    [0, 0.15],
    [3, 0.15],
    [7, 0.3],
    [29, 0.3],
    [30, 0.45],
    [89, 0.45],
    [90, 0.65],
    [179, 0.65],
    [180, 0.85],
    [364, 0.85],
    [365, 1],
    [1000, 1],
  ])("maps %s days → %s", (days, expected) => {
    expect(maturityValue(days as number | undefined)).toBe(expected);
  });
});

describe("computeTrustScore", () => {
  it("awards a perfect score with platinum tier", () => {
    const res = computeTrustScore(perfect);
    expect(res.rawScore).toBe(100);
    expect(res.score).toBe(100);
    expect(res.tier).toBe("platinum");
    expect(res.criticalFailures).toEqual([]);
    expect(res.computedAt).toBeTruthy();
  });

  it("is deterministic for identical inputs", () => {
    const a = computeTrustScore(perfect);
    const b = computeTrustScore(perfect);
    expect({ ...a, computedAt: "" }).toEqual({ ...b, computedAt: "" });
  });

  it("defaults missing verification history to a neutral pass rate", () => {
    const { factors, rawScore } = computeTrustScore({
      ...perfect,
      verificationSuccessRate: undefined,
    });
    const verifications = factors.find((f) => f.key === "verifications")!;
    expect(verifications.value).toBeCloseTo(0.75);
    expect(verifications.points).toBe(Math.round(TRUST_WEIGHTS.verifications * 0.75));
    expect(verifications.detail).toMatch(/Insufficient history/);
    expect(rawScore).toBeLessThan(100);
  });

  it("scales issuer reputation proportionally", () => {
    const mid = computeTrustScore({ ...perfect, issuerReputation: 50 });
    const issuer = mid.factors.find((f) => f.key === "issuer")!;
    expect(issuer.points).toBe(Math.round(TRUST_WEIGHTS.issuerReputation / 2));
    expect(mid.score).toBe(100 - (TRUST_WEIGHTS.issuerReputation - issuer.points));
    expect(mid.score).toBe(mid.rawScore);
  });

  it("rewards zk proofs and holder signals", () => {
    const noZkp = computeTrustScore({ ...perfect, zkProofVerified: false });
    expect(noZkp.rawScore).toBe(100 - TRUST_WEIGHTS.zkProof);

    const plainHolder = computeTrustScore({
      ...perfect,
      hasSmartWallet: false,
      biometricBound: false,
    });
    // maturity drops from full bonus to the age-only component
    expect(plainHostless(plainHolder)).toBe(true);
  });

  it.each([
    ["signatureValid", "signature", TRUST_WEIGHTS.signatureValid],
    ["anchoredOnChain", "anchoring", TRUST_WEIGHTS.anchoredOnChain],
    ["notExpired", "expiry", TRUST_WEIGHTS.notExpired],
  ] as const)("loses exactly %s points when %o fails", (factor, key, weight) => {
    const res = computeTrustScore({ ...perfect, [factor]: false });
    expect(res.rawScore).toBe(100 - weight);
    const contribution = res.factors.find((f) => f.key === key)!;
    expect(contribution.points).toBe(0);
  });

  it("caps the score when the signature is invalid", () => {
    const res = computeTrustScore({ ...perfect, signatureValid: false });
    expect(res.criticalFailures).toContain("signature");
    expect(res.rawScore).toBeGreaterThan(res.score);
    expect(res.score).toBe(35);
    expect(res.tier).toBe("untrusted");
  });

  it("caps the score when revoked — even for a platinum credential", () => {
    const res = computeTrustScore({ ...perfect, notRevoked: false });
    expect(res.criticalFailures).toEqual(["revocation"]);
    expect(res.score).toBe(35);
  });

  it("lists every critical failure together", () => {
    const res = computeTrustScore({ ...perfect, signatureValid: false, notRevoked: false });
    expect(res.criticalFailures.sort()).toEqual(["revocation", "signature"]);
    expect(res.score).toBe(35);
  });

  it("sorts contributions by awarded points descending", () => {
    const weak = computeTrustScore({
      ...perfect,
      issuerReputation: 10,
      verificationSuccessRate: 0,
      zkProofVerified: false,
    });
    const points = weak.factors.map((f) => f.points);
    expect([...points].sort((a, b) => b - a)).toEqual(points);
  });
});

function plainHostless(res: ReturnType<typeof computeTrustScore>): boolean {
  const maturity = res.factors.find((f) => f.key === "maturity")!;
  return maturity.value < 1 && maturity.points >= 0;
}

describe("scoreToTier", () => {
  it.each([
    [100, "platinum"],
    [90, "platinum"],
    [89, "gold"],
    [75, "gold"],
    [74, "silver"],
    [60, "silver"],
    [59, "bronze"],
    [40, "bronze"],
    [39, "untrusted"],
    [0, "untrusted"],
  ] as const)("tier(%s) → %s", (score, tier) => {
    expect(scoreToTier(score)).toBe(tier);
  });

  it("labels every tier", () => {
    for (const tier of Object.values(TIER_LABELS)) expect(typeof tier).toBe("string");
    expect(Object.keys(TIER_LABELS)).toHaveLength(5);
  });
});
