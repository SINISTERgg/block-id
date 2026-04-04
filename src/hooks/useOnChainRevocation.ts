import { useState, useCallback } from "react";
import { revokeCredentialOnChain } from "@/services/blockchain/registry";
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
 * 1. MetaMask signing prompt
 * 2. Transaction mining on Polygon Amoy
 * 3. Supabase status update
 *
 * Falls back to Supabase-only revocation if MetaMask isn't available.
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
        if (window.ethereum) {
          try {
            const receipt = await revokeCredentialOnChain(credentialHash);
            submittedHash = receipt.hash;
            setTxHash(submittedHash);
            setTxState("mining");
            toast({
              title: "Transaction submitted",
              description: `Tx: ${submittedHash.substring(0, 18)}... — View on Amoy Explorer`,
              action: undefined,
            });
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
            ? `Anchored on Polygon Amoy · ${AMOY_EXPLORER}/tx/${submittedHash}`
            : "On-chain revocation skipped (contract not deployed or MetaMask unavailable).",
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
