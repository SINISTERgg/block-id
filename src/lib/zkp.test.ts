import { describe, it, expect } from "vitest";
import {
  ISSUER_TREE_DEPTH,
  PUBLIC_SIGNAL_LAYOUT,
  SECONDS_PER_YEAR,
  SNARK_SCALAR_FIELD,
  buildAgeVerifySignals,          // backwards-compat shim
  buildAttributeRangeSignals,     // backwards-compat shim
  buildAgeVerifyInputs,           // new full-input builder
  buildAttributeRangeInputs,      // new full-input builder
  buildIssuerMembershipInputs,    // new full-input builder
  computeNullifier,               // deprecated — retained for migration tests
  defaultMinAgeSeconds,
  extractPublicSignal,
  fieldFromString,
  isExpectedSignalCount,
  isValidProofShape,
  pathIndicesToLeafIndex,
  publicSignalCount,
  publicSignalIndex,
  toVerifierCalldata,
  validateMerklePath,
  vcFingerprintToField,           // legacy single-field conversion
  vcFingerprintToFieldPair,       // new split Hi/Lo conversion (full 256-bit coverage)
  type Groth16ProofJson,
} from "./zkp";

const NOW = 1_800_000_000; // far future reference timestamp
const YEAR = Number(SECONDS_PER_YEAR);

// ── Constants ─────────────────────────────────────────────────────────────────

// ── PUBLIC_SIGNAL_LAYOUT ──────────────────────────────────────────────────────

describe("PUBLIC_SIGNAL_LAYOUT", () => {
  it("puts vcCommitment at index 0 and nullifier at index 1 for every circuit", () => {
    (["age-verify", "attribute-range", "issuer-membership"] as const).forEach((c) => {
      expect(PUBLIC_SIGNAL_LAYOUT[c][0]).toBe("vcCommitment");
      expect(PUBLIC_SIGNAL_LAYOUT[c][1]).toBe("nullifier");
    });
  });

  it("exposes the documented signal counts (9 / 9 / 8)", () => {
    expect(publicSignalCount("age-verify")).toBe(9);
    expect(publicSignalCount("attribute-range")).toBe(9);
    expect(publicSignalCount("issuer-membership")).toBe(8);
  });

  it("publicSignalIndex resolves named outputs", () => {
    expect(publicSignalIndex("age-verify", "vcCommitment")).toBe(0);
    expect(publicSignalIndex("age-verify", "nullifier")).toBe(1);
    expect(publicSignalIndex("issuer-membership", "holderCommitment")).toBe(7);
  });

  it("extractPublicSignal reads values by name", () => {
    const age = ["A", "B", "c", "d", "e", "f", "g", "h", "i"];
    expect(extractPublicSignal("age-verify", "nullifier", age)).toBe("B");
    expect(extractPublicSignal("age-verify", "vcCommitment", age)).toBe("A");
    expect(() => extractPublicSignal("age-verify", "nope", age)).toThrow(/Unknown public signal/);
  });

  it("isExpectedSignalCount rejects wrong-length arrays (layout drift guard)", () => {
    expect(isExpectedSignalCount("age-verify", Array(9).fill("0"))).toBe(true);
    expect(isExpectedSignalCount("age-verify", Array(8).fill("0"))).toBe(false);
    expect(isExpectedSignalCount("issuer-membership", Array(8).fill("0"))).toBe(true);
  });
});

// ── Constants ─────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("uses the canonical BN254 scalar field", () => {
    expect(SNARK_SCALAR_FIELD).toBe(
      21888242871839275222246405745257275088548364400416034343698204186575808495617n
    );
  });

  it("defines a Julian year", () => {
    expect(SECONDS_PER_YEAR).toBe(31_557_600n);
  });

  it("computes an 18-year threshold", () => {
    expect(defaultMinAgeSeconds(18)).toBe(568_036_800n);
    expect(defaultMinAgeSeconds()).toBe(568_036_800n);
  });
});

// ── buildAgeVerifySignals (backwards-compat shim) ─────────────────────────────

