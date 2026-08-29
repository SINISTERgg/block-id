/**
 * SIWE (Sign-In with Ethereum, EIP-4361) utilities — pure functions for
 * building, parsing and validating sign-in messages.
 *
 * Mirrors supabase/functions/_shared/siwe.ts so the client and the
 * siwe-auth edge function agree on message format and validation rules.
 */

export const SIWE_VERSION = "1";

/** Sepolia — BlockID's primary anchoring chain. */
export const DEFAULT_SIWE_CHAIN_ID = 11155111;

/** Default challenge lifetime in milliseconds. */
export const SIWE_CHALLENGE_TTL_MS = 10 * 60 * 1000;

/** Synthetic email domain used to bind Supabase auth users to wallet addresses. */
export const SIWE_EMAIL_DOMAIN = "siwe.blockid.id";

export interface SiweMessageParams {
  /** RFC 3986 authority performing the login (e.g. "blockid.app"). */
  domain: string;
  /** Ethereum address performing the signing (EIP-55 checksummed or lowercase). */
  address: string;
  /** Human-readable statement of intent (optional). */
  statement?: string;
  /** RFC 3986 URI referring to the resource that is the subject of the signing. */
  uri: string;
  /** EIP-4361 version — always "1". */
  version?: string;
  /** EIP-155 chain id the session is bound to. */
  chainId?: number;
  /** Case-sensitive, randomly generated token (the challenge). */
  nonce: string;
  /** ISO 8601 datetime the message was generated at. Defaults to now. */
  issuedAt?: string;
  /** ISO 8601 datetime after which the message is invalid. */
  expirationTime?: string;
  /** ISO 8601 datetime before which the message is invalid. */
  notBefore?: string;
  /** System-specific request identifier (optional). */
  requestId?: string;
  /** List of URIs the user may be redirected to / informed about (optional). */
  resources?: string[];
}

