/**
 * BlockID Credential Trust Engine — canonical, authoritative scoring model.
 * ─────────────────────────────────────────────────────────────────────────────
 * This is the SINGLE source of truth for credential trust scoring in BlockID.
 *
 * It is deliberately isomorphic: pure TypeScript with no Deno, DOM, React or
 * Node dependencies, so it is imported unchanged by
 *   • the Supabase edge functions (relative `./` imports)
 *   • the browser client (`src/lib/ml/credentialEngine.ts` re-exports it)
 *   • the vitest suite
 * There is therefore exactly ONE set of weights, caps and thresholds in the
 * codebase — the previous split between `verify-credential/ai-engine.ts` and
 * `src/lib/ml/trustScore.ts` produced two different scores for the same
 * credential and has been removed.
 *
 * SECURITY MODEL
 * ──────────────
 * 1. This module is deterministic. Same signals in → same result out. There is
 *    no network call, no randomness and no clock-dependent branching beyond
 *    date arithmetic.
 * 2. The LLM has ZERO authority over the numbers. `analyzeCredential` returns
 *    a score computed purely from signals. LLM output is merged afterwards via
 *    `withNarrative()`, which by construction can only add prose — it can
 *    never raise a score, lower a risk, or clear a hard cap. (The previous
 *    engine let Gemini override `risk_level` outright, which meant a language
 *    model could relabel a hash mismatch as "low" risk.)
 * 3. Hard-fail caps are non-negotiable. If the hash does not match, if the
 *    credential is revoked, or if it is expired, the final score is clamped no
 *    matter how many other signals are positive. Caps only ever lower.
 * 4. Confidence measures EVIDENCE COVERAGE, not optimism. A credential we know
 *    is bad can be reported with high confidence; a credential we could not
 *    check is reported with low confidence. (The previous engine computed
 *    confidence as "how many dimensions did not return `unknown`", and since
 *    no dimension ever returned `unknown`, the value was a hardcoded 100.)
 */

// ─── Versioning ───────────────────────────────────────────────────────────────

/** Bump when the shape of AIAnalysisResult changes. Persisted on every row. */
export const AI_ANALYSIS_SCHEMA_VERSION = 2;

/** Identifies the deterministic scorer. Appended with `+llm:<model>` when an LLM narrates. */
export const ENGINE_ID = "blockid-trust-v2";

/**
 * Confidence is persisted 0-100. Legacy rows written by `ai-verify-credential`
 * stored a 0-1 fraction in the same column; `normalizeAiAnalysis` on the client
 * rescales those. New writes are ALWAYS 0-100.
 */
export const CONFIDENCE_SCALE = 100;

// ─── Core types ───────────────────────────────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high";

export type TrustTier = "platinum" | "gold" | "silver" | "bronze" | "untrusted";

export type DimensionStatus = "pass" | "warn" | "fail" | "unknown";

export type DimensionKey =
  | "hashIntegrity"
  | "blockchainAnchor"
  | "revocationStatus"
  | "cryptoProof"
  | "issuerTrust"
  | "expiration"
  | "dataQuality"
  | "temporalConsist";

export interface DimensionScore {
  key: DimensionKey;
  name: string;
  /** 0-100. For `unknown`, this is the neutral mid-point, not an assertion. */
  score: number;
  /** Relative weight. All weights sum to exactly 100. */
  weight: number;
  status: DimensionStatus;
  detail: string;
  /** True when a `fail` here triggers a non-negotiable score cap. */
  critical: boolean;
}

/** Why confidence was reduced — surfaced in the UI so the number is explainable. */
export interface ConfidenceFactor {
  key: string;
  label: string;
  penalty: number;
}

export interface HardCap {
  key: string;
  /** The maximum score this failure permits. */
  cap: number;
  reason: string;
}

/** LLM-authored prose. Never contributes to score, risk, confidence or tier. */
export interface LlmNarrative {
  model: string;
  summary: string;
  findings: string[];
  recommendations: string[];
  flags: string[];
  latency_ms: number;
  prompt_tokens: number | null;
  candidates_tokens: number | null;
  /** True when the LLM call failed and the deterministic prose is being used. */
  degraded: boolean;
}

export interface AIAnalysisResult {
  schema_version: number;
  /** `blockid-trust-v2`, or `blockid-trust-v2+llm:<model>` when narrated. */
  engine: string;
  /** Final score 0-100, AFTER hard caps. This is the number the UI shows. */
  score: number;
  /** Score before caps — what the signal mix produced on its own. */
  raw_score: number;
  risk_level: RiskLevel;
  /** 0-100 evidence coverage. Always 0-100, never a 0-1 fraction. */
  confidence: number;
  confidence_factors: ConfidenceFactor[];
  tier: TrustTier;
  hard_caps_applied: HardCap[];
  findings: string[];
  recommendations: string[];
  dimensions: DimensionScore[];
  llm: LlmNarrative | null;
  analyzed_at: string;
}

