/**
 * build-circuits.mjs — optional toolchain for the ZK phase.
 *
 * Compiles circuits/*.circom with circom and runs the Groth16 trusted setup
 * with snarkjs, emitting artifacts to public/zkp/<circuit>/.
 *
 * Prerequisites (NOT installed by default):
 *   npm install -g circom          # Rust binary — see docs.circom.io
 *   npm install --save-dev snarkjs
 *
 * Usage:
 *   node scripts/build-circuits.mjs                 # all circuits
 *   node scripts/build-circuits.mjs age-verify      # single circuit
 *
 * Powers of Tau: uses/creates pot15_final.ptau (~2^15 constraints) in cache/.
 * For production re-run a proper ceremony — this script is for dev/test only.
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const CIRCUITS_DIR = path.join(root, "circuits");
const BUILD_DIR = path.join(root, "build", "circuits");
const PUBLIC_ZKP = path.join(root, "public", "zkp");
const POT_PATH = path.join(root, "cache", "pot15_final.ptau");

const ALL_CIRCUITS = ["age-verify", "attribute-range", "issuer-membership"];

function run(cmd, args, opts = {}) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { stdio: "inherit", ...opts });
}

function has(cmd) {
  try {
    execFileSync(cmd, ["--version"], { stdio: "ignore" });
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
    console.error(`Unknown circuit(s): ${invalid.join(", ")}. Valid: ${ALL_CIRCUITS.join(", ")}`);
    process.exit(1);
  }

  if (!has("circom")) {
    console.warn(
      "\n⚠ circom is not installed. Install it first:\n" +
        "   cargo install --git https://github.com/iden3/circom\n" +
        "Skipping circuit compilation — web app will run without ZKP artifacts.\n"
    );
    process.exit(0);
  }

  let snarkjsAvailable = true;
  try {
    require.resolve("snarkjs", { paths: [root] });
  } catch {
    snarkjsAvailable = false;
    console.warn("\n⚠ snarkjs is not installed (`npm i -D snarkjs`). Will compile circuits only.\n");
  }

  // Trusted setup powers of tau (2^15 constraints is enough for all three circuits)
  if (snarkjsAvailable && !fs.existsSync(POT_PATH)) {
    fs.mkdirSync(path.dirname(POT_PATH), { recursive: true });
    const potTmp = path.join(path.dirname(POT_PATH), "pot15_0000.ptau");
    run("npx", ["snarkjs", "powersoftau", "new", "bn128", "15", potTmp, "-v"]);
    run("npx", ["snarkjs", "powersoftau", "prepare", "phase2", potTmp, POT_PATH, "-v"]);
    fs.rmSync(potTmp, { force: true });
  }

  for (const name of circuits) {
    const outDir = path.join(BUILD_DIR, name);
    fs.mkdirSync(outDir, { recursive: true });
    const r1cs = path.join(outDir, `${name}.r1cs`);
    const wasm = path.join(outDir, `${name}_js`, `${name}.wasm`);
    const zkey = path.join(outDir, `${name}_final.zkey`);

    run("circom", [
      path.join(CIRCUITS_DIR, `${name}.circom`),
      "--r1cs",
      "--wasm",
      "--sym",
      "-o",
      outDir,
    ]);

    if (!snarkjsAvailable) continue;

    if (!fs.existsSync(POT_PATH)) {
      // Pot was skipped because snarkjs missing earlier — shouldn't happen here
      continue;
    }
    run("npx", ["snarkjs", "groth16", "setup", r1cs, POT_PATH, zkey]);

    // Export verification key + copy deployable artifacts into public/
    const vkeyOut = path.join(outDir, "verification_key.json");
    fs.mkdirSync(path.join(PUBLIC_ZKP, name), { recursive: true });
    run("npx", ["snarkjs", "zkey", "export", "verificationkey", zkey, vkeyOut]);

    fs.copyFileSync(wasm, path.join(PUBLIC_ZKP, name, `${name}.wasm`));
    fs.copyFileSync(zkey, path.join(PUBLIC_ZKP, name, `${name}_final.zkey`));
    fs.copyFileSync(vkeyOut, path.join(PUBLIC_ZKP, name, "verification_key.json"));

    console.log(`\n✔ ${name}: artifacts copied to public/zkp/${name}/`);
  }

  console.log(
    "\nNext steps:\n" +
      " 1. Deploy ZKPVerifier.sol and register each circuit's verifying key:\n" +
      "    npx snarkjs zkey export solidityverifier <zkey> Verifier.sol\n" +
      "    then feed vk components to ZKPVerifier.registerVerificationKey().\n" +
      " 2. Commit public/zkp/ artifacts so holders can generate proofs client-side.\n"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
