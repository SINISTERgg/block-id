/**
 * Biometric anchor service — Phase 8 on-chain side.
 *
 * Wraps BiometricProofAnchor.sol:
 *  - anchors the proof_hash returned by `biometric-verify` (never raw biometrics)
 *  - replay prevention is enforced on-chain (one anchor per proof hash)
 *  - freshness checks via expiry-aware views
 *
 * Pure helpers (ABI encoding/decoding, hash normalization) are exported for
 * offline testing, mirroring sbt.service.ts conventions.
 */
import { Contract, Interface } from "ethers";
import { getReadProvider } from "./provider";
import { toBytes32 } from "@/lib/crypto";

const ANCHOR_ADDRESS_ENV = import.meta.env.VITE_BIOMETRIC_ANCHOR_ADDRESS as `0x${string}` | undefined;
/** Default validity window for an anchored verification: 30 days. */
export const DEFAULT_PROOF_VALIDITY_SECONDS = 30 * 24 * 60 * 60;

export const BIOMETRIC_ANCHOR_ABI = [
  // Write
  "function anchorProof(bytes32 subjectHash, bytes32 proofHash, uint64 validFor) external returns (bool)",
  "function invalidateSubject(bytes32 subjectHash) external",
  "function setVerifier(address verifier, bool allowed) external",
  // Read
  "function admin() external view returns (address)",
  "function totalAnchored() external view returns (uint256)",
  "function latestProofBySubject(bytes32 subjectHash) external view returns (bytes32)",
  "function isProofUsed(bytes32 proofHash) external view returns (bool)",
  "function getRecord(bytes32 proofHash) external view returns (bytes32 subjectHash, address verifier, uint64 anchoredAt, uint64 expiresAt)",
  "function isBiometricallyVerified(bytes32 subjectHash) external view returns (bool)",
  // Events
  "event ProofAnchored(bytes32 indexed subjectHash, bytes32 indexed proofHash, address indexed verifier, uint64 anchoredAt, uint64 expiresAt)",
  "event RecordInvalidated(bytes32 indexed subjectHash, bytes32 indexed proofHash)",
] as const;

const ANCHOR_IFACE = new Interface([...BIOMETRIC_ANCHOR_ABI]);

/** True when a biometric anchor contract address is configured. */
export function isBiometricAnchorConfigured(address: string | null | undefined = ANCHOR_ADDRESS_ENV): boolean {
  return !!address && address !== "0x0000000000000000000000000000000000000000";
}

function anchorAddress(explicit?: string): string {
  const addr = explicit ?? ANCHOR_ADDRESS_ENV;
  if (!isBiometricAnchorConfigured(addr)) throw new Error("Biometric proof anchor contract not configured");
  return addr!;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

/** Normalise a hex hash to bytes32 form (mirrors sbt.service). */
export function normalizeProofHash(hash: string): string {
  if (!hash || !/^0x[0-9a-fA-F]+$/.test(hash)) {
    throw new Error("proofHash must be a hex string");
  }
  if (hash.replace(/^0x/, "").length > 64) {
    throw new Error("proofHash exceeds 32 bytes");
  }
  return toBytes32(hash);
}

/** ABI-encode the anchorProof call without touching the network. */
export function encodeAnchorCalldata(subjectHash: string, proofHash: string, validFor: number | bigint = DEFAULT_PROOF_VALIDITY_SECONDS): string {
  return ANCHOR_IFACE.encodeFunctionData("anchorProof", [
    normalizeProofHash(subjectHash),
    normalizeProofHash(proofHash),
    validFor,
  ]);
}

/**
 * Extract anchoring details from transaction receipt logs.
 * Returns null when no ProofAnchored event is present.
 */
export function decodeAnchoredProof(
  logs: { topics: string[]; data: string }[]
): { subjectHash: string; proofHash: string; verifier: string; anchoredAt: bigint; expiresAt: bigint } | null {
  for (const log of logs) {
    const parsed = ANCHOR_IFACE.parseLog({ topics: [...log.topics], data: log.data });
    if (parsed?.name === "ProofAnchored") {
      return {
        subjectHash: parsed.args.subjectHash,
        proofHash: parsed.args.proofHash,
        verifier: parsed.args.verifier,
        anchoredAt: parsed.args.anchoredAt,
        expiresAt: parsed.args.expiresAt,
      };
    }
  }
  return null;
}

// ── Network calls ────────────────────────────────────────────────────────────

export interface AnchorResult {
  txHash: string;
  expiresAt: bigint | null;
}

/**
 * Anchor a successful verification result on-chain. The relayer signer must be
 * allow-listed as a verifier by the contract admin.
 */
export async function anchorBiometricProof(
  signer: { sendTransaction(tx: { to: string; data: string }): Promise<{ hash: string; wait(): Promise<{ logs: unknown[] }> }> },
  options: { subjectHash: string; proofHash: string; validFor?: number | bigint; address?: string }
): Promise<AnchorResult> {
  const data = encodeAnchorCalldata(options.subjectHash, options.proofHash, options.validFor ?? DEFAULT_PROOF_VALIDITY_SECONDS);
  const sent = await signer.sendTransaction({ to: anchorAddress(options.address), data });
  const receipt = await sent.wait();

  let expiresAt: bigint | null = null;
  try {
    expiresAt = decodeAnchoredProof(receipt?.logs as { topics: string[]; data: string }[])?.expiresAt ?? null;
  } catch {
    expiresAt = null;
  }
  return { txHash: sent.hash, expiresAt };
}

/** True when the proof hash has already been anchored (replay check). */
export async function isProofAnchored(proofHash: string, address?: string): Promise<boolean> {
  const target = anchorAddress(address);
  const provider = await getReadProvider();
  const anchor = new Contract(target, BIOMETRIC_ANCHOR_ABI, provider);
  return (await anchor.isProofUsed(normalizeProofHash(proofHash))) as boolean;
}

/** Expiry-aware on-chain verification status for a subject. */
export async function isSubjectVerified(subjectHash: string, address?: string): Promise<boolean> {
  const target = anchorAddress(address);
  const provider = await getReadProvider();
  const anchor = new Contract(target, BIOMETRIC_ANCHOR_ABI, provider);
  return (await anchor.isBiometricallyVerified(normalizeProofHash(subjectHash))) as boolean;
}
