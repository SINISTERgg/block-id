/**
 * BlockID — Client-side AI Service
 * ───────────────────────────────────
 * Types, presentation helpers and the offline question responder for a
 * verification result.
 *
 * The assistant has two layers:
 *   1. `askAssistant` — calls the `ai-ask` edge function, which runs a
 *      schema-constrained model grounded in the analysis.
 *   2. `chatWithAI` — the deterministic rule responder below. It runs entirely
 *      in the browser and is the fallback whenever layer 1 is unavailable,
 *      unconfigured or slow.
 *
 * Layer 2 is not decoration. `GEMINI_API_KEY` is unset by default, so in most
 * deployments this responder is the only thing answering. It is a keyword
 * matcher, and it is documented as such — the UI labels the source of each
 * answer rather than implying a model produced it.
 */

import { supabase } from "@/integrations/supabase/client";
import { normalizeAiAnalysis, type NormalizedAnalysis } from "@/lib/ml/aiAnalysis";
import {
  RISK_BANDS,
  TIER_BANDS,
  getStatusIcon as engineStatusIcon,
  type AIAnalysisResult,
  type DimensionScore,
  type LlmNarrative,
  type RiskLevel,
  type TrustTier,
} from "@/lib/ml/credentialEngine";

export type { AIAnalysisResult, DimensionScore, LlmNarrative, RiskLevel, TrustTier };
export type { NormalizedAnalysis };

// ─── Verification context ─────────────────────────────────────────────────────

export interface VerificationContext {
  ai_analysis: NormalizedAnalysis;
  valid: boolean;
  hash_integrity: boolean;
  hash_checked: boolean;
  not_revoked: boolean;
  not_expired: boolean;
  blockchain_verified: boolean;
  blockchain_checked: boolean;
  expires_at: string | null;
  blockchain_anchor: string | null;
  /** Which deterministic checks could not be completed. */
  unverified_checks?: string[];
  provisional?: boolean;
  signature?: { signed: boolean; type: string; signer?: string };
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  /** Where the answer came from, so the UI can be honest about it. */
  source?: "model" | "rules";
  /** Dimensions the answer drew on, for highlighting. */
  referencedDimensions?: string[];
  followUps?: string[];
  /** True when the model declined or the fallback could not answer. */
  degraded?: boolean;
  /** Why a model answer was not used, when `source` is "rules". */
  fallbackReason?: AskFallbackReason;
  /** Seconds until the AI budget resets, from the server's `Retry-After`. */
  retryAfterSeconds?: number;
  /** Model latency, surfaced so a slow answer is visibly a slow answer. */
  latencyMs?: number;
  model?: string;
}

// ─── Question answering ───────────────────────────────────────────────────────

type QARule = {
  patterns: RegExp[];
  respond: (ctx: VerificationContext) => string;
};

