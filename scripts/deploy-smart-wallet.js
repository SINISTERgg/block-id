/**
 * deploy-smart-wallet.js — Deploy SmartWalletRegistry.sol to Sepolia (or other networks).
 *
 * Usage:
 *   node scripts/deploy-smart-wallet.js                    # deploys to Sepolia
 *   node scripts/deploy-smart-wallet.js --network sepolia
 *   node scripts/deploy-smart-wallet.js --network localhost
 *
 * The constructor requires one argument: the ERC-4337 EntryPoint contract address.
 * For Sepolia the canonical EntryPoint v0.6 is: 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789
 * Override via ENTRY_POINT_ADDRESS in .env if you need a different version/network.
 *
 * After deployment, this script automatically updates .env with:
 *   VITE_SMART_WALLET_REGISTRY_ADDRESS=0x...
 */
import "dotenv/config";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Network configs ──────────────────────────────────────────────────────────

const NETWORKS = {
  sepolia: {
    url: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
    chainId: 11155111,
    currency: "ETH",
    // Canonical ERC-4337 EntryPoint v0.6 on Sepolia
    defaultEntryPoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
  },
  localhost: {
    url: "http://127.0.0.1:8545",
    chainId: 31337,
    currency: "ETH",
    // For local testing you'll need to deploy a mock EntryPoint or use this stub
    defaultEntryPoint: process.env.ENTRY_POINT_ADDRESS || "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
  },
};

// ─── .env updater ─────────────────────────────────────────────────────────────

function updateEnvFile(address) {
  const envPath = path.resolve(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) {
    console.warn("⚠  .env file not found — set manually:");
    console.warn(`   VITE_SMART_WALLET_REGISTRY_ADDRESS=${address}`);
    return;
  }

  let envContent = fs.readFileSync(envPath, "utf8");
  const key = "VITE_SMART_WALLET_REGISTRY_ADDRESS";
  const regex = new RegExp(`^(${key}\\s*=).*$`, "m");

  if (regex.test(envContent)) {
    envContent = envContent.replace(regex, `$1${address}`);
  } else {
    envContent += `\n${key}=${address}`;
  }

  fs.writeFileSync(envPath, envContent, "utf8");
  console.log(`✅ .env updated: VITE_SMART_WALLET_REGISTRY_ADDRESS=${address}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const networkArgIdx = process.argv.findIndex((a) => a === "--network");
  const networkName = networkArgIdx !== -1 ? process.argv[networkArgIdx + 1] : "sepolia";
  const network = NETWORKS[networkName] || NETWORKS.sepolia;

  // EntryPoint: env override → network default
  const entryPoint = process.env.ENTRY_POINT_ADDRESS || network.defaultEntryPoint;

  console.log(`\nDeploying SmartWalletRegistry to ${networkName} (chainId: ${network.chainId})...`);
  console.log(`EntryPoint: ${entryPoint}`);

  const provider = new ethers.JsonRpcProvider(network.url, network.chainId);
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;

  if (!privateKey) {
    console.error("❌ DEPLOYER_PRIVATE_KEY is missing in .env");
    process.exit(1);
  }

  const wallet = new ethers.Wallet(privateKey, provider);
  console.log(`Deployer: ${wallet.address}`);

  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ${network.currency}`);

  if (balance === 0n && networkName !== "localhost") {
    console.error(`❌ Wallet has 0 ${network.currency}. Get testnet funds at: https://sepoliafaucet.com`);
    process.exit(1);
  }

  // Load compiled artifact
  const artifactPath = path.resolve(
    __dirname,
    "../artifacts/contracts/SmartWalletRegistry.sol/SmartWalletRegistry.json"
  );

  if (!fs.existsSync(artifactPath)) {
    console.error("❌ Artifact not found! Run 'npx hardhat compile' first.");
    console.error(`   Expected: ${artifactPath}`);
    process.exit(1);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

  console.log("\nEstimating gas...");
  const feeData = await provider.getFeeData();
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || ethers.parseUnits("2", "gwei");
  const maxFeePerGas = feeData.maxFeePerGas || maxPriorityFeePerGas * 2n;

  // Constructor arg: address _entryPoint
  const deployTx = await factory.getDeployTransaction(entryPoint, { maxFeePerGas, maxPriorityFeePerGas });
  const estimatedGas = await provider.estimateGas({ ...deployTx, from: wallet.address });
  const gasLimit = (estimatedGas * 120n) / 100n;

  console.log(`Estimated gas: ${estimatedGas.toString()} (limit: ${gasLimit.toString()})`);
  console.log(`Max fee: ${ethers.formatUnits(maxFeePerGas, "gwei")} Gwei`);
  console.log(`Estimated cost: ${ethers.formatEther(maxFeePerGas * gasLimit)} ${network.currency}`);

  try {
    console.log("\nDeploying contract...");
    const contract = await factory.deploy(entryPoint, { gasLimit, maxFeePerGas, maxPriorityFeePerGas });

    console.log(`Transaction hash: ${contract.deploymentTransaction()?.hash}`);
    console.log("Waiting for confirmation...");
    await contract.waitForDeployment();

    const address = await contract.getAddress();

    // Save deployment info
    const deploymentsDir = path.resolve(__dirname, "..", "deployments");
    fs.mkdirSync(deploymentsDir, { recursive: true });
    const deploymentsFile = path.join(deploymentsDir, `${networkName}.json`);

    let existing = {};
    if (fs.existsSync(deploymentsFile)) {
      existing = JSON.parse(fs.readFileSync(deploymentsFile, "utf8"));
    }

    const deploymentInfo = {
      ...existing,
      SmartWalletRegistry: {
        address,
        entryPoint,
        txHash: contract.deploymentTransaction()?.hash,
        deployer: wallet.address,
        timestamp: new Date().toISOString(),
      },
    };

    fs.writeFileSync(deploymentsFile, JSON.stringify(deploymentInfo, null, 2));

    console.log(`\n${"─".repeat(70)}`);
    console.log(`✅ SmartWalletRegistry deployed to: ${address}`);
    console.log(`${"─".repeat(70)}`);
    console.log(`Deployment info saved to deployments/${networkName}.json`);

    updateEnvFile(address);

    console.log("\n─── Next steps ───────────────────────────────────────────────────────");
    console.log("1. Set the bundler URL in .env:");
    console.log("   Get a free key at: https://dashboard.pimlico.io → API Keys");
    console.log("   VITE_BUNDLER_URL=https://api.pimlico.io/v2/11155111/rpc?apikey=YOUR_KEY");
    console.log("2. Set VITE_CHAIN_ID=11155111 in .env (already set if using Sepolia)");
    console.log("3. Restart the dev server: npm run dev");
    console.log("──────────────────────────────────────────────────────────────────────\n");
  } catch (err) {
    console.error("\n❌ Deployment failed:");
    console.error(err);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ Script error:", err);
    process.exit(1);
  });