export interface ParsedSiweMessage {
  domain: string;
  address: string;
  statement?: string;
  uri: string;
  version: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  expirationTime?: string;
  notBefore?: string;
  requestId?: string;
  resources?: string[];
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

// NOTE: no `$` anchor on the address line — a full EIP-4361 message continues
// after the header block, so the match must not require end-of-string.
const HEADER_RE =
  /^(?<domain>[a-zA-Z0-9._-]+(?::\d+)?) wants you to sign in with your Ethereum account:\s*\n(?<address>0x[0-9a-fA-F]{40})(?:\n|$)/;

const FIELD_RE = /^(URI|Version|Chain ID|Nonce|Issued At|Expiration Time|Not Before|Request ID): (.+)$/;

/** Lowercase a hex address so comparisons are case-insensitive. */
export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

/** Synthetic email used as the Supabase identity key for a wallet address. */
export function walletToEmail(address: string): string {
  return `${normalizeAddress(address)}@${SIWE_EMAIL_DOMAIN}`;
}

/**
 * Cryptographically random alphanumeric nonce (challenge).
 * Uses the Web Crypto API — available in browsers, Deno and Node ≥ 18.
 */
export function generateNonce(length = 12): string {
  if (!Number.isInteger(length) || length < 8 || length > 128) {
    throw new Error("Nonce length must be an integer between 8 and 128");
  }
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let nonce = "";
  for (let i = 0; i < length; i++) nonce += alphabet[bytes[i] % alphabet.length];
  return nonce;
}

/** ISO 8601 timestamp `offsetMs` from now. */
export function isoTimestamp(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

/**
 * Build a canonical EIP-4361 message from structured fields.
 * The output is deterministic for identical inputs so clients and servers
 * can independently reconstruct it before signature verification.
 */
export function buildSiweMessage(params: SiweMessageParams): string {
  const { domain, address, statement, uri } = params;
  const version = params.version ?? SIWE_VERSION;
  const chainId = params.chainId ?? DEFAULT_SIWE_CHAIN_ID;
  const issuedAt = params.issuedAt ?? isoTimestamp();

  if (!domain || /\s/.test(domain)) throw new Error("SIWE domain is required and must be a bare authority");
  if (!ADDRESS_RE.test(address)) throw new Error("Invalid Ethereum address");
  if (!uri) throw new Error("SIWE uri is required");
  if (!params.nonce) throw new Error("SIWE nonce is required");

  const lines: string[] = [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    "",
  ];
  if (statement) lines.push(statement, "");
  lines.push(
    `URI: ${uri}`,
    `Version: ${version}`,
    `Chain ID: ${chainId}`,
    `Nonce: ${params.nonce}`,
    `Issued At: ${issuedAt}`
  );
  if (params.expirationTime) lines.push(`Expiration Time: ${params.expirationTime}`);
  if (params.notBefore) lines.push(`Not Before: ${params.notBefore}`);
  if (params.requestId) lines.push(`Request ID: ${params.requestId}`);
  if (params.resources?.length) {
    lines.push("", "Resources:");
    for (const resource of params.resources) lines.push(`- ${resource}`);
  }
  return lines.join("\n");
}

/**
 * Parse an EIP-4361 message into its structured form.
 * Returns null when the header/address block is missing or malformed.
 */
export function parseSiweMessage(message: string): ParsedSiweMessage | null {
  if (!message) return null;
  const text = message.replace(/\r\n/g, "\n");
  const match = text.match(HEADER_RE);
  if (!match?.groups) return null;

  // Everything between the address line and the first field line is the statement.
  const rest = text.slice(match.index! + match[0].length);
  const fieldMatches = [...rest.matchAll(new RegExp(FIELD_RE.source, "gm"))];
  if (fieldMatches.length === 0) return null;

  const rawStatement = rest.slice(0, fieldMatches[0].index!).trim();
  const fields: Record<string, string> = {};
  for (const m of fieldMatches) fields[m[1]] = m[2];

  const resourcesMatch = rest.match(/\nResources:\n((?:- .+\n?)+)$/);
  const resources = resourcesMatch
    ? resourcesMatch[1]
        .split("\n")
        .map((l) => l.replace(/^- /, "").trim())
        .filter(Boolean)
    : undefined;

  const chainId = Number(fields["Chain ID"]);
  if (!fields.URI || !fields.Version || !fields.Nonce || !fields["Issued At"] || !Number.isFinite(chainId)) {
    return null;
  }

  return {
    domain: match.groups.domain,
    address: match.groups.address,
    statement: rawStatement || undefined,
    uri: fields.URI,
    version: fields.Version,
    chainId,
    nonce: fields.Nonce,
    issuedAt: fields["Issued At"],
    expirationTime: fields["Expiration Time"],
    notBefore: fields["Not Before"],
    requestId: fields["Request ID"],
    resources,
  };
}

function parseIsoDate(value: string | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/** True when `expirationTime` exists and has already passed at `nowMs`. */
export function isExpired(parsed: ParsedSiweMessage, nowMs = Date.now()): boolean {
  const exp = parseIsoDate(parsed.expirationTime);
  return exp !== null && exp <= nowMs;
}

/** True when `notBefore` exists and is still in the future at `nowMs`. */
export function isBeforeActivation(parsed: ParsedSiweMessage, nowMs = Date.now()): boolean {
  const nbf = parseIsoDate(parsed.notBefore);
  return nbf !== null && nbf > nowMs;
}

export type SiweValidationResult = { valid: true; parsed: ParsedSiweMessage } | { valid: false; error: string };

export interface ExpectedChallenge {
  domain?: string;
  uri?: string;
  nonce?: string;
  address?: string;
  chainId?: number;
  nowMs?: number;
}

/**
 * Full server-side validation of an EIP-4361 challenge:
 * structure, version, temporal windows and expected bindings
 * (domain/URI/nonce/address/chain). Signature recovery happens separately.
 */
export function validateSiweChallenge(message: string, expected: ExpectedChallenge = {}): SiweValidationResult {
  const parsed = parseSiweMessage(message);
  if (!parsed) return { valid: false, error: "Malformed EIP-4361 message" };
  if (parsed.version !== SIWE_VERSION) return { valid: false, error: "Unsupported SIWE version" };

  if (expected.domain && parsed.domain !== expected.domain) {
    return { valid: false, error: "Domain mismatch" };
  }
  if (expected.uri && parsed.uri !== expected.uri) {
    return { valid: false, error: "URI mismatch" };
  }
  if (expected.nonce && parsed.nonce !== expected.nonce) {
    return { valid: false, error: "Nonce mismatch" };
  }
  if (expected.address && normalizeAddress(parsed.address) !== normalizeAddress(expected.address)) {
    return { valid: false, error: "Address mismatch" };
  }
  if (expected.chainId !== undefined && parsed.chainId !== expected.chainId) {
    return { valid: false, error: "Chain ID mismatch" };
  }

  const nowMs = expected.nowMs ?? Date.now();
  if (isExpired(parsed, nowMs)) return { valid: false, error: "Challenge expired" };
  if (isBeforeActivation(parsed, nowMs)) return { valid: false, error: "Challenge not yet active" };

  return { valid: true, parsed };
}
