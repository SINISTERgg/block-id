/**
 * compute-test-vectors.mjs
 *
 * Computes cryptographic test vectors using circomlibjs Poseidon and updates
 * src/lib/zkp.integration.test.ts automatically.
 *
 * Vectors computed:
 *  1. holderCommitment = Poseidon([fieldFromString(HOLDER_SECRET)])
 *  2. MERKLE_LEAF = Poseidon([0x1234])
 *  3. MERKLE_ROOT = 20-level Poseidon tree with single leaf and zero siblings
 *
 * Usage:
 *   node scripts/compute-test-vectors.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const { buildPoseidon } = require("circomlibjs");
const { keccak256, toUtf8Bytes } = require("ethers");

const SNARK_SCALAR_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

const HOLDER_SECRET = "holder-secret-please-use-crypto-random-in-production";

async function main() {
  console.log("━".repeat(60));
  console.log("  Computing BlockID Cryptographic Test Vectors");
  console.log("━".repeat(60));

  const poseidon = await buildPoseidon();

  // 1. Holder commitment
  const secretField = BigInt(keccak256(toUtf8Bytes(HOLDER_SECRET))) % SNARK_SCALAR_FIELD;
  const holderCommitment = poseidon.F.toString(poseidon([secretField]));
  console.log(`\n✔ HOLDER_SECRET:          "${HOLDER_SECRET}"`);
  console.log(`✔ secretField:            ${secretField.toString()}`);
  console.log(`✔ HOLDER_COMMITMENT_FIELD: "${holderCommitment}"`);

  // 2. Merkle Leaf & Root (depth 20, single leaf at index 0, zero siblings)
  const issuerDidField = BigInt("0x1234");
  const merkleLeaf = poseidon.F.toString(poseidon([issuerDidField]));
  console.log(`\n✔ MERKLE_LEAF (issuer):   "${merkleLeaf}"`);

  let currentHash = BigInt(merkleLeaf);
  for (let i = 0; i < 20; i++) {
    currentHash = BigInt(poseidon.F.toString(poseidon([currentHash, 0n])));
  }
  const merkleRoot = currentHash.toString();
  console.log(`✔ MERKLE_ROOT (depth=20): "${merkleRoot}"`);

  // 3. Update src/lib/zkp.integration.test.ts
  const testFilePath = path.join(root, "src", "lib", "zkp.integration.test.ts");
  if (fs.existsSync(testFilePath)) {
    let content = fs.readFileSync(testFilePath, "utf8");

    let updated = false;

    if (content.includes("TODO_REPLACE_WITH_CIRCOMLIBJS_POSEIDON_OF_SECRET")) {
      content = content.replace("TODO_REPLACE_WITH_CIRCOMLIBJS_POSEIDON_OF_SECRET", holderCommitment);
      updated = true;
    }

    if (content.includes("TODO_POSEIDON_OF_ISSUER_DID")) {
      content = content.replace("TODO_POSEIDON_OF_ISSUER_DID", merkleLeaf);
      updated = true;
    }

    if (content.includes("TODO_ROOT_OF_TRUSTED_ISSUER_TREE")) {
      content = content.replace("TODO_ROOT_OF_TRUSTED_ISSUER_TREE", merkleRoot);
      updated = true;
    }

    if (updated) {
      fs.writeFileSync(testFilePath, content, "utf8");
      console.log(`\n✅ Updated placeholders in: src/lib/zkp.integration.test.ts`);
    } else {
      console.log(`\nℹ Placeholders in src/lib/zkp.integration.test.ts were already filled.`);
    }
  }

  console.log("\n" + "═".repeat(60));
  console.log("Ready for integration testing: $env:SKIP_ZK_INTEGRATION=\"0\"; npm test");
  console.log("═".repeat(60) + "\n");
}

main().catch((err) => {
  console.error("Error computing vectors:", err);
  process.exit(1);
});
