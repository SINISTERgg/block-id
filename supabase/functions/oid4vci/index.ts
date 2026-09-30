import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeCredentialHash } from "../_shared/vc-hash.ts";
import { resolveAutoIdFields } from "../_shared/identity-id.ts";
import {
  clientIp,
  jsonResponse,
  rateLimited,
  requireUser,
  sanitizedError,
  tooManyRequestsResponse,
  verifyUserHasRole,
} from "../_shared/security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OFFER_RATE_LIMIT_MAX = 30;
const TOKEN_RATE_LIMIT_MAX = 30;
const CREDENTIAL_RATE_LIMIT_MAX = 15;
const ISSUER_ROLES = ["issuer", "org_admin"] as const;

/**
 * Only `ldp_vc` is advertised. The function has no issuer private key — signing
 * happens client-side in the holder/issuer wallet — so it cannot mint a valid
 * `jwt_vc_json`. It used to return a JWT whose "signature" was the first 64
 * hex chars of the credential hash; wallets verify that and reject it, so the
 * advertised algorithm was a promise the issuer could not keep.
 */
const SUPPORTED_FORMATS = new Set(["ldp_vc"]);

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
      if (rateLimited(clientIp(req), 60_000, OFFER_RATE_LIMIT_MAX, "oid4vci:offer")) {
        return tooManyRequestsResponse(corsHeaders);
      }

      const user = await requireUser(req);
      if (!user) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);

      const isIssuer = await verifyUserHasRole(supabase, user.id, ISSUER_ROLES);
      if (!isIssuer) return jsonResponse({ error: "Forbidden: issuer role required" }, 403, corsHeaders);

      let body;
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400, corsHeaders);
      }
      const { schema_id, credential_data, holder_did, expires_in_minutes } = body;
      if (typeof schema_id !== "string" || !schema_id) {
        return jsonResponse({ error: "schema_id required" }, 400, corsHeaders);
      }

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
    //
    // Wallets probe `<issuer>/.well-known/openid-credential-issuer` and some
    // probe the issuer root, so both resolve here.
    if (req.method === "GET" && (url.pathname.includes("openid-credential-issuer") || pathSegment === ".well-known" || pathSegment === "oid4vci")) {
      const issuerBase = `${supabaseUrl}/functions/v1/oid4vci`;
      const metadata = {
        credential_issuer: issuerBase,
        credential_endpoint: `${issuerBase}/credential`,
        token_endpoint: `${issuerBase}/token`,
        authorization_servers: [issuerBase],
        // ldp_vc only. There is no issuer signing key in this function, so no
        // `jwt_vc_json` — advertising one guarantees a wallet-side signature
        // failure. See SUPPORTED_FORMATS.
        credentials_supported: [
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
      if (rateLimited(clientIp(req), 60_000, TOKEN_RATE_LIMIT_MAX, "oid4vci:token")) {
        return tooManyRequestsResponse(corsHeaders);
      }

      let body: any;
      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("application/x-www-form-urlencoded")) {
        const text = await req.text();
        body = Object.fromEntries(new URLSearchParams(text));
      } else {
        body = await req.json();
      }

      const grantType = body.grant_type;
      const code = body["pre-authorized_code"];

      if (grantType !== "urn:ietf:params:oauth:grant-type:pre-authorized_code") {
        return jsonResponse({ error: "Unsupported grant_type" }, 400, corsHeaders);
      }
      if (!code || typeof code !== "string") {
        return jsonResponse({ error: "pre-authorized_code required" }, 400, corsHeaders);
      }

      const { data: session } = await supabase
        .from("oid4vc_sessions")
        .select("*")
        .eq("pre_authorized_code", code)
        .eq("status", "pending")
        .single();

      if (!session) return jsonResponse({ error: "Invalid or expired pre-authorized code" }, 400, corsHeaders);
      if (new Date(session.expires_at) < new Date()) return jsonResponse({ error: "Offer expired" }, 400, corsHeaders);

      // Only the hash of the access token is persisted. The plaintext token is
      // returned once and never stored, so a database dump cannot be replayed
      // against the credential endpoint.
      const accessToken = await hashData(`access:${session.id}:${crypto.randomUUID()}`);
      const accessTokenHash = await hashData(accessToken);

      await supabase.from("oid4vc_sessions").update({
        status: "claimed",
        access_token_hash: accessTokenHash,
        metadata: { ...session.metadata, claimed_at: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      }).eq("id", session.id);

      return new Response(JSON.stringify({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 300,
        c_nonce: await hashData(`nonce:${session.id}:${crypto.randomUUID()}`),
        c_nonce_expires_in: 300,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── 4. Credential Endpoint (issue the VC) ───
    if (req.method === "POST" && pathSegment === "credential") {
      if (rateLimited(clientIp(req), 60_000, CREDENTIAL_RATE_LIMIT_MAX, "oid4vci:credential")) {
        return tooManyRequestsResponse(corsHeaders);
      }

      const authHeader = req.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return jsonResponse({ error: "Bearer access token required" }, 401, corsHeaders);
      }

      const token = authHeader.replace("Bearer ", "").trim();
      if (!token) return jsonResponse({ error: "Bearer access token required" }, 401, corsHeaders);

      // Look the session up by token hash. This used to select every `claimed`
      // session and compare the raw token in JS, which was O(all active offers)
      // per issuance and meant the plaintext token sat in a JSONB column.
      const tokenHash = await hashData(token);
      const { data: session } = await supabase
        .from("oid4vc_sessions")
        .select("*")
        .eq("access_token_hash", tokenHash)
        .eq("status", "claimed")
        .maybeSingle();

      if (!session) return jsonResponse({ error: "Invalid access token" }, 401, corsHeaders);
      if (new Date(session.expires_at) < new Date()) {
        return jsonResponse({ error: "Offer expired" }, 400, corsHeaders);
      }

      let body: any;
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400, corsHeaders);
      }
      const format = body.format || "ldp_vc";
      if (!SUPPORTED_FORMATS.has(format)) {
        // Naming the reason matters: a wallet asking for jwt_vc_json would
        // otherwise see a bare "unsupported" and have no way to tell a version
        // mismatch from a missing issuer key.
        return jsonResponse({
          error: `Unsupported credential format "${format}". This issuer only offers ldp_vc.`,
        }, 400, corsHeaders);
      }

      // Fetch schema
      const { data: schema } = await supabase
        .from("credential_schemas")
        .select("*")
        .eq("id", session.schema_id)
        .single();

      if (!schema) throw new Error("Schema not found");

      // Build VC — auto fields (e.g. idNumber) allocated uniquely at issuance.
      const holderDid = body.did || session.metadata?.holder_did || `did:key:external-wallet`;
      const resolvedData = await resolveAutoIdFields(supabase, schema, session.credential_data);
      const vc: any = {
        "@context": ["https://www.w3.org/2018/credentials/v1"],
        type: ["VerifiableCredential", schema.credential_type],
        issuer: `did:decentraid:issuer:${session.user_id}`,
        issuanceDate: new Date().toISOString(),
        credentialSubject: {
          id: holderDid,
          ...resolvedData,
        },
        credentialSchema: {
          id: schema.id,
          type: schema.credential_type,
        },
      };

      // Canonical hash shared with issue-credential/verify-credential.
      const credentialHash = await computeCredentialHash(vc, "genesis");

      // Store credential
      const { data: credential, error: insertErr } = await supabase.from("credentials").insert({
        schema_id: schema.id,
        issuer_id: session.user_id,
        holder_did: holderDid,
        credential_data: vc,
        credential_hash: credentialHash,
        prev_hash: "genesis",
        blockchain_anchor: `sepolia:oid4vci:${credentialHash.substring(0, 16)}`,
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

      // Only ldp_vc reaches here (see SUPPORTED_FORMATS). The previous
      // jwt_vc_json branch built `header.payload.<hash>` and called it a
      // credential — wallets verify that third segment and reject it, so the
      // credential was unusable outside our own portal.
      return new Response(JSON.stringify({ format: "ldp_vc", credential: vc }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return jsonResponse({ error: "Unknown endpoint" }, 404, corsHeaders);
  } catch (e) {
    console.error("oid4vci error:", e);
    return jsonResponse({ error: sanitizedError(e, "OID4VCI request failed") }, 400, corsHeaders);
  }
});
