// @ts-nocheck
// Admin Users Edge Function
// Uses service role key to bypass RLS, allowing the admin portal
// to list all issuer/verifier profiles and update their account_status.
// Authentication is done via a shared admin secret (not Supabase Auth).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Admin secret — must match what the frontend sends.
// In production, use Deno.env.get("ADMIN_SECRET") for a proper secret.
const ADMIN_SECRET = "blockid-admin-secret-2024";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Authenticate via the admin secret header
    const adminKey = req.headers.get("x-admin-key");
    if (!adminKey || adminKey !== ADMIN_SECRET) {
      return new Response(
        JSON.stringify({ error: "Forbidden: invalid admin key" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Service-role client bypasses RLS
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // ── LIST: Fetch all issuer/verifier profiles ─────────────────────
    if (req.method === "GET" || action === "list") {
      // Get all profiles
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("user_id, full_name, organization, account_status, created_at")
        .order("created_at", { ascending: false });

      if (pErr) throw new Error(`Failed to fetch profiles: ${pErr.message}`);
      if (!profiles || profiles.length === 0) {
        return new Response(JSON.stringify({ users: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get roles
      const userIds = profiles.map((p: any) => p.user_id);
      const { data: roles, error: rErr } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);

      if (rErr) throw new Error(`Failed to fetch roles: ${rErr.message}`);

      // Build role map
      const roleMap: Record<string, string> = {};
      (roles || []).forEach((r: any) => { roleMap[r.user_id] = r.role; });

      // Filter to only issuers and verifiers
      const gatedUsers = profiles
        .filter((p: any) => {
          const role = roleMap[p.user_id];
          return role === "issuer" || role === "verifier";
        })
        .map((p: any) => ({
          user_id: p.user_id,
          full_name: p.full_name,
          organization: p.organization,
          account_status: p.account_status ?? "pending",
          created_at: p.created_at,
          role: roleMap[p.user_id],
          email: "",
        }));

      // Try to get emails from auth.users
      try {
        const { data: { users: authUsers } } = await supabase.auth.admin.listUsers();
        if (authUsers) {
          const emailMap: Record<string, string> = {};
          authUsers.forEach((u: any) => { emailMap[u.id] = u.email || ""; });
          gatedUsers.forEach((u: any) => { u.email = emailMap[u.user_id] || ""; });
        }
      } catch {
        // auth.admin may not be available; emails stay empty
      }

      return new Response(JSON.stringify({ users: gatedUsers }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── UPDATE: Approve or reject a user ─────────────────────────────
    if (req.method === "POST") {
      const { user_id, new_status } = await req.json();
      if (!user_id || !new_status) throw new Error("Missing user_id or new_status");
      if (!["approved", "rejected", "pending"].includes(new_status)) {
        throw new Error("Invalid status");
      }

      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ account_status: new_status })
        .eq("user_id", user_id);

      if (updateErr) throw new Error(`Failed to update: ${updateErr.message}`);

      // Audit log
      await supabase.from("audit_logs").insert({
        user_id: user_id,
        action: new_status === "approved" ? "account_approved" : "account_rejected",
        entity_type: "profile",
        entity_id: user_id,
        metadata: { admin: "admin-portal", new_status },
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Invalid request method");
  } catch (e) {
    console.error("admin-users error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
