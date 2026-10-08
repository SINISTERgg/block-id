import { supabase } from "@/integrations/supabase/client";

/** Keep only the fields the AI engine needs; drop large binary blobs. */
function sanitizeForAi(data: Record<string, unknown>): Record<string, unknown> {
  const MAX = 500;
  const truncate = (v: unknown): unknown => {
    if (typeof v === "string" && v.length > MAX) return v.slice(0, MAX) + "…";
    return v;
  };
  const subject = data.credentialSubject as Record<string, unknown> | undefined;
  return {
    type: data.type,
    issuer: truncate(data.issuer),
    issuanceDate: data.issuanceDate,
    expirationDate: data.expirationDate,
    credentialSubject: subject
      ? Object.fromEntries(Object.entries(subject).map(([k, v]) => [k, truncate(v)]))
      : undefined,
    hasProof: !!(data.proof),
    blockchainAnchor: truncate(data.blockchainAnchor),
    credentialHash: truncate(data.credentialHash),
    schemaName: truncate(data.schemaName),
    schemaType: truncate(data.schemaType),
  };
}

async function triggerAiVerification(
  requestId: string,
  credentialData: Record<string, unknown>,
  requestPurpose: string | null,
  credentialType: string | null
): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke("ai-verify-credential", {
      body: {
        request_id: requestId,
        credential_data: sanitizeForAi(credentialData),
        request_purpose: requestPurpose,
        credential_type: credentialType,
      },
    });
    if (error) console.warn("[BlockID] AI verification non-fatal error:", error);
  } catch (err) {
    console.warn("[BlockID] AI verification call failed (non-fatal):", err);
  }
}


export interface HolderCredential {
  id: string;
  credential_data: unknown;
  credential_hash: string;
  blockchain_anchor: string | null;
  status: string;
  issued_at: string;
  expires_at?: string | null;
  credential_schemas: { name: string; credential_type: string } | null;
  // Soulbound badge state. `sbt_token_id` is null when no badge was minted.
  sbt_token_id: number | string | null;
  sbt_tx_hash?: string | null;
  sbt_holder_address?: string | null;
  sbt_minted_at?: string | null;
  sbt_status?: string | null;
}

export interface VerificationRequest {
  id: string;
  verifier_id: string;
  holder_did: string | null;
  credential_type: string | null;
  purpose: string | null;
  status: string;
  created_at: string;
}

/**
 * Fetch all credentials held by the given user.
 *
 * Before returning, calls `expire_stale_credentials()` RPC to flip any
 * past-due credentials from 'active' → 'expired' in the DB.
 * A client-side override is also applied as a last-resort safety net in
 * case the RPC hasn't run yet (e.g. first render before migration deploys).
 */
