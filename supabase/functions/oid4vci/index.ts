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
    // ─── 1. Create Credential Offer (issuer calls this) ───
    if (req.method === "POST" && pathSegment === "offer") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) throw new Error("Unauthorized");

      const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: { user }, error: authErr } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
      if (authErr || !user) throw new Error("Unauthorized");

      const { schema_id, credential_data, holder_did, expires_in_minutes } = await req.json();
      if (!schema_id) throw new Error("schema_id required");

      const preAuthorizedCode = await hashData(`${user.id}:${Date.now()}:${crypto.randomUUID()}`);
      const expiresAt = new Date(Date.now() + (expires_in_minutes || 30) * 60000).toISOString();

      const { data: schema } = await supabase
        .from("credential_schemas")
        .select("name, credential_type")
        .eq("id", schema_id)
        .single();

      const { data: session, error } = await supabase.from("oid4vc_sessions").insert({
        session_type: "credential_offer",
        user_id: user.id,
        schema_id,
        credential_data: credential_data || {},
        pre_authorized_code: preAuthorizedCode,
        expires_at: expiresAt,
        metadata: { holder_did: holder_did || null, schema_name: schema?.name },
      }).select().single();

      if (error) throw error;

      // Build OID4VCI Credential Offer URI (pre-authorized code flow)
      const credentialOfferUri = JSON.stringify({
        credential_issuer: `${supabaseUrl}/functions/v1/oid4vci`,
        credentials: [schema?.credential_type || "VerifiableCredential"],
        grants: {
          "urn:ietf:params:oauth:grant-type:pre-authorized_code": {
            "pre-authorized_code": preAuthorizedCode,
            user_pin_required: false,
          },
        },
      });

      const offerUrl = `openid-credential-offer://?credential_offer=${encodeURIComponent(credentialOfferUri)}`;

      return new Response(JSON.stringify({
        offer_url: offerUrl,
        credential_offer: JSON.parse(credentialOfferUri),
        session_id: session.id,
        pre_authorized_code: preAuthorizedCode,
        expires_at: expiresAt,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── 2. OpenID Credential Issuer Metadata ───
    if (req.method === "GET" && (pathSegment === ".well-known" || url.pathname.includes("openid-credential-issuer"))) {
      const metadata = {
        credential_issuer: `${supabaseUrl}/functions/v1/oid4vci`,
        credential_endpoint: `${supabaseUrl}/functions/v1/oid4vci/credential`,
        token_endpoint: `${supabaseUrl}/functions/v1/oid4vci/token`,
        credentials_supported: [
          {
            format: "jwt_vc_json",
            types: ["VerifiableCredential"],
            cryptographic_binding_methods_supported: ["did:key", "did:jwk"],
            credential_signing_alg_values_supported: ["ES256K"],
          },
          {
            format: "ldp_vc",
            types: ["VerifiableCredential"],
            "@context": ["https://www.w3.org/2018/credentials/v1"],
          },
        ],
      };
      return new Response(JSON.stringify(metadata), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── 3. Token Endpoint (pre-authorized code exchange) ───
    if (req.method === "POST" && pathSegment === "token") {
      let body: any;
      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("application/x-www-form-urlencoded")) {
        const text = await req.text();
        body = Object.fromEntries(new URLSearchParams(text));
      } else {
        body = await req.json();
      }

      const grantType = body.grant_type || body["grant_type"];
      const code = body["pre-authorized_code"] || body.pre_authorized_code;

      if (grantType !== "urn:ietf:params:oauth:grant-type:pre-authorized_code") {
        throw new Error("Unsupported grant_type");
      }
      if (!code) throw new Error("pre-authorized_code required");

      const { data: session } = await supabase
        .from("oid4vc_sessions")
        .select("*")
        .eq("pre_authorized_code", code)
        .eq("status", "pending")
        .single();

      if (!session) throw new Error("Invalid or expired pre-authorized code");
      if (new Date(session.expires_at) < new Date()) throw new Error("Offer expired");

      // Generate access token
      const accessToken = await hashData(`access:${session.id}:${Date.now()}`);

      await supabase.from("oid4vc_sessions").update({
        status: "claimed",
        metadata: { ...session.metadata, access_token: accessToken },
        updated_at: new Date().toISOString(),
      }).eq("id", session.id);

      return new Response(JSON.stringify({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 300,
        c_nonce: await hashData(`nonce:${session.id}:${Date.now()}`),
        c_nonce_expires_in: 300,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── 4. Credential Endpoint (issue the VC) ───
    if (req.method === "POST" && pathSegment === "credential") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) throw new Error("No access token");

      const token = authHeader.replace("Bearer ", "");

      // Find session by access token
      const { data: sessions } = await supabase
        .from("oid4vc_sessions")
        .select("*")
        .eq("status", "claimed");

      const session = sessions?.find((s: any) => s.metadata?.access_token === token);
      if (!session) throw new Error("Invalid access token");

      const body = await req.json();
      const format = body.format || "ldp_vc";

      // Fetch schema
      const { data: schema } = await supabase
        .from("credential_schemas")
        .select("*")
        .eq("id", session.schema_id)
        .single();

      if (!schema) throw new Error("Schema not found");

      // Build VC
      const holderDid = body.did || session.metadata?.holder_did || `did:key:external-wallet`;
      const vc: any = {
        "@context": ["https://www.w3.org/2018/credentials/v1"],
        type: ["VerifiableCredential", schema.credential_type],
        issuer: `did:decentraid:issuer:${session.user_id}`,
        issuanceDate: new Date().toISOString(),
        credentialSubject: {
          id: holderDid,
          ...(session.credential_data || {}),
        },
        credentialSchema: {
          id: schema.id,
          type: schema.credential_type,
        },
      };

      const credentialHash = await hashData(JSON.stringify(vc));

      // Store credential
      const { data: credential, error: insertErr } = await supabase.from("credentials").insert({
        schema_id: schema.id,
        issuer_id: session.user_id,
        holder_did: holderDid,
        credential_data: vc,
        credential_hash: credentialHash,
        blockchain_anchor: `polygon:oid4vci:${credentialHash.substring(0, 16)}`,
        status: "active",
      }).select().single();

      if (insertErr) throw insertErr;

      // Complete session
      await supabase.from("oid4vc_sessions").update({
        status: "completed",
        response_data: { credential_id: credential.id },
        updated_at: new Date().toISOString(),
      }).eq("id", session.id);

      // Audit log
      await supabase.from("audit_logs").insert({
        user_id: session.user_id,
        action: "oid4vci_credential_issued",
        entity_type: "credential",
        entity_id: credential.id,
        metadata: { holder_did: holderDid, schema_name: schema.name, format },
      });

      if (format === "jwt_vc_json") {
        // Return as JWT
        const header = { alg: "ES256K", typ: "JWT" };
        const payload = {
          iss: vc.issuer,
          sub: holderDid,
          iat: Math.floor(Date.now() / 1000),
          jti: `urn:uuid:${credential.id}`,
          vc,
        };
        const jwt = [
          btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"),
          btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"),
          credentialHash.substring(0, 64),
        ].join(".");

        return new Response(JSON.stringify({ format: "jwt_vc_json", credential: jwt }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ format: "ldp_vc", credential: vc }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Unknown endpoint");
  } catch (e) {
    console.error("oid4vci error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
