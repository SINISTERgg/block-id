/**
 * Verification Policy Engine — declarative acceptance rules for a verifier.
 *
 * A policy is a pure data document (stored as JSONB in `verification_policies`)
 * that a verifier composes to decide whether a presented credential meets their
 * organisation's requirements. Evaluation is deterministic and offline: given
 * the same `VerificationEvidence` it always yields the same decision, and every
 * failed rule carries a human-readable reason for the audit trail.
 */
import type { TrustTier } from "@/lib/ml/trustScore";
import type { CircuitName } from "@/lib/zkp";

/** Circuit requirements — an array means "any one of these circuits satisfies". */
export interface PolicyZkpRequirement {
  circuit: CircuitName;
  /** Optional minimum for circuit-specific thresholds (e.g. minAgeYears). */
  min_threshold?: number;
}

export interface VerificationPolicy {
  required_credential_types: string[];
  require_zkp: PolicyZkpRequirement[];
  require_on_chain_anchor: boolean;
  require_sbt_badge: boolean;
  require_biometric: boolean;
  require_smart_wallet: boolean;
  min_trust_tier: TrustTier;
  max_credential_age_days: number;
}

/** A fully-populated, permissive-by-default policy. */
export const DEFAULT_POLICY: VerificationPolicy = {
  required_credential_types: [],
  require_zkp: [],
  require_on_chain_anchor: false,
  require_sbt_badge: false,
  require_biometric: false,
  require_smart_wallet: false,
  min_trust_tier: "bronze",
  max_credential_age_days: 3650,
};

/** Every signal a policy can be evaluated against. */
export interface VerificationEvidence {
  credentialType?: string | null;
  zkpCircuit?: CircuitName | null;
  zkpProofValid?: boolean | null;
  zkpThreshold?: number | null;
  anchoredOnChain?: boolean | null;
  sbtBadge?: boolean | null;
  biometricVerified?: boolean | null;
  smartWallet?: boolean | null;
  trustTier?: TrustTier | null;
  trustScore?: number | null;
  credentialAgeDays?: number | null;
}

export interface PolicyRuleResult {
  key: string;
  label: string;
  required: boolean;
  passed: boolean;
  detail: string;
}

export interface PolicyEvaluation {
  policyName: string;
  passed: boolean;
  rules: PolicyRuleResult[];
  failedRules: string[];
  /** 0-100 — share of applicable rules that passed. */
  score: number;
}

const TIER_RANK: Record<TrustTier, number> = {
  untrusted: 0,
  bronze: 1,
  silver: 2,
  gold: 3,
  platinum: 4,
};

/** Numeric rank for a trust tier; unknown/absent tiers rank as untrusted. */
export function tierRank(tier: TrustTier | null | undefined): number {
  if (!tier) return 0;
  return TIER_RANK[tier] ?? 0;
}

/** Repair a partially-stored / hand-edited policy document. */
export function normalizePolicy(input: unknown): VerificationPolicy {
  const raw = (input ?? {}) as Partial<VerificationPolicy>;
  return {
    required_credential_types: Array.isArray(raw.required_credential_types)
      ? raw.required_credential_types.filter((t): t is string => typeof t === "string")
      : [],
    require_zkp: Array.isArray(raw.require_zkp)
      ? raw.require_zkp.filter(
          (r): r is PolicyZkpRequirement =>
            !!r && typeof r === "object" && typeof (r as PolicyZkpRequirement).circuit === "string"
        )
      : [],
    require_on_chain_anchor: !!raw.require_on_chain_anchor,
    require_sbt_badge: !!raw.require_sbt_badge,
    require_biometric: !!raw.require_biometric,
    require_smart_wallet: !!raw.require_smart_wallet,
    min_trust_tier: raw.min_trust_tier ?? DEFAULT_POLICY.min_trust_tier,
    max_credential_age_days:
      typeof raw.max_credential_age_days === "number" && raw.max_credential_age_days > 0
        ? raw.max_credential_age_days
        : DEFAULT_POLICY.max_credential_age_days,
  };
}

/**
 * Evaluate a policy against a single credential presentation.
 * Rules that are not required by the policy are reported as `required: false`
 * and excluded from the score, so a minimal policy stays meaningful.
 */