// ─── Inputs ───────────────────────────────────────────────────────────────────

/**
 * Everything the engine needs. Optional signals are nullable on purpose: a
 * `null` means "we could not determine this", which lowers confidence. Using a
 * neutral default instead (the old approach) silently manufactured confidence
 * out of missing evidence.
 */
export interface CredentialSignals {
  /** Raw W3C Verifiable Credential JSON. Holder-controlled — never trusted. */
  vc: Record<string, unknown>;
  /**
   * A stored digest was available to compare against in this pass. When false
   * the engine reports hash integrity as `unknown` rather than claiming a pass
   * it did not earn.
   */
  hashChecked: boolean;
  /** SHA-256 of canonical JSON matches the stored digest. Only read when `hashChecked`. */
  hashValid: boolean;
  /** DB status field. */
  dbStatus: string;
  /** CredentialRegistry contract confirms the anchor. */
  blockchainVerified: boolean;
  /** On-chain record shows revoked = true. */
  onChainRevoked: boolean;
  /** txHash or null. */
  blockchainAnchor: string | null;
  /**
   * False when the chain could not be reached at all. This is materially
   * different from "reached the chain, no anchor found" — the first means
   * unverified, the second means unanchored.
   */
  onChainChecked: boolean;
  /** Credential carries a real wallet signature. */
  walletSigned: boolean;
  /** Signature cryptographically verified. `null` = not verifiable. */
  signatureVerified: boolean | null;
  signerAddress: string | null;
  /** ISO string of the DB issued_at timestamp. */
  issuedAt: string | null;
  /** ISO string of DB expires_at, or null. */
  expiresAt: string | null;
  /**
   * An explicit expiry determination for callers that know whether the
   * credential is in-window but not the date (a common case when a status list
   * says "valid" without exposing a timestamp). `expiresAt` always wins when
   * present; this is only consulted when it is null. `null` means "not known".
   */
  notExpired: boolean | null;
  credentialHash: string;
  /** 0-100 issuer reputation. `null` = unknown. */
  issuerReputation: number | null;
  /** 0-1 historical pass rate for this issuer. `null` = insufficient history. */
  verificationSuccessRate: number | null;
  /** Days since issuance. `null` = unknown. */
  credentialAgeDays: number | null;
  /** A zero-knowledge proof was presented and checked. `null` = not applicable/unknown. */
  zkProofVerified: boolean | null;
  /** Whether a registered JSON schema backs this credential. `null` = unknown. */
  schemaKnown: boolean | null;
}

// ─── Canonical thresholds — the only definitions in the codebase ──────────────

/** Weights MUST sum to exactly 100. Enforced at module load (see below). */
export const DIMENSION_WEIGHTS: Readonly<Record<DimensionKey, number>> = Object.freeze({
  hashIntegrity: 18,
  blockchainAnchor: 18,
  revocationStatus: 14,
  cryptoProof: 14,
  issuerTrust: 12,
  expiration: 10,
  dataQuality: 8,
  temporalConsist: 6,
});

export const DIMENSION_KEYS = Object.keys(DIMENSION_WEIGHTS) as DimensionKey[];

/** Score bands → risk level. Shared by the engine, the client and the charts. */
export const RISK_BANDS = Object.freeze({ low: 75, medium: 45 } as const);

/** Score bands → trust tier. Frozen by the `trust_tier` CHECK constraint. */
export const TIER_BANDS = Object.freeze({
  platinum: 90,
  gold: 75,
  silver: 60,
  bronze: 40,
} as const);

/**
 * Non-negotiable score ceilings for definitive security failures.
 * Caps only ever LOWER a score. The LLM cannot lift them.
 */
export const HARD_FAIL_CAPS = Object.freeze({
  /** Hash does not match the data → the credential is not the one that was issued. */
  hashMismatch: 20,
  /** Revoked in the database or on-chain. */
  revoked: 20,
  /** Past its validity window. */
  expired: 40,
  /** No on-chain anchor, and the chain WAS successfully checked. */
  unanchored: 55,
  /** No cryptographic proof AND no anchor → nothing independently attests to it. */
  unprovable: 30,
} as const);

/**
 * Confidence penalties, applied when a signal could not be determined.
 * These sum to more than 100, so a fully-unverifiable credential floors out.
 */
export const CONFIDENCE_PENALTIES = Object.freeze({
  onChainUnreachable: 25,
  signatureUnverifiable: 20,
  hashNotChecked: 20,
  issuerReputationUnknown: 12,
  verificationHistoryUnknown: 10,
  schemaUnknown: 8,
  zkProofUnknown: 5,
  expirationUnknown: 5,
  ageUnknown: 5,
  issuerUnresolvable: 10,
} as const);

