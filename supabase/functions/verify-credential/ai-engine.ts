/**
 * BlockID Credential AI Engine (edge-function facade).
 * ───────────────────────────────────────────────
 * Thin adapter over the canonical engine in `_shared/credentialEngine.ts`.
 *
 * The scoring logic deliberately does NOT live here. It lives in one isomorphic
 * module that the browser imports too, so the verifier portal and the edge
 * function can never disagree about a credential's score. This file exists only
 * to keep the old import path (`./ai-engine.ts`) working and to run the optional
 * LLM narrative layer.
 *
 * Guarantees enforced here:
 *   • The LLM may only add prose. It cannot change score, risk_level,
 *     confidence or tier. See `withNarrative`.
 *   • A failed, slow or absent Gemini key degrades to the deterministic result
 *     with zero impact on validity.
 *   • Every path — success, timeout, fallback — is recorded in `ai_engine_calls`.
 */

import {
  analyzeCredential,
  withNarrative,
  isCredentialAcceptable,
  AI_ANALYSIS_SCHEMA_VERSION,
  type AIAnalysisResult,
  type CredentialSignals,
} from "../_shared/credentialEngine.ts";
import { narrateAnalysis } from "../_shared/aiNarrative.ts";
import { resolveModel } from "../_shared/gemini.ts";
import { recordAiCall, type AiSurface } from "../_shared/aiTelemetry.ts";

/** Re-exported so existing importers keep compiling. */
export type { AIAnalysisResult, CredentialSignals, DimensionScore } from "../_shared/credentialEngine.ts";
export { AI_ANALYSIS_SCHEMA_VERSION } from "../_shared/credentialEngine.ts";

/** The deterministic score. Never touches the network. */
export { analyzeCredential } from "../_shared/credentialEngine.ts";

export interface AnalyzeOutcome {
  analysis: AIAnalysisResult;
  llmEnabled: boolean;
  degraded: boolean;
  model: string | null;
  latencyMs: number | null;
  totalLatencyMs: number;
  attempts: number;
  promptTokens: number | null;
  candidatesTokens: number | null;
  error: string | null;
}

export interface AnalyzeWithNarrativeOptions {
  /** Omit (or pass an empty string) to run deterministically with no network call. */
  apiKey?: string | null;
  model?: string;
  timeoutMs?: number;
  surface?: AiSurface;
  userId?: string | null;
  credentialId?: string | null;
  requestId?: string | null;
  /**
   * Set when the caller deliberately suppressed the narrative, e.g. the user's
   * AI budget is spent. Recorded as the telemetry `error` so a budget-limited
   * degradation is distinguishable from a missing key — without this, capping
   * spend would be invisible in the logs and look identical to "never
   * configured".
   */
  skipLlmReason?: string;
  /** Injected for telemetry; may be null when the caller has no client. */
  telemetry?: { from: (table: string) => { insert: (values: Record<string, unknown>) => Promise<{ error: { message: string } | null }> } } | null;
}

/**
 * Run the deterministic engine, then optionally narrate the result.
 *
 * Always resolves. The LLM layer is strictly additive: even if it returns
 * something hostile, `withNarrative` confines it to the `llm` field and the
 * prose arrays, and the score is carried across verbatim.
 */
export async function analyzeWithNarrative(
  signals: CredentialSignals,
  options: AnalyzeWithNarrativeOptions = {},
): Promise<AnalyzeOutcome> {
  const startedAt = Date.now();
  const analysis = analyzeCredential(signals);

  const apiKey = options.skipLlmReason ? "" : (options.apiKey ?? "").trim();
  if (!apiKey) {
    const totalLatencyMs = Date.now() - startedAt;
    await recordAiCall(options.telemetry ?? null, {
      surface: options.surface ?? "verify-credential",
      engine: analysis.engine,
      model: null,
      llmEnabled: false,
      degraded: true,
      error: options.skipLlmReason ?? "no_api_key",
      latencyMs: null,
      totalLatencyMs,
      attempts: 0,
      promptTokens: null,
      candidatesTokens: null,
      schemaVersion: AI_ANALYSIS_SCHEMA_VERSION,
      score: analysis.score,
      riskLevel: analysis.risk_level,
      confidence: analysis.confidence,
      hardCapsCount: analysis.hard_caps_applied.length,
      userId: options.userId,
      credentialId: options.credentialId,
      requestId: options.requestId,
      metadata: {
        mode: "deterministic_only",
        // Distinguishes "the operator never configured a key" from "we chose not
        // to spend on this call", which are very different operational signals.
        reason: options.skipLlmReason ?? "no_api_key",
      },
    });
    return {
      analysis,
      llmEnabled: false,
      degraded: true,
      model: null,
      latencyMs: null,
      totalLatencyMs,
      attempts: 0,
      promptTokens: null,
      candidatesTokens: null,
      error: "no_api_key",
    };
  }

  const model = resolveModel(options.model);
  const outcome = await narrateAnalysis(analysis, signals, {
    apiKey,
    model,
    timeoutMs: options.timeoutMs,
  });

  const totalLatencyMs = Date.now() - startedAt;
  const finalAnalysis = withNarrative(analysis, outcome.narrative, { degraded: !outcome.narrative });

  await recordAiCall(options.telemetry ?? null, {
    surface: options.surface ?? "verify-credential",
    engine: finalAnalysis.engine,
    model: outcome.narrative?.model ?? model,
    llmEnabled: true,
    degraded: !outcome.narrative,
    error: outcome.error,
    latencyMs: outcome.latencyMs,
    totalLatencyMs,
    attempts: outcome.attempts,
    promptTokens: outcome.promptTokens,
    candidatesTokens: outcome.candidatesTokens,
    schemaVersion: AI_ANALYSIS_SCHEMA_VERSION,
    score: finalAnalysis.score,
    riskLevel: finalAnalysis.risk_level,
    confidence: finalAnalysis.confidence,
    hardCapsCount: finalAnalysis.hard_caps_applied.length,
    userId: options.userId,
    credentialId: options.credentialId,
    requestId: options.requestId,
    metadata: {
      llm_flags: outcome.narrative?.flags ?? [],
      findings_added: outcome.narrative?.findings.length ?? 0,
    },
  });

  return {
    analysis: finalAnalysis,
    llmEnabled: true,
    degraded: !outcome.narrative,
    model: outcome.narrative?.model ?? model,
    latencyMs: outcome.latencyMs,
    totalLatencyMs,
    attempts: outcome.attempts,
    promptTokens: outcome.promptTokens,
    candidatesTokens: outcome.candidatesTokens,
    error: outcome.error,
  };
}

export { isCredentialAcceptable };