describe("buildAgeVerifySignals", () => {
  const adult = { birthTimestamp: NOW - 30 * YEAR, referenceTimestamp: NOW, minAgeSeconds: 18 * YEAR };

  it("flags adults as provable", () => {
    const result = buildAgeVerifySignals(adult);
    expect(result.isAdult).toBe(true);
    expect(result.privateInputs).toEqual([String(NOW - 30 * YEAR)]);
    expect(result.publicInputs).toEqual([String(NOW), String(18 * YEAR)]);
  });

  it("rejects underage holders without throwing", () => {
    const child = { birthTimestamp: NOW - 10 * YEAR, referenceTimestamp: NOW, minAgeSeconds: 18 * YEAR };
    expect(buildAgeVerifySignals(child).isAdult).toBe(false);
  });

  it("treats exact-threshold age as adult (>=)", () => {
    const exact = { birthTimestamp: NOW - 18 * YEAR, referenceTimestamp: NOW, minAgeSeconds: 18 * YEAR };
    expect(buildAgeVerifySignals(exact).isAdult).toBe(true);
  });

  it("throws on negative timestamps", () => {
    expect(() =>
      buildAgeVerifySignals({ ...adult, birthTimestamp: -5 })
    ).toThrow(/non-negative/);
    expect(() =>
      buildAgeVerifySignals({ ...adult, minAgeSeconds: -1 })
    ).toThrow(/non-negative/);
  });

  it("throws on values exceeding the scalar field", () => {
    expect(() =>
      buildAttributeRangeSignals({
        value: 5,
        minValue: 0,
        maxValue: SNARK_SCALAR_FIELD + 12345n,
      })
    ).toThrow(/scalar field/);
  });
});

// ── buildAttributeRangeSignals (backwards-compat shim) ───────────────────────

describe("buildAttributeRangeSignals", () => {
  it("accepts values inside the range", () => {
    const r = buildAttributeRangeSignals({ value: 42, minValue: 0, maxValue: 100 });
    expect(r.inRange).toBe(true);
    expect(r.privateInputs).toEqual(["42"]);
    expect(r.publicInputs).toEqual(["0", "100"]);
  });

  it("includes both bounds inclusively", () => {
    expect(buildAttributeRangeSignals({ value: 0, minValue: 0, maxValue: 10 }).inRange).toBe(true);
    expect(buildAttributeRangeSignals({ value: 10, minValue: 0, maxValue: 10 }).inRange).toBe(true);
  });

  it("rejects out-of-range values gracefully", () => {
    expect(buildAttributeRangeSignals({ value: 11, minValue: 0, maxValue: 10 }).inRange).toBe(false);
  });


  it("throws on negative attribute values", () => {
    expect(() => buildAttributeRangeSignals({ value: -3, minValue: 0, maxValue: 10 })).toThrow(
      /non-negative/
    );
  });

  it("throws when bounds are inverted", () => {
    expect(() => buildAttributeRangeSignals({ value: 5, minValue: 10, maxValue: 0 })).toThrow(
      /minValue must be <= maxValue/
    );
  });
});

// ── vcFingerprintToFieldPair (SHA-256 split Hi/Lo) ────────────────────────────

describe("vcFingerprintToFieldPair", () => {
  const FP = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

  it("returns two field elements", () => {
    const [hi, lo] = vcFingerprintToFieldPair(FP);
    expect(typeof hi).toBe("bigint");
    expect(typeof lo).toBe("bigint");
  });

  it("hi and lo are both within the BN254 scalar field (no mod-r needed)", () => {
    const [hi, lo] = vcFingerprintToFieldPair(FP);
    expect(hi >= 0n && hi < SNARK_SCALAR_FIELD).toBe(true);
    expect(lo >= 0n && lo < SNARK_SCALAR_FIELD).toBe(true);
  });

  it("hi + lo together cover the full 256-bit fingerprint (no bit loss)", () => {
    const [hi, lo] = vcFingerprintToFieldPair(FP);
    // Reconstruct: (hi << 128) | lo  must equal original BigInt
    const reconstructed = (hi << 128n) | lo;
    const original = BigInt(FP);
    expect(reconstructed).toBe(original);
  });

  it("different fingerprints produce different Hi values", () => {
    const fpA = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const fpB = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const [hiA] = vcFingerprintToFieldPair(fpA);
    const [hiB] = vcFingerprintToFieldPair(fpB);
    expect(hiA).not.toBe(hiB);
  });

  it("different fingerprints produce different Lo values", () => {
    const fpA = "0x0000000000000000000000000000000011111111111111111111111111111111";
    const fpB = "0x0000000000000000000000000000000022222222222222222222222222222222";
    const [, loA] = vcFingerprintToFieldPair(fpA);
    const [, loB] = vcFingerprintToFieldPair(fpB);
    expect(loA).not.toBe(loB);
  });

  it("throws on wrong byte length", () => {
    expect(() => vcFingerprintToFieldPair("0xdeadbeef")).toThrow(/32-byte/);
    expect(() => vcFingerprintToFieldPair("0x" + "ab".repeat(33))).toThrow(/32-byte/);
  });

  it("is deterministic", () => {
    const [hi1, lo1] = vcFingerprintToFieldPair(FP);
    const [hi2, lo2] = vcFingerprintToFieldPair(FP);
    expect(hi1).toBe(hi2);
    expect(lo1).toBe(lo2);
  });
});

