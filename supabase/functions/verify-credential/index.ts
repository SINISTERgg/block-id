// @ts-nocheck
// ↑ This file runs in Deno (Supabase Edge Functions), not Node.js.
//   URL imports and Deno.* globals are valid at runtime but unknown to VS Code's
//   Node TypeScript server. @ts-nocheck suppresses those false-positive errors.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ethers } from "https://esm.sh/ethers@6.13.4";
import { analyzeWithNarrative, isCredentialAcceptable } from "./ai-engine.ts";
import { resolveIssuer, daysSince, unverifiedChecks, type CredentialSignals } from "../_shared/credentialEngine.ts";
import { computeCredentialHash } from "../_shared/vc-hash.ts";
import { clientIp, rateLimited, tooManyRequestsResponse, requireUser, sanitizedError, jsonResponse } from "../_shared/security.ts";
import { chargeAiBudget, aiBudgetExceeded } from "../_shared/aiBudget.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * IP flood guard only. The per-user AI budget is charged further down, once
 * auth has run, because the IP alone is not a quota: one account behind rotating
 * IPs must not be able to spend the model budget of many.
 */
const RATE_LIMIT_MAX = 60;
const MAX_VP_JSON_BYTES = 2_000_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Never let a single RPC hop stall the verifier's page. */
const RPC_TIMEOUT_MS = 8_000;
const LLM_TIMEOUT_MS = 12_000;
const HISTORY_SAMPLE_LIMIT = 500;
const MIN_HISTORY_FOR_RATE = 5;

const SEPOLIA_RPC_ENDPOINTS = [
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://rpc.sepolia.org",
  "https://sepolia.gateway.tenderly.co",
];
const SEPOLIA_CHAIN_ID = 11155111;
const CONTRACT_ADDRESS = Deno.env.get("CREDENTIAL_REGISTRY_ADDRESS") || "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || undefined;
const CONTRACT_ABI = [
  "function getCredentialStatus(bytes32 hash) external view returns (bool anchored, bool revoked, address issuer, uint256 blockAnchored)",
  "function isValid(bytes32 hash) external view returns (bool)",
];
const SEPOLIA_EXPLORER = "https://sepolia.etherscan.io";

/** Reject a promise that outlives `ms`, so a hung RPC cannot hang the function. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
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

async function verifyOnChain(txHash: string, expectedHash: string): Promise<{ verified: boolean; onChainData: string | null; blockNumber: number | null; rpcUsed: string }> {
  for (const rpc of SEPOLIA_RPC_ENDPOINTS) {
    try {
      const provider = new ethers.JsonRpcProvider(rpc, SEPOLIA_CHAIN_ID);
      const tx = await withTimeout(provider.getTransaction(txHash), RPC_TIMEOUT_MS, `getTransaction(${rpc})`);
      if (!tx) continue;
      const decodedData = ethers.toUtf8String(tx.data);
      const verified = decodedData === `decentraid:credential:${expectedHash}`;
      const receipt = await withTimeout(provider.getTransactionReceipt(txHash), RPC_TIMEOUT_MS, `getTransactionReceipt(${rpc})`);
      return { verified, onChainData: decodedData, blockNumber: receipt?.blockNumber || null, rpcUsed: rpc };
    } catch (err) {
      console.warn(`On-chain verify failed with ${rpc}:`, err);
    }
  }
  return { verified: false, onChainData: null, blockNumber: null, rpcUsed: "none" };
}

/**
 * Read the credential status from the registry contract.
 *
 * `reachable` is tracked separately from `anchored`. Conflating the two is what
 * made an RPC outage indistinguishable from a missing anchor — a distinction
 * that now feeds both the anchor dimension and the confidence figure.
 */
async function verifyOnContract(credentialHash: string): Promise<{ reachable: boolean; anchored: boolean; revoked: boolean; issuer: string; blockAnchored: number }> {
  if (!CONTRACT_ADDRESS) {
    return { reachable: false, anchored: false, revoked: false, issuer: "", blockAnchored: 0 };
  }
  for (const rpc of SEPOLIA_RPC_ENDPOINTS) {
    try {
      const provider = new ethers.JsonRpcProvider(rpc, SEPOLIA_CHAIN_ID);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      const hashBytes = ethers.zeroPadValue(credentialHash.startsWith("0x") ? credentialHash : ("0x" + credentialHash), 32);
      const [anchored, revoked, issuer, blockAnchored] = await withTimeout(
        contract.getCredentialStatus(hashBytes),
        RPC_TIMEOUT_MS,
        `getCredentialStatus(${rpc})`,
      );
      return { reachable: true, anchored, revoked, issuer, blockAnchored: Number(blockAnchored) };
    } catch (err) {
      console.warn(`Contract verify failed with ${rpc}:`, err);
    }
  }
  return { reachable: false, anchored: false, revoked: false, issuer: "", blockAnchored: 0 };
}

