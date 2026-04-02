import z from "zod";

// ─── Primitive schemas ────────────────────────────────────────────────────────

export const CredentialProofSchema = z.object({
  type: z.string(),
  created: z.string(),
  verificationMethod: z.string().optional(),
  proofPurpose: z.string().optional(),
  jws: z.string().optional(),
  proofValue: z.string().optional(),
  // Wallet signature extensions
  signatureType: z.string().optional(),
  signerAddress: z.string().optional(),
  signature: z.string().optional(),
});

export const BlockchainInfoSchema = z.object({
  txHash: z.string(),
  blockNumber: z.number().or(z.string()),
  network: z.string(),
  chainId: z.number().optional(),
  timestamp: z.number().optional(),
});

export const CredentialSubjectSchema = z.record(z.unknown()).and(
  z.object({ id: z.string().optional() })
);

export const VerifiableCredentialSchema = z.object({
  "@context": z.array(z.string()),
  id: z.string().optional(),
  type: z.array(z.string()),
  issuer: z.string().or(z.object({ id: z.string() })),
  issuanceDate: z.string(),
  expirationDate: z.string().optional(),
  credentialSubject: CredentialSubjectSchema,
  proof: CredentialProofSchema.optional(),
  // BlockID extensions
  blockchain: BlockchainInfoSchema.optional(),
  credentialHash: z.string().optional(),
  previousHash: z.string().optional(),
});

// ─── DB row schemas ───────────────────────────────────────────────────────────

export const CredentialRowSchema = z.object({
  id: z.string().uuid(),
  holder_did: z.string(),
  holder_id: z.string().uuid().optional(),
  issuer_id: z.string().uuid(),
  schema_id: z.string().uuid().nullable(),
  credential_data: z.unknown(),
  credential_hash: z.string(),
  blockchain_anchor: z.string().nullable(),
  status: z.enum(["active", "revoked", "expired"]),
  issued_at: z.string(),
  expires_at: z.string().nullable(),
  revoked_at: z.string().nullable().optional(),
});

export const SchemaRowSchema = z.object({
  id: z.string().uuid(),
  issuer_id: z.string().uuid(),
  name: z.string(),
  credential_type: z.string(),
  fields: z.unknown(),
  version: z.number(),
  parent_schema_id: z.string().uuid().nullable(),
  is_latest: z.boolean(),
  created_at: z.string(),
});

export const VerificationRecordSchema = z.object({
  id: z.string().uuid(),
  verifier_id: z.string().uuid(),
  holder_did: z.string().nullable(),
  credential_type: z.string().nullable(),
  purpose: z.string(),
  status: z.enum(["pending", "verified", "rejected"]),
  ai_analysis: z.unknown().nullable(),
  verified_at: z.string().nullable(),
  created_at: z.string(),
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type VerifiableCredential = z.infer<typeof VerifiableCredentialSchema>;
export type CredentialProof = z.infer<typeof CredentialProofSchema>;
export type BlockchainInfo = z.infer<typeof BlockchainInfoSchema>;
export type CredentialRow = z.infer<typeof CredentialRowSchema>;
export type SchemaRow = z.infer<typeof SchemaRowSchema>;
export type VerificationRecord = z.infer<typeof VerificationRecordSchema>;
