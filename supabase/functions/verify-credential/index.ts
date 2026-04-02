// @ts-nocheck
// ↑ This file runs in Deno (Supabase Edge Functions), not Node.js.
//   URL imports and Deno.* globals are valid at runtime but unknown to VS Code's
//   Node TypeScript server. @ts-nocheck suppresses those false-positive errors.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ethers } from "https://esm.sh/ethers@6.13.4";
import { analyzeCredential, enhanceWithGemini } from "./ai-engine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AMOY_RPC_ENDPOINTS = [
  "https://rpc-amoy.polygon.technology",
  "https://polygon-amoy.drpc.org",
  "https://polygon-amoy-bor-rpc.publicnode.com",
];
const AMOY_CHAIN_ID = 80002;
const CONTRACT_ADDRESS = Deno.env.get("CREDENTIAL_REGISTRY_ADDRESS") || "";
const CONTRACT_ABI = [
  "function getCredentialStatus(bytes32 hash) external view returns (bool anchored, bool revoked, address issuer, uint256 blockAnchored)",
  "function isValid(bytes32 hash) external view returns (bool)",
];
const AMOY_EXPLORER = "https://amoy.polygonscan.com";

async function logAudit(supabase: any, userId: string, action: string, entityType: string, entityId: string | null, metadata: any = {}) {
  await supabase.from("audit_logs").insert({
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
  });
}

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

async function verifyOnChain(txHash: string, expectedHash: string): Promise<{ verified: boolean; onChainData: string | null; blockNumber: number | null; rpcUsed: string }> {
  for (const rpc of AMOY_RPC_ENDPOINTS) {
    try {
      const provider = new ethers.JsonRpcProvider(rpc, AMOY_CHAIN_ID);
      const tx = await provider.getTransaction(txHash);
      if (!tx) continue;
      const decodedData = ethers.toUtf8String(tx.data);
      const verified = decodedData === `decentraid:credential:${expectedHash}`;
      const receipt = await provider.getTransactionReceipt(txHash);
      return { verified, onChainData: decodedData, blockNumber: receipt?.blockNumber || null, rpcUsed: rpc };
    } catch (err) {
      console.warn(`On-chain verify failed with ${rpc}:`, err);
    }
  }
  return { verified: false, onChainData: null, blockNumber: null, rpcUsed: "none" };
}

