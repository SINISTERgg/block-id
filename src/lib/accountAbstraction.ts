/**
 * Account Abstraction (ERC-4337) utilities — Phase 2.
 *
 * Pure helpers to build, pack, and hash PackedUserOperations per the
 * EntryPoint v0.7 spec, plus CREATE2 account-address prediction.
 */
import { AbiCoder, keccak256, getCreate2Address, Interface, toBeHex, zeroPadValue } from "ethers";

/** Canonical EntryPoint v0.6 deployment (Sepolia, Polygon, Mainnet, etc.). */
export const ENTRY_POINT_V06 = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

/** Canonical EntryPoint v0.7 deployment (same address on all chains). */
export const ENTRY_POINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

export interface UserOpRequest {
  sender: string;
  nonce?: bigint;
  initCode?: string;
  callData?: string;
  verificationGasLimit?: bigint;
  callGasLimit?: bigint;
  preVerificationGas?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  paymasterAndData?: string;
}

/** v0.7 packed UserOperation — variable bytes replaced by their hashes at signing time. */
export interface PackedUserOperation {
  sender: string;
  nonce: bigint;
  initCode: string;
  callData: string;
  accountGasLimits: string; // bytes32
  preVerificationGas: bigint;
  gasFees: string; // bytes32
  paymasterAndData: string;
  signature: string;
}

/** Pack verificationGasLimit (high 128) ‖ callGasLimit (low 128) into bytes32. */
export function packAccountGasLimits(verificationGasLimit: bigint, callGasLimit: bigint): string {
  return zeroPadValue(toBeHex((verificationGasLimit << 128n) | callGasLimit), 32);
}

/** Unpack bytes32 back into [verificationGasLimit, callGasLimit]. */
export function unpackAccountGasLimits(packed: string): [bigint, bigint] {
  const v = BigInt(packed) >> 128n;
  const mask = (1n << 128n) - 1n;
  return [v, BigInt(packed) & mask];
}

/** Pack maxPriorityFeePerGas (high 128) ‖ maxFeePerGas (low 128) into bytes32. */
export function packGasFees(maxPriorityFeePerGas: bigint, maxFeePerGas: bigint): string {
  return zeroPadValue(toBeHex((maxPriorityFeePerGas << 128n) | maxFeePerGas), 32);
}

/** Unpack bytes32 back into [maxPriorityFeePerGas, maxFeePerGas]. */
export function unpackGasFees(packed: string): [bigint, bigint] {
  const p = BigInt(packed) >> 128n;
  const mask = (1n << 128n) - 1n;
  return [p, BigInt(packed) & mask];
}

const DEFAULTS = {
  nonce: 0n,
  initCode: "0x",
  verificationGasLimit: 150_000n,
  callGasLimit: 100_000n,
  preVerificationGas: 50_000n,
  maxFeePerGas: 2_000_000_000n, // 2 gwei
  maxPriorityFeePerGas: 100_000_000n, // 0.1 gwei
  paymasterAndData: "0x",
};

/** Build a fully-populated packed UserOperation with sane defaults. */
export function buildPackedUserOp(req: UserOpRequest): PackedUserOperation {
  // Deploy-only UserOps have callData="0x" but carry initCode — both being absent is the error.
  if ((!req.callData || req.callData === "0x") && (!req.initCode || req.initCode === "0x")) {
    throw new Error("callData is required (or provide initCode for a deploy-only UserOp)");
  }
  return {
    sender: req.sender,
    nonce: req.nonce ?? DEFAULTS.nonce,
    initCode: req.initCode ?? DEFAULTS.initCode,
    callData: req.callData,
    accountGasLimits: packAccountGasLimits(
      req.verificationGasLimit ?? DEFAULTS.verificationGasLimit,
      req.callGasLimit ?? DEFAULTS.callGasLimit
    ),
    preVerificationGas: req.preVerificationGas ?? DEFAULTS.preVerificationGas,
    gasFees: packGasFees(
      req.maxPriorityFeePerGas ?? DEFAULTS.maxPriorityFeePerGas,
      req.maxFeePerGas ?? DEFAULTS.maxFeePerGas
    ),
    paymasterAndData: req.paymasterAndData ?? DEFAULTS.paymasterAndData,
    signature: "0x",
  };
}

const abi = AbiCoder.defaultAbiCoder();

/**
 * Compute the userOpHash per EntryPoint v0.7:
 *   keccak256(abi.encode(innerHash, entryPoint, chainId))
 */
export function getUserOpHash(
  op: PackedUserOperation,
  entryPoint: string = ENTRY_POINT_V07,
  chainId: number = 80002
): string {
  const innerHash = keccak256(
    abi.encode(
      ["address", "uint256", "bytes32", "bytes32", "bytes32", "uint256", "bytes32", "bytes32"],
      [
        op.sender,
        op.nonce,
        keccak256(op.initCode),
        keccak256(op.callData),
        op.accountGasLimits,
        op.preVerificationGas,
        op.gasFees,
        keccak256(op.paymasterAndData),
      ]
    )
  );
  return keccak256(abi.encode(["bytes32", "address", "uint256"], [innerHash, entryPoint, chainId]));
}

const simpleAccountInterface = new Interface([
  "function execute(address dest, uint256 value, bytes data)",
]);

/** Encode SimpleAccount.execute(dest,value,data) calldata. */
export function encodeExecuteCall(dest: string, value: bigint = 0n, data: string = "0x"): string {
  return simpleAccountInterface.encodeFunctionData("execute", [dest, value, data]);
}

/**
 * Predict the deterministic CREATE2 address of a SimpleAccount deployed by
 * SmartWalletRegistry.createAccount.
 */
export function computeAccountAddress(params: {
  owner: string;
  salt: string; // bytes32 hex
  factory: string;
  creationCodeWithArgs: string; // type(SimpleAccount).creationCode ++ abi.encode(owner, entryPoint, factory)
}): string {
  const codeHash = keccak256(params.creationCodeWithArgs);
  return getCreate2Address(params.factory, params.salt, codeHash);
}
