/**
 * Domain types for blockchain interactions, ZKP proofs, and on-chain anchoring.
 */

/** Status of a credential's on-chain anchor as returned by `getCredentialStatus`. */
export interface AnchorStatus {
  anchored: boolean;
  revoked: boolean;
  issuer: string;
  blockAnchored: number;
  anchoredAt: number;
  revokedAt: number;
}

/** Batch anchor status for multiple credentials. */
export interface BatchAnchorStatus {
  anchored: boolean[];
  revoked: boolean[];
  issuers: string[];
  blockNumbers: number[];
  timestamps: number[];
}

/** A Groth16 ZK proof as returned by snarkjs. */
export interface Groth16Proof {
  pi_a: [string, string, string];
  pi_b: [[string, string], [string, string], string];
  pi_c: [string, string, string];
  protocol?: string;
  curve?: string;
}

/** The combined result of a ZK proof generation. */
export interface ZKPProof {
  proof: Groth16Proof;
  publicSignals: string[];
}

/** An on-chain nullifier record used for replay prevention. */
export interface NullifierRecord {
  nullifier: string;
  circuitId: string;
  burnedAt: number;
  burnerAddress: string;
}

/** Supported ZK circuit names. */
export type CircuitName = "age-verify" | "attribute-range" | "issuer-membership";

/** Calldata layout for ZKPVerifier.sol. */
export interface ZKPCalldata {
  a: [string, string];
  b: [[string, string], [string, string]];
  c: [string, string];
}
