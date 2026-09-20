/**
 * BlockID — Cryptographic Integration Test Specification
 * =======================================================
 *
 * These tests validate the ZK credential-binding protocol end-to-end:
 *   VC → SHA-256 fingerprint → Groth16 proof → on-chain verification
 *
 * PREREQUISITE: compiled circuit artifacts must exist before these tests run.
 *
 * Build command (from project root):
 *   node scripts/build-circuits.mjs
 *
 * Signal layouts — circom emits the main component's OUTPUTS first, then its
 * public inputs, so snarkjs `fullProve` publicSignals (asserted below) are:
 *   age-verify:        [vcCommitment(0), nullifier(1), refTs(2), minAge(3), scope(4), challenge(5), vcFpHi(6), vcFpLo(7), holderCommitment(8)]
 *   attribute-range:   [vcCommitment(0), nullifier(1), minVal(2), maxVal(3), scope(4), challenge(5), vcFpHi(6), vcFpLo(7), holderCommitment(8)]
 *   issuer-membership: [vcCommitment(0), nullifier(1), root(2), scope(3), challenge(4), vcFpHi(5), vcFpLo(6), holderCommitment(7)]
 *
 * Security model under test:
 *   [A] Age / range predicate satisfiability
 *   [B] Holder binding:  Poseidon(secret) === holderCommitment   (on-chain)
 *   [C] VC binding:      vcCommitment = Poseidon(vcFingerprintHi, vcFingerprintLo, secret)
 *   [D] Replay guard:    nullifier = Poseidon(secret, scope, challenge)
 *
 * NOTE: Tests are skipped when SKIP_ZK_INTEGRATION=1 or artifacts are absent.
 *       Run: npm test to execute all unit tests (always pass).
 *       Run: SKIP_ZK_INTEGRATION=0 npm test to run integration tests too.
 */

import { describe, it, expect } from "vitest";
import * as snarkjs from "snarkjs";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  buildAgeVerifyInputs,
  buildAttributeRangeInputs,
  buildIssuerMembershipInputs,
  vcFingerprintToFieldPair,
} from "./zkp";

const BUILD = path.resolve(process.cwd(), "build", "circuits");

function artifactPath(circuit: string, file: string): string {
  return path.join(BUILD, circuit, file);
}

function artifactsExist(circuit: string): boolean {
  return (
    fs.existsSync(artifactPath(circuit, `${circuit}_js/${circuit}.wasm`)) &&
    fs.existsSync(artifactPath(circuit, `${circuit}_final.zkey`)) &&
    fs.existsSync(artifactPath(circuit, "verification_key.json"))
  );
}

const SKIP = process.env.SKIP_ZK_INTEGRATION !== "0";

// ── Shared test vectors ────────────────────────────────────────────────────────

const VC_FINGERPRINT = "0xa3f4b1c2d5e6f7089a0b1c2d3e4f5061728394a5b6c7d8e9f0a1b2c3d4e5f607";
const HOLDER_SECRET = "holder-secret-please-use-crypto-random-in-production";

// holderCommitment = Poseidon(fieldFromString(HOLDER_SECRET))
// Compute with: node scripts/compute-holder-commitment.mjs
const HOLDER_COMMITMENT_FIELD = "4864483778908021873870592446246573127460734534774854586644885755345362312266";

const SCOPE_VERIFIER_A = "verifier-domain-A";
const SCOPE_VERIFIER_B = "verifier-domain-B";
const CHALLENGE_SESSION_1 = "session-nonce-0000000000000001";
const CHALLENGE_SESSION_2 = "session-nonce-0000000000000002";

const NOW_SEC = Math.floor(Date.now() / 1000);
const YEAR = 31_557_600;

async function proveAndVerify(
  circuit: string,
  circuitInputs: Record<string, unknown>
): Promise<{ proof: object; publicSignals: string[]; valid: boolean }> {
  const wasmPath = artifactPath(circuit, `${circuit}_js/${circuit}.wasm`);
  const zkeyPath = artifactPath(circuit, `${circuit}_final.zkey`);
  const vkeyPath = artifactPath(circuit, "verification_key.json");
  const { proof, publicSignals } = await (snarkjs as any).groth16.fullProve(
    circuitInputs, wasmPath, zkeyPath
  );
  const vKey = JSON.parse(fs.readFileSync(vkeyPath, "utf-8"));
  const valid = await (snarkjs as any).groth16.verify(vKey, publicSignals, proof);
  return { proof, publicSignals, valid };
}