function daysRemaining(iso: string): number {
  return Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

/** The strongest single caveat, used to qualify answers in the fallback. */
function caveat(ctx: VerificationContext): string {
  const a = ctx.ai_analysis;
  if (a.confidence < 70) {
    return `\n\n_Note: confidence is ${a.confidence}% because ${a.confidence_factors.map(f => f.label.toLowerCase()).join(", ") || "some checks could not be completed"}. Treat this as provisional._`;
  }
  if (a.hard_caps_applied.length > 0) {
    return `\n\n_Note: the score is capped at ${Math.min(...a.hard_caps_applied.map(c => c.cap))}/100 by: ${a.hard_caps_applied.map(c => c.reason.toLowerCase()).join("; ")}._`;
  }
  return "";
}

const QA_RULES: QARule[] = [
  {
    patterns: [/hash/i, /tamper/i, /\bmodif/i, /corrupt/i, /integrity/i],
    respond: (ctx) => {
      const d = ctx.ai_analysis.dimensions.find(x => x.key === "hashIntegrity");
      if (!ctx.hash_checked) {
        return `❓ Hash integrity was **not checked** in this pass — there was no stored digest to compare against. ${d?.detail ?? ""}${caveat(ctx)}`;
      }
      return ctx.hash_integrity
        ? `✅ The SHA-256 hash **matches** the digest recorded at issuance. The data has not been altered since it was issued.${caveat(ctx)}`
        : `⛔ **HASH MISMATCH.** The stored data does not match the digest recorded at issuance. This credential should not be relied on, and the score is capped at 20/100 regardless of anything else.${caveat(ctx)}`;
    },
  },
  {
    patterns: [/revok/i, /cancel/i, /withdraw/i],
    respond: (ctx) => {
      const d = ctx.ai_analysis.dimensions.find(x => x.key === "revocationStatus");
      return ctx.not_revoked
        ? `✅ The credential has **not been revoked** — active in the database and clear on-chain.${caveat(ctx)}`
        : `⛔ **Revoked.** ${d?.detail ?? "The issuer has withdrawn this credential."} The score is capped at 20/100.${caveat(ctx)}`;
    },
  },
  {
    patterns: [/expir/i, /valid until/i, /expiry/i, /expire/i, /renew/i],
    respond: (ctx) => {
      if (!ctx.expires_at) {
        return `📅 This credential has **no expiration date** — it never lapses. That is a risk in itself: there is no natural point at which it should be re-checked.${caveat(ctx)}`;
      }
      const d = new Date(ctx.expires_at);
      const days = daysRemaining(ctx.expires_at);
      if (days < 0) return `⛔ **Expired** ${Math.abs(days)} day(s) ago on ${d.toLocaleDateString()}.${caveat(ctx)}`;
      if (days < 30) return `⚠️ **Expires in ${days} day(s)** on ${d.toLocaleDateString()} — inside the renewal window.${caveat(ctx)}`;
      return `✅ Valid until **${d.toLocaleDateString()}** (${days} days remaining).${caveat(ctx)}`;
    },
  },
  {
    patterns: [/blockchain/i, /chain/i, /anchor/i, /on.?chain/i, /polygon/i, /sepolia/i, /contract/i],
    respond: (ctx) => {
      if (!ctx.blockchain_checked) {
        return `❓ The on-chain registry **could not be reached**, so the anchor state is unconfirmed. This is an availability problem, not evidence of a missing anchor — re-run verification when RPC is available.${caveat(ctx)}`;
      }
      if (ctx.blockchain_verified) {
        return `⛓ **Anchored** in the CredentialRegistry contract on Sepolia. Anchor reference: \`${ctx.blockchain_anchor || "confirmed"}\`.${caveat(ctx)}`;
      }
      if (ctx.blockchain_anchor) {
        return `⚠️ An anchor transaction is recorded (\`${ctx.blockchain_anchor}\`) but the contract did not confirm it. It may be pending or stale.${caveat(ctx)}`;
      }
      return `⛔ The chain **was checked and holds no anchor** for this credential. Score capped at 55/100.${caveat(ctx)}`;
    },
  },
  {
    patterns: [/sign/i, /wallet/i, /proof/i, /cryptograph/i, /signature/i, /\bzkp?\b/i, /zero.?knowledge/i],
    respond: (ctx) => {
      const d = ctx.ai_analysis.dimensions.find(x => x.key === "cryptoProof");
      if (!ctx.signature) return `ℹ️ ${d?.detail ?? "No signature information is available for this credential."}${caveat(ctx)}`;
      if (ctx.signature.signed) {
        return `🔐 A wallet signature (${ctx.signature.type}) is attached, but it is **self-asserted** — it proves the holder signed something, not that the issuer authorised the claims. Signature: \`${ctx.signature.signer || "confirmed"}\`.${caveat(ctx)}`;
      }
      return `⚠️ ${d?.detail ?? "No verifiable cryptographic proof is attached."} Authenticity rests on database trust alone.${caveat(ctx)}`;
    },
  },
  {
    patterns: [/issuer/i, /who issued/i, /who.*issued/i],
    respond: (ctx) => {
      const d = ctx.ai_analysis.dimensions.find(x => x.key === "issuerTrust");
      return `🏛 ${d?.detail ?? "Issuer information is not available for this credential."}${caveat(ctx)}`;
    },
  },
  {
    patterns: [/dimension/i, /breakdown/i, /\bdetail/i, /aspect/i, /categor/i, /why.*score/i, /how.*scor/i],
    respond: (ctx) => {
      // Copy before sorting: the previous implementation sorted the shared
      // context array in place, permanently reordering the parent's state.
      const lines = [...ctx.ai_analysis.dimensions]
        .sort((a, b) => a.score - b.score)
        .map(d => `${engineStatusIcon(d.status)} **${d.name}** — ${d.score}/100 (weight ${d.weight}%, ${d.status})`);
      return `**Dimension breakdown** (weighted total, then caps):\n${lines.join("\n")}\n\nRaw score before caps: ${ctx.ai_analysis.raw_score}/100 → final **${ctx.ai_analysis.score}/100**.${caveat(ctx)}`;
    },
  },
  {
    patterns: [/recommend/i, /should i/i, /\baction/i, /what (should|can|do)/i, /advise/i, /suggest/i, /next step/i],
    respond: (ctx) => {
      const recs = ctx.ai_analysis.recommendations;
      if (recs.length === 0) return `ℹ️ No specific recommendations were generated for this credential.${caveat(ctx)}`;
      return `**Recommended next steps:**\n${recs.map(r => `• ${r}`).join("\n")}${caveat(ctx)}`;
    },
  },
  {
    patterns: [/finding/i, /issue/i, /problem/i, /\bwrong/i, /\bfail/i, /warn/i, /wrong/i],
    respond: (ctx) => {
      const issues = ctx.ai_analysis.findings.filter(f => f.includes("❌") || f.includes("⚠️") || f.includes("⛔"));
      return issues.length === 0
        ? `✅ No failures or warnings were recorded across the eight dimensions.${caveat(ctx)}`
        : `**Findings:**\n${issues.join("\n")}${caveat(ctx)}`;
    },
  },
  {
    patterns: [/confiden/i, /reliab/i, /certain/i, /sure/i, /trust.*score/i, /percent/i],
    respond: (ctx) => {
      const a = ctx.ai_analysis;
      const why = a.confidence_factors.length
        ? `\n\nConfidence is **${a.confidence}%** because: ${a.confidence_factors.map(f => `${f.label} (−${f.penalty})`).join("; ")}.`
        : `\n\nConfidence is **${a.confidence}%** — every available check completed.`;
      return `📊 **Score** ${a.score}/100 · **Risk** ${a.risk_level} · **Tier** ${a.tier} · **Confidence** ${a.confidence}%.${why}${caveat(ctx)}`;
    },
  },
  {
    patterns: [/risk/i, /danger/i, /\bsafe\b/i, /concern/i, /trustworthy/i],
    respond: (ctx) => {
      const lvl = ctx.ai_analysis.risk_level;
      const icon = lvl === "low" ? "🟢" : lvl === "medium" ? "🟡" : "🔴";
      const verdict =
        lvl === "low" ? "The signal mix is positive across the board."
        : lvl === "medium" ? "There are issues worth resolving before you rely on this."
        : "There are serious problems. Do not rely on this credential.";
      return `${icon} Risk level **${lvl.toUpperCase()}** (score ${ctx.ai_analysis.score}/100, tier ${ctx.ai_analysis.tier}). ${verdict}${caveat(ctx)}`;
    },
  },
  {
    patterns: [/valid/i, /genuine/i, /authentic/i, /\breal\b/i, /verified/i, /good credential/i, /should i accept/i],
    respond: (ctx) => {
      const a = ctx.ai_analysis;
      const checks = [
        ctx.hash_checked ? (ctx.hash_integrity ? "hash intact" : "**hash mismatch**") : "hash not checked",
        ctx.not_revoked ? "not revoked" : "**revoked**",
        ctx.not_expired ? "in date" : "**expired**",
        ctx.blockchain_checked ? (ctx.blockchain_verified ? "anchored" : "**not anchored**") : "anchor unconfirmed",
      ];
      return `${ctx.valid ? "✅" : "⛔"} This credential **${ctx.valid ? "passed" : "did not pass"}** the checks: ${checks.join(", ")}. Score ${a.score}/100, risk ${a.risk_level}, confidence ${a.confidence}%.${caveat(ctx)}`;
    },
  },
  {
    patterns: [/engine/i, /ai model/i, /gemini/i, /how.*work/i, /algorithm/i, /who.*you/i, /what are you/i],
    respond: (ctx) => {
      const llm = ctx.ai_analysis.llm;
      if (llm && !llm.degraded) {
        return `🤖 Deterministic engine \`${ctx.ai_analysis.engine.split("+")[0]}\`, with narrative from \`${llm.model}\` in ${llm.latency_ms}ms. The score is computed entirely by the deterministic engine — the language model only writes the prose and cannot change a number.`;
      }
      return `🤖 This analysis used the deterministic engine \`${ctx.ai_analysis.engine}\` alone: eight weighted dimensions plus hard-fail caps, no external API.${llm ? " A language-model narrative was requested but did not complete, so this is the purely deterministic result." : ""}`;
    },
  },
  {
    patterns: [/^(hi|hey|hello|yo)\b/i, /\bhelp\b/i, /what can you/i],
    respond: () => `👋 I can explain this verification result. Try asking about:\n• Validity and what it depends on\n• Risk level and score breakdown\n• Hash integrity and tampering\n• Revocation and expiry\n• Blockchain anchoring\n• Signature and zero-knowledge proof\n• Recommendations and next steps\n\n_Answers here come from deterministic rules. If a language model is configured, my answers will say so._`,
  },
];

/**
 * Offline question responder. First matching rule wins, so more specific
 * patterns must come first.
 *
 * Does not mutate `ctx` — the previous implementation sorted
 * `ctx.ai_analysis.dimensions` in place, which permanently reordered the shared
 * object every other component was rendering from.
 */
export function chatWithAI(question: string, ctx: VerificationContext): string {
  for (const rule of QA_RULES) {
    if (rule.patterns.some(p => p.test(question))) {
      return rule.respond(ctx);
    }
  }
  const a = ctx.ai_analysis;
  return `I don't have a specific answer for that. Here's the summary: this credential scores **${a.score}/100** (${a.risk_level} risk, ${a.tier} tier, ${a.confidence}% confidence). ${ctx.valid ? "It passed the checks that were run." : "It did not pass the checks that were run."} Try asking about hash integrity, revocation, the blockchain anchor or the dimension breakdown.${caveat(ctx)}`;
}

// ─── LLM-backed asking ────────────────────────────────────────────────────────

/** Why a model answer was not used, when the fallback answered instead. */
export type AskFallbackReason = "rate_limited" | "unavailable" | "not_configured" | "empty";

export interface AskResult {
  answer: string;
  source: "model" | "rules";
  referencedDimensions: string[];
  followUps: string[];
  degraded: boolean;
  model?: string;
  latencyMs?: number;
  /** Set only when `source` is "rules", so the UI can say why. */
  fallbackReason?: AskFallbackReason;
  /** Seconds to wait before retrying, from the server's `Retry-After`. */
  retryAfterSeconds?: number;
}

const ASK_TIMEOUT_MS = 18_000;

/**
 * Pull `Retry-After` off an error's response headers.
 *
 * Typed defensively: depending on the transport, `context.headers` is either a
 * real `Headers` instance or a plain object of strings, and guessing wrong
 * throws inside an error handler.
 */
function readRetryAfter(headers: unknown): number | null {
  if (!headers) return null;
  const raw =
    typeof (headers as Headers).get === "function"
      ? (headers as Headers).get("retry-after")
      : (headers as Record<string, string>)["retry-after"] ??
        (headers as Record<string, string>)["Retry-After"];
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Ask the assistant a question.
 *
 * Tries the `ai-ask` edge function first and falls back to `chatWithAI` on any
 * failure, so the assistant always answers. The returned `source` tells the
 * caller which path produced the text.
 */
export async function askAssistant(
  question: string,
  ctx: VerificationContext,
  history: ChatMessage[] = [],
): Promise<AskResult> {
  const trimmed = question.trim();
  if (!trimmed) {
    return {
      answer: "Ask a question about this credential.",
      source: "rules",
      referencedDimensions: [],
      followUps: [],
      degraded: false,
      fallbackReason: "empty",
    };
  }

  // Credential context for grounding. Deliberately narrow: the model does not
  // need the whole credential body to explain a verification result, and every
  // field sent is a field the holder controls.
  const context = {
    credential_type: ctx.ai_analysis.dimensions.find(d => d.key === "dataQuality")?.detail ?? null,
    expires_at: ctx.expires_at,
    blockchain_anchor: ctx.blockchain_anchor,
    signature: ctx.signature ?? null,
  };

  let fallbackReason: AskFallbackReason = "unavailable";
  let retryAfterSeconds: number | undefined;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ASK_TIMEOUT_MS);

    const { data, error } = await supabase.functions.invoke("ai-ask", {
      body: {
        question: trimmed,
        analysis: {
          schema_version: ctx.ai_analysis.schema_version,
          engine: ctx.ai_analysis.engine,
          score: ctx.ai_analysis.score,
          raw_score: ctx.ai_analysis.raw_score,
          risk_level: ctx.ai_analysis.risk_level,
          tier: ctx.ai_analysis.tier,
          confidence: ctx.ai_analysis.confidence,
          confidence_factors: ctx.ai_analysis.confidence_factors,
          hard_caps_applied: ctx.ai_analysis.hard_caps_applied,
          findings: ctx.ai_analysis.findings,
          recommendations: ctx.ai_analysis.recommendations,
          dimensions: ctx.ai_analysis.dimensions.map(d => ({ key: d.key, name: d.name, score: d.score, status: d.status, detail: d.detail })),
          valid: ctx.valid,
          hash_checked: ctx.hash_checked,
          hash_integrity: ctx.hash_integrity,
          not_revoked: ctx.not_revoked,
          not_expired: ctx.not_expired,
          blockchain_checked: ctx.blockchain_checked,
          blockchain_verified: ctx.blockchain_verified,
          unverified_checks: ctx.unverified_checks ?? [],
        },
        context,
        history: history.slice(-10).map(m => ({ role: m.role, content: m.content })),
      },
    });

    clearTimeout(timer);

    if (error) throw new Error(error.message);

    const payload = (data ?? {}) as {
      available?: boolean;
      reason?: string;
      answer?: string;
      referenced_dimensions?: string[];
      follow_ups?: string[];
      refused?: boolean;
      model?: string;
      latency_ms?: number;
    };

    if (payload.available && typeof payload.answer === "string" && payload.answer.trim()) {
      return {
        answer: payload.answer.trim(),
        source: "model",
        referencedDimensions: Array.isArray(payload.referenced_dimensions) ? payload.referenced_dimensions : [],
        followUps: Array.isArray(payload.follow_ups) ? payload.follow_ups.filter(s => typeof s === "string") : [],
        degraded: false,
        model: payload.model,
        latencyMs: payload.latency_ms,
      };
    }

    // A 200 with `available: false` is the server telling us it cannot answer.
    fallbackReason = payload.reason === "ai_not_configured" ? "not_configured" : "unavailable";
  } catch (err) {
    // Expected whenever Gemini is unconfigured or offline. The rule responder
    // below is a complete answer path, not a stub.
    //
    // A spent budget is called out separately: it is a rate limit, not an
    // outage, and the user deserves to know their answers will be brief for the
    // next few seconds rather than being left to assume the model is broken.
    const context = (err as { context?: { status?: number; headers?: unknown } } | null)?.context;
    if (context?.status === 429) {
      fallbackReason = "rate_limited";
      const retryAfter = readRetryAfter(context.headers);
      retryAfterSeconds = retryAfter !== null ? retryAfter : undefined;
    } else {
      console.warn("[BlockID] AI assistant unavailable, using deterministic responder:", err);
    }
  }

  return {
    answer: chatWithAI(trimmed, ctx),
    source: "rules",
    referencedDimensions: [],
    followUps: [],
    degraded: true,
    fallbackReason,
    retryAfterSeconds,
  };
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

export function getRiskColor(risk_level: RiskLevel): string {
  switch (risk_level) {
    case "low": return "text-emerald-500";
    case "medium": return "text-amber-500";
    case "high": return "text-red-500";
  }
}

export function getRiskBg(risk_level: RiskLevel): string {
  switch (risk_level) {
    case "low": return "bg-emerald-500/10 border-emerald-500/20";
    case "medium": return "bg-amber-500/10 border-amber-500/20";
    case "high": return "bg-red-500/10 border-red-500/20";
  }
}

/** Colour bands come from the canonical engine, not a second set of numbers. */
export function getDimensionColor(score: number): string {
  if (score >= RISK_BANDS.low) return "bg-emerald-500";
  if (score >= RISK_BANDS.medium) return "bg-amber-500";
  return "bg-red-500";
}

export function getStatusIcon(status: DimensionScore["status"]): string {
  return engineStatusIcon(status);
}

export function formatScore(score: number): string {
  if (score >= TIER_BANDS.gold) return `${score} — Strong`;
  if (score >= TIER_BANDS.silver) return `${score} — Moderate`;
  return `${score} — Weak`;
}

/**
 * Render assistant markdown to HTML for the chat bubble.
 *
 * The previous implementation piped message content straight into
 * `dangerouslySetInnerHTML` with only a `**bold**` regex applied — no escaping
 * at all. That was a stored-XSS vector the moment answers came from a language
 * model, since model output is attacker-influenceable via the credential body.
 * Everything is HTML-escaped first; only the two inline marks we generate
 * ourselves are re-introduced afterwards.
 */
export function renderAssistantMarkdown(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  return escaped
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`\n]+)`/g, '<code class="bg-background/50 px-0.5 rounded font-mono">$1</code>')
    .replace(/_([^_\n]+)_/g, "<em>$1</em>")
    .replace(/\n/g, "<br/>");
}

export { normalizeAiAnalysis };
