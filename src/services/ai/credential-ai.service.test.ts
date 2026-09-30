import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocked at the module boundary: the real client would attempt a network call
// for every test in this file. `supabase.functions.invoke` is the only surface
// the assistant touches.
const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

import {
  chatWithAI,
  getRiskColor,
  getRiskBg,
  getDimensionColor,
  getStatusIcon,
  formatScore,
  renderAssistantMarkdown,
  askAssistant,
  type VerificationContext,
  type AIAnalysisResult,
  type NormalizedAnalysis,
} from "./credential-ai.service";

const DIMENSIONS: AIAnalysisResult["dimensions"] = [
  { key: "hashIntegrity", name: "Hash Integrity", score: 100, weight: 18, status: "pass", detail: "SHA-256 hash matches.", critical: true },
  { key: "blockchainAnchor", name: "Blockchain Anchoring", score: 100, weight: 18, status: "pass", detail: "Anchored on-chain.", critical: false },
  { key: "revocationStatus", name: "Revocation Status", score: 100, weight: 14, status: "pass", detail: "Active.", critical: true },
  { key: "cryptoProof", name: "Cryptographic Proof", score: 100, weight: 14, status: "pass", detail: "Signed.", critical: false },
  { key: "issuerTrust", name: "Issuer Trust", score: 100, weight: 12, status: "pass", detail: "Trusted.", critical: false },
  { key: "expiration", name: "Expiration", score: 100, weight: 10, status: "pass", detail: "Valid.", critical: false },
  { key: "dataQuality", name: "Data Quality", score: 100, weight: 8, status: "pass", detail: "Complete.", critical: false },
  { key: "temporalConsist", name: "Temporal Consistency", score: 100, weight: 6, status: "pass", detail: "Consistent.", critical: false },
];