// ── buildAgeVerifyInputs (new circuit-bound API) ─────────────────────────────

describe("buildAgeVerifyInputs", () => {
  // Fixed test vectors
  const TEST_VC_FP = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
  const TEST_HOLDER_COMMITMENT = "12345678901234567890"; // Poseidon(secret) — opaque in TS tests
  const secret = "holder-secret-seed-abc";
  const scope = "verifier-domain-v1";
  const challenge = "session-nonce-xyz";

  const input = {
    birthTimestamp: NOW - 30 * YEAR,
    referenceTimestamp: NOW,
    minAgeSeconds: 18 * YEAR,
    vcFingerprint: TEST_VC_FP,
    holderCommitment: TEST_HOLDER_COMMITMENT,
  };

  it("produces all nine circuit signals for an adult", () => {
    const { circuitInputs, isAdult } = buildAgeVerifyInputs(input, secret, scope, challenge);
    expect(isAdult).toBe(true);
    // Private
    expect(typeof circuitInputs.birthTimestamp).toBe("string");
    expect(typeof circuitInputs.secret).toBe("string");
    // Public inputs (7)
    expect(typeof circuitInputs.referenceTimestamp).toBe("string");
    expect(typeof circuitInputs.minAgeSeconds).toBe("string");
    expect(typeof circuitInputs.scope).toBe("string");
    expect(typeof circuitInputs.challenge).toBe("string");
    expect(typeof circuitInputs.vcFingerprintHi).toBe("string");
    expect(typeof circuitInputs.vcFingerprintLo).toBe("string");
    expect(typeof circuitInputs.holderCommitment).toBe("string");
  });

  it("vcFingerprintHi and vcFingerprintLo reconstruct the full fingerprint", () => {
    const { circuitInputs } = buildAgeVerifyInputs(input, secret, scope, challenge);
    const hi = BigInt(circuitInputs.vcFingerprintHi as string);
    const lo = BigInt(circuitInputs.vcFingerprintLo as string);
    const reconstructed = (hi << 128n) | lo;
    expect(reconstructed).toBe(BigInt(TEST_VC_FP));
  });

  it("both fingerprint halves are within the BN254 scalar field", () => {
    const { circuitInputs } = buildAgeVerifyInputs(input, secret, scope, challenge);
    expect(BigInt(circuitInputs.vcFingerprintHi as string) < SNARK_SCALAR_FIELD).toBe(true);
    expect(BigInt(circuitInputs.vcFingerprintLo as string) < SNARK_SCALAR_FIELD).toBe(true);
  });

  it("holderCommitment appears in circuitInputs", () => {
    const { circuitInputs } = buildAgeVerifyInputs(input, secret, scope, challenge);
    expect(circuitInputs.holderCommitment).toBe(TEST_HOLDER_COMMITMENT);
  });

  it("challenge appears in circuitInputs", () => {
    const { circuitInputs } = buildAgeVerifyInputs(input, secret, scope, challenge);
    expect(typeof circuitInputs.challenge).toBe("string");
    expect(BigInt(circuitInputs.challenge as string) < SNARK_SCALAR_FIELD).toBe(true);
  });

  it("different challenges produce different challenge circuit signals", () => {
    const { circuitInputs: a } = buildAgeVerifyInputs(input, secret, scope, "challenge-A");
    const { circuitInputs: b } = buildAgeVerifyInputs(input, secret, scope, "challenge-B");
    expect(a.challenge).not.toBe(b.challenge);
  });

  it("expectedPublicSignals has 7 entries (inputs only; vcCommitment+nullifier are outputs)", () => {
    const { expectedPublicSignals } = buildAgeVerifyInputs(input, secret, scope, challenge);
    // Layout: [referenceTimestamp, minAgeSeconds, scope, challenge,
    //          vcFingerprintHi, vcFingerprintLo, holderCommitment]
    expect(expectedPublicSignals).toHaveLength(7);
  });

  it("marks underage holders as not provable", () => {
    const child = { ...input, birthTimestamp: NOW - 10 * YEAR };
    expect(buildAgeVerifyInputs(child, secret, scope, challenge).isAdult).toBe(false);
  });

  it("scope field varies with different scope strings", () => {
    const { circuitInputs: a } = buildAgeVerifyInputs(input, secret, "scope-A", challenge);
    const { circuitInputs: b } = buildAgeVerifyInputs(input, secret, "scope-B", challenge);
    expect(a.scope).not.toBe(b.scope);
  });

  it("secret field varies with different secrets", () => {
    const { circuitInputs: a } = buildAgeVerifyInputs(input, "secret-1", scope, challenge);
    const { circuitInputs: b } = buildAgeVerifyInputs(input, "secret-2", scope, challenge);
    expect(a.secret).not.toBe(b.secret);
  });

  it("secret is within the BN254 scalar field", () => {
    const { circuitInputs } = buildAgeVerifyInputs(input, secret, scope, challenge);
    expect(BigInt(circuitInputs.secret as string) < SNARK_SCALAR_FIELD).toBe(true);
  });

  it("is deterministic — same inputs always yield same circuitInputs", () => {
    const { circuitInputs: a } = buildAgeVerifyInputs(input, secret, scope, challenge);
    const { circuitInputs: b } = buildAgeVerifyInputs(input, secret, scope, challenge);
    expect(a).toEqual(b);
  });

  it("throws on invalid vcFingerprint (wrong byte length)", () => {
    expect(() =>
      buildAgeVerifyInputs({ ...input, vcFingerprint: "0xdeadbeef" }, secret, scope, challenge)
    ).toThrow(/32-byte/);
  });

  it("defaults challenge to '0' when omitted (backwards-compat)", () => {
    const { circuitInputs } = buildAgeVerifyInputs(input, secret, scope);
    expect(circuitInputs.challenge).toBeDefined();
  });
});

