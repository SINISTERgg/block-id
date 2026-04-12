/**
 * BlockID — Client-side AI Service
 * ───────────────────────────────────
 * Processes AI analysis results from the edge function and
 * provides an entirely in-browser Q&A assistant.
 * No external API calls — all logic is deterministic and based
 * on the structured AIAnalysisResult.
 */

// ─── Types (mirrors ai-engine.ts on the server) ───────────────────────────────

export interface DimensionScore {
  name: string;
  key: string;
  score: number;
  weight: number;
  status: "pass" | "warn" | "fail" | "unknown";
  detail: string;
}

export interface AIAnalysisResult {
  score: number;
  risk_level: "low" | "medium" | "high";
  confidence: number;
  findings: string[];
  recommendations: string[];
  dimensions: DimensionScore[];
  analyzed_at: string;
  engine: "heuristic-v1" | "gemini-enhanced-v1";
}

export interface VerificationContext {
  ai_analysis: AIAnalysisResult;
  valid: boolean;
  hash_integrity: boolean;
  not_revoked: boolean;
  not_expired: boolean;
  blockchain_verified: boolean;
  expires_at: string | null;
  blockchain_anchor: string | null;
  signature?: { signed: boolean; type: string; signer?: string };
}

// ─── Chat Q&A Engine ──────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

type QARule = {
  patterns: RegExp[];
  respond: (ctx: VerificationContext) => string;
};

const QA_RULES: QARule[] = [
  {
    patterns: [/valid/i, /genuine/i, /authentic/i, /trusted/i, /real/i],
    respond: (ctx) => ctx.valid
      ? `✅ Yes — this credential passed all verification checks with an AI confidence score of **${ctx.ai_analysis.confidence}%** and a risk rating of **${ctx.ai_analysis.risk_level}**. The hash is intact, it's not revoked, and it's anchored on the blockchain.`
      : `❌ No — this credential did **not** pass all checks. ${ctx.ai_analysis.risk_level === "high" ? "The risk level is HIGH." : "There are issues that need review."} Score: ${ctx.ai_analysis.score}/100.`,
  },
  {
    patterns: [/risk/i, /danger/i, /safe/i, /concern/i],
    respond: (ctx) => {
      const lvl = ctx.ai_analysis.risk_level;
      const color = lvl === "low" ? "🟢" : lvl === "medium" ? "🟡" : "🔴";
      return `${color} The overall risk level is **${lvl.toUpperCase()}** (score: ${ctx.ai_analysis.score}/100). ${
        lvl === "low" ? "The credential appears trustworthy across all dimensions." :
        lvl === "medium" ? "There are some concerns worth reviewing before fully trusting this credential." :
        "There are significant issues. Do not rely on this credential without further investigation."
      }`;
    },
  },
  {
    patterns: [/blockchain/i, /chain/i, /anchor/i, /on.?chain/i, /polygon/i],
    respond: (ctx) => ctx.blockchain_verified
      ? `⛓ The credential is **anchored on the Ethereum Sepolia testnet** via the CredentialRegistry smart contract. The anchor hash is: \`${ctx.blockchain_anchor || "confirmed"}\`.`
      : ctx.blockchain_anchor
        ? `⚠️ A blockchain anchor transaction exists (\`${ctx.blockchain_anchor}\`) but **could not be verified** on the contract. This may be an RPC connectivity issue.`
        : `❌ This credential has **no blockchain anchor**. It is not recorded on-chain, which reduces its trustworthiness.`,
  },
  {
    patterns: [/hash/i, /tamper/i, /modif/i, /corrupt/i, /integrity/i],
    respond: (ctx) => ctx.hash_integrity
      ? `🔒 The SHA-256 hash is **valid**. The credential data has not been tampered with or modified since it was issued.`
      : `⚠️ **HASH MISMATCH**: The credential's stored hash does not match the computed hash of its data. This could indicate tampering or data corruption. Do not trust this credential.`,
  },
  {
    patterns: [/revok/i, /cancel/i, /withdraw/i],
    respond: (ctx) => ctx.not_revoked
      ? `✅ The credential has **not been revoked**. It is currently active in the issuer's database.`
      : `❌ This credential has been **revoked** by the issuer. It is no longer valid for any purpose.`,
  },
  {
    patterns: [/expir/i, /valid until/i, /expiry/i, /expire/i],
    respond: (ctx) => {
      if (!ctx.expires_at) return `📅 This credential has **no expiration date** — it does not expire.`;
      const d = new Date(ctx.expires_at);
      const days = Math.floor((d.getTime() - Date.now()) / 86_400_000);
      return days < 0
        ? `⏰ This credential **expired ${Math.abs(days)} day(s) ago** on ${d.toLocaleDateString()}.`
        : days < 30
          ? `⚠️ This credential **expires in ${days} day(s)** (${d.toLocaleDateString()}). Consider renewing soon.`
          : `✅ This credential is valid until **${d.toLocaleDateString()}** (${days} days remaining).`;
    },
  },
  {
    patterns: [/sign/i, /wallet/i, /proof/i, /cryptograph/i, /signature/i],
    respond: (ctx) => {
      const sig = ctx.signature;
      if (!sig) return `ℹ️ No signature information is available for this credential.`;
      return sig.signed
        ? `🔐 This credential carries a **real cryptographic wallet signature** (${sig.type}). Signer: \`${sig.signer || "confirmed"}\`.`
        : `⚠️ No real wallet signature found. The credential uses a **simulated proof** (${sig.type}), which is less secure.`;
    },
  },
  {
    patterns: [/score/i, /confidence/i, /rating/i, /assess/i, /percent/i],
    respond: (ctx) => `📊 AI Score: **${ctx.ai_analysis.score}/100** | Confidence: **${ctx.ai_analysis.confidence}%** | Engine: **${ctx.ai_analysis.engine}** | Risk: **${ctx.ai_analysis.risk_level}**.`,
  },
  {
    patterns: [/dimension/i, /breakdown/i, /detail/i, /aspect/i, /categor/i],
    respond: (ctx) => {
      const lines = ctx.ai_analysis.dimensions
        .sort((a, b) => a.score - b.score)
        .map(d => `• **${d.name}**: ${d.score}/100 (${d.status})`);
      return `**Dimension Breakdown:**\n${lines.join("\n")}`;
    },
  },
  {
    patterns: [/recommend/i, /should i/i, /action/i, /what (should|can|do)/i, /advise/i, /suggest/i],
    respond: (ctx) => {
      const recs = ctx.ai_analysis.recommendations;
      return `**Recommendations:**\n${recs.map(r => `• ${r}`).join("\n")}`;
    },
  },
  {
    patterns: [/finding/i, /issue/i, /problem/i, /wrong/i, /fail/i, /warn/i],
    respond: (ctx) => {
      const issues = ctx.ai_analysis.findings.filter(f => f.includes("❌") || f.includes("⚠️"));
      return issues.length === 0
        ? `✅ No issues or warnings found. All dimensions passed.`
        : `**Issues & Warnings:**\n${issues.join("\n")}`;
    },
  },
  {
    patterns: [/engine/i, /ai model/i, /gemini/i, /how.*work/i, /algorithm/i],
    respond: (ctx) => `🤖 This analysis used the **BlockID ${ctx.ai_analysis.engine === "gemini-enhanced-v1" ? "Gemini-Enhanced" : "Heuristic"} AI Engine** (v1). ${
      ctx.ai_analysis.engine === "gemini-enhanced-v1"
        ? "The base heuristic analysis was enhanced with Gemini's reasoning for deeper insights."
        : "It runs a deterministic 8-dimension weighted scoring system — no external APIs needed."
    }`,
  },
  {
    patterns: [/hello/i, /hi/i, /hey/i, /help/i, /what can you/i],
    respond: () => `👋 I'm the **BlockID Credential AI Assistant**. I can help you understand this verification result. Ask me about:\n• Validity & risk level\n• Blockchain anchoring\n• Hash integrity & tampering\n• Expiration & revocation\n• Cryptographic signatures\n• Dimension scores & recommendations`,
  },
];

