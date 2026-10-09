/**
 * Display metadata for the three BlockID Groth16 circuits.
 *
 * Kept out of `@/lib/zkp` because that module is the cryptographic source of
 * truth (signal layouts, field arithmetic) and must stay free of UI strings.
 */
import { publicSignalCount, type CircuitName } from "@/lib/zkp";

export interface CircuitMeta {
  /** Human-readable name shown in the UI. */
  label: string;
  /** One-line statement of what a valid proof asserts. */
  claim: string;
  /** Bulleted breakdown of the public signals, in emission order. */
  signals: { name: string; role: string }[];
}

export const CIRCUIT_META: Record<CircuitName, CircuitMeta> = {
  "age-verify": {
    label: "Age verification",
    claim: "Proves the holder is at least N years old without revealing a birth date",
    signals: [
      { name: "vcCommitment", role: "Poseidon commitment binding the VC fingerprint to the witness" },
      { name: "nullifier", role: "Replay guard — burned on-chain by ZKPVerifier.verifyProof" },
      { name: "referenceTimestamp", role: "Unix time the age is measured against" },
      { name: "minAgeSeconds", role: "Age threshold in seconds" },
      { name: "scope", role: "Verifier domain-separation tag (blocks cross-verifier replay)" },
      { name: "challenge", role: "Holder-chosen randomness, defeats grinding" },
      { name: "vcFingerprintHi", role: "Upper 128 bits of SHA-256(canonical VC JSON)" },
      { name: "vcFingerprintLo", role: "Lower 128 bits of SHA-256(canonical VC JSON)" },
      { name: "holderCommitment", role: "Holder's secret commitment — keeps proofs unlinkable" },
    ],
  },
  "attribute-range": {
    label: "Attribute range",
    claim: "Proves a private value lies within [min, max] without revealing it",
    signals: [
      { name: "vcCommitment", role: "Poseidon commitment binding the VC fingerprint to the witness" },
      { name: "nullifier", role: "Replay guard — burned on-chain by ZKPVerifier.verifyProof" },
      { name: "minValue", role: "Inclusive lower bound" },
      { name: "maxValue", role: "Inclusive upper bound" },
      { name: "scope", role: "Verifier domain-separation tag (blocks cross-verifier replay)" },
      { name: "challenge", role: "Holder-chosen randomness, defeats grinding" },
      { name: "vcFingerprintHi", role: "Upper 128 bits of SHA-256(canonical VC JSON)" },
      { name: "vcFingerprintLo", role: "Lower 128 bits of SHA-256(canonical VC JSON)" },
      { name: "holderCommitment", role: "Holder's secret commitment — keeps proofs unlinkable" },
    ],
  },
  "issuer-membership": {
    label: "Issuer membership",
    claim: "Proves the credential's issuer is a leaf of the trusted-issuer Merkle tree",
    signals: [
      { name: "vcCommitment", role: "Poseidon commitment binding the VC fingerprint to the witness" },
      { name: "nullifier", role: "Replay guard — burned on-chain by ZKPVerifier.verifyProof" },
      { name: "root", role: "Trusted-issuer Merkle root" },
      { name: "scope", role: "Verifier domain-separation tag (blocks cross-verifier replay)" },
      { name: "challenge", role: "Holder-chosen randomness, defeats grinding" },
      { name: "vcFingerprintHi", role: "Upper 128 bits of SHA-256(canonical VC JSON)" },
      { name: "vcFingerprintLo", role: "Lower 128 bits of SHA-256(canonical VC JSON)" },
      { name: "holderCommitment", role: "Holder's secret commitment — keeps proofs unlinkable" },
    ],
  },
};

/** Circuits ordered by how much a verifier should weight their evidence. */
export const CIRCUIT_ORDER: CircuitName[] = [
  "age-verify",
  "attribute-range",
  "issuer-membership",
];

export function circuitSignalSummary(circuit: CircuitName): string {
  return `${publicSignalCount(circuit)} public signals`;
}
