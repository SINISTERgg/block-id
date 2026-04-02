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
 * Compute the canonical hash for a Verifiable Credential.
 * Matches the edge function algorithm exactly.
 *
 * @param vc - The Verifiable Credential object (without proof)
 * @param prevHash - The previous credential hash for chain linking (or empty string)
 */
export async function computeCredentialHash(
  vc: Record<string, unknown>,
  prevHash = ""
): Promise<string> {
  const payload = canonicalJson({ vc, prevHash });
  return sha256Hash(payload);
}

/**
 * Convert a hex string to a bytes32 padded hex value (for Solidity).
 */
export function toBytes32(hex: string): string {
  const clean = hex.replace(/^0x/, "");
  return "0x" + clean.padStart(64, "0");
}
