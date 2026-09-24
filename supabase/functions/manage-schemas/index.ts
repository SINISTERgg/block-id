import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { clientIp, rateLimited, tooManyRequestsResponse, requireUser, verifyUserHasRole, sanitizedError, jsonResponse } from "../_shared/security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_LIMIT_MAX = 60;
const ISSUER_ROLES = ["issuer", "org_admin"];
const MAX_FIELDS = 100;

async function logAudit(supabase: any, userId: string, action: string, entityType: string, entityId: string | null, metadata: any = {}) {
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
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);

    // ── Server-side RBAC: only issuers (or org admins) may create schemas ─────
    const isIssuer = await verifyUserHasRole(supabase, user.id, ISSUER_ROLES);
    if (!isIssuer) return jsonResponse({ error: "Forbidden: issuer role required" }, 403, corsHeaders);

    const body = await req.json();
    const { issuer_id, name, credential_type, fields, version, parent_schema_id, is_latest } = body;

    if (user.id !== issuer_id) return jsonResponse({ error: "Unauthorized" }, 403, corsHeaders);

    // ── Input validation ───────────────────────────────────────────────────────
    if (typeof name !== "string" || !name.trim() || name.length > 200) {
      return jsonResponse({ error: "name must be a non-empty string under 200 characters" }, 400, corsHeaders);
    }
    if (credential_type !== undefined && (typeof credential_type !== "string" || credential_type.length > 100)) {
      return jsonResponse({ error: "credential_type must be a string under 100 characters" }, 400, corsHeaders);
    }
    if (fields !== undefined) {
      if (!Array.isArray(fields)) return jsonResponse({ error: "fields must be an array" }, 400, corsHeaders);
      if (fields.length > MAX_FIELDS) {
        return jsonResponse({ error: `fields must contain at most ${MAX_FIELDS} entries` }, 400, corsHeaders);
      }
      const invalidField = fields.find((f) => typeof f?.name !== "string" || !f.name.trim());
      if (invalidField) return jsonResponse({ error: "every field must have a name" }, 400, corsHeaders);
    }
    if (version !== undefined && (typeof version !== "number" || !Number.isFinite(version) || version < 1)) {
      return jsonResponse({ error: "version must be a positive number" }, 400, corsHeaders);
    }
    if (parent_schema_id !== undefined && parent_schema_id !== null && typeof parent_schema_id !== "string") {
      return jsonResponse({ error: "parent_schema_id must be a string" }, 400, corsHeaders);
    }

    const insertData: any = {
      issuer_id: user.id,
      name: name.trim(),
      credential_type: credential_type || "certificate",
      fields: fields || [],
    };

    if (version) {
      insertData.version = version;
    }

    if (parent_schema_id) {
      insertData.parent_schema_id = parent_schema_id;
    }

    if (is_latest !== undefined) {
      insertData.is_latest = is_latest;
    }

    const { data: schema, error: insertError } = await supabase
      .from("credential_schemas")
      .insert(insertData)
      .select()
      .single();

    if (insertError) {
      console.error("manage-schemas insert error:", insertError);
      throw new Error("Failed to create schema");
    }

    await logAudit(supabase, user.id, "schema_created", "schema", schema.id, {
      schema_name: name,
      credential_type: credential_type,
      version: schema.version,
    });

    return new Response(JSON.stringify({ schema }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("manage-schemas error:", e);
    return new Response(JSON.stringify({ error: sanitizedError(e, "Failed to create schema") }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});