/**
 * `ai_analysis` normalizer.
 *
 * The `verification_requests.ai_analysis` column is JSONB and, until
 * 20260928000001, accepted three mutually incompatible shapes:
 *
 *   verify-credential      { score, risk_level, confidence: 0-100, engine, findings }
 *   ai-verify-credential   { verdict,  confidence: 0.0-1.0, summary, checks, engine }
 *   oid4vp                 { source,   confidence: 85, findings, risk_level }
 *
 * Every reader in the verifier portal assumed 0-100, so a 0.85 fraction was
 * silently averaged into a percentage mean. `normalizeAiAnalysis` maps all of
 * them onto the current schema so the dashboard, the CSV export and the
 * assistant all read the same numbers on one scale.
 *
 * The SQL migration rescales the stored rows; this function is the belt to
 * that migration's braces, and covers rows written before the migration ran
 * and any payload that reaches the client without passing through the database.
 */

import {
  AI_ANALYSIS_SCHEMA_VERSION,
  DIMENSION_WEIGHTS,
  ENGINE_ID,
  type AIAnalysisResult,
  type ConfidenceFactor,
  type DimensionScore,
  type HardCap,
  type LlmNarrative,
  type RiskLevel,
  type TrustTier,
} from "./credentialEngine";

/** Fields a normalised analysis always exposes, even for legacy rows. */
export interface NormalizedAnalysis extends AIAnalysisResult {
  /**
   * True when this row predates schema v2 and its numbers were reconstructed
   * rather than read. The UI shows a marker so a verifier is not misled into
   * treating a backfilled row as a fresh engine run.
   */
  legacy: boolean;
}

const VALID_DIMENSION_KEYS = Object.keys(DIMENSION_WEIGHTS);

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function str(value: unknown, max = 500): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function strArray(value: unknown, maxItems = 12, maxLen = 400): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.slice(0, maxLen))
    .slice(0, maxItems);
}

/**
 * Force a confidence onto the 0-100 scale.
 *
 * The v1 `ai-verify-credential` writer stored a 0-1 fraction. A value of exactly
 * 1 is genuinely ambiguous (could be 1% or 100%), so we treat it as 100% — the
 * v2 writer never emits a value that low, and under-reporting confidence is the
 * safer error here.
 */
function normalizeConfidence(raw: unknown): number {
  const n = num(raw);
  if (n === null) return 0;
  return clamp(Math.round(n <= 1 ? n * 100 : n), 0, 100);
}

function normalizeRiskLevel(raw: unknown, score: number): RiskLevel {
  if (raw === "low" || raw === "medium" || raw === "high") return raw;
  if (score >= 75) return "low";
  if (score >= 45) return "medium";
  return "high";
}

function normalizeTier(raw: unknown, score: number): TrustTier {
  if (raw === "platinum" || raw === "gold" || raw === "silver" || raw === "bronze" || raw === "untrusted") {
    return raw;
  }
  if (score >= 90) return "platinum";
  if (score >= 75) return "gold";
  if (score >= 60) return "silver";
  if (score >= 40) return "bronze";
  return "untrusted";
}

/**
 * Reconstruct a full dimension list when a row only carried a score.
 *
 * Without this, legacy rows produce a half-rendered assistant panel. The
 * synthetic dimensions are marked `unknown` and are explicitly labelled as
 * reconstructed, so they are never mistaken for checks that actually ran.
 */
function synthesizeDimensions(score: number | null): DimensionScore[] {
  const names: Record<string, string> = {
    hashIntegrity: "Hash Integrity",
    blockchainAnchor: "Blockchain Anchoring",
    revocationStatus: "Revocation Status",
    cryptoProof: "Cryptographic Proof",
    issuerTrust: "Issuer Trust",
    expiration: "Expiration",
    dataQuality: "Data Quality",
    temporalConsist: "Temporal Consistency",
  };

  return VALID_DIMENSION_KEYS.map((key) => ({
    key: key as DimensionScore["key"],
    name: names[key],
    score: 50,
    weight: DIMENSION_WEIGHTS[key as DimensionScore["key"]],
    status: "unknown" as const,
    detail: "Not recorded. This analysis predates the current engine, so per-dimension detail was not stored.",
    critical: key === "hashIntegrity" || key === "revocationStatus",
  })).map((d) => ({ ...d, score: score === null ? d.score : clamp(Math.round(score), 0, 100) }));
}

function normalizeDimensions(raw: unknown): DimensionScore[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const out: DimensionScore[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const key = VALID_DIMENSION_KEYS.includes(String(e.key)) ? (String(e.key) as DimensionScore["key"]) : null;
    if (!key) continue;

    const status =
      e.status === "pass" || e.status === "warn" || e.status === "fail" || e.status === "unknown"
        ? e.status
        : "unknown";

    out.push({
      key,
      name: str(e.name, 80) || key,
      score: clamp(Math.round(num(e.score) ?? 50), 0, 100),
      // Always use the canonical weight; a stored weight from an older engine
      // must not silently re-weight the breakdown the UI renders.
      weight: DIMENSION_WEIGHTS[key],
      status,
      detail: str(e.detail, 600) || "No detail recorded.",
      critical: typeof e.critical === "boolean" ? e.critical : key === "hashIntegrity" || key === "revocationStatus",
    });
  }
  return out.length > 0 ? out : null;
}

