import { ethers } from "ethers";
import { CREDENTIAL_REGISTRY_ADDRESS, CREDENTIAL_REGISTRY_ABI, IS_CONTRACT_DEPLOYED } from "./config";
import { getReadProvider, getBrowserSigner } from "./provider";

// Polygon Amoy requires a minimum maxPriorityFeePerGas of 30 Gwei.
// Without this override ethers v6 auto-estimates too low a tip and the
// RPC rejects the transaction with error -32603 (gas tip cap too low).
const AMOY_GAS_OVERRIDES = {
  maxPriorityFeePerGas: ethers.parseUnits("30", "gwei"),
  maxFeePerGas: ethers.parseUnits("50", "gwei"),
};

export interface CredentialStatus {
  anchored: boolean;
  revoked: boolean;
  issuer: string;
  blockAnchored: number;
}

export function isContractDeployed(): boolean {
  return IS_CONTRACT_DEPLOYED && CREDENTIAL_REGISTRY_ADDRESS !== null;
}

export function getContractAddress(): string | null {
  return CREDENTIAL_REGISTRY_ADDRESS;
}

function toBytes32(hash: string): string {
  const hashBytes = hash.startsWith("0x") ? hash : "0x" + hash;
  return ethers.zeroPadValue(hashBytes.length <= 66 ? hashBytes : hashBytes.slice(0, 66), 32);
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
  const hashBytes = credentialHash.startsWith("0x")
    ? credentialHash
    : "0x" + credentialHash;

  // Pad to bytes32 if needed
  const bytes32Hash = ethers.zeroPadValue(hashBytes.length <= 66 ? hashBytes : hashBytes.slice(0, 66), 32);

  const [anchored, revoked, issuer, blockAnchored] = await registry.getCredentialStatus(bytes32Hash);
  return {
    anchored,
    revoked,
    issuer,
    blockAnchored: Number(blockAnchored),
  };
}

/**
 * Anchor a credential hash on-chain via MetaMask.
 * Returns the transaction receipt.
 */
export async function anchorCredentialOnChain(credentialHash: string): Promise<ethers.TransactionReceipt> {
  const registry = await getSignedRegistry();
  const hashBytes = credentialHash.startsWith("0x")
    ? credentialHash
    : "0x" + credentialHash;
  const bytes32Hash = ethers.zeroPadValue(hashBytes.length <= 66 ? hashBytes : hashBytes.slice(0, 66), 32);

  const tx = await registry.anchorCredential(bytes32Hash, AMOY_GAS_OVERRIDES);
  const receipt = await tx.wait();
  if (!receipt) throw new Error("Transaction failed — no receipt");
  return receipt;
}

/**
 * Revoke a credential hash on-chain via MetaMask.
 * Only the original issuer can revoke.
 */
export async function revokeCredentialOnChain(credentialHash: string): Promise<ethers.TransactionReceipt> {
  const registry = await getSignedRegistry();
  const hashBytes = credentialHash.startsWith("0x")
    ? credentialHash
    : "0x" + credentialHash;
  const bytes32Hash = ethers.zeroPadValue(hashBytes.length <= 66 ? hashBytes : hashBytes.slice(0, 66), 32);

  const tx = await registry.revokeCredential(bytes32Hash, AMOY_GAS_OVERRIDES);
  const receipt = await tx.wait();
  if (!receipt) throw new Error("Revocation transaction failed — no receipt");
  return receipt;
}
