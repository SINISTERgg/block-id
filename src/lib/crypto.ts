/**
 * Cryptographic utilities for credential hashing.
 * Mirrors the logic in the Supabase edge functions to ensure consistent hashes.
 */

/**
 * Deterministic JSON serialization — keys sorted recursively.
 * This is critical: the same object must always produce the same JSON string.
 */
export function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalJson).join(",") + "]";
  }
  const sorted = Object.keys(obj as Record<string, unknown>)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson((obj as Record<string, unknown>)[k])}`);
  return "{" + sorted.join(",") + "}";
}

/**
 * SHA-256 hash using the Web Crypto API (SubtleCrypto).
 * Returns a hex string without "0x" prefix.
 */
export async function sha256Hash(data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Return the hashable view of a VC: the credential WITHOUT the top-level
 * signature `proof` and WITHOUT post-issuance runtime metadata.
 *
 * Anchoring writes a `blockchain` object back into `credential_data`, and the
 * presentation wrapper carries `credentialHash` / `schemaName` / `schemaType`.
 * None of those exist at issuance time, so they must be stripped or an anchored
 * credential would hash differently from its issuance digest and be reported as
 * tampered.
 *
 * Mirrors `hashableCredential()` in supabase/functions/_shared/vc-hash.ts.
 */
export function hashableCredential(vc: Record<string, unknown>): Record<string, unknown> {
  const hashable: Record<string, unknown> = { ...vc };
  // Signature proof — appended after hashing.
  delete hashable.proof;
  // Post-issuance blockchain anchoring metadata.
  delete hashable.blockchain;
  delete hashable.blockchainAnchor;
  // Presentation-wrapper auxiliary metadata.
  delete hashable.credentialHash;
  delete hashable.schemaName;
  delete hashable.schemaType;
  // Integrity baseline written by verify-credential after issuance — never an
  // input to the digest it records.
  delete hashable.contentDigest;
  return hashable;
}

/**
 * Compute the canonical hash for a Verifiable Credential.
 *
 * Matches the edge-function algorithm exactly (see
 * supabase/functions/_shared/vc-hash.ts). Any top-level signature `proof`
 * present on `vc` is stripped before hashing, so verifiers can pass the full
 * stored `credential_data` and still reproduce the issuance-time digest.
 *
 * @param vc - The Verifiable Credential object (proof, if present, is ignored)
 * @param prevHash - The previous credential hash for chain linking (or empty string)
 */
export async function computeCredentialHash(
  vc: Record<string, unknown>,
  prevHash = ""
): Promise<string> {
  const payload = canonicalJson({ vc: hashableCredential(vc), prevHash });
  return sha256Hash(payload);
}

/**
 * Convert a hex string to a bytes32 padded hex value (for Solidity).
 */
export function toBytes32(hex: string): string {
  const clean = hex.replace(/^0x/, "");
  return "0x" + clean.padStart(64, "0");
}
