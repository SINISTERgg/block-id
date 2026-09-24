import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  extractCid,
  isPinataConfigured,
  isValidCid,
  pinJsonToIpfs,
  toGatewayUrl,
} from "../_shared/ipfs.ts";
import { clientIp, rateLimited, tooManyRequestsResponse, requireUser, sanitizedError, jsonResponse } from "../_shared/security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_LIMIT_MAX = 20; // pinning is costly (third-party API)

/**
 * Builds the canonical JSON-LD schema document that gets pinned to IPFS.
 * Kept in lockstep with src/lib/ipfs.ts buildSchemaJsonLd on the client.
 */
export function buildSchemaJsonLd(schema: {
  id: string;
  name: string;
  credential_type: string;
  fields: unknown;
  version?: number;
  issuer_id?: string;
  created_at?: string;
}) {
  return {
    "@context": [
      "https://www.w3.org/2018/credentials/v1",
      "https://w3id.org/security/suites/ed25519-2020/v1",
    ],
    type: "JsonSchemaValidator2018",
    schemaId: schema.id,
    name: schema.name,
    credentialType: schema.credential_type,
    version: schema.version ?? 1,
    issuer: schema.issuer_id ? `did:decentraid:issuer:${schema.issuer_id}` : undefined,
    fields: Array.isArray(schema.fields) ? schema.fields : [],
    created: schema.created_at ?? new Date().toISOString(),
  };
}

type DbClient = {
  from: (table: string) => {
    insert: (values: Record<string, unknown>) => PromiseLike<unknown>;
  };
};

async function logAudit(supabase: DbClient, userId: string, action: string, entityType: string, entityId: string | null, metadata: Record<string, unknown> = {}) {
  await supabase.from("audit_logs").insert({
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (rateLimited(clientIp(req), 60_000, RATE_LIMIT_MAX)) {
      return tooManyRequestsResponse(corsHeaders);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);

    if (!isPinataConfigured()) {
      return jsonResponse({ error: "IPFS pinning is currently unavailable" }, 503, corsHeaders);
    }

    const body = await req.json();
    const { schema_id } = body;
    if (!schema_id || typeof schema_id !== "string") {
      return jsonResponse({ error: "schema_id is required" }, 400, corsHeaders);
    }

    const { data: schema, error: schemaError } = await supabase
      .from("credential_schemas")
      .select("id, issuer_id, name, credential_type, fields, version, ipfs_cid, created_at")
      .eq("id", schema_id)
      .single();
    if (schemaError || !schema) return jsonResponse({ error: "Schema not found" }, 404, corsHeaders);
    if (schema.issuer_id !== user.id) return jsonResponse({ error: "Unauthorized: not schema owner" }, 403, corsHeaders);

    // Idempotent: already pinned → return existing CID
    if (schema.ipfs_cid && isValidCid(extractCid(schema.ipfs_cid) ?? "")) {
      return new Response(
        JSON.stringify({
          cid: schema.ipfs_cid,
          ipfsUri: `ipfs://${schema.ipfs_cid}`,
          gatewayUrl: toGatewayUrl(schema.ipfs_cid),
          pinned_at: null,
          already_pinned: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const doc = buildSchemaJsonLd(schema);
    const pin = await pinJsonToIpfs(doc, `blockid-schema-${schema.name}-v${schema.version ?? 1}`, {
      app: "blockid",
      kind: "credential_schema",
      schema_id: schema.id,
      version: String(schema.version ?? 1),
    });

    const pinnedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("credential_schemas")
      .update({ ipfs_cid: pin.cid, ipfs_pinned_at: pinnedAt })
      .eq("id", schema.id);
    if (updateError) {
      console.error("pin-to-ipfs update error:", updateError);
      return jsonResponse({ error: "Failed to record pin" }, 400, corsHeaders);
    }

    await logAudit(supabase, user.id, "schema_pinned_ipfs", "schema", schema.id, {
      schema_name: schema.name,
      cid: pin.cid,
      gateway_url: pin.gatewayUrl,
    });

    return new Response(
      JSON.stringify({
        cid: pin.cid,
        ipfsUri: pin.ipfsUri,
        gatewayUrl: pin.gatewayUrl,
        pinned_at: pinnedAt,
        already_pinned: false,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("pin-to-ipfs error:", e);
    return new Response(JSON.stringify({ error: sanitizedError(e, "IPFS pinning failed") }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