function makeAnalysis(overrides: Partial<NormalizedAnalysis> = {}): NormalizedAnalysis {
  return {
    schema_version: 2,
    legacy: false,
    engine: "blockid-trust-v2",
    score: 85,
    raw_score: 85,
    risk_level: "low",
    confidence: 100,
    confidence_factors: [],
    tier: "gold",
    hard_caps_applied: [],
    findings: ["✅ Hash Integrity: SHA-256 hash matches."],
    recommendations: ["No action required."],
    dimensions: DIMENSIONS,
    llm: null,
    analyzed_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeContext(overrides: Partial<VerificationContext> = {}): VerificationContext {
  return {
    ai_analysis: makeAnalysis(),
    valid: true,
    hash_integrity: true,
    hash_checked: true,
    not_revoked: true,
    not_expired: true,
    blockchain_verified: true,
    blockchain_checked: true,
    expires_at: null,
    blockchain_anchor: "0xabc123",
    signature: { signed: true, type: "personal_sign", signer: "0x1234567890abcdef1234567890abcdef12345678" },
    ...overrides,
  };
}

describe("chatWithAI", () => {
  const ctx = makeContext();

  it("answers validity questions with the checks it actually ran", () => {
    const response = chatWithAI("Is this credential valid?", ctx);
    expect(response).toContain("**passed**");
    expect(response).toContain("hash intact");
    expect(response).toContain("not revoked");
    expect(response).toContain("85/100");
  });

  it("says an invalid credential did not pass", () => {
    const response = chatWithAI("Is this genuine?", makeContext({ valid: false }));
    expect(response).toContain("did not pass");
  });

  it("does not claim a hash check that never happened", () => {
    const unchecked = makeContext({ hash_checked: false, hash_integrity: false });
    const response = chatWithAI("Has this been tampered with?", unchecked);
    expect(response).toContain("not checked");
    expect(response).not.toContain("HASH MISMATCH");
  });

  it("reports a confirmed hash mismatch as a hard cap", () => {
    const tampered = makeContext({
      hash_integrity: false,
      ai_analysis: makeAnalysis({
        score: 20,
        tier: "untrusted",
        risk_level: "high",
        hard_caps_applied: [{ key: "hashMismatch", cap: 20, reason: "Credential hash does not match its data." }],
      }),
    });
    const response = chatWithAI("Is the hash intact?", tampered);
    expect(response).toContain("HASH MISMATCH");
    expect(response).toContain("capped at 20/100");
  });

  it("answers risk questions from the analysis, not from a guess", () => {
    expect(chatWithAI("What is the risk level?", ctx)).toContain("LOW");
    expect(
      chatWithAI("What is the risk level?", makeContext({ ai_analysis: makeAnalysis({ score: 60, risk_level: "medium" }) })),
    ).toContain("MEDIUM");
    expect(
      chatWithAI("What is the risk level?", makeContext({ ai_analysis: makeAnalysis({ score: 20, risk_level: "high" }) })),
    ).toContain("HIGH");
  });

  it("separates an unreachable chain from a missing anchor", () => {
    const unreachable = makeContext({ blockchain_checked: false, blockchain_verified: false, blockchain_anchor: null });
    const unknown = chatWithAI("Is it anchored on chain?", unreachable);
    expect(unknown).toContain("could not be reached");
    expect(unknown).not.toContain("holds no anchor");

    const genuinely = makeContext({ blockchain_checked: true, blockchain_verified: false, blockchain_anchor: null });
    expect(chatWithAI("Is it anchored on chain?", genuinely)).toContain("holds no anchor");
  });

  it("describes a confirmed anchor", () => {
    expect(chatWithAI("Is it anchored on chain?", ctx)).toContain("Anchored");
  });

  it("explains revocation both ways", () => {
    expect(chatWithAI("Has this been revoked?", ctx)).toContain("not been revoked");
    const revoked = makeContext({ not_revoked: false, valid: false });
    expect(chatWithAI("Has this been revoked?", revoked)).toContain("Revoked");
  });

  it("distinguishes an undated credential from an expired one", () => {
    expect(chatWithAI("When does it expire?", ctx)).toContain("no expiration date");

    const soon = new Date(Date.now() + 15 * 86_400_000).toISOString();
    expect(chatWithAI("Is it expiring soon?", makeContext({ expires_at: soon }))).toContain("Expires in");

    const past = new Date(Date.now() - 10 * 86_400_000).toISOString();
    expect(chatWithAI("Has it expired?", makeContext({ expires_at: past }))).toContain("Expired");
  });

  it("does not claim cryptographic verification for a self-asserted signature", () => {
    const response = chatWithAI("Is it signed?", ctx);
    expect(response).toContain("self-asserted");
    expect(response).not.toContain("cryptographically verified");
  });

  it("reports confidence and why it was reduced", () => {
    const full = chatWithAI("What is the confidence score?", ctx);
    expect(full).toContain("85/100");
    expect(full).toContain("Confidence** 100%");

    const reduced = chatWithAI(
      "What is the confidence score?",
      makeContext({
        ai_analysis: makeAnalysis({
          confidence: 75,
          confidence_factors: [{ key: "onChainUnreachable", label: "On-chain registry was unreachable", penalty: 25 }],
        }),
      }),
    );
    expect(reduced).toContain("On-chain registry was unreachable");
  });

  it("marks a low-confidence result as provisional", () => {
    const low = makeContext({
      ai_analysis: makeAnalysis({
        confidence: 45,
        confidence_factors: [{ key: "hashNotChecked", label: "No stored digest available to verify hash integrity", penalty: 30 }],
      }),
    });
    expect(chatWithAI("What is the risk level?", low)).toContain("provisional");
  });

  it("lists every dimension with its weight", () => {
    const response = chatWithAI("Give me the dimension breakdown", ctx);
    expect(response).toContain("Dimension breakdown");
    expect(response).toContain("Hash Integrity");
    expect(response).toContain("weight 18%");
  });

  it("does not reorder the caller's analysis", () => {
    const before = makeContext().ai_analysis.dimensions.map(d => d.key);
    chatWithAI("Give me the dimension breakdown", makeContext());
    const after = makeContext().ai_analysis.dimensions.map(d => d.key);
    expect(after).toEqual(before);
  });

  it("surfaces recommendations", () => {
    expect(chatWithAI("What should I do?", ctx)).toContain("Recommended next steps");
  });

  it("says so plainly when there is nothing wrong", () => {
    expect(chatWithAI("Are there any issues?", ctx)).toContain("No failures or warnings");
  });

  it("names the engine when no model was involved", () => {
    const response = chatWithAI("How does the AI work?", ctx);
    expect(response).toContain("blockid-trust-v2");
    expect(response).toContain("deterministic");
  });

  it("states that the model cannot change a number when a narrative exists", () => {
    const narrated = makeContext({
      ai_analysis: makeAnalysis({
        engine: "blockid-trust-v2+llm:gemini-2.0-flash",
        llm: {
          model: "gemini-2.0-flash",
          summary: "Clean credential.",
          findings: [],
          recommendations: [],
          flags: [],
          latency_ms: 380,
          prompt_tokens: 820,
          candidates_tokens: 140,
          degraded: false,
        },
      }),
    });
    const response = chatWithAI("How does the AI work?", narrated);
    expect(response).toContain("gemini-2.0-flash");
    expect(response).toContain("cannot change a number");
  });

  it("does not hide a degraded narrative behind a confident answer", () => {
    const degraded = makeContext({
      ai_analysis: makeAnalysis({
        llm: {
          model: "gemini-2.0-flash",
          summary: "",
          findings: [],
          recommendations: [],
          flags: [],
          latency_ms: 0,
          prompt_tokens: 0,
          candidates_tokens: 0,
          degraded: true,
        },
      }),
    });
    expect(chatWithAI("How does the AI work?", degraded)).toContain("did not complete");
  });

  it("greets and offers topics", () => {
    const response = chatWithAI("Hello", ctx);
    expect(response).toContain("I can explain this verification result");
    expect(response).toContain("Try asking about");
  });

  it("summarises rather than guessing when nothing matches", () => {
    const response = chatWithAI("xyzzy foobar", ctx);
    expect(response).toContain("85/100");
    expect(response).toContain("low risk");
  });
});

describe("askAssistant", () => {
  const ctx = makeContext();

  beforeEach(() => {
    invokeMock.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("returns rule answers when the edge function is unavailable", async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: "offline" } });

    const result = await askAssistant("Is this credential valid?", ctx);
    expect(result.source).toBe("rules");
    expect(result.degraded).toBe(true);
    expect(result.answer).toContain("passed");
  });

  it("prefers a model answer and reports its provenance", async () => {
    invokeMock.mockResolvedValue({
      data: {
        available: true,
        answer: "The hash matched.",
        referenced_dimensions: ["hashIntegrity"],
        follow_ups: ["Is it anchored?"],
        model: "gemini-2.0-flash",
        latency_ms: 412,
      },
      error: null,
    });

    const result = await askAssistant("Is the hash ok?", ctx);
    expect(result.source).toBe("model");
    expect(result.degraded).toBe(false);
    expect(result.referencedDimensions).toEqual(["hashIntegrity"]);
    expect(result.followUps).toEqual(["Is it anchored?"]);
    expect(result.model).toBe("gemini-2.0-flash");
    expect(result.latencyMs).toBe(412);
  });

  it("treats a refusal as a miss and falls back to rules", async () => {
    invokeMock.mockResolvedValue({ data: { available: false, refused: true }, error: null });

    const result = await askAssistant("Is this valid?", ctx);
    expect(result.source).toBe("rules");
    expect(result.answer.length).toBeGreaterThan(0);
  });

  it("ignores a non-string answer from the model", async () => {
    invokeMock.mockResolvedValue({ data: { available: true, answer: { nested: true } }, error: null });

    const result = await askAssistant("Is this valid?", ctx);
    expect(result.source).toBe("rules");
  });

  it("sends only a narrow slice of context to the model", async () => {
    invokeMock.mockResolvedValue({ data: { available: true, answer: "ok" }, error: null });

    await askAssistant("Is the hash ok?", ctx);

    const body = invokeMock.mock.calls[0][1].body;
    expect(Object.keys(body)).toEqual(expect.arrayContaining(["question", "analysis", "context"]));
    expect(body.analysis.valid).toBe(true);
    expect(body.analysis.hash_checked).toBe(true);
    // The full credential body is holder-controlled and is never forwarded.
    expect(JSON.stringify(body)).not.toContain("credentialSubject");
    expect(body.context.credential_type).toBeTruthy();
  });

  it("does not call the network for an empty question", async () => {
    const result = await askAssistant("   ", ctx);
    expect(result.source).toBe("rules");
    expect(invokeMock).not.toHaveBeenCalled();
    expect(result.fallbackReason).toBe("empty");
  });

  it("reports a spent budget as a rate limit, not an outage", async () => {
    invokeMock.mockRejectedValue(
      Object.assign(new Error("rate limited"), {
        context: { status: 429, headers: new Headers({ "retry-after": "37" }) },
      }),
    );
    // A rate limit is expected behaviour, not a fault: it must not be logged as
    // "assistant unavailable" or the feature looks broken to whoever is on call.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await askAssistant("Is this valid?", ctx);
    expect(result.source).toBe("rules");
    expect(result.fallbackReason).toBe("rate_limited");
    expect(result.retryAfterSeconds).toBe(37);
    expect(result.answer.length).toBeGreaterThan(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it("reads Retry-After from a plain header object too", async () => {
    invokeMock.mockRejectedValue(
      Object.assign(new Error("rate limited"), {
        context: { status: 429, headers: { "retry-after": "12" } },
      }),
    );

    const result = await askAssistant("Is this valid?", ctx);
    expect(result.fallbackReason).toBe("rate_limited");
    expect(result.retryAfterSeconds).toBe(12);
  });

  it("distinguishes an unconfigured model from an outage", async () => {
    invokeMock.mockResolvedValue({
      data: { available: false, reason: "ai_not_configured" },
      error: null,
    });

    const result = await askAssistant("Is this valid?", ctx);
    expect(result.source).toBe("rules");
    expect(result.fallbackReason).toBe("not_configured");
  });

  it("still answers when the call throws an unrecognised error", async () => {
    invokeMock.mockRejectedValue(new Error("socket hang up"));

    const result = await askAssistant("Is this valid?", ctx);
    expect(result.source).toBe("rules");
    expect(result.fallbackReason).toBe("unavailable");
  });

  it("truncates chat history before sending it", async () => {
    invokeMock.mockResolvedValue({ data: { available: true, answer: "ok" }, error: null });

    const history = Array.from({ length: 25 }, (_, i) => ({
      role: "user" as const,
      content: `question ${i}`,
      timestamp: new Date(0),
    }));
    await askAssistant("And now?", ctx, history);

    expect(invokeMock.mock.calls[0][1].body.history).toHaveLength(10);
  });
});

describe("getRiskColor", () => {
  it("maps each risk level to a text colour", () => {
    expect(getRiskColor("low")).toBe("text-emerald-500");
    expect(getRiskColor("medium")).toBe("text-amber-500");
    expect(getRiskColor("high")).toBe("text-red-500");
  });
});

describe("getRiskBg", () => {
  it("maps each risk level to a background", () => {
    expect(getRiskBg("low")).toContain("emerald");
    expect(getRiskBg("medium")).toContain("amber");
    expect(getRiskBg("high")).toContain("red");
  });
});

describe("getDimensionColor", () => {
  it("uses the engine's risk bands", () => {
    expect(getDimensionColor(90)).toBe("bg-emerald-500");
    expect(getDimensionColor(75)).toBe("bg-emerald-500");
    expect(getDimensionColor(74)).toBe("bg-amber-500");
    expect(getDimensionColor(45)).toBe("bg-amber-500");
    expect(getDimensionColor(44)).toBe("bg-red-500");
    expect(getDimensionColor(0)).toBe("bg-red-500");
  });
});

describe("getStatusIcon", () => {
  it("returns an icon for every dimension status", () => {
    expect(getStatusIcon("pass")).toBe("✅");
    expect(getStatusIcon("warn")).toBe("⚠️");
    expect(getStatusIcon("fail")).toBe("❌");
    expect(getStatusIcon("unknown")).toBe("❓");
  });
});

describe("formatScore", () => {
  it("labels scores using the engine's tier bands", () => {
    expect(formatScore(90)).toBe("90 — Strong");
    expect(formatScore(75)).toBe("75 — Strong");
    expect(formatScore(74)).toBe("74 — Moderate");
    expect(formatScore(60)).toBe("60 — Moderate");
    expect(formatScore(59)).toBe("59 — Weak");
    expect(formatScore(0)).toBe("0 — Weak");
  });
});

describe("renderAssistantMarkdown", () => {
  it("renders the inline marks it generates", () => {
    expect(renderAssistantMarkdown("**bold**")).toContain("<strong>bold</strong>");
    expect(renderAssistantMarkdown("`code`")).toContain("<code");
    expect(renderAssistantMarkdown("_italic_")).toContain("<em>italic</em>");
    expect(renderAssistantMarkdown("a\nb")).toContain("<br/>");
  });

  it("escapes model output before applying any markup", () => {
    const attack = '<img src=x onerror="alert(1)">';
    const html = renderAssistantMarkdown(attack);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror=\"");
    expect(html).toContain("&lt;img");
  });

  it("escapes a script tag hidden inside bold markers", () => {
    const html = renderAssistantMarkdown("**<script>alert(1)</script>**");
    expect(html).not.toContain("<script");
    expect(html).toContain("<strong>&lt;script&gt;");
  });

  it("escapes quotes so no attribute can be broken out of", () => {
    expect(renderAssistantMarkdown(`" onmouseover="x`)).not.toMatch(/"[^"]*="[^"]*"/);
  });
});
