import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { AnomalyFinding } from "@/lib/ml/anomaly";
import type { TrustTier } from "@/lib/ml/trustScore";
import type { CircuitName } from "@/lib/zkp";
import { normalizePolicy, type VerificationPolicy } from "@/lib/verifier/policy";

export interface VerificationRecord {
  id: string;
  holder_did: string | null;
  credential_id: string | null;
  credential_type: string | null;
  purpose: string | null;
  status: string;
  ai_analysis: unknown;
  verified_at: string | null;
  created_at: string;
  shared_credential_data: Record<string, unknown> | null;
  access_expires_at: string | null;
  storage_consent: boolean;
  responded_at: string | null;
  // ── Intelligence columns (migration 20260926000001) ──
  zkp_circuit?: CircuitName | null;
  zkp_proof_valid?: boolean | null;
  zkp_on_chain_valid?: boolean | null;
  zkp_nullifier?: string | null;
  trust_score?: number | null;
  trust_tier?: TrustTier | null;
  anomaly_risk?: number | null;
  anomaly_findings?: AnomalyFinding[] | null;
  biometric_verified?: boolean | null;
  sbt_token_id?: number | null;
  policy_id?: string | null;
}

export interface FetchRecordsOptions {
  status?: string | null;
  credentialType?: string | null;
  search?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  /** pagination window start (inclusive) */
  from?: number;
  /** pagination window end (inclusive) */
  to?: number;
}

export interface VerificationRecordPage {
  records: VerificationRecord[];
  count: number;
}

/**
 * Fetch verification records for the given verifier with optional
 * server-side filtering + pagination. Returns the matching rows and
 * the total number of rows (before pagination).
 */
export async function fetchVerificationRecords(
  verifierId: string,
  options: FetchRecordsOptions = {}
): Promise<VerificationRecordPage> {
  let query = supabase
    .from("verification_requests")
    .select("*", { count: "exact" })
    .eq("verifier_id", verifierId)
    .order("created_at", { ascending: false });

  if (options.status) query = query.eq("status", options.status);
  if (options.credentialType) query = query.eq("credential_type", options.credentialType);
  if (options.search) {
    const q = options.search.trim();
    if (q) {
      query = query.or(
        `holder_did.ilike.%${q}%,credential_type.ilike.%${q}%,purpose.ilike.%${q}%`
      );
    }
  }
  if (options.startDate) query = query.gte("created_at", options.startDate);
  if (options.endDate) query = query.lte("created_at", options.endDate);

  if (options.from !== undefined && options.to !== undefined) {
    query = query.range(options.from, options.to);
  }

  const { data, count, error } = await query;
  if (error) throw error;
  // The generated row types use `Json` for the JSONB columns; the app-facing
  // `VerificationRecord` narrows them to the shapes the services produce.
  return { records: (data ?? []) as unknown as VerificationRecord[], count: count ?? 0 };
}

/**
 * Fetch all verification records for the given verifier (newest first).
 * Used by the dashboard / activity feed. Kept as a convenience wrapper.
 */
export async function fetchLatestVerificationRecords(
  verifierId: string,
  limit = 300
): Promise<VerificationRecord[]> {
  const { records } = await fetchVerificationRecords(verifierId, { from: 0, to: limit - 1 });
  return records;
}

/**
 * Count verification records, optionally filtered.
 */
export async function countVerificationRecords(
  verifierId: string,
  options: Omit<FetchRecordsOptions, "from" | "to"> = {}
): Promise<number> {
  const page = await fetchVerificationRecords(verifierId, options);
  return page.count;
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
 *
 * `request_id` is optional: when present the edge function writes its result
 * onto that existing row instead of inserting a new one, so verifying a
 * presentation out of the inbox does not create a duplicate history entry.
 */
export async function callVerifyEdgeFunction(
  body: ({ credential_id: string } | { vp_json: unknown }) & { request_id?: string },
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
    let message = `verify-credential failed (HTTP ${res.status})`;
    try {
      const body = JSON.parse(text);
      if (body?.error && typeof body.error === "string") message = body.error;
    } catch {
      // Non-JSON error body — keep the generic message
    }
    throw new Error(message.slice(0, 240));
  }
  return res.json();
}

