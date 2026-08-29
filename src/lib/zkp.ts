/**
 * ZKP utilities — pure functions for Groth16 proof inputs and signals.
 * Circuits: age-verify, attribute-range, issuer-membership (circuits/).
 */
import { keccak256, toUtf8Bytes, toBigInt } from "ethers";

/** BN254 scalar field r — all witness values must be < r */
export const SNARK_SCALAR_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export type CircuitName = "age-verify" | "attribute-range" | "issuer-membership";

export const CIRCUIT_IDS: Record<CircuitName, string> = {
  "age-verify": "age-verify",
  "attribute-range": "attribute-range",
  "issuer-membership": "issuer-membership",
};

/** Field-compatible numeric value: JS number or BigInt. */
export type FieldValue = number | bigint;

export interface AgeProofInput {
  birthTimestamp: FieldValue;
  referenceTimestamp: FieldValue;
  minAgeSeconds: FieldValue;
}

export interface AttributeRangeInput {
  value: FieldValue;
  minValue: FieldValue;
  maxValue: FieldValue;
}

export interface IssuerMembershipInput {
  leaf: bigint | string;
  root: bigint | string;
  scope: bigint | string;
  pathElements: (bigint | string)[];
  pathIndices: (0 | 1)[];
}

function assertInt(value: number | bigint, name: string): bigint {
  const v = BigInt(value);
  if (v < 0n) throw new Error(`${name} must be non-negative`);
  if (v >= SNARK_SCALAR_FIELD) throw new Error(`${name} exceeds the BN254 scalar field`);
  return v;
}

/** Seconds in a year (Julian) used for age thresholds. */
export const SECONDS_PER_YEAR = 31_557_600n;

/** Default age threshold: 18 years in seconds. */
export function defaultMinAgeSeconds(years = 18): bigint {
  return BigInt(years) * SECONDS_PER_YEAR;
}

/**
 * Build public + private signal arrays for the age-verify circuit.
 * Returns null when the holder is underage (proof would not satisfy constraints).
 */
export function buildAgeVerifySignals(input: AgeProofInput): {
  privateInputs: string[];
  publicInputs: string[];
  isAdult: boolean;
} {
  const birth = assertInt(input.birthTimestamp, "birthTimestamp");
  const reference = assertInt(input.referenceTimestamp, "referenceTimestamp");
  const minAge = assertInt(input.minAgeSeconds, "minAgeSeconds");

  const isAdult = reference - birth >= minAge;
  return {
    privateInputs: [birth.toString()],
    publicInputs: [reference.toString(), minAge.toString()],
    isAdult,
  };
}

/**
 * Build public + private signal arrays for attribute-range.
 * Returns null when the value is outside the range.
 */
export function buildAttributeRangeSignals(input: AttributeRangeInput): {
  privateInputs: string[];
  publicInputs: string[];
  inRange: boolean;
} {
  const value = assertInt(input.value, "value");
  const min = assertInt(input.minValue, "minValue");
  const max = assertInt(input.maxValue, "maxValue");
  if (min > max) throw new Error("minValue must be <= maxValue");

  const inRange = value >= min && value <= max;
  return {
    privateInputs: [value.toString()],
    publicInputs: [min.toString(), max.toString()],
    inRange,
  };
}

/** Validate a Merkle path shape for issuer-membership. */
export function validateMerklePath(
  pathElements: unknown[],
  pathIndices: unknown[],
  depth: number
): void {
  if (pathElements.length !== depth) throw new Error(`pathElements must have length ${depth}`);
  if (pathIndices.length !== depth) throw new Error(`pathIndices must have length ${depth}`);
  for (let i = 0; i < depth; i++) {
    const idx = Number(pathIndices[i]);
    if (idx !== 0 && idx !== 1) throw new Error(`pathIndices[${i}] must be 0 or 1`);
    assertInt(BigInt(pathElements[i] as string), `pathElements[${i}]`);
  }
}

/** DEPTH used by circuits/issuer-membership.circom */
export const ISSUER_TREE_DEPTH = 20;

/** Compute the Merkle tree index implied by pathIndices (LSB-first). */
export function pathIndicesToLeafIndex(pathIndices: (0 | 1)[]): number {
  return pathIndices.reduce((acc, bit, level) => acc + bit * 2 ** level, 0);
}

/**
 * Deterministic nullifier for replay protection.
 * nullifier = keccak256(circuitId ‖ scope ‖ secret) mod r
 * The same secret+scope always yields the same nullifier so verifiers can burn it,
 * while distinct scopes never collide.
 */
export function computeNullifier(
  secret: string,
  scope: string,
  circuitId: string = "blockid"
): string {
  const digest = keccak256(toUtf8Bytes(`${circuitId}:${scope}:${secret}`));
  return (toBigInt(digest) % SNARK_SCALAR_FIELD).toString();
}

/** Pack a Groth16 proof into the calldata layout expected by ZKPVerifier.sol */
export interface Groth16ProofJson {
  pi_a: [string, string, string];
  pi_b: [[string, string], [string, string], string];
  pi_c: [string, string, string];
  protocol?: string;
  curve?: string;
}

export interface ZKPCalldata {
  a: [string, string];
  b: [[string, string], [string, string]];
  c: [string, string];
}

/** Convert snarkjs proof JSON to the fixed-size arrays ZKPVerifier.Proof expects. */
export function toVerifierCalldata(proof: Groth16ProofJson): ZKPCalldata {
  return {
    a: [proof.pi_a[0], proof.pi_a[1]],
    // snarkjs G2 points are [x.im, x.re] pairs — already the on-chain order
    b: [
      [proof.pi_b[0][0], proof.pi_b[0][1]],
      [proof.pi_b[1][0], proof.pi_b[1][1]],
    ],
    c: [proof.pi_c[0], proof.pi_c[1]],
  };
}

/** Validate that a snarkjs proof has the expected structural shape. */
export function isValidProofShape(proof: unknown): proof is Groth16ProofJson {
  if (typeof proof !== "object" || proof === null) return false;
  const p = proof as Record<string, unknown>;
  if (!Array.isArray(p.pi_a) || p.pi_a.length < 2) return false;
  if (!Array.isArray(p.pi_b) || p.pi_b.length < 2) return false;
  if (!Array.isArray(p.pi_b[0]) || p.pi_b[0].length < 2) return false;
  if (!Array.isArray(p.pi_b[1]) || p.pi_b[1].length < 2) return false;
  if (!Array.isArray(p.pi_c) || p.pi_c.length < 2) return false;
  return true;
}
