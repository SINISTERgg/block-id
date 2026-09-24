// @ts-nocheck — Deno Edge Function: run via `supabase functions serve`, not tsc
/// <reference types="https://deno.land/x/deploy@0.9.0/types/deploy.fetchevent.d.ts" />

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { clientIp, rateLimited, tooManyRequestsResponse, requireUser, verifyUserHasRole, sanitizedError, jsonResponse } from "../_shared/security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_LIMIT_MAX = 60;
const ANCHOR_ROLES = ["issuer", "org_admin"];
const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_EXPLORER = "https://sepolia.etherscan.io";

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

    // Anchor is only meaningful for issuers / org admins.
    const isIssuer = await verifyUserHasRole(supabase, user.id, ANCHOR_ROLES);
    if (!isIssuer) return jsonResponse({ error: "Forbidden: issuer role required" }, 403, corsHeaders);

    let body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400, corsHeaders);
    }
    const { credential_id, tx_hash, block_number, from_address, anchored_at, force_update } = body;

    if (typeof credential_id !== "string" || !credential_id) {
      return jsonResponse({ error: "credential_id is required" }, 400, corsHeaders);
    }
    if (typeof tx_hash !== "string" || !TX_HASH_PATTERN.test(tx_hash)) {
      return jsonResponse({ error: "tx_hash must be a valid 0x transaction hash" }, 400, corsHeaders);
    }

    const { data: credential } = await supabase
      .from("credentials")
      .select("id, issuer_id, credential_hash, credential_data, blockchain_anchor")
      .eq("id", credential_id)
      .eq("issuer_id", user.id)
      .single();

    if (!credential) return jsonResponse({ error: "Credential not found or unauthorized" }, 404, corsHeaders);

    // Skip duplicate check when force_update is true (fixing stale mainnet records)
    if (credential.blockchain_anchor && !force_update) {
      return new Response(JSON.stringify({ error: "Credential already anchored" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Compact anchor string for the blockchain_anchor column
    const anchor = `sepolia:${tx_hash.substring(0, 18)}:${block_number || 0}`;

    const updatedCredentialData = {
      ...credential.credential_data,
      blockchain: {
        network: "sepolia",
        chainId: SEPOLIA_CHAIN_ID,
        txHash: tx_hash,
        blockNumber: block_number || 0,
        // Unix timestamp from on-chain event (seconds). Falls back to now if not provided.
        anchoredAt: anchored_at || Math.floor(Date.now() / 1000),
        anchorWallet: from_address || null,
        explorerUrl: `${SEPOLIA_EXPLORER}/tx/${tx_hash}`,
        method: "contract",
        contractAddress: Deno.env.get("CREDENTIAL_REGISTRY_ADDRESS") || null,
      },
    };

    const { error: updateError } = await supabase
      .from("credentials")
      .update({
        blockchain_anchor: anchor,
        credential_data: updatedCredentialData,
      })
      .eq("id", credential_id);

    if (updateError) {
      console.error("anchor-credential update error:", updateError);
      return jsonResponse({ error: "Failed to update credential anchor" }, 400, corsHeaders);
    }

    await logAudit(supabase, user.id, "credential_anchored", "credential", credential_id, {
      tx_hash,
      block_number,
      from_address,
      anchored_at: anchored_at || null,
      credential_hash: credential.credential_hash,
    });

    return new Response(JSON.stringify({
      success: true,
      blockchain_anchor: anchor,
      explorer_url: `${SEPOLIA_EXPLORER}/tx/${tx_hash}`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("anchor-credential error:", e);
    return jsonResponse({ error: sanitizedError(e, "Failed to record anchor") }, 400, corsHeaders);
  }
});
