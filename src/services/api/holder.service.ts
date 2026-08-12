import { supabase } from "@/integrations/supabase/client";

export interface HolderCredential {
  id: string;
  credential_data: unknown;
  credential_hash: string;
  blockchain_anchor: string | null;
  status: string;
  issued_at: string;
  credential_schemas: { name: string; credential_type: string } | null;
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
      "id, credential_data, credential_hash, blockchain_anchor, status, issued_at, expires_at, credential_schemas(name, credential_type)"
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
      (cred as any).expires_at &&
      new Date((cred as any).expires_at).getTime() < now
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
export async function respondToRequest(
  requestId: string,
  action: "accepted" | "rejected",
  options?: {
    credentialId?: string;
    sharedData?: Record<string, unknown>;
    storageConsent?: boolean;
  }
): Promise<void> {
  const now = new Date();

  const payload: Record<string, unknown> = {
    status: action,
    responded_at: now.toISOString(),
  };

  if (action === "accepted" && options?.sharedData) {
    payload.credential_id          = options.credentialId || null;
    payload.shared_credential_data = options.sharedData;
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

