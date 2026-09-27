/**
 * On-chain ZKP verification service — ZKPVerifier.sol (BN254 Groth16).
 *
 * Wraps the deployed verifier so the portal can:
 *   • `checkProof`      — free, view-only pairing check (no state change)
 *   • `verifyProof`     — on-chain verification that BURNS the nullifier (replay guard)
 *   • `isNullifierUsed` — replay cross-check before spending gas
 *
 * Signal layout is owned by `@/lib/zkp` (PUBLIC_SIGNAL_LAYOUT). The nullifier is
 * ALWAYS at public-signal index 1 because circom emits circuit outputs first and
 * every BlockID circuit declares (vcCommitment, nullifier) as its outputs.
 *
 * Convenience wrappers (`verifyAgeProof` / `verifyAttributeProof` /
 * `verifyIssuerMembership`) additionally reconstruct the bytes32 SHA-256 VC
 * fingerprint from the Hi/Lo field pair and assert it is live in
 * CredentialRegistry before running the pairing check.
 */
import { Contract, Interface, keccak256, toUtf8Bytes, zeroPadValue } from "ethers";
import { getBrowserSigner, getReadProvider } from "./provider";
import { CREDENTIAL_REGISTRY_ADDRESS } from "./config";
import {
  extractPublicSignal,
  isExpectedSignalCount,
  isValidProofShape,
  publicSignalCount,
  toVerifierCalldata,
  vcFingerprintToFieldPair,
  type CircuitName,
  type Groth16ProofJson,
  type ZKPCalldata,
} from "@/lib/zkp";

const VERIFIER_ADDRESS_ENV = import.meta.env.VITE_ZKP_VERIFIER_ADDRESS as `0x${string}` | undefined;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const ZKP_VERIFIER_ABI = [
  // Write
  "function registerVerificationKey(bytes32 circuitId, uint256[2] alfa1, uint256[4] beta2, uint256[4] gamma2, uint256[4] delta2, uint256[] icFlat) external",
  "function verifyProof(bytes32 circuitId, tuple(uint256[2] a, uint256[2][2] b, uint256[2] c) proof, uint256[] pubSignals) external returns (bool)",
  "function verifyAgeProof(tuple(uint256[2] a, uint256[2][2] b, uint256[2] c) proof, uint256[9] signals, address registry) external returns (bool)",
  "function verifyAttributeProof(tuple(uint256[2] a, uint256[2][2] b, uint256[2] c) proof, uint256[9] signals, address registry) external returns (bool)",
  "function verifyIssuerMembership(tuple(uint256[2] a, uint256[2][2] b, uint256[2] c) proof, uint256[8] signals, address registry) external returns (bool)",
  // Read
  "function checkProof(bytes32 circuitId, tuple(uint256[2] a, uint256[2][2] b, uint256[2] c) proof, uint256[] pubSignals) external view returns (bool)",
  "function isNullifierUsed(uint256 nullifierHash) external view returns (bool)",
  "function circuitRegistered(bytes32 circuitId) external view returns (bool)",
  "function owner() external view returns (address)",
  // Events
  "event ProofVerified(bytes32 indexed circuitId, uint256 nullifierHash, address indexed submitter)",
  "event NullifierBurned(uint256 indexed nullifierHash)",
] as const;

const VERIFIER_IFACE = new Interface([...ZKP_VERIFIER_ABI]);

/** bytes32 circuit ids — must match the constants in ZKPVerifier.sol. */
export const CIRCUIT_ID_BYTES: Record<CircuitName, string> = {
  "age-verify": keccak256(toUtf8Bytes("age-verify")),
  "attribute-range": keccak256(toUtf8Bytes("attribute-range")),
  "issuer-membership": keccak256(toUtf8Bytes("issuer-membership")),
};

/** True when a ZKPVerifier deployment address is configured. */
export function isZkpVerifierConfigured(address?: string | null): boolean {
  const addr = arguments.length > 0
    ? address
    : (import.meta.env.VITE_ZKP_VERIFIER_ADDRESS as string | undefined);
  return !!addr && addr !== ZERO_ADDRESS;
}

