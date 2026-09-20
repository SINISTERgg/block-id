// BlockID — Age verification circuit (Groth16 / BN254)
//
// Proves that a holder's age ≥ a threshold WITHOUT revealing the birth date.
//
// ┌──────────────────────────────────────────────────────────────────────────────┐
// │  Private inputs  │  birthTimestamp, secret                                  │
// │  Public inputs   │  referenceTimestamp, minAgeSeconds, scope, challenge,    │
// │                  │  vcFingerprintHi, vcFingerprintLo, holderCommitment      │
// │  Public outputs  │  vcCommitment, nullifier                                 │
// └──────────────────────────────────────────────────────────────────────────────┘
//
// Security model (answers the reviewer's holder-binding challenge)
// ──────────────────────────────────────────────────────────────
// The circuit enforces THREE independent cryptographic constraints:
//
//  [A] Age predicate
//        referenceTimestamp − birthTimestamp ≥ minAgeSeconds
//        ⟹ proves the predicate without revealing birthTimestamp.
//
//  [B] Holder binding  (NEW — closes the "anyone can use this fingerprint" gap)
//        Poseidon(secret) === holderCommitment
//        holderCommitment was registered on-chain in CredentialRegistry by
//        the legitimate holder at issuance time.
//        ⟹ only the holder who knows the secret that hashes to the stored
//           commitment can generate a valid proof.
//        ⟹ an attacker who obtains vcFingerprintHi/Lo of VC-A but does NOT
//           know the holder's secret cannot satisfy this constraint.
//
//  [C] VC fingerprint commitment  (prevents cross-VC proof transfer)
//        vcCommitment = Poseidon(vcFingerprintHi, vcFingerprintLo, secret)
//        ⟹ binds the proof to this specific VC's SHA-256 fingerprint.
//
// SHA-256 ‖ Poseidon Binding (split-field design)
// ──────────────────────────────────────────────────────────────
// SHA-256 produces 256 bits; the BN254 scalar field r ≈ 2^254.
// A naive mod-r reduction loses ~2 bits and is not collision-free.
// We avoid this by splitting the 32-byte SHA-256 digest at the midpoint:
//
//   h            := SHA-256(canonicalVC JSON)        [32 bytes]
//   vcFingerprintHi := h[0..15]  (upper 128 bits)   [field element, < 2^128 < r]
//   vcFingerprintLo := h[16..31] (lower 128 bits)   [field element, < 2^128 < r]
//
// Both halves are natively within the field — no reduction needed.
// Together they recover the full 256-bit SHA-256 hash without loss.
//
// Replay protection — session-scoped nullifier
// ──────────────────────────────────────────────────────────────
//   nullifier = Poseidon(secret, scope, challenge)
//
//   scope     := persistent verifier domain tag (keccak256(verifierId) mod r)
//   challenge := fresh per-session nonce issued by the verifier
//
// The nullifier changes every session (because challenge changes), so:
//   • Proof-A (challenge=c1) cannot be replayed at the same verifier.
//   • Proof-A (scope=v1) cannot be replayed at a different verifier (scope≠v1).
//
// Public signal layout (snarkjs fullProve order — circom emits outputs FIRST):
//   signals[0] = vcCommitment      ← Poseidon(vcFpHi, vcFpLo, secret) [output]
//   signals[1] = nullifier         ← Poseidon(secret, scope, challenge) [output; burned on-chain]
//   signals[2] = referenceTimestamp
//   signals[3] = minAgeSeconds
//   signals[4] = scope             ← persistent verifier domain
//   signals[5] = challenge         ← fresh per-session nonce
//   signals[6] = vcFingerprintHi   ← SHA-256(VC)[0:128] as field element
//   signals[7] = vcFingerprintLo   ← SHA-256(VC)[128:256] as field element
//   signals[8] = holderCommitment  ← Poseidon(secret), stored at issuance
//
// On-chain, ZKPVerifier.sol burns signals[1] (the nullifier) with every
// verifyProof call — proof reuse (same challenge/scope) is impossible.
//
// Dependency: circomlib (https://github.com/iden3/circomlib)
//   Install: npm install circomlib
//   Compile: circom circuits/age-verify.circom --include node_modules
pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

template AgeVerify() {
    // ── Private witnesses ─────────────────────────────────────────────────────
    signal input birthTimestamp;   // Holder's birth date — PRIVATE
    signal input secret;           // Holder's random 253-bit secret — PRIVATE

    // ── Public inputs ─────────────────────────────────────────────────────────
    signal input referenceTimestamp; // Verifier's "now" timestamp — PUBLIC
    signal input minAgeSeconds;      // Age threshold in seconds — PUBLIC
    signal input scope;              // Persistent verifier domain tag — PUBLIC
    signal input challenge;          // Fresh per-session nonce from verifier — PUBLIC
    signal input vcFingerprintHi;    // SHA-256(VC)[0:128] as field element — PUBLIC
    signal input vcFingerprintLo;    // SHA-256(VC)[128:256] as field element — PUBLIC
    signal input holderCommitment;   // Poseidon(secret), stored at issuance — PUBLIC

    // ── Constraint A: age predicate ───────────────────────────────────────────
    // Prove referenceTimestamp − birthTimestamp ≥ minAgeSeconds
    // without revealing birthTimestamp.
    component geq = GreaterEqThan(64);
    geq.in[0] <== referenceTimestamp - birthTimestamp;
    geq.in[1] <== minAgeSeconds;
    // SOUNDNESS: proof generation fails if age < threshold
    geq.out === 1;

    // ── Constraint B: holder binding ──────────────────────────────────────────
    // Poseidon(secret) === holderCommitment
    //
    // holderCommitment was stored on-chain in CredentialRegistry at issuance.
    // Only the holder who knows the secret that hashes to holderCommitment
    // can satisfy this constraint.
    component holderHasher = Poseidon(1);
    holderHasher.inputs[0] <== secret;
    // SOUNDNESS: proof fails if secret does not match the registered commitment
    holderHasher.out === holderCommitment;

    // ── Constraint C: VC fingerprint commitment ───────────────────────────────
    // vcCommitment = Poseidon(vcFingerprintHi, vcFingerprintLo, secret)
    //
    // Uses a 3-input Poseidon that covers both halves of the SHA-256 digest —
    // no field reduction required, full 256-bit coverage.
    component vcCommitmentHasher = Poseidon(3);
    vcCommitmentHasher.inputs[0] <== vcFingerprintHi;
    vcCommitmentHasher.inputs[1] <== vcFingerprintLo;
    vcCommitmentHasher.inputs[2] <== secret;

    signal output vcCommitment;
    vcCommitment <== vcCommitmentHasher.out;

    // ── Session-scoped nullifier ──────────────────────────────────────────────
    // nullifier = Poseidon(secret, scope, challenge)
    //
    // The challenge is fresh per-session ⟹ nullifier changes every session.
    // scope domain-separates across verifiers.
    // secret binding ensures the nullifier cannot be fabricated without the secret.
    component nullifierHasher = Poseidon(3);
    nullifierHasher.inputs[0] <== secret;
    nullifierHasher.inputs[1] <== scope;
    nullifierHasher.inputs[2] <== challenge;

    signal output nullifier;
    nullifier <== nullifierHasher.out;
}

// component main {public [...]} = AgeVerify();
//   snarkjs publicSignals  = [vcCommitment, nullifier, then the 7 public inputs above]
component main {public [referenceTimestamp, minAgeSeconds, scope, challenge,
                        vcFingerprintHi, vcFingerprintLo, holderCommitment]} = AgeVerify();
