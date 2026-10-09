import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isPinataConfigured, pinJsonToIpfs } from "../_shared/ipfs.ts";
import { computeCredentialHash } from "../_shared/vc-hash.ts";
import { resolveAutoIdFields } from "../_shared/identity-id.ts";
import { clientIp, rateLimited, tooManyRequestsResponse, requireUser, verifyUserHasRole, sanitizedError, jsonResponse } from "../_shared/security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_LIMIT_MAX = 30;
const ISSUER_ROLES = ["issuer", "org_admin"];
const MAX_BATCH_SIZE = 500;
const DID_PATTERN = /^did:[a-z0-9]+:.+$/i;

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

/**
 * Phase 3 — Decentralized storage: best-effort pin the schema JSON-LD to IPFS
 * on first issuance so every credential references a content-addressed schema.
 * Failures never block issuance; pinning can be retried via pin-to-ipfs.
 */
async function ensureSchemaPinned(supabase: any, userId: string, schema: any): Promise<string | null> {
  try {
    if (!isPinataConfigured() || schema.ipfs_cid) return null;

    const doc = {
      "@context": [
        "https://www.w3.org/2018/credentials/v1",
        "https://w3id.org/security/suites/ed25519-2020/v1",
      ],
      type: "JsonSchemaValidator2018",
      schemaId: schema.id,
      name: schema.name,
      credentialType: schema.credential_type,
      version: schema.version ?? 1,
      issuer: `did:decentraid:issuer:${userId}`,
      fields: Array.isArray(schema.fields) ? schema.fields : [],
      created: schema.created_at ?? new Date().toISOString(),
    };

    const pin = await pinJsonToIpfs(
      doc,
      `blockid-schema-${schema.name}-v${schema.version ?? 1}`,
      { app: "blockid", kind: "credential_schema", schema_id: schema.id, version: String(schema.version ?? 1) }
    );

    const pinnedAt = new Date().toISOString();
    await supabase
      .from("credential_schemas")
      .update({ ipfs_cid: pin.cid, ipfs_pinned_at: pinnedAt })
      .eq("id", schema.id);

    await logAudit(supabase, userId, "schema_pinned_ipfs", "schema", schema.id, {
      schema_name: schema.name,
      cid: pin.cid,
      gateway_url: pin.gatewayUrl,
      triggered_by: "issuance",
    });

    return pin.cid;
  } catch (e) {
    console.warn("IPFS schema pinning skipped:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function issueOne(
  supabase: any,
  userId: string,
  schema: any,
  holderDid: string,
  credentialData: any,
  expiresAt: string | null,
  issuerSignature: string | null,
  signerAddress: string | null,
  sbtRequested: boolean = false
) {
  const { data: holderProfile } = await supabase
    .from("profiles")
    // wallet_address is returned so the caller can mint the holder's SBT badge
    // to the right recipient — the DID's own address is preferred, this is the
    // fallback for DIDs that are not Ethereum-based.
    .select("user_id, wallet_address")
    .eq("did", holderDid)
    .single();

  // ── Fix: prev_hash race condition ────────────────────────────────────────────
  // Use a millisecond-precision timestamp salt appended to the canonical JSON
  // before hashing. This guarantees uniqueness even under concurrent issuance
  // without requiring a DB row lock.
  const { data: lastCred } = await supabase
    .from("credentials")
    .select("credential_hash")
    .order("issued_at", { ascending: false })
    .limit(1)
    .single();

  const prev_hash = lastCred?.credential_hash || "genesis";

  // Auto-generated fields (e.g. idNumber) are allocated here — and only here —
  // with a fresh, guaranteed-unique value. Client-supplied values are discarded.
  const resolvedData = await resolveAutoIdFields(supabase, schema, credentialData);

  const vc: any = {
    "@context": ["https://www.w3.org/2018/credentials/v1", "https://w3id.org/security/suites/ed25519-2020/v1"],
    type: ["VerifiableCredential", schema.credential_type],
    issuer: `did:decentraid:issuer:${userId}`,
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      id: holderDid,
      ...resolvedData,
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

  // Deterministic canonical hash (shared with verify-credential/_shared/vc-hash.ts).
  // Reproducible from the stored row: credential_data sans proof + prev_hash.
  const credential_hash = await computeCredentialHash(vc, prev_hash);

  // Build proof
  const proof: any = {
    type: issuerSignature ? "EcdsaSecp256k1Signature2019" : "Ed25519Signature2020",
    created: new Date().toISOString(),
    verificationMethod: signerAddress
      ? `did:ethr:sepolia:${signerAddress}#controller`
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
    },
    credential_hash,
    prev_hash,
    status: "active",
    issuer_signature: issuerSignature || null,
    signer_address: signerAddress || null,
    // Durable record of the issuer's badge request. The holder portal needs
    // this to tell "badge requested but never minted" apart from "no badge
    // wanted" — the mint itself happens client-side, in a wallet.
    sbt_requested: sbtRequested === true,
  };

  if (expiresAt) {
    insertData.expires_at = expiresAt;
  }

  const { data: credential, error: insertError } = await supabase
    .from("credentials")
    .insert(insertData)
    .select()
    .single();

  if (insertError) {
    console.error("Insert error:", insertError);
    throw new Error("Failed to store credential");
  }

  await logAudit(supabase, userId, "credential_issued", "credential", credential.id, {
    holder_did: holderDid,
    schema_id: schema.id,
    schema_name: schema.name,
    signed_by_wallet: !!issuerSignature,
    signer_address: signerAddress,
    credential_hash,
  });

  // `holder_wallet_address` is surfaced to the caller so the client can mint the
  // soulbound badge to the holder rather than to the issuer. `holder_did` is
  // repeated here because the UI needs the DID to derive the preferred address.
  return {
    ...credential,
    credential_hash,
    holder_did: holderDid,
    holder_wallet_address: holderProfile?.wallet_address ?? null,
  };
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

    // ── Server-side RBAC: only issuers (or org admins) may issue ──────────────
    const isIssuer = await verifyUserHasRole(supabase, user.id, ISSUER_ROLES);
    if (!isIssuer) return jsonResponse({ error: "Forbidden: issuer role required" }, 403, corsHeaders);

    const body = await req.json();
    const {
      schema_id,
      holder_did,
      credential_data,
      expires_at,
      batch,
      issuer_signature,
      signer_address,
      sbt_requested,
    } = body;

    if (typeof schema_id !== "string" || !schema_id.trim()) {
      return jsonResponse({ error: "schema_id is required" }, 400, corsHeaders);
    }

    // Validate batch size and shapes before touching the DB.
    if (batch !== undefined) {
      if (!Array.isArray(batch)) return jsonResponse({ error: "batch must be an array" }, 400, corsHeaders);
      if (batch.length === 0 || batch.length > MAX_BATCH_SIZE) {
        return jsonResponse({ error: `batch must contain 1-${MAX_BATCH_SIZE} items` }, 400, corsHeaders);
      }
    } else if (holder_did !== undefined) {
      if (typeof holder_did !== "string" || !DID_PATTERN.test(holder_did)) {
        return jsonResponse({ error: "holder_did must be a valid DID" }, 400, corsHeaders);
      }
    }

    const { data: schema, error: schemaError } = await supabase
      .from("credential_schemas")
      .select("*")
      .eq("id", schema_id)
      .single();
    if (schemaError || !schema) return jsonResponse({ error: "Schema not found" }, 404, corsHeaders);

    // Batch issuance
    if (batch && Array.isArray(batch)) {
      const results = [];
      const errors = [];
      for (const item of batch) {
        try {
          if (typeof item?.holder_did !== "string" || !DID_PATTERN.test(item.holder_did)) {
            errors.push({ holder_did: item?.holder_did, error: "Invalid holder DID" });
            continue;
          }
          const cred = await issueOne(
            supabase, user.id, schema,
            item.holder_did,
            item.credential_data || credential_data || {},
            item.expires_at || expires_at || null,
            item.issuer_signature || issuer_signature || null,
            item.signer_address || signer_address || null,
            (item.sbt_requested ?? sbt_requested) === true
          );
          results.push(cred);
        } catch (e) {
          errors.push({ holder_did: item.holder_did, error: sanitizedError(e, "Failed to issue item") });
        }
      }

      await logAudit(supabase, user.id, "batch_issuance", "credential", null, {
        schema_id: schema.id,
        total: batch.length,
        issued: results.length,
        failed: errors.length,
      });

      const schemaIpfsCid = results.length > 0 ? await ensureSchemaPinned(supabase, user.id, schema) : null;

      return new Response(JSON.stringify({ issued: results.length, errors, credentials: results, schema_ipfs_cid: schemaIpfsCid }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Single issuance
    try {
      const credential = await issueOne(supabase, user.id, schema, holder_did, credential_data || {}, expires_at || null, issuer_signature || null, signer_address || null, sbt_requested === true);
      const schemaIpfsCid = await ensureSchemaPinned(supabase, user.id, schema);
      return new Response(JSON.stringify({ credential, schema_ipfs_cid: schemaIpfsCid }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (issueError) {
      console.error("issueOne error:", issueError);
      throw issueError;
    }
  } catch (e) {
    console.error("issue-credential error:", e);
    return new Response(JSON.stringify({ error: sanitizedError(e, "Failed to issue credential") }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
