import { supabase } from "@/integrations/supabase/client";

export interface IssuerSchema {
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

export interface IssuerCredential {
  id: string;
  holder_did: string;
  status: string;
  blockchain_anchor: string | null;
  issued_at: string;
  expires_at: string | null;
  schema_id: string | null;
  credential_hash: string | null;
  credential_data: unknown;
  credential_schemas: { name: string; credential_type: string } | null;
}

export interface SchemaFieldDef {
  name: string;
  type: string;
  required: boolean;
}

/**
 * Fetch all schemas created by an issuer.
 */
export async function fetchSchemas(issuerId: string): Promise<IssuerSchema[]> {
  const { data, error } = await supabase
    .from("credential_schemas")
    .select("*")
    .eq("issuer_id", issuerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as IssuerSchema[];
}

/**
 * Fetch the most recent credentials issued by an issuer (max 200).
 * Applies a client-side expiry override as a safety net for credentials
 * whose expires_at has passed but whose status hasn't been swept yet.
 */
export async function fetchCredentials(issuerId: string): Promise<IssuerCredential[]> {
  const { data, error } = await supabase
    .from("credentials")
    .select(
      "id, holder_did, status, blockchain_anchor, issued_at, expires_at, schema_id, credential_hash, credential_data, credential_schemas(name, credential_type)"
    )
    .eq("issuer_id", issuerId)
    .order("issued_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  const now = Date.now();
  return ((data ?? []) as IssuerCredential[]).map((cred) => {
    if (
      cred.status === "active" &&
      cred.expires_at &&
      new Date(cred.expires_at).getTime() < now
    ) {
      return { ...cred, status: "expired" };
    }
    return cred;
  });
}


/**
 * Create a new credential schema.
 */
export async function createSchema(
  issuerId: string,
  name: string,
  credentialType: string,
  fields: SchemaFieldDef[]
): Promise<IssuerSchema> {
  const { data, error } = await supabase
    .from("credential_schemas")
    .insert({
      issuer_id: issuerId,
      name,
      credential_type: credentialType,
      fields: fields as any,
    } as any)
    .select()
    .single();

  if (error) throw error;
  return data as IssuerSchema;
}

/**
 * Create a new version of an existing schema.
 */
export async function createNewVersion(
  issuerId: string,
  baseSchema: IssuerSchema,
  name: string,
  credentialType: string,
  fields: SchemaFieldDef[]
): Promise<IssuerSchema> {
  const newVersion = baseSchema.version + 1;

  // Set old version is_latest to false
  await supabase
    .from("credential_schemas")
    .update({ is_latest: false } as any)
    .eq("id", baseSchema.id);

  const { data, error } = await supabase
    .from("credential_schemas")
    .insert({
      issuer_id: issuerId,
      name,
      credential_type: credentialType,
      fields: fields as any,
      version: newVersion,
      parent_schema_id: baseSchema.parent_schema_id || baseSchema.id,
      is_latest: true,
    } as any)
    .select()
    .single();

  if (error) {
    await supabase.from("credential_schemas").update({ is_latest: true } as any).eq("id", baseSchema.id);
    throw new Error(error.message || "Failed to create new schema version");
  }

  return data as IssuerSchema;
}

/**
 * Delete a credential schema.
 */
export async function deleteSchema(schemaId: string, issuerId: string): Promise<void> {
  const { error } = await supabase
    .from("credential_schemas")
    .delete()
    .eq("id", schemaId)
    .eq("issuer_id", issuerId);

  if (error) throw error;
}

/**
 * Bulk-migrate active credentials from old schema versions to a target schema.
 * Returns { migrated, failed }.
 */
export async function migrateCredentials(
  issuerId: string,
  targetSchema: IssuerSchema,
  credentialIds: string[]
): Promise<{ migrated: number; failed: number }> {
  if (credentialIds.length === 0) return { migrated: 0, failed: 0 };

  const { error, count } = await supabase
    .from("credentials")
    .update({ schema_id: targetSchema.id } as any)
    .in("id", credentialIds)
    .eq("issuer_id", issuerId);

  const migrated = error ? 0 : (count ?? credentialIds.length);
  const failed = error ? credentialIds.length : 0;

  await supabase.from("audit_logs").insert({
    user_id: issuerId,
    action: "credentials_migrated",
    entity_type: "schema",
    entity_id: targetSchema.id,
    metadata: { migrated, failed, to_version: targetSchema.version },
  } as any);

  return { migrated, failed };
}

/**
 * Revoke a credential by ID (DB-only — use on-chain hook for blockchain revocation).
 */
export async function revokeCredential(credId: string, issuerId: string): Promise<void> {
  const { error } = await supabase
    .from("credentials")
    .update({ status: "revoked", revoked_at: new Date().toISOString() } as any)
    .eq("id", credId)
    .eq("issuer_id", issuerId);
  if (error) throw error;

  await supabase.from("audit_logs").insert({
    user_id: issuerId,
    action: "credential_revoked",
    entity_type: "credential",
    entity_id: credId,
    metadata: {},
  } as any);
}

/**
 * Check if an active credential already exists for a holder + schema combo.
 */
export async function checkDuplicateCredential(holderDid: string, schemaId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from("credentials")
    .select("id", { count: "exact", head: true })
    .eq("holder_did", holderDid)
    .eq("schema_id", schemaId)
    .eq("status", "active");
  if (error) return false;
  return (count ?? 0) > 0;
}