export const MIN_CONFIDENCE = 10;
export const MAX_CONFIDENCE = 100;

// Fail fast if the weight table is ever edited into an invalid state.
(function assertWeightsSumTo100() {
  const total = Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
  if (total !== 100) {
    throw new Error(
      `[BlockID credentialEngine] DIMENSION_WEIGHTS must sum to 100, got ${total}. ` +
        `Fix the table before shipping — a drifting total silently rescales every score.`,
    );
  }
})();

// ─── Small helpers ────────────────────────────────────────────────────────────

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function clamp01(n: number): number {
  return clamp(n, 0, 1);
}

export function isDIDWellFormed(did: unknown): boolean {
  if (typeof did !== "string") return false;
  return /^did:[a-z0-9]+:[a-zA-Z0-9._:%-]+$/.test(did);
}

export function daysUntil(iso: string, now: number = Date.now()): number {
  return Math.floor((new Date(iso).getTime() - now) / 86_400_000);
}

export function daysSince(iso: string, now: number = Date.now()): number {
  return Math.floor((now - new Date(iso).getTime()) / 86_400_000);
}

/** Pulls the issuer identifier out of either the string or object DID form. */
export function resolveIssuer(vc: Record<string, unknown>): string | null {
  const issuer = vc.issuer;
  if (typeof issuer === "string") return issuer;
  if (issuer && typeof issuer === "object") {
    const id = (issuer as Record<string, unknown>).id;
    if (typeof id === "string") return id;
  }
  return null;
}

function subjectOf(vc: Record<string, unknown>): Record<string, unknown> {
  const s = vc.credentialSubject;
  return s && typeof s === "object" ? (s as Record<string, unknown>) : {};
}

// ─── Dimension scorers ────────────────────────────────────────────────────────

function make(
  key: DimensionKey,
  status: DimensionStatus,
  score: number,
  detail: string,
  critical: boolean,
): DimensionScore {
  const NAMES: Record<DimensionKey, string> = {
    hashIntegrity: "Hash Integrity",
    blockchainAnchor: "Blockchain Anchoring",
    revocationStatus: "Revocation Status",
    cryptoProof: "Cryptographic Proof",
    issuerTrust: "Issuer Trust",
    expiration: "Expiration",
    dataQuality: "Data Quality",
    temporalConsist: "Temporal Consistency",
  };
  return { key, name: NAMES[key], score, weight: DIMENSION_WEIGHTS[key], status, detail, critical };
}

/** Score used when a dimension is `unknown`. Deliberately neutral, never optimistic. */
const UNKNOWN_SCORE = 50;

function scoreHashIntegrity(s: CredentialSignals): DimensionScore {
  if (!s.hashChecked) {
    return make("hashIntegrity", "unknown", UNKNOWN_SCORE, "No stored digest was available to compare against in this pass, so hash integrity is unconfirmed. Run a full verification to establish it.", true);
  }
  return s.hashValid
    ? make("hashIntegrity", "pass", 100, "SHA-256 hash matches the stored digest. No tampering detected.", true)
    : make("hashIntegrity", "fail", 0, "Hash mismatch — the credential data no longer matches the digest recorded at issuance. Treat as tampered or corrupt.", true);
}

function scoreBlockchainAnchor(s: CredentialSignals): DimensionScore {
  // Chain unreachable is an unknown, not a failure. Conflating the two is what
  // made RPC outages look like tampering.
  if (!s.onChainChecked) {
    return make("blockchainAnchor", "unknown", UNKNOWN_SCORE, "The on-chain registry could not be reached, so the anchor state is unconfirmed. This may be an RPC availability issue rather than a missing anchor.", false);
  }
  if (s.blockchainVerified) {
    return make("blockchainAnchor", "pass", 100, "Credential hash confirmed anchored in the CredentialRegistry smart contract.", false);
  }
  if (s.blockchainAnchor) {
    return make("blockchainAnchor", "warn", 40, "An anchor transaction hash is recorded, but the contract did not confirm it. The anchor may be pending or the record stale.", false);
  }
  return make("blockchainAnchor", "fail", 0, "The chain was checked and holds no anchor for this credential.", true);
}

function scoreRevocationStatus(s: CredentialSignals): DimensionScore {
  const dbActive = s.dbStatus === "active";
  const onChainClear = !s.onChainRevoked;

  if (dbActive && onChainClear) {
    return make("revocationStatus", "pass", 100, "Credential is active in the database and not revoked on-chain.", false);
  }
  if (!dbActive && !onChainClear) {
    return make("revocationStatus", "fail", 0, `Revoked in both the database (status: ${s.dbStatus}) and the on-chain registry.`, true);
  }
  if (!dbActive) {
    return make("revocationStatus", "fail", 0, `Database status is "${s.dbStatus}", not "active". The credential is no longer valid.`, true);
  }
  // DB says active, chain says revoked. Both are checked and they disagree —
  // treat the chain as authoritative since it is the immutable record.
  return make("revocationStatus", "fail", 0, "The database reports this credential as active, but the on-chain registry marks it revoked. The revocation is authoritative — expect a database desync.", true);
}

