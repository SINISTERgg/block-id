import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ethers } from "https://esm.sh/ethers@6.13.4";

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

async function getProvider(): Promise<ethers.JsonRpcProvider> {
  for (const rpc of AMOY_RPC_ENDPOINTS) {
    try {
      const provider = new ethers.JsonRpcProvider(rpc, AMOY_CHAIN_ID);
      await provider.getBlockNumber();
      return provider;
    } catch {
      console.warn(`RPC unavailable: ${rpc}`);
    }
  }
  throw new Error("All RPC endpoints are unavailable");
}

async function verifyOnChain(txHash: string, expectedHash: string): Promise<{ verified: boolean; onChainData: string | null; blockNumber: number | null; rpcUsed: string }> {
  for (const rpc of AMOY_RPC_ENDPOINTS) {
    try {
      const provider = new ethers.JsonRpcProvider(rpc, AMOY_CHAIN_ID);
      const tx = await provider.getTransaction(txHash);
      if (!tx) continue;

      const decodedData = ethers.toUtf8String(tx.data);
      const expectedCalldata = `decentraid:credential:${expectedHash}`;
      const verified = decodedData === expectedCalldata;
      const receipt = await provider.getTransactionReceipt(txHash);

      return { verified, onChainData: decodedData, blockNumber: receipt?.blockNumber || null, rpcUsed: rpc };
    } catch (err) {
      console.warn(`On-chain verify failed with ${rpc}:`, err);
    }
  }
  return { verified: false, onChainData: null, blockNumber: null, rpcUsed: "none" };
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

    const vc = credential.credential_data as any;

    // Reconstruct VC for hash verification
    const vcForHash: any = {
      "@context": vc["@context"],
      type: vc.type,
      issuer: vc.issuer,
      issuanceDate: vc.issuanceDate,
      credentialSubject: vc.credentialSubject,
      credentialSchema: vc.credentialSchema,
    };
    if (vc.expirationDate) {
      vcForHash.expirationDate = vc.expirationDate;
    }

    const encoder = new TextEncoder();
    const hashInput = encoder.encode(canonicalJson(vcForHash) + (credential.prev_hash || "genesis"));
    const hashBuffer = await crypto.subtle.digest("SHA-256", hashInput);
    const computedHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const hashValid = computedHash === credential.credential_hash;
    const notRevoked = credential.status === "active";
    const notExpired = !credential.expires_at || new Date(credential.expires_at) > new Date();

    // Real on-chain verification
    let blockchainVerified = false;
    let onChainVerification = null;
    const blockchainInfo = vc?.blockchain || null;

    if (blockchainInfo?.txHash) {
      const onChainResult = await verifyOnChain(blockchainInfo.txHash, credential.credential_hash);
      blockchainVerified = onChainResult.verified;
      onChainVerification = {
        txVerified: onChainResult.verified,
        onChainData: onChainResult.onChainData,
        blockNumber: onChainResult.blockNumber,
        checkedAt: new Date().toISOString(),
      };
    }

    // Signature verification status
    const proof = vc?.proof;
    const hasWalletSignature = proof?.signatureType === "personal_sign" && proof?.proofValue;
    const signatureInfo = hasWalletSignature
      ? { signed: true, type: proof.type, signer: proof.signedBy, method: proof.verificationMethod }
      : { signed: false, type: proof?.type || "none" };

    // AI Analysis
    let aiAnalysis = null;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (LOVABLE_API_KEY) {
      try {
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              {
                role: "system",
                content: "You are a credential verification assistant for a Web3 decentralized identity platform. Analyze the given verifiable credential and provide a brief risk assessment. Consider blockchain anchoring, hash integrity, cryptographic signature, expiration, and credential data quality. Respond with JSON: {\"risk_level\": \"low|medium|high\", \"confidence\": 0-100, \"findings\": [\"...\"]}",
              },
              {
                role: "user",
                content: `Analyze this W3C Verifiable Credential:\n\nCredential Data: ${JSON.stringify(vc)}\nHash Valid: ${hashValid}\nStatus: ${credential.status}\nBlockchain Anchor: ${credential.blockchain_anchor}\nOn-Chain Verified: ${blockchainVerified}\nWallet Signed: ${hasWalletSignature}\nSigner Address: ${credential.signer_address || "none"}\nExpires: ${credential.expires_at || "Never"}\nNot Expired: ${notExpired}\nIssued: ${credential.issued_at}`,
              },
            ],
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const content = aiData.choices?.[0]?.message?.content || "";
          try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) aiAnalysis = JSON.parse(jsonMatch[0]);
          } catch {
            aiAnalysis = { risk_level: "medium", confidence: 50, findings: ["AI analysis parse error"] };
          }
        }
      } catch (aiErr) {
        console.error("AI analysis error:", aiErr);
      }
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

    // Store verification result
    await supabase.from("verification_requests").insert({
      verifier_id: user.id,
      credential_id: credential.id,
      holder_did: (vc as any)?.credentialSubject?.id || "",
      credential_type: credential.credential_schemas?.credential_type || "",
      status: isValid ? "verified" : "rejected",
      ai_analysis: aiAnalysis,
      verified_at: new Date().toISOString(),
    });

    // Audit log
    await logAudit(supabase, user.id, "credential_verified", "credential", credential.id, {
      result: isValid ? "valid" : "invalid",
      hash_valid: hashValid,
      blockchain_verified: blockchainVerified,
      wallet_signed: hasWalletSignature,
      signer: credential.signer_address,
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
