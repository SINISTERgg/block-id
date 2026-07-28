import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  chatWithAI,
  getRiskColor,
  getRiskBg,
  getDimensionColor,
  getStatusIcon,
  formatScore,
  type VerificationContext,
  type AIAnalysisResult,
} from "./credential-ai.service";

function makeAnalysis(overrides: Partial<AIAnalysisResult> = {}): AIAnalysisResult {
  return {
    score: 85,
    risk_level: "low",
    confidence: 100,
    findings: ["✅ Hash Integrity: valid"],
    recommendations: ["No action required."],
    dimensions: [
      { name: "Hash Integrity", key: "hashIntegrity", score: 100, weight: 20, status: "pass", detail: "SHA-256 hash matches." },
      { name: "Blockchain Anchoring", key: "blockchainAnchor", score: 100, weight: 20, status: "pass", detail: "Anchored on-chain." },
      { name: "Revocation Status", key: "revocationStatus", score: 100, weight: 15, status: "pass", detail: "Active." },
      { name: "Expiration", key: "expiration", score: 100, weight: 10, status: "pass", detail: "Valid." },
      { name: "Issuer Trust", key: "issuerTrust", score: 100, weight: 10, status: "pass", detail: "Trusted." },
      { name: "Cryptographic Proof", key: "cryptoProof", score: 100, weight: 10, status: "pass", detail: "Signed." },
      { name: "Data Quality", key: "dataQuality", score: 100, weight: 10, status: "pass", detail: "Complete." },
      { name: "Temporal Consistency", key: "temporalConsist", score: 100, weight: 5, status: "pass", detail: "Consistent." },
    ],
    analyzed_at: "2026-01-01T00:00:00Z",
    engine: "heuristic-v1",
    ...overrides,
  };
}

function makeContext(overrides: Partial<VerificationContext> = {}): VerificationContext {
  return {
    ai_analysis: makeAnalysis(),
    valid: true,
    hash_integrity: true,
    not_revoked: true,
    not_expired: true,
    blockchain_verified: true,
    expires_at: null,
    blockchain_anchor: "0xabc123",
    signature: { signed: true, type: "personal_sign", signer: "0x1234567890abcdef1234567890abcdef12345678" },
    ...overrides,
  };
}

describe("chatWithAI", () => {
  const ctx = makeContext();

  it("responds to validity questions", () => {
    const response = chatWithAI("Is this credential valid?", ctx);
    expect(response).toContain("passed all verification checks");
    expect(response).toContain("confidence score");
  });

  it("responds with fail for invalid credential", () => {
    const invalidCtx = makeContext({ valid: false });
    const response = chatWithAI("Is this genuine?", invalidCtx);
    expect(response).toContain("did **not** pass");
  });

  it("responds to risk questions", () => {
    const response = chatWithAI("What is the risk level?", ctx);
    expect(response).toContain("LOW");
    expect(response).toContain("85/100");
  });

  it("responds to medium risk", () => {
    const mediumCtx = makeContext({ ai_analysis: makeAnalysis({ score: 60, risk_level: "medium" }) });
    const response = chatWithAI("Is this safe?", mediumCtx);
    expect(response).toContain("MEDIUM");
  });

  it("responds to high risk", () => {
    const highCtx = makeContext({ ai_analysis: makeAnalysis({ score: 20, risk_level: "high" }) });
    const response = chatWithAI("Any danger?", highCtx);
    expect(response).toContain("HIGH");
  });

  it("responds to blockchain questions", () => {
    const response = chatWithAI("Is it anchored on chain?", ctx);
    expect(response).toContain("anchored");
    expect(response).toContain("Sepolia");
  });

  it("responds when not anchored", () => {
    const noChainCtx = makeContext({ blockchain_verified: false, blockchain_anchor: null });
    const response = chatWithAI("What about the blockchain?", noChainCtx);
    expect(response).toContain("no blockchain anchor");
  });

  it("responds to hash/tamper questions", () => {
    const response = chatWithAI("Has this been tampered with?", ctx);
    expect(response).toContain("not been tampered with");
  });

  it("responds to hash mismatch", () => {
    const tamperedCtx = makeContext({ hash_integrity: false });
    const response = chatWithAI("Is the hash intact?", tamperedCtx);
    expect(response).toContain("HASH MISMATCH");
  });

  it("responds to revocation questions", () => {
    const response = chatWithAI("Has this been revoked?", ctx);
    expect(response).toContain("not been revoked");
  });

  it("responds to revoked credential", () => {
    const revokedCtx = makeContext({ not_revoked: false });
    const response = chatWithAI("Is it cancelled?", revokedCtx);
    expect(response).toContain("revoked");
  });

  it("responds to expiration questions", () => {
    const response = chatWithAI("When does it expire?", ctx);
    expect(response).toContain("no expiration date");
  });

  it("responds to soon-to-expire credential", () => {
    const soonExpiry = new Date(Date.now() + 15 * 86_400_000).toISOString();
    const expiringCtx = makeContext({ expires_at: soonExpiry });
    const response = chatWithAI("Is it expiring soon?", expiringCtx);
    expect(response).toContain("expires in");
  });

  it("responds to expired credential", () => {
    const expired = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const expiredCtx = makeContext({ expires_at: expired });
    const response = chatWithAI("Has it expired?", expiredCtx);
    expect(response).toContain("expired");
  });

  it("responds to signature questions", () => {
    const response = chatWithAI("Is it signed?", ctx);
    expect(response).toContain("real cryptographic wallet signature");
  });

  it("responds to unsigned credential", () => {
    const unsignedCtx = makeContext({ signature: { signed: false, type: "simulated" } });
    const response = chatWithAI("What about the signature?", unsignedCtx);
    expect(response).toContain("No real wallet signature");
  });

  it("responds to score questions", () => {
    const response = chatWithAI("What is the confidence score?", ctx);
    expect(response).toContain("85/100");
    expect(response).toContain("100%");
  });

  it("responds to dimension breakdown", () => {
    const response = chatWithAI("Give me the dimension breakdown", ctx);
    expect(response).toContain("Dimension Breakdown");
    expect(response).toContain("Hash Integrity");
  });

  it("responds to recommendation questions", () => {
    const response = chatWithAI("What should I do?", ctx);
    expect(response).toContain("Recommendations");
  });

  it("responds to findings/issues", () => {
    const response = chatWithAI("Are there any issues?", ctx);
    expect(response).toContain("No issues or warnings found");
  });

  it("responds to engine questions", () => {
    const response = chatWithAI("How does the AI work?", ctx);
    expect(response).toContain("Heuristic");
  });

  it("responds to greeting", () => {
    const response = chatWithAI("Hello", ctx);
    expect(response).toContain("BlockID Credential AI Assistant");
    expect(response).toContain("Ask me about");
  });

  it("returns fallback for unrecognized questions", () => {
    const response = chatWithAI("xyzzy foobar", ctx);
    expect(response).toContain("85/100");
    expect(response).toContain("low risk");
  });
});

