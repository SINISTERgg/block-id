/**
 * OID4VCI pre-authorized-code client flow.
 *
 * Kept out of the component so the two-step exchange can be unit tested against
 * a stubbed fetch. The bug this replaces: the receive dialog POSTed straight to
 * `/credential` with the Supabase session JWT and a `{ code }` body. The
 * credential endpoint authenticates with an access token minted by `/token` and
 * ignores `code` entirely, so every in-app claim failed with 401.
 */

export const PRE_AUTHORIZED_GRANT = "urn:ietf:params:oauth:grant-type:pre-authorized_code";

export interface CredentialOffer {
  credential_offer?: {
    credential_issuer?: string;
    credentials?: string[];
    grants?: Record<string, { "pre-authorized_code"?: string; user_pin_required?: boolean }>;
  };
}

export interface IssuedCredential {
  format: string;
  credential: {
    "@context"?: string[];
    type?: string[];
    issuer?: string;
    issuanceDate?: string;
    expirationDate?: string;
    credentialSubject?: { id?: string; [k: string]: unknown };
    credentialSchema?: { id?: string; type?: string };
  };
  /** Present once the session row has been written. */
  credential_id?: string;
}

export class Oid4VciError extends Error {
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "Oid4VciError";
    this.status = status;
  }
}

/**
 * Accepts whatever the holder actually has in hand: a scanned
 * `openid-credential-offer://` URI, a raw `credential_offer` JSON blob, or a
 * bare pre-authorized code. Returns null when no code can be found.
 */
export function extractPreAuthorizedCode(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // `openid-credential-offer://?credential_offer=<urlencoded json>`
  if (/^openid-credential-offer:/i.test(trimmed)) {
    const query = trimmed.slice(trimmed.indexOf("?") + 1);
    const params = new URLSearchParams(query);
    const encoded = params.get("credential_offer");
    if (!encoded) return null;
    return readCodeFromOfferJson(encoded);
  }

  if (trimmed.startsWith("{")) {
    return readCodeFromOfferJson(trimmed);
  }

  // A bare pre-authorized code (64 hex chars from SHA-256).
  return /^[0-9a-f]{16,128}$/i.test(trimmed) ? trimmed.toLowerCase() : null;
}

function readCodeFromOfferJson(json: string): string | null {
  let parsed: CredentialOffer;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  const grant = parsed?.credential_offer?.grants?.[PRE_AUTHORIZED_GRANT];
  const code = grant?.["pre-authorized_code"];
  return typeof code === "string" && code ? code : null;
}

interface FetchLike {
  (input: string, init?: RequestInit): Promise<Response>;
}

/** Step 1: trade the pre-authorized code for a bearer access token. */
export async function exchangeCodeForToken(
  baseUrl: string,
  code: string,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  // The parameter name is hyphenated per the pre-authorized code grant. An
  // underscore here serialises to `pre_authorized_code`, which the token
  // endpoint does not read, so the exchange fails with "invalid code".
  const body = new URLSearchParams();
  body.set("grant_type", PRE_AUTHORIZED_GRANT);
  body.set("pre-authorized_code", code);

  const res = await fetchImpl(`${baseUrl}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const payload = await readJson(res);
  if (!res.ok || !payload?.access_token) {
    throw new Oid4VciError(
      payload?.error || "Could not exchange the pre-authorized code for an access token.",
      res.status,
    );
  }
  return payload.access_token as string;
}

/** Step 2: present the access token and receive the credential. */
export async function requestCredential(
  baseUrl: string,
  accessToken: string,
  options: { did?: string; format?: string } = {},
  fetchImpl: FetchLike = fetch,
): Promise<IssuedCredential> {
  const res = await fetchImpl(`${baseUrl}/credential`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      format: options.format ?? "ldp_vc",
      ...(options.did ? { did: options.did } : {}),
    }),
  });

  const payload = await readJson(res);
  if (!res.ok || !payload?.credential) {
    throw new Oid4VciError(payload?.error || "The issuer did not return a credential.", res.status);
  }
  return payload as IssuedCredential;
}

/** Full pre-authorized-code claim, as the in-app receive dialog performs it. */
export async function claimCredential(
  baseUrl: string,
  offerOrCode: string,
  options: { did?: string; format?: string } = {},
  fetchImpl: FetchLike = fetch,
): Promise<IssuedCredential> {
  const code = extractPreAuthorizedCode(offerOrCode);
  if (!code) {
    throw new Oid4VciError(
      "That does not look like an OID4VCI offer. Scan the QR code or paste a pre-authorized code.",
    );
  }
  const accessToken = await exchangeCodeForToken(baseUrl, code, fetchImpl);
  return requestCredential(baseUrl, accessToken, options, fetchImpl);
}

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
