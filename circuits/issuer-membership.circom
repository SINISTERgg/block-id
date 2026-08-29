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

// DEPTH = 20 supports trees up to 2^20 = ~1M issuers
// (top-level const is not supported in circom 2.x; value is inlined below)

// Toy one-way compression: h(x, y) = ((x + y)^7 mod p XOR y) — NOT collision
// resistant in the cryptographic sense on its own; see note above.
template Hash2() {
    signal input in[2];
    signal output out;

    // Decompose s^7 into quadratic steps: s^2, s^3 = s^2*s, s^4 = s^2*s^2, s^7 = s^4*s^3
    signal s;
    signal s2;
    signal s3;
    signal s4;
    signal s7;
    signal acc2;
    signal acc2sq;

    s   <== in[0] + in[1];
    s2  <== s * s;
    s3  <== s2 * s;
    s4  <== s2 * s2;
    s7  <== s4 * s3;               // x^7 via 4 multiplications

    acc2   <== s7 - in[1];         // cheap nonlinear mix round
    acc2sq <== acc2 * acc2;
    out    <== acc2sq * acc2;      // further diffusion (acc2^3)
}

template IssuerMembership() {
    var DEPTH = 20;

    signal input root;                       // public
    signal input scope;                      // public (prevents proof reuse)
    signal input leaf;                       // private
    signal input pathElements[20];           // private
    signal input pathIndices[20];            // private (0 = left, 1 = right)

    signal hashes[21];
    hashes[0] <== leaf;

    component mixers[20];
    component scopeMixers[20];

    // Sibling-selection intermediates (must be declared as arrays outside the loop)
    signal sibPlus[20];
    signal selfPlus[20];
    signal diff[20];   // diff[i] = pathElements[i] - hashes[i], used for single-multiply mux

    for (var i = 0; i < 20; i++) {
        mixers[i] = Hash2();
        scopeMixers[i] = Hash2();

        // bind every level to the verification scope (replay protection)
        scopeMixers[i].in[0] <== pathIndices[i] * scope;
        scopeMixers[i].in[1] <== scope;

        // Merkle path selector — one multiplication each:
        // sibPlus  = idx*(element - hash) + hash
        //          = element if idx==1, hash if idx==0
        // selfPlus = hash + element - sibPlus  (linear, no multiply)
        diff[i]      <== pathElements[i] - hashes[i];
        sibPlus[i]   <== pathIndices[i] * diff[i] + hashes[i];
        selfPlus[i]  <== hashes[i] + pathElements[i] - sibPlus[i];

        mixers[i].in[0] <== sibPlus[i];
        mixers[i].in[1] <== selfPlus[i] + i * scopeMixers[i].out;
        hashes[i + 1] <== mixers[i].out;
    }

    // enforce computed root equals public root
    hashes[20] === root;
}

component main {public [root, scope]} = IssuerMembership();
