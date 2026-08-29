import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Signer } from "ethers";
import { parseSiweMessage } from "@/lib/siwe";
import {
  requestChallenge,
  signMessage,
  verifyAndSignIn,
  signInWithEthereum,
} from "./siwe.service";

const invokeMock = vi.fn();
const verifyOtpMock = vi.fn();

vi.mock("@/services/api/supabaseClient", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
    auth: { verifyOtp: (...args: unknown[]) => verifyOtpMock(...args) },
  },
}));

const ADDRESS = "0x71C7656EC7ab88b098defB751B7401B5f6d8976F";

function makeSigner(overrides: Partial<Signer> = {}): Signer {
  return {
    getAddress: async () => ADDRESS,
    signMessage: async (message: string) => `sig(${message.slice(0, 24)}…)`,
    ...overrides,
  } as unknown as Signer;
}

beforeEach(() => {
  invokeMock.mockReset();
  verifyOtpMock.mockReset();
});

describe("requestChallenge", () => {
  it("invokes siwe-auth with action=nonce and normalises the response", async () => {
    invokeMock.mockResolvedValue({ data: { nonce: "abc123XYZ789", expires_at: "2026-01-01T00:10:00.000Z" } });
    const challenge = await requestChallenge(ADDRESS);
    expect(invokeMock).toHaveBeenCalledWith("siwe-auth", {
      body: { action: "nonce", address: ADDRESS },
    });
    expect(challenge).toEqual({ nonce: "abc123XYZ789", expiresAt: "2026-01-01T00:10:00.000Z" });
  });

  it("throws when the server issues no nonce", async () => {
    invokeMock.mockResolvedValue({ data: {} });
    await expect(requestChallenge(ADDRESS)).rejects.toThrow(/did not issue a nonce/);
  });

  it("propagates edge function errors", async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: "rate limited" } });
    await expect(requestChallenge(ADDRESS)).rejects.toThrow("rate limited");
  });
});

describe("signMessage", () => {
  it("delegates personal_sign to the wallet signer", async () => {
    const signer = makeSigner();
    const sig = await signMessage("hello", signer);
    expect(sig).toMatch(/^sig\(hello/);
  });
});

describe("verifyAndSignIn", () => {
  it("verifies server-side then exchanges token hash for a session", async () => {
    invokeMock.mockResolvedValue({
      data: { token_hash: "hash-1", email: `${ADDRESS.toLowerCase()}@siwe.blockid.id`, address: ADDRESS.toLowerCase(), type: "magiclink" },
    });
    verifyOtpMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    const res = await verifyAndSignIn("message", "signature");

    expect(invokeMock).toHaveBeenCalledWith("siwe-auth", {
      body: { action: "verify", message: "message", signature: "signature" },
    });
    expect(verifyOtpMock).toHaveBeenCalledWith({ type: "magiclink", token_hash: "hash-1" });
    expect(res).toEqual({ address: ADDRESS.toLowerCase() });
  });

  it("throws when verification succeeds but returns no token", async () => {
    invokeMock.mockResolvedValue({ data: { address: ADDRESS } });
    await expect(verifyAndSignIn("m", "s")).rejects.toThrow(/no session token/);
    expect(verifyOtpMock).not.toHaveBeenCalled();
  });

  it("surfaces session establishment failures", async () => {
    invokeMock.mockResolvedValue({ data: { token_hash: "hash-2", email: "e", address: ADDRESS, type: "magiclink" } });
    verifyOtpMock.mockResolvedValue({ data: null, error: { message: "token expired" } });
    await expect(verifyAndSignIn("m", "s")).rejects.toThrow(/Failed to establish session: token expired/);
  });
});

describe("signInWithEthereum (full flow)", () => {
  it("throws without an Ethereum provider or explicit signer", async () => {
    await expect(signInWithEthereum({ uri: "https://x.app", domain: "x.app" })).rejects.toThrow(
      /No Ethereum provider available/
    );
  });

  it("binds the challenge nonce and expiry into the signed EIP-4361 message", async () => {
    invokeMock.mockImplementation((_fn: string, { body }: { body: Record<string, unknown> }) =>
      body.action === "nonce"
        ? Promise.resolve({ data: { nonce: "srvNonce0001", expires_at: "2026-01-01T00:10:00.000Z" } })
        : Promise.resolve({
            data: { token_hash: "th", email: "e@x", address: ADDRESS.toLowerCase(), type: "magiclink" },
          })
    );
    verifyOtpMock.mockResolvedValue({ data: {}, error: null });

    let signedPayload = "";
    const signer = makeSigner({
      signMessage: async (m: string) => {
        signedPayload = m;
        return "0xsig";
      },
    });

    const res = await signInWithEthereum({ signer, statement: "Test login." });
    expect(res.address).toBe(ADDRESS.toLowerCase());

    const parsed = parseSiweMessage(signedPayload)!;
    expect(parsed).not.toBeNull();
    expect(parsed.nonce).toBe("srvNonce0001");
    expect(parsed.expirationTime).toBe("2026-01-01T00:10:00.000Z");
    expect(parsed.statement).toBe("Test login.");
    expect(signedPayload).toContain(`wants you to sign in with your Ethereum account:\n${ADDRESS}`);
  });

  it("defaults the binding to the current origin and host", async () => {
    let captured: { body?: Record<string, unknown> } = {};
    invokeMock.mockImplementation((_fn: string, opts: { body: Record<string, unknown> }) => {
      captured = opts;
      return opts.body.action === "nonce"
        ? Promise.resolve({ data: { nonce: "n0000000000", expires_at: "" } })
        : Promise.resolve({ data: { token_hash: "t", email: "e", address: ADDRESS, type: "magiclink" } });
    });
    verifyOtpMock.mockResolvedValue({ data: {}, error: null });

    await signInWithEthereum({ signer: makeSigner() });
    const msg = String(captured.body?.message);
    expect(msg).toContain(`URI: ${window.location.origin}`);
    expect(msg.split("\n")[0]).toContain(window.location.host);

    // empty expires_at falls back to no expiration line rather than "undefined"
    expect(msg).not.toContain("Expiration Time: undefined");
  });

  it("honours explicit domain/uri overrides", async () => {
    let message = "";
    invokeMock.mockImplementation((_fn: string, { body }: { body: Record<string, unknown> }) =>
      body.action === "nonce"
        ? Promise.resolve({ data: { nonce: "n0000000000", expires_at: "" } })
        : ((message = String(body.message)),
          Promise.resolve({ data: { token_hash: "t", email: "e", address: ADDRESS, type: "magiclink" } }))
    );
    verifyOtpMock.mockResolvedValue({ data: {}, error: null });

    await signInWithEthereum({ signer: makeSigner(), domain: "app.blockid.id", uri: "https://app.blockid.id/login" });
    expect(message).toContain("URI: https://app.blockid.id/login");
    expect(message.startsWith("app.blockid.id wants you to sign in")).toBe(true);
  });
});