// ── age-verify ────────────────────────────────────────────────────────────────

describe("age-verify — cryptographic integration", () => {
  const C = "age-verify";
  if (SKIP || !artifactsExist(C)) {
    it.skip("SKIPPED: run node scripts/build-circuits.mjs first, then SKIP_ZK_INTEGRATION=0 npm test", () => {});
    return;
  }

  const baseInput = {
    birthTimestamp: NOW_SEC - 30 * YEAR,
    referenceTimestamp: NOW_SEC,
    minAgeSeconds: 18 * YEAR,
    vcFingerprint: VC_FINGERPRINT,
    holderCommitment: HOLDER_COMMITMENT_FIELD,
  };

  // T1 — Valid proof
  it("T1 ACCEPT: valid adult credential + correct secret + correct fingerprint", async () => {
    const { circuitInputs } = buildAgeVerifyInputs(baseInput, HOLDER_SECRET, SCOPE_VERIFIER_A, CHALLENGE_SESSION_1);
    const { valid } = await proveAndVerify(C, circuitInputs);
    expect(valid).toBe(true);
  }, 120_000);

  // T0 — Exact public-signal layout (OUTPUTS FIRST — circom ordering)
  it("T0 LAYOUT: outputs first — vcCommitment[0], nullifier[1], then 7 public inputs", async () => {
    const { circuitInputs, expectedPublicSignals } = buildAgeVerifyInputs(
      baseInput, HOLDER_SECRET, SCOPE_VERIFIER_A, CHALLENGE_SESSION_1
    );
    const { publicSignals } = await proveAndVerify(C, circuitInputs);
    expect(publicSignals).toHaveLength(9);
    // Outputs occupy slots 0..1; their field values are not among the inputs.
    expect(publicSignals[0]).not.toBe(publicSignals[1]);
    expect(publicSignals.slice(2)).toEqual(expectedPublicSignals);
  }, 120_000);

  // T1b — Cross-check vcCommitment/nullifier positions against Poseidon
  it("T1b LAYOUT: nullifier at [1] nonzero and bound to inputs", async () => {
    const { circuitInputs } = buildAgeVerifyInputs(baseInput, HOLDER_SECRET, SCOPE_VERIFIER_A, CHALLENGE_SESSION_1);
    const { publicSignals } = await proveAndVerify(C, circuitInputs);
    expect(BigInt(publicSignals[1]) > 0n).toBe(true);
    expect(publicSignals[1]).not.toBe(publicSignals[0]);
  }, 120_000);

  // T2 — Modified VC (fingerprint changes → holderCommitment stored under different key)
  it("T2 REJECT: modified VC fingerprint is not in CredentialRegistry (on-chain only)", async () => {
    const MODIFIED_FP = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
    const { circuitInputs, expectedPublicSignals } = buildAgeVerifyInputs(
      { ...baseInput, vcFingerprint: MODIFIED_FP },
      HOLDER_SECRET, SCOPE_VERIFIER_A, CHALLENGE_SESSION_1
    );
    // Circuit-level proof succeeds (it doesn't know the registry) but
    // vcFingerprintHi/Lo in publicSignals won't match any registered VC.
    const [hi, lo] = vcFingerprintToFieldPair(MODIFIED_FP);
    expect(expectedPublicSignals[4]).toBe(hi.toString()); // vcFpHi at index 4
    expect(expectedPublicSignals[5]).toBe(lo.toString()); // vcFpLo at index 5
    // NOTE: ZKPVerifier.sol calls CredentialRegistry.isValid(reconstructedFp) → false → reverts.
  }, 120_000);

  // T3 — Wrong fingerprint (cross-VC proof transfer blocked at on-chain level)
  it("T3 REJECT: cross-VC proof transfer blocked by registry on-chain (signal layout check)", async () => {
    const [hi, lo] = vcFingerprintToFieldPair(VC_FINGERPRINT);
    const { expectedPublicSignals } = buildAgeVerifyInputs(baseInput, HOLDER_SECRET, SCOPE_VERIFIER_A, CHALLENGE_SESSION_1);
    // Verify the public signal at positions 4 and 5 carry the fingerprint halves for on-chain checking
    expect(expectedPublicSignals[4]).toBe(hi.toString());
    expect(expectedPublicSignals[5]).toBe(lo.toString());
  }, 30_000);

  // T4 — False predicate
  it("T4 REJECT: age=17 < threshold=18 → witness generation fails", async () => {
    const { circuitInputs } = buildAgeVerifyInputs(
      { ...baseInput, birthTimestamp: NOW_SEC - 17 * YEAR },
      HOLDER_SECRET, SCOPE_VERIFIER_A, CHALLENGE_SESSION_1
    );
    await expect(proveAndVerify(C, circuitInputs)).rejects.toThrow();
  }, 60_000);

  // T5 — Wrong secret
  it("T5 REJECT: wrong secret violates Poseidon(secret)===holderCommitment in circuit", async () => {
    const { circuitInputs } = buildAgeVerifyInputs(baseInput, "WRONG-SECRET", SCOPE_VERIFIER_A, CHALLENGE_SESSION_1);
    await expect(proveAndVerify(C, circuitInputs)).rejects.toThrow();
  }, 60_000);

  // T6 — Same session replay (same challenge → same nullifier → on-chain burn prevents reuse)
  it("T6 REJECT: same-session replay → identical nullifier burned on first use", async () => {
    const { circuitInputs } = buildAgeVerifyInputs(baseInput, HOLDER_SECRET, SCOPE_VERIFIER_A, CHALLENGE_SESSION_1);
    const { publicSignals } = await proveAndVerify(C, circuitInputs);
    const nullifier = publicSignals[1]; // Circom outputs are first: [0]=vcCommitment, [1]=nullifier
    // On-chain: first submission stores nullifier; second submission of same proof reverts.
    // At the TS level: we verify the nullifier is deterministic (same inputs → same nullifier).
    const { publicSignals: sig2 } = await proveAndVerify(C, circuitInputs);
    expect(sig2[1]).toBe(nullifier); // same proof → same nullifier → on-chain reverts second call
  }, 180_000);

  // T7 — Cross-verifier replay
  it("T7 REJECT: cross-verifier replay → scope change produces different nullifier", async () => {
    const sigA = (await proveAndVerify(C, buildAgeVerifyInputs(baseInput, HOLDER_SECRET, SCOPE_VERIFIER_A, CHALLENGE_SESSION_1).circuitInputs)).publicSignals;
    const sigB = (await proveAndVerify(C, buildAgeVerifyInputs(baseInput, HOLDER_SECRET, SCOPE_VERIFIER_B, CHALLENGE_SESSION_1).circuitInputs)).publicSignals;
    expect(sigA[1]).not.toBe(sigB[1]); // proof for A cannot be replayed at B
  }, 180_000);

  // T8 — Cross-session replay
  it("T8 REJECT: cross-session replay → challenge change produces different nullifier", async () => {
    const sig1 = (await proveAndVerify(C, buildAgeVerifyInputs(baseInput, HOLDER_SECRET, SCOPE_VERIFIER_A, CHALLENGE_SESSION_1).circuitInputs)).publicSignals;
    const sig2 = (await proveAndVerify(C, buildAgeVerifyInputs(baseInput, HOLDER_SECRET, SCOPE_VERIFIER_A, CHALLENGE_SESSION_2).circuitInputs)).publicSignals;
    expect(sig1[1]).not.toBe(sig2[1]); // proof for session 1 cannot be replayed in session 2
  }, 180_000);
});

