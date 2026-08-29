import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ethers } from "https://esm.sh/ethers@6.16.0";
import {
  SIWE_CHALLENGE_TTL_MS,
  generateNonce,
  isoTimestamp,
  normalizeAddress,
  validateSiweChallenge,
  walletToEmail,
} from "../_shared/siwe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type DbClient = {
  from: (table: string) => {
    select: (columns?: string) => {
      eq: (column: string, value: unknown) => {
        single: () => PromiseLike<{ data: unknown; error: { message: string } | null }>;
        maybeSingle: () => PromiseLike<{ data: unknown; error: { message: string } | null }>;
      };
    };
    insert: (values: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
  };
};

async function logAudit(supabase: DbClient, userId: string | null, action: string, entityType: string, entityId: string | null, metadata: Record<string, unknown> = {}) {
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
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(url, serviceKey);

    const body = await req.json();
    const action = body?.action;

    // ── Step 1: issue challenge ────────────────────────────────────────────
    if (action === "nonce") {
      const address = typeof body.address === "string" ? normalizeAddress(body.address) : null;
      const nonce = generateNonce();
      const expiresAt = isoTimestamp(SIWE_CHALLENGE_TTL_MS);

      const { error: insertError } = await supabase.from("siwe_nonces").insert({
        nonce,
        address,
        expires_at: expiresAt,
      });
      if (insertError) throw insertError;

      return new Response(JSON.stringify({ nonce, expires_at: expiresAt }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Step 2: verify signature + bind Supabase identity ──────────────────
    if (action === "verify") {
      const { message, signature } = body;
      if (typeof message !== "string" || typeof signature !== "string") {
        throw new Error("message and signature are required");
      }

      const allowedDomain = Deno.env.get("SIWE_DOMAIN") ?? new URL(req.url).hostname;

      // 1. Structural + binding validation (domain/nonce/expiry).
      //    Nonce equality is re-checked below against the stored challenge.
      const validation = validateSiweChallenge(message, { domain: allowedDomain });
      if (!validation.valid) throw new Error(validation.error);
      const parsed = validation.parsed;

      // 2. Recover signer via EIP-191 personal_sign and compare addresses.
      let recovered: string;
      try {
        recovered = normalizeAddress(ethers.verifyMessage(message, signature));
      } catch {
        throw new Error("Invalid signature");
      }
      if (recovered !== normalizeAddress(parsed.address)) {
        throw new Error("Signature does not match message address");
      }

      // 3. Atomically consume the nonce (single-use, unexpired).
      const consumed = await consumeNonceRow(supabase, parsed.nonce);
      if (!consumed.ok) throw new Error(consumed.error ?? "Invalid or already-used nonce");

      // 4. Resolve the identity: prefer an existing profile bound to this
      //    wallet, otherwise fall back to the synthetic wallet email.
      const walletEmail = walletToEmail(parsed.address);
      let userId: string | null = null;
      let email = walletEmail;

      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("wallet_address", recovered)
        .maybeSingle();
      if (profile?.user_id) userId = profile.user_id as string;

      if (userId) {
        const { data: userData } = await supabase.auth.admin.getUserById(userId);
        if (userData?.user?.email) email = userData.user.email;
      }
      if (!userId) {
        const { data: existing } = await supabase.auth.admin.listUsers();
        const found = existing?.users?.find((u) => u.email?.toLowerCase() === walletEmail);
        if (found) {
          userId = found.id;
          email = found.email ?? walletEmail;
        }
      }

      if (!userId) {
        const { data: created, error: createError } = await supabase.auth.admin.createUser({
          email: walletEmail,
          email_confirm: true,
          user_metadata: { full_name: `Wallet ${parsed.address.slice(0, 6)}…${parsed.address.slice(-4)}`, auth_method: "siwe" },
        });
        if (createError || !created?.user) throw createError ?? new Error("Failed to create wallet user");
        userId = created.user.id;

        await supabase.from("profiles").update({ wallet_address: recovered }).eq("user_id", userId);
        const { data: hasRole } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .maybeSingle();
        if (!hasRole) {
          await supabase.from("user_roles").insert({ user_id: userId, role: "holder" });
        }
      }

      // 5. Issue a magic-link token hash the client exchanges via verifyOtp.
      const { data: link, error: linkError } = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email,
      });
      if (linkError || !link?.properties?.hashed_token) {
        throw linkError ?? new Error("Failed to mint session token");
      }

      await logAudit(supabase, userId, "siwe_sign_in", "auth", userId, {
        address: recovered,
        domain: parsed.domain,
        chain_id: parsed.chainId,
      });

      return new Response(
        JSON.stringify({
          token_hash: link.properties.hashed_token,
          email,
          address: recovered,
          type: "magiclink",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error("Unknown action — use 'nonce' or 'verify'");
  } catch (e) {
    console.error("siwe-auth error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/**
 * Atomic single-use consumption of a nonce row.
 * UPDATE … WHERE used_at IS NULL AND expires_at > now() — concurrent calls
 * race on the row lock and only one wins.
 */
async function consumeNonceRow(
  supabase: ReturnType<typeof createClient>,
  nonce: string
): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  const { data, error } = await (supabase as any)
    .from("siwe_nonces")
    .update({ used_at: now })
    .eq("nonce", nonce)
    .is("used_at", null)
    .gt("expires_at", now)
    .select("nonce")
    .single();

  if (error || !data) return { ok: false, error: "Challenge expired or already used" };
  return { ok: true };
}