async function verifyOnContract(credentialHash: string): Promise<{ anchored: boolean; revoked: boolean; issuer: string; blockAnchored: number; contractVerified: boolean }> {
  if (!CONTRACT_ADDRESS) {
    return { anchored: false, revoked: false, issuer: "", blockAnchored: 0, contractVerified: false };
  }
  for (const rpc of AMOY_RPC_ENDPOINTS) {
    try {
      const provider = new ethers.JsonRpcProvider(rpc, AMOY_CHAIN_ID);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      const hashBytes = ethers.zeroPadValue(credentialHash.startsWith("0x") ? credentialHash : ("0x" + credentialHash), 32);
      const [anchored, revoked, issuer, blockAnchored] = await contract.getCredentialStatus(hashBytes);
      return { anchored, revoked, issuer, blockAnchored: Number(blockAnchored), contractVerified: true };
    } catch (err) {
      console.warn(`Contract verify failed with ${rpc}:`, err);
    }
  }
  return { anchored: false, revoked: false, issuer: "", blockAnchored: 0, contractVerified: false };
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

    const { credential_id, vp_json } = await req.json();

    let credential;
    if (credential_id) {
      const { data } = await supabase
        .from("credentials")
        .select("*, credential_schemas(*)")
        .eq("id", credential_id)
        .single();
      credential = data;
    } else if (vp_json) {
      const vp = typeof vp_json === "string" ? JSON.parse(vp_json) : vp_json;
      const credId = vp?.verifiableCredential?.id || vp?.credential_id;
      if (credId) {
        const { data } = await supabase
          .from("credentials")
          .select("*, credential_schemas(*)")
          .eq("id", credId)
          .single();
        credential = data;
      }
    }

    if (!credential) throw new Error("Credential not found");

    const vc = credential.credential_data as Record<string, unknown>;

    // ─── Hash verification ────────────────────────────────────────────────────
    const vcForHash: Record<string, unknown> = {
      "@context": vc["@context"],
      type: vc.type,
      issuer: vc.issuer,
      issuanceDate: vc.issuanceDate,
      credentialSubject: vc.credentialSubject,
      credentialSchema: vc.credentialSchema,
    };
    if (vc.expirationDate) vcForHash.expirationDate = vc.expirationDate;

    const encoder = new TextEncoder();
    const hashInput = encoder.encode(canonicalJson(vcForHash) + (credential.prev_hash || "genesis"));
    const hashBuffer = await crypto.subtle.digest("SHA-256", hashInput);
    const computedHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const hashValid = computedHash === credential.credential_hash;
    const notRevoked = credential.status === "active";
    const notExpired = !credential.expires_at || new Date(credential.expires_at) > new Date();

    // ─── Blockchain verification ──────────────────────────────────────────────
    let blockchainVerified = false;
    let onChainRevoked = false;
    let onChainVerification: Record<string, unknown> | null = null;
    const blockchainInfo = (vc?.blockchain as Record<string, unknown>) || null;

    const contractResult = await verifyOnContract(credential.credential_hash);

    if (contractResult.contractVerified) {
      blockchainVerified = contractResult.anchored;
      onChainRevoked = contractResult.revoked;
      onChainVerification = {
        method: "contract",
        contractVerified: true,
        contractAnchored: contractResult.anchored,
        contractRevoked: contractResult.revoked,
        contractIssuer: contractResult.issuer,
        contractBlockAnchored: contractResult.blockAnchored,
        explorerUrl: contractResult.anchored
          ? `${AMOY_EXPLORER}/address/${CONTRACT_ADDRESS}`
          : null,
        checkedAt: new Date().toISOString(),
      };
    } else if ((blockchainInfo as any)?.txHash) {
      const onChainResult = await verifyOnChain((blockchainInfo as any).txHash, credential.credential_hash);
      blockchainVerified = onChainResult.verified;
      onChainVerification = {
        method: "calldata",
        txVerified: onChainResult.verified,
        onChainData: onChainResult.onChainData,
        blockNumber: onChainResult.blockNumber,
        checkedAt: new Date().toISOString(),
      };
    }

    // ─── Signature info ───────────────────────────────────────────────────────
    const proof = vc?.proof as Record<string, unknown> | undefined;
    const hasWalletSignature = proof?.signatureType === "personal_sign" && !!proof?.proofValue;
    const signatureInfo = hasWalletSignature
      ? { signed: true, type: proof!.type, signer: proof!.signedBy, method: proof!.verificationMethod }
      : { signed: false, type: proof?.type || "none" };

    // ─── Own AI Analysis ─────────────────────────────────────────────────────
    let aiAnalysis = analyzeCredential({
      vc,
      hashValid,
      dbStatus: credential.status,
      blockchainVerified,
      onChainRevoked,
      walletSigned: hasWalletSignature,
      signerAddress: credential.signer_address || null,
      issuedAt: credential.issued_at || null,
      expiresAt: credential.expires_at || null,
      credentialHash: credential.credential_hash,
      blockchainAnchor: credential.blockchain_anchor || null,
    });

    // ─── Gemini fallback enhancement ─────────────────────────────────────────
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (GEMINI_API_KEY) {
      aiAnalysis = await enhanceWithGemini(
        aiAnalysis,
        {
          vc,
          hashValid,
          dbStatus: credential.status,
          blockchainVerified,
          onChainRevoked,
          walletSigned: hasWalletSignature,
          signerAddress: credential.signer_address || null,
          issuedAt: credential.issued_at || null,
          expiresAt: credential.expires_at || null,
          credentialHash: credential.credential_hash,
          blockchainAnchor: credential.blockchain_anchor || null,
        },
        GEMINI_API_KEY
      );
    }

    const isValid = hashValid && notRevoked && notExpired && blockchainVerified;

    const result = {
      valid: isValid,
      hash_integrity: hashValid,
      not_revoked: notRevoked,
      not_expired: notExpired,
      expires_at: credential.expires_at,
      blockchain_anchor: credential.blockchain_anchor,
      blockchain_verified: blockchainVerified,
      blockchain_info: blockchainInfo,
      on_chain_verification: onChainVerification,
      signature: signatureInfo,
      credential,
      ai_analysis: aiAnalysis,
    };

    // ─── Store verification result ────────────────────────────────────────────
    await supabase.from("verification_requests").insert({
      verifier_id: user.id,
      credential_id: credential.id,
      holder_did: (vc as any)?.credentialSubject?.id || "",
      credential_type: (credential as any).credential_schemas?.credential_type || "",
      status: isValid ? "verified" : "rejected",
      ai_analysis: {
        score: aiAnalysis.score,
        risk_level: aiAnalysis.risk_level,
        confidence: aiAnalysis.confidence,
        engine: aiAnalysis.engine,
        findings: aiAnalysis.findings.slice(0, 5),
      },
      verified_at: new Date().toISOString(),
    });

    // ─── Audit log ────────────────────────────────────────────────────────────
    await logAudit(supabase, user.id, "credential_verified", "credential", credential.id, {
      result: isValid ? "valid" : "invalid",
      hash_valid: hashValid,
      blockchain_verified: blockchainVerified,
      wallet_signed: hasWalletSignature,
      signer: credential.signer_address,
      ai_score: aiAnalysis.score,
      ai_engine: aiAnalysis.engine,
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("verify-credential error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