export function evaluatePolicy(
  policy: VerificationPolicy,
  evidence: VerificationEvidence,
  policyName = "Untitled policy"
): PolicyEvaluation {
  const p = normalizePolicy(policy);
  const rules: PolicyRuleResult[] = [];

  // ── Credential type allow-list ──
  if (p.required_credential_types.length > 0) {
    const type = evidence.credentialType ?? "";
    const passed = p.required_credential_types.some((t) => t.toLowerCase() === type.toLowerCase());
    rules.push({
      key: "credential_type",
      label: "Credential type",
      required: true,
      passed,
      detail: passed
        ? `Type "${type}" is accepted.`
        : `Type "${type || "unknown"}" is not in [${p.required_credential_types.join(", ")}].`,
    });
  }

  // ── Zero-knowledge proof ──
  if (p.require_zkp.length > 0) {
    const circuit = evidence.zkpCircuit ?? null;
    const proofValid = !!evidence.zkpProofValid;
    const match = p.require_zkp.find((r) => r.circuit === circuit);
    let passed = proofValid && !!match;
    let detail = passed
      ? `Valid ${circuit} proof presented.`
      : proofValid
        ? `Proof uses ${circuit ?? "an unknown circuit"}; policy accepts [${p.require_zkp
            .map((r) => r.circuit)
            .join(", ")}].`
        : "No valid zero-knowledge proof was presented.";
    if (passed && match?.min_threshold !== undefined) {
      const actual = evidence.zkpThreshold;
      passed = typeof actual === "number" && actual >= match.min_threshold;
      detail = passed
        ? `${circuit} threshold ${actual} ≥ required ${match.min_threshold}.`
        : `${circuit} threshold ${actual ?? "n/a"} < required ${match.min_threshold}.`;
    }
    rules.push({ key: "zkp", label: "Zero-knowledge proof", required: true, passed, detail });
  }

  // ── Simple boolean gates ──
  if (p.require_on_chain_anchor) {
    rules.push({
      key: "on_chain_anchor",
      label: "On-chain anchor",
      required: true,
      passed: !!evidence.anchoredOnChain,
      detail: evidence.anchoredOnChain
        ? "Credential hash is anchored in the registry."
        : "No on-chain anchor found for this credential.",
    });
  }
  if (p.require_sbt_badge) {
    rules.push({
      key: "sbt_badge",
      label: "Soulbound token badge",
      required: true,
      passed: !!evidence.sbtBadge,
      detail: evidence.sbtBadge ? "SBT badge minted and active." : "No active SBT badge.",
    });
  }
  if (p.require_biometric) {
    rules.push({
      key: "biometric",
      label: "Biometric proof anchor",
      required: true,
      passed: !!evidence.biometricVerified,
      detail: evidence.biometricVerified
        ? "Biometric verification is anchored and inside its validity window."
        : "No valid anchored biometric proof.",
    });
  }
  if (p.require_smart_wallet) {
    rules.push({
      key: "smart_wallet",
      label: "ERC-4337 smart wallet",
      required: true,
      passed: !!evidence.smartWallet,
      detail: evidence.smartWallet
        ? "Holder controls an ERC-4337 smart account."
        : "Holder has no smart account registered.",
    });
  }

  // ── Trust tier floor ──
  rules.push({
    key: "trust_tier",
    label: "Minimum trust tier",
    required: true,
    passed: tierRank(evidence.trustTier) >= tierRank(p.min_trust_tier),
    detail:
      tierRank(evidence.trustTier) >= tierRank(p.min_trust_tier)
        ? `Trust tier ${evidence.trustTier ?? "untrusted"} meets the ${p.min_trust_tier} floor.`
        : `Trust tier ${evidence.trustTier ?? "untrusted"} is below the ${p.min_trust_tier} floor.`,
  });

  // ── Credential freshness ──
  if (Number.isFinite(p.max_credential_age_days)) {
    const age = evidence.credentialAgeDays;
    const passed = typeof age === "number" ? age <= p.max_credential_age_days : true;
    rules.push({
      key: "max_age",
      label: "Credential freshness",
      required: true,
      passed,
      detail:
        typeof age === "number"
          ? passed
            ? `Credential is ${Math.floor(age)} day(s) old (limit ${p.max_credential_age_days}).`
            : `Credential is ${Math.floor(age)} day(s) old, exceeding the ${p.max_credential_age_days}-day limit.`
          : "Issuance date unknown — freshness not enforced.",
    });
  }

  const failedRules = rules.filter((r) => r.required && !r.passed).map((r) => r.key);
  const score = rules.length
    ? Math.round((rules.filter((r) => r.passed).length / rules.length) * 100)
    : 100;

  return { policyName, passed: failedRules.length === 0, rules, failedRules, score };
}

/** Count how many rules a policy actually evaluates (for builder UX). */
export function policyRuleCount(policy: VerificationPolicy): number {
  const p = normalizePolicy(policy);
  return (
    (p.required_credential_types.length > 0 ? 1 : 0) +
    (p.require_zkp.length > 0 ? 1 : 0) +
    (p.require_on_chain_anchor ? 1 : 0) +
    (p.require_sbt_badge ? 1 : 0) +
    (p.require_biometric ? 1 : 0) +
    (p.require_smart_wallet ? 1 : 0) +
    2 // trust tier + freshness
  );
}
