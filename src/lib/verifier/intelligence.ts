/**
 * Verifier intelligence — bridges raw `verification_requests` rows into the
 * deterministic models in `src/lib/ml` (trust score + anomaly engine).
 *
 * Everything here is pure so the dashboard, history, analytics and the
 * Threat Intelligence Center all derive identical numbers from the same rows.
 */
import {
  computeTrustScore,
  analysisToTrustScore,
  scoreToTier,
  type TrustFactors,
  type TrustScoreResult,
  type TrustTier,
} from "@/lib/ml/trustScore";
import { aiConfidencePercent, normalizeAiAnalysis } from "@/lib/ml/aiAnalysis";
import { analyzeAnomalies, haversineKm, type AnomalyEvent, type AnomalyReport } from "@/lib/ml/anomaly";
import { evaluatePolicy, normalizePolicy, type VerificationPolicy, type VerificationEvidence } from "@/lib/verifier/policy";
import type { CircuitName } from "@/lib/zkp";
import type { VerificationRecord } from "@/services/api/verifier.service";

/** Subset of a record we need — keeps this module usable from tests. */
export type IntelligenceRecord = Pick<
  VerificationRecord,
  | "id"
  | "holder_did"
  | "credential_type"
  | "status"
  | "created_at"
  | "responded_at"
  | "verified_at"
  | "shared_credential_data"
  | "ai_analysis"
  | "zkp_circuit"
  | "zkp_proof_valid"
  | "zkp_on_chain_valid"
  | "biometric_verified"
  | "trust_score"
  | "trust_tier"
  | "anomaly_risk"
  | "anomaly_findings"
  | "sbt_token_id"
  | "policy_id"
>;

/** Credential type label for a record, falling back to the VP schema type. */
export function credentialTypeOf(record: IntelligenceRecord): string | null {
  return record.credential_type ?? credentialPayload(record)?.schemaType ?? null;
}

/** Raw verify-credential edge-function response, as consumed by the result view. */
export type VerificationReport = Record<string, unknown>;

const ACCEPTED = new Set(["verified", "accepted"]);
const REJECTED = new Set(["rejected"]);

// ── Extraction helpers ───────────────────────────────────────────────────────

/** Extract the 0x address from a `did:ethr:<chain>:0x…` DID. */
export function addressFromDid(did: string | null | undefined): string | null {
  if (!did) return null;
  const m = did.match(/0x[a-fA-F0-9]{40}/);
  return m ? m[0] : null;
}

/** Credential payload stored on a verification row (nullable). */
export function credentialPayload(record: IntelligenceRecord): Record<string, any> {
  return (record.shared_credential_data ?? {}) as Record<string, any>;
}

/** SHA-256 credential hash from the shared payload, if the holder sent one. */
export function credentialHashOf(record: IntelligenceRecord): string | null {
  const payload = credentialPayload(record);
  const raw = payload.credentialHash ?? payload.credential_hash ?? null;
  return typeof raw === "string" && raw.length >= 16 ? raw : null;
}

/** Issuer DID (string or `{ id }` object) from the shared payload. */
export function issuerOf(record: IntelligenceRecord): string | null {
  const payload = credentialPayload(record);
  const iss = payload.issuer;
  if (typeof iss === "string") return iss;
  if (iss && typeof iss === "object" && typeof (iss as any).id === "string") return (iss as any).id;
  return null;
}