function normalizeHardCaps(raw: unknown): HardCap[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c) => ({
      key: str(c.key, 60),
      cap: clamp(Math.round(num(c.cap) ?? 0), 0, 100),
      reason: str(c.reason, 300),
    }))
    .filter((c) => c.key.length > 0);
}

function normalizeConfidenceFactors(raw: unknown): ConfidenceFactor[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f) => ({
      key: str(f.key, 60),
      label: str(f.label, 160),
      penalty: clamp(Math.round(num(f.penalty) ?? 0), 0, 100),
    }))
    .filter((f) => f.key.length > 0);
}

function normalizeLlm(raw: unknown): LlmNarrative | null {
  if (!raw || typeof raw !== "object") return null;
  const l = raw as Record<string, unknown>;
  return {
    model: str(l.model, 80) || "unknown",
    summary: str(l.summary, 800),
    findings: strArray(l.findings, 5, 300),
    recommendations: strArray(l.recommendations, 4, 300),
    flags: strArray(l.flags, 3, 300),
    latency_ms: clamp(Math.round(num(l.latency_ms) ?? 0), 0, 600_000),
    prompt_tokens: num(l.prompt_tokens),
    candidates_tokens: num(l.candidates_tokens),
    degraded: l.degraded !== false,
  };
}

/** Empty-but-valid analysis, used when a record has no analysis at all. */
export function emptyAnalysis(reason = "No analysis has been recorded for this verification."): NormalizedAnalysis {
  return {
    schema_version: AI_ANALYSIS_SCHEMA_VERSION,
    engine: ENGINE_ID,
    score: 0,
    raw_score: 0,
    risk_level: "high",
    confidence: 0,
    confidence_factors: [],
    tier: "untrusted",
    hard_caps_applied: [],
    findings: [reason],
    recommendations: [],
    dimensions: synthesizeDimensions(null),
    llm: null,
    analyzed_at: new Date(0).toISOString(),
    legacy: true,
  };
}

/**
 * Map any historical `ai_analysis` payload onto the current schema.
 *
 * Never throws. An unrecognisable payload yields a zeroed, explicitly-legacy
 * analysis rather than a half-populated one that could render as a real score.
 */
export function normalizeAiAnalysis(raw: unknown): NormalizedAnalysis {
  if (!raw || typeof raw !== "object") return emptyAnalysis();

  const r = raw as Record<string, unknown>;
  const schemaVersion = Math.round(num(r.schema_version) ?? 1);
  const isV2 = schemaVersion >= AI_ANALYSIS_SCHEMA_VERSION;

  const score = clamp(Math.round(num(r.score) ?? 0), 0, 100);
  const rawScore = clamp(Math.round(num(r.raw_score) ?? score), 0, 100);
  const confidence = normalizeConfidence(r.confidence);
  const riskLevel = normalizeRiskLevel(r.risk_level, score);
  const tier = normalizeTier(r.tier, score);

  const dimensions = normalizeDimensions(r.dimensions) ?? synthesizeDimensions(num(r.score) === null ? null : score);

  const findings = strArray(r.findings, 20, 600);
  const recommendations = strArray(r.recommendations, 10, 600);

  // The v1 holder writer stored its narrative under `summary` with no
  // dimension breakdown. Preserve it rather than dropping the only text there.
  if (findings.length === 0) {
    const summary = str(r.summary, 600);
    if (summary) findings.push(summary);
  }
  if (findings.length === 0 && strArray(r.checks).length === 0) {
    findings.push("This analysis predates the current engine and carries no recorded findings.");
  }

  return {
    schema_version: AI_ANALYSIS_SCHEMA_VERSION,
    engine: str(r.engine, 120) || ENGINE_ID,
    score,
    raw_score: rawScore,
    risk_level: riskLevel,
    confidence,
    confidence_factors: normalizeConfidenceFactors(r.confidence_factors),
    tier,
    hard_caps_applied: normalizeHardCaps(r.hard_caps_applied),
    findings,
    recommendations,
    dimensions,
    llm: normalizeLlm(r.llm),
    analyzed_at: str(r.analyzed_at) || str(r.evaluated_at) || new Date(0).toISOString(),
    legacy: !isV2,
  };
}

/**
 * Extract a comparable 0-100 confidence for aggregation (dashboard means,
 * trends, CSV export).
 *
 * Use this instead of reading `ai_analysis.confidence` directly. The old code
 * averaged the raw field across rows written on two different scales, which
 * pulled every holder auto-verification towards zero.
 */
export function aiConfidencePercent(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const n = num((raw as Record<string, unknown>).confidence);
  if (n === null) return null;
  return clamp(Math.round(n <= 1 ? n * 100 : n), 0, 100);
}

/** Extract a comparable 0-100 score, or null when the row never had one. */
export function aiScorePercent(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const n = num((raw as Record<string, unknown>).score);
  if (n === null) return null;
  return clamp(Math.round(n), 0, 100);
}
