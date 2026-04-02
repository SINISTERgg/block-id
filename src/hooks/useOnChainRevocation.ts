import { useState, useCallback } from "react";
import { revokeCredentialOnChain } from "@/services/blockchain/registry";
import { revokeCredential } from "@/services/api/issuer.service";
import { useToast } from "@/hooks/use-toast";

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

      try {
        // Attempt on-chain revocation first
        if (window.ethereum) {
          try {
            const receipt = await revokeCredentialOnChain(credentialHash);
            setTxHash(receipt.hash);
            setTxState("mining");
            toast({
              title: "Transaction submitted",
              description: `Tx: ${receipt.hash.substring(0, 18)}...`,
            });
          } catch (onChainErr: any) {
            // User rejected or contract not deployed — fall through to DB-only
            if (onChainErr.code === 4001 || onChainErr.message?.includes("user rejected")) {
              setTxState("failed");
              toast({
                title: "Transaction rejected",
                description: "You rejected the MetaMask transaction.",
                variant: "destructive",
              });
              return false;
            }
            console.warn("[BlockID] On-chain revocation failed, falling back to DB:", onChainErr.message);
          }
        }

        // Update Supabase regardless (Supabase is source of truth for UI)
        await revokeCredential(credentialId, issuerId);
        setTxState("confirmed");
        toast({
          title: txHash ? "Revoked on-chain & database" : "Revoked in database",
          description: txHash
            ? "Credential revocation anchored on Polygon Amoy."
            : "On-chain revocation skipped (contract not deployed).",
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
    [toast, txHash]
  );

  return { revoke, txState, txHash, reset };
}