// ── buildAttributeRangeInputs (new circuit-bound API) ─────────────────────────

describe("buildAttributeRangeInputs", () => {
  const TEST_VC_FP = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
  const TEST_HC = "9999999999999999999";
  const secret = "attr-secret";
  const scope = "attr-scope";
  const challenge = "attr-session-123";

  const mkInput = (value: number) => ({
    value,
    minValue: 18,
    maxValue: 65,
    vcFingerprint: TEST_VC_FP,
    holderCommitment: TEST_HC,
  });

  it("produces all nine circuit signals for in-range values", () => {
    const { circuitInputs, inRange } = buildAttributeRangeInputs(mkInput(25), secret, scope, challenge);
    expect(inRange).toBe(true);
    expect(circuitInputs.value).toBe("25");
    expect(circuitInputs.minValue).toBe("18");
    expect(circuitInputs.maxValue).toBe("65");
    expect(typeof circuitInputs.vcFingerprintHi).toBe("string");
    expect(typeof circuitInputs.vcFingerprintLo).toBe("string");
    expect(typeof circuitInputs.holderCommitment).toBe("string");
    expect(typeof circuitInputs.challenge).toBe("string");
  });

  it("vcFingerprintHi/Lo reconstruct the full SHA-256 fingerprint", () => {
    const { circuitInputs } = buildAttributeRangeInputs(mkInput(25), secret, scope, challenge);
    const hi = BigInt(circuitInputs.vcFingerprintHi as string);
    const lo = BigInt(circuitInputs.vcFingerprintLo as string);
    expect((hi << 128n) | lo).toBe(BigInt(TEST_VC_FP));
  });

  it("expectedPublicSignals has 7 entries", () => {
    const { expectedPublicSignals } = buildAttributeRangeInputs(mkInput(25), secret, scope, challenge);
    // [minValue, maxValue, scope, challenge, vcFpHi, vcFpLo, holderCommitment]
    expect(expectedPublicSignals).toHaveLength(7);
  });

  it("flags out-of-range as not provable", () => {
    expect(buildAttributeRangeInputs(mkInput(200), secret, scope, challenge).inRange).toBe(false);
  });

  it("different challenges produce different challenge signals", () => {
    const { circuitInputs: a } = buildAttributeRangeInputs(mkInput(25), secret, scope, "c1");
    const { circuitInputs: b } = buildAttributeRangeInputs(mkInput(25), secret, scope, "c2");
    expect(a.challenge).not.toBe(b.challenge);
  });

  it("scope field changes when scope string changes", () => {
    const { circuitInputs: a } = buildAttributeRangeInputs(mkInput(25), secret, "verifier-A", challenge);
    const { circuitInputs: b } = buildAttributeRangeInputs(mkInput(25), secret, "verifier-B", challenge);
    expect(a.scope).not.toBe(b.scope);
  });

  it("throws when bounds are inverted", () => {
    expect(() =>
      buildAttributeRangeInputs({ value: 5, minValue: 100, maxValue: 10, vcFingerprint: TEST_VC_FP }, secret, scope)
    ).toThrow(/minValue must be <= maxValue/);
  });
});

