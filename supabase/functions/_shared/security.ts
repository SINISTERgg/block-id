// @ts-nocheck
// Shared security helpers for Supabase Edge Functions.
//   • clientIp() — derive a stable client identifier from proxy headers
//   • rateLimited() — best-effort in-memory fixed-window rate limiter
//   • requireUser() — validate Bearer JWT via anon client, return Supabase user
//   • verifyUserHasRole() — server-side RBAC check against public.user_roles
//   • sanitizedError() — generic error message that never leaks internals
//   • jsonResponse() — consistent JSON/CORS response builder
//
// In-memory limiter is best-effort (edge runtimes are ephemeral). Pair with a
// platform WAF / Upstash for a hard guarantee in production.

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 60;

/** @type {Map<string, { count: number; resetAt: number }>} */
const rateBuckets = new Map();

export function clientIp(req) {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

/** Returns true when the caller is over the limit for this window. */
export function rateLimited(ip, windowMs = DEFAULT_WINDOW_MS, max = DEFAULT_MAX_REQUESTS) {
  if (!ip) return false;
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + windowMs });
    return false;
  }
  bucket.count += 1;
  return bucket.count > max;
}

export function tooManyRequestsResponse(corsHeaders) {
  return new Response(JSON.stringify({ error: "Too many requests. Please try again later." }), {
    status: 429,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Parse the Bearer token and return the authenticated user, or null.
 * @param {Request} req
 */
export async function requireUser(req) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return null;

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const anonClient = createClient(supabaseUrl, anonKey);
  const { data, error } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
  if (error || !data?.user) return null;
  return data.user;
}

/**
 * Confirm a user holds at least one of the given roles (server-side RBAC).
 * Uses the service-role client (already bypassing RLS) against user_roles.
 * @param {any} supabase
 * @param {string} userId
 * @param {string[]} roles
 * @returns {Promise<boolean>}
 */
export async function verifyUserHasRole(supabase, userId, roles) {
  if (!userId || !roles?.length) return false;
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", roles)
    .limit(1);
  if (error || !data || data.length === 0) return false;
  return true;
}

/** Returns a client-safe message. Never expose raw DB/provider/stack details. */
export function sanitizedError(err, fallback = "An unexpected error occurred.") {
  if (!err) return fallback;
  const msg = typeof err === "string" ? err : err?.message ?? fallback;
  if (!msg || msg.length === 0) return fallback;

  // Downstream DB/provider error messages can leak schema, SQL fragments or
  // secret names. Treat anything that smells internal as generic.
  const internal =
    /(select|insert|update|delete|from |where |relation\b|duplicate key|constraint|enum type|uuid)/i.test(msg) ||
    /(password|secret|private key|signing key|token|api[-\s]?key|credential[s]?\b)/i.test(msg) ||
    /Invalid JSON|Cannot read|undefined|null|E_|SQL\b|postgres|supabase|syntax error/i.test(msg);
  if (internal) return fallback;

  // Truncate overly verbose raw payloads while keeping a human hint.
  return msg.slice(0, 160);
}

export function jsonResponse(body, status = 200, corsHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}