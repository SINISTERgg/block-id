/**
 * Smart Wallet service — Phase 2 (Account Abstraction).
 *
 * Wraps SimpleAccount + SmartWalletRegistry (ERC-4337 v0.7):
 *  - deterministic account address prediction
 *  - UserOperation building, signing and bundler submission
 *  - gasless credential anchoring through the smart wallet
 *  - guardian-based social recovery management
 */
import { BrowserProvider, Contract, formatEther, getBytes, parseEther } from "ethers";
import {
  ENTRY_POINT_V07,
  buildPackedUserOp,
  encodeExecuteCall,
  getUserOpHash,
} from "@/lib/accountAbstraction";
import { getReadProvider } from "./provider";

const REGISTRY_ADDRESS = import.meta.env.VITE_SMART_WALLET_REGISTRY_ADDRESS as
  | `0x${string}`
  | undefined;
const BUNDLER_URL = import.meta.env.VITE_BUNDLER_URL as string | undefined;
const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? 11155111);

export const SMART_WALLET_REGISTRY_ABI = [
  "function createAccount(address owner, uint256 salt) external returns (address)",
  "function getAccountAddress(address owner, uint256 salt) external view returns (address)",
  "function accountOf(address) external view returns (address)",
  "function setGuardians(address account, address[] guardians, uint256 threshold) external",
  "function voteRecovery(address account, address newOwner) external",
  "function finalizeRecovery(address account, address newOwner) external",
  "function getGuardians(address account) external view returns (address[])",
  "function recoveryThreshold(address account) external view returns (uint256)",
  "function isGuardian(address account, address guardian) external view returns (bool)",
] as const;

export const SIMPLE_ACCOUNT_ABI = [
  "function execute(address dest, uint256 value, bytes data) external",
  "function nonce() external view returns (uint256)",
  "function owner() external view returns (address)",
] as const;

export const ENTRY_POINT = ENTRY_POINT_V07;

export function isSmartWalletConfigured(): boolean {
  return !!REGISTRY_ADDRESS && REGISTRY_ADDRESS !== "0x0000000000000000000000000000000000000000";
}

function registryAddress(): string {
  if (!isSmartWalletConfigured()) throw new Error("Smart wallet registry not configured");
  return REGISTRY_ADDRESS!;
}

/** Predict the CREATE2 address of the caller's smart account for a given salt. */
export async function predictAccountAddress(owner: string, salt: bigint): Promise<string> {
  const provider = await getReadProvider();
  const registry = new Contract(registryAddress(), SMART_WALLET_REGISTRY_ABI, provider);
  return (await registry.getAccountAddress(owner, salt)) as string;
}

/**
 * Deploy (or reuse) the smart account. If a bundler is configured we send an
 * initCode UserOperation; otherwise we call createAccount directly with the
 * EOA paying gas.
 */
export async function ensureSmartAccount(
  provider: BrowserProvider,
  salt: bigint
): Promise<{ account: string; created: boolean }> {
  const signer = await provider.getSigner();
  const owner = await signer.getAddress();
  const readProvider = await getReadProvider();
  const registryRead = new Contract(registryAddress(), SMART_WALLET_REGISTRY_ABI, readProvider);

  const predicted = (await registryRead.getAccountAddress(owner, salt)) as string;
  const existing = (await registryRead.accountOf(predicted)) as string;

  if (existing && existing.toLowerCase() === predicted.toLowerCase()) {
    return { account: predicted, created: false };
  }

  if (BUNDLER_URL) {
    // ERC-4337 deployment path: initCode = factory ++ createAccount calldata
    const createCallData = encodeCreateAccountCall(owner, salt);
    const op = buildPackedUserOp({
      sender: predicted,
      initCode: registryAddress() + createCallData.slice(2),
      callData: "0x", // deploy-only op
    });
    const signedOp = await signUserOperation(provider, op);
    await submitToBundler(signedOp);
  } else {
    // Direct EOA-paid deployment fallback
    const registryWrite = new Contract(registryAddress(), SMART_WALLET_REGISTRY_ABI, signer);
    const tx = await registryWrite.createAccount(owner, salt);
    await tx.wait();
  }

  return { account: predicted, created: true };
}

function encodeCreateAccountCall(owner: string, salt: bigint): string {
  const iface = new Contract(
    registryAddress(),
    SMART_WALLET_REGISTRY_ABI
  ).interface;
  return iface.encodeFunctionData("createAccount", [owner, salt]);
}

