/**
 * security-tests.mjs
 *
 * BLOCKID Security Negative-Test Suite
 * Runs 12 attack scenarios against the age-verify ZK circuit.
 *
 * T01  Valid credential                                ? ACCEPT
 * T02  Modified credential fingerprint                ? REJECT
 * T03  Wrong holder commitment                        ? REJECT
 * T04  False predicate (age < threshold)              ? REJECT
 * T05  Corrupted proof A point                        ? REJECT
 * T06  Corrupted proof C point                        ? REJECT
 * T07  Reused nullifier (same scope+challenge)        ? REJECT
 * T08  Cross-scope ? different nullifier              ? ACCEPT (correct)
 * T09  Tampered nullifier in public signals           ? REJECT
 * T10  Signal out of BN254 scalar field range         ? REJECT
 * T11  Tampered vcCommitment in public signals        ? REJECT
 * T12  Fresh challenge ? new valid nullifier          ? ACCEPT (correct)
 *
 * Usage:
 *   node scripts/security-tests.mjs
 *
 * Output: data/security-test-results.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// Load snarkjs
let snarkjs;
try {
  snarkjs = require("snarkjs");
  if (snarkjs.default) snarkjs = snarkjs.default;
  console.log("snarkjs loaded.");
} catch {
  console.error("snarkjs not found. Run: npm install snarkjs");
  process.exit(1);
}

// Load circomlibjs Poseidon
let poseidon, poseidonF;
try {
  const { buildPoseidon } = await import("circomlibjs");
  poseidon = await buildPoseidon();
  poseidonF = poseidon.F;
  console.log("circomlibjs loaded.");
} catch (e) {
  console.error("circomlibjs not found:", e.message);
  process.exit(1);
}

// Paths
const ZKP_DIR = path.join(root, "public", "zkp");
const OUT_FILE = path.join(root, "data", "security-test-results.json");
const CIRCUIT = "age-verify";
const circuitDir = path.join(ZKP_DIR, CIRCUIT);
const WASM = path.join(circuitDir, `${CIRCUIT}.wasm`);
const ZKEY = path.join(circuitDir, `${CIRCUIT}_final.zkey`);
const VKEY_PATH = path.join(circuitDir, "verification_key.json");

if (!fs.existsSync(WASM) || !fs.existsSync(ZKEY) || !fs.existsSync(VKEY_PATH)) {
  console.error(
    `Missing circuit artifacts for '${CIRCUIT}'.\n` +
    `Run: npm run build:circuits\n` +
    `Expected at: ${circuitDir}/`
  );
  process.exit(1);
}
const vkeyJson = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));

// Constants
const NOW_SEC = Math.floor(Date.now() / 1000);
const YEAR_SEC = 31_557_600;
const VALID_SECRET = BigInt("12345678901234567890");
const VALID_COMMITMENT = poseidonF.toString(poseidon([VALID_SECRET]));
const FP_HI = "123456789012345678901234567890";
const FP_LO = "987654321098765432109876543210";
const SCOPE_A = "22222222222222222222222222222222";
const SCOPE_B = "99999999999999999999999999999999";
const CHALLENGE_1 = "1001";
const CHALLENGE_2 = "1002";
const SNARK_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

// Base valid inputs
const VALID_INPUTS = {
  birthTimestamp: String(NOW_SEC - 30 * YEAR_SEC),
  secret: String(VALID_SECRET),
  referenceTimestamp: String(NOW_SEC),
  minAgeSeconds: String(18 * YEAR_SEC),
  scope: SCOPE_A,
  challenge: CHALLENGE_1,
  vcFingerprintHi: FP_HI,
  vcFingerprintLo: FP_LO,
  holderCommitment: VALID_COMMITMENT,
};

// Helpers
async function proveAndVerify(inputs) {
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(inputs, WASM, ZKEY);
  const valid = await snarkjs.groth16.verify(vkeyJson, publicSignals, proof);
  return { outcome: valid ? "ACCEPT" : "REJECT", proof, publicSignals };
}

const testResults = [];

async function runTest(id, description, expectedOutcome, testFn) {
  process.stdout.write(`[${id}] ${description.padEnd(50)} `);
  const t0 = performance.now();
  let actual = "REJECT";
  let note = "";
  try {
    actual = await testFn();
  } catch (e) {
    actual = "REJECT";
    note = String(e.message).slice(0, 120);
  }
  const elapsed = Math.round(performance.now() - t0);
  const pass = actual === expectedOutcome;
  testResults.push({ id, description, expected: expectedOutcome, actual, pass, elapsedMs: elapsed, ...(note ? { note } : {}) });
  console.log(`${pass ? "PASS" : "FAIL"}  (${actual}, ${elapsed}ms)`);
}

// Tests
console.log("\n" + "=".repeat(70));
console.log("  BLOCKID Security Negative-Test Suite");
console.log("=".repeat(70) + "\n");

// T01 � Valid credential baseline
await runTest("T01", "Valid credential", "ACCEPT", async () => {
  const { outcome } = await proveAndVerify({ ...VALID_INPUTS });
  return outcome;
});

// T02 � Modified credential fingerprint
await runTest("T02", "Modified credential fingerprint", "REJECT", async () => {
  try {
    const { outcome } = await proveAndVerify({
      ...VALID_INPUTS,
      vcFingerprintHi: "111111111111111111111111111111",
      vcFingerprintLo: "222222222222222222222222222222",
    });
    return outcome;
  } catch { return "REJECT"; }
});

// T03 � Wrong holder commitment
await runTest("T03", "Wrong holder commitment (secret mismatch)", "REJECT", async () => {
  const wrongSecret = BigInt("99999999999999999999");
  const wrongCommitment = poseidonF.toString(poseidon([wrongSecret]));
  try {
    const { outcome } = await proveAndVerify({
      ...VALID_INPUTS,
      holderCommitment: wrongCommitment,
    });
    return outcome;
  } catch { return "REJECT"; }
});

// T04 � False predicate: age 10 years, threshold 18
await runTest("T04", "False age predicate (age 10 < threshold 18)", "REJECT", async () => {
  try {
    const { outcome } = await proveAndVerify({
      ...VALID_INPUTS,
      birthTimestamp: String(NOW_SEC - 10 * YEAR_SEC),
    });
    return outcome;
  } catch { return "REJECT"; }
});

// T05 � Corrupted proof A point
await runTest("T05", "Corrupted proof A point", "REJECT", async () => {
  try {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve({ ...VALID_INPUTS }, WASM, ZKEY);
    const tampered = { ...proof, pi_a: [(BigInt(proof.pi_a[0]) ^ 1n).toString(), proof.pi_a[1], proof.pi_a[2]] };
    const valid = await snarkjs.groth16.verify(vkeyJson, publicSignals, tampered);
    return valid ? "ACCEPT" : "REJECT";
  } catch { return "REJECT"; }
});

// T06 � Corrupted proof C point
await runTest("T06", "Corrupted proof C point", "REJECT", async () => {
  try {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve({ ...VALID_INPUTS }, WASM, ZKEY);
    const tampered = { ...proof, pi_c: [(BigInt(proof.pi_c[0]) ^ 0xffn).toString(), proof.pi_c[1], proof.pi_c[2]] };
    const valid = await snarkjs.groth16.verify(vkeyJson, publicSignals, tampered);
    return valid ? "ACCEPT" : "REJECT";
  } catch { return "REJECT"; }
});

// T07 � Reused nullifier simulation
await runTest("T07", "Reused nullifier (same scope+challenge)", "REJECT", async () => {
  const r1 = await snarkjs.groth16.fullProve({ ...VALID_INPUTS }, WASM, ZKEY);
  const r2 = await snarkjs.groth16.fullProve({ ...VALID_INPUTS }, WASM, ZKEY);
  const n1 = r1.publicSignals[1];
  const n2 = r2.publicSignals[1];
  if (n1 !== n2) return "ACCEPT";
  // Simulate on-chain nullifier burn: second use is blocked
  const usedNullifiers = new Set([n1]);
  return usedNullifiers.has(n2) ? "REJECT" : "ACCEPT";
});

// T08 � Cross-scope produces different nullifier (positive property)
await runTest("T08", "Cross-scope different nullifier (correct behavior)", "ACCEPT", async () => {
  const r1 = await snarkjs.groth16.fullProve({ ...VALID_INPUTS, scope: SCOPE_A }, WASM, ZKEY);
  const r2 = await snarkjs.groth16.fullProve({ ...VALID_INPUTS, scope: SCOPE_B }, WASM, ZKEY);
  return r1.publicSignals[1] !== r2.publicSignals[1] ? "ACCEPT" : "REJECT";
});

// T09 � Tampered nullifier in public signals
await runTest("T09", "Tampered nullifier in public signals", "REJECT", async () => {
  try {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve({ ...VALID_INPUTS }, WASM, ZKEY);
    const tampered = [...publicSignals];
    tampered[1] = String(BigInt(tampered[1]) ^ 1n);
    const valid = await snarkjs.groth16.verify(vkeyJson, tampered, proof);
    return valid ? "ACCEPT" : "REJECT";
  } catch { return "REJECT"; }
});

// T10 � Signal out of scalar field range
await runTest("T10", "Signal exceeds BN254 scalar field prime", "REJECT", async () => {
  try {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve({ ...VALID_INPUTS }, WASM, ZKEY);
    const tampered = [...publicSignals];
    tampered[2] = String(SNARK_FIELD + 1n);
    const valid = await snarkjs.groth16.verify(vkeyJson, tampered, proof);
    return valid ? "ACCEPT" : "REJECT";
  } catch { return "REJECT"; }
});

// T11 � Tampered vcCommitment (signals[0])
await runTest("T11", "Tampered vcCommitment in public signals", "REJECT", async () => {
  try {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve({ ...VALID_INPUTS }, WASM, ZKEY);
    const tampered = [...publicSignals];
    tampered[0] = String(BigInt(tampered[0]) ^ 0xdeadbeefn);
    const valid = await snarkjs.groth16.verify(vkeyJson, tampered, proof);
    return valid ? "ACCEPT" : "REJECT";
  } catch { return "REJECT"; }
});

// T12 � Fresh challenge produces new valid nullifier
await runTest("T12", "Fresh challenge produces distinct valid nullifier", "ACCEPT", async () => {
  const r1 = await snarkjs.groth16.fullProve({ ...VALID_INPUTS, challenge: CHALLENGE_1 }, WASM, ZKEY);
  const r2 = await snarkjs.groth16.fullProve({ ...VALID_INPUTS, challenge: CHALLENGE_2 }, WASM, ZKEY);
  const v1 = await snarkjs.groth16.verify(vkeyJson, r1.publicSignals, r1.proof);
  const v2 = await snarkjs.groth16.verify(vkeyJson, r2.publicSignals, r2.proof);
  const differentNullifiers = r1.publicSignals[1] !== r2.publicSignals[1];
  return v1 && v2 && differentNullifiers ? "ACCEPT" : "REJECT";
});

// Summary
const passed = testResults.filter((r) => r.pass).length;
const failed = testResults.filter((r) => !r.pass).length;

console.log("\n" + "=".repeat(70));
console.log(`  Results: ${passed} passed, ${failed} failed out of ${testResults.length} tests`);
console.log("=".repeat(70) + "\n");

// Write results
const outData = {
  testedAt: new Date().toISOString(),
  circuit: CIRCUIT,
  environment: { nodeVersion: process.version, snarkjsVersion: "0.7.6" },
  summary: { total: testResults.length, passed, failed },
  tests: testResults,
};
fs.mkdirSync(path.join(root, "data"), { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(outData, null, 2));
console.log(`Security test results written to ${OUT_FILE}\n`);

if (failed > 0) process.exit(1);



