import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) throw new Error("Unauthorized");

    const body = await req.json();
    const { issuer_id, name, credential_type, fields, version, parent_schema_id, is_latest } = body;

    if (user.id !== issuer_id) throw new Error("Unauthorized");

    const insertData: any = {
      issuer_id: user.id,
      name,
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

    if (insertError) throw insertError;

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
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});