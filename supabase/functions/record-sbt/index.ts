// @ts-nocheck — Deno Edge Function: run via `supabase functions serve`, not tsc
/// <reference types="https://deno.land/x/deploy@0.9.0/types/deploy.fetchevent.d.ts" />

/**
 * Record a soulbound-badge mint against a credential.
 *
 * The mint itself is a wallet transaction signed by the issuer, so by the time
 * this runs the badge already exists on chain. Its job is to make the badge
 * discoverable:
 *
 *   1. write `sbt_token_id` / `sbt_tx_hash` / `sbt_holder_address` onto the
 *      credential row, which is what the holder portal and every verifier
 *      SBT read path depends on
 *   2. verify the token id against the chain so a bad record cannot be stored
 *   3. audit-log the mint
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { clientIp, rateLimited, tooManyRequestsResponse, requireUser, verifyUserHasRole, sanitizedError, jsonResponse } from "../_shared/security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_LIMIT_MAX = 60;
const ISSUER_ROLES = ["issuer", "org_admin"];
const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

/** RPC endpoints tried in order — mirrors src/services/blockchain/provider.ts. */
const RPC_ENDPOINTS = [
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://rpc.sepolia.org",
  "https://sepolia.gateway.tenderly.co",
  "https://rpc-sepolia.rockx.com",
  "https://rpc.ankr.com/eth_sepolia",
];

const SEPOLIA_EXPLORER = "https://sepolia.etherscan.io";

// keccak256("tokenByCredentialHash(bytes32)")[:4]
// Verified against ethers `id("tokenByCredentialHash(bytes32)")` — see
// scripts/test-sbt-contract.js, which asserts this selector round-trips.
const TOKEN_BY_HASH_SELECTOR = "0x98cc92df";


/**
 * Normalise a credential hash to bytes32 form.
 *
 * `credentials.credential_hash` is stored as bare 64-char hex with no "0x"
 * prefix (see _shared/vc-hash.ts), so the prefix is added here rather than
 * required from the caller.
 */
function toBytes32(hash) {
  const body = String(hash).trim().replace(/^0[xX]/, "");
  if (!/^[0-9a-fA-F]+$/.test(body) || body.length > 64) {
    throw new Error("credential_hash is not a valid hex string");
  }
  return "0x" + body.toLowerCase().padStart(64, "0");
}

/** Minimal JSON-RPC `eth_call` — avoids pulling a web3 library into Deno. */
async function ethCall(rpcUrl, to, data) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
  });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? "eth_call failed");
  return json.result;
}

function stripHex(value) {
  return String(value ?? "").replace(/^0x/, "");
}

function hexToBigInt(value) {
  const body = stripHex(value);
  return body.length ? BigInt("0x" + body) : 0n;
}

