import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  clientIp,
  jsonResponse,
  rateLimited,
  requireUser,
  sanitizedError,
  tooManyRequestsResponse,
} from "../_shared/security.ts";
import { analyzeCredential, isCredentialAcceptable, unverifiedChecks, resolveIssuer, daysSince, type CredentialSignals } from "../_shared/credentialEngine.ts";
import { recordAiCall } from "../_shared/aiTelemetry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REQUEST_RATE_LIMIT_MAX = 30;
const RESPONSE_RATE_LIMIT_MAX = 60;
const STATUS_RATE_LIMIT_MAX = 60;

async function hashData(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const url = new URL(req.url);
  const pathSegment = url.pathname.split("/").pop();

  try {
    // ─── 1. Create Presentation Request (verifier calls this) ───
    if (req.method === "POST" && pathSegment === "request") {
      if (rateLimited(clientIp(req), 60_000, REQUEST_RATE_LIMIT_MAX, "oid4vp:request")) {
        return tooManyRequestsResponse(corsHeaders);
      }

      const user = await requireUser(req);
      if (!user) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);

      let body;
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400, corsHeaders);
      }
      const { credential_types, purpose, fields, expires_in_minutes } = body;
      if (!Array.isArray(credential_types) || credential_types.length === 0) {
        return jsonResponse({ error: "credential_types required" }, 400, corsHeaders);
      }

      const requestCode = await hashData(`${user.id}:vp:${Date.now()}:${crypto.randomUUID()}`);
      const expiresAt = new Date(Date.now() + (expires_in_minutes || 15) * 60000).toISOString();

      // Build OID4VP Presentation Definition
      const presentationDefinition = {
        id: crypto.randomUUID(),
        input_descriptors: credential_types.map((type: string, i: number) => ({
          id: `descriptor_${i}`,
          name: type,
          purpose: purpose || "Verification required",
          constraints: {
            fields: [
              {
                path: ["$.type"],
                filter: { type: "array", contains: { const: type } },
              },
              ...(fields || []).map((f: string) => ({
                path: [`$.credentialSubject.${f}`],
                purpose: `Required field: ${f}`,
              })),
            ],
          },
        })),
      };

      const { data: session, error } = await supabase.from("oid4vc_sessions").insert({
        session_type: "presentation_request",
        user_id: user.id,
        pre_authorized_code: requestCode,
        presentation_definition: presentationDefinition,
        expires_at: expiresAt,
        metadata: { purpose, credential_types },
      }).select().single();

      if (error) throw error;

      const responseUri = `${supabaseUrl}/functions/v1/oid4vp/response`;

      // OID4VP Authorization Request URI
      const authRequest = {
        response_type: "vp_token",
        client_id: `${supabaseUrl}/functions/v1/oid4vp`,
        response_uri: responseUri,
        response_mode: "direct_post",
        presentation_definition: presentationDefinition,
        nonce: requestCode,
        state: session.id,
      };

      const requestUrl = `openid4vp://?${new URLSearchParams({
        client_id: authRequest.client_id,
        response_type: "vp_token",
        response_uri: responseUri,
        response_mode: "direct_post",
        nonce: requestCode,
        state: session.id,
        presentation_definition: JSON.stringify(presentationDefinition),
      }).toString()}`;

      return new Response(JSON.stringify({
        request_url: requestUrl,
        request_code: requestCode,
        session_id: session.id,
        presentation_definition: presentationDefinition,
        expires_at: expiresAt,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── 2. Receive Presentation Response (wallet posts VP here) ───
    if (req.method === "POST" && pathSegment === "response") {
      if (rateLimited(clientIp(req), 60_000, RESPONSE_RATE_LIMIT_MAX, "oid4vp:response")) {
        return tooManyRequestsResponse(corsHeaders);
      }

      let body: any;
      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("application/x-www-form-urlencoded")) {
        body = Object.fromEntries(new URLSearchParams(await req.text()));
      } else {
        body = await req.json();
      }

      const { vp_token, state, presentation_submission } = body;
      if (!state || typeof state !== "string") return jsonResponse({ error: "state required" }, 400, corsHeaders);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(state)) {
        return jsonResponse({ error: "state must be a session UUID" }, 400, corsHeaders);
      }

      const { data: session } = await supabase
        .from("oid4vc_sessions")
        .select("*")
        .eq("id", state)
        .eq("status", "pending")
        .single();

      if (!session) throw new Error("Invalid or expired session");
      if (new Date(session.expires_at) < new Date()) throw new Error("Request expired");

      // Parse vp_token
      let vpData: any;
      try {
        vpData = typeof vp_token === "string" ? JSON.parse(vp_token) : vp_token;
      } catch {
        vpData = { raw: vp_token };
      }

      // Basic validation
      const verificationResult: any = {
        presented: true,
        format: vpData?.type ? "ldp_vp" : "jwt_vp",
        holder: vpData?.holder || vpData?.credentialSubject?.id || "unknown",
        credentials_count: vpData?.verifiableCredential
          ? Array.isArray(vpData.verifiableCredential)
            ? vpData.verifiableCredential.length
            : 1
          : 0,
      };

      // Update session
      await supabase.from("oid4vc_sessions").update({
        status: "completed",
        response_data: {
          vp_token: vpData,
          presentation_submission,
          verification: verificationResult,
        },
        updated_at: new Date().toISOString(),
      }).eq("id", session.id);

      // ── Score the presentation with the canonical engine ────────────────────
      // This used to write a hardcoded `{confidence: 85, risk_level: "low"}`
      // and mark the request `status: "verified"` without checking anything.
      // A protocol receipt is not a verification: this surface performs no
      // chain or digest checks, so the engine is told those checks did not run
      // and the resulting low confidence is reported honestly. The full
      // verification happens in `verify-credential`.
      const firstVc: Record<string, unknown> = (Array.isArray(vpData?.verifiableCredential)
        ? vpData.verifiableCredential[0]
        : vpData?.verifiableCredential) ?? vpData ?? {};

      const signals: CredentialSignals = {
        vc: firstVc,
        hashChecked: false,
        hashValid: false,
        dbStatus: "active",
        blockchainVerified: false,
        onChainRevoked: false,
        blockchainAnchor: null,
        onChainChecked: false,
        walletSigned: !!(firstVc?.proof as Record<string, unknown> | undefined)?.proofValue,
        signatureVerified: null,
        signerAddress: ((firstVc?.proof as Record<string, unknown> | undefined)?.signedBy as string) ?? null,
        issuedAt: (firstVc?.issuanceDate as string) ?? null,
        expiresAt: (firstVc?.expirationDate as string) ?? null,
        notExpired: firstVc?.expirationDate ? new Date(firstVc.expirationDate as string) > new Date() : null,
        credentialHash: "",
        issuerReputation: null,
        verificationSuccessRate: null,
        credentialAgeDays: firstVc?.issuanceDate ? daysSince(firstVc.issuanceDate as string) : null,
        // `verified` is untyped JSON here, so it arrives as `unknown`. Only a
        // literal `true` counts as a verified proof; anything else stays null so
        // the engine reports it as unknown rather than passing a truthy string.
        zkProofVerified:
          (firstVc?.zkp as Record<string, unknown> | undefined)?.verified === true
            ? true
            : null,
        schemaKnown: null,
      };

      const analysis = analyzeCredential(signals);
      const { valid } = isCredentialAcceptable(signals);
      const incomplete = unverifiedChecks(signals);
      // Nothing has been cryptographically checked on this path, so the
      // request is recorded as `accepted` (presentation received) rather than
      // `verified` (claims checked). Downstream policy sees the difference.
      const requestStatus = valid && analysis.hard_caps_applied.length === 0 ? "accepted" : "rejected";

      await recordAiCall(supabase, {
        surface: "oid4vp",
        engine: analysis.engine,
        model: null,
        llmEnabled: false,
        degraded: true,
        error: "deterministic_only",
        latencyMs: null,
        totalLatencyMs: null,
        attempts: 0,
        promptTokens: null,
        candidatesTokens: null,
        schemaVersion: analysis.schema_version,
        score: analysis.score,
        riskLevel: analysis.risk_level,
        confidence: analysis.confidence,
        hardCapsCount: analysis.hard_caps_applied.length,
        userId: session.user_id,
        metadata: { credentials_count: verificationResult.credentials_count, issuer: resolveIssuer(firstVc) },
      });

      // Create verification request record
      await supabase.from("verification_requests").insert({
        verifier_id: session.user_id,
        holder_did: verificationResult.holder,
        credential_type: session.metadata?.credential_types?.[0] || null,
        purpose: session.metadata?.purpose || "OID4VP verification",
        status: requestStatus,
        trust_score: analysis.score,
        trust_tier: analysis.tier,
        verified_at: new Date().toISOString(),
        ai_analysis: {
          ...analysis,
          source: "oid4vp",
          credentials_count: verificationResult.credentials_count,
          unverified_checks: incomplete,
          provisional: true,
          // Retained so the existing OID4VP audit trail still resolves.
          findings: [
            "Credential presented via OpenID4VP protocol",
            `${verificationResult.credentials_count} credential(s) received`,
            ...analysis.findings,
          ],
        },
      });

      // Audit
      await supabase.from("audit_logs").insert({
        user_id: session.user_id,
        action: "oid4vp_presentation_received",
        entity_type: "verification",
        entity_id: session.id,
        metadata: { holder: verificationResult.holder, credentials_count: verificationResult.credentials_count },
      });

      return new Response(JSON.stringify({ status: "ok", verification: verificationResult }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── 3. Check session status (polling) ───
    if (req.method === "GET" && pathSegment === "status") {
      if (rateLimited(clientIp(req), 60_000, STATUS_RATE_LIMIT_MAX, "oid4vp:status")) {
        return tooManyRequestsResponse(corsHeaders);
      }

      const user = await requireUser(req);
      if (!user) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);

      const sessionId = url.searchParams.get("session_id");
      if (!sessionId || typeof sessionId !== "string") {
        return jsonResponse({ error: "session_id required" }, 400, corsHeaders);
      }

      const { data: session } = await supabase
        .from("oid4vc_sessions")
        .select("id, status, session_type, response_data, expires_at, created_at, user_id")
        .eq("id", sessionId)
        .single();

      if (!session) return jsonResponse({ error: "Session not found" }, 404, corsHeaders);

      // Only the requesting verifier (or an org admin) may read a session.
      if (session.user_id !== user.id) {
        return jsonResponse({ error: "Forbidden" }, 403, corsHeaders);
      }

      return new Response(JSON.stringify(session), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return jsonResponse({ error: "Unknown endpoint" }, 404, corsHeaders);
  } catch (e) {
    console.error("oid4vp error:", e);
    return jsonResponse({ error: sanitizedError(e, "OID4VP request failed") }, 400, corsHeaders);
  }
});