function scoreExpiration(s: CredentialSignals): DimensionScore {
  // An explicit determination from a status list, when there is no date to read.
  if (!s.expiresAt) {
    if (s.notExpired === false) {
      return make("expiration", "fail", 0, "The issuer's status list reports this credential as outside its validity window.", true);
    }
    return make("expiration", "warn", 70, "No expiration date is set, so this credential can never lapse. Perpetual credentials carry unbounded risk.", false);
  }
  const days = daysUntil(s.expiresAt);
  const pretty = new Date(s.expiresAt).toISOString().slice(0, 10);
  if (days < 0) {
    return make("expiration", "fail", 0, `Expired ${Math.abs(days)} day(s) ago on ${pretty}.`, true);
  }
  if (days < 30) {
    return make("expiration", "warn", 50, `Expires in ${days} day(s) on ${pretty} — inside the 30-day renewal window.`, false);
  }
  return make("expiration", "pass", 100, `Valid until ${pretty} (${days} days remaining).`, false);
}

function scoreCryptoProof(s: CredentialSignals): DimensionScore {
  const proof = s.vc.proof as Record<string, unknown> | undefined;

  if (s.walletSigned && s.signatureVerified === true) {
    const who = s.signerAddress ? ` Signer: ${s.signerAddress}.` : "";
    return make("cryptoProof", "pass", 100, `Wallet signature present and cryptographically verified.${who}`, false);
  }
  if (s.walletSigned && s.signatureVerified === null) {
    return make("cryptoProof", "warn", 65, "A wallet signature is attached but could not be cryptographically verified in this pass. Treat the signature as unproven.", false);
  }
  if (s.walletSigned && s.signatureVerified === false) {
    return make("cryptoProof", "fail", 0, "A wallet signature is attached but the signature does not verify against the credential. The holder is not who they claim to be.", true);
  }
  if (s.zkProofVerified === true) {
    return make("cryptoProof", "pass", 90, "A zero-knowledge proof was presented and verified, so the holder proved their claims without disclosing the underlying attributes.", false);
  }
  if (proof) {
    return make("cryptoProof", "warn", 45, `A proof of type "${proof.type || "unknown"}" is present but carries no verifiable cryptographic signature.`, false);
  }
  return make("cryptoProof", "fail", 15, "No cryptographic proof of any kind. Authenticity rests entirely on database trust.", true);
}

function scoreIssuerTrust(s: CredentialSignals): DimensionScore {
  const issuer = resolveIssuer(s.vc);

  if (!issuer) {
    return make("issuerTrust", "unknown", UNKNOWN_SCORE, "No issuer identifier is present in the credential, so issuer reputation could not be applied.", false);
  }
  if (!isDIDWellFormed(issuer)) {
    return make("issuerTrust", "fail", 20, `The issuer identifier "${truncate(issuer, 80)}" is not a well-formed DID.`, false);
  }

  // Reputation is the dominant signal when we have it; fall back to platform
  // recognition only when we do not, and say so.
  if (s.issuerReputation !== null && s.issuerReputation !== undefined) {
    const rep = clamp(s.issuerReputation, 0, 100);
    if (rep >= 80) return make("issuerTrust", "pass", 100, `Issuer ${issuer} has a reputation of ${Math.round(rep)}/100.`, false);
    if (rep >= 55) return make("issuerTrust", "pass", 80, `Issuer ${issuer} has a reputation of ${Math.round(rep)}/100 — established but not exemplary.`, false);
    if (rep >= 30) return make("issuerTrust", "warn", 50, `Issuer ${issuer} has a weak reputation of ${Math.round(rep)}/100. Verify independently.`, false);
    return make("issuerTrust", "fail", 15, `Issuer ${issuer} has a reputation of ${Math.round(rep)}/100 and should not be relied upon.`, false);
  }

  const recognised = issuer.startsWith("did:decentraid:");
  return recognised
    ? make("issuerTrust", "warn", 75, `Issuer ${issuer} is a recognised BlockID platform DID, but it has no recorded reputation yet.`, false)
    : make("issuerTrust", "warn", 60, `Issuer ${issuer} is an external issuer with no reputation history on this platform.`, false);
}

