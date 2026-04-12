import { useState, useCallback } from "react";
import { revokeCredentialOnChain, getCredentialStatus, isContractDeployed } from "@/services/blockchain/registry";
import { revokeCredential } from "@/services/api/issuer.service";
import { useToast } from "@/hooks/use-toast";
import { AMOY_EXPLORER } from "@/services/blockchain/config";

type TxState = "idle" | "signing" | "mining" | "confirmed" | "failed";

interface UseOnChainRevocationResult {
  revoke: (credentialHash: string, credentialId: string, issuerId: string) => Promise<boolean>;
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
      issuerId: string
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
              console.info("[BlockID] Credential not anchored on-chain, skipping on-chain revocation.");
            } else if (status.revoked) {
              // Already revoked on-chain — no need to send another tx
              console.info("[BlockID] Credential already revoked on-chain, skipping duplicate tx.");
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
            if (onChainErr.code === 4001 || onChainErr.message?.includes("user rejected")) {
              setTxState("failed");
              toast({
                title: "Transaction rejected",
                description: "You rejected the MetaMask transaction.",
                variant: "destructive",
              });
              return false;
            }
            // Other on-chain error — fall through to DB-only revocation
            console.warn("[BlockID] On-chain revocation failed, falling back to DB:", onChainErr.message);
          }
        }

        // Update Supabase regardless (Supabase is source of truth for UI)
        await revokeCredential(credentialId, issuerId);
        setTxState("confirmed");

        toast({
          title: submittedHash ? "Revoked on-chain & database" : "Revoked in database",
          description: submittedHash
            ? `Anchored on Ethereum Sepolia · ${AMOY_EXPLORER}/tx/${submittedHash}`
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
    [toast]
  );

  return { revoke, txState, txHash, reset };
}

