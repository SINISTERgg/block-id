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

/**
 * Ceiling on tracked buckets.
 *
 * The map was previously never pruned, so a warm edge instance that saw many
 * distinct source addresses retained one entry per address for its whole life.
 * That is a slow memory leak reachable by anyone with a rotating IP range, so
 * eviction is bounded and lazy rather than best-effort-and-hoped. Buckets are
 * keyed `scope:ip`, so the reachable key space is (routes x addresses); the
 * ceiling is sized accordingly.
 */
const MAX_TRACKED_IPS = 10_000;
let lastSweepAt = 0;

/** Drop windows that have already reset. At most one full scan per window. */
function sweepRateBuckets(now) {
  if (rateBuckets.size < MAX_TRACKED_IPS && now - lastSweepAt < DEFAULT_WINDOW_MS) return;
  lastSweepAt = now;
  for (const [key, bucket] of rateBuckets) {
    if (now > bucket.resetAt) rateBuckets.delete(key);
  }
  // Still oversized: shed the windows closest to resetting, which are the ones
  // about to expire anyway.
  if (rateBuckets.size > MAX_TRACKED_IPS) {
    const oldest = [...rateBuckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    for (let i = 0; i < oldest.length - MAX_TRACKED_IPS; i++) {
      rateBuckets.delete(oldest[i][0]);
    }
  }
}

export function clientIp(req) {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

/**
 * Returns true when the caller is over the limit for this window.
 *
 * `scope` namespaces the bucket. This is load-bearing: the counters are keyed
 * by identifier alone, so without it every route in a function shares one
 * counter. Callers then trip a limit they have nothing to do with — the
 * verifier's 3-second `/status` poll (20/min) exhausts the shared window and
 * the issuer's `/offer` on the same egress IP starts returning 429. Each route
 * must pass its own scope.
 *
 * @param {string} ip
 * @param {number} windowMs
 * @param {number} max
 * @param {string} scope
 */
export function rateLimited(ip, windowMs = DEFAULT_WINDOW_MS, max = DEFAULT_MAX_REQUESTS, scope = "default") {
  if (!ip) return false;
  const now = Date.now();
  sweepRateBuckets(now);
  const key = `${scope}:${ip}`;
  const bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
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