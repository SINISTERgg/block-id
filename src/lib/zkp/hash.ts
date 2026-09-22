/**
 * ZKP hash utilities and field arithmetic helpers.
 * Extracted from zkp.ts for focused imports.
 */

import { keccak256, toUtf8Bytes, toBigInt } from "ethers";
import { SNARK_SCALAR_FIELD } from "./types";

/**
 * Canonical zero placeholder for optional fields (backwards-compat shims).
 */
export const ZERO_VC_FINGERPRINT = "0x" + "00".repeat(32);
export const ZERO_HOLDER_COMMITMENT = "0";

/**
 * Assert that a numeric value fits in the BN254 scalar field.
 * Returns the value as a BigInt.
 * @internal
 */
export function assertField(value: number | bigint, name: string): bigint {
  const v = BigInt(value);
  if (v < 0n) throw new Error(`${name} must be non-negative`);
  if (v >= SNARK_SCALAR_FIELD) throw new Error(`${name} exceeds the BN254 scalar field`);
  return v;
}

/**
 * Reduce an arbitrary string to a BN254 scalar field element.
 *
 *   fieldFromString(s) = keccak256(s) mod r
 *
 * Used to derive field elements for `secret` and `scope` circuit inputs.
 */
export function fieldFromString(s: string): bigint {
  const digest = keccak256(toUtf8Bytes(s));
  return toBigInt(digest) % SNARK_SCALAR_FIELD;
}

/**
 * Split a SHA-256 VC fingerprint (bytes32 hex) into two 128-bit BN254 field elements.
 *
 * Avoids field reduction loss: each 128-bit half is safely within the BN254 field.
 *
 * Returns: [vcFingerprintHi, vcFingerprintLo]
 */
export function vcFingerprintToFieldPair(fingerprintHex: string): [bigint, bigint] {
  const hex = fingerprintHex.startsWith("0x") ? fingerprintHex.slice(2) : fingerprintHex;
  if (hex.length !== 64) {
    throw new Error(`vcFingerprint must be a 32-byte hex string (got ${hex.length / 2} bytes)`);
  }
  const hi = BigInt("0x" + hex.slice(0, 32));
  const lo = BigInt("0x" + hex.slice(32));
  return [hi, lo];
}

/**
 * Legacy single-field conversion — kept for backwards-compat shims.
 * @deprecated Use vcFingerprintToFieldPair instead.
 */
export function vcFingerprintToField(fingerprintHex: string): bigint {
  const hex = fingerprintHex.startsWith("0x") ? fingerprintHex.slice(2) : fingerprintHex;
  if (hex.length !== 64) throw new Error(`vcFingerprint must be a 32-byte hex string (got ${hex.length / 2} bytes)`);
  return BigInt("0x" + hex) % SNARK_SCALAR_FIELD;
}

/**
 * @deprecated Use circuit-bound Poseidon nullifiers via buildAgeVerifyInputs,
 * buildAttributeRangeInputs, or buildIssuerMembershipInputs instead.
 *
 * Kept for migration purposes only. The nullifier was NOT bound to the circuit
 * witness in this approach — an attacker could fabricate it without the secret.
 */
export function computeNullifier_DEPRECATED(
  secret: string,
  scope: string,
  circuitId: string = "blockid"
): string {
  const digest = keccak256(toUtf8Bytes(`${circuitId}:${scope}:${secret}`));
  return (toBigInt(digest) % SNARK_SCALAR_FIELD).toString();
}

// Keep the old name exported for backwards compatibility with test imports.
export const computeNullifier = computeNullifier_DEPRECATED;
