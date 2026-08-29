/**
 * IPFS utilities — pure functions for CID handling and gateway resolution.
 * Mirrors supabase/functions/_shared/ipfs.ts so client and edge functions
 * agree on URI formats.
 */

export const DEFAULT_IPFS_GATEWAY = "https://ipfs.io/ipfs/";

/** Public gateways tried in order when resolving content. */
export const IPFS_GATEWAYS = [
  "https://ipfs.io/ipfs/",
  "https://dweb.link/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
];

/**
 * Extract a bare CID from `ipfs://CID`, `ipfs://ipfs/CID`, `/ipfs/CID`,
 * an https gateway URL, or a plain CID string. Returns null when no valid
 * structure is found.
 */
export function extractCid(input: string | null | undefined): string | null {
  if (!input) return null;
  let value = input.trim();
  value = value.replace(/^ipfs:\/\//i, "").replace(/^\/ipfs\//i, "");
  const httpMatch = value.match(/^https?:\/\/[^/]+\/ipfs\/([^/?#]+)/i);
  if (httpMatch) return httpMatch[1] || null;
  if (/[/?#\s]/.test(value) || /^https?:/i.test(value)) return null;
  return value || null;
}

/** Basic structural validation for CIDv0 (base58, Qm…) and CIDv1 (base32, b…). */
export function isValidCid(cid: string): boolean {
  if (!cid) return false;
  // CIDv0: starts with Qm, base58btc alphabet, 46 chars total
  if (/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(cid)) return true;
  // CIDv1: lowercase base32 (b…), 59+ chars depending on codec
  if (/^b[a-z2-7]{58,}$/.test(cid)) return true;
  return false;
}

/** Canonical `ipfs://<cid>` form for any accepted input. */
export function toIpfsUri(cidOrUri: string): string {
  const cid = extractCid(cidOrUri);
  if (!cid) throw new Error("Invalid IPFS URI or CID");
  return `ipfs://${cid}`;
}

/** Resolve any CID/URI form to a concrete HTTP gateway URL. */
export function toGatewayUrl(
  cidOrUri: string,
  gateway: string = DEFAULT_IPFS_GATEWAY
): string {
  const cid = extractCid(cidOrUri);
  if (!cid) throw new Error("Invalid IPFS URI or CID");
  const base = gateway.endsWith("/") ? gateway : `${gateway}/`;
  return `${base}${cid}`;
}

/** All candidate gateway URLs for a CID/URI (for fallback fetching). */
export function getGatewayCandidates(cidOrUri: string): string[] {
  return IPFS_GATEWAYS.map((g) => toGatewayUrl(cidOrUri, g));
}

export interface SchemaJsonLdInput {
  id?: string;
  name: string;
  credential_type: string;
  fields: unknown;
  version?: number;
  issuer_id?: string;
  created_at?: string;
}

/**
 * Build the canonical JSON-LD schema document pinned to IPFS.
 * Kept in lockstep with the pin-to-ipfs edge function.
 */
export function buildSchemaJsonLd(schema: SchemaJsonLdInput): Record<string, unknown> {
  return {
    "@context": [
      "https://www.w3.org/2018/credentials/v1",
      "https://w3id.org/security/suites/ed25519-2020/v1",
    ],
    type: "JsonSchemaValidator2018",
    schemaId: schema.id,
    name: schema.name,
    credentialType: schema.credential_type,
    version: schema.version ?? 1,
    issuer: schema.issuer_id ? `did:decentraid:issuer:${schema.issuer_id}` : undefined,
    fields: Array.isArray(schema.fields) ? schema.fields : [],
    created: schema.created_at ?? new Date().toISOString(),
  };
}
