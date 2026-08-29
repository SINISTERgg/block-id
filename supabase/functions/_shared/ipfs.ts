// Phase 3 — Shared IPFS helpers for Deno edge functions.

export const DEFAULT_IPFS_GATEWAY = "https://ipfs.io/ipfs/";

export interface PinataPinResult {
  cid: string;
  ipfsUri: string;
  gatewayUrl: string;
  pinataId: string | null;
}

/**
 * Extract a bare CID from `ipfs://CID`, `ipfs://ipfs/CID`, `/ipfs/CID`,
 * an https gateway URL, or a plain CID string. Returns null when no valid
 * structure is found.
 */
export function extractCid(input: string): string | null {
  if (!input) return null;
  let value = input.trim();
  value = value.replace(/^ipfs:\/\//i, "").replace(/^\/ipfs\//i, "");
  const httpMatch = value.match(/^https?:\/\/[^/]+\/ipfs\/([^/?#]+)/i);
  if (httpMatch) return httpMatch[1] || null;
  // Reject anything with path segments or scheme leftovers
  if (/[/?#\s]/.test(value) || /^https?:/i.test(value)) return null;
  return value || null;
}

/** Basic structural validation for CIDv0 (base58, Qm…) and CIDv1 (base32, b…). */
export function isValidCid(cid: string): boolean {
  if (!cid) return false;
  // CIDv0: starts with Qm, base58btc, 46 chars
  if (/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(cid)) return true;
  // CIDv1: lowercase base32, typically 59+ chars for dag-pb/json codecs
  if (/^b[a-z2-7]{58,}$/.test(cid)) return true;
  return false;
}

export function toGatewayUrl(cidOrUri: string, gateway = DEFAULT_IPFS_GATEWAY): string {
  const cid = extractCid(cidOrUri);
  if (!cid) throw new Error("Invalid IPFS URI or CID");
  const base = gateway.endsWith("/") ? gateway : `${gateway}/`;
  return `${base}${cid}`;
}

function pinataAuthHeaders(): HeadersInit {
  const jwt = Deno.env.get("PINATA_JWT");
  if (jwt) {
    return { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` };
  }
  const apiKey = Deno.env.get("PINATA_API_KEY");
  const apiSecret = Deno.env.get("PINATA_SECRET_API_KEY");
  if (apiKey && apiSecret) {
    return {
      "Content-Type": "application/json",
      pinata_api_key: apiKey,
      pinata_secret_api_key: apiSecret,
    };
  }
  throw new Error("IPFS pinning is not configured (missing PINATA_JWT or PINATA_API_KEY/PINATA_SECRET_API_KEY)");
}

export function isPinataConfigured(): boolean {
  return Boolean(
    Deno.env.get("PINATA_JWT") ||
      (Deno.env.get("PINATA_API_KEY") && Deno.env.get("PINATA_SECRET_API_KEY"))
  );
}

interface PinataResponse {
  IpfsHash?: string;
  PinID?: string;
  error?: unknown;
}

/**
 * Pin a JSON document to IPFS through the Pinata REST API and return the
 * canonical content address.
 */
export async function pinJsonToIpfs(
  content: Record<string, unknown>,
  name: string,
  keyvalues: Record<string, string> = {},
  gateway = DEFAULT_IPFS_GATEWAY
): Promise<PinataPinResult> {
  const body = {
    pinataContent: content,
    pinataMetadata: { name, keyvalues },
    pinataOptions: { wrapWithDirectory: false },
  };

  const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: pinataAuthHeaders(),
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => ({}))) as PinataResponse;

  if (!res.ok || !data.IpfsHash) {
    const detail = typeof data.error === "string" ? data.error : `HTTP ${res.status}`;
    throw new Error(`Pinata pinning failed: ${detail}`);
  }

  const cid = data.IpfsHash;
  return {
    cid,
    ipfsUri: `ipfs://${cid}`,
    gatewayUrl: toGatewayUrl(cid, gateway),
    pinataId: data.PinID ?? null,
  };
}
