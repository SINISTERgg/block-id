/**
 * ZKP proof input builders for all three circuits.
 * Extracted from zkp.ts for focused imports.
 */

import {
  AgeProofInput,
  AttributeRangeInput,
  IssuerMembershipInput,
} from "./types";
import {
  assertField,
  fieldFromString,
  vcFingerprintToFieldPair,
  ZERO_VC_FINGERPRINT,
  ZERO_HOLDER_COMMITMENT,
} from "./hash";
import { validateMerklePath, ISSUER_TREE_DEPTH } from "./merkle";

/**
 * Build the snarkjs-compatible circuit input object for age-verify.
 *
 * snarkjs publicSignals (9):
 *   [vcCommitment(0), nullifier(1), referenceTimestamp(2), minAgeSeconds(3),
 *    scope(4), challenge(5), vcFingerprintHi(6), vcFingerprintLo(7), holderCommitment(8)]
 */
export function buildAgeVerifyInputs(
  input: AgeProofInput,
  secret: string,
  scope: string,
  challenge: string = "0"
): {
  circuitInputs: Record<string, string>;
  expectedPublicSignals: string[];
  isAdult: boolean;
} {
  const birth = assertField(input.birthTimestamp, "birthTimestamp");
  const reference = assertField(input.referenceTimestamp, "referenceTimestamp");
  const minAge = assertField(input.minAgeSeconds, "minAgeSeconds");
  const scopeField = fieldFromString(scope);
  const secretField = fieldFromString(secret);
  const challengeField = fieldFromString(challenge);
  const [vcFpHi, vcFpLo] = vcFingerprintToFieldPair(input.vcFingerprint ?? ZERO_VC_FINGERPRINT);
  const hcField = BigInt(input.holderCommitment ?? ZERO_HOLDER_COMMITMENT);

  const isAdult = reference - birth >= minAge;
  return {
    circuitInputs: {
      birthTimestamp:    birth.toString(),
      secret:            secretField.toString(),
      referenceTimestamp: reference.toString(),
      minAgeSeconds:     minAge.toString(),
      scope:             scopeField.toString(),
      challenge:         challengeField.toString(),
      vcFingerprintHi:   vcFpHi.toString(),
      vcFingerprintLo:   vcFpLo.toString(),
      holderCommitment:  hcField.toString(),
    },
    expectedPublicSignals: [
      reference.toString(),
      minAge.toString(),
      scopeField.toString(),
      challengeField.toString(),
      vcFpHi.toString(),
      vcFpLo.toString(),
      hcField.toString(),
    ],
    isAdult,
  };
}

/**
 * Build the snarkjs-compatible circuit input object for attribute-range.
 *
 * snarkjs publicSignals (9):
 *   [vcCommitment(0), nullifier(1), minValue(2), maxValue(3),
 *    scope(4), challenge(5), vcFingerprintHi(6), vcFingerprintLo(7), holderCommitment(8)]
 */
export function buildAttributeRangeInputs(
  input: AttributeRangeInput,
  secret: string,
  scope: string,
  challenge: string = "0"
): {
  circuitInputs: Record<string, string>;
  expectedPublicSignals: string[];
  inRange: boolean;
} {
  const value = assertField(input.value, "value");
  const min = assertField(input.minValue, "minValue");
  const max = assertField(input.maxValue, "maxValue");
  if (min > max) throw new Error("minValue must be <= maxValue");
  const scopeField = fieldFromString(scope);
  const secretField = fieldFromString(secret);
  const challengeField = fieldFromString(challenge);
  const [vcFpHi, vcFpLo] = vcFingerprintToFieldPair(input.vcFingerprint ?? ZERO_VC_FINGERPRINT);
  const hcField = BigInt(input.holderCommitment ?? ZERO_HOLDER_COMMITMENT);

  const inRange = value >= min && value <= max;
  return {
    circuitInputs: {
      value:            value.toString(),
      secret:           secretField.toString(),
      minValue:         min.toString(),
      maxValue:         max.toString(),
      scope:            scopeField.toString(),
      challenge:        challengeField.toString(),
      vcFingerprintHi:  vcFpHi.toString(),
      vcFingerprintLo:  vcFpLo.toString(),
      holderCommitment: hcField.toString(),
    },
    expectedPublicSignals: [
      min.toString(),
      max.toString(),
      scopeField.toString(),
      challengeField.toString(),
      vcFpHi.toString(),
      vcFpLo.toString(),
      hcField.toString(),
    ],
    inRange,
  };
}

/**
 * Coerce a bigint | string field input through assertField.
 * @internal
 */
