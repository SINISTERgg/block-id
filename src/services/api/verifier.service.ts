import { supabase } from "@/integrations/supabase/client";

export interface VerificationRecord {
  id: string;
  holder_did: string | null;
  credential_id: string | null;
  credential_type: string | null;
  purpose: string;
  status: string;
  ai_analysis: unknown;
  verified_at: string | null;
  created_at: string;
  shared_credential_data: Record<string, unknown> | null;
  access_expires_at: string | null;
  storage_consent: boolean;
  responded_at: string | null;
}

/**
 * Fetch all verification records for the given verifier (max 100, newest first).
 */
export async function fetchVerificationRecords(
  verifierId: string
): Promise<VerificationRecord[]> {
  const { data, error } = await supabase
    .from("verification_requests")
    .select("*")
    .eq("verifier_id", verifierId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as VerificationRecord[];
}

/**
 * Submit a new verification request from the verifier to a holder DID.
 */
export async function submitVerificationRequest(
  verifierId: string,
  holderDid: string,
  credentialType: string | null,
  purpose: string
): Promise<void> {
  const { error } = await supabase.from("verification_requests").insert({
    verifier_id: verifierId,
    holder_did: holderDid,
    credential_type: credentialType || null,
    purpose,
    status: "pending",
  });
  if (error) throw error;
}

/**
 * Call the verify-credential Supabase Edge Function.
 * Accepts either a credential_id (UUID) or a raw VP JSON object.
 */
export async function callVerifyEdgeFunction(
  body: { credential_id: string } | { vp_json: unknown },
  accessToken: string
): Promise<Record<string, unknown>> {
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-credential`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`verify-credential failed: ${text}`);
  }
  return res.json();
}
