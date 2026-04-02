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
 * Generate a DID for the given user (calls the generate_did Supabase RPC).
 */
export async function generateDid(userId: string): Promise<string> {
  const { data, error } = await supabase.rpc("generate_did", {
    _user_id: userId,
  });
  if (error) throw error;
  return data as string;
}