function scoreDataQuality(s: CredentialSignals): DimensionScore {
  const vc = s.vc;
  const required = ["@context", "type", "issuer", "issuanceDate", "credentialSubject"];
  const missing = required.filter((k) => !vc[k]);

  if (missing.length > 0) {
    return make("dataQuality", "fail", 15, `Missing required W3C VC fields: ${missing.join(", ")}.`, false);
  }

  const issues: string[] = [];
  const types = Array.isArray(vc.type) ? (vc.type as unknown[]) : [];
  if (!types.includes("VerifiableCredential")) issues.push("`type` does not include \"VerifiableCredential\"");

  const subject = subjectOf(vc);
  if (!subject.id) issues.push("`credentialSubject.id` is missing");
  else if (!isDIDWellFormed(subject.id)) issues.push("`credentialSubject.id` is not a valid DID");
  if (Object.keys(subject).length <= 1) issues.push("`credentialSubject` carries no claim data");

  if (s.schemaKnown === false) {
    return make("dataQuality", "warn", 55, "Claims could not be validated against a registered schema. Field-level integrity is unverified.", false);
  }

  if (issues.length > 0) {
    return make("dataQuality", "warn", 65, `Minor conformance issues: ${issues.join("; ")}.`, false);
  }
  return make("dataQuality", "pass", 100, "All required W3C VC fields are present and the subject identifier is well-formed.", false);
}

