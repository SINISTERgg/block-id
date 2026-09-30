/**
 * Trust score — client-side view of the canonical engine.
 * ─────────────────────────────────────────────────────
 * This module no longer contains a second scoring model.
 *
 * It used to define its own eight weights, its own tier bands and its own
 * 35-point critical cap, entirely separate from the eight weights in
 * `verify-credential/ai-engine.ts`. A verifier was therefore shown two
 * different scores for the same credential depending on which panel they
 * looked at, and the two disagreed about what "medium risk" even meant.
 *
 * Now there is exactly one model — `supabase/functions/_shared/credentialEngine.ts`
 * — and this file is a translation layer. It keeps the `TrustFactors` /
 * `TrustScoreResult` shape that TrustScoreRadar, TrustScoreCard, the policy
 * engine and the holder wallet all consume, and derives it from the same
 * weights and caps the server uses.
 *
 * Where a server analysis is available, prefer it: `analysisToTrustScore`
 * converts a persisted `ai_analysis` into this shape with no recomputation, so
 * the radar and the AI panel can never drift apart.
 */

import {
  DIMENSION_WEIGHTS,
  TIER_BANDS,
  TIER_LABELS,
  analyzeCredential,
  applyHardCaps,
  computeConfidence,
  deriveHardCaps,
  isCredentialAcceptable,
  riskLevelFor,
  scoreToTier,
  unverifiedChecks,
  DIMENSION_KEYS,
  type AIAnalysisResult,
  type CredentialSignals,
  type ConfidenceFactor,
  type DimensionKey,
  type DimensionScore,
  type HardCap,
  type LlmNarrative,
  type RiskLevel,
  type TrustTier,
} from "./credentialEngine";

export { TIER_LABELS, TIER_COLORS, scoreToTier } from "./credentialEngine";
export type { TrustTier, RiskLevel, DimensionScore, ConfidenceFactor, HardCap, LlmNarrative, AIAnalysisResult };

/**
 * The canonical weights, re-exported under the historical name.
 * They now sum to 100 across the engine's eight dimensions.
 */
export const TRUST_WEIGHTS: Readonly<Record<DimensionKey, number>> = DIMENSION_WEIGHTS;

/**
 * Inputs accepted by `computeTrustScore`.
 *
 * Deliberately permissive: many call sites only know some of these, and every
 * omitted value becomes an `unknown` signal that lowers confidence rather than
 * silently scoring as a pass.
 */
export interface TrustFactors {
  /** Wallet signature over the credential was cryptographically valid. */
  signatureValid?: boolean;
  /** The credential hash is anchored in the on-chain registry. */
  anchoredOnChain?: boolean;
  /** Credential has not been revoked by its issuer. */
  notRevoked?: boolean;
  /** Credential is still within its validity window. */
  notExpired?: boolean;
  /** Issuer reputation 0-100. */
  issuerReputation?: number | null;
  /** Historical pass rate for this issuer's verifications (0-1). */
  verificationSuccessRate?: number | null;
  /** A zero-knowledge proof was presented instead of raw attributes. */
  zkProofVerified?: boolean | null;
  /** Days since issuance. */
  credentialAgeDays?: number | null;
  /** Holder uses an ERC-4337 smart account. */
  hasSmartWallet?: boolean | null;
  /** Holder has a bound biometric/WebAuthn authenticator. */
  biometricBound?: boolean | null;
  /** True when a stored digest was available to compare against. */
  hashChecked?: boolean;
  /** Result of the hash comparison. Supplying this implies `hashChecked`. */
  hashValid?: boolean;
  /** True when the chain was successfully interrogated. */
  onChainChecked?: boolean;
  /** The credential body, when the caller has it. */
  vc?: Record<string, unknown>;
  /** ISO expiry, preferred over `notExpired` when both are present. */
  expiresAt?: string | null;
  /** ISO issuance, preferred over `credentialAgeDays` when both are present. */
  issuedAt?: string | null;
  /** DB status string. Defaults to "active". */
  dbStatus?: string;
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

export interface TrustScoreResult {
  /** Final score after hard caps. */
  score: number;
  /** Score before caps — shows what the positive signals would have produced. */
  rawScore: number;
  tier: TrustTier;
  factors: TrustFactorContribution[];
  /** Hard caps that were applied. Empty when the credential is clean. */
  hardCaps: HardCap[];
  /** 0-100 evidence coverage. */
  confidence: number;
  confidenceFactors: ConfidenceFactor[];
  riskLevel: RiskLevel;
  /** Dimension statuses, for components that render the canonical breakdown. */
  dimensions: DimensionScore[];
  /** Keys of critical factors that failed. */
  criticalFailures: string[];
  computedAt: string;
}

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  hashIntegrity: "Hash integrity",
  blockchainAnchor: "On-chain anchoring",
  revocationStatus: "Revocation status",
  cryptoProof: "Cryptographic proof",
  issuerTrust: "Issuer reputation",
  expiration: "Validity window",
  dataQuality: "Data conformance",
  temporalConsist: "Issuance timeline",
};

