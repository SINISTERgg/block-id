import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  BIOMETRIC_VERIFY_FN,
  buildProofBundleParts,
  requestLivenessChallenge,
  sha256Hex,
  stripDataUri,
  verifyBiometrics,
} from "./biometric.service";

const invokeMock = vi.fn();

vi.mock("@/services/api/supabaseClient", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

beforeEach(() => {
  invokeMock.mockReset();
});

describe("pure helpers", () => {
  it("strips data-URI prefixes", () => {
    expect(stripDataUri("data:image/jpeg;base64,QUJD")).toBe("QUJD");
    expect(stripDataUri("QUJD")).toBe("QUJD");
    expect(stripDataUri("data:image/png;base64,")).toBe("");
  });

  it("produces a stable canonical proof string", () => {
    const parts = buildProofBundleParts({
      nonce: "n1",
      subjectHash: "0xabc",
      similarity: 97.654,
      verifiedAt: "2026-08-22T00:00:00.000Z",
    });
    expect(parts.canonical).toBe("n1:0xabc:97.65:2026-08-22T00:00:00.000Z");
    expect(buildProofBundleParts({
      nonce: "n1",
      subjectHash: "0xabc",
      similarity: 97.654,
      verifiedAt: "2026-08-22T00:00:00.000Z",
    }).canonical).toBe(parts.canonical);
  });

  it("sha256Hex matches known digests", async () => {
    // echo -n "abc" | sha256sum
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });
});

describe("requestLivenessChallenge", () => {
  it("invokes the edge function with action=liveness-challenge", async () => {
    invokeMock.mockResolvedValue({ data: { nonce: "cafe12", expires_at: "2026-08-22T10:05:00Z" } });
    const challenge = await requestLivenessChallenge("user-1");
    expect(invokeMock).toHaveBeenCalledWith(BIOMETRIC_VERIFY_FN, {
      body: { action: "liveness-challenge", user_id: "user-1" },
    });
    expect(challenge).toEqual({ nonce: "cafe12", expires_at: "2026-08-22T10:05:00Z" });
  });

  it("throws when the server issues no nonce", async () => {
    invokeMock.mockResolvedValue({ data: {} });
    await expect(requestLivenessChallenge()).rejects.toThrow(/Failed to issue biometric challenge/);
  });

  it("propagates edge function errors", async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: "rate limited" } });
    await expect(requestLivenessChallenge()).rejects.toThrow("rate limited");
  });
});

describe("verifyBiometrics", () => {
  const baseInput = {
    nonce: "cafe12",
    selfieBase64: "data:image/jpeg;base64,U0VMRklF",
    livenessScore: 82,
  };

  it("sends stripped base64 + liveness score and returns the verdict", async () => {
    invokeMock.mockResolvedValue({
      data: {
        passed: true,
        similarity: 95.5,
        liveness_required: 60,
        similarity_threshold: 90,
        subject_hash: "aa11",
        proof_hash: "bb22",
        verified_at: "2026-08-22T10:00:00Z",
        provider: "mock",
      },
    });

    const result = await verifyBiometrics(baseInput);
    expect(invokeMock).toHaveBeenCalledWith(BIOMETRIC_VERIFY_FN, {
      body: {
        action: "verify",
        nonce: "cafe12",
        selfie_base64: "U0VMRklF",
        document_base64: undefined,
        liveness_score: 82,
      },
    });
    expect(result.passed).toBe(true);
    expect(result.proof_hash).toBe("bb22");
  });

  it("forwards an optional reference document (also stripped)", async () => {
    invokeMock.mockResolvedValue({ data: { passed: false, proof_hash: "x", similarity: 40, subject_hash: "y", verified_at: "t", provider: "mock", liveness_required: 60, similarity_threshold: 90 } });
    await verifyBiometrics({ ...baseInput, documentBase64: "data:image/jpeg;base64,RE9D" });
    expect(invokeMock.mock.calls[0][1].body.document_base64).toBe("RE9D");
  });

  it("throws on error payloads without throwing unstructured", async () => {
    invokeMock.mockResolvedValue({ data: { error: "Challenge expired or already used" } });
    await expect(verifyBiometrics(baseInput)).rejects.toThrow("Challenge expired or already used");
  });

  it("propagates invoke errors", async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: "network down" } });
    await expect(verifyBiometrics(baseInput)).rejects.toThrow("network down");
  });
});
