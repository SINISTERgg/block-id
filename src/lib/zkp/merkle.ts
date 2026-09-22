/**
 * ZKP Merkle tree helpers for the issuer-membership circuit.
 * Extracted from zkp.ts for focused imports.
 *
 * Off-chain Merkle tree (issuer-membership):
 *   Use circomlibjs `buildPoseidon()` to build trees compatible with the
 *   on-circuit Poseidon(2) node hasher:
 *     const poseidon = await buildPoseidon();
 *     const nodeHash = (l, r) => poseidon.F.toObject(poseidon([l, r]));
 *   Leaf hashes should be keccak256(issuerId) mod r (field-reduced) OR
 *   Poseidon([issuerId]) for full algebraic consistency.
 */

import { assertField } from "./hash";

/** DEPTH used by circuits/issuer-membership.circom */
export const ISSUER_TREE_DEPTH = 20;

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
    assertField(BigInt(pathElements[i] as string), `pathElements[${i}]`);
  }
}

/** Compute the Merkle tree leaf index implied by pathIndices (LSB-first). */
export function pathIndicesToLeafIndex(pathIndices: (0 | 1)[]): number {
  return pathIndices.reduce((acc, bit, level) => acc + bit * 2 ** level, 0);
}