/** Critical dimension keys, in the order they are reported. */
const CRITICAL_KEYS: DimensionKey[] = ["hashIntegrity", "revocationStatus"];

/**
 * Map the caller's partial signals onto the engine's full input.
 *
 * The important behaviour: anything the caller did not tell us becomes an
 * unknown, not a default that scores well. In particular, hash integrity is
 * only reported as verified when the caller actually supplied a result — the
 * legacy `TrustFactors` shape has no hash field, so assuming `true` here is
 * exactly how a tampered credential could render as clean.
 */
export function toCredentialSignals(factors: TrustFactors): CredentialSignals {
  const vc = factors.vc ?? {};
  const hashChecked = factors.hashChecked ?? factors.hashValid !== undefined;
  const onChainChecked = factors.onChainChecked ?? factors.anchoredOnChain !== undefined;
  const notRevoked = factors.notRevoked ?? true;
  const signatureSupplied = factors.signatureValid !== undefined;

  return {
    vc,
    hashChecked,
    hashValid: hashChecked ? (factors.hashValid ?? false) : false,
    dbStatus: factors.dbStatus ?? (notRevoked ? "active" : "revoked"),
    blockchainVerified: factors.anchoredOnChain ?? false,
    onChainRevoked: !notRevoked,
    blockchainAnchor: factors.anchoredOnChain ? "present" : null,
    onChainChecked,
    walletSigned: signatureSupplied,
    // An explicit `false` is a real negative finding; anything else is
    // "present but not verified in this pass", which is an unknown.
    signatureVerified: signatureSupplied ? factors.signatureValid! : null,
    signerAddress: null,
    issuedAt: factors.issuedAt ?? null,
    expiresAt: factors.expiresAt ?? null,
    notExpired: factors.expiresAt ? null : (factors.notExpired ?? null),
    credentialHash: "",
    issuerReputation: factors.issuerReputation ?? null,
    verificationSuccessRate: factors.verificationSuccessRate ?? null,
    credentialAgeDays: factors.credentialAgeDays ?? null,
    zkProofVerified: factors.zkProofVerified ?? null,
    schemaKnown: null,
  };
}

/**
 * Compute the trust score. Pure and deterministic.
 *
 * Thin wrapper over the canonical engine — identical weights, identical caps,
 * identical tier bands. Identical inputs always yield identical output.
 */
export function computeTrustScore(factors: TrustFactors): TrustScoreResult {
  const analysis = analyzeCredential(toCredentialSignals(factors));
  return analysisToTrustScore(analysis);
}

/** Convert a canonical analysis into the shape the trust components render. */
export function analysisToTrustScore(analysis: AIAnalysisResult): TrustScoreResult {
  const contributions: TrustFactorContribution[] = analysis.dimensions.map((d) => ({
    key: d.key,
    label: DIMENSION_LABELS[d.key] ?? d.name,
    weight: d.weight,
    value: d.score / 100,
    points: Math.round((d.score * d.weight) / 100),
    detail: d.detail,
  }));

  const criticalFailures = CRITICAL_KEYS.filter((key) =>
    analysis.dimensions.some((d) => d.key === key && d.status === "fail"),
  ).map((key) => key);

  return {
    score: analysis.score,
    rawScore: analysis.raw_score,
    tier: analysis.tier,
    factors: contributions.sort((a, b) => b.points - a.points),
    hardCaps: analysis.hard_caps_applied,
    confidence: analysis.confidence,
    confidenceFactors: analysis.confidence_factors,
    riskLevel: analysis.risk_level,
    dimensions: analysis.dimensions,
    criticalFailures,
    computedAt: analysis.analyzed_at,
  };
}

export {
  TIER_BANDS,
  DIMENSION_WEIGHTS,
  DIMENSION_KEYS,
  riskLevelFor,
  analyzeCredential,
  deriveHardCaps,
  applyHardCaps,
  computeConfidence,
  unverifiedChecks,
  isCredentialAcceptable,
  type CredentialSignals,
  type DimensionKey,
};
