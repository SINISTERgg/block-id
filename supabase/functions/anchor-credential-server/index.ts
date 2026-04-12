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
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY (auto-provided)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ethers } from "https://esm.sh/ethers@6.13.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    // ── Auth ─────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);

    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) throw new Error("Unauthorized");

    // ── Validate config ───────────────────────────────────────────────────────
    const privateKey = Deno.env.get("SERVER_WALLET_PRIVATE_KEY");
    if (!privateKey) throw new Error("SERVER_WALLET_PRIVATE_KEY secret not set. Add it via: supabase secrets set SERVER_WALLET_PRIVATE_KEY=<key>");

    const contractAddress = Deno.env.get("CREDENTIAL_REGISTRY_ADDRESS");
    if (!contractAddress) throw new Error("CREDENTIAL_REGISTRY_ADDRESS secret not set");

    // ── Parse request ─────────────────────────────────────────────────────────
    const { credential_id, credential_hash } = await req.json();
    if (!credential_id || !credential_hash) throw new Error("credential_id and credential_hash are required");

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

    console.log(`[anchor-server] Tx submitted: ${tx.hash}`);
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
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