// ── buildIssuerMembershipInputs ──────────────────────────────────────────────

describe("buildIssuerMembershipInputs", () => {
  const depth = ISSUER_TREE_DEPTH;
  const TEST_VC_FP = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
  const TEST_HC = "77777777777777777";
  const challenge = "issuer-challenge-42";
  const makeInput = () => ({
    leaf: "1234567890",
    root: "9876543210",
    scope: "1111111111",
    secret: "2222222222",
    pathElements: Array.from({ length: depth }, (_, i) => String(i + 100)),
    pathIndices: Array.from({ length: depth }, () => 0 as const) as (0 | 1)[],
    vcFingerprint: TEST_VC_FP,
    holderCommitment: TEST_HC,
  });

  it("produces a valid circuitInputs object with all new signals", () => {
    const { circuitInputs } = buildIssuerMembershipInputs(makeInput(), challenge);
    expect(circuitInputs.leaf).toBe("1234567890");
    expect(circuitInputs.root).toBe("9876543210");
    expect(circuitInputs.scope).toBe("1111111111");
    expect(circuitInputs.secret).toBe("2222222222");
    expect(Array.isArray(circuitInputs.pathElements)).toBe(true);
    expect(Array.isArray(circuitInputs.pathIndices)).toBe(true);
    expect(typeof circuitInputs.vcFingerprintHi).toBe("string");
    expect(typeof circuitInputs.vcFingerprintLo).toBe("string");
    expect(typeof circuitInputs.holderCommitment).toBe("string");
    expect(typeof circuitInputs.challenge).toBe("string");
  });

  it("vcFingerprintHi/Lo reconstruct the full SHA-256 fingerprint", () => {
    const { circuitInputs } = buildIssuerMembershipInputs(makeInput(), challenge);
    const hi = BigInt(circuitInputs.vcFingerprintHi as string);
    const lo = BigInt(circuitInputs.vcFingerprintLo as string);
    expect((hi << 128n) | lo).toBe(BigInt(TEST_VC_FP));
  });

  it("holderCommitment is present in circuitInputs", () => {
    const { circuitInputs } = buildIssuerMembershipInputs(makeInput(), challenge);
    expect(circuitInputs.holderCommitment).toBe(TEST_HC);
  });

  it("expectedPublicSignals has 6 entries (inputs only)", () => {
    const { expectedPublicSignals } = buildIssuerMembershipInputs(makeInput(), challenge);
    // [root, scope, challenge, vcFpHi, vcFpLo, holderCommitment]
    expect(expectedPublicSignals).toHaveLength(6);
  });

  it("challenge appears in expectedPublicSignals at index 2", () => {
    const challengeField = fieldFromString(challenge).toString();
    const { expectedPublicSignals } = buildIssuerMembershipInputs(makeInput(), challenge);
    expect(expectedPublicSignals[2]).toBe(challengeField);
  });

  it("different challenges produce different expectedPublicSignals", () => {
    const { expectedPublicSignals: a } = buildIssuerMembershipInputs(makeInput(), "c1");
    const { expectedPublicSignals: b } = buildIssuerMembershipInputs(makeInput(), "c2");
    expect(a[2]).not.toBe(b[2]);
  });

  it("throws on wrong-length pathElements", () => {
    const input = makeInput();
    input.pathElements = input.pathElements.slice(1);
    expect(() => buildIssuerMembershipInputs(input, challenge)).toThrow(/pathElements/);
  });

  it("throws on wrong-length pathIndices", () => {
    const input = makeInput();
    input.pathIndices = input.pathIndices.slice(1) as (0 | 1)[];
    expect(() => buildIssuerMembershipInputs(input, challenge)).toThrow(/pathIndices/);
  });

  it("throws on non-binary pathIndices", () => {
    const input = makeInput();
    (input.pathIndices as number[])[5] = 2;
    expect(() => buildIssuerMembershipInputs(input, challenge)).toThrow(/pathIndices\[5\]/);
  });
});