/**
 * Process a user question against a verification context.
 * Returns a plain-text (markdown) answer. No API calls — fully in-browser.
 */
export function chatWithAI(question: string, ctx: VerificationContext): string {
  for (const rule of QA_RULES) {
    if (rule.patterns.some(p => p.test(question))) {
      return rule.respond(ctx);
    }
  }
  // Fallback: general summary
  return `I'm not sure how to answer that specifically, but here's a summary: This credential has a risk score of **${ctx.ai_analysis.score}/100** (${ctx.ai_analysis.risk_level} risk). ${
    ctx.valid ? "It passed all verification checks." : "It did NOT pass all verification checks."
  } Try asking about blockchain anchoring, hash integrity, expiration, or the AI score!`;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

export function getRiskColor(risk_level: "low" | "medium" | "high"): string {
  switch (risk_level) {
    case "low": return "text-emerald-500";
    case "medium": return "text-amber-500";
    case "high": return "text-red-500";
  }
}

export function getRiskBg(risk_level: "low" | "medium" | "high"): string {
  switch (risk_level) {
    case "low": return "bg-emerald-500/10 border-emerald-500/20";
    case "medium": return "bg-amber-500/10 border-amber-500/20";
    case "high": return "bg-red-500/10 border-red-500/20";
  }
}

export function getDimensionColor(score: number): string {
  if (score >= 75) return "bg-emerald-500";
  if (score >= 45) return "bg-amber-500";
  return "bg-red-500";
}

export function getStatusIcon(status: DimensionScore["status"]): string {
  switch (status) {
    case "pass": return "✅";
    case "warn": return "⚠️";
    case "fail": return "❌";
    case "unknown": return "❓";
  }
}

export function formatScore(score: number): string {
  if (score >= 75) return `${score} — Strong`;
  if (score >= 45) return `${score} — Moderate`;
  return `${score} — Weak`;
}
