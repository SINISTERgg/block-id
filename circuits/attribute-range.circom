// BlockID — Attribute range proof circuit (Groth16 / BN254)
//
// Proves that a private attribute value lies within [minValue, maxValue]
// WITHOUT revealing the value itself.
//
// ┌──────────────────────────────────────────────────────────────────────────────┐
// │  Private inputs  │  value, secret                                           │
// │  Public inputs   │  minValue, maxValue, scope, challenge,                   │
// │                  │  vcFingerprintHi, vcFingerprintLo, holderCommitment      │
// │  Public outputs  │  vcCommitment, nullifier                                 │
// └──────────────────────────────────────────────────────────────────────────────┘
//
// Security model — see age-verify.circom for the full rationale.
// This circuit enforces the same three-constraint structure:
//
//  [A] Range predicate:      minValue ≤ value ≤ maxValue
//  [B] Holder binding:       Poseidon(secret) === holderCommitment
//  [C] VC commitment:        vcCommitment = Poseidon(vcFpHi, vcFpLo, secret)
//
// Public signal layout (snarkjs fullProve order — circom emits outputs FIRST):
//   signals[0] = vcCommitment      ← Poseidon(vcFpHi, vcFpLo, secret) [output]
//   signals[1] = nullifier         ← Poseidon(secret, scope, challenge) [output; burned on-chain]
//   signals[2] = minValue
//   signals[3] = maxValue
//   signals[4] = scope             ← persistent verifier domain
//   signals[5] = challenge         ← fresh per-session nonce
//   signals[6] = vcFingerprintHi   ← SHA-256(VC)[0:128]
//   signals[7] = vcFingerprintLo   ← SHA-256(VC)[128:256]
//   signals[8] = holderCommitment  ← Poseidon(secret), stored at issuance
pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

template AttributeRange() {
    // ── Private witnesses ─────────────────────────────────────────────────────
    signal input value;    // The actual attribute value — PRIVATE
    signal input secret;   // Holder's random 253-bit secret — PRIVATE

    // ── Public inputs ─────────────────────────────────────────────────────────
    signal input minValue;          // Lower bound (inclusive) — PUBLIC
    signal input maxValue;          // Upper bound (inclusive) — PUBLIC
    signal input scope;             // Persistent verifier domain tag — PUBLIC
    signal input challenge;         // Fresh per-session nonce — PUBLIC
    signal input vcFingerprintHi;   // SHA-256(VC)[0:128] — PUBLIC
    signal input vcFingerprintLo;   // SHA-256(VC)[128:256] — PUBLIC
    signal input holderCommitment;  // Poseidon(secret) stored at issuance — PUBLIC

    // ── Constraint A: range predicate ─────────────────────────────────────────
    component geqMin = GreaterEqThan(64);
    geqMin.in[0] <== value;
    geqMin.in[1] <== minValue;
    geqMin.out === 1;

    component leqMax = GreaterEqThan(64);
    leqMax.in[0] <== maxValue;
    leqMax.in[1] <== value;
    leqMax.out === 1;

    // ── Constraint B: holder binding ──────────────────────────────────────────
    // Prove knowledge of the secret registered at issuance.
    component holderHasher = Poseidon(1);
    holderHasher.inputs[0] <== secret;
    holderHasher.out === holderCommitment;

    // ── Constraint C: VC fingerprint commitment ───────────────────────────────
    component vcCommitmentHasher = Poseidon(3);
    vcCommitmentHasher.inputs[0] <== vcFingerprintHi;
    vcCommitmentHasher.inputs[1] <== vcFingerprintLo;
    vcCommitmentHasher.inputs[2] <== secret;

    signal output vcCommitment;
    vcCommitment <== vcCommitmentHasher.out;

    // ── Session-scoped nullifier ──────────────────────────────────────────────
    component nullifierHasher = Poseidon(3);
    nullifierHasher.inputs[0] <== secret;
    nullifierHasher.inputs[1] <== scope;
    nullifierHasher.inputs[2] <== challenge;

    signal output nullifier;
    nullifier <== nullifierHasher.out;
}

// component main {public [...]} = AttributeRange();
//   snarkjs publicSignals  = [vcCommitment, nullifier, then the 7 public inputs above]
component main {public [minValue, maxValue, scope, challenge,
                        vcFingerprintHi, vcFingerprintLo, holderCommitment]} = AttributeRange();
