import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AMOY_CHAIN_ID = 80002;
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

    const { credential_id, tx_hash, block_number, from_address, anchored_at } = await req.json();

    if (!credential_id || !tx_hash) {
      throw new Error("credential_id and tx_hash are required");
    }

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

    // Compact anchor string for the blockchain_anchor column
    const anchor = `polygon-amoy:${tx_hash.substring(0, 18)}:${block_number || 0}`;

    const updatedCredentialData = {
      ...credential.credential_data,
      blockchain: {
        network: "polygon-amoy",
        chainId: AMOY_CHAIN_ID,
        txHash: tx_hash,
        blockNumber: block_number || 0,
        // Unix timestamp from on-chain event (seconds). Falls back to now if not provided.
        anchoredAt: anchored_at || Math.floor(Date.now() / 1000),
        anchorWallet: from_address || null,
        explorerUrl: `${AMOY_EXPLORER}/tx/${tx_hash}`,
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

    if (updateError) throw updateError;

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
      explorer_url: `${AMOY_EXPLORER}/tx/${tx_hash}`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("anchor-credential error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
