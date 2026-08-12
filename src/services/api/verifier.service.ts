import { supabase } from "@/integrations/supabase/client";

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
  return { records: (data ?? []) as VerificationRecord[], count: count ?? 0 };
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