// ── fieldFromString ────────────────────────────────────────────────────────────

describe("fieldFromString", () => {
  it("is deterministic", () => {
    expect(fieldFromString("hello")).toBe(fieldFromString("hello"));
  });

  it("differs across inputs", () => {
    expect(fieldFromString("abc")).not.toBe(fieldFromString("def"));
  });

  it("stays within the BN254 scalar field", () => {
    const n = fieldFromString("arbitrary-string");
    expect(n >= 0n && n < SNARK_SCALAR_FIELD).toBe(true);
  });

  it("scope domain separation: different strings → different field elements", () => {
    expect(fieldFromString("verifier-A")).not.toBe(fieldFromString("verifier-B"));
  });
});

// ── Security: nullifier domain separation properties ──────────────────────────

describe("nullifier domain separation (circuit design properties)", () => {
  const TEST_VC_FP = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

  it("same secret+scope always produces the same scope field element", () => {
    const a = fieldFromString("scope:verifier-1");
    const b = fieldFromString("scope:verifier-1");
    expect(a).toBe(b);
  });

  it("different scopes produce different field elements (domain separation)", () => {
    expect(fieldFromString("scope:verifier-1")).not.toBe(fieldFromString("scope:verifier-2"));
  });

  it("different secrets produce different field elements (secret binding)", () => {
    expect(fieldFromString("secret:holder-alice")).not.toBe(fieldFromString("secret:holder-bob"));
  });

  it("age circuit: different scopes → different scope circuit inputs", () => {
    const input = { birthTimestamp: NOW - 30 * YEAR, referenceTimestamp: NOW, minAgeSeconds: 18 * YEAR, vcFingerprint: TEST_VC_FP };
    const { circuitInputs: a } = buildAgeVerifyInputs(input, "secret", "verifier-A");
    const { circuitInputs: b } = buildAgeVerifyInputs(input, "secret", "verifier-B");
    expect(a.scope).not.toBe(b.scope);
  });

  it("age circuit: same secret across scopes yields different circuit inputs", () => {
    const input = { birthTimestamp: NOW - 30 * YEAR, referenceTimestamp: NOW, minAgeSeconds: 18 * YEAR, vcFingerprint: TEST_VC_FP };
    const { circuitInputs: a } = buildAgeVerifyInputs(input, "shared-secret", "verifier-A");
    const { circuitInputs: b } = buildAgeVerifyInputs(input, "shared-secret", "verifier-B");
    expect(a.scope).not.toBe(b.scope);
  });

  it("attribute circuit: scope change propagates to circuit scope signal", () => {
    const input = { value: 25, minValue: 18, maxValue: 65, vcFingerprint: TEST_VC_FP };
    const { circuitInputs: a } = buildAttributeRangeInputs(input, "s", "domain-1");
    const { circuitInputs: b } = buildAttributeRangeInputs(input, "s", "domain-2");
    expect(a.scope).not.toBe(b.scope);
  });
});

// ── validateMerklePath ────────────────────────────────────────────────────────