/**
 * Derive a 0-100 issuer reputation from `trusted_issuers`.
 *
 * There is no stored reputation number, so this maps the two fields that do
 * exist. An issuer that is not registered returns `null` — "unknown", not
 * "bad" — which lowers confidence rather than inventing a score.
 */
async function lookupIssuerReputation(supabase: any, issuerDid: string | null): Promise<number | null> {
  if (!issuerDid) return null;
  try {
    const { data, error } = await supabase
      .from("trusted_issuers")
      .select("verification_status, trust_level")
      .eq("issuer_did", issuerDid)
      .maybeSingle();
    if (error || !data) return null;

    let score = 40;
    if (data.verification_status === "verified") score += 30;
    else if (data.verification_status === "rejected") score -= 40;

    const level = String(data.trust_level || "standard").toLowerCase();
    if (level === "high" || level === "elevated") score += 20;
    else if (level === "low" || level === "revoked" || level === "untrusted") score -= 20;

    return Math.max(0, Math.min(100, score));
  } catch (err) {
    console.warn("Issuer reputation lookup failed:", err);
    return null;
  }
}

/** Historical pass rate for this issuer's credentials, or null if too thin. */
async function lookupVerificationSuccessRate(supabase: any, issuerUserId: string | null): Promise<number | null> {
  if (!issuerUserId) return null;
  try {
    const { data, error } = await supabase
      .from("verification_requests")
      .select("status, credentials!inner(issuer_id)")
      .eq("credentials.issuer_id", issuerUserId)
      .limit(HISTORY_SAMPLE_LIMIT);
    if (error || !Array.isArray(data) || data.length < MIN_HISTORY_FOR_RATE) return null;

    const decided = data.filter((r: any) => r.status === "verified" || r.status === "rejected");
    if (decided.length < MIN_HISTORY_FOR_RATE) return null;
    return decided.filter((r: any) => r.status === "verified").length / decided.length;
  } catch (err) {
    console.warn("Verification history lookup failed:", err);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();

  try {
    if (rateLimited(clientIp(req), 60_000, RATE_LIMIT_MAX)) {
      return tooManyRequestsResponse(corsHeaders);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);

    const rawBody = await req.text();
    if (rawBody.length > MAX_VP_JSON_BYTES) {
      return jsonResponse({ error: "Request body too large" }, 413, corsHeaders);
    }
    let parsedBody;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400, corsHeaders);
    }
    const { credential_id, vp_json } = parsedBody;

    let credential;
    if (credential_id) {
      if (typeof credential_id !== "string" || !UUID_PATTERN.test(credential_id)) {
        return jsonResponse({ error: "credential_id must be a valid UUID" }, 400, corsHeaders);
      }
      const { data } = await supabase
        .from("credentials")
        .select("*, prev_hash, credential_schemas(*)")
        .eq("id", credential_id)
        .single();
      credential = data;
    } else if (vp_json) {
      let vp;
      try {
        vp = typeof vp_json === "string" ? JSON.parse(vp_json) : vp_json;
      } catch {
        return jsonResponse({ error: "vp_json is not valid JSON" }, 400, corsHeaders);
      }

      let targetId: string | null = null;
      let targetHash: string | null = null;

      const rawId = vp?.credential_id || vp?.id ||
        (Array.isArray(vp?.verifiableCredential) ? vp.verifiableCredential[0]?.id : vp?.verifiableCredential?.id);
      if (typeof rawId === "string") {
        const cleanId = rawId.replace(/^urn:uuid:/, "");
        if (UUID_PATTERN.test(cleanId)) {
          targetId = cleanId;
        }
      }

      const rawHash = vp?.hash || vp?.credential_hash || vp?.credentialHash ||
        (Array.isArray(vp?.verifiableCredential) ? vp.verifiableCredential[0]?.credential_hash : vp?.verifiableCredential?.credential_hash);
      if (typeof rawHash === "string" && rawHash.trim()) {
        targetHash = rawHash.trim();
      }

      if (targetId) {
        const { data } = await supabase
          .from("credentials")
          .select("*, prev_hash, credential_schemas(*)")
          .eq("id", targetId)
          .maybeSingle();
        credential = data;
      }

      if (!credential && targetHash) {
        const { data } = await supabase
          .from("credentials")
          .select("*, prev_hash, credential_schemas(*)")
          .eq("credential_hash", targetHash)
          .maybeSingle();
        credential = data;
      }
    }

    if (!credential) return jsonResponse({ error: "Credential not found" }, 404, corsHeaders);

    const vc = (credential.credential_data as Record<string, unknown>) ?? {};

    // ─── Hash verification ────────────────────────────────────────────────────
    // Recompute the canonical hash from the stored row via the SHARED module
    // (_shared/vc-hash.ts) — the same algorithm issue-credential and oid4vci
    // use. hashableCredential strips the signature `proof` internally, so
    // passing the full credential_data reproduces the issuance-time digest.
    const computedHash = await computeCredentialHash(vc, credential.prev_hash || "genesis");
    const hashValid = computedHash === credential.credential_hash;

    // ─── Blockchain verification ──────────────────────────────────────────────
    const blockchainInfo = (vc?.blockchain as Record<string, unknown>) || null;
    const contractResult = await verifyOnContract(credential.credential_hash);

    let blockchainVerified = false;
    let onChainRevoked = false;
    let onChainVerification: Record<string, unknown> | null = null;

    if (contractResult.reachable) {
      blockchainVerified = contractResult.anchored;
      onChainRevoked = contractResult.revoked;
      onChainVerification = {
        method: "contract",
        contractVerified: true,
        contractReachable: true,
        contractAnchored: contractResult.anchored,
        contractRevoked: contractResult.revoked,
        contractIssuer: contractResult.issuer,
        contractBlockAnchored: contractResult.blockAnchored,
        explorerUrl: contractResult.anchored ? `${SEPOLIA_EXPLORER}/address/${CONTRACT_ADDRESS}` : null,
        checkedAt: new Date().toISOString(),
      };
    } else if ((blockchainInfo as any)?.txHash) {
      // The registry contract was unreachable — fall back to reading the calldata.
      // This still proves an anchor exists, so `onChainChecked` stays true.
      const onChainResult = await verifyOnChain((blockchainInfo as any).txHash, credential.credential_hash);
      blockchainVerified = onChainResult.verified;
      onChainVerification = {
        method: "calldata",
        registryReachable: false,
        txVerified: onChainResult.verified,
        onChainData: onChainResult.onChainData,
        blockNumber: onChainResult.blockNumber,
        rpcUsed: onChainResult.rpcUsed,
        checkedAt: new Date().toISOString(),
      };
    }

    // The chain was successfully interrogated if either path produced an answer.
    const onChainChecked = contractResult.reachable || !!onChainVerification;

    // ─── Signature info ───────────────────────────────────────────────────────
    const proof = vc?.proof as Record<string, unknown> | undefined;
    const hasWalletSignature = proof?.signatureType === "personal_sign" && !!proof?.proofValue;
    const signatureInfo = hasWalletSignature
      ? { signed: true, type: proof!.type, signer: proof!.signedBy, method: proof!.verificationMethod }
      : { signed: false, type: proof?.type || "none" };

    // ─── Reputation & history (best-effort, feeds confidence) ─────────────────
    const issuerDid = resolveIssuer(vc);
    const [issuerReputation, verificationSuccessRate] = await Promise.all([
      lookupIssuerReputation(supabase, issuerDid),
      lookupVerificationSuccessRate(supabase, credential.issuer_id),
    ]);

    const notRevoked = credential.status === "active" && !onChainRevoked;
    const notExpired = !credential.expires_at || new Date(credential.expires_at) > new Date();

    // ─── Build the canonical signal set ───────────────────────────────────────
    const signals: CredentialSignals = {
      vc,
      // A stored digest is always present on this path — it is the row we just
      // loaded — so the comparison above is a real check, not an assumption.
      hashChecked: true,
      hashValid,
      dbStatus: credential.status,
      blockchainVerified,
      onChainRevoked,
      blockchainAnchor: credential.blockchain_anchor || null,
      onChainChecked,
      walletSigned: hasWalletSignature,
      // A `personal_sign` proof is self-asserted: it proves the holder signed
      // something, not that the issuer authorised the claims. We report
      // "unverified" rather than asserting a signature check we never ran.
      signatureVerified: hasWalletSignature ? null : false,
      signerAddress: credential.signer_address || null,
      issuedAt: credential.issued_at || null,
      expiresAt: credential.expires_at || null,
      notExpired,
      credentialHash: credential.credential_hash,
      issuerReputation,
      verificationSuccessRate,
      credentialAgeDays: credential.issued_at ? daysSince(credential.issued_at) : null,
      zkProofVerified: vc?.zkp?.verified ?? null,
      schemaKnown: credential.credential_schemas ? true : null,
    };

    // ─── Analyze (deterministic score, optional LLM narrative) ────────────────
    //
    // The narrative is billed work, so it draws on a per-user budget. When that
    // is spent we drop the narrative and keep the verification: the score,
    // verdict and audit trail are deterministic and must never depend on
    // whether the user has spend available. Refusing the verification instead
    // would trade a security guarantee for a cost one.
    const budget = chargeAiBudget(user.id, "verify-credential");

    const outcome = await analyzeWithNarrative(signals, {
      apiKey: GEMINI_API_KEY,
      model: GEMINI_MODEL,
      timeoutMs: LLM_TIMEOUT_MS,
      surface: "verify-credential",
      userId: user.id,
      credentialId: credential.id,
      telemetry: supabase,
      skipLlmReason: budget.allowed ? undefined : "ai_budget_exhausted",
    });
    const aiAnalysis = outcome.analysis;

    // Validity is derived from the definitive signals only. It deliberately
    // ignores the score, the risk level and every byte of LLM output.
    const acceptability = isCredentialAcceptable(signals);
    const incomplete = unverifiedChecks(signals);
    const isValid = hashValid && notRevoked && notExpired && (blockchainVerified || !onChainChecked);

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
      on_chain_checked: onChainChecked,
      signature: signatureInfo,
      issuer_reputation: issuerReputation,
      invalid_reasons: acceptability.reasons,
      unverified_checks: incomplete,
      provisional: incomplete.length > 0,
      credential,
      ai_analysis: aiAnalysis,
      ai_engine_status: {
        engine: aiAnalysis.engine,
        schema_version: aiAnalysis.schema_version,
        llm_enabled: outcome.llmEnabled,
        degraded: outcome.degraded,
        model: outcome.model,
        latency_ms: outcome.latencyMs,
        total_latency_ms: outcome.totalLatencyMs,
        error: outcome.error,
      },
    };

    // ─── Store verification result ────────────────────────────────────────────
    // The full canonical analysis is persisted so history, analytics and the
    // dashboard all read the same 0-100 confidence on the same scale.
    await supabase.from("verification_requests").insert({
      verifier_id: user.id,
      credential_id: credential.id,
      holder_did: (vc as any)?.credentialSubject?.id || "",
      credential_type: (credential as any).credential_schemas?.credential_type || "",
      status: isValid ? "verified" : "rejected",
      trust_score: aiAnalysis.score,
      trust_tier: aiAnalysis.tier,
      ai_analysis: aiAnalysis,
      verified_at: new Date().toISOString(),
    });

    // ─── Audit log ────────────────────────────────────────────────────────────
    await logAudit(supabase, user.id, "credential_verified", "credential", credential.id, {
      result: isValid ? "valid" : "invalid",
      invalid_reasons: acceptability.reasons,
      hash_valid: hashValid,
      blockchain_verified: blockchainVerified,
      on_chain_checked: onChainChecked,
      wallet_signed: hasWalletSignature,
      signer: credential.signer_address,
      ai_score: aiAnalysis.score,
      ai_raw_score: aiAnalysis.raw_score,
      ai_risk_level: aiAnalysis.risk_level,
      ai_confidence: aiAnalysis.confidence,
      ai_engine: aiAnalysis.engine,
      ai_hard_caps: aiAnalysis.hard_caps_applied.map((c) => c.key),
      ai_llm_degraded: outcome.degraded,
      ai_latency_ms: outcome.totalLatencyMs,
      duration_ms: Date.now() - startedAt,
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("verify-credential error:", e);
    return new Response(JSON.stringify({ error: sanitizedError(e, "Verification failed") }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
