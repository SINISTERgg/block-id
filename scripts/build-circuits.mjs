/**
 * build-circuits.mjs — ZK circuit compilation and Groth16 trusted setup.
 *
 * Compiles circuits/*.circom with circom (Rust binary), runs the Groth16
 * trusted setup with snarkjs, and emits all proving/verification artifacts to
 * public/zkp/<circuit>/. Also exports a Solidity verifier contract for each
 * circuit to contracts/.
 *
 * Prerequisites:
 *   # Circom compiler (Rust binary)
 *   cargo install --git https://github.com/iden3/circom
 *
 *   # JS tooling (already in package.json)
 *   npm install   # installs snarkjs and circomlib
 *
 * Usage:
 *   node scripts/build-circuits.mjs                 # all three circuits
 *   node scripts/build-circuits.mjs age-verify      # single circuit
 *
 * Powers of Tau:
 *   Uses/creates pot15_final.ptau (~2^15 constraints) in cache/.
 *   All three circuits sit well below 2^15 constraints after the Poseidon
 *   migration, so pot15 is sufficient.
 *
 *   The ptau is produced with at least one `contribute` step — required so
 *   the Groth16 IC points in the exported verification keys are real
 *   (see C6). For a production ceremony: replace pot15_final.ptau with an
 *   output from a real phase-1 ceremony (e.g. Hermez/Zcash) and re-run
 *   phase-2 setup.
 *
 * Output per circuit (in both build/circuits/<name>/ and public/zkp/<name>/):
 *   <name>.wasm              — witness generation (served to browser)
 *   <name>_final.zkey        — proving key
 *   verification_key.json    — verifying key (used by snarkjs client verify)
 *   <name>_js/<name>.wasm   — (build/ only, intermediate)
 *
 * Solidity verifiers (contracts/):
 *   AgeVerifier.sol
 *   AttributeRangeVerifier.sol
 *   IssuerMembershipVerifier.sol
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
process.chdir(root);

const CIRCUITS_DIR = "circuits";
const BUILD_DIR = path.join("build", "circuits");
const PUBLIC_ZKP = path.join("public", "zkp");
const CONTRACTS_DIR = "contracts";
const POT_PATH = path.join("cache", "pot15_final.ptau");

// Maps circuit name → Solidity verifier file name
const CIRCUIT_VERIFIER_MAP = {
  "age-verify": "AgeVerifier.sol",
  "attribute-range": "AttributeRangeVerifier.sol",
  "issuer-membership": "IssuerMembershipVerifier.sol",
};

const ALL_CIRCUITS = Object.keys(CIRCUIT_VERIFIER_MAP);

// Ensure ~/.cargo/bin is on PATH (needed on Windows if terminal hasn't reloaded env)
const cargoBin = path.join(process.env.USERPROFILE || process.env.HOME || "", ".cargo", "bin");
if (fs.existsSync(cargoBin) && !process.env.PATH?.includes(cargoBin)) {
  process.env.PATH = `${cargoBin}${path.delimiter}${process.env.PATH}`;
}

function run(cmd, args, opts = {}) {
  const quotedArgs =
    process.platform === "win32"
      ? args.map((a) =>
          typeof a === "string" && a.includes(" ") && !a.startsWith('"')
            ? `"${a}"`
            : a
        )
      : args;
  console.log(`$ ${cmd} ${quotedArgs.join(" ")}`);
  execFileSync(cmd, quotedArgs, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...opts,
  });
}

function has(cmd) {
  try {
    execFileSync(cmd, ["--version"], {
      stdio: "ignore",
      shell: process.platform === "win32",
    });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const targets = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const circuits = targets.length ? targets : ALL_CIRCUITS;
  const invalid = circuits.filter((c) => !ALL_CIRCUITS.includes(c));
  if (invalid.length) {
    console.error(
      `Unknown circuit(s): ${invalid.join(", ")}. Valid: ${ALL_CIRCUITS.join(", ")}`
    );
    process.exit(1);
  }

  // ── Pre-flight checks ─────────────────────────────────────────────────────

  if (!has("circom")) {
    console.error(
      "\n❌ circom is not installed. Install it with:\n" +
        "   cargo install --git https://github.com/iden3/circom\n" +
        "Then re-run: npm run build:circuits\n"
    );
    process.exit(1);
  }

  let snarkjsAvailable = true;
  try {
    require.resolve("snarkjs", { paths: [root] });
  } catch {
    snarkjsAvailable = false;
    console.warn(
      "\n⚠ snarkjs is not installed (`npm install snarkjs`). Will compile circuits only.\n"
    );
  }

  // circomlib MUST be present — circuits include its Poseidon & comparator templates
  const circomlibPath = path.join(root, "node_modules", "circomlib");
  if (!fs.existsSync(circomlibPath)) {
    console.error(
      "\n❌ circomlib is not installed. Run:\n" +
        "   npm install circomlib\n" +
        "Then re-run: npm run build:circuits\n"
    );
    process.exit(1);
  }
  console.log("✔ circomlib found at", circomlibPath);

  // ── Powers of Tau (phase 1) ───────────────────────────────────────────────

  if (snarkjsAvailable && !fs.existsSync(POT_PATH)) {
    console.log("\n── Generating Powers of Tau (pot15) ─────────────────────────────────────");
    fs.mkdirSync(path.dirname(POT_PATH), { recursive: true });
    const potTmp = path.join(path.dirname(POT_PATH), "pot15_0000.ptau");
    const potContrib = path.join(path.dirname(POT_PATH), "pot15_0001.ptau");
    run("npx", ["snarkjs", "powersoftau", "new", "bn128", "15", potTmp, "-v"]);
    // CRITICAL (roadmap C6): a seeded `powersoftau new` ptau has degenerate
    // alpha/beta values. Without at least one contribution the Groth16 IC
    // points telescope to the identity for multi-constraint circuits and the
    // exported verification key becomes signal-independent (any public signal
    // set verifies). Add a deterministic contribution so the resulting keys
    // are sound. For production, replace this with output from a real
    // distributed ceremony (Hermez/Zcash) and non-deterministic entropy.
    run("npx", [
      "snarkjs", "powersoftau", "contribute", potTmp, potContrib,
      "--name=blockid-local", `-e=${"blockid-local-pot15-regeneration-v1"}`,
    ]);
    run("npx", ["snarkjs", "powersoftau", "prepare", "phase2", potContrib, POT_PATH, "-v"]);
    fs.rmSync(potTmp, { force: true });
    fs.rmSync(potContrib, { force: true });
    console.log("✔ pot15_final.ptau (contributed) written to cache/\n");
  }

  // ── Per-circuit compilation and setup ────────────────────────────────────

  for (const name of circuits) {
    console.log(`\n${"─".repeat(70)}`);
    console.log(`◆ Processing circuit: ${name}`);
    console.log("─".repeat(70));

    const outDir = path.join(BUILD_DIR, name);
    fs.mkdirSync(outDir, { recursive: true });

    const r1cs = path.join(outDir, `${name}.r1cs`);
    const wasmDir = path.join(outDir, `${name}_js`);
    const wasm = path.join(wasmDir, `${name}.wasm`);
    const zkey = path.join(outDir, `${name}_final.zkey`);

    // 1. Compile .circom → .r1cs + .wasm + .sym
    //    Circuits use: include "circomlib/circuits/poseidon.circom";
    //    -l points to node_modules (relative path avoids Windows space issues entirely)
    run("circom", [
      path.join(CIRCUITS_DIR, `${name}.circom`),
      "--r1cs",
      "--wasm",
      "--sym",
      "-l", "node_modules",
      "-o", outDir,
    ]);

    if (!snarkjsAvailable) {
      console.log(`  (snarkjs not available — skipping setup and artifact copy for ${name})`);
      continue;
    }

    // 2. Groth16 phase-2 trusted setup: .r1cs + pot15 → .zkey
    console.log("\n── Groth16 setup ────────────────────────────────────────────────────────");
    run("npx", ["snarkjs", "groth16", "setup", r1cs, POT_PATH, zkey]);

    // 3. Export verification key
    const vkeyBuild = path.join(outDir, "verification_key.json");
    run("npx", ["snarkjs", "zkey", "export", "verificationkey", zkey, vkeyBuild]);

    // 4. Copy browser-serving artifacts to public/zkp/<name>/
    const publicOut = path.join(PUBLIC_ZKP, name);
    fs.mkdirSync(publicOut, { recursive: true });
    fs.copyFileSync(wasm, path.join(publicOut, `${name}.wasm`));
    fs.copyFileSync(zkey, path.join(publicOut, `${name}_final.zkey`));
    fs.copyFileSync(vkeyBuild, path.join(publicOut, "verification_key.json"));
    console.log(`\n✔ Browser artifacts → public/zkp/${name}/`);

    // 5. Export Solidity verifier contract → contracts/<VerifierName>.sol
    const solidityOut = path.join(CONTRACTS_DIR, CIRCUIT_VERIFIER_MAP[name]);
    run("npx", [
      "snarkjs",
      "zkey",
      "export",
      "solidityverifier",
      zkey,
      solidityOut,
    ]);
    console.log(`✔ Solidity verifier → ${solidityOut}`);

    // 6. Print constraint count for the paper
    run("npx", ["snarkjs", "r1cs", "info", r1cs]);

    // 7. Validate public signal count — enforces single source of truth:
    //    circuit ↔ TypeScript builder ↔ Solidity verifier ↔ tests ↔ paper
    const EXPECTED_PUBLIC_SIGNALS = {
      "age-verify":        9,  // 7 public inputs + vcCommitment + nullifier
      "attribute-range":   9,  // 7 public inputs + vcCommitment + nullifier
      "issuer-membership": 8,  // 6 public inputs + vcCommitment + nullifier
    };
    const vk = JSON.parse(fs.readFileSync(vkeyBuild, "utf-8"));
    const nPublic = vk.IC.length - 1;
    const expected = EXPECTED_PUBLIC_SIGNALS[name];
    if (expected !== undefined && nPublic !== expected) {
      console.error(`\n❌  Signal count mismatch for ${name}!`);
      console.error(`   Expected ${expected}, got ${nPublic}.`);
      console.error(`   The circuit, TypeScript builders, and Solidity verifier are out of sync.`);
      console.error(`   Update EXPECTED_PUBLIC_SIGNALS in build-circuits.mjs if you changed the layout.`);
      process.exit(1);
    }
    console.log(`✔ ${name}: ${nPublic} public signals (expected ${expected}) — ✓`);
  }


  console.log(`\n${"═".repeat(70)}`);
  console.log("✅ All circuits compiled and artifacts generated.");
  console.log("═".repeat(70));
  console.log("\nNext steps:");
  console.log("  1. Commit public/zkp/ artifacts (checked into repo for zero-setup browser proving).");
  console.log("  2. Commit the updated Solidity verifier contracts in contracts/.");
  console.log("  3. Register each circuit's verifying key on-chain:");
  console.log("       npx snarkjs zkey export verificationkey <zkey> /dev/stdout | ...");
  console.log("       then feed vk components to ZKPVerifier.registerVerificationKey().");
  console.log("  4. Run benchmarks:");
  console.log("       node scripts/benchmark-gas.js");
  console.log("       node scripts/benchmark-latency.mjs\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