function verifierAddress(explicit?: string): string {
  const addr = explicit ?? VERIFIER_ADDRESS_ENV;
  if (!isZkpVerifierConfigured(addr)) {
    throw new Error("ZKPVerifier contract not configured — set VITE_ZKP_VERIFIER_ADDRESS");
  }
  return addr!;
}

// ── Pure helpers (unit-testable, no network) ─────────────────────────────────

/** ABI tuple literal for ZKPVerifier.Proof. */
export type ProofTuple = {
  a: [string, string];
  b: [[string, string], [string, string]];
  c: [string, string];
};

/** Pack a raw proof + signal list for on-chain submission (no state change). */
export function packOnChainProof(
  circuit: CircuitName,
  proof: Groth16ProofJson | ZKPCalldata,
  publicSignals: string[]
): { circuitId: string; proof: ProofTuple; pubSignals: string[] } {
  if (!isExpectedSignalCount(circuit, publicSignals)) {
    throw new Error(
      `${circuit}: expected ${publicSignalCount(circuit)} public signals, got ${publicSignals.length}.`
    );
  }
  const calldata: ZKPCalldata =
    "pi_a" in (proof as Groth16ProofJson)
      ? toVerifierCalldata(proof as Groth16ProofJson)
      : (proof as ZKPCalldata);
  return {
    circuitId: CIRCUIT_ID_BYTES[circuit],
    proof: { a: calldata.a, b: calldata.b, c: calldata.c },
    pubSignals: publicSignals.map((s) => BigInt(s).toString()),
  };
}

/** Calldata for the view-only `checkProof` — useful for eth_call simulation. */
export function encodeCheckProofCalldata(
  circuit: CircuitName,
  proof: Groth16ProofJson | ZKPCalldata,
  publicSignals: string[]
): string {
  const packed = packOnChainProof(circuit, proof, publicSignals);
  return VERIFIER_IFACE.encodeFunctionData("checkProof", [
    packed.circuitId,
    packed.proof,
    packed.pubSignals,
  ]);
}

/** Calldata for the state-changing `verifyProof` (burns the nullifier). */
export function encodeVerifyProofCalldata(
  circuit: CircuitName,
  proof: Groth16ProofJson | ZKPCalldata,
  publicSignals: string[]
): string {
  const packed = packOnChainProof(circuit, proof, publicSignals);
  return VERIFIER_IFACE.encodeFunctionData("verifyProof", [
    packed.circuitId,
    packed.proof,
    packed.pubSignals,
  ]);
}

/** ABI-encode the circuit-specific convenience wrapper (adds the registry check). */
export function encodeConvenienceCalldata(
  circuit: CircuitName,
  proof: Groth16ProofJson | ZKPCalldata,
  publicSignals: string[],
  registry: string | null = CREDENTIAL_REGISTRY_ADDRESS
): string {
  const packed = packOnChainProof(circuit, proof, publicSignals);
  const fn =
    circuit === "age-verify"
      ? "verifyAgeProof"
      : circuit === "attribute-range"
        ? "verifyAttributeProof"
        : "verifyIssuerMembership";
  return VERIFIER_IFACE.encodeFunctionData(fn, [
    packed.proof,
    packed.pubSignals,
    registry && registry !== ZERO_ADDRESS ? registry : ZERO_ADDRESS,
  ]);
}

/**
 * Reconstruct the bytes32 SHA-256 VC fingerprint from the Hi/Lo public signals.
 * Mirrors the on-chain `bytes32((hi << 128) | lo)` reconstruction so the portal
 * can cross-check the proof against CredentialRegistry without a round trip.
 */
export function fingerprintFromSignals(
  circuit: CircuitName,
  publicSignals: string[]
): string {
  const hi = BigInt(extractPublicSignal(circuit, "vcFingerprintHi", publicSignals));
  const lo = BigInt(extractPublicSignal(circuit, "vcFingerprintLo", publicSignals));
  return zeroPadValue("0x" + ((hi << 128n) | lo).toString(16), 32);
}