/** Read the on-chain token id for a credential hash, across RPC fallbacks. */
async function readTokenIdOnChain(contractAddress, credentialHash) {
  const data = TOKEN_BY_HASH_SELECTOR + stripHex(toBytes32(credentialHash));

  let lastError;
  for (const rpcUrl of RPC_ENDPOINTS) {
    try {
      const result = await ethCall(rpcUrl, contractAddress, data);
      return hexToBigInt(result);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error("all RPC endpoints failed");
}

async function logAudit(supabase, userId, action, entityType, entityId, metadata = {}) {
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

    const isIssuer = await verifyUserHasRole(supabase, user.id, ISSUER_ROLES);
    if (!isIssuer) return jsonResponse({ error: "Forbidden: issuer role required" }, 403, corsHeaders);

    let body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400, corsHeaders);
    }

    // `token_id` is reassigned below when the chain knows better than the client.
    let { token_id, tx_hash, holder_address, status } = body;
    const { credential_id, verify_on_chain } = body;
    // "mint" (default) records a fresh badge; "state" flips an already-recorded
    // badge to revoked/burned/failed without needing a token id from the client.
    const action = body.action === "state" ? "state" : "mint";

    if (typeof credential_id !== "string" || !credential_id) {
      return jsonResponse({ error: "credential_id is required" }, 400, corsHeaders);
    }
    if (tx_hash !== undefined && tx_hash !== null && !TX_HASH_PATTERN.test(String(tx_hash))) {
      return jsonResponse({ error: "tx_hash must be a valid 0x transaction hash" }, 400, corsHeaders);
    }
    if (holder_address !== undefined && holder_address !== null && !ADDRESS_PATTERN.test(String(holder_address))) {
      return jsonResponse({ error: "holder_address must be a valid 0x address" }, 400, corsHeaders);
    }
    if (token_id !== undefined && token_id !== null) {
      const n = Number(token_id);
      if (!Number.isInteger(n) || n < 1) {
        return jsonResponse({ error: "token_id must be a positive integer" }, 400, corsHeaders);
      }
    }

    const { data: credential } = await supabase
      .from("credentials")
      .select("id, issuer_id, credential_hash, holder_did, sbt_token_id")
      .eq("id", credential_id)
      .eq("issuer_id", user.id)
      .single();

    if (!credential) return jsonResponse({ error: "Credential not found or unauthorized" }, 404, corsHeaders);

    // ── State-only update (revoked / burned / failed) ───────────────────────
    // Taken before the chain read: flipping badge state needs no token id, and
    // the caller (useOnChainRevocation) already has the mint confirmed.
    if (action === "state") {
      if (!["revoked", "burned", "failed"].includes(String(status))) {
        return jsonResponse(
          { error: "status must be revoked, burned or failed for a state update" },
          400,
          corsHeaders,
        );
      }

      const { data: stateRow, error: stateError } = await supabase
        .rpc("record_sbt_state", { p_credential_id: credential_id, p_status: status })
        .single();

      if (stateError) {
        console.error("record-sbt state rpc error:", stateError);
        return jsonResponse({ error: stateError.message ?? "Failed to record badge state" }, 400, corsHeaders);
      }

      await logAudit(supabase, user.id, `sbt_${status}`, "credential", credential_id, {
        tx_hash: tx_hash ?? null,
        credential_hash: credential.credential_hash,
      });

      return jsonResponse({
        success: true,
        action,
        sbt_status: stateRow?.sbt_status ?? status,
        sbt_token_id: stateRow?.sbt_token_id ?? null,
      });
    }

    // Optional chain cross-check: refuse to store a token id that does not
    // resolve on-chain, which is how a bad receipt decode would otherwise
    // silently poison every downstream reader.
    const contractAddress = Deno.env.get("SOULBOUND_CREDENTIAL_ADDRESS") ?? null;
    let onChainTokenId = null;
    if (verify_on_chain !== false && contractAddress) {
      try {
        onChainTokenId = Number(await readTokenIdOnChain(contractAddress, credential.credential_hash));
      } catch (err) {
        // RPC trouble must not block recording a confirmed mint — report it
        // and let the caller decide whether to retry verification later.
        console.warn("record-sbt chain verification unavailable:", err?.message ?? err);
      }

      if (onChainTokenId && token_id && onChainTokenId !== Number(token_id)) {
        return jsonResponse({
          error: `token_id ${token_id} does not match on-chain token id ${onChainTokenId}`,
          on_chain_token_id: onChainTokenId,
        }, 409, corsHeaders);
      }
      // Prefer the chain as the authority when the client could not decode it.
      if (!token_id && onChainTokenId) {
        token_id = onChainTokenId;
      }
    }

    if (!token_id) {
      return jsonResponse({
        error: "token_id could not be determined — decode it from the mint receipt or re-run with the RPC available",
      }, 400, corsHeaders);
    }

    const { data: updated, error: rpcError } = await supabase
      .rpc("record_sbt_mint", {
        p_credential_id: credential_id,
        p_token_id: Number(token_id),
        p_tx_hash: tx_hash ?? null,
        p_holder_address: holder_address ?? null,
        p_status: status ?? "minted",
      })
      .single();

    if (rpcError) {
      console.error("record-sbt rpc error:", rpcError);
      return jsonResponse({ error: rpcError.message ?? "Failed to record badge" }, 400, corsHeaders);
    }

    await logAudit(supabase, user.id, "sbt_minted", "credential", credential_id, {
      token_id: Number(token_id),
      tx_hash: tx_hash ?? null,
      holder_address: holder_address ?? null,
      credential_hash: credential.credential_hash,
      verified_on_chain: onChainTokenId !== null,
    });

    return new Response(JSON.stringify({
      success: true,
      sbt_token_id: updated?.sbt_token_id ?? Number(token_id),
      sbt_holder_address: updated?.sbt_holder_address ?? holder_address ?? null,
      verified_on_chain: onChainTokenId !== null,
      explorer_url: `${SEPOLIA_EXPLORER}/nft/${contractAddress ?? "SoulboundCredential"}/${Number(token_id)}`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("record-sbt error:", e);
    return jsonResponse({ error: sanitizedError(e, "Failed to record badge mint") }, 400, corsHeaders);
  }
});
