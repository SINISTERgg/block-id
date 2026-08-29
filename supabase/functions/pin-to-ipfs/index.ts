import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  extractCid,
  isPinataConfigured,
  isValidCid,
  pinJsonToIpfs,
  toGatewayUrl,
} from "../_shared/ipfs.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) throw new Error("Unauthorized");

    if (!isPinataConfigured()) {
      throw new Error("IPFS pinning unavailable: server is missing PINATA credentials");
    }

    const body = await req.json();
    const { schema_id } = body;
    if (!schema_id || typeof schema_id !== "string") throw new Error("schema_id is required");

    const { data: schema, error: schemaError } = await supabase
      .from("credential_schemas")
      .select("id, issuer_id, name, credential_type, fields, version, ipfs_cid, created_at")
      .eq("id", schema_id)
      .single();
    if (schemaError || !schema) throw new Error("Schema not found");
    if (schema.issuer_id !== user.id) throw new Error("Unauthorized: not schema owner");

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
    if (updateError) throw updateError;

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
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
