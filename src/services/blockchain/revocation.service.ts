import { getCredentialStatus, type CredentialStatus } from "./registry";

export interface RevocationCheckResult {
  isRevoked: boolean;
  isAnchored: boolean;
  issuer: string;
  blockAnchored: number;
  contractSupported: boolean;
  error?: string;
}

/**
 * Check if a credential has been revoked on-chain.
 * This is a free read — no wallet or gas needed.
 * Falls back gracefully if the contract isn't deployed yet.
 */
export async function checkRevocationOnChain(
  credentialHash: string
): Promise<RevocationCheckResult> {
  try {
    const status: CredentialStatus = await getCredentialStatus(credentialHash);
    return {
      isRevoked: status.revoked,
      isAnchored: status.anchored,
      issuer: status.issuer,
      blockAnchored: status.blockAnchored,
      contractSupported: true,
    };
  } catch (err: any) {
    // Contract not deployed or RPC failure — return unverified state
    return {
      isRevoked: false,
      isAnchored: false,
      issuer: "0x0000000000000000000000000000000000000000",
      blockAnchored: 0,
      contractSupported: false,
      error: err.message ?? "Could not check on-chain revocation status",
    };
  }
}

/**
 * Batch check revocation status for multiple credential hashes.
 */
export async function batchCheckRevocation(
  hashes: string[]
): Promise<Map<string, RevocationCheckResult>> {
  const results = await Promise.allSettled(
    hashes.map((h) => checkRevocationOnChain(h))
  );

  const map = new Map<string, RevocationCheckResult>();
  hashes.forEach((hash, i) => {
    const result = results[i];
    if (result.status === "fulfilled") {
      map.set(hash, result.value);
    } else {
      map.set(hash, {
        isRevoked: false,
        isAnchored: false,
        issuer: "0x0000000000000000000000000000000000000000",
        blockAnchored: 0,
        contractSupported: false,
        error: result.reason?.message ?? "Unknown error",
      });
    }
  });

  return map;
}
