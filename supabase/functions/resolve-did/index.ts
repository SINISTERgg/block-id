import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { did } = await req.json();
    if (!did) throw new Error("DID is required");

    let didDocument: any = null;

    // did:decentraid:<hex> — resolve from profiles
    if (did.startsWith("did:decentraid:")) {
      const parts = did.split(":");
      const isIssuer = parts[2] === "issuer";

      if (isIssuer) {
        // did:decentraid:issuer:<user_id>
        const userId = parts[3];
        const { data: profile } = await supabase
          .from("profiles")
          .select("user_id, full_name, organization, wallet_address, did")
          .eq("user_id", userId)
          .single();

        if (!profile) throw new Error("Issuer not found");

        // Check trusted issuer status
        const { data: trusted } = await supabase
          .from("trusted_issuers")
          .select("*")
          .eq("issuer_did", did)
          .single();

        const verificationMethods: any[] = [
          {
            id: `${did}#key-1`,
            type: "Ed25519VerificationKey2020",
            controller: did,
            publicKeyMultibase: "z" + btoa(userId).replace(/=/g, ""),
          },
        ];

        if (profile.wallet_address) {
          verificationMethods.push({
            id: `${did}#wallet-1`,
            type: "EcdsaSecp256k1RecoveryMethod2020",
            controller: did,
            blockchainAccountId: `eip155:137:${profile.wallet_address}`,
          });
        }

        didDocument = {
          "@context": [
            "https://www.w3.org/ns/did/v1",
            "https://w3id.org/security/suites/ed25519-2020/v1",
            "https://w3id.org/security/suites/secp256k1recovery-2020/v1",
          ],
          id: did,
          controller: did,
          verificationMethod: verificationMethods,
          authentication: verificationMethods.map((vm) => vm.id),
          assertionMethod: verificationMethods.map((vm) => vm.id),
          service: [
            {
              id: `${did}#decentraid-platform`,
              type: "DecentraIDService",
              serviceEndpoint: supabaseUrl,
            },
          ],
          metadata: {
            name: profile.full_name,
            organization: profile.organization,
            trusted: trusted
              ? {
                  status: trusted.verification_status,
                  level: trusted.trust_level,
                  verifiedAt: trusted.verified_at,
                }
              : null,
          },
        };
      } else {
        // Holder DID: did:decentraid:<hex>
        const { data: profile } = await supabase
          .from("profiles")
          .select("user_id, full_name, wallet_address, did, biometric_registered, face_registered")
          .eq("did", did)
          .single();

        if (!profile) throw new Error("DID not found");

        const verificationMethods: any[] = [
          {
            id: `${did}#key-1`,
            type: "Ed25519VerificationKey2020",
            controller: did,
            publicKeyMultibase: "z" + btoa(profile.user_id).replace(/=/g, ""),
          },
        ];

        if (profile.wallet_address) {
          verificationMethods.push({
            id: `${did}#wallet-1`,
            type: "EcdsaSecp256k1RecoveryMethod2020",
            controller: did,
            blockchainAccountId: `eip155:137:${profile.wallet_address}`,
          });
        }

        const authMethods = [...verificationMethods.map((vm) => vm.id)];
        if (profile.biometric_registered) authMethods.push(`${did}#webauthn-1`);
        if (profile.face_registered) authMethods.push(`${did}#face-1`);

        didDocument = {
          "@context": [
            "https://www.w3.org/ns/did/v1",
            "https://w3id.org/security/suites/ed25519-2020/v1",
          ],
          id: did,
          controller: did,
          verificationMethod: verificationMethods,
          authentication: authMethods,
          assertionMethod: verificationMethods.map((vm) => vm.id),
          service: [
            {
              id: `${did}#decentraid-wallet`,
              type: "DecentraIDWallet",
              serviceEndpoint: supabaseUrl,
            },
          ],
        };
      }
    }
    // did:ethr:polygon:<address>
    else if (did.startsWith("did:ethr:polygon:")) {
      const address = did.split(":")[3];
      if (!address) throw new Error("Invalid did:ethr format");

      // Find profile by wallet
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id, full_name, did, wallet_address")
        .eq("wallet_address", address)
        .single();

      didDocument = {
        "@context": [
          "https://www.w3.org/ns/did/v1",
          "https://w3id.org/security/suites/secp256k1recovery-2020/v1",
        ],
        id: did,
        controller: did,
        verificationMethod: [
          {
            id: `${did}#controller`,
            type: "EcdsaSecp256k1RecoveryMethod2020",
            controller: did,
            blockchainAccountId: `eip155:137:${address}`,
          },
        ],
        authentication: [`${did}#controller`],
        assertionMethod: [`${did}#controller`],
        alsoKnownAs: profile?.did ? [profile.did] : [],
      };
    } else {
      throw new Error(`Unsupported DID method: ${did}`);
    }

    return new Response(
      JSON.stringify({
        didDocument,
        didResolutionMetadata: { contentType: "application/did+json" },
        didDocumentMetadata: { created: new Date().toISOString() },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/did+json" } }
    );
  } catch (e) {
    console.error("resolve-did error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