function scoreTemporalConsistency(s: CredentialSignals): DimensionScore {
  const vcIssuance = s.vc.issuanceDate as string | undefined;
  if (!vcIssuance) {
    return make("temporalConsist", "unknown", UNKNOWN_SCORE, "No `issuanceDate` in the credential body, so the issuance timeline cannot be validated.", false);
  }
  const vcDate = new Date(vcIssuance);
  if (Number.isNaN(vcDate.getTime())) {
    return make("temporalConsist", "fail", 10, `\`issuanceDate\` is not a parseable date ("${truncate(String(vcIssuance), 40)}").`, false);
  }
  if (vcDate.getTime() > Date.now()) {
    return make("temporalConsist", "fail", 5, `\`issuanceDate\` is in the future. A credential cannot have been issued before it existed.`, true);
  }

  if (s.issuedAt) {
    const dbDate = new Date(s.issuedAt);
    if (!Number.isNaN(dbDate.getTime())) {
      const driftHours = Math.abs(vcDate.getTime() - dbDate.getTime()) / 3_600_000;
      if (driftHours > 48) {
        return make("temporalConsist", "warn", 45, `\`issuanceDate\` in the credential body differs from the recorded issuance time by ${Math.round(driftHours)} hours. One of the two has been altered.`, false);
      }
    }
  }

  const age = s.credentialAgeDays ?? daysSince(vcIssuance);
  if (age < 0) {
    return make("temporalConsist", "warn", 60, "The credential is dated in the future.", false);
  }
  if (age < 1) {
    return make("temporalConsist", "pass", 85, "The credential was issued in the last 24 hours. There is no track record yet.", false);
  }
  if (age >= 365) {
    return make("temporalConsist", "pass", 100, `Issued ${Math.floor(age)} days ago and has remained valid throughout.`, false);
  }
  return make("temporalConsist", "pass", 90, `Issued ${Math.floor(age)} day(s) ago. Timestamps are internally consistent.`, false);
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

// ─── Confidence ───────────────────────────────────────────────────────────────

/**
 * Confidence = how much of the available evidence we actually gathered.
 *
 * It is deliberately independent of the outcome. A credential we positively
 * identified as revoked is described with HIGH confidence. A credential we
 * simply could not reach the chain to check is described with LOW confidence.
 * Collapsing the two is what made the previous confidence figure meaningless.
 */
export function computeConfidence(s: CredentialSignals): { confidence: number; factors: ConfidenceFactor[] } {
  const factors: ConfidenceFactor[] = [];
  const add = (key: string, label: string, penalty: number) => {
    if (penalty > 0) factors.push({ key, label, penalty });
  };

  if (!s.onChainChecked) add("onChainUnreachable", "On-chain registry was unreachable", CONFIDENCE_PENALTIES.onChainUnreachable);
  if (!s.hashChecked) add("hashNotChecked", "No stored digest available to verify hash integrity", CONFIDENCE_PENALTIES.hashNotChecked);
  if (!s.walletSigned && s.signatureVerified === null) add("signatureUnverifiable", "No signature to verify", CONFIDENCE_PENALTIES.signatureUnverifiable);
  if (s.issuerReputation === null || s.issuerReputation === undefined) add("issuerReputationUnknown", "No issuer reputation history", CONFIDENCE_PENALTIES.issuerReputationUnknown);
  if (!resolveIssuer(s.vc)) add("issuerUnresolvable", "Issuer could not be resolved", CONFIDENCE_PENALTIES.issuerUnresolvable);
  if (s.verificationSuccessRate === null || s.verificationSuccessRate === undefined) add("verificationHistoryUnknown", "Insufficient verification history", CONFIDENCE_PENALTIES.verificationHistoryUnknown);
  if (s.schemaKnown === null || s.schemaKnown === undefined) add("schemaUnknown", "No registered schema to validate against", CONFIDENCE_PENALTIES.schemaUnknown);
  if (s.zkProofVerified === null || s.zkProofVerified === undefined) add("zkProofUnknown", "Zero-knowledge proof state unknown", CONFIDENCE_PENALTIES.zkProofUnknown);
  if (!s.expiresAt) add("expirationUnknown", "No expiration date recorded", CONFIDENCE_PENALTIES.expirationUnknown);
  if (s.credentialAgeDays === null || s.credentialAgeDays === undefined) add("ageUnknown", "Credential age unknown", CONFIDENCE_PENALTIES.ageUnknown);

  const totalPenalty = factors.reduce((sum, f) => sum + f.penalty, 0);
  return {
    confidence: clamp(MAX_CONFIDENCE - totalPenalty, MIN_CONFIDENCE, MAX_CONFIDENCE),
    factors,
  };
}

// ─── Hard caps ────────────────────────────────────────────────────────────────

/**
 * Derive the applicable score ceilings. The tightest matching cap wins.
 * These are evaluated from the *signals*, not from the dimension scores, so
 * they cannot be softened by anything a narrative layer adds.
 */
export function deriveHardCaps(s: CredentialSignals): HardCap[] {
  const caps: HardCap[] = [];

  if (s.hashChecked && !s.hashValid) {
    caps.push({ key: "hashMismatch", cap: HARD_FAIL_CAPS.hashMismatch, reason: "Credential hash does not match its data." });
  }
  const revokedAnywhere = s.dbStatus !== "active" || s.onChainRevoked;
  if (revokedAnywhere) {
    caps.push({ key: "revoked", cap: HARD_FAIL_CAPS.revoked, reason: "Credential has been revoked." });
  }
  if (s.expiresAt && daysUntil(s.expiresAt) < 0) {
    caps.push({ key: "expired", cap: HARD_FAIL_CAPS.expired, reason: "Credential is past its expiration date." });
  } else if (!s.expiresAt && s.notExpired === false) {
    caps.push({ key: "expired", cap: HARD_FAIL_CAPS.expired, reason: "Issuer status list reports the credential as out of its validity window." });
  }
  if (s.onChainChecked && !s.blockchainVerified) {
    caps.push({ key: "unanchored", cap: HARD_FAIL_CAPS.unanchored, reason: "Credential has no on-chain anchor." });
  }
  const hasProof = s.walletSigned || s.zkProofVerified === true || !!s.vc.proof;
  const hasIndependentAttestation = hasProof || s.blockchainVerified;
  if (!hasIndependentAttestation) {
    caps.push({ key: "unprovable", cap: HARD_FAIL_CAPS.unprovable, reason: "Neither a cryptographic proof nor a blockchain anchor attests to this credential." });
  }
  return caps;
}

export function applyHardCaps(rawScore: number, caps: HardCap[]): number {
  if (caps.length === 0) return clamp(Math.round(rawScore), 0, 100);
  const tightest = caps.reduce((min, c) => Math.min(min, c.cap), 100);
  return clamp(Math.min(Math.round(rawScore), tightest), 0, 100);
}

// ─── Band mapping ─────────────────────────────────────────────────────────────

export function riskLevelFor(score: number): RiskLevel {
  if (score >= RISK_BANDS.low) return "low";
  if (score >= RISK_BANDS.medium) return "medium";
  return "high";
}

export function scoreToTier(score: number): TrustTier {
  if (score >= TIER_BANDS.platinum) return "platinum";
  if (score >= TIER_BANDS.gold) return "gold";
  if (score >= TIER_BANDS.silver) return "silver";
  if (score >= TIER_BANDS.bronze) return "bronze";
  return "untrusted";
}

export const TIER_LABELS: Readonly<Record<TrustTier, string>> = Object.freeze({
  platinum: "Platinum",
  gold: "Gold",
  silver: "Silver",
  bronze: "Bronze",
  untrusted: "Untrusted",
});

export const RISK_LABELS: Readonly<Record<RiskLevel, string>> = Object.freeze({
  low: "Low",
  medium: "Medium",
  high: "High",
});

export const TIER_COLORS: Readonly<Record<TrustTier, string>> = Object.freeze({
  platinum: "bg-cyan-100 text-cyan-800 border-cyan-300",
  gold: "bg-amber-100 text-amber-800 border-amber-300",
  silver: "bg-slate-100 text-slate-700 border-slate-300",
  bronze: "bg-orange-100 text-orange-800 border-orange-300",
  untrusted: "bg-red-100 text-red-800 border-red-300",
});

// ─── Recommendations ──────────────────────────────────────────────────────────

function buildRecommendations(s: CredentialSignals, dims: DimensionScore[], caps: HardCap[]): string[] {
  const recs: string[] = [];
  const byKey = (k: DimensionKey) => dims.find((d) => d.key === k);

  if (s.hashChecked && !s.hashValid) {
    recs.push("Do not rely on this credential. The stored data does not match the digest recorded at issuance — re-request it from the holder and escalate to the issuer.");
  } else if (!s.hashChecked) {
    recs.push("Hash integrity was not established in this pass. Run a full verification against the stored record before treating this as conclusive.");
  }
  if (s.dbStatus !== "active" || s.onChainRevoked) {
    recs.push("This credential has been revoked. Decline the request unless the issuer provides a replacement, and report the revocation to your compliance owner.");
  }
  if (s.expiresAt && daysUntil(s.expiresAt) < 0) {
    recs.push("This credential has expired and cannot be relied upon for any purpose. Request a renewed credential from the issuer.");
  }
  if (s.signatureVerified === false) {
    recs.push("The wallet signature does not verify against the credential. Treat the holder as unverified and review this submission manually.");
  }
  if (s.onChainChecked && !s.blockchainVerified) {
    recs.push("No on-chain anchor was found. Ask the issuer to anchor the credential, or corroborate the claim through a second independent source.");
  }
  if (!s.onChainChecked) {
    recs.push("The blockchain registry could not be reached, so this result is provisional. Re-run the verification when Sepolia RPC is available before making a final decision.");
  }
  if (s.walletSigned && s.signatureVerified === null) {
    recs.push("The attached signature could not be cryptographically verified in this pass. Request a signed presentation and verify it directly.");
  }
  if (s.zkProofVerified === null) {
    recs.push("Ask the holder to present a selective-disclosure (ZK) proof so claims can be proven without exposing the underlying attributes.");
  }
  if (s.verificationSuccessRate === null) {
    recs.push("There is no verification history for this issuer. Treat the risk assessment as provisional until the issuer accumulates a track record.");
  }
  if (s.issuerReputation !== null && s.issuerReputation !== undefined && s.issuerReputation < 40) {
    recs.push("This issuer has a poor reputation. Require a second, independent proof of the claim before accepting.");
  }
  if (s.expiresAt && daysUntil(s.expiresAt) >= 0 && daysUntil(s.expiresAt) < 30) {
    recs.push(`This credential expires in ${daysUntil(s.expiresAt)} day(s). Request renewal to avoid an interruption.`);
  }
  if (!s.expiresAt && s.notExpired === false) {
    recs.push("The issuer reports this credential as outside its validity window. Request a renewed credential from the issuer.");
  }
  if (!s.expiresAt) {
    recs.push("This credential never expires. Consider requiring the issuer to set a validity window.");
  }
  const dataQuality = byKey("dataQuality");
  if (dataQuality && (dataQuality.status === "fail" || dataQuality.status === "warn")) {
    recs.push("The credential does not fully conform to the W3C Verifiable Credential data model. Treat the claim data with care.");
  }

  const deduped = Array.from(new Set(recs));
  if (deduped.length === 0) {
    return caps.length > 0
      ? ["No further action is possible with this credential; the failures above cannot be remedied by the holder."]
      : ["No action required. This credential passed every check the engine could perform."];
  }
  return deduped.slice(0, 8);
}

const STATUS_ICON: Readonly<Record<DimensionStatus, string>> = Object.freeze({
  pass: "✅",
  warn: "⚠️",
  fail: "❌",
  unknown: "❓",
});

/** Emoji marker for a dimension status. Single definition, used by findings and the UI. */
export function getStatusIcon(status: DimensionStatus): string {
  return STATUS_ICON[status];
}

// ─── The engine ───────────────────────────────────────────────────────────────

export interface AnalyzeOptions {
  /** Injectable clock so the engine is deterministically testable. */
  now?: number;
}

/**
 * Score a credential. Pure, synchronous, deterministic.
 *
 * The returned `score`, `risk_level`, `confidence` and `tier` are computed
 * exclusively from `signals`. Nothing in this function reads from the network,
 * and there is no parameter through which a language model can influence it.
 */
export function analyzeCredential(signals: CredentialSignals, options: AnalyzeOptions = {}): AIAnalysisResult {
  const now = options.now ?? Date.now();

  const dimensions: DimensionScore[] = [
    scoreHashIntegrity(signals),
    scoreBlockchainAnchor(signals),
    scoreRevocationStatus(signals),
    scoreCryptoProof(signals),
    scoreIssuerTrust(signals),
    scoreExpiration(signals),
    scoreDataQuality(signals),
    scoreTemporalConsistency(signals),
  ];

  const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);
  const rawScore = dimensions.reduce((sum, d) => sum + d.score * d.weight, 0) / totalWeight;

  const hard_caps_applied = deriveHardCaps(signals);
  const score = applyHardCaps(rawScore, hard_caps_applied);
  const { confidence, factors } = computeConfidence(signals);

  const findings: string[] = dimensions.map((d) => `${STATUS_ICON[d.status]} ${d.name}: ${d.detail}`);
  if (hard_caps_applied.length > 0) {
    for (const cap of hard_caps_applied) {
      findings.push(`⛔ Score capped at ${cap.cap}/100 — ${cap.reason}`);
    }
  }
  if (factors.length > 0) {
    findings.push(`📉 Confidence ${confidence}% — reduced by: ${factors.map((f) => f.label.toLowerCase()).join("; ")}.`);
  }

  return {
    schema_version: AI_ANALYSIS_SCHEMA_VERSION,
    engine: ENGINE_ID,
    score,
    raw_score: Math.round(rawScore),
    risk_level: riskLevelFor(score),
    confidence,
    confidence_factors: factors,
    tier: scoreToTier(score),
    hard_caps_applied,
    findings,
    recommendations: buildRecommendations(signals, dimensions, hard_caps_applied),
    dimensions,
    llm: null,
    analyzed_at: new Date(now).toISOString(),
  };
}

