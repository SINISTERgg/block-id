import { ethers } from "ethers";
import { CREDENTIAL_REGISTRY_ADDRESS, CREDENTIAL_REGISTRY_ABI, IS_CONTRACT_DEPLOYED, CONTRACT_DEPLOYMENT_BLOCK } from "./config";
import { getReadProvider, getBrowserSigner } from "./provider";

// Sepolia uses standard EIP-1559 gas pricing.
// These overrides provide reasonable defaults for the testnet.
const SEPOLIA_GAS_OVERRIDES = {
  maxPriorityFeePerGas: ethers.parseUnits("2", "gwei"),
  maxFeePerGas: ethers.parseUnits("20", "gwei"),
};

export interface CredentialStatus {
  anchored: boolean;
  revoked: boolean;
  issuer: string;
  blockAnchored: number;
  anchoredAt: number;   // Unix timestamp (seconds), 0 if not anchored
  revokedAt: number;    // Unix timestamp (seconds), 0 if not revoked
}

export function isContractDeployed(): boolean {
  return IS_CONTRACT_DEPLOYED && CREDENTIAL_REGISTRY_ADDRESS !== null;
}

export function getContractAddress(): string | null {
  return CREDENTIAL_REGISTRY_ADDRESS;
}

/**
 * Convert a hex credential hash string to a padded bytes32 value.
 * Throws if the input is not a valid 32-byte (64 hex char) hash.
 */
function toBytes32(hash: string): string {
  const hex = hash.startsWith("0x") ? hash.slice(2) : hash;
  if (hex.length > 64) {
    throw new Error(`[BlockID] Invalid credential hash: expected ≤64 hex chars, got ${hex.length}. Hash: ${hash.substring(0, 20)}...`);
  }
  return ethers.zeroPadValue("0x" + hex, 32);
}

/**
 * Get the CredentialRegistry contract in read-only mode (public RPC, no wallet).
 */
export async function getReadOnlyRegistry(): Promise<ethers.Contract> {
  if (!CREDENTIAL_REGISTRY_ADDRESS) {
    throw new Error("CredentialRegistry contract not deployed. Set VITE_CREDENTIAL_REGISTRY_ADDRESS in .env");
  }
  const provider = await getReadProvider();
  return new ethers.Contract(CREDENTIAL_REGISTRY_ADDRESS, CREDENTIAL_REGISTRY_ABI, provider);
}

/**
 * Get the CredentialRegistry contract with a signer (for write operations via MetaMask).
 */
export async function getSignedRegistry(): Promise<ethers.Contract> {
  if (!CREDENTIAL_REGISTRY_ADDRESS) {
    throw new Error("CredentialRegistry contract not deployed. Set VITE_CREDENTIAL_REGISTRY_ADDRESS in .env");
  }
  const signer = await getBrowserSigner();
  return new ethers.Contract(CREDENTIAL_REGISTRY_ADDRESS, CREDENTIAL_REGISTRY_ABI, signer);
}

/**
 * Read the on-chain status of a credential by its hash.
 * This is a free read call — no gas, no wallet needed.
 */
export async function getCredentialStatus(credentialHash: string): Promise<CredentialStatus> {
  const registry = await getReadOnlyRegistry();
  const bytes32Hash = toBytes32(credentialHash);
  const [anchored, revoked, issuer, blockAnchored, anchoredAt, revokedAt] =
    await registry.getCredentialStatus(bytes32Hash);
  return {
    anchored,
    revoked,
    issuer,
    blockAnchored: Number(blockAnchored),
    anchoredAt: Number(anchoredAt),
    revokedAt: Number(revokedAt),
  };
}

/**
 * Batch-read status for multiple credential hashes in a single free RPC call.
 * Returns a Map<hash, CredentialStatus>.
 */
