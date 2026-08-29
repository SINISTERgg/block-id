// BlockID — Age verification circuit
// Proves that a holder's age is at least `minAgeSeconds` at `referenceTimestamp`
// WITHOUT revealing their exact birth timestamp.
//
// Public inputs : referenceTimestamp, minAgeSeconds
// Private inputs: birthTimestamp
// Output        : valid (1 if age >= minAge)
pragma circom 2.0.0;

template Num2Bits(n) {
    signal input in;
    signal output out[n];
    var lin = 0;
    var exp = 1;
    for (var i = 0; i < n; i++) {
        out[i] <-- (in >> i) & 1;
        out[i] * (out[i] - 1) === 0;
        lin += out[i] * exp;
        exp *= 2;
    }
    lin === in;
}

template GreaterOrEqualThan(n) {
    signal input in[2]; // in[0] >= in[1]
    signal output out;
    component n2b = Num2Bits(n + 1);
    n2b.in <== in[0] + 2 ** n - in[1];
    // top bit is 0 exactly when in[0] + 2^n - in[1] < 2^n  ⇔  in[0] >= in[1]
    out <== 1 - n2b.out[n];
}

template AgeVerify() {
    signal input birthTimestamp;      // private
    signal input referenceTimestamp;  // public
    signal input minAgeSeconds;       // public

    signal ageInSeconds;
    ageInSeconds <== referenceTimestamp - birthTimestamp;

    component geq = GreaterOrEqualThan(64);
    geq.in[0] <== ageInSeconds;
    geq.in[1] <== minAgeSeconds;

    signal output valid;
    valid <== geq.out;
}

component main {public [referenceTimestamp, minAgeSeconds]} = AgeVerify();
