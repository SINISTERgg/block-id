/**
 * Domain types for Verifiable Credentials, Schemas, DIDs, and related entities.
 * These are shared across the services, hooks, and components layers.
 */

/** Supported user roles in the platform. */
export type Role = "issuer" | "holder" | "verifier" | "org_admin";

/** Account lifecycle status as stored in the `profiles` table. */
export type AccountStatus = "pending" | "approved" | "rejected" | "revoked";

/** Credential lifecycle status. */
export type CredentialStatus = "active" | "revoked" | "expired" | "pending";

/** A single field definition inside a credential schema. */
export interface SchemaFieldDef {
  name: string;
  type: string;
  required: boolean;
}

/** A credential schema as returned from the `credential_schemas` table. */
export interface CredentialSchema {
  id: string;
  name: string;
  credential_type: string;
  fields: unknown;
  created_at: string;
  version: number;
  parent_schema_id: string | null;
  is_latest: boolean;
  /** Content Identifier of the schema JSON-LD pinned on IPFS (null = not pinned) */
  ipfs_cid?: string | null;
  /** Timestamp of the most recent successful IPFS pin */
  ipfs_pinned_at?: string | null;
}

/** A verifiable credential as returned from the `credentials` table. */
export interface Credential {
  id: string;
  holder_did: string;
  status: CredentialStatus | string;
  blockchain_anchor: string | null;
  issued_at: string;
  expires_at: string | null;
  schema_id: string | null;
  credential_hash: string | null;
  credential_data: unknown;
  credential_schemas?: { name: string; credential_type: string } | null;
}

/** A user profile as returned from the `profiles` table. */
export interface UserProfile {
  user_id: string;
  full_name: string | null;
  organization: string | null;
  did: string | null;
  biometric_registered: boolean;
  face_registered: boolean;
  account_status: AccountStatus | string;
}

/** A trusted issuer entry as stored in the `trusted_issuers` table. */
export interface TrustedIssuer {
  id: string;
  issuer_did: string;
  issuer_user_id: string | null;
  organization_name: string;
  domain: string | null;
  verification_status: string;
  trust_level: string;
  verified_at: string | null;
  verified_by: string | null;
  created_at: string;
}

/** An audit log entry from the `audit_logs` table. */
export interface AuditEntry {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: any;
  created_at: string;
}

/** A verification request as stored in `verification_requests`. */
export interface VerificationRequest {
  id: string;
  verifier_id: string;
  holder_did: string;
  credential_id: string | null;
  status: string;
  created_at: string;
  responded_at: string | null;
  proof_data: unknown | null;
}
