// BlockID — Issuer membership circuit (Groth16 / BN254)
//
// Proves that a private issuer leaf belongs to a Merkle tree with a given
// public root WITHOUT revealing which leaf was used.
//
// ┌──────────────────────────────────────────────────────────────────────────────┐
// │  Private inputs  │  leaf, secret,                                           │
// │                  │  pathElements[DEPTH], pathIndices[DEPTH]                 │
// │  Public inputs   │  root, scope, challenge,                                 │
// │                  │  vcFingerprintHi, vcFingerprintLo, holderCommitment      │
// │  Public outputs  │  vcCommitment, nullifier                                 │
// └──────────────────────────────────────────────────────────────────────────────┘
//
// Security model
// ──────────────────────────────────────────────────────────────
// This circuit enforces four constraints:
//
//  [A] Merkle membership:   hash path from leaf reaches root
//  [B] Holder binding:      Poseidon(secret) === holderCommitment
//  [C] VC commitment:       vcCommitment = Poseidon(vcFpHi, vcFpLo, secret)
//  [D] Session nullifier:   Poseidon(secret, scope, challenge)
//
// The Merkle leaf is a private witness — the holder proves they know a leaf
// in the trusted-issuer tree without revealing WHICH issuer signed their VC.
// The holder binding (constraint B) ensures only the registered holder can
// generate a valid proof even for a known issuer root.
//
// Public signal layout (snarkjs fullProve order — circom emits outputs FIRST):
//   signals[0] = vcCommitment      ← Poseidon(vcFpHi, vcFpLo, secret) [output]
//   signals[1] = nullifier         ← Poseidon(secret, scope, challenge) [output; burned on-chain]
//   signals[2] = root              ← Merkle root of trusted issuers
//   signals[3] = scope             ← persistent verifier domain
//   signals[4] = challenge         ← fresh per-session nonce
//   signals[5] = vcFingerprintHi   ← SHA-256(VC)[0:128]
//   signals[6] = vcFingerprintLo   ← SHA-256(VC)[128:256]
//   signals[7] = holderCommitment  ← Poseidon(secret), stored at issuance
pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/mux1.circom";

template IssuerMembership(DEPTH) {
    // ── Private witnesses ─────────────────────────────────────────────────────
    signal input leaf;                         // Issuer identity hash — PRIVATE
    signal input secret;                       // Holder's 253-bit secret — PRIVATE
    signal input pathElements[DEPTH];          // Merkle sibling hashes — PRIVATE
    signal input pathIndices[DEPTH];           // 0=left, 1=right — PRIVATE

    // ── Public inputs ─────────────────────────────────────────────────────────
    signal input root;              // Trusted-issuer Merkle root — PUBLIC
    signal input scope;             // Persistent verifier domain — PUBLIC
    signal input challenge;         // Fresh per-session nonce — PUBLIC
    signal input vcFingerprintHi;   // SHA-256(VC)[0:128] — PUBLIC
    signal input vcFingerprintLo;   // SHA-256(VC)[128:256] — PUBLIC
    signal input holderCommitment;  // Poseidon(secret) registered at issuance — PUBLIC

    // ── Constraint A: Merkle membership ──────────────────────────────────────
    signal hashes[DEPTH + 1];
    hashes[0] <== leaf;

    component hashers[DEPTH];
    component muxes[DEPTH];

    for (var i = 0; i < DEPTH; i++) {
        muxes[i] = MultiMux1(2);
        muxes[i].c[0][0] <== hashes[i];
        muxes[i].c[1][0] <== pathElements[i];
        muxes[i].c[0][1] <== pathElements[i];
        muxes[i].c[1][1] <== hashes[i];
        muxes[i].s        <== pathIndices[i];

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== muxes[i].out[0];
        hashers[i].inputs[1] <== muxes[i].out[1];
        hashes[i + 1] <== hashers[i].out;
    }

    // SOUNDNESS: computed root must match the claimed public root
    hashes[DEPTH] === root;

    // ── Constraint B: holder binding ──────────────────────────────────────────
    // Poseidon(secret) === holderCommitment
    // Ensures only the registered holder can produce a valid proof.
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

    // ── Constraint D: session-scoped nullifier ────────────────────────────────
    // Poseidon(secret, scope, challenge)
    // challenge changes per-session → nullifier changes per-session.
    component nullifierHasher = Poseidon(3);
    nullifierHasher.inputs[0] <== secret;
    nullifierHasher.inputs[1] <== scope;
    nullifierHasher.inputs[2] <== challenge;

    signal output nullifier;
    nullifier <== nullifierHasher.out;
}

// component main {public [...]} = IssuerMembership(20);
//   snarkjs publicSignals  = [vcCommitment, nullifier, then the 6 public inputs above]
component main {public [root, scope, challenge,
                        vcFingerprintHi, vcFingerprintLo, holderCommitment]} = IssuerMembership(20);
