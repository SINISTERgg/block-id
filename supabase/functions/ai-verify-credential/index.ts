// @ts-nocheck
// Supabase Edge Function: ai-verify-credential
// Called after a holder accepts a verification request.
//
// Runs the canonical deterministic trust engine and persists the result on the
// verification request. The optional LLM layer may only add prose — it has no
// authority over the verdict, the score or the risk level.
//
// This was previously a separate, much weaker rule set with a second
// hand-maintained weight table, and it let Gemini return the `verdict` that was
// written straight to `verification_requests.status`. Both are fixed: there is
// now one engine, and the verdict is computed from signals.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { clientIp, rateLimited, tooManyRequestsResponse, requireUser, sanitizedError, jsonResponse } from "../_shared/security.ts";
import { analyzeWithNarrative, isCredentialAcceptable } from "../verify-credential/ai-engine.ts";
import { chargeAiBudget } from "../_shared/aiBudget.ts";
import { resolveIssuer, daysSince, unverifiedChecks, type CredentialSignals } from "../_shared/credentialEngine.ts";
import { AI_ANALYSIS_SCHEMA_VERSION } from "../_shared/credentialEngine.ts";
import { computeCredentialHash } from "../_shared/vc-hash.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_LIMIT_MAX = 30;
const MAX_CREDENTIAL_DATA_BYTES = 2_000_000;
/** Background job — the holder is not waiting on a spinner, so fail fast. */
const LLM_TIMEOUT_MS = 8_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || undefined;

/**
 * Legacy flat check list retained for the holder UI, which renders it directly.
 * Derived from the canonical analysis so it can never disagree with the score.
 */
