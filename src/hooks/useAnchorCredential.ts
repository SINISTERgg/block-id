import { useState, useCallback } from "react";
import {
  anchorCredentialOnChain,
  anchorCredentialBatchOnChain,
} from "@/services/blockchain/registry";
import {
  CREDENTIAL_REGISTRY_ADDRESS,
  IS_CONTRACT_DEPLOYED,
  AMOY_EXPLORER,
} from "@/services/blockchain/config";
import { useToast } from "@/hooks/use-toast";

export type AnchorTxState =
  | "idle"
  | "connecting"
  | "signing"
  | "mining"
  | "confirmed"
  | "failed";

export interface AnchorResult {
  success: boolean;
  txHash: string | null;
  blockNumber: number | null;
  explorerUrl: string | null;
  from: string | null;
  contractAnchored: boolean;
  error?: string;
}

export interface AnchorBatchResult {
  success: boolean;
  txHash: string | null;
  blockNumber: number | null;
  explorerUrl: string | null;
  from: string | null;
  contractAnchored: boolean;
  anchoredCount: number;
  error?: string;
}

interface UseAnchorCredentialResult {
  anchor: (credentialHash: string) => Promise<AnchorResult>;
  anchorBatch: (credentialHashes: string[]) => Promise<AnchorBatchResult>;
  anchorTxState: AnchorTxState;
  txHash: string | null;
  reset: () => void;
  isContractReady: boolean;
  contractAddress: string | null;
}

export function useAnchorCredential(): UseAnchorCredentialResult {
  const [anchorTxState, setAnchorTxState] = useState<AnchorTxState>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const { toast } = useToast();

  const reset = useCallback(() => {
    setAnchorTxState("idle");
    setTxHash(null);
  }, []);

  const anchor = useCallback(
    async (credentialHash: string): Promise<AnchorResult> => {
      if (!window.ethereum) {
        return {
          success: false,
          txHash: null,
          blockNumber: null,
          explorerUrl: null,
          from: null,
          contractAnchored: false,
          error: "MetaMask not installed",
        };
      }

      if (!IS_CONTRACT_DEPLOYED || !CREDENTIAL_REGISTRY_ADDRESS) {
        return {
          success: false,
          txHash: null,
          blockNumber: null,
          explorerUrl: null,
          from: null,
          contractAnchored: false,
          error: "CredentialRegistry contract not deployed",
        };
      }

      setAnchorTxState("connecting");
      setTxHash(null);

      try {
        setAnchorTxState("signing");
        const receipt = await anchorCredentialOnChain(credentialHash);
        setTxHash(receipt.hash);
        setAnchorTxState("mining");

        const blockNumber = receipt.blockNumber ?? 0;
        const explorerUrl = `${AMOY_EXPLORER}/tx/${receipt.hash}`;
        const from = receipt.from;

        setAnchorTxState("confirmed");

        return {
          success: true,
          txHash: receipt.hash,
          blockNumber,
          explorerUrl,
          from,
          contractAnchored: true,
        };
      } catch (err: any) {
        setAnchorTxState("failed");

        const errMsg = err.message || "";
        if (
          err.code === 4001 ||
          err.code === "ACTION_REJECTED" ||
          errMsg.includes("user rejected") ||
          errMsg.includes("not been authorized") ||
          errMsg.includes("has not been authorized")
        ) {
          return {
            success: false,
            txHash: null,
            blockNumber: null,
            explorerUrl: null,
            from: null,
            contractAnchored: false,
            error: "Transaction rejected by user",
          };
        }

        return {
          success: false,
          txHash: null,
          blockNumber: null,
          explorerUrl: null,
          from: null,
          contractAnchored: false,
          error: errMsg || "Unknown anchoring error",
        };
      }
    },
    [],
  );

  /**
   * Anchor multiple credentials in a single MetaMask transaction.
   * Significantly reduces the number of MetaMask prompts for batch issuance.
   */
  const anchorBatch = useCallback(
    async (credentialHashes: string[]): Promise<AnchorBatchResult> => {
      if (!window.ethereum) {
        return {
          success: false,
          txHash: null,
          blockNumber: null,
          explorerUrl: null,
          from: null,
          contractAnchored: false,
          anchoredCount: 0,
          error: "MetaMask not installed",
        };
      }

      if (!IS_CONTRACT_DEPLOYED || !CREDENTIAL_REGISTRY_ADDRESS) {
        return {
          success: false,
          txHash: null,
          blockNumber: null,
          explorerUrl: null,
          from: null,
          contractAnchored: false,
          anchoredCount: 0,
          error: "CredentialRegistry contract not deployed",
        };
      }

      if (credentialHashes.length === 0) {
        return {
          success: false,
          txHash: null,
          blockNumber: null,
          explorerUrl: null,
          from: null,
          contractAnchored: false,
          anchoredCount: 0,
          error: "No hashes provided",
        };
      }

      setAnchorTxState("connecting");
      setTxHash(null);

      try {
        setAnchorTxState("signing");
        toast({
          title: `Anchoring ${credentialHashes.length} credentials`,
          description: "Confirm in MetaMask — this is a single transaction.",
        });

        const receipt = await anchorCredentialBatchOnChain(credentialHashes);
        setTxHash(receipt.hash);
        setAnchorTxState("mining");

        const blockNumber = receipt.blockNumber ?? 0;
        const explorerUrl = `${AMOY_EXPLORER}/tx/${receipt.hash}`;
        const from = receipt.from;

        setAnchorTxState("confirmed");
        toast({
          title: `${credentialHashes.length} credentials anchored on-chain`,
          description: `Block #${blockNumber} · Tx: ${receipt.hash.substring(0, 18)}...`,
        });

        return {
          success: true,
          txHash: receipt.hash,
          blockNumber,
          explorerUrl,
          from,
          contractAnchored: true,
          anchoredCount: credentialHashes.length,
        };
      } catch (err: any) {
        setAnchorTxState("failed");

        if (
          err.code === 4001 ||
          err.code === "ACTION_REJECTED" ||
          err.message?.includes("user rejected")
        ) {
          return {
            success: false,
            txHash: null,
            blockNumber: null,
            explorerUrl: null,
            from: null,
            contractAnchored: false,
            anchoredCount: 0,
            error: "Transaction rejected by user",
          };
        }

        return {
          success: false,
          txHash: null,
          blockNumber: null,
          explorerUrl: null,
          from: null,
          contractAnchored: false,
          anchoredCount: 0,
          error: err.message ?? "Unknown batch anchoring error",
        };
      }
    },
    [toast],
  );

  return {
    anchor,
    anchorBatch,
    anchorTxState,
    txHash,
    reset,
    isContractReady: IS_CONTRACT_DEPLOYED,
    contractAddress: CREDENTIAL_REGISTRY_ADDRESS,
  };
}

export function getExplorerUrl(txHash: string): string {
  return `${AMOY_EXPLORER}/tx/${txHash}`;
}

export function getContractExplorerUrl(): string | null {
  if (!CREDENTIAL_REGISTRY_ADDRESS) return null;
  return `${AMOY_EXPLORER}/address/${CREDENTIAL_REGISTRY_ADDRESS}`;
}
