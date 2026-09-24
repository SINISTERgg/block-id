/**
 * anchor-credential-server
 *
 * Server-side wallet fallback for blockchain anchoring.
 * Called when the issuer has no MetaMask (e.g. mobile users).
 *
 * The server wallet signs and submits the anchorCredential() transaction
 * using the SERVER_WALLET_PRIVATE_KEY Supabase secret (Ethereum Sepolia testnet ETH).
 *
 * This function is completely free — it uses the testnet and public RPCs.
 *
 * Required Supabase secrets:
 *   SERVER_WALLET_PRIVATE_KEY   — private key of the server wallet (no 0x prefix needed)
 *   CREDENTIAL_REGISTRY_ADDRESS — deployed contract address
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-provided)
 *
 * Auth: requires a logged-in user with the `issuer` or `org_admin` role.
 * Rate-limited to prevent abuse (each call spends testnet gas).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ethers } from "https://esm.sh/ethers@6.13.2";
import { clientIp, rateLimited, tooManyRequestsResponse, requireUser, verifyUserHasRole, sanitizedError, jsonResponse } from "../_shared/security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_LIMIT_MAX = 10; // this function spends testnet gas
const ANCHOR_ROLES = ["issuer", "org_admin"];
const ETH_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_EXPLORER = "https://sepolia.etherscan.io";

// Free public RPCs — tried in order
const SEPOLIA_RPC_ENDPOINTS = [
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://rpc.sepolia.org",
  "https://sepolia.gateway.tenderly.co",
  "https://rpc.ankr.com/eth_sepolia",
];

const REGISTRY_ABI = [
  "function anchorCredential(bytes32 hash) external",
  "function anchorCredentialBatch(bytes32[] calldata hashes) external",
  "function getCredentialStatus(bytes32 hash) external view returns (bool, bool, address, uint256, uint256, uint256)",
];

async function getProvider(): Promise<ethers.JsonRpcProvider> {
  const network = ethers.Network.from({ name: "sepolia", chainId: SEPOLIA_CHAIN_ID });
  for (const rpc of SEPOLIA_RPC_ENDPOINTS) {
    try {
      const provider = new ethers.JsonRpcProvider(rpc, network, { staticNetwork: network });
      await provider.getBlockNumber();
      return provider;
    } catch {
      console.warn(`[anchor-server] RPC unavailable: ${rpc}`);
    }
  }
  throw new Error("All Ethereum Sepolia RPC endpoints are unavailable");
}

function toBytes32(hash: string): string {
  const hex = hash.startsWith("0x") ? hash.slice(2) : hash;
  if (hex.length > 64) throw new Error(`Invalid hash: ${hash.substring(0, 20)}...`);
  return ethers.zeroPadValue("0x" + hex, 32);
}

async function logAudit(supabase: any, userId: string, action: string, entityType: string, entityId: string | null, metadata: any = {}) {
  await supabase.from("audit_logs").insert({ user_id: userId, action, entity_type: entityType, entity_id: entityId, metadata });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ── Rate limit: gas spend, so be strict ───────────────────────────────────
    if (rateLimited(clientIp(req), 60_000, RATE_LIMIT_MAX)) {
      return tooManyRequestsResponse(corsHeaders);
    }

    // ── Auth ─────────────────────────────────────────────────────────────────
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);

    // ── RBAC: only issuers / org admins can trigger gas spends ───────────────
    const isIssuer = await verifyUserHasRole(supabase, user.id, ANCHOR_ROLES);
    if (!isIssuer) return jsonResponse({ error: "Forbidden: issuer role required" }, 403, corsHeaders);

    // ── Validate config ───────────────────────────────────────────────────────
    const privateKey = Deno.env.get("SERVER_WALLET_PRIVATE_KEY");
    if (!privateKey) return jsonResponse({ error: "Server wallet is not configured" }, 503, corsHeaders);

    const contractAddress = Deno.env.get("CREDENTIAL_REGISTRY_ADDRESS");
    if (!contractAddress || !ETH_ADDRESS_PATTERN.test(contractAddress)) {
      return jsonResponse({ error: "Anchor contract is not configured" }, 503, corsHeaders);
    }

    // ── Parse request ─────────────────────────────────────────────────────────
    let body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400, corsHeaders);
    }
    const { credential_id, credential_hash } = body;
    if (typeof credential_id !== "string" || !credential_id) {
      return jsonResponse({ error: "credential_id is required" }, 400, corsHeaders);
    }
    if (typeof credential_hash !== "string" || !credential_hash.startsWith("0x")) {
      return jsonResponse({ error: "credential_hash must be a hex string" }, 400, corsHeaders);
    }

    // Verify issuer owns the credential
    const { data: credential } = await supabase
      .from("credentials")
      .select("id, issuer_id, credential_hash, credential_data, blockchain_anchor")
      .eq("id", credential_id)
      .eq("issuer_id", user.id)
      .single();

    if (!credential) throw new Error("Credential not found or unauthorized");

    if (credential.blockchain_anchor) {
      return new Response(JSON.stringify({ error: "Credential already anchored" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Submit on-chain ───────────────────────────────────────────────────────
    const provider = await getProvider();
    const wallet = new ethers.Wallet(
      privateKey.startsWith("0x") ? privateKey : "0x" + privateKey,
      provider
    );

    const registry = new ethers.Contract(contractAddress, REGISTRY_ABI, wallet);
    const bytes32Hash = toBytes32(credential_hash);

    const tx = await registry.anchorCredential(bytes32Hash, {
      maxPriorityFeePerGas: ethers.parseUnits("2", "gwei"),
      maxFeePerGas: ethers.parseUnits("20", "gwei"),
    });

    console.info(`[anchor-server] Tx submitted: ${tx.hash}`);
    const receipt = await tx.wait();

    if (!receipt) throw new Error("No receipt received — transaction may have failed");

    const blockNumber = receipt.blockNumber ?? 0;
    const explorerUrl = `${SEPOLIA_EXPLORER}/tx/${receipt.hash}`;
    const anchoredAt = Math.floor(Date.now() / 1000); // approximate — block timestamp not available here

    // ── Update Supabase ───────────────────────────────────────────────────────
    const anchor = `sepolia:${receipt.hash.substring(0, 18)}:${blockNumber}`;
    const updatedCredentialData = {
      ...credential.credential_data,
      blockchain: {
        network: "sepolia",
        chainId: SEPOLIA_CHAIN_ID,
        txHash: receipt.hash,
        blockNumber,
        anchoredAt,
        anchorWallet: wallet.address,
        explorerUrl,
        method: "contract-server", // server wallet, not browser wallet
        contractAddress,
      },
    };

    await supabase
      .from("credentials")
      .update({ blockchain_anchor: anchor, credential_data: updatedCredentialData })
      .eq("id", credential_id);

    await logAudit(supabase, user.id, "credential_anchored_server", "credential", credential_id, {
      tx_hash: receipt.hash,
      block_number: blockNumber,
      server_wallet: wallet.address,
      credential_hash,
    });

    return new Response(JSON.stringify({
      success: true,
      txHash: receipt.hash,
      blockNumber,
      explorerUrl,
      serverWallet: wallet.address,
      blockchain_anchor: anchor,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("anchor-credential-server error:", e);
    return new Response(JSON.stringify({ error: sanitizedError(e, "Blockchain anchoring failed") }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
