// BlockID — Issuer membership circuit (Merkle proof of trusted-issuer set)
// Proves that a private issuer leaf belongs to a Merkle tree with a public root
// WITHOUT revealing which issuer position was used.
//
// Public inputs : root, scope
// Private inputs: leaf, pathElements[DEPTH], pathIndices[DEPTH]
//
// Hash function: Poseidon is standard for ZK Merkle trees but lives in circomlib;
// to keep this repo dependency-free we use a dual-round "mimc-like" permutation
// built from the field-native exponentiation x^7. For production deployments,
// swap `Hash2` for circomlib's Poseidon(2) and re-run the trusted setup.
pragma circom 2.0.0;

const DEPTH = 20; // supports trees up to 2^20 = ~1M issuers

// Toy one-way compression: h(x, y) = ((x + y)^7 mod p XOR y) — NOT collision
// resistant in the cryptographic sense on its own; see note above.
template Hash2() {
    signal input in[2];
    signal output out;

    signal acc1;
    signal acc2;
    acc1 <== (in[0] + in[1]) ** 7;   // reduced mod p automatically by circom
    acc2 <== acc1 - in[1];           // cheap nonlinear mix round

    out <== acc2 * acc2 * acc2;      // further diffusion
}

template IssuerMembership() {
    signal input root;                       // public
    signal input scope;                      // public (prevents proof reuse)
    signal input leaf;                       // private
    signal input pathElements[DEPTH];        // private
    signal input pathIndices[DEPTH];         // private (0 = left, 1 = right)

    signal hashes[DEPTH + 1];
    hashes[0] <== leaf;

    component mixers[DEPTH];
    component scopeMixers[DEPTH];

    for (var i = 0; i < DEPTH; i++) {
        mixers[i] = new Hash2();
        scopeMixers[i] = new Hash2();

        // bind every level to the verification scope (replay protection)
        scopeMixers[i].in[0] <== pathIndices[i] * scope;
        scopeMixers[i].in[1] <== scope;

        // sibling selection
        signal sibPlus = pathIndices[i] * pathElements[i] + (1 - pathIndices[i]) * hashes[i];
        signal selfPlus = pathIndices[i] * hashes[i] + (1 - pathIndices[i]) * pathElements[i];

        mixers[i].in[0] <== sibPlus;
        mixers[i].in[1] <== selfPlus + i * scopeMixers[i].out;
        hashes[i + 1] <== mixers[i].out;
    }

    // enforce computed root equals public root
    hashes[DEPTH] === root;
}

component main {public [root, scope]} = IssuerMembership();