/**
 * Attach LLM-authored prose to an analysis.
 *
 * This is the ONLY entry point through which language-model output enters the
 * result, and it is structurally incapable of changing a number: it does not
 * touch `score`, `raw_score`, `risk_level`, `confidence` or `tier`. It appends
 * to `findings` and prepends to `recommendations`, and records the model and
 * its latency for observability.
 *
 * If `narrative` is null (LLM disabled, failed or timed out) the deterministic
 * analysis is returned untouched apart from the engine label.
 */
export function withNarrative(
  analysis: AIAnalysisResult,
  narrative: Pick<LlmNarrative, "model" | "summary" | "findings" | "recommendations" | "flags" | "latency_ms" | "prompt_tokens" | "candidates_tokens"> | null,
  options: { degraded?: boolean; now?: number } = {},
): AIAnalysisResult {
  const now = options.now ?? Date.now();

  if (!narrative) {
    return {
      ...analysis,
      llm: {
        model: "none",
        summary: "",
        findings: [],
        recommendations: [],
        flags: [],
        latency_ms: 0,
        prompt_tokens: null,
        candidates_tokens: null,
        degraded: true,
      },
    };
  }

  const sanitise = (items: string[], max: number): string[] =>
    Array.from(new Set(items.map((s) => String(s).trim()).filter(Boolean))).slice(0, max);

  const llmFindings = [
    ...sanitise(narrative.findings, 5),
    ...sanitise(narrative.flags, 3).map((f) => `🚩 ${f}`),
  ];

  return {
    ...analysis,
    // The score is preserved verbatim. Only the engine label changes.
    engine: `${ENGINE_ID}+llm:${narrative.model}`,
    findings: [
      ...(narrative.summary ? [`🤖 ${narrative.summary}`] : []),
      ...llmFindings,
      ...analysis.findings,
    ],
    recommendations: [...sanitise(narrative.recommendations, 4), ...analysis.recommendations].slice(0, 8),
    llm: {
      model: narrative.model,
      summary: narrative.summary,
      findings: sanitise(narrative.findings, 5),
      recommendations: sanitise(narrative.recommendations, 4),
      flags: sanitise(narrative.flags, 3),
      latency_ms: narrative.latency_ms,
      prompt_tokens: narrative.prompt_tokens ?? null,
      candidates_tokens: narrative.candidates_tokens ?? null,
      degraded: options.degraded ?? false,
    },
    analyzed_at: analysis.analyzed_at || new Date(now).toISOString(),
  };
}

