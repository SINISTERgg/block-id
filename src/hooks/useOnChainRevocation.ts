import { useState, useCallback } from "react";
import {
  revokeCredentialOnChain,
  getCredentialStatus,
  isContractDeployed,
} from "@/services/blockchain/registry";
import {
  revokeSbt,
  getSbtForCredential,
  isSbtConfigured,
} from "@/services/blockchain/sbt.service";
import { revokeCredential } from "@/services/api/issuer.service";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AMOY_EXPLORER } from "@/services/blockchain/config";

type TxState = "idle" | "signing" | "mining" | "confirmed" | "failed";

interface UseOnChainRevocationResult {
  revoke: (
    credentialHash: string,
    credentialId: string,
    issuerId: string,
  ) => Promise<boolean>;
  txState: TxState;
  txHash: string | null;
  reset: () => void;
}

/**
 * Hook that manages the full on-chain revocation flow:
 * 1. Check on-chain status (skip if not anchored or already revoked)
 * 2. MetaMask signing prompt
 * 3. Transaction mining on Ethereum Sepolia
 * 4. Supabase status update
 *
 * Falls back to Supabase-only revocation if MetaMask isn't available
 * or the credential was never anchored on-chain.
 */
export function useOnChainRevocation(): UseOnChainRevocationResult {
  const [txState, setTxState] = useState<TxState>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const { toast } = useToast();

  const reset = useCallback(() => {
    setTxState("idle");
    setTxHash(null);
  }, []);

  const revoke = useCallback(
    async (
      credentialHash: string,
      credentialId: string,
      issuerId: string,
    ): Promise<boolean> => {
      setTxState("signing");
      setTxHash(null);

      // Use a local variable to avoid the stale closure bug where
      // txHash state would lag behind the actual submitted hash.
      let submittedHash: string | null = null;

      try {
        // Attempt on-chain revocation first
        if (window.ethereum && isContractDeployed()) {
          try {
            // ── Pre-flight: check on-chain status before sending a tx ──
            const status = await getCredentialStatus(credentialHash);

            if (!status.anchored) {
              // Credential was never anchored on-chain — skip silently
            } else if (status.revoked) {
              // Already revoked on-chain — no need to send another tx
            } else {
              // Anchored and not yet revoked — proceed with on-chain revocation
              const receipt = await revokeCredentialOnChain(credentialHash);
              submittedHash = receipt.hash;
              setTxHash(submittedHash);
              setTxState("mining");
              toast({
                title: "Transaction submitted",
                description: `Tx: ${submittedHash.substring(0, 18)}... — View on Sepolia Explorer`,
                action: undefined,
              });
            }
          } catch (onChainErr: any) {
            // User rejected — abort completely
            if (
              onChainErr.code === 4001 ||
              onChainErr.message?.includes("user rejected")
            ) {
              setTxState("failed");
              toast({
                title: "Transaction rejected",
                description: "You rejected the MetaMask transaction.",
                variant: "destructive",
              });
              return false;
            }
            // Other on-chain error — fall through to DB-only revocation
            console.warn(
              "[BlockID] On-chain revocation failed, falling back to DB:",
              onChainErr.message,
            );
          }
        }

        // ── Revoke the soulbound badge too ──────────────────────────────
        // A revoked credential must not leave a badge that the contract still
        // reports as valid. This is best-effort: the credential revocation
        // above has already succeeded, so a failure here must not undo it.
        let sbtHash: string | null = null;
        let sbtRevoked = false;
        if (window.ethereum && isSbtConfigured()) {
          try {
            const sbt = await getSbtForCredential(credentialHash);
            if (sbt && !sbt.revoked) {
              const { BrowserProvider } = await import("ethers");
              const signer = await new BrowserProvider(window.ethereum).getSigner();
              sbtHash = await revokeSbt(signer as any, sbt.tokenId);
              sbtRevoked = true;
            }
          } catch (sbtErr: any) {
            // A user rejection here is meaningful — surface it, but do not
            // treat the whole revocation as failed.
            if (sbtErr?.code === 4001 || sbtErr?.message?.includes("user rejected")) {
              console.warn("[BlockID] Badge revocation rejected in wallet");
            } else {
              console.warn(
                "[BlockID] Badge revocation failed (credential revocation unaffected):",
                sbtErr?.message,
              );
            }
          }
        }

        // Record the badge state so the holder portal and verifier reads stop
        // reporting a revoked credential as badged-and-valid. This goes through
        // the record-sbt edge function rather than calling record_sbt_state
        // directly: the RPC is service-role only, because it is SECURITY
        // DEFINER and must not be reachable with a user JWT.
        if (sbtRevoked) {
          try {
            const { data: session } = await supabase.auth.getSession();
            const res = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/record-sbt`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${session?.session?.access_token}`,
                },
                body: JSON.stringify({
                  action: "state",
                  credential_id: credentialId,
                  status: "revoked",
                  tx_hash: sbtHash,
                }),
              },
            );
            if (!res.ok) {
              console.warn("[BlockID] record-sbt state update failed:", res.status);
            }
          } catch (sbtRecordErr: any) {
            console.warn("[BlockID] record-sbt state update error:", sbtRecordErr?.message);
          }
        }

        // Update Supabase regardless (Supabase is source of truth for UI)
        await revokeCredential(credentialId, issuerId);
        setTxState("confirmed");

        const chainNotes = [
          submittedHash ? "Anchored on Ethereum Sepolia" : null,
          sbtRevoked ? "badge revoked" : null,
        ].filter(Boolean);

        toast({
          title: submittedHash
            ? "Revoked on-chain & database"
            : "Revoked in database",
          description: chainNotes.length
            ? `${chainNotes.join(" · ")} · ${AMOY_EXPLORER}/tx/${submittedHash ?? sbtHash}`
            : "On-chain revocation skipped (credential not anchored or MetaMask unavailable).",
        });
        return true;
      } catch (err: any) {
        setTxState("failed");
        toast({
          title: "Revocation failed",
          description: err.message ?? "Unknown error",
          variant: "destructive",
        });
        return false;
      }
    },
    // ✅ toast is the only stable dep — NOT txHash (which caused the stale closure bug)
    [toast],
  );

  return { revoke, txState, txHash, reset };
}