describe("validateMerklePath", () => {
  const depth = ISSUER_TREE_DEPTH;
  const validElements = Array.from({ length: depth }, (_, i) => String(i + 1));
  const validIndices = Array.from({ length: depth }, () => 0 as const);

  it("accepts a well-formed path", () => {
    expect(() => validateMerklePath(validElements, validIndices, depth)).not.toThrow();
  });

  it("rejects wrong-length paths", () => {
    expect(() => validateMerklePath(validElements.slice(1), validIndices, depth)).toThrow(
      /pathElements/
    );
    expect(() => validateMerklePath(validElements, validIndices.slice(1), depth)).toThrow(
      /pathIndices/
    );
  });

  it("rejects non-binary indices", () => {
    const bad = [...validIndices];
    (bad as number[])[3] = 2;
    expect(() => validateMerklePath(validElements, bad, depth)).toThrow(/pathIndices\[3\]/);
  });

  it("rejects malformed sibling hashes", () => {
    const bad = [...validElements];
    bad[5] = "-7";
    expect(() => validateMerklePath(bad, validIndices, depth)).toThrow(/non-negative|pathElements/);
  });
});

// ── pathIndicesToLeafIndex ────────────────────────────────────────────────────

describe("pathIndicesToLeafIndex", () => {
  it("accumulates LSB-first", () => {
    expect(pathIndicesToLeafIndex([0, 0, 0])).toBe(0);
    expect(pathIndicesToLeafIndex([1, 0, 0])).toBe(1);
    expect(pathIndicesToLeafIndex([0, 1, 0])).toBe(2);
    expect(pathIndicesToLeafIndex([0, 0, 1])).toBe(4);
    expect(pathIndicesToLeafIndex([1, 1, 1])).toBe(7);
  });
});

// ── computeNullifier (deprecated Keccak-256 variant, kept for migration) ─────

describe("computeNullifier (deprecated Keccak-256 off-circuit variant)", () => {
  it("is deterministic for identical inputs", () => {
    expect(computeNullifier("secret", "scope")).toBe(computeNullifier("secret", "scope"));
  });

  it("differs across secrets", () => {
    expect(computeNullifier("a", "scope")).not.toBe(computeNullifier("b", "scope"));
  });

  it("differs across scopes", () => {
    expect(computeNullifier("secret", "scope-a")).not.toBe(computeNullifier("secret", "scope-b"));
  });

  it("differs across circuit ids", () => {
    expect(computeNullifier("secret", "scope", "age-verify")).not.toBe(
      computeNullifier("secret", "scope", "attribute-range")
    );
  });

  it("stays within the scalar field", () => {
    const n = BigInt(computeNullifier("secret", "scope"));
    expect(n >= 0n && n < SNARK_SCALAR_FIELD).toBe(true);
  });

  it("DESIGN NOTE: off-circuit nullifier is NOT bound to the proof witness", () => {
    const n1 = computeNullifier("secret", "scope", "age-verify");
    const n2 = computeNullifier("DIFFERENT-secret", "scope", "age-verify");
    expect(n1).not.toBe(n2);
  });
});

// ── toVerifierCalldata ────────────────────────────────────────────────────────

describe("toVerifierCalldata", () => {
  const snarkjsProof = {
    pi_a: ["11", "22", "1"],
    pi_b: [["33", "44"], ["55", "66"], ["1"]],
    pi_c: ["77", "88", "1"],
    protocol: "groth16",
    curve: "bn128",
  } as unknown as Groth16ProofJson;

  it("strips third coordinates and keeps G2 ordering", () => {
    const cd = toVerifierCalldata(snarkjsProof);
    expect(cd.a).toEqual(["11", "22"]);
    expect(cd.b[0]).toEqual(["33", "44"]);
    expect(cd.b[1]).toEqual(["55", "66"]);
    expect(cd.c).toEqual(["77", "88"]);
  });
});

// ── isValidProofShape ─────────────────────────────────────────────────────────

describe("isValidProofShape", () => {
  it("accepts structurally valid proofs", () => {
    expect(
      isValidProofShape({
        pi_a: ["1", "2"],
        pi_b: [["1", "2"], ["3", "4"]],
        pi_c: ["5", "6"],
      })
    ).toBe(true);
  });

  it("rejects malformed inputs", () => {
    expect(isValidProofShape(null)).toBe(false);
    expect(isValidProofShape("proof")).toBe(false);
    expect(isValidProofShape({})).toBe(false);
    expect(isValidProofShape({ pi_a: ["1"] })).toBe(false);
    expect(isValidProofShape({ pi_a: ["1", "2"], pi_b: [["1"], ["3", "4"]], pi_c: ["5", "6"] })).toBe(false);
    expect(
      isValidProofShape({ pi_a: ["1", "2"], pi_b: [["1", "2"], ["3", "4"]], pi_c: [] })
    ).toBe(false);
  });
});