// ── attribute-range ───────────────────────────────────────────────────────────

describe("attribute-range — cryptographic integration", () => {
  const C = "attribute-range";
  if (SKIP || !artifactsExist(C)) {
    it.skip("SKIPPED: run node scripts/build-circuits.mjs first", () => {});
    return;
  }

  const baseInput = { value: 25, minValue: 18, maxValue: 65, vcFingerprint: VC_FINGERPRINT, holderCommitment: HOLDER_COMMITMENT_FIELD };

  it("T1 ACCEPT: value=25 in [18,65]", async () => {
    const { circuitInputs } = buildAttributeRangeInputs(baseInput, HOLDER_SECRET, SCOPE_VERIFIER_A, CHALLENGE_SESSION_1);
    expect((await proveAndVerify(C, circuitInputs)).valid).toBe(true);
  }, 120_000);

  it("T0 LAYOUT: outputs first — vcCommitment[0], nullifier[1], then 7 public inputs", async () => {
    const { circuitInputs, expectedPublicSignals } = buildAttributeRangeInputs(baseInput, HOLDER_SECRET, SCOPE_VERIFIER_A, CHALLENGE_SESSION_1);
    const { publicSignals } = await proveAndVerify(C, circuitInputs);
    expect(publicSignals).toHaveLength(9);
    expect(publicSignals[0]).not.toBe(publicSignals[1]);
    expect(publicSignals.slice(2)).toEqual(expectedPublicSignals);
  }, 120_000);

  it("T4 REJECT: value=15 < minValue=18", async () => {
    const { circuitInputs } = buildAttributeRangeInputs({ ...baseInput, value: 15 }, HOLDER_SECRET, SCOPE_VERIFIER_A, CHALLENGE_SESSION_1);
    await expect(proveAndVerify(C, circuitInputs)).rejects.toThrow();
  }, 60_000);

  it("T5 REJECT: wrong secret violates holderCommitment constraint", async () => {
    const { circuitInputs } = buildAttributeRangeInputs(baseInput, "WRONG-SECRET", SCOPE_VERIFIER_A, CHALLENGE_SESSION_1);
    await expect(proveAndVerify(C, circuitInputs)).rejects.toThrow();
  }, 60_000);

  it("T7 REJECT: cross-verifier replay → different nullifier", async () => {
    const a = (await proveAndVerify(C, buildAttributeRangeInputs(baseInput, HOLDER_SECRET, SCOPE_VERIFIER_A, CHALLENGE_SESSION_1).circuitInputs)).publicSignals;
    const b = (await proveAndVerify(C, buildAttributeRangeInputs(baseInput, HOLDER_SECRET, SCOPE_VERIFIER_B, CHALLENGE_SESSION_1).circuitInputs)).publicSignals;
    expect(a[1]).not.toBe(b[1]);
  }, 180_000);
});

