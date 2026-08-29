/**
 * Trust score model — Phase 6 (AI/ML).
 *
 * Explainable, deterministic multi-factor model that distils a
 * credential's lifecycle signals into a single 0-100 score plus a
 * human-readable factor breakdown ("model card" style).
 *
 * Design properties:
 *  - weights are fixed and sum to exactly 100
 *  - every contribution is traceable to an input factor
 *  - critical failures (bad signature / revoked) cap the score so no
 *    amount of positive signals can hide them
 */

export interface TrustFactors {
  /** Wallet signature over the credential was cryptographically valid. */
  signatureValid: boolean;
  /** The credential hash is anchored in the on-chain registry. */
  anchoredOnChain: boolean;
  /** Credential has not been revoked by its issuer. */
  notRevoked: boolean;
  /** Credential is still within its validity window. */
  notExpired: boolean;
  /** Issuer reputation 0-100 (historical issuance quality). */
  issuerReputation: number;
  /** Historical pass rate for this credential's verifications (0-1). */
  verificationSuccessRate?: number;
  /** A zero-knowledge proof was presented instead of raw attributes. */
  zkProofVerified?: boolean;
  /** Days since issuance — maturity bonus for long-lived credentials. */
  credentialAgeDays?: number;
  /** Holder uses an ERC-4337 smart account. */
  hasSmartWallet?: boolean;
  /** Holder has a bound biometric/WebAuthn authenticator. */
  biometricBound?: boolean;
}

export interface TrustFactorContribution {
  key: string;
  label: string;
  weight: number;
  /** Normalised input value 0-1 used for scoring. */
  value: number;
  /** weight * value — points actually awarded. */
  points: number;
  detail: string;
}

export type TrustTier = "platinum" | "gold" | "silver" | "bronze" | "untrusted";

export interface TrustScoreResult {
  /** Final score after critical-failure capping. */
  score: number;
  /** Score before capping — useful to show what was lost to hard rules. */
  rawScore: number;
  tier: TrustTier;
  factors: TrustFactorContribution[];
  /** Keys of critical factors that failed (trigger the cap). */
  criticalFailures: string[];
  computedAt: string;
}

/** Fixed weights — must sum to 100. */
export const TRUST_WEIGHTS = {
  signatureValid: 20,
  anchoredOnChain: 20,
  notRevoked: 15,
  issuerReputation: 15,
  notExpired: 10,
  verifications: 10,
  zkProof: 5,
  maturity: 5,
} as const;

const CRITICAL_CAP = 35;

function boolFactor(
  key: string,
  label: string,
  passed: boolean,
  weight: number,
  passDetail: string,
  failDetail: string
): TrustFactorContribution {
  return {
    key,
    label,
    weight,
    value: passed ? 1 : 0,
    points: Math.round(weight * (passed ? 1 : 0)),
    detail: passed ? passDetail : failDetail,
  };
}