export interface BulkVerifyItem {
  label: string;
  body: { credential_id: string } | { vp_json: unknown };
}

export interface BulkVerifyResult {
  label: string;
  status: "success" | "error";
  data?: Record<string, unknown>;
  error?: string;
}

/**
 * Verify multiple credentials sequentially (bounded) against the
 * verify-credential edge function. Calls onProgress as each item resolves.
 */
export async function bulkVerify(
  items: BulkVerifyItem[],
  accessToken: string,
  onProgress?: (done: number, total: number) => void
): Promise<BulkVerifyResult[]> {
  const results: BulkVerifyResult[] = [];
  let done = 0;
  for (const item of items) {
    try {
      const data = await callVerifyEdgeFunction(item.body, accessToken);
      results.push({ label: item.label, status: "success", data });
    } catch (err) {
      results.push({
        label: item.label,
        status: "error",
        error: err instanceof Error ? err.message : "Verification failed",
      });
    }
    done += 1;
    onProgress?.(done, items.length);
  }
  return results;
}

// ── Export helpers ──────────────────────────────────────────────────────────

const csvEscape = (value: unknown): string => {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

export function verificationRecordsToCSV(records: VerificationRecord[]): string {
  const headers = [
    "created_at",
    "status",
    "credential_type",
    "holder_did",
    "purpose",
    "ai_score",
    "ai_confidence",
    "ai_risk",
    "verified_at",
    "responded_at",
    "stored",
    "access_expires_at",
    "trust_score",
    "trust_tier",
    "anomaly_risk",
    "zkp_circuit",
    "zkp_proof_valid",
    "zkp_on_chain_valid",
    "biometric_verified",
    "sbt_token_id",
  ];
  const rows = records.map((r) => {
    const ai = (r.ai_analysis as any) ?? {};
    return [
      r.created_at,
      r.status,
      r.credential_type ?? "",
      r.holder_did ?? "",
      r.purpose ?? "",
      ai.score ?? "",
      ai.confidence ?? "",
      ai.risk_level ?? "",
      r.verified_at ?? "",
      r.responded_at ?? "",
      r.storage_consent ? "true" : "false",
      r.access_expires_at ?? "",
      r.trust_score ?? "",
      r.trust_tier ?? "",
      r.anomaly_risk ?? "",
      r.zkp_circuit ?? "",
      r.zkp_proof_valid == null ? "" : String(r.zkp_proof_valid),
      r.zkp_on_chain_valid == null ? "" : String(r.zkp_on_chain_valid),
      r.biometric_verified == null ? "" : String(r.biometric_verified),
      r.sbt_token_id ?? "",
    ]
      .map(csvEscape)
      .join(",");
  });
  return [headers.join(","), ...rows].join("\n");
}

export function downloadTextFile(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Verification policies (Phase 7) ──────────────────────────────────────────

export interface VerificationPolicyRow {
  id: string;
  verifier_id: string;
  name: string;
  description: string | null;
  policy_json: VerificationPolicy;
  is_active: boolean;
  created_at: string;
}

/**
 * Stored policies are JSONB, so the value comes back as `Json`. Repair it
 * through the shared `normalizePolicy` so a hand-edited or legacy row can
 * never crash the whole policy list.
 */

export async function fetchPolicies(verifierId: string): Promise<VerificationPolicyRow[]> {
  const { data, error } = await supabase
    .from("verification_policies")
    .select("*")
    .eq("verifier_id", verifierId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, policy_json: normalizePolicy(r.policy_json) }));
}

export async function createPolicy(
  verifierId: string,
  input: { name: string; description?: string; policy_json: VerificationPolicy; is_active?: boolean }
): Promise<VerificationPolicyRow> {
  const { data, error } = await supabase
    .from("verification_policies")
    .insert({
      verifier_id: verifierId,
      name: input.name,
      description: input.description ?? null,
      policy_json: input.policy_json as unknown as Json,
      is_active: input.is_active ?? false,
    })
    .select("*")
    .single();
  if (error) throw error;
  return { ...data, policy_json: normalizePolicy(data.policy_json) };
}

