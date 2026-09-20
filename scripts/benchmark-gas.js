/**
 * benchmark-gas.js
 *
 * Automated gas consumption benchmark for all BLOCKID smart contracts on a
 * Hardhat local node. Measures exact gasUsed from transaction receipts.
 *
 * Operations benchmarked:
 *   CredentialRegistry:
 *     1. anchorCredential (single hash)
 *     2. anchorCredentialBatch (N=10, 25, 50, 100)
 *     3. revokeCredential
 *     4. getCredentialStatus (estimate)
 *   SoulboundCredential (EIP-5192):
 *     5. mint (single SBT)
 *     6. revoke (SBT revocation)
 *   SmartWalletRegistry (ERC-4337):
 *     7. createSmartWallet (deploy a new SimpleAccount via CREATE2 factory)
 *
 * Output: data/raw-gas-benchmarks.json
 *
 * Usage:
 *   npx hardhat run scripts/benchmark-gas.js
 */

import hre from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "data");
const outFile = path.join(outDir, "raw-gas-benchmarks.json");

// ── Helpers ───────────────────────────────────────────────────────────────────

async function measureGas(txPromise) {
  const tx = await txPromise;
  const receipt = await tx.wait();
  return Number(receipt.gasUsed);
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = Math.round(samples.reduce((s, v) => s + v, 0) / samples.length);
  const median = sorted[Math.floor(sorted.length / 2)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  return { mean, median, min, max, p95, samples };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("━".repeat(60));
  console.log("  BLOCKID Gas Benchmark — Hardhat Local Node");
  console.log("━".repeat(60));

  // Hardhat v3 network connection
  const connection = await hre.network.connect();
  const { ethers } = connection;
  if (!ethers) {
    throw new Error("connection.ethers is not defined. Ensure @nomicfoundation/hardhat-ethers is loaded.");
  }

  const [deployer, issuer, holder] = await ethers.getSigners();

  console.log("  Deployer:", deployer.address);
  console.log("  Issuer:  ", issuer.address);
  console.log("  Holder:  ", holder.address);

  const results = { benchmarkedAt: new Date().toISOString(), network: "hardhat-local", operations: {} };

  // ── 1. CredentialRegistry ──────────────────────────────────────────────────
  console.log("\n■ Deploying CredentialRegistry...");
  const RegistryFactory = await ethers.getContractFactory("CredentialRegistry", deployer);
  const registry = await RegistryFactory.deploy();
  await registry.waitForDeployment();
  console.log("  Deployed at:", await registry.getAddress());
  results.operations.credentialRegistry = {};

  // 1a. Single anchor (measured 12 times, first 2 are warm-up)
  console.log("  Benchmarking anchorCredential (single)...");
  const singleGas = [];
  for (let i = 0; i < 12; i++) {
    const hash = ethers.zeroPadValue(ethers.id(`bench-single-${i}`), 32);
    const gas = await measureGas(registry.anchorCredential(hash));
    if (i >= 2) singleGas.push(gas);
    process.stdout.write(`    ${gas.toLocaleString()} gas\n`);
  }
  results.operations.credentialRegistry.anchorCredential = stats(singleGas);

  // 1b. Batch anchor — N = 10, 25, 50, 100
  console.log("  Benchmarking anchorCredentialBatch...");
  const batchResults = {};
  for (const batchSize of [10, 25, 50, 100]) {
    try {
      const hashes = Array.from({ length: batchSize }, (_, i) =>
        ethers.zeroPadValue(ethers.id(`bench-batch-n${batchSize}-${i}`), 32)
      );
      const gas = await measureGas(registry.anchorCredentialBatch(hashes));
      const gasPerItem = Math.round(gas / batchSize);
      console.log(`    N=${batchSize}: ${gas.toLocaleString()} gas total, ${gasPerItem.toLocaleString()} gas/item`);
      batchResults[`n${batchSize}`] = { totalGas: gas, gasPerItem, batchSize };
    } catch (e) {
      console.warn(`    N=${batchSize}: ⚠ skipped — ${e.message?.slice(0, 80)}`);
      batchResults[`n${batchSize}`] = { note: `Exceeds block gas limit: ${e.message?.slice(0, 120)}` };
    }
  }
  results.operations.credentialRegistry.anchorCredentialBatch = batchResults;

  // 1c. Revocation
  console.log("  Benchmarking revokeCredential...");
  const revokeGas = [];
  for (let i = 0; i < 8; i++) {
    const hash = ethers.zeroPadValue(ethers.id(`bench-revoke-${i}`), 32);
    await (await registry.anchorCredential(hash)).wait();
    const gas = await measureGas(registry.revokeCredential(hash));
    if (i >= 1) revokeGas.push(gas);
    process.stdout.write(`    ${gas.toLocaleString()} gas\n`);
  }
  results.operations.credentialRegistry.revokeCredential = stats(revokeGas);

  // 1d. getCredentialStatus (view — estimated)
  const testHash = ethers.zeroPadValue(ethers.id("view-test"), 32);
  await (await registry.anchorCredential(testHash)).wait();
  const statusGasEstimate = Number(await registry.getCredentialStatus.estimateGas(testHash));
  results.operations.credentialRegistry.getCredentialStatus = { estimatedGas: statusGasEstimate, note: "view function — free to call off-chain" };
  console.log(`  getCredentialStatus estimate: ${statusGasEstimate.toLocaleString()} gas`);

  // ── 2. SoulboundCredential (EIP-5192) ─────────────────────────────────────
  console.log("\n■ Deploying SoulboundCredential...");
  const SBTFactory = await ethers.getContractFactory("SoulboundCredential", deployer);
  const sbt = await SBTFactory.deploy("BLOCKID Soulbound", "BIDSBT", "ipfs://");
  await sbt.waitForDeployment();
  console.log("  Deployed at:", await sbt.getAddress());
  results.operations.soulboundCredential = {};

  // 2a. Minting SBT
  console.log("  Benchmarking mintSoulbound...");
  const mintGas = [];
  for (let i = 0; i < 8; i++) {
    const credHash = ethers.id(`sbt-mint-token-${i}`);
    const gas = await measureGas(sbt.mint(holder.address, credHash));
    if (i >= 1) mintGas.push(gas);
    process.stdout.write(`    ${gas.toLocaleString()} gas\n`);
  }
  results.operations.soulboundCredential.mint = stats(mintGas);

  // 2b. Revoking SBT
  console.log("  Benchmarking revokeBadge (SBT revoke)...");
  const revokeGasSBT = [];
  for (let i = 0; i < 5; i++) {
    const credHash = ethers.id(`sbt-revoke-token-${i}`);
    const mintTx = await sbt.mint(holder.address, credHash);
    const mintReceipt = await mintTx.wait();
    // Pull tokenId from the Minted(tokenId, holder, credentialHash, issuedAt) event
    const mintedEvent = mintReceipt.logs
      .map((l) => { try { return sbt.interface.parseLog(l); } catch { return null; } })
      .find((e) => e?.name === "Minted");
    const tokenId = mintedEvent ? mintedEvent.args[0] : BigInt(i + 9);
    const gas = await measureGas(sbt.revoke(tokenId));
    revokeGasSBT.push(Number(gas));
    process.stdout.write(`    ${gas.toLocaleString()} gas (tokenId=${tokenId})\n`);
  }
  results.operations.soulboundCredential.revoke = stats(revokeGasSBT);

  // ── 3. SmartWalletRegistry (ERC-4337) ─────────────────────────────────────
  console.log("\n■ Deploying SmartWalletRegistry...");
  const ENTRY_POINT = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
  try {
    const WalletFactory = await ethers.getContractFactory("SmartWalletRegistry", deployer);
    const walletRegistry = await WalletFactory.deploy(ENTRY_POINT);
    await walletRegistry.waitForDeployment();
    console.log("  Deployed at:", await walletRegistry.getAddress());
    results.operations.smartWalletRegistry = {};

    // 3a. createAccount — each call from a fresh signer (function is per msg.sender)
    console.log("  Benchmarking createAccount...");
    const walletGas = [];
    const allSigners = await ethers.getSigners();
    // Use signers 3-8 so each gets their own fresh account
    const walletSigners = allSigners.slice(3, 9);
    for (let i = 0; i < walletSigners.length; i++) {
      const salt = ethers.id(`wallet-salt-${i}`);
      const gas = await measureGas(walletRegistry.connect(walletSigners[i]).createAccount(salt));
      walletGas.push(gas);
      process.stdout.write(`    ${gas.toLocaleString()} gas\n`);
    }
    results.operations.smartWalletRegistry.createAccount = stats(walletGas);
  } catch (e) {
    console.warn("  ⚠ SmartWalletRegistry benchmark skipped:", e.message);
    results.operations.smartWalletRegistry = { note: e.message };
  }

  // ── 4. ZKPVerifier gas analysis ───────────────────────────────────────────
  // Signal layouts (post SHA-256 ‖ Poseidon split-field + holder binding redesign):
  //   age-verify        : 9 signals [ts, minAge, scope, challenge, vcFpHi, vcFpLo, holderCommitment, vcCommitment, nullifier]
  //   attribute-range   : 9 signals [minVal, maxVal, scope, challenge, vcFpHi, vcFpLo, holderCommitment, vcCommitment, nullifier]
  //   issuer-membership : 8 signals [root, scope, challenge, vcFpHi, vcFpLo, holderCommitment, vcCommitment, nullifier]
  //
  // Cost breakdown on EVM (Polygon Amoy / Ethereum):
  //   • EIP-197 pairing check (4 pairs at address 0x08): 45,000 + 4 × 34,000 = 181,000 gas
  //   • EIP-196 scalar muls (address 0x07): 9 × 6,000 = 54,000 gas (8 × 6,000 = 48,000 gas for issuer)
  //   • G1 point additions (address 0x06): 9 × 150 = 1,350 gas
  //   • Replay nullifier storage (SSTORE 0 → 1): 20,000 gas (verifyProof only)
  //   • Fingerprint reconstruction (hi << 128 | lo) + registry isValid check: ~2,800 gas
  results.operations.zkpVerifier = {
    checkProof_view: {
      estimatedGas_9signals: 236500, // pairing (181k) + IC mul/add (55.5k)
      estimatedGas_8signals: 230500, // pairing (181k) + IC mul/add (49.5k)
      source: "EIP-196/197 precompile arithmetic (addresses 0x06, 0x07, 0x08)",
      note: "View-only checkProof without state write",
    },
    verifyProof_transaction: {
      estimatedGas_9signals: 260000, // 236.5k + 20k nullifier burn + registry check + event
      estimatedGas_8signals: 254000,
      source: "checkProof + SSTORE nullifier write + CredentialRegistry.isValid",
      signalLayouts: {
        ageVerify:        "[referenceTimestamp, minAgeSeconds, scope, challenge, vcFingerprintHi, vcFingerprintLo, holderCommitment, vcCommitment, nullifier] (9)",
        attributeRange:   "[minValue, maxValue, scope, challenge, vcFingerprintHi, vcFingerprintLo, holderCommitment, vcCommitment, nullifier] (9)",
        issuerMembership: "[root, scope, challenge, vcFingerprintHi, vcFingerprintLo, holderCommitment, vcCommitment, nullifier] (8)",
      },
    },
  };

  // ── Write results ──────────────────────────────────────────────────────────
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));

  console.log("\n" + "═".repeat(60));
  console.log("✅ Gas benchmark complete.");
  console.log(`   Results: ${outFile}`);
  console.log("═".repeat(60) + "\n");
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