function toFieldInput(val: bigint | string, name: string): bigint {
  if (typeof val === "bigint") return assertField(val, name);
  if (/^(0x[0-9a-fA-F]+|\d+)$/.test(val)) {
    return assertField(BigInt(val), name);
  }
  return fieldFromString(val);
}

/**
 * Build the snarkjs-compatible circuit input object for issuer-membership.
 *
 * snarkjs publicSignals (8):
 *   [vcCommitment(0), nullifier(1), root(2), scope(3),
 *    challenge(4), vcFingerprintHi(5), vcFingerprintLo(6), holderCommitment(7)]
 */
export function buildIssuerMembershipInputs(
  input: IssuerMembershipInput,
  challenge: string = "0"
): {
  circuitInputs: Record<string, unknown>;
  expectedPublicSignals: string[];
} {
  const root = toFieldInput(input.root, "root");
  const scope = toFieldInput(input.scope, "scope");
  const leaf = toFieldInput(input.leaf, "leaf");
  const secret = toFieldInput(input.secret, "secret");
  const challengeField = fieldFromString(challenge);
  const [vcFpHi, vcFpLo] = vcFingerprintToFieldPair(input.vcFingerprint ?? ZERO_VC_FINGERPRINT);
  const hcField = BigInt(input.holderCommitment ?? ZERO_HOLDER_COMMITMENT);
  validateMerklePath(input.pathElements, input.pathIndices, ISSUER_TREE_DEPTH);

  return {
    circuitInputs: {
      leaf:             leaf.toString(),
      secret:           secret.toString(),
      pathElements:     input.pathElements.map(String),
      pathIndices:      input.pathIndices.map(Number),
      root:             root.toString(),
      scope:            scope.toString(),
      challenge:        challengeField.toString(),
      vcFingerprintHi:  vcFpHi.toString(),
      vcFingerprintLo:  vcFpLo.toString(),
      holderCommitment: hcField.toString(),
    },
    expectedPublicSignals: [
      root.toString(),
      scope.toString(),
      challengeField.toString(),
      vcFpHi.toString(),
      vcFpLo.toString(),
      hcField.toString(),
    ],
  };
}

/** Convert snarkjs proof JSON to the fixed-size arrays ZKPVerifier.Proof expects. */
export function toVerifierCalldata(proof: import("./types").Groth16ProofJson): import("./types").ZKPCalldata {
  return {
    a: [proof.pi_a[0], proof.pi_a[1]],
    b: [
      [proof.pi_b[0][0], proof.pi_b[0][1]],
      [proof.pi_b[1][0], proof.pi_b[1][1]],
    ],
    c: [proof.pi_c[0], proof.pi_c[1]],
  };
}

/** Validate that a snarkjs proof has the expected structural shape. */
export function isValidProofShape(proof: unknown): proof is import("./types").Groth16ProofJson {
  if (typeof proof !== "object" || proof === null) return false;
  const p = proof as Record<string, unknown>;
  if (!Array.isArray(p.pi_a) || p.pi_a.length < 2) return false;
  if (!Array.isArray(p.pi_b) || p.pi_b.length < 2) return false;
  if (!Array.isArray(p.pi_b[0]) || p.pi_b[0].length < 2) return false;
  if (!Array.isArray(p.pi_b[1]) || p.pi_b[1].length < 2) return false;
  if (!Array.isArray(p.pi_c) || p.pi_c.length < 2) return false;
  return true;
}

// ── Backwards-compatible signal builders ────────────────────────────────────
// The old buildAgeVerifySignals / buildAttributeRangeSignals APIs returned
// { privateInputs, publicInputs, isAdult/inRange }. Kept until all callsites
// are migrated to the new builders.

export function buildAgeVerifySignals(input: AgeProofInput): {
  privateInputs: string[];
  publicInputs: string[];
  isAdult: boolean;
} {
  const birth = assertField(input.birthTimestamp, "birthTimestamp");
  const reference = assertField(input.referenceTimestamp, "referenceTimestamp");
  const minAge = assertField(input.minAgeSeconds, "minAgeSeconds");
  const isAdult = reference - birth >= minAge;
  return {
    privateInputs: [birth.toString()],
    publicInputs: [reference.toString(), minAge.toString()],
    isAdult,
  };
}

export function buildAttributeRangeSignals(input: AttributeRangeInput): {
  privateInputs: string[];
  publicInputs: string[];
  inRange: boolean;
} {
  const value = assertField(input.value, "value");
  const min = assertField(input.minValue, "minValue");
  const max = assertField(input.maxValue, "maxValue");
  if (min > max) throw new Error("minValue must be <= maxValue");
  const inRange = value >= min && value <= max;
  return {
    privateInputs: [value.toString()],
    publicInputs: [min.toString(), max.toString()],
    inRange,
  };
}
