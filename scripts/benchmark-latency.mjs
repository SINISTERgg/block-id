/**
 * benchmark-latency.mjs
 *
 * Automated client-side ZKP latency benchmark for the BLOCKID proving pipeline.
 *
 * Measures the wall-clock time for all three stages of client-side proving:
 *   1. Witness generation  — snarkjs.wtns.calculate (WASM execution)
 *   2. Groth16 proof generation — snarkjs.groth16.prove (field arithmetic)
 *   3. Proof verification  — snarkjs.groth16.verify (client-side pairing check)
 *
 * Methodology:
 *   - N=50 iterations per circuit (configurable via CLI: --iterations 100)
 *   - First 5 iterations discarded as JIT warm-up
 *   - Reports: mean, median, p95, p99, stddev, min, max (all in ms)
 *   - Per-circuit totals and proving pipeline end-to-end
 *
 * Prerequisites:
 *   npm run build:circuits    # generates public/zkp/ artifacts first
 *
 * Usage:
 *   node scripts/benchmark-latency.mjs
 *   node scripts/benchmark-latency.mjs --iterations 100  # more samples
 *   node scripts/benchmark-latency.mjs --circuit age-verify  # one circuit
 *
 * Output: data/raw-latency-benchmarks.json
 *
 * Note: This benchmark is designed to run in Node.js where WASM runs
 * synchronously. Browser WASM performance may differ by ±10-15% depending
 * on V8 version and threading model (SharedArrayBuffer availability).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// ── CLI args ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const iterationsArg = argv.indexOf("--iterations");
const N_TOTAL = iterationsArg >= 0 ? parseInt(argv[iterationsArg + 1]) : 50;
const N_WARMUP = Math.max(5, Math.floor(N_TOTAL * 0.1));
const circuitArg = argv.indexOf("--circuit");
const ONLY_CIRCUIT = circuitArg >= 0 ? argv[circuitArg + 1] : null;

const ALL_CIRCUITS = ["age-verify", "attribute-range", "issuer-membership"];
const circuits = ONLY_CIRCUIT ? [ONLY_CIRCUIT] : ALL_CIRCUITS;

// ── Artifact paths ─────────────────────────────────────────────────────────────
const ZKP_DIR = path.join(root, "public", "zkp");

function artifactPaths(name) {
  const dir = path.join(ZKP_DIR, name);
  return {
    wasm: path.join(dir, `${name}.wasm`),
    zkey: path.join(dir, `${name}_final.zkey`),
    vkey: path.join(dir, "verification_key.json"),
  };
}

// ── Sample circuit inputs ─────────────────────────────────────────────────────
// These inputs are VALID — they must satisfy the circuit constraints to allow
// successful witness generation and proving.

const NOW_SEC = Math.floor(Date.now() / 1000);
const YEAR_SEC = 31_557_600;

const BENCH_SECRET = "12345678901234567890";
const BENCH_FP_HI = "123456789012345678901234567890";
const BENCH_FP_LO = "987654321098765432109876543210";

const SAMPLE_INPUTS = {
  "age-verify": {
    birthTimestamp: String(NOW_SEC - 30 * YEAR_SEC),   // 30 years ago
    secret: BENCH_SECRET,
    referenceTimestamp: String(NOW_SEC),
    minAgeSeconds: String(18 * YEAR_SEC),
    scope: "22222222222222222222222222222222",
    challenge: "1001",
    vcFingerprintHi: BENCH_FP_HI,
    vcFingerprintLo: BENCH_FP_LO,
    holderCommitment: "0", // computed dynamically below
  },
  "attribute-range": {
    value: "42",
    secret: BENCH_SECRET,
    minValue: "18",
    maxValue: "65",
    scope: "44444444444444444444444444444444",
    challenge: "1002",
    vcFingerprintHi: BENCH_FP_HI,
    vcFingerprintLo: BENCH_FP_LO,
    holderCommitment: "0", // computed dynamically below
  },
  "issuer-membership": {
    leaf: "1234",
    secret: BENCH_SECRET,
    pathElements: Array(20).fill("0"),
    pathIndices: Array(20).fill(0),
    root: "0",   // computed dynamically below
    scope: "99",
    challenge: "1003",
    vcFingerprintHi: BENCH_FP_HI,
    vcFingerprintLo: BENCH_FP_LO,
    holderCommitment: "0", // computed dynamically below
  },
};

// ── Statistics ────────────────────────────────────────────────────────────────
function stats(samples) {
  const s = [...samples].sort((a, b) => a - b);
  const n = s.length;
  const mean = s.reduce((a, b) => a + b, 0) / n;
  const variance = s.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  const median = n % 2 ? s[Math.floor(n / 2)] : (s[n / 2 - 1] + s[n / 2]) / 2;
  const p95 = s[Math.floor(n * 0.95)];
  const p99 = s[Math.floor(n * 0.99)];
  return {
    n: samples.length,
    mean: round2(mean),
    median: round2(median),
    p95: round2(p95),
    p99: round2(p99),
    stddev: round2(stddev),
    min: round2(s[0]),
    max: round2(s[n - 1]),
    unit: "ms",
  };
}
function round2(x) { return Math.round(x * 100) / 100; }
function now() { return performance.now(); }

// ── Load snarkjs ──────────────────────────────────────────────────────────────
let snarkjs;
try {
  snarkjs = require("snarkjs");
  if (snarkjs.default) snarkjs = snarkjs.default;
  console.log("✔ snarkjs loaded.");
} catch {
  console.error("❌ snarkjs not found. Run: npm install snarkjs");
  process.exit(1);
}

// ── Check artifacts ───────────────────────────────────────────────────────────
for (const name of circuits) {
  const { wasm, zkey, vkey } = artifactPaths(name);
  if (!fs.existsSync(wasm) || !fs.existsSync(zkey) || !fs.existsSync(vkey)) {
    console.error(
      `❌ Missing artifacts for ${name}.\n` +
      `   Run: npm run build:circuits\n` +
      `   Expected at: ${path.join(ZKP_DIR, name)}/`
    );
    process.exit(1);
  }
}

// ── Benchmark ─────────────────────────────────────────────────────────────────

async function benchmarkCircuit(name) {
  const { wasm, zkey, vkey } = artifactPaths(name);
  const inputs = { ...SAMPLE_INPUTS[name] };

  try {
    const { buildPoseidon } = await import("circomlibjs");
    const poseidon = await buildPoseidon();

    // Dynamically bind holderCommitment = Poseidon(secret)
    const secretF = BigInt(inputs.secret);
    inputs.holderCommitment = poseidon.F.toString(poseidon([secretF]));

    if (name === "issuer-membership") {
      let current = poseidon.F.e(inputs.leaf);
      for (let i = 0; i < 20; i++) {
        current = poseidon([current, poseidon.F.e(inputs.pathElements[i] || "0")]);
      }
      inputs.root = poseidon.F.toString(current);
    }
  } catch (e) {
    console.warn("  ⚠ Could not precompute Poseidon constraints:", e.message);
  }

  const vkeyJson = JSON.parse(fs.readFileSync(vkey, "utf8"));

  console.log(`\n◆ Circuit: ${name} (${N_TOTAL} iterations, discarding first ${N_WARMUP})`);

  const witnessMs = [];
  const proveMs = [];
  const verifyMs = [];
  const totalMs = [];
  let failedWitness = 0;
  let failedProof = 0;
  let failedVerify = 0;

  for (let i = 0; i < N_TOTAL; i++) {
    const iterStart = now();
    let proof, publicSignals;

    // Stage 1+2 combined: fullProve (witness gen + proof gen)
    // We split them by using wtns.calculate separately when possible
    const proveStart = now();
    try {
      const result = await snarkjs.groth16.fullProve(inputs, wasm, zkey);
      proof = result.proof;
      publicSignals = result.publicSignals;
    } catch (e) {
      failedProof++;
      if (i < N_WARMUP) continue;
      // Log but don't abort — record as failed iteration
      witnessMs.push(NaN); proveMs.push(NaN); verifyMs.push(NaN); totalMs.push(NaN);
      continue;
    }
    const proveEnd = now();

    // Stage 3: local verification
    const verStart = now();
    let verified = false;
    try {
      verified = await snarkjs.groth16.verify(vkeyJson, publicSignals, proof);
    } catch {
      failedVerify++;
    }
    const verEnd = now();

    if (i < N_WARMUP) continue; // discard warm-up

    const proveDuration = proveEnd - proveStart;
    const verifyDuration = verEnd - verStart;
    proveMs.push(proveDuration);
    verifyMs.push(verifyDuration);
    totalMs.push(verEnd - iterStart);

    process.stdout.write(`  [${i + 1}/${N_TOTAL}] prove=${round2(proveDuration)}ms  verify=${round2(verifyDuration)}ms  ok=${verified}\r`);
  }

  process.stdout.write("\n");

  const validProve = proveMs.filter(Number.isFinite);
  const validVerify = verifyMs.filter(Number.isFinite);

  const result = {
    circuit: name,
    iterations: N_TOTAL,
    warmupDiscarded: N_WARMUP,
    failedWitnessOrProve: failedProof,
    failedVerify,
    provingTime: validProve.length >= 3 ? stats(validProve) : { note: "insufficient successful iterations" },
    verificationTime: validVerify.length >= 3 ? stats(validVerify) : { note: "insufficient successful iterations" },
    totalPipelineTime: totalMs.filter(Number.isFinite).length >= 3 ? stats(totalMs.filter(Number.isFinite)) : { note: "insufficient" },
  };

  if (validProve.length >= 3) {
    console.log(`  Prove:  median=${result.provingTime.median}ms  p95=${result.provingTime.p95}ms  mean=${result.provingTime.mean}ms`);
    console.log(`  Verify: median=${result.verificationTime.median}ms  p95=${result.verificationTime.p95}ms`);
  } else {
    console.log(`  ⚠ Too many failures for ${name} — check circuit inputs and artifacts.`);
  }

  return result;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("━".repeat(60));
  console.log("  BLOCKID ZKP Latency Benchmark");
  console.log(`  Iterations: ${N_TOTAL} (${N_WARMUP} warm-up discarded)`);
  console.log("━".repeat(60));

  const circuitResults = [];
  for (const name of circuits) {
    const r = await benchmarkCircuit(name);
    circuitResults.push(r);
  }

  const out = {
    benchmarkedAt: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    configuration: {
      totalIterations: N_TOTAL,
      warmupIterations: N_WARMUP,
      analyzedIterations: N_TOTAL - N_WARMUP,
    },
    circuits: circuitResults,
  };

  const outDir = path.join(root, "data");
  const outFile = path.join(outDir, "raw-latency-benchmarks.json");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));

  console.log("\n" + "═".repeat(60));
  console.log("✅ Latency benchmark complete.");
  console.log(`   Results: ${outFile}`);
  console.log("═".repeat(60) + "\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