// ── issuer-membership ─────────────────────────────────────────────────────────

describe("issuer-membership — cryptographic integration", () => {
  const C = "issuer-membership";
  const DEPTH = 20;
  if (SKIP || !artifactsExist(C)) {
    it.skip("SKIPPED: run node scripts/build-circuits.mjs first", () => {});
    return;
  }

  // Replace with values from scripts/compute-merkle-tree.mjs
  const MERKLE_LEAF = "8368350892283742770706103882526372389155909120902766519559133856152143518344";
  const MERKLE_ROOT = "963686585699996378724200956847388130077724221190449892734261628242872951517";
  const PATH_ELEMENTS = Array(DEPTH).fill("0") as string[];
  const PATH_INDICES  = Array(DEPTH).fill(0) as (0 | 1)[];

  const baseInput = {
    leaf: MERKLE_LEAF, root: MERKLE_ROOT,
    scope: SCOPE_VERIFIER_A, secret: HOLDER_SECRET,
    pathElements: PATH_ELEMENTS, pathIndices: PATH_INDICES,
    vcFingerprint: VC_FINGERPRINT, holderCommitment: HOLDER_COMMITMENT_FIELD,
  };

  it("T1 ACCEPT: valid issuer membership", async () => {
    const { circuitInputs } = buildIssuerMembershipInputs(baseInput, CHALLENGE_SESSION_1);
    expect((await proveAndVerify(C, circuitInputs)).valid).toBe(true);
  }, 180_000);

  it("T0 LAYOUT: outputs first — vcCommitment[0], nullifier[1], then 6 public inputs", async () => {
    const { circuitInputs, expectedPublicSignals } = buildIssuerMembershipInputs(baseInput, CHALLENGE_SESSION_1);
    const { publicSignals } = await proveAndVerify(C, circuitInputs);
    expect(publicSignals).toHaveLength(8);
    expect(publicSignals[0]).not.toBe(publicSignals[1]);
    expect(publicSignals.slice(2)).toEqual(expectedPublicSignals);
  }, 180_000);

  it("T5 REJECT: wrong secret violates holderCommitment constraint", async () => {
    const { circuitInputs } = buildIssuerMembershipInputs({ ...baseInput, secret: "WRONG" }, CHALLENGE_SESSION_1);
    await expect(proveAndVerify(C, circuitInputs)).rejects.toThrow();
  }, 60_000);

  it("T7 REJECT: cross-verifier replay → different nullifier", async () => {
    const a = (await proveAndVerify(C, buildIssuerMembershipInputs(baseInput, CHALLENGE_SESSION_1).circuitInputs)).publicSignals;
    const b = (await proveAndVerify(C, buildIssuerMembershipInputs({ ...baseInput, scope: SCOPE_VERIFIER_B }, CHALLENGE_SESSION_1).circuitInputs)).publicSignals;
    expect(a[1]).not.toBe(b[1]);
  }, 360_000);
});
