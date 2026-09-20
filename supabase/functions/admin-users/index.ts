// @ts-nocheck
// Admin Users Edge Function
// Uses the service role key to bypass RLS so the admin portal can list
// issuer/verifier profiles and update account_status.
//
// Security (roadmap C4):
//   • Secret reads from ADMIN_SECRET env var — FAIL CLOSED (deny all) when
//     the env var is not set. The old `"blockid-admin-secret-2024"` constant
//     was removed; deploys MUST set ADMIN_SECRET.
//   • CORS is restricted to ADMIN_CORS_ORIGIN (comma-separated). If unset,
//     no cross-origin header is emitted → browsers refuse the response.
//   • Best-effort in-memory rate limiter per client IP. Edge function
//     runtimes are ephemeral, so this is not a hard guarantee — pair with a
//     platform WAF / Upstash in production if this endpoint stays live.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ADMIN_SECRET = Deno.env.get("ADMIN_SECRET");
// Comma-separated allowed origins, e.g. "https://app.example.com,http://localhost:5173".
const ADMIN_CORS_ORIGINS = (Deno.env.get("ADMIN_CORS_ORIGIN") || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 120;

/** @type {Map<string, { count: number; resetAt: number }>} */
const rateBuckets = new Map();

function allowedOriginFor(req) {
  const requestOrigin = req.headers.get("origin");
  if (requestOrigin && ADMIN_CORS_ORIGINS.includes(requestOrigin)) {
    return requestOrigin;
  }
  // Non-browser clients (curl etc.) send no Origin header — allow them since
  // they still must present the secret. Browsers are gated by CORS + secret.
  if (!requestOrigin) return null;
  return null;
}

function clientIp(req) {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}

function rateLimited(ip) {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX_REQUESTS;
}

function corsHeaders(req, extra = {}) {
  const headers = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-key",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    ...extra,
  };
  const origin = allowedOriginFor(req);
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

serve(async (req) => {
  // Fail closed: no secret configured ⇒ nothing works.
  if (!ADMIN_SECRET) {
    return new Response(JSON.stringify({ error: "Service not configured" }), {
      status: 500,
      headers: { ...corsHeaders(req, { "Content-Type": "application/json" }) },
    });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  const headers = corsHeaders(req, { "Content-Type": "application/json" });

  try {
    const ip = clientIp(req);
    if (rateLimited(ip)) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers });
    }

    // Authenticate via the admin secret header (constant-time compare).
    const adminKey = req.headers.get("x-admin-key") || "";
    if (adminKey.length !== ADMIN_SECRET.length) {
      return new Response(JSON.stringify({ error: "Forbidden: invalid admin key" }), { status: 403, headers });
    }
    let mismatch = 0;
    for (let i = 0; i < adminKey.length; i++) {
      mismatch |= adminKey.charCodeAt(i) ^ ADMIN_SECRET.charCodeAt(i);
    }
    if (mismatch !== 0) {
      return new Response(JSON.stringify({ error: "Forbidden: invalid admin key" }), { status: 403, headers });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Service-role client bypasses RLS
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // ── LIST: Fetch all issuer/verifier profiles ─────────────────────
    if (req.method === "GET" || action === "list") {
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("user_id, full_name, organization, account_status, created_at")
        .order("created_at", { ascending: false });

      if (pErr) throw new Error(`Failed to fetch profiles: ${pErr.message}`);
      if (!profiles || profiles.length === 0) {
        return new Response(JSON.stringify({ users: [] }), { headers });
      }

      // Get roles
      const userIds = profiles.map((p) => p.user_id);
      const { data: roles, error: rErr } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);

      if (rErr) throw new Error(`Failed to fetch roles: ${rErr.message}`);

      // Build role map
      const roleMap = {};
      (roles || []).forEach((r) => { roleMap[r.user_id] = r.role; });

      // Filter to only issuers and verifiers
      const gatedUsers = profiles
        .filter((p) => roleMap[p.user_id] === "issuer" || roleMap[p.user_id] === "verifier")
        .map((p) => ({
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
          const emailMap = {};
          authUsers.forEach((u) => { emailMap[u.id] = u.email || ""; });
          gatedUsers.forEach((u) => { u.email = emailMap[u.user_id] || ""; });
        }
      } catch {
        // auth.admin may not be available; emails stay empty
      }

      return new Response(JSON.stringify({ users: gatedUsers }), { headers });
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

      if (updateErr) {
        throw new Error(`Failed to update profile: ${updateErr.message}`);
      }

      // Also update trusted_issuers if the user is an issuer being approved/rejected
      const { data: userRoles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user_id)
        .single();

      if (userRoles && userRoles.role === "issuer") {
        const issuerStatus = new_status === "approved" ? "verified" : new_status;
        const { error: issuerUpdateErr } = await supabase
          .from("trusted_issuers")
          .update({
            verification_status: issuerStatus,
            verified_at: new_status === "approved" ? new Date().toISOString() : null,
            verified_by: null,
          })
          .eq("issuer_user_id", user_id);

        if (issuerUpdateErr) {
          console.error("Failed to update trusted_issuers:", issuerUpdateErr);
        }
      }

      // Audit log
      await supabase.from("audit_logs").insert({
        user_id: user_id,
        action: new_status === "approved" ? "account_approved" : "account_rejected",
        entity_type: "profile",
        entity_id: user_id,
        metadata: { admin: "admin-portal", new_status },
      });

      return new Response(JSON.stringify({ success: true }), { headers });
    }

    throw new Error("Invalid request method");
  } catch (e) {
    console.error("admin-users error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 400, headers }
    );
  }
});