export function issuanceDateOf(record: IntelligenceRecord): string | null {
  const payload = credentialPayload(record);
  const raw = payload.issuanceDate ?? payload.issuance_date ?? null;
  if (typeof raw !== "string") return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export function expirationDateOf(record: IntelligenceRecord): string | null {
  const payload = credentialPayload(record);
  const raw = payload.expirationDate ?? payload.expiration_date ?? null;
  if (typeof raw !== "string") return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Days since issuance (undefined when the payload carries no issuance date). */
export function credentialAgeDays(record: IntelligenceRecord): number | undefined {
  const issued = issuanceDateOf(record);
  if (!issued) return undefined;
  return Math.max(0, (Date.now() - Date.parse(issued)) / 86_400_000);
}

export function isAccepted(record: IntelligenceRecord): boolean {
  return ACCEPTED.has(record.status);
}

export function isRejected(record: IntelligenceRecord): boolean {
  return REJECTED.has(record.status);
}

// ── Trust score ──────────────────────────────────────────────────────────────

export interface TrustExtras {
  /** On-chain anchor confirmed by a live registry read. */
  anchoredOnChain?: boolean;
  /** Holder holds a deployed ERC-4337 smart account. */
  hasSmartWallet?: boolean;
  /** Biometric proof anchored on-chain and inside its window. */
  biometricBound?: boolean;
  /** ZKP was verified for this presentation (client-side or on-chain). */
  zkProofVerified?: boolean;
  /** Historical pass rate of the same holder, 0-1. */
  verificationSuccessRate?: number;
  /** Issuer reputation, 0-100. */
  issuerReputation?: number;
  /** Wallet signature was cryptographically valid. */
  signatureValid?: boolean;
  /** A stored digest was available to compare against. */
  hashChecked?: boolean;
  /** Result of that comparison. */
  hashValid?: boolean;
  /** The chain was successfully interrogated for this record. */
  onChainChecked?: boolean;
}

/** Build the 10-factor input set for `computeTrustScore` from a record. */
export function recordToTrustFactors(
  record: IntelligenceRecord,
  extras: TrustExtras = {}
): TrustFactors {
  const payload = credentialPayload(record);
  const signature = payload?.proof?.proofValue ?? payload?.proof;
  const signatureValid =
    extras.signatureValid ??
    (typeof signature === "string"
      ? /^0x[0-9a-fA-F]{130}$/.test(signature) && signature !== "unsigned" && signature !== "signature-declined"
      : false);

  const expired = expirationDateOf(record)
    ? Date.parse(expirationDateOf(record)!) < Date.now()
    : false;

  return {
    signatureValid,
    anchoredOnChain: extras.anchoredOnChain ?? !!payload?.blockchainAnchor,
    notRevoked: !isRejected(record),
    notExpired: !expired,
    // Only use a reputation when the caller actually supplies one. This
    // previously defaulted to a hardcoded 75, which meant every issuer without
    // reputation history looked established to the engine.
    issuerReputation: extras.issuerReputation ?? null,
    verificationSuccessRate: extras.verificationSuccessRate ?? null,
    zkProofVerified: extras.zkProofVerified ?? !!record.zkp_proof_valid,
    credentialAgeDays: credentialAgeDays(record),
    hasSmartWallet: extras.hasSmartWallet,
    biometricBound: extras.biometricBound ?? !!record.biometric_verified,
    hashChecked: extras.hashChecked ?? false,
    hashValid: extras.hashValid ?? false,
    onChainChecked: extras.onChainChecked ?? !!payload?.blockchainAnchor,
    issuedAt: payload?.issuanceDate ?? null,
    expiresAt: expirationDateOf(record) ?? null,
  };
}

/**
 * Trust score for one record. Uses the persisted `trust_score` when the row
 * already carries one (so history and analytics agree with the audit trail).
 */
export function computeRecordTrust(
  record: IntelligenceRecord,
  extras: TrustExtras = {}
): TrustScoreResult {
  // Prefer the engine's own analysis when the row carries one: it is the same
  // computation the verifier saw live, and it brings its factor breakdown with
  // it so the radar and the ledger agree.
  const analysis = normalizeAiAnalysis(record.ai_analysis);
  if (analysis && !analysis.legacy && analysis.dimensions.length > 0) {
    return analysisToTrustScore(analysis);
  }

  if (typeof record.trust_score === "number" && record.trust_tier) {
    return {
      score: record.trust_score,
      rawScore: record.trust_score,
      tier: record.trust_tier,
      factors: [],
      hardCaps: [],
      confidence: aiConfidencePercent(record.ai_analysis) ?? 0,
      confidenceFactors: [],
      riskLevel: "medium",
      dimensions: [],
      criticalFailures: [],
      computedAt: record.created_at,
    };
  }
  return computeTrustScore(recordToTrustFactors(record, extras));
}

// ── Anomaly engine ───────────────────────────────────────────────────────────

/** Convert verification rows into anomaly-engine events (newest last). */
export function recordsToAnomalyEvents(records: IntelligenceRecord[]): AnomalyEvent[] {
  return records
    .map((r) => {
      const payload = credentialPayload(r);
      const lat = typeof payload.latitude === "number" ? payload.latitude : undefined;
      const lon = typeof payload.longitude === "number" ? payload.longitude : undefined;
      const responded = r.responded_at ?? r.verified_at;
      const latencyMs =
        responded && Number.isFinite(Date.parse(responded))
          ? Math.max(0, Date.parse(responded) - Date.parse(r.created_at))
          : undefined;
      return {
        timestamp: r.created_at,
        success: isAccepted(r),
        ...(latencyMs !== undefined ? { latencyMs } : {}),
        ...(lat !== undefined ? { latitude: lat } : {}),
        ...(lon !== undefined ? { longitude: lon } : {}),
      } satisfies AnomalyEvent;
    })
    .filter((e) => Number.isFinite(Date.parse(e.timestamp)))
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

/** Run all 5 detectors across a set of records. */
export function analyzeRecords(records: IntelligenceRecord[]): AnomalyReport {
  return analyzeAnomalies(recordsToAnomalyEvents(records));
}

/** Run the anomaly engine scoped to a single holder (impossible-travel focus). */
export function analyzeHolderRecords(records: IntelligenceRecord[]): AnomalyReport {
  return analyzeAnomalies(recordsToAnomalyEvents(records).slice(-30));
}

// ── Traffic-light risk ───────────────────────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high";

export function riskLevel(risk: number | null | undefined): RiskLevel {
  if (typeof risk !== "number" || !Number.isFinite(risk)) return "low";
  if (risk >= 70) return "high";
  if (risk >= 40) return "medium";
  return "low";
}

export const RISK_LEVEL_CLASS: Record<RiskLevel, string> = {
  low: "bg-emerald-500",
  medium: "bg-amber-500",
  high: "bg-destructive",
};

export const RISK_LEVEL_LABEL: Record<RiskLevel, string> = {
  low: "Normal",
  medium: "Elevated",
  high: "High Risk",
};

// ── Aggregations for the dashboard / analytics ───────────────────────────────

export interface IssuerLeaderboardRow {
  issuer: string;
  total: number;
  accepted: number;
  acceptanceRate: number;
  avgAiConfidence: number;
  zkpAdoption: number;
  revokeRate: number;
  avgTrustScore: number;
}

/** Top issuers by volume with trust / ZKP adoption / rejection rates. */
export function buildIssuerLeaderboard(
  records: IntelligenceRecord[],
  limit = 5
): IssuerLeaderboardRow[] {
  const buckets = new Map<string, IntelligenceRecord[]>();
  for (const r of records) {
    const issuer = issuerOf(r) ?? "unknown";
    const list = buckets.get(issuer) ?? [];
    list.push(r);
    buckets.set(issuer, list);
  }

  return Array.from(buckets.entries())
    .map(([issuer, rows]) => {
      const accepted = rows.filter(isAccepted).length;
      const zkp = rows.filter((r) => !!r.zkp_proof_valid).length;
      // Normalised, not raw. `ai_analysis.confidence` was historically written
      // on two different scales (0-1 by the holder auto-verify path, 0-100 by
      // the verifier path) into the same column, so averaging the raw field
      // silently dragged every holder verification towards zero.
      const confidences = rows
        .map((r) => aiConfidencePercent(r.ai_analysis))
        .filter((c): c is number => typeof c === "number");
      const trustScores = rows
        .map((r) => computeRecordTrust(r).score)
        .filter((s) => typeof s === "number");
      return {
        issuer,
        total: rows.length,
        accepted,
        acceptanceRate: rows.length ? Math.round((accepted / rows.length) * 100) : 0,
        avgAiConfidence: confidences.length
          ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
          : 0,
        zkpAdoption: rows.length ? Math.round((zkp / rows.length) * 100) : 0,
        revokeRate: rows.length ? Math.round(((rows.length - accepted) / rows.length) * 100) : 0,
        avgTrustScore: trustScores.length
          ? Math.round(trustScores.reduce((a, b) => a + b, 0) / trustScores.length)
          : 0,
      } satisfies IssuerLeaderboardRow;
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export interface CircuitBreakdownRow {
  name: string;
  value: number;
}

/** Circuit usage across verifications, with an explicit "no ZKP" bucket. */
export function buildCircuitBreakdown(records: IntelligenceRecord[]): CircuitBreakdownRow[] {
  const counts = new Map<string, number>();
  const bump = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1);
  for (const r of records) {
    bump(r.zkp_circuit ? String(r.zkp_circuit) : "none");
  }
  return Array.from(counts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

/** Trust-score distribution in 10-point buckets. */
export function buildTrustHistogram(
  records: IntelligenceRecord[],
  bucketSize = 10
): { bucket: string; count: number }[] {
  const buckets = new Array(Math.ceil(100 / bucketSize)).fill(0).map((_, i) => ({
    bucket: `${i * bucketSize}-${i * bucketSize + bucketSize - 1}`,
    count: 0,
  }));
  for (const r of records) {
    const score = typeof r.trust_score === "number" ? r.trust_score : computeRecordTrust(r).score;
    const idx = Math.min(buckets.length - 1, Math.max(0, Math.floor(score / bucketSize)));
    buckets[idx].count += 1;
  }
  return buckets;
}

/** Holders ranked by average trust score across their accepted verifications. */
export function buildHolderRanking(
  records: IntelligenceRecord[],
  limit = 5
): { holder: string; verifications: number; avgTrust: number; tier: TrustTier }[] {
  const buckets = new Map<string, IntelligenceRecord[]>();
  for (const r of records) {
    const holder = r.holder_did ?? "unknown";
    const list = buckets.get(holder) ?? [];
    list.push(r);
    buckets.set(holder, list);
  }
  return Array.from(buckets.entries())
    .map(([holder, rows]) => {
      const scores = rows.map((r) => computeRecordTrust(r).score);
      const avgTrust = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      return { holder, verifications: rows.length, avgTrust, tier: scoreToTier(avgTrust) };
    })
    .filter((r) => r.avgTrust > 0)
    .sort((a, b) => b.avgTrust - a.avgTrust)
    .slice(0, limit);
}

/**
 * Holders most worth a human look: rejected presentations first, then low
 * average trust. This is a *triage* ordering, not a risk score — it does not
 * estimate the likelihood of misconduct, and it is not used to auto-block.
 */
export function buildHolderWatchlist(
  records: IntelligenceRecord[],
  limit = 6
): { holder: string; total: number; accepted: number; rejected: number; avgTrust: number; tier: TrustTier }[] {
  const buckets = new Map<string, IntelligenceRecord[]>();
  for (const r of records) {
    const holder = r.holder_did ?? "unknown";
    const list = buckets.get(holder) ?? [];
    list.push(r);
    buckets.set(holder, list);
  }
  return Array.from(buckets.entries())
    .map(([holder, rows]) => {
      const accepted = rows.filter(isAccepted).length;
      const scores = rows.map((r) => computeRecordTrust(r).score);
      const avgTrust = scores.length
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 0;
      return {
        holder,
        total: rows.length,
        accepted,
        rejected: rows.length - accepted,
        avgTrust,
        tier: scoreToTier(avgTrust),
      };
    })
    // Holders with a clean record are not "watchlist" material; keep only rows
    // that have something to explain, then order rejections before low trust.
    .filter((r) => r.rejected > 0)
    .sort((a, b) => b.rejected - a.rejected || a.avgTrust - b.avgTrust)
    .slice(0, limit);
}

/** ZKP adoption (% of presentations using a ZKP) per day, last 30 days. */
export function buildZkpAdoptionTrend(
  records: IntelligenceRecord[],
  days = 30
): { day: string; zkp: number; raw: number }[] {
  const buckets = new Map<string, { zkp: number; raw: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    buckets.set(d.toDateString(), { zkp: 0, raw: 0 });
  }
  for (const r of records) {
    const key = new Date(r.created_at).toDateString();
    const b = buckets.get(key);
    if (!b) continue;
    if (r.zkp_proof_valid) b.zkp += 1;
    else b.raw += 1;
  }
  return Array.from(buckets.entries()).map(([key, v]) => ({
    day: new Date(key).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    ...v,
  }));
}

/** Anomaly detector hits bucketed by weekday × hour (7 × 24 grid). */
export function buildDetectorHeatmap(
  records: IntelligenceRecord[]
): { day: string; hour: number; count: number }[] {
  const cells = new Map<string, number>();
  for (const r of records) {
    const d = new Date(r.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getDay()}-${d.getHours()}`;
    cells.set(key, (cells.get(key) ?? 0) + 1);
  }
  const out: { day: string; hour: number; count: number }[] = [];
  for (const [key, count] of cells) {
    const [day, hour] = key.split("-").map(Number);
    out.push({ day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day], hour, count });
  }
  return out;
}

/** Verifications invalidated by a later rejection/revocation of the same holder. */
export function buildRevocationImpact(
  records: IntelligenceRecord[]
): { bucket: string; invalidated: number; valid: number }[] {
  const byHolder = new Map<string, IntelligenceRecord[]>();
  for (const r of records) {
    const holder = r.holder_did ?? "unknown";
    byHolder.set(holder, [...(byHolder.get(holder) ?? []), r]);
  }

  const buckets = new Map<string, { invalidated: number; valid: number }>();
  for (const rows of byHolder.values()) {
    // A holder with any rejection has a tainted history: earlier "accepted"
    // presentations from them are retroactively suspect.
    const tainted = rows.some(isRejected);
    for (const r of rows) {
      const month = new Date(r.created_at).toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
      });
      const b = buckets.get(month) ?? { invalidated: 0, valid: 0 };
      if (isAccepted(r) && !tainted) b.valid += 1;
      else b.invalidated += 1;
      buckets.set(month, b);
    }
  }
  return Array.from(buckets.entries())
    .map(([bucket, v]) => ({ bucket, ...v }))
    .sort((a, b) => monthIndex(a.bucket) - monthIndex(b.bucket));
}

/** "Aug 25" → sortable month index. Returns 0 for unparseable labels. */
function monthIndex(label: string): number {
  const t = Date.parse(`${label} 1`);
  return Number.isFinite(t) ? t : 0;
}

// ── Policy evidence ──────────────────────────────────────────────────────────

export interface OnChainExtras {
  /** SBT badge minted and active for this credential hash. */
  sbtBadge?: boolean;
  /** Holder controls a deployed ERC-4337 smart account. */
  smartWallet?: boolean;
  /** Biometric proof anchored on-chain and inside its validity window. */
  biometricVerified?: boolean;
}

/**
 * Assemble the evidence a policy needs from a record plus fresh on-chain
 * cross-check results.
 */
export function evidenceFromRecord(
  record: IntelligenceRecord,
  extras: OnChainExtras = {}
): VerificationEvidence {
  const payload = credentialPayload(record);
  const trust = computeRecordTrust(record, {
    biometricBound: extras.biometricVerified,
    hasSmartWallet: extras.smartWallet,
  });
  return {
    credentialType: credentialTypeOf(record),
    zkpCircuit: (record.zkp_circuit as CircuitName | null) ?? null,
    zkpProofValid: record.zkp_proof_valid ?? null,
    anchoredOnChain: !!payload?.blockchainAnchor,
    sbtBadge: extras.sbtBadge ?? null,
    biometricVerified: extras.biometricVerified ?? record.biometric_verified ?? null,
    smartWallet: extras.smartWallet ?? null,
    trustTier: trust.tier,
    trustScore: trust.score,
    credentialAgeDays: credentialAgeDays(record) ?? null,
  };
}

/** Evaluate a policy against one record plus on-chain cross-check results. */
export function evaluatePolicyForRecord(
  policy: VerificationPolicy,
  record: IntelligenceRecord,
  extras: OnChainExtras = {}
) {
  return evaluatePolicy(
    normalizePolicy(policy),
    evidenceFromRecord(record, extras),
    credentialTypeOf(record) ?? record.id
  );
}

// ── Geo helpers (Threat Intelligence Center) ──────────────────────────────────

export interface GeoHop {
  from: { lat: number; lon: number; at: string };
  to: { lat: number; lon: number; at: string };
  distanceKm: number;
  hours: number;
  speedKmh: number;
}

/** Consecutive located events with their implied travel speed. */
export function buildGeoHops(records: IntelligenceRecord[]): GeoHop[] {
  const located = records
    .map((r) => {
      const p = credentialPayload(r);
      return typeof p.latitude === "number" && typeof p.longitude === "number"
        ? { lat: p.latitude, lon: p.longitude, at: r.created_at }
        : null;
    })
    .filter((v): v is { lat: number; lon: number; at: string } => v !== null)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  const hops: GeoHop[] = [];
  for (let i = 1; i < located.length; i++) {
    const from = located[i - 1];
    const to = located[i];
    const hours = (Date.parse(to.at) - Date.parse(from.at)) / 3_600_000;
    const distanceKm = haversineKm(from.lat, from.lon, to.lat, to.lon);
    hops.push({ from, to, distanceKm, hours, speedKmh: hours > 0 ? distanceKm / hours : 0 });
  }
  return hops;
}