export async function fetchHolderCredentials(
  holderId: string
): Promise<HolderCredential[]> {
  // Sweep: mark any past-due credentials as expired in the DB.
  // Fire-and-forget — we don't block the fetch on the result.
  supabase.rpc("expire_stale_credentials").then(({ error }) => {
    if (error) console.warn("[BlockID] expire_stale_credentials RPC failed:", error.message);
  });

  const { data, error } = await supabase
    .from("credentials")
    .select(
      "id, credential_data, credential_hash, blockchain_anchor, status, issued_at, expires_at, sbt_token_id, sbt_tx_hash, sbt_holder_address, sbt_minted_at, sbt_status, credential_schemas(name, credential_type)"
    )
    .eq("holder_id", holderId)
    .order("issued_at", { ascending: false });
  if (error) throw error;

  const now = Date.now();

  // Client-side safety override: if expires_at has passed and status is
  // still 'active' (RPC hasn't run yet), fix it in the returned object.
  return ((data ?? []) as HolderCredential[]).map((cred) => {
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
 * Fetch pending verification requests for the given holder DID.
 */
export async function fetchPendingRequests(
  holderDid: string
): Promise<VerificationRequest[]> {
  const { data, error } = await supabase
    .from("verification_requests")
    .select("id, verifier_id, holder_did, credential_type, purpose, status, created_at")
    .eq("holder_did", holderDid)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as VerificationRequest[];
}

/**
 * Respond to a verification request (accept or decline).
 *
 * The holder's RLS policy (added in migration 20260812000005) allows
 * UPDATE on rows where holder_did matches the holder's own DID.
 *
 * We request a row count via `select("id")` to detect silent RLS blocks:
 * Supabase returns 0 rows affected (not an error) when RLS blocks an UPDATE,
 * which previously caused a false-success toast while the DB was unchanged.
 */
/**
 * Strip large binary blobs (embedded JWS / proofValue strings) and truncate
 * any other oversized string fields from credential data before writing to
 * Supabase. This prevents "Data too long" / payload-size errors that occur
 * when credentials carry large base64-encoded proof values.
 */
function sanitizeSharedData(data: Record<string, unknown>): Record<string, unknown> {
  const MAX_STR = 2000; // chars — generous for readable fields, tight for blobs
  const clone: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(data)) {
    if (typeof val === "string" && val.length > MAX_STR) {
      // Keep a short prefix so the verifier can still see the field exists
      clone[key] = val.slice(0, MAX_STR) + "…[truncated]";
    } else if (val && typeof val === "object" && !Array.isArray(val)) {
      // Recurse one level into nested objects (e.g. credentialSubject, proof)
      const nested: Record<string, unknown> = {};
      for (const [nk, nv] of Object.entries(val as Record<string, unknown>)) {
        if (typeof nv === "string" && nv.length > MAX_STR) {
          nested[nk] = nv.slice(0, MAX_STR) + "…[truncated]";
        } else {
          nested[nk] = nv;
        }
      }
      clone[key] = nested;
    } else {
      clone[key] = val;
    }
  }

  return clone;
}

export async function respondToRequest(
  requestId: string,
  action: "accepted" | "rejected",
  options?: {
    credentialId?: string;
    sharedData?: Record<string, unknown>;
    storageConsent?: boolean;
    purpose?: string | null;
    credentialType?: string | null;
  }
): Promise<void> {
  const now = new Date();

  const payload: Record<string, unknown> = {
    status: action,
    responded_at: now.toISOString(),
  };

  if (action === "accepted" && options?.sharedData) {
    payload.credential_id          = options.credentialId || null;
    // Sanitize before writing — prevents "Data too long" for credentials
    // with large embedded proof blobs (JWS, base64-encoded signatures, etc.)
    payload.shared_credential_data = sanitizeSharedData(options.sharedData);
    payload.storage_consent        = options.storageConsent ?? false;
    if (!options.storageConsent) {
      payload.access_expires_at = new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString();
    }
  }

  const { data, error } = await supabase
    .from("verification_requests")
    .update(payload)
    .eq("id", requestId)
    .select("id");                // request affected rows back

  if (error) throw error;

  // 0 rows → RLS blocked the write (holder_did mismatch or request already gone)
  if (!data || data.length === 0) {
    throw new Error(
      "Could not update the request — it may have already been responded to, " +
      "or your DID does not match the request's holder. Please refresh and try again."
    );
  }

  // ── Background AI verification (fire-and-forget) ──────────────────────────
  if (action === "accepted" && options?.sharedData) {
    triggerAiVerification(
      requestId,
      options.sharedData,
      options.purpose ?? null,
      options.credentialType ?? null,
    );
  }
}


export interface AiVerificationResult {
  verdict: "verified" | "rejected" | "review";
  confidence: number;
  summary: string;
  checks: { label: string; pass: boolean; detail: string }[];
  engine: string;
  evaluated_at: string;
}

/** Fetch the AI analysis result for a given verification request (null if not yet evaluated). */
export async function fetchRequestAiResult(
  requestId: string
): Promise<AiVerificationResult | null> {
  const { data } = await supabase
    .from("verification_requests")
    .select("ai_analysis")
    .eq("id", requestId)
    .single();
  return (data?.ai_analysis as unknown as AiVerificationResult) ?? null;
}


/**
 * Every credential the holder owns, annotated with its soulbound badge state.
 *
 * The holder portal used to query the chain only (`tokenIdsOf(wallet)`), which
 * can never show a badge that is recorded in the database but whose mint
 * failed, and shows nothing at all when the RPC is down. Reading the database
 * first and reconciling against the chain covers both directions.
 *
 * Falls back to a direct `credentials` select if the RPC has not been
 * deployed yet, so the Badges tab still works on a stale database.
 */
export async function fetchHolderBadges(holderId: string): Promise<HolderBadge[]> {
  const { data, error } = await supabase.rpc("get_holder_badges", {
    p_holder_id: holderId,
  });
  if (!error && Array.isArray(data)) {
    return (data as HolderBadge[]).map((row) => ({
      ...row,
      sbt_token_id: row.sbt_token_id ?? null,
      sbt_status: row.sbt_status ?? null,
    }));
  }

  if (error) {
    console.warn(
      "[BlockID] get_holder_badges RPC unavailable, falling back to a direct select:",
      error.message
    );
  }

  const fallback = await supabase
    .from("credentials")
    .select(
      "id, credential_hash, status, issued_at, expires_at, sbt_requested, sbt_token_id, sbt_tx_hash, sbt_holder_address, sbt_minted_at, sbt_status, credential_schemas(name, credential_type)"
    )
    .eq("holder_id", holderId)
    .is("revoked_at", null)
    // Mirror the get_holder_badges filter: only credentials that actually have
    // badge state. Without this every credential the holder owns would be
    // rendered as a pending badge, which is worse than showing nothing.
    .or("sbt_requested.eq.true,sbt_token_id.not.is.null,sbt_status.not.is.null")
    .order("issued_at", { ascending: false });

  if (fallback.error) throw fallback.error;

  // The select returns `id` (not `credential_id`) and nests the schema under
  // `credential_schemas`, so map it explicitly rather than casting.
  const rows = (fallback.data ?? []) as unknown as Array<
    Omit<HolderBadge, "credential_id" | "schema_name" | "credential_type"> & {
      id: string;
      credential_schemas: { name: string; credential_type: string } | null;
    }
  >;

  return rows.map((row) => ({
    credential_id: row.id,
    credential_hash: row.credential_hash,
    status: row.status,
    issued_at: row.issued_at,
    expires_at: row.expires_at,
    schema_name: row.credential_schemas?.name ?? null,
    credential_type: row.credential_schemas?.credential_type ?? null,
    sbt_requested: row.sbt_requested ?? false,
    sbt_token_id: row.sbt_token_id ?? null,
    sbt_tx_hash: row.sbt_tx_hash ?? null,
    sbt_holder_address: row.sbt_holder_address ?? null,
    sbt_minted_at: row.sbt_minted_at ?? null,
    sbt_status: row.sbt_status ?? null,
  }));
}

/** A credential plus its soulbound badge state, as returned by the badge feed. */
export interface HolderBadge {
  credential_id: string;
  credential_hash: string;
  status: string;
  issued_at: string;
  expires_at: string | null;
  schema_name: string | null;
  credential_type: string | null;
  sbt_requested: boolean;
  sbt_token_id: number | string | null;
  sbt_tx_hash: string | null;
  sbt_holder_address: string | null;
  sbt_minted_at: string | null;
  sbt_status: string | null;
}

/**
 * Subscribe to real-time credential changes for the given holder.
 * Returns an unsubscribe function.
 */
export function subscribeToHolderCredentials(
  holderId: string,
  onUpdate: () => void
): () => void {
  const channel = supabase
    .channel(`holder-credentials-${holderId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "credentials" },
      onUpdate
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribe to real-time verification request changes for the given holder DID.
 * Returns an unsubscribe function.
 */
export function subscribeToVerificationRequests(
  holderDid: string,
  onUpdate: () => void
): () => void {
  const channel = supabase
    .channel(`holder-vreqs-${holderDid}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "verification_requests" },
      (payload) => {
        const row = payload.new as any;
        if (row?.holder_did === holderDid) onUpdate();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Generate a DID for the given user (calls the generate_did Supabase RPC).
 */
export async function generateDid(userId: string): Promise<string> {
  const { data, error } = await supabase.rpc("generate_did", {
    _user_id: userId,
  });
  if (error) throw error;
  return data as string;
}

