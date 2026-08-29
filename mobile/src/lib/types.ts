/**
 * BlockID mobile — shared types mirrored from the web app.
 *
 * Keep in lockstep with:
 *  - src/services/api/holder.service.ts (HolderCredential)
 *  - src/lib/siwe.ts (SIWE message shape, for the wallet sign-in flow)
 */

export interface HolderCredential {
  id: string;
  credential_data: unknown;
  credential_hash: string;
  blockchain_anchor: string | null;
  status: "active" | "revoked" | "expired" | (string & {});
  issued_at: string;
  expires_at: string | null;
  credential_schemas: { name: string; credential_type: string } | null;
}

export interface SessionInfo {
  userId: string;
  email: string;
}

/** Subset of the EIP-4361 challenge the mobile app needs to display/sign. */
export interface SiweChallenge {
  nonce: string;
  expires_at: string;
}
