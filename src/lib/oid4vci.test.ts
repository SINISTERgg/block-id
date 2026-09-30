import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  PRE_AUTHORIZED_GRANT,
  claimCredential,
  exchangeCodeForToken,
  extractPreAuthorizedCode,
  requestCredential,
  Oid4VciError,
} from "./oid4vci";

const BASE = "https://project.supabase.co/functions/v1/oid4vci";
const CODE = "a".repeat(64);

const offerUri = (code = CODE) =>
  `openid-credential-offer://?credential_offer=${encodeURIComponent(
    JSON.stringify({
      credential_offer: {
        credential_issuer: BASE,
        credentials: ["EmploymentCertificate"],
        grants: {
          [PRE_AUTHORIZED_GRANT]: { "pre-authorized_code": code, user_pin_required: false },
        },
      },
    }),
  )}`;

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("extractPreAuthorizedCode", () => {
  it("reads the code out of a full openid-credential-offer URI", () => {
    expect(extractPreAuthorizedCode(offerUri())).toBe(CODE);
  });

  it("reads the code out of a raw credential_offer JSON blob", () => {
    const json = JSON.stringify({
      credential_offer: { grants: { [PRE_AUTHORIZED_GRANT]: { "pre-authorized_code": CODE } } },
    });
    expect(extractPreAuthorizedCode(json)).toBe(CODE);
  });

  it("accepts a bare pre-authorized code and normalises case", () => {
    expect(extractPreAuthorizedCode(`  ${CODE.toUpperCase()}  `)).toBe(CODE);
  });

  it("returns null for empty, malformed, or unrelated input", () => {
    expect(extractPreAuthorizedCode("")).toBeNull();
    expect(extractPreAuthorizedCode("   ")).toBeNull();
    expect(extractPreAuthorizedCode("not an offer")).toBeNull();
    expect(extractPreAuthorizedCode("{ not json")).toBeNull();
    expect(extractPreAuthorizedCode("openid-credential-offer://?credential_offer=zzz")).toBeNull();
  });

  it("returns null when the offer carries a different grant type", () => {
    const json = JSON.stringify({
      credential_offer: { grants: { "urn:ietf:params:oauth:grant-type:authorization_code": { code: "x" } } },
    });
    expect(extractPreAuthorizedCode(json)).toBeNull();
  });
});

describe("exchangeCodeForToken", () => {
  it("posts form-encoded credentials to /token as the spec requires", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ access_token: "tok-123", token_type: "Bearer" }));

    const token = await exchangeCodeForToken(BASE, CODE, fetchImpl as any);

    expect(token).toBe("tok-123");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${BASE}/token`);
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const sent = new URLSearchParams(init.body);
    expect(sent.get("grant_type")).toBe(PRE_AUTHORIZED_GRANT);
    expect(sent.get("pre-authorized_code")).toBe(CODE);
  });

  it("does not send a Supabase session token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ access_token: "tok" }));
    await exchangeCodeForToken(BASE, CODE, fetchImpl as any);
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it("surfaces the server error message on a rejected code", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: "Offer expired" }, 400));
    await expect(exchangeCodeForToken(BASE, CODE, fetchImpl as any)).rejects.toThrow("Offer expired");
  });

  it("rejects when the response carries no access token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ token_type: "Bearer" }, 200));
    await expect(exchangeCodeForToken(BASE, CODE, fetchImpl as any)).rejects.toBeInstanceOf(Oid4VciError);
  });
});

describe("requestCredential", () => {
  it("authorizes with the access token, not a session JWT", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ format: "ldp_vc", credential: { type: ["VerifiableCredential", "Degree"] } }),
    );

    await requestCredential(BASE, "tok-123", { did: "did:key:zabc" }, fetchImpl as any);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${BASE}/credential`);
    expect(init.headers.Authorization).toBe("Bearer tok-123");
    expect(JSON.parse(init.body)).toEqual({ format: "ldp_vc", did: "did:key:zabc" });
  });

  it("defaults to ldp_vc and omits an absent did", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ format: "ldp_vc", credential: {} }));
    await requestCredential(BASE, "tok", {}, fetchImpl as any);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ format: "ldp_vc" });
  });

  it("propagates the issuer's unsupported-format message", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error:
            'Unsupported credential format "jwt_vc_json". This issuer only offers ldp_vc.',
        },
        400,
      ),
    );
    await expect(
      requestCredential(BASE, "tok", { format: "jwt_vc_json" }, fetchImpl as any),
    ).rejects.toThrow(/only offers ldp_vc/);
  });
});

describe("claimCredential", () => {
  it("performs the two-step exchange: token first, then credential", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "tok-abc", token_type: "Bearer" }))
      .mockResolvedValueOnce(
        jsonResponse({
          format: "ldp_vc",
          credential: {
            type: ["VerifiableCredential", "EmploymentCertificate"],
            issuer: "did:decentraid:issuer:user-1",
            issuanceDate: "2026-09-29T10:00:00.000Z",
            credentialSubject: { id: "did:key:zholder" },
          },
        }),
      );

    const result = await claimCredential(BASE, offerUri(), { did: "did:key:zholder" }, fetchImpl as any);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0]).toBe(`${BASE}/token`);
    expect(fetchImpl.mock.calls[1][0]).toBe(`${BASE}/credential`);
    expect(fetchImpl.mock.calls[1][1].headers.Authorization).toBe("Bearer tok-abc");

    expect(result.format).toBe("ldp_vc");
    expect(result.credential.credentialSubject?.id).toBe("did:key:zholder");
    expect(result.credential.issuer).toBe("did:decentraid:issuer:user-1");
  });

  it("fails fast without hitting the network when the input is not an offer", async () => {
    const fetchImpl = vi.fn();
    await expect(claimCredential(BASE, "garbage", {}, fetchImpl as any)).rejects.toThrow(
      /does not look like an OID4VCI offer/,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not call /credential when the token exchange fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: "Invalid or expired pre-authorized code" }, 400));
    await expect(claimCredential(BASE, offerUri(), {}, fetchImpl as any)).rejects.toThrow(
      "Invalid or expired pre-authorized code",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
