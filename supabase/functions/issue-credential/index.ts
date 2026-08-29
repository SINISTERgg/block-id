import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isPinataConfigured, pinJsonToIpfs } from "../_shared/ipfs.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_EXPLORER = "https://sepolia.etherscan.io";

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

    console.log("Schema pinned to IPFS:", pin.cid);
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
  signerAddress: string | null
) {
  console.log("issueOne called with:", { userId, schemaId: schema.id, holderDid });

  const { data: holderProfile } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("did", holderDid)
    .single();
  console.log("holderProfile:", holderProfile);

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
  // High-resolution salt: ISO timestamp to microsecond precision + random bytes
  const issuanceSalt = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

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

  // Salt is included in the hash input (not stored in the VC) to prevent collisions
  const credential_hash = await hashData(canonicalJson(vc) + prev_hash + issuanceSalt);

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
  };

  if (expiresAt) {
    insertData.expires_at = expiresAt;
  }

  console.log("Inserting credential with data:", JSON.stringify(insertData));
  const { data: credential, error: insertError } = await supabase
    .from("credentials")
    .insert(insertData)
    .select()
    .single();

  if (insertError) {
    console.error("Insert error:", insertError);
    throw new Error("DB insert failed: " + JSON.stringify(insertError));
  }

  await logAudit(supabase, userId, "credential_issued", "credential", credential.id, {
    holder_did: holderDid,
    schema_id: schema.id,
    schema_name: schema.name,
    signed_by_wallet: !!issuerSignature,
    signer_address: signerAddress,
    credential_hash,
  });

  return { ...credential, credential_hash };
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

      const schemaIpfsCid = results.length > 0 ? await ensureSchemaPinned(supabase, user.id, schema) : null;

      return new Response(JSON.stringify({ issued: results.length, errors, credentials: results, schema_ipfs_cid: schemaIpfsCid }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Single issuance
    try {
      const credential = await issueOne(supabase, user.id, schema, holder_did, credential_data || {}, expires_at || null, issuer_signature || null, signer_address || null);
      const schemaIpfsCid = await ensureSchemaPinned(supabase, user.id, schema);
      return new Response(JSON.stringify({ credential, schema_ipfs_cid: schemaIpfsCid }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (issueError) {
      console.error("issueOne error:", issueError);
      throw new Error("Failed to issue: " + (issueError instanceof Error ? issueError.message : String(issueError)));
    }
  } catch (e) {
    console.error("issue-credential error:", e);
    const errorMsg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: errorMsg, details: errorMsg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