// ─── Validity ─────────────────────────────────────────────────────────────────

/**
 * The single boolean the rest of the system gates on. It is derived from
 * definitive signals only — it never consults the score, the risk level or any
 * model output, so a high score can never mask a revocation and vice versa.
 */
export function isCredentialAcceptable(s: CredentialSignals): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  // An unverified hash is not a failure — but it is a reason not to treat the
  // result as final, so it is reported separately from the hard failures.
  if (s.hashChecked && !s.hashValid) reasons.push("hash_mismatch");
  if (s.dbStatus !== "active") reasons.push(`db_status_${s.dbStatus}`);
  if (s.onChainRevoked) reasons.push("on_chain_revoked");
  if (s.expiresAt && daysUntil(s.expiresAt) < 0) reasons.push("expired");
  if (!s.expiresAt && s.notExpired === false) reasons.push("expired");
  if (s.signatureVerified === false) reasons.push("signature_invalid");
  return { valid: reasons.length === 0, reasons };
}

/** Checks that could not be completed, so callers can mark results provisional. */
export function unverifiedChecks(s: CredentialSignals): string[] {
  const out: string[] = [];
  if (!s.hashChecked) out.push("hash_integrity");
  if (!s.onChainChecked) out.push("blockchain_anchor");
  if (s.walletSigned && s.signatureVerified === null) out.push("signature");
  return out;
}