/** Sign a UserOperation hash with the connected EOA key. */
export async function signUserOperation(
  provider: BrowserProvider,
  op: Parameters<typeof getUserOpHash>[0]
): Promise<Parameters<typeof submitToBundler>[0]> {
  const signer = await provider.getSigner();
  const userOpHash = getUserOpHash(op, ENTRY_POINT, CHAIN_ID);
  // EIP-191 personal_sign over the raw 32-byte hash (matches SimpleAccount.validateUserOp)
  const signature = await signer.signMessage(getBytes(userOpHash));
  return { ...op, signature };
}

/** Submit a signed PackedUserOperation to the bundler (eth_sendUserOperation). */
export async function submitToBundler(signedOp: {
  sender: string;
  nonce: bigint;
  initCode: string;
  callData: string;
  accountGasLimits: string;
  preVerificationGas: bigint;
  gasFees: string;
  paymasterAndData: string;
  signature: string;
}): Promise<string> {
  if (!BUNDLER_URL) throw new Error("No bundler configured (VITE_BUNDLER_URL)");

  const serialized = JSON.stringify({
    jsonrpc: "2.0",
    id: Date.now(),
    method: "eth_sendUserOperation",
    params: [
      {
        sender: signedOp.sender,
        nonce: "0x" + signedOp.nonce.toString(16),
        initCode: signedOp.initCode,
        callData: signedOp.callData,
        accountGasLimits: signedOp.accountGasLimits,
        preVerificationGas: "0x" + signedOp.preVerificationGas.toString(16),
        gasFees: signedOp.gasFees,
        paymasterAndData: signedOp.paymasterAndData,
        signature: signedOp.signature,
      },
      ENTRY_POINT,
    ],
  });

  const res = await fetch(BUNDLER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: serialized,
  });
  if (!res.ok) throw new Error(`Bundler error: HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`Bundler error: ${json.error.message ?? JSON.stringify(json.error)}`);
  return json.result as string; // userOpHash
}

/**
 * Anchor a credential hash through the smart account (gasless when a
 * sponsoring paymaster/bundler is configured).
 */
export async function anchorCredentialViaSmartWallet(
  provider: BrowserProvider,
  account: string,
  credentialRegistryAddress: string,
  credentialHash: string
): Promise<string> {
  const readProvider = await getReadProvider();
  const simpleAccountRead = new Contract(account, SIMPLE_ACCOUNT_ABI, readProvider);
  const nonce = (await simpleAccountRead.nonce()) as bigint;

  const callData = encodeExecuteCall(
    credentialRegistryAddress,
    parseEther("0"),
    new Contract(credentialRegistryAddress, ["function anchorCredential(bytes32 hash) external"]).interface.encodeFunctionData(
      "anchorCredential",
      [credentialHash]
    )
  );

  const op = buildPackedUserOp({ sender: account, nonce, callData });
  const signedOp = await signUserOperation(provider, op);
  return submitToBundler(signedOp);
}

// ── Social recovery ──────────────────────────────────────────────────────────

export async function setGuardians(
  provider: BrowserProvider,
  account: string,
  guardians: string[],
  threshold: number
): Promise<string> {
  const signer = await provider.getSigner();
  const registry = new Contract(registryAddress(), SMART_WALLET_REGISTRY_ABI, signer);
  const tx = await registry.setGuardians(account, guardians, threshold);
  await tx.wait();
  return tx.hash as string;
}

export async function getGuardianInfo(account: string): Promise<{
  guardians: string[];
  threshold: number;
}> {
  const readProvider = await getReadProvider();
  const registry = new Contract(registryAddress(), SMART_WALLET_REGISTRY_ABI, readProvider);
  const guardians = (await registry.getGuardians(account)) as string[];
  const threshold = Number(await registry.recoveryThreshold(account));
  return { guardians, threshold };
}

export async function voteForRecovery(
  guardianProvider: BrowserProvider,
  account: string,
  newOwner: string
): Promise<string> {
  const guardian = await guardianProvider.getSigner();
  const registry = new Contract(registryAddress(), SMART_WALLET_REGISTRY_ABI, guardian);
  const tx = await registry.voteRecovery(account, newOwner);
  await tx.wait();
  return tx.hash as string;
}

export async function finalizeRecovery(
  provider: BrowserProvider,
  account: string,
  newOwner: string
): Promise<string> {
  const signer = await provider.getSigner();
  const registry = new Contract(registryAddress(), SMART_WALLET_REGISTRY_ABI, signer);
  const tx = await registry.finalizeRecovery(account, newOwner);
  await tx.wait();
  return tx.hash as string;
}

/** Human-readable ETH balance of any address via public RPC. */
export async function getBalance(address: string): Promise<string> {
  const readProvider = await getReadProvider();
  const wei = await readProvider.getBalance(address);
  return parseFloat(formatEther(wei)).toFixed(4);
}