function buildLegacyChecks(analysis: any, subjectFieldCount: number, issuer: unknown, hasTypeMatch: boolean, expectedType: string | null, actualType: string): { label: string; pass: boolean; detail: string }[] {
  const dim = (key: string) => analysis.dimensions.find((d: any) => d.key === key);
  const statusOf = (key: string) => {
    const d = dim(key);
    if (!d) return "unknown" as const;
    return d.status;
  };
  const pass = (key: string) => statusOf(key) === "pass";

  return [
    {
      label: "Expiry",
      pass: pass("expiration"),
      detail: dim("expiration")?.detail ?? "Unknown",
    },
    {
      label: "Issuer",
      pass: !!issuer && issuer !== "unknown",
      detail: issuer ? `Issued by ${issuer}` : "No issuer found",
    },
    {
      label: "Credential Subject",
      pass: subjectFieldCount > 0,
      detail: subjectFieldCount > 0 ? `${subjectFieldCount} field(s) present` : "Empty credential subject",
    },
    ...(expectedType
      ? [{
          label: "Type Match",
          pass: hasTypeMatch,
          detail: hasTypeMatch ? `Credential type matches: ${actualType}` : `Type mismatch: got "${actualType}", expected "${expectedType}"`,
        }]
      : []),
    {
      label: "Hash Integrity",
      pass: pass("hashIntegrity"),
      detail: dim("hashIntegrity")?.detail ?? "Unknown",
    },
    {
      label: "Revocation",
      pass: pass("revocationStatus"),
      detail: dim("revocationStatus")?.detail ?? "Unknown",
    },
  ];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (rateLimited(clientIp(req), 60_000, RATE_LIMIT_MAX)) {
      return tooManyRequestsResponse(corsHeaders);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── Auth: caller must be an authenticated user ─────────────────────────────
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);

    const rawBody = await req.text();
    if (rawBody.length > MAX_CREDENTIAL_DATA_BYTES) {
      return jsonResponse({ error: "Request body too large" }, 413, corsHeaders);
    }
    let body;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400, corsHeaders);
    }
    const { request_id, credential_data, request_purpose, credential_type } = body;

    if (typeof request_id !== "string" || !UUID_PATTERN.test(request_id)) {
      return jsonResponse({ error: "request_id must be a valid UUID" }, 400, corsHeaders);
    }
    if (!credential_data || (typeof credential_data !== "object" && typeof credential_data !== "string")) {
      return jsonResponse({ error: "credential_data is required" }, 400, corsHeaders);
    }

    // ── Ownership: the request must belong to the calling holder ───────────────
    const { data: request, error: requestError } = await supabase
      .from("verification_requests")
      .select("id, holder_did, credential_id")
      .eq("id", request_id)
      .single();
    if (requestError || !request) return jsonResponse({ error: "Request not found" }, 404, corsHeaders);

    const { data: ownProfile } = await supabase
      .from("profiles")
      .select("did")
      .eq("user_id", user.id)
      .single();
    const callerDid = ownProfile?.did || "";
    if (!callerDid || callerDid !== request.holder_did) {
      return jsonResponse({ error: "Forbidden: not the request holder" }, 403, corsHeaders);
    }

    let vc: Record<string, unknown>;
    if (typeof credential_data === "string") {
      try {
        vc = JSON.parse(credential_data);
      } catch {
        return jsonResponse({ error: "credential_data is not valid JSON" }, 400, corsHeaders);
      }
    } else {
      vc = credential_data;
    }
    if (!vc || typeof vc !== "object" || Array.isArray(vc)) {
      return jsonResponse({ error: "credential_data must be a credential object" }, 400, corsHeaders);
    }

    // ── Load the stored row when there is one ─────────────────────────────────
    // The holder's payload is untrusted. When the request references a stored
    // credential we score the stored record, so a holder cannot present altered
    // JSON and have it scored as if it were genuine.
    let stored: Record<string, unknown> | null = null;
    if (request.credential_id) {
      const { data } = await supabase
        .from("credentials")
        .select("*, prev_hash, credential_schemas(*)")
        .eq("id", request.credential_id)
        .maybeSingle();
      stored = data ?? null;
    }

    const authoritativeVc = (stored?.credential_data as Record<string, unknown>) ?? vc;
    const proof = authoritativeVc.proof as Record<string, unknown> | undefined;
    const hasWalletSignature = proof?.signatureType === "personal_sign" && !!proof?.proofValue;

    // Hash integrity requires a stored digest to compare against, so it is
    // recomputed with the same shared canonicaliser that issue-credential and
    // verify-credential use. With no stored row there is nothing to compare
    // and the engine is told the check did not run, rather than being handed a
    // pass it did not earn.
    let hashChecked = false;
    let hashValid = false;
    if (stored) {
      try {
        const recomputed = await computeCredentialHash(
          (stored.credential_data as Record<string, unknown>) ?? {},
          stored.prev_hash || "genesis",
        );
        hashValid = recomputed === stored.credential_hash;
        hashChecked = true;
      } catch (err) {
        console.warn("ai-verify-credential: hash recomputation failed:", err);
        hashChecked = false;
        hashValid = false;
      }
    }

    const issuer = resolveIssuer(authoritativeVc) ?? "unknown";
    const issuanceDate = (authoritativeVc.issuanceDate as string) ?? null;
    const subject = (authoritativeVc.credentialSubject as Record<string, unknown>) ?? {};
    const subjectFieldCount = Object.keys(subject).length;
    const actualType = Array.isArray(authoritativeVc.type) ? (authoritativeVc.type as string[]).join(", ") : "Unknown";
    const hasTypeMatch = !!credential_type && actualType.toLowerCase().includes(String(credential_type).toLowerCase());

    const signals: CredentialSignals = {
      vc: authoritativeVc,
      hashChecked,
      hashValid,
      dbStatus: (stored?.status as string) ?? "active",
      blockchainVerified: false,
      onChainRevoked: false,
      blockchainAnchor: (stored?.blockchain_anchor as string) ?? null,
      // This pre-check performs no chain calls, so the anchor is unknown here
      // rather than absent. `verify-credential` is what actually anchors.
      onChainChecked: false,
      walletSigned: hasWalletSignature,
      signatureVerified: hasWalletSignature ? null : false,
      signerAddress: (stored?.signer_address as string) ?? null,
      issuedAt: (stored?.issued_at as string) ?? issuanceDate,
      expiresAt: (stored?.expires_at as string) ?? ((authoritativeVc.expirationDate as string) ?? null),
      notExpired: expirationDate ? new Date(expirationDate) > new Date() : null,
      credentialHash: (stored?.credential_hash as string) ?? "",
      issuerReputation: null,
      verificationSuccessRate: null,
      credentialAgeDays: issuanceDate ? daysSince(issuanceDate) : null,
      zkProofVerified: (authoritativeVc.zkp as Record<string, unknown> | undefined)?.verified ?? null,
      schemaKnown: stored?.credential_schemas ? true : null,
    };

    // The narrative is metered work, so it draws on a per-user budget. Exhausting
    // it drops the prose and nothing else: the verdict below is derived
    // entirely from the deterministic signals and must stay identical.
    const budget = chargeAiBudget(user.id, "ai-verify-credential");

    const outcome = await analyzeWithNarrative(signals, {
      apiKey: GEMINI_API_KEY,
      model: GEMINI_MODEL,
      timeoutMs: LLM_TIMEOUT_MS,
      surface: "ai-verify-credential",
      userId: user.id,
      requestId: request_id,
      telemetry: supabase,
      skipLlmReason: budget.allowed ? undefined : "ai_budget_exhausted",
    });
    const analysis = outcome.analysis;

    // ── Verdict: derived from the engine, never from model output ─────────────
    const { valid, reasons } = isCredentialAcceptable(signals);
    const incomplete = unverifiedChecks(signals);

    // This surface is a *pre*-check: it deliberately performs no chain calls,
    // because the authoritative chain verification happens later in
    // `verify-credential`. A missing anchor check is therefore expected here
    // and does not on its own hold the verdict at "review" — otherwise this
    // function could never return "verified" and the auto-verify flow would be
    // dead. A missing hash check or an unverifiable signature does hold it.
    const substantiveGaps = incomplete.filter((c) => c !== "blockchain_anchor");

    const verdict: "verified" | "rejected" | "review" = !valid
      ? "rejected"
      : substantiveGaps.length > 0
        ? "review"
        : credential_type && !hasTypeMatch
          ? "review"
          : analysis.hard_caps_applied.length > 0
            ? "review"
            : "verified";

    const checks = buildLegacyChecks(analysis, subjectFieldCount, issuer, hasTypeMatch, credential_type ?? null, actualType);
    const summary =
      analysis.llm?.summary ||
      (verdict === "verified"
        ? `Credential passes all checks the engine could perform. Score ${analysis.score}/100, confidence ${analysis.confidence}%.`
        : verdict === "review"
          ? `Credential needs review: ${reasons.length ? reasons.join(", ") : credential_type ? "credential type does not match what was requested" : "risk caps were applied"}. Score ${analysis.score}/100.`
          : `Credential rejected: ${reasons.join(", ")}. Score ${analysis.score}/100.`);

    // One shape on the column. `confidence` is 0-100, matching every other writer.
    const aiResult = {
      schema_version: AI_ANALYSIS_SCHEMA_VERSION,
      engine: analysis.engine,
      score: analysis.score,
      raw_score: analysis.raw_score,
      risk_level: analysis.risk_level,
      tier: analysis.tier,
      confidence: analysis.confidence,
      confidence_factors: analysis.confidence_factors,
      hard_caps_applied: analysis.hard_caps_applied,
      dimensions: analysis.dimensions,
      recommendations: analysis.recommendations,
      findings: analysis.findings,
      llm: analysis.llm,
      // Fields the holder portal reads. Retained for compatibility.
      verdict,
      invalid_reasons: reasons,
      unverified_checks: incomplete,
      summary,
      checks,
      purpose: request_purpose ?? null,
      evaluated_at: analysis.analyzed_at,
    };

    const newStatus = verdict === "verified" ? "verified" : verdict === "rejected" ? "rejected" : "accepted";
    await supabase
      .from("verification_requests")
      .update({
        status: newStatus,
        trust_score: analysis.score,
        trust_tier: analysis.tier,
        ai_analysis: aiResult,
        verified_at: new Date().toISOString(),
      })
      .eq("id", request_id);

    return new Response(JSON.stringify(aiResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-verify-credential error:", e);
    return new Response(JSON.stringify({ error: sanitizedError(e, "AI verification failed") }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