describe("getRiskColor", () => {
  it("returns emerald for low", () => {
    expect(getRiskColor("low")).toBe("text-emerald-500");
  });
  it("returns amber for medium", () => {
    expect(getRiskColor("medium")).toBe("text-amber-500");
  });
  it("returns red for high", () => {
    expect(getRiskColor("high")).toBe("text-red-500");
  });
});

describe("getRiskBg", () => {
  it("returns correct bg for low", () => {
    expect(getRiskBg("low")).toContain("emerald");
  });
  it("returns correct bg for medium", () => {
    expect(getRiskBg("medium")).toContain("amber");
  });
  it("returns correct bg for high", () => {
    expect(getRiskBg("high")).toContain("red");
  });
});

describe("getDimensionColor", () => {
  it("returns emerald for high scores", () => {
    expect(getDimensionColor(90)).toBe("bg-emerald-500");
    expect(getDimensionColor(75)).toBe("bg-emerald-500");
  });
  it("returns amber for medium scores", () => {
    expect(getDimensionColor(60)).toBe("bg-amber-500");
    expect(getDimensionColor(45)).toBe("bg-amber-500");
  });
  it("returns red for low scores", () => {
    expect(getDimensionColor(30)).toBe("bg-red-500");
    expect(getDimensionColor(0)).toBe("bg-red-500");
  });
});

describe("getStatusIcon", () => {
  it("returns checkmark for pass", () => {
    expect(getStatusIcon("pass")).toBe("✅");
  });
  it("returns warning for warn", () => {
    expect(getStatusIcon("warn")).toBe("⚠️");
  });
  it("returns cross for fail", () => {
    expect(getStatusIcon("fail")).toBe("❌");
  });
  it("returns question for unknown", () => {
    expect(getStatusIcon("unknown")).toBe("❓");
  });
});

describe("formatScore", () => {
  it("returns Strong for high scores", () => {
    expect(formatScore(90)).toBe("90 — Strong");
    expect(formatScore(75)).toBe("75 — Strong");
  });
  it("returns Moderate for medium scores", () => {
    expect(formatScore(60)).toBe("60 — Moderate");
    expect(formatScore(45)).toBe("45 — Moderate");
  });
  it("returns Weak for low scores", () => {
    expect(formatScore(30)).toBe("30 — Weak");
    expect(formatScore(0)).toBe("0 — Weak");
  });
});
