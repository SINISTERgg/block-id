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
 */
export async function fetchHolderCredentials(
  holderId: string
): Promise<HolderCredential[]> {
  const { data, error } = await supabase
    .from("credentials")
    .select(
      "id, credential_data, credential_hash, blockchain_anchor, status, issued_at, credential_schemas(name, credential_type)"
    )
    .eq("holder_id", holderId)
    .order("issued_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as HolderCredential[];
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
 * When accepting, optionally attach credential data with time-limited access.
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
  const updatePayload: Record<string, unknown> = {
    status: action,
    responded_at: now.toISOString(),
  };

  if (action === "accepted" && options?.sharedData) {
    updatePayload.credential_id = options.credentialId || null;
    updatePayload.shared_credential_data = options.sharedData;
    updatePayload.storage_consent = options.storageConsent ?? false;
    // Access expires in 4 hours unless storage consent is granted
    if (!options.storageConsent) {
      const expiresAt = new Date(now.getTime() + 4 * 60 * 60 * 1000);
      updatePayload.access_expires_at = expiresAt.toISOString();
    }
  }

  const { error } = await supabase
    .from("verification_requests")
    .update(updatePayload)
    .eq("id", requestId);
  if (error) throw error;
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