export async function updatePolicy(
  policyId: string,
  patch: Partial<Pick<VerificationPolicyRow, "name" | "description" | "policy_json" | "is_active">>
): Promise<void> {
  const payload: {
    name?: string;
    description?: string | null;
    is_active?: boolean;
    policy_json?: Json;
  } = {};
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.description !== undefined) payload.description = patch.description;
  if (patch.is_active !== undefined) payload.is_active = patch.is_active;
  if (patch.policy_json !== undefined) payload.policy_json = patch.policy_json as unknown as Json;

  const { error } = await supabase
    .from("verification_policies")
    .update(payload)
    .eq("id", policyId);
  if (error) throw error;
}

/** Activate exactly one policy and deactivate every sibling in one pass. */
export async function activatePolicy(verifierId: string, policyId: string): Promise<void> {
  const { error } = await supabase
    .from("verification_policies")
    .update({ is_active: false })
    .eq("verifier_id", verifierId)
    .neq("id", policyId);
  if (error) throw error;
  const { error: activeError } = await supabase
    .from("verification_policies")
    .update({ is_active: true })
    .eq("id", policyId);
  if (activeError) throw activeError;
}

export async function deletePolicy(policyId: string): Promise<void> {
  const { error } = await supabase.from("verification_policies").delete().eq("id", policyId);
  if (error) throw error;
}

// ── Verifier blocklist (Phase 8) ─────────────────────────────────────────────

export interface BlocklistEntry {
  id: string;
  verifier_id: string;
  holder_did: string;
  reason: string | null;
  blocked_at: string;
}

export async function fetchBlocklist(verifierId: string): Promise<BlocklistEntry[]> {
  const { data, error } = await supabase
    .from("verifier_blocklist")
    .select("*")
    .eq("verifier_id", verifierId)
    .order("blocked_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as BlocklistEntry[];
}

export async function addToBlocklist(
  verifierId: string,
  holderDid: string,
  reason?: string
): Promise<void> {
  const { error } = await supabase.from("verifier_blocklist").insert({
    verifier_id: verifierId,
    holder_did: holderDid,
    reason: reason ?? null,
  });
  if (error) throw error;
}

export async function removeFromBlocklist(entryId: string): Promise<void> {
  const { error } = await supabase.from("verifier_blocklist").delete().eq("id", entryId);
  if (error) throw error;
}

// ── Verification intelligence persistence ────────────────────────────────────

/** Persist trust/anomaly/ZKP conclusions against a verification request row. */
export async function saveVerificationIntelligence(
  requestId: string,
  patch: Partial<
    Pick<
      VerificationRecord,
      | "zkp_circuit"
      | "zkp_proof_valid"
      | "zkp_on_chain_valid"
      | "zkp_nullifier"
      | "trust_score"
      | "trust_tier"
      | "anomaly_risk"
      | "anomaly_findings"
      | "biometric_verified"
      | "sbt_token_id"
      | "policy_id"
    >
  >
): Promise<void> {
  const { error } = await supabase
    .from("verification_requests")
    .update(patch as Record<string, unknown>)
    .eq("id", requestId);
  if (error) throw error;
}

/**
 * Close out an inbox row with the outcome of a `verify-credential` run.
 *
 * The edge function normally writes this itself when it is given `request_id`,
 * but this client-side write is the guarantee that a presentation always
 * leaves the inbox — including against a deployed function that predates
 * `request_id` support. Writing the same values twice is harmless.
 *
 * Scoped by `verifier_id` so one verifier can never decide another's row.
 */
export async function applyVerificationToRequest(
  requestId: string,
  verifierId: string,
  result: Record<string, unknown>
): Promise<void> {
  const ai = (result.ai_analysis ?? null) as
    | { score?: unknown; tier?: unknown }
    | null;
  const { error } = await supabase
    .from("verification_requests")
    .update({
      status: result.valid === true ? "verified" : "rejected",
      verified_at: new Date().toISOString(),
      trust_score: typeof ai?.score === "number" ? ai.score : null,
      trust_tier: typeof ai?.tier === "string" ? ai.tier : null,
      ai_analysis: (result.ai_analysis ?? null) as Json,
    })
    .eq("id", requestId)
    .eq("verifier_id", verifierId);
  if (error) throw error;
}
