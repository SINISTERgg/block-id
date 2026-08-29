import { describe, it, expect } from "vitest";
import {
  ISSUER_TREE_DEPTH,
  SECONDS_PER_YEAR,
  SNARK_SCALAR_FIELD,
  buildAgeVerifySignals,
  buildAttributeRangeSignals,
  computeNullifier,
  defaultMinAgeSeconds,
  isValidProofShape,
  pathIndicesToLeafIndex,
  toVerifierCalldata,
  validateMerklePath,
  type Groth16ProofJson,
} from "./zkp";

const NOW = 1_800_000_000; // far future reference timestamp
const YEAR = Number(SECONDS_PER_YEAR);

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

describe("pathIndicesToLeafIndex", () => {
  it("accumulates LSB-first", () => {
    expect(pathIndicesToLeafIndex([0, 0, 0])).toBe(0);
    expect(pathIndicesToLeafIndex([1, 0, 0])).toBe(1);
    expect(pathIndicesToLeafIndex([0, 1, 0])).toBe(2);
    expect(pathIndicesToLeafIndex([0, 0, 1])).toBe(4);
    expect(pathIndicesToLeafIndex([1, 1, 1])).toBe(7);
  });
});

describe("computeNullifier", () => {
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
});

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
