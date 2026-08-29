// BlockID — Attribute range proof circuit
// Proves that a private attribute value lies within [minValue, maxValue]
// WITHOUT revealing the value itself.
//
// Public inputs : minValue, maxValue
// Private inputs: value
// Output        : inRange (1 if minValue <= value <= maxValue)
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

template LessThan(n) {
    signal input in[2];
    signal output out; // 1 if in[0] < in[1]
    component n2b = Num2Bits(n + 1);
    n2b.in <== in[0] + 2 ** n - in[1];
    out <== n2b.out[n];
}

template AttributeRange() {
    signal input value;     // private
    signal input minValue;  // public
    signal input maxValue;  // public

    // ltLower = 1 when value < minValue  → violates lower bound
    component ltLower = LessThan(64);
    ltLower.in[0] <== value;
    ltLower.in[1] <== minValue;

    // ltUpper = 1 when maxValue < value → violates upper bound
    component ltUpper = LessThan(64);
    ltUpper.in[0] <== maxValue;
    ltUpper.in[1] <== value;

    signal output inRange;
    inRange <== (1 - ltLower.out) * (1 - ltUpper.out);
}

component main {public [minValue, maxValue]} = AttributeRange();
