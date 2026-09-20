/**
 * Shared canonical VC hashing — the SINGLE source of truth for
 * `credential_hash` across the whole platform:
 *
 *   • issue-credential   (create, edge function)
 *   • verify-credential  (verify, edge function)
 *   • oid4vci            (OID4VCI issuance, edge function)
 *   • src/lib/crypto.ts  (client-side fingerprinting — MUST mirror this file)
 *
 * Algorithm
 * ─────────
 *   credential_hash = SHA-256( canonicalJson({ vc, prevHash }) )
 *
 * Notes:
 *   • `vc` is the Verifiable Credential WITHOUT its signature `proof`
 *     (the proof is appended after hashing; proof.message links to the hash).
 *   • `canonicalJson` sorts object keys recursively → hash is identical no
 *     matter which producer created it, and reproducible from the stored row.
 *   • No random salt is mixed in: the hash is fully deterministic given the
 *     stored `credential_data` and `prev_hash`. Uniqueness is guaranteed by
 *     the chained `prev_hash` plus the VC's own fields (issuanceDate,
 *     credentialSubject.id, credentialSchema, ...).
 */

/** Deterministic JSON serialization — keys sorted recursively. */
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

/** SHA-256 hex digest (lowercase, no "0x" prefix) via WebCrypto. */
export async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Return the hashable view of a VC: the credential WITHOUT the top-level
 * signature `proof`. Producers pass the pre-proof object; verifiers can pass
 * the full `credential_data` and this strips the proof out for them.
 */
export function hashableCredential(vc: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...vc };
  delete copy.proof;
  return copy;
}

/**
 * Compute the canonical credential hash.
 *
 * @param vc       The Verifiable Credential (proof is stripped if present).
 * @param prevHash The previous credential hash that chains this one into the
 *                 history ("genesis" for the first row). Omitted → "".
 */
export async function computeCredentialHash(
  vc: Record<string, unknown>,
  prevHash = ""
): Promise<string> {
  const payload = canonicalJson({ vc: hashableCredential(vc), prevHash });
  return sha256Hex(payload);
}