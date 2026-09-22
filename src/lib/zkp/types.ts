/**
 * ZKP type definitions and public signal layout constants.
 * Extracted from zkp.ts for focused imports.
 */

/** BN254 scalar field r — all witness values must be < r */
export const SNARK_SCALAR_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export type CircuitName = "age-verify" | "attribute-range" | "issuer-membership";

export const CIRCUIT_IDS: Record<CircuitName, string> = {
  "age-verify": "age-verify",
  "attribute-range": "attribute-range",
  "issuer-membership": "issuer-membership",
};

/**
 * Full snarkjs public-signal layout per circuit, in the EXACT order returned
 * by `groth16.fullProve`. Circom emits the main component's OUTPUTS first,
 * then its public inputs (in `main {public [...]}` order).
 */
export const PUBLIC_SIGNAL_LAYOUT: Record<CircuitName, readonly string[]> = {
  "age-verify": [
    "vcCommitment", "nullifier",
    "referenceTimestamp", "minAgeSeconds", "scope", "challenge",
    "vcFingerprintHi", "vcFingerprintLo", "holderCommitment",
  ],
  "attribute-range": [
    "vcCommitment", "nullifier",
    "minValue", "maxValue", "scope", "challenge",
    "vcFingerprintHi", "vcFingerprintLo", "holderCommitment",
  ],
  "issuer-membership": [
    "vcCommitment", "nullifier",
    "root", "scope", "challenge",
    "vcFingerprintHi", "vcFingerprintLo", "holderCommitment",
  ],
};

/** Index of a named public signal in `groth16.fullProve` output, per circuit. */
export function publicSignalIndex(circuit: CircuitName, name: string): number {
  const layout = PUBLIC_SIGNAL_LAYOUT[circuit];
  const idx = layout.indexOf(name);
  if (idx === -1) throw new Error(`Unknown public signal "${name}" for ${circuit}`);
  return idx;
}

/** Read a named public signal from a raw snarkjs `publicSignals` array. */
export function extractPublicSignal(
  circuit: CircuitName,
  name: string,
  publicSignals: readonly string[]
): string {
  const idx = publicSignalIndex(circuit, name);
  if (idx >= publicSignals.length) {
    throw new Error(`${circuit} publicSignals has length ${publicSignals.length}, expected ≥ ${idx + 1}`);
  }
  return publicSignals[idx];
}

/** Acceptable public-signal array length for a circuit. */
export function publicSignalCount(circuit: CircuitName): number {
  return PUBLIC_SIGNAL_LAYOUT[circuit].length;
}

/** True when a proof's public-signal array matches the expected layout length. */
export function isExpectedSignalCount(circuit: CircuitName, publicSignals: readonly string[]): boolean {
  return publicSignals.length === publicSignalCount(circuit);
}

/** Field-compatible numeric value: JS number or BigInt. */
export type FieldValue = number | bigint;

/** Inputs for the age-verify circuit. */
export interface AgeProofInput {
  birthTimestamp: FieldValue;
  referenceTimestamp: FieldValue;
  minAgeSeconds: FieldValue;
  vcFingerprint?: string;
  holderCommitment?: string;
}

/** Inputs for the attribute-range circuit. */
export interface AttributeRangeInput {
  value: FieldValue;
  minValue: FieldValue;
  maxValue: FieldValue;
  vcFingerprint?: string;
  holderCommitment?: string;
}

/** Inputs for the issuer-membership circuit. */
export interface IssuerMembershipInput {
  leaf: bigint | string;
  root: bigint | string;
  scope: bigint | string;
  secret: bigint | string;
  pathElements: (bigint | string)[];
  pathIndices: (0 | 1)[];
  vcFingerprint?: string;
  holderCommitment?: string;
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

/** Seconds in a Julian year used for age thresholds. */
export const SECONDS_PER_YEAR = 31_557_600n;

/** Default age threshold: 18 years in seconds. */
export function defaultMinAgeSeconds(years = 18): bigint {
  return BigInt(years) * SECONDS_PER_YEAR;
}
