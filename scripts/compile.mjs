/**
 * compile.mjs — standalone Solidity compiler (no hardhat CLI needed)
 * Finds the solc bundled with hardhat and compiles CredentialRegistry.sol.
 * Run: node scripts/compile.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const root = path.resolve(__dirname, "..");

// ── Find solc ──────────────────────────────────────────────────────────────
// Hardhat bundles solc; try several common locations
function findSolc() {
  const candidates = [
    path.join(root, "node_modules", "solc", "index.js"),
    path.join(root, "node_modules", "hardhat", "node_modules", "solc", "index.js"),
    path.join(root, "node_modules", "@nomicfoundation", "solidity-analyzer", "node_modules", "solc", "index.js"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

async function main() {
  const solcPath = findSolc();
  if (!solcPath) {
    console.error("❌ Could not find solc in node_modules.");
    console.error("   Run: npm install   then retry.");
    process.exit(1);
  }

  console.log(`Using solc from: ${solcPath}`);
  const solcModule = require(solcPath);
  const solc = solcModule.default ?? solcModule;

  const contractPath = path.resolve(root, "contracts", "CredentialRegistry.sol");
  const source = fs.readFileSync(contractPath, "utf8");
  console.log("Compiling contracts/CredentialRegistry.sol …");

  const input = JSON.stringify({
    language: "Solidity",
    sources: {
      "CredentialRegistry.sol": { content: source },
    },
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

  const rawOutput = solc.compile(input);
  const output = JSON.parse(rawOutput);

  const errors = output.errors ?? [];
  const fatalErrors = errors.filter((e) => e.severity === "error");
  if (fatalErrors.length > 0) {
    console.error("\n❌ Compilation errors:");
    fatalErrors.forEach((e) => console.error(e.formattedMessage));
    process.exit(1);
  }
  errors
    .filter((e) => e.severity === "warning")
    .forEach((e) => console.warn("[warn]", e.formattedMessage));

  const contract =
    output.contracts?.["CredentialRegistry.sol"]?.["CredentialRegistry"];
  if (!contract) {
    console.error("❌ Contract not found in compiler output.");
    process.exit(1);
  }

  const abi = contract.abi;
  const bytecode = "0x" + contract.evm.bytecode.object;
  const deployedBytecode = "0x" + contract.evm.deployedBytecode.object;

  const artifact = {
    _format: "hh-sol-artifact-1",
    contractName: "CredentialRegistry",
    sourceName: "contracts/CredentialRegistry.sol",
    abi,
    bytecode,
    deployedBytecode,
    linkReferences: {},
    deployedLinkReferences: {},
  };

  const outDir = path.join(root, "artifacts", "contracts", "CredentialRegistry.sol");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "CredentialRegistry.json");
  fs.writeFileSync(outFile, JSON.stringify(artifact, null, 2));

  const fns = abi.filter((x) => x.type === "function").map((x) => x.name);
  console.log(`\n✅ Compiled successfully!`);
  console.log(`   Output   : artifacts/contracts/CredentialRegistry.sol/CredentialRegistry.json`);
  console.log(`   Functions: ${fns.join(", ")}`);
  console.log(`   Bytecode : ${bytecode.length / 2 - 1} bytes\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
