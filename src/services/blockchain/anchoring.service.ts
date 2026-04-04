import { ethers } from "ethers";
import { getReadProvider } from "./provider";
import { getCredentialStatus } from "./registry";
import { AMOY_EXPLORER, IS_CONTRACT_DEPLOYED, CREDENTIAL_REGISTRY_ADDRESS } from "./config";

export interface AnchoringVerificationResult {
  verified: boolean;
  method: "calldata" | "contract" | null;
  txHash: string;
  blockNumber: number;
  blockTimestamp: number;
  calldataHash: string | null;
  explorerUrl: string;
  contractVerified: boolean;
  contractAnchored: boolean;
  contractIssuer: string | null;
  contractBlockAnchored: number;
  /** On-chain Unix timestamp of anchoring (0 if not available or not anchored) */
  contractAnchoredAt: number;
  error?: string;
}

/**
 * Verify anchoring using the on-chain CredentialRegistry contract.
 * Falls back to legacy calldata verification only for credentials NOT yet
 * migrated to the contract (method == "calldata" in credential_data.blockchain).
 */
export async function verifyAnchoringOnChain(
  txHash: string,
  expectedHash: string,
  credentialHash?: string,
  anchoringMethod?: string
): Promise<AnchoringVerificationResult> {
  const explorerUrl = `${AMOY_EXPLORER}/tx/${txHash}`;
  let contractVerified = false;
  let contractAnchored = false;
  let contractIssuer: string | null = null;
  let contractBlockAnchored = 0;
  let contractAnchoredAt = 0;

  // ── 1. Contract verification (always preferred) ─────────────────────────────
  if (IS_CONTRACT_DEPLOYED && credentialHash) {
    try {
      const status = await getCredentialStatus(credentialHash);
      contractVerified = true;
      contractAnchored = status.anchored;
      contractIssuer = status.issuer;
      contractBlockAnchored = status.blockAnchored;
      contractAnchoredAt = status.anchoredAt;
    } catch (contractErr) {
      console.warn("[BlockID] Contract verification failed:", contractErr);
    }
  }

  // ── 2. TX lookup for block metadata ─────────────────────────────────────────
  try {
    const provider = await getReadProvider();
    const tx = await provider.getTransaction(txHash);

    if (!tx) {
      return {
        verified: contractAnchored,
        method: contractAnchored ? "contract" : null,
        txHash,
        blockNumber: 0,
        blockTimestamp: 0,
        calldataHash: null,
        explorerUrl,
        contractVerified,
        contractAnchored,
        contractIssuer,
        contractBlockAnchored,
        contractAnchoredAt,
        error: "Transaction not found on Polygon Amoy",
      };
    }

    const block = await provider.getBlock(tx.blockNumber ?? 0);

    // ── 3. Legacy calldata check (only for non-contract anchors) ─────────────
    let calldataHash: string | null = null;
    if (anchoringMethod !== "contract") {
      try {
        const decoded = ethers.toUtf8String(tx.data);
        const match = decoded.match(/decentraid:credential:(.+)/);
        if (match) calldataHash = match[1];
      } catch {
        // binary calldata — ABI-encoded contract call, not a legacy anchor
      }
    }

    const normalize = (h: string) => h.toLowerCase().replace(/^0x/, "");
    const calldataVerified =
      calldataHash !== null && normalize(calldataHash) === normalize(expectedHash);

    const verified = calldataVerified || contractAnchored;
    const method: "calldata" | "contract" | null = contractAnchored
      ? "contract"
      : calldataVerified
      ? "calldata"
      : null;

    return {
      verified,
      method,
      txHash,
      blockNumber: tx.blockNumber ?? 0,
      blockTimestamp: block?.timestamp ?? 0,
      calldataHash,
      explorerUrl,
      contractVerified,
      contractAnchored,
      contractIssuer,
      contractBlockAnchored,
      contractAnchoredAt,
    };
  } catch (err: any) {
    return {
      verified: contractAnchored,
      method: contractAnchored ? "contract" : null,
      txHash,
      blockNumber: 0,
      blockTimestamp: 0,
      calldataHash: null,
      explorerUrl,
      contractVerified,
      contractAnchored,
      contractIssuer,
      contractBlockAnchored,
      contractAnchoredAt,
      error: err.message ?? "Unknown error verifying anchoring",
    };
  }
}

/**
 * Get the block explorer URL for a given transaction hash.
 */
export function getTxExplorerUrl(txHash: string): string {
  return `${AMOY_EXPLORER}/tx/${txHash}`;
}

/**
 * Get the block explorer URL for a given address.
 */
export function getAddressExplorerUrl(address: string): string {
  return `${AMOY_EXPLORER}/address/${address}`;
}

/**
 * Get the contract address on block explorer.
 */
export function getContractExplorerUrl(): string | null {
  if (!CREDENTIAL_REGISTRY_ADDRESS) return null;
  return `${AMOY_EXPLORER}/address/${CREDENTIAL_REGISTRY_ADDRESS}`;
}
