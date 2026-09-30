/**
 * BlockID — AI engine telemetry.
 * ────────────────────────────────
 * Records one row per analysis into `public.ai_engine_calls`, whether or not
 * the language-model layer ran.
 *
 * The important property is that the deterministic path is logged too. If only
 * successful LLM calls were recorded, a 100% fallback rate and a 100% success
 * rate would look identical in the logs.
 *
 * Recording is best-effort: a telemetry failure must never fail a verification,
 * so every error here is swallowed after being logged to the function's own
 * output.
 */

export type AiSurface = "verify-credential" | "ai-verify-credential" | "oid4vp" | "ai-ask";

export interface AiCallRecord {
  surface: AiSurface;
  engine: string | null;
  model: string | null;
  llmEnabled: boolean;
  degraded: boolean;
  error: string | null;
  latencyMs: number | null;
  totalLatencyMs: number | null;
  attempts: number;
  promptTokens: number | null;
  candidatesTokens: number | null;
  schemaVersion: number;
  score: number | null;
  riskLevel: string | null;
  confidence: number | null;
  hardCapsCount: number;
  userId?: string | null;
  credentialId?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Minimal structural type so this module does not pull in the Supabase client. */
type InsertableClient = {
  from: (table: string) => {
    insert: (values: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  };
};

/**
 * Persist a telemetry row. Resolves to false if the write failed, so callers
 * can surface the degradation in their own logs if they care.
 */
export async function recordAiCall(
  supabase: InsertableClient | null | undefined,
  record: AiCallRecord,
): Promise<boolean> {
  if (!supabase) return false;

  try {
    const { error } = await supabase.from("ai_engine_calls").insert({
      surface: record.surface,
      engine: record.engine,
      model: record.model,
      llm_enabled: record.llmEnabled,
      degraded: record.degraded,
      error: record.error ? String(record.error).slice(0, 500) : null,
      latency_ms: record.latencyMs,
      total_latency_ms: record.totalLatencyMs,
      attempts: record.attempts,
      prompt_tokens: record.promptTokens,
      candidates_tokens: record.candidatesTokens,
      schema_version: record.schemaVersion,
      score: record.score,
      risk_level: record.riskLevel,
      confidence: record.confidence,
      hard_caps_count: record.hardCapsCount,
      user_id: record.userId ?? null,
      credential_id: record.credentialId ?? null,
      request_id: record.requestId ?? null,
      metadata: record.metadata ?? {},
    });

    if (error) {
      console.warn("[BlockID ai-telemetry] insert failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[BlockID ai-telemetry] threw:", err);
    return false;
  }
}