/** Split a bytes32 fingerprint back into the [hi, lo] field pair the circuits expect. */
export function fieldPairFromFingerprint(fingerprintHex: string): { hi: string; lo: string } {
  const [hi, lo] = vcFingerprintToFieldPair(fingerprintHex);
  return { hi: hi.toString(), lo: lo.toString() };
}

// ── Network calls ────────────────────────────────────────────────────────────

export interface OnChainCheckResult {
  valid: boolean;
  circuitId: string;
  nullifier: string;
  nullifierUsed: boolean;
  circuitRegistered: boolean;
  blockNumber: number;
  explorerUrl: string | null;
}

/**
 * Free, view-only pairing check. Does NOT burn the nullifier, so it is safe to
 * run on every submitted proof before asking the user to spend gas.
 */
export async function checkProofOnChain(
  circuit: CircuitName,
  proof: Groth16ProofJson | ZKPCalldata,
  publicSignals: string[],
  address?: string
): Promise<OnChainCheckResult> {
  const target = verifierAddress(address);
  const provider = await getReadProvider();
  const verifier = new Contract(target, ZKP_VERIFIER_ABI, provider);
  const packed = packOnChainProof(circuit, proof, publicSignals);
  const nullifier = extractPublicSignal(circuit, "nullifier", publicSignals);

  const [valid, nullifierUsed, circuitRegistered] = await Promise.all([
    verifier.checkProof(packed.circuitId, packed.proof, packed.pubSignals) as Promise<boolean>,
    verifier.isNullifierUsed(nullifier) as Promise<boolean>,
    verifier.circuitRegistered(packed.circuitId) as Promise<boolean>,
  ]);

  const blockNumber = await provider.getBlockNumber();
  return {
    valid,
    circuitId: packed.circuitId,
    nullifier,
    nullifierUsed,
    circuitRegistered,
    blockNumber,
    explorerUrl: `https://sepolia.etherscan.io/address/${target}#code`,
  };
}

/**
 * Submit the proof on-chain via ZKPVerifier.verifyProof.
 * Requires MetaMask on Sepolia and burns the nullifier on success.
 */
export async function verifyProofOnChain(
  circuit: CircuitName,
  proof: Groth16ProofJson | ZKPCalldata,
  publicSignals: string[],
  address?: string
): Promise<{ txHash: string; nullifier: string }> {
  const target = verifierAddress(address);
  const signer = await getBrowserSigner();
  const verifier = new Contract(target, ZKP_VERIFIER_ABI, signer);
  const packed = packOnChainProof(circuit, proof, publicSignals);
  const nullifier = extractPublicSignal(circuit, "nullifier", publicSignals);

  const sent = await verifier.verifyProof(packed.circuitId, packed.proof, packed.pubSignals);
  const receipt = await sent.wait();
  if (receipt?.status === 0) throw new Error("On-chain verification reverted — proof rejected");
  return { txHash: sent.hash, nullifier };
}

/** Has this nullifier already been consumed on-chain? */
export async function isNullifierUsed(nullifier: string, address?: string): Promise<boolean> {
  const target = verifierAddress(address);
  const provider = await getReadProvider();
  const verifier = new Contract(target, ZKP_VERIFIER_ABI, provider);
  return (await verifier.isNullifierUsed(nullifier)) as boolean;
}

/** Which circuits have a verifying key registered on this deployment? */
export async function getRegisteredCircuits(address?: string): Promise<Record<CircuitName, boolean>> {
  const target = verifierAddress(address);
  const provider = await getReadProvider();
  const verifier = new Contract(target, ZKP_VERIFIER_ABI, provider);
  const entries = await Promise.all(
    (Object.keys(CIRCUIT_ID_BYTES) as CircuitName[]).map(async (c) => {
      try {
        return [c, (await verifier.circuitRegistered(CIRCUIT_ID_BYTES[c])) as boolean] as const;
      } catch {
        return [c, false] as const;
      }
    })
  );
  return Object.fromEntries(entries) as Record<CircuitName, boolean>;
}