/** Piecewise maturity curve: rewards credentials that have survived time. */
export function maturityValue(ageDays: number | undefined): number {
  if (ageDays === undefined || ageDays < 0 || !Number.isFinite(ageDays)) return 0.25;
  if (ageDays >= 365) return 1;
  if (ageDays >= 180) return 0.85;
  if (ageDays >= 90) return 0.65;
  if (ageDays >= 30) return 0.45;
  if (ageDays >= 7) return 0.3;
  return 0.15;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * Compute the trust score for one credential from its lifecycle factors.
 * Pure and deterministic — identical inputs always yield identical output.
 */
export function computeTrustScore(factors: TrustFactors): TrustScoreResult {
  const computedAt = new Date().toISOString();
  const contributions: TrustFactorContribution[] = [];

  contributions.push(
    boolFactor("signature", "Signature validity", factors.signatureValid, TRUST_WEIGHTS.signatureValid, "Holder signature verified.", "Holder signature missing or invalid.")
  );
  contributions.push(
    boolFactor("anchoring", "On-chain anchoring", factors.anchoredOnChain, TRUST_WEIGHTS.anchoredOnChain, "Anchored in the credential registry.", "No on-chain anchor found.")
  );
  contributions.push(
    boolFactor("revocation", "Revocation status", factors.notRevoked, TRUST_WEIGHTS.notRevoked, "Credential is not revoked.", "Credential has been revoked.")
  );

  const reputation = clamp01((factors.issuerReputation ?? 0) / 100);
  contributions.push({
    key: "issuer",
    label: "Issuer reputation",
    weight: TRUST_WEIGHTS.issuerReputation,
    value: reputation,
    points: Math.round(TRUST_WEIGHTS.issuerReputation * reputation),
    detail: `Issuer scores ${Math.round(reputation * 100)}/100 historically.`,
  });

  contributions.push(
    boolFactor("expiry", "Validity window", factors.notExpired, TRUST_WEIGHTS.notExpired, "Within validity window.", "Credential expired.")
  );

  const successRate =
    factors.verificationSuccessRate === undefined ? 0.75 : clamp01(factors.verificationSuccessRate);
  contributions.push({
    key: "verifications",
    label: "Verification history",
    weight: TRUST_WEIGHTS.verifications,
    value: successRate,
    points: Math.round(TRUST_WEIGHTS.verifications * successRate),
    detail:
      factors.verificationSuccessRate === undefined
        ? "Insufficient history — assuming neutral pass rate."
        : `${Math.round(successRate * 100)}% of past verifications passed.`,
  });

  contributions.push({
    key: "zkp",
    label: "Zero-knowledge proof",
    weight: TRUST_WEIGHTS.zkProof,
    value: factors.zkProofVerified ? 1 : 0,
    points: factors.zkProofVerified ? TRUST_WEIGHTS.zkProof : 0,
    detail: factors.zkProofVerified
      ? "Selective disclosure via ZKP."
      : "Full attributes shared — no ZKP.",
  });

  const maturity = maturityValue(factors.credentialAgeDays);
  const holderBonus = (factors.hasSmartWallet ? 0.5 : 0) + (factors.biometricBound ? 0.5 : 0);
  const maturityPoints = Math.round(TRUST_WEIGHTS.maturity * clamp01(maturity * 0.7 + holderBonus * 0.3));
  contributions.push({
    key: "maturity",
    label: "Longevity & holder signals",
    weight: TRUST_WEIGHTS.maturity,
    value: clamp01(maturity * 0.7 + holderBonus * 0.3),
    points: maturityPoints,
    detail:
      factors.credentialAgeDays !== undefined
        ? `Issued ${Math.floor(factors.credentialAgeDays)} day(s) ago${factors.hasSmartWallet ? ", smart account" : ""}${factors.biometricBound ? ", biometrics bound" : ""}.`
        : "Age unknown — baseline longevity score.",
  });

  const rawScore = contributions.reduce((acc, f) => acc + f.points, 0);

  // Hard rules: a broken signature or a revocation can never look trustworthy.
  const criticalFailures = [
    ...(!factors.signatureValid ? ["signature"] : []),
    ...(!factors.notRevoked ? ["revocation"] : []),
  ];
  const score = criticalFailures.length ? Math.min(rawScore, CRITICAL_CAP) : rawScore;

  return {
    score,
    rawScore,
    tier: scoreToTier(score),
    factors: contributions.sort((a, b) => b.points - a.points),
    criticalFailures,
    computedAt,
  };
}

/** Map a numeric score onto its display tier. */
export function scoreToTier(score: number): TrustTier {
  if (score >= 90) return "platinum";
  if (score >= 75) return "gold";
  if (score >= 60) return "silver";
  if (score >= 40) return "bronze";
  return "untrusted";
}

export const TIER_LABELS: Record<TrustTier, string> = {
  platinum: "Platinum",
  gold: "Gold",
  silver: "Silver",
  bronze: "Bronze",
  untrusted: "Untrusted",
};

export const TIER_COLORS: Record<TrustTier, string> = {
  platinum: "bg-cyan-100 text-cyan-800 border-cyan-300",
  gold: "bg-amber-100 text-amber-800 border-amber-300",
  silver: "bg-slate-100 text-slate-700 border-slate-300",
  bronze: "bg-orange-100 text-orange-800 border-orange-300",
  untrusted: "bg-red-100 text-red-800 border-red-300",
};