export async function getCredentialStatusBatch(
  hashes: string[]
): Promise<Map<string, CredentialStatus>> {
  if (hashes.length === 0) return new Map();
  const registry = await getReadOnlyRegistry();
  const bytes32Hashes = hashes.map(toBytes32);
  const [anchored, revoked, issuers, blockNumbers, timestamps] =
    await registry.getCredentialBatch(bytes32Hashes);

  const result = new Map<string, CredentialStatus>();
  hashes.forEach((hash, i) => {
    result.set(hash, {
      anchored: anchored[i],
      revoked: revoked[i],
      issuer: issuers[i],
      blockAnchored: Number(blockNumbers[i]),
      anchoredAt: Number(timestamps[i]),
      revokedAt: 0, // batch read doesn't return revokedAt to save gas
    });
  });
  return result;
}

/**
 * Anchor a credential hash on-chain via MetaMask.
 * Returns the transaction receipt.
 */
export async function anchorCredentialOnChain(credentialHash: string): Promise<ethers.TransactionReceipt> {
  const registry = await getSignedRegistry();
  const bytes32Hash = toBytes32(credentialHash);
  const tx = await registry.anchorCredential(bytes32Hash, SEPOLIA_GAS_OVERRIDES);
  const receipt = await tx.wait();
  if (!receipt) throw new Error("Transaction failed — no receipt");
  return receipt;
}

/**
 * Anchor multiple credential hashes in a single MetaMask transaction.
 * Much more gas-efficient than calling anchorCredential N times.
 * Returns the transaction receipt.
 */
export async function anchorCredentialBatchOnChain(
  credentialHashes: string[]
): Promise<ethers.TransactionReceipt> {
  if (credentialHashes.length === 0) throw new Error("Empty batch");
  if (credentialHashes.length > 100) throw new Error("Batch too large (max 100)");
  const registry = await getSignedRegistry();
  const bytes32Hashes = credentialHashes.map(toBytes32);
  const tx = await registry.anchorCredentialBatch(bytes32Hashes, SEPOLIA_GAS_OVERRIDES);
  const receipt = await tx.wait();
  if (!receipt) throw new Error("Batch transaction failed — no receipt");
  return receipt;
}

/**
 * Revoke a credential hash on-chain via MetaMask.
 * Only the original issuer can revoke.
 */
export async function revokeCredentialOnChain(credentialHash: string): Promise<ethers.TransactionReceipt> {
  const registry = await getSignedRegistry();
  const bytes32Hash = toBytes32(credentialHash);
  const tx = await registry.revokeCredential(bytes32Hash, SEPOLIA_GAS_OVERRIDES);
  const receipt = await tx.wait();
  if (!receipt) throw new Error("Revocation transaction failed — no receipt");
  return receipt;
}

/**
 * Find the on-chain anchoring transaction for a credential by querying
 * the CredentialAnchored event logs from the contract.
 * Returns the transaction hash and block number, or null if not found.
 * Uses chunked queries to respect RPC block range limits.
 */
export async function findAnchorTransaction(
  credentialHash: string,
  fromBlock?: number
): Promise<{ txHash: string; blockNumber: number } | null> {
  const startBlock = fromBlock ?? CONTRACT_DEPLOYMENT_BLOCK;
  const BLOCKS_PER_QUERY = 45000;
  const MAX_TOTAL_BLOCKS = 90000; // Query max ~90k blocks (2 chunks) for recent tx

  try {
    const registry = await getReadOnlyRegistry();
    const provider = await getReadProvider();
    const bytes32Hash = toBytes32(credentialHash);
    const filter = registry.filters.CredentialAnchored(bytes32Hash);

    const currentBlock = await provider.getBlockNumber();
    const endBlock = Math.min(startBlock + MAX_TOTAL_BLOCKS, currentBlock);

    let from = endBlock;
    while (from >= startBlock) {
      const to = Math.max(from - BLOCKS_PER_QUERY + 1, startBlock);
      try {
        const events = await registry.queryFilter(filter, to, from);
        if (events.length > 0) {
          const event = events[events.length - 1];
          return {
            txHash: event.transactionHash,
            blockNumber: event.blockNumber,
          };
        }
      } catch {
        // Skip this chunk on error
      }
      from = to - 1;
    }
    return null;
  } catch (err) {
    console.warn("[BlockID] Failed to query anchor events:", err);
    return null;
  }
}
