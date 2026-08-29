/**
 * compile.mjs — standalone Solidity compiler (no hardhat CLI needed)
 * Finds the solc bundled with hardhat and compiles every .sol file under contracts/.
 * Run: node scripts/compile.mjs
 */
import fs from "fs";
import path from "path";
import os from "os";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const root = path.resolve(__dirname, "..");

// ─── Find solc ──────────────────────────────────────────────────────────────
// Order: bundled solc-js → hardhat cache (native exe) → hardhat cache (wasm)
function findSolc() {
  const candidates = [
    path.join(root, "node_modules", "solc", "index.js"),
    path.join(root, "node_modules", "hardhat", "node_modules", "solc", "index.js"),
    path.join(root, "node_modules", "@nomicfoundation", "solidity-analyzer", "node_modules", "solc", "index.js"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return { kind: "js", path: c };
  }

  // Hardhat ≥3 caches downloaded compilers outside node_modules
  const cacheRoot = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "hardhat-nodejs", "Cache")
    : null;
  if (cacheRoot && fs.existsSync(cacheRoot)) {
    const nativeDir = path.join(cacheRoot, "compilers-v2", `${process.platform}-${process.arch}`);
    if (fs.existsSync(nativeDir)) {
      const exe = fs.readdirSync(nativeDir).find((f) => f.startsWith("solc-") && f.endsWith(".exe"));
      if (exe) return { kind: "native", path: path.join(nativeDir, exe) };
    }
    const wasmDir = path.join(cacheRoot, "compilers-v3", "wasm");
    if (fs.existsSync(wasmDir)) {
      const json = fs.readdirSync(wasmDir).find((f) => f.startsWith("soljson-") && f.endsWith(".js"));
      if (json) return { kind: "emscripten", path: path.join(wasmDir, json) };
    }
  }
  return null;
}

/** Compile standard JSON input using whichever compiler flavor we found. */
function compileSources(solc, inputJson) {
  if (solc.kind === "native") {
    // solc --standard-json reads stdin, writes stdout
    const stdout = execFileSync(solc.path, ["--standard-json"], {
      input: inputJson,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 256,
    });
    return JSON.parse(stdout);
  }

  const mod = require(solc.path);
  const compiler = typeof mod === "function" ? mod() : mod;
  const cwrap = compiler.cwrap ?? compiler.Module?.cwrap;
  if (!cwrap) throw new Error(`Unsupported solc module shape at ${solc.path}`);
  const solidityCompile = cwrap("solidity_compile", "string", ["string", "number"]);
  const result = solidityCompile(inputJson, 0);
  return typeof result === "string" ? JSON.parse(result) : result;
}

/** Recursively collect every *.sol file under a directory. */
function collectSolFiles(dir, baseDir = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectSolFiles(full, baseDir));
    else if (entry.isFile() && entry.name.endsWith(".sol")) {
      // Source key is the path relative to contracts/, with forward slashes
      out.push({ file: full, key: path.relative(baseDir, full).replace(/\\/g, "/") });
    }
  }
  return out;
}

async function main() {
  const solc = findSolc();
  if (!solc) {
    console.error("✖ Could not find solc (node_modules, hardhat cache).");
    console.error("   Run: npm install && npx hardhat compile   then retry.");
    process.exit(1);
  }

  console.log(`Using ${solc.kind} compiler: ${solc.path}`);

  const contractsDir = path.resolve(root, "contracts");
  const sourcesList = collectSolFiles(contractsDir);
  if (sourcesList.length === 0) {
    console.error("✖ No .sol files found under contracts/.");
    process.exit(1);
  }

  const sources = {};
  for (const { file, key } of sourcesList) {
    sources[key] = { content: fs.readFileSync(file, "utf8") };
  }
  console.log(`Compiling ${sourcesList.length} contract file(s): ${Object.keys(sources).join(", ")} …`);

  const input = JSON.stringify({
    language: "Solidity",
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // "paris" avoids the PUSH0 opcode which Polygon Amoy does not support
      evmVersion: "paris",
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode", "evm.deployedBytecode"],
        },
      },
    },
  });

  const rawOutput = compileSources(solc, input);
  const output = typeof rawOutput === "string" ? JSON.parse(rawOutput) : rawOutput;

  const errors = output.errors ?? [];
  const fatalErrors = errors.filter((e) => e.severity === "error");
  if (fatalErrors.length > 0) {
    console.error("\n✖ Compilation errors:");
    fatalErrors.forEach((e) => console.error(e.formattedMessage));
    process.exit(1);
  }
  errors
    .filter((e) => e.severity === "warning")
    .forEach((e) => console.warn("[warn]", e.formattedMessage));

  let compiled = 0;
  for (const [sourceKey, byName] of Object.entries(output.contracts ?? {})) {
    for (const [contractName, contract] of Object.entries(byName)) {
      // Skip interface-only files (no bytecode)
      const bytecodeObj = contract.evm?.bytecode?.object ?? "";
      if (!bytecodeObj) continue;

      const abi = contract.abi;
      const bytecode = "0x" + bytecodeObj;
      const deployedBytecode = "0x" + (contract.evm?.deployedBytecode?.object ?? "");

      const artifact = {
        _format: "hh-sol-artifact-1",
        contractName,
        sourceName: `contracts/${sourceKey}`,
        abi,
        bytecode,
        deployedBytecode,
        linkReferences: contract.evm?.bytecode?.linkReferences ?? {},
        deployedLinkReferences: contract.evm?.deployedBytecode?.linkReferences ?? {},
      };

      const outDir = path.join(root, "artifacts", "contracts", sourceKey);
      fs.mkdirSync(outDir, { recursive: true });
      const outFile = path.join(outDir, `${contractName}.json`);
      fs.writeFileSync(outFile, JSON.stringify(artifact, null, 2));

      const fns = abi.filter((x) => x.type === "function").map((x) => x.name);
      console.log(`\n● ${contractName} (${bytecode.length / 2 - 1} bytes)`);
      console.log(`   Output   : artifacts/contracts/${sourceKey}/${contractName}.json`);
      console.log(`   Functions: ${fns.join(", ")}`);
      compiled++;
    }
  }

  console.log(`\n✔ Compiled ${compiled} contract(s) successfully.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
