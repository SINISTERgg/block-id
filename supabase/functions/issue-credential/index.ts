import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ethers } from "https://esm.sh/ethers@6.13.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Polygon Amoy Testnet config with fallback RPCs
const AMOY_RPC_ENDPOINTS = [
  "https://rpc-amoy.polygon.technology",
  "https://polygon-amoy.drpc.org",
  "https://polygon-amoy-bor-rpc.publicnode.com",
];
const AMOY_CHAIN_ID = 80002;
const AMOY_EXPLORER = "https://amoy.polygonscan.com";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

function canonicalJson(obj: unknown): string {
  if (obj === null || obj === undefined) return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalJson).join(",") + "]";
  if (typeof obj === "object") {
    const sorted = Object.keys(obj as Record<string, unknown>).sort()
      .map(k => JSON.stringify(k) + ":" + canonicalJson((obj as Record<string, unknown>)[k]));
    return "{" + sorted.join(",") + "}";
  }
  return JSON.stringify(obj);
}

async function hashData(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getProvider(): Promise<ethers.JsonRpcProvider> {
  for (const rpc of AMOY_RPC_ENDPOINTS) {
    try {
      const provider = new ethers.JsonRpcProvider(rpc, AMOY_CHAIN_ID);
      await provider.getBlockNumber(); // quick health check
      console.log(`Using RPC: ${rpc}`);
      return provider;
    } catch {
      console.warn(`RPC unavailable: ${rpc}`);
    }
  }
  throw new Error("All RPC endpoints are unavailable");
}

async function anchorOnChain(credentialHash: string): Promise<{ txHash: string; blockNumber: number; from: string }> {
  const privateKey = Deno.env.get("SERVER_WALLET_PRIVATE_KEY");
  if (!privateKey) throw new Error("SERVER_WALLET_PRIVATE_KEY not configured");

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const provider = await getProvider();
      const wallet = new ethers.Wallet(privateKey, provider);

      const tx = await wallet.sendTransaction({
        to: wallet.address,
        value: 0n,
        data: ethers.hexlify(ethers.toUtf8Bytes(`decentraid:credential:${credentialHash}`)),
      });

      const receipt = await tx.wait();
      if (!receipt) throw new Error("Transaction failed — no receipt");

      console.log(`Anchored on attempt ${attempt}: ${receipt.hash}`);
      return {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        from: wallet.address,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`Anchor attempt ${attempt}/${MAX_RETRIES} failed:`, lastError.message);
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  throw new Error(`Blockchain anchoring failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

async function logAudit(supabase: any, userId: string, action: string, entityType: string, entityId: string | null, metadata: any = {}) {
  await supabase.from("audit_logs").insert({
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
  });
}

async function issueOne(
  supabase: any,
  userId: string,
  schema: any,
  holderDid: string,
  credentialData: any,
  expiresAt: string | null,
  issuerSignature: string | null,
  signerAddress: string | null
) {
  const { data: holderProfile } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("did", holderDid)
    .single();

  const { data: lastCred } = await supabase
    .from("credentials")
    .select("credential_hash")
    .order("issued_at", { ascending: false })
    .limit(1)
    .single();

  const prev_hash = lastCred?.credential_hash || "genesis";

  const vc: any = {
    "@context": ["https://www.w3.org/2018/credentials/v1", "https://w3id.org/security/suites/ed25519-2020/v1"],
    type: ["VerifiableCredential", schema.credential_type],
    issuer: `did:decentraid:issuer:${userId}`,
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      id: holderDid,
      ...credentialData,
    },
    credentialSchema: {
      id: schema.id,
      type: schema.credential_type,
      version: schema.version || 1,
    },
  };

  if (expiresAt) {
    vc.expirationDate = expiresAt;
  }

  const credential_hash = await hashData(canonicalJson(vc) + prev_hash);

  // Real blockchain anchoring on Polygon Amoy
  let blockchainResult: { txHash: string; blockNumber: number; from: string };
  try {
    blockchainResult = await anchorOnChain(credential_hash);
  } catch (err) {
    console.error("Blockchain anchoring failed:", err);
    throw new Error(`Blockchain anchoring failed: ${err instanceof Error ? err.message : "Unknown error"}`);
  }

  const anchor = `polygon-amoy:${blockchainResult.txHash.substring(0, 18)}:${blockchainResult.blockNumber}`;

  // Build proof
  const proof: any = {
    type: issuerSignature ? "EcdsaSecp256k1Signature2019" : "Ed25519Signature2020",
    created: new Date().toISOString(),
    verificationMethod: signerAddress
      ? `did:ethr:polygon:${signerAddress}#controller`
      : `did:decentraid:issuer:${userId}#key-1`,
    proofPurpose: "assertionMethod",
  };

  if (issuerSignature) {
    proof.proofValue = issuerSignature;
    proof.signedBy = signerAddress;
    proof.signatureType = "personal_sign";
    proof.message = credential_hash;
  } else {
    proof.proofValue = credential_hash.substring(0, 64);
  }

  const insertData: any = {
    schema_id: schema.id,
    issuer_id: userId,
    holder_did: holderDid,
    holder_id: holderProfile?.user_id || null,
    credential_data: {
      ...vc,
      proof,
      blockchain: {
        network: "polygon-amoy",
        chainId: AMOY_CHAIN_ID,
        txHash: blockchainResult.txHash,
        blockNumber: blockchainResult.blockNumber,
        anchorWallet: blockchainResult.from,
        explorerUrl: `${AMOY_EXPLORER}/tx/${blockchainResult.txHash}`,
        calldata: `decentraid:credential:${credential_hash}`,
      },
    },
    credential_hash,
    prev_hash,
    blockchain_anchor: anchor,
    status: "active",
    issuer_signature: issuerSignature || null,
    signer_address: signerAddress || null,
  };

  if (expiresAt) {
    insertData.expires_at = expiresAt;
  }

  const { data: credential, error: insertError } = await supabase
    .from("credentials")
    .insert(insertData)
    .select()
    .single();

  if (insertError) throw insertError;

  await logAudit(supabase, userId, "credential_issued", "credential", credential.id, {
    holder_did: holderDid,
    schema_id: schema.id,
    schema_name: schema.name,
    signed_by_wallet: !!issuerSignature,
    signer_address: signerAddress,
    blockchain_anchor: anchor,
    blockchain_tx: blockchainResult.txHash,
    blockchain_block: blockchainResult.blockNumber,
  });

  return credential;
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
    const { schema_id, holder_did, credential_data, expires_at, batch, issuer_signature, signer_address } = body;

    const { data: schema } = await supabase
      .from("credential_schemas")
      .select("*")
      .eq("id", schema_id)
      .single();
    if (!schema) throw new Error("Schema not found");

    // Batch issuance
    if (batch && Array.isArray(batch)) {
      const results = [];
      const errors = [];
      for (const item of batch) {
        try {
          const cred = await issueOne(
            supabase, user.id, schema,
            item.holder_did,
            item.credential_data || credential_data || {},
            item.expires_at || expires_at || null,
            item.issuer_signature || issuer_signature || null,
            item.signer_address || signer_address || null
          );
          results.push(cred);
        } catch (e) {
          errors.push({ holder_did: item.holder_did, error: e instanceof Error ? e.message : "Unknown error" });
        }
      }

      await logAudit(supabase, user.id, "batch_issuance", "credential", null, {
        schema_id: schema.id,
        total: batch.length,
        issued: results.length,
        failed: errors.length,
      });

      return new Response(JSON.stringify({ issued: results.length, errors, credentials: results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Single issuance
    const credential = await issueOne(supabase, user.id, schema, holder_did, credential_data || {}, expires_at || null, issuer_signature || null, signer_address || null);

    return new Response(JSON.stringify({ credential }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("issue-credential error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
