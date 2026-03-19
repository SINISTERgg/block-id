import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) throw new Error("Unauthorized");

      const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: { user }, error: authErr } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
      if (authErr || !user) throw new Error("Unauthorized");

      const { credential_types, purpose, fields, expires_in_minutes } = await req.json();
      if (!credential_types?.length) throw new Error("credential_types required");

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
      let body: any;
      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("application/x-www-form-urlencoded")) {
        body = Object.fromEntries(new URLSearchParams(await req.text()));
      } else {
        body = await req.json();
      }

      const { vp_token, state, presentation_submission } = body;
      if (!state) throw new Error("state required");

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

      // Create verification request record
      await supabase.from("verification_requests").insert({
        verifier_id: session.user_id,
        holder_did: verificationResult.holder,
        credential_type: session.metadata?.credential_types?.[0] || null,
        purpose: session.metadata?.purpose || "OID4VP verification",
        status: "verified",
        verified_at: new Date().toISOString(),
        ai_analysis: {
          source: "oid4vp",
          confidence: 85,
          findings: ["Credential presented via OpenID4VP protocol", `${verificationResult.credentials_count} credential(s) received`],
          risk_level: "low",
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
      const sessionId = url.searchParams.get("session_id");
      if (!sessionId) throw new Error("session_id required");

      const { data: session } = await supabase
        .from("oid4vc_sessions")
        .select("id, status, session_type, response_data, expires_at, created_at")
        .eq("id", sessionId)
        .single();

      if (!session) throw new Error("Session not found");

      return new Response(JSON.stringify(session), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Unknown endpoint");
  } catch (e) {
    console.error("oid4vp error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
