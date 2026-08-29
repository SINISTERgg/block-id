/**
 * deploy-sbt.js — Deploy SoulboundCredential.sol to Sepolia (or other networks).
 *
 * Usage:
 *   node scripts/deploy-sbt.js                      # deploys to Sepolia
 *   node scripts/deploy-sbt.js --network sepolia
 *   node scripts/deploy-sbt.js --network localhost   # for local Hardhat node
 *
 * After deployment, this script automatically updates .env with:
 *   VITE_SOULBOUND_CREDENTIAL_ADDRESS=0x...
 */
import "dotenv/config";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const NETWORKS = {
  sepolia: {
    url: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
    chainId: 11155111,
    currency: "ETH",
    faucet: "https://sepoliafaucet.com",
  },
  localhost: {
    url: "http://127.0.0.1:8545",
    chainId: 31337,
    currency: "ETH",
    faucet: null,
  },
};

/**
 * Auto-update .env with the new SBT contract address.
 * Patches VITE_SOULBOUND_CREDENTIAL_ADDRESS.
 */
function updateEnvFile(address) {
  const envPath = path.resolve(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) {
    console.warn("⚠  .env file not found — set manually:");
    console.warn(`   VITE_SOULBOUND_CREDENTIAL_ADDRESS=${address}`);
    return;
  }

  let envContent = fs.readFileSync(envPath, "utf8");
  const key = "VITE_SOULBOUND_CREDENTIAL_ADDRESS";
  const regex = new RegExp(`^(${key}\\s*=).*$`, "m");

  if (regex.test(envContent)) {
    envContent = envContent.replace(regex, `$1${address}`);
  } else {
    envContent += `\n${key}=${address}`;
  }

  fs.writeFileSync(envPath, envContent, "utf8");
  console.log(`✅ .env updated: VITE_SOULBOUND_CREDENTIAL_ADDRESS=${address}`);
}

async function main() {
  const networkArgIdx = process.argv.findIndex((a) => a === "--network");
  const networkName = networkArgIdx !== -1 ? process.argv[networkArgIdx + 1] : "sepolia";
  const network = NETWORKS[networkName] || NETWORKS.sepolia;

  console.log(`\nDeploying SoulboundCredential to ${networkName} (chainId: ${network.chainId})...`);

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
    console.error(
      `❌ Wallet has 0 ${network.currency}. Get free testnet ${network.currency} at: ${network.faucet}`
    );
    process.exit(1);
  }

  const artifactPath = path.resolve(
    __dirname,
    "../artifacts/contracts/SoulboundCredential.sol/SoulboundCredential.json"
  );

  if (!fs.existsSync(artifactPath)) {
    console.error("❌ Artifact not found! Run 'npx hardhat compile' first.");
    console.error(`   Expected: ${artifactPath}`);
    process.exit(1);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

  console.log("Estimating gas...");
  const feeData = await provider.getFeeData();
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || ethers.parseUnits("2", "gwei");
  const maxFeePerGas = feeData.maxFeePerGas || maxPriorityFeePerGas * 2n;

  // Constructor args: name_, symbol_, baseURI_
  const SBT_NAME    = process.env.SBT_NAME    || "BlockID Credential";
  const SBT_SYMBOL  = process.env.SBT_SYMBOL  || "BLKID";
  const SBT_BASE_URI = process.env.SBT_BASE_URI || "";

  const deployTx = await factory.getDeployTransaction(SBT_NAME, SBT_SYMBOL, SBT_BASE_URI, { maxFeePerGas, maxPriorityFeePerGas });
  const estimatedGas = await provider.estimateGas({ ...deployTx, from: wallet.address });
  const gasLimit = (estimatedGas * 120n) / 100n;

  console.log(`Estimated gas: ${estimatedGas.toString()} (limit: ${gasLimit.toString()})`);
  console.log(`Max fee: ${ethers.formatUnits(maxFeePerGas, "gwei")} Gwei`);
  console.log(`Estimated cost: ${ethers.formatEther(maxFeePerGas * gasLimit)} ${network.currency}`);

  try {
    console.log("\nDeploying contract...");
    const contract = await factory.deploy(SBT_NAME, SBT_SYMBOL, SBT_BASE_URI, { gasLimit, maxFeePerGas, maxPriorityFeePerGas });

    console.log(`Transaction hash: ${contract.deploymentTransaction()?.hash}`);
    console.log("Waiting for confirmation...");
    await contract.waitForDeployment();

    const address = await contract.getAddress();
    console.log(`\n✅ SoulboundCredential deployed to: ${address}`);

    // Save deployment info
    const deploymentsDir = path.resolve(__dirname, "..", "deployments");
    if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });

    const info = {
      network: networkName,
      chainId: network.chainId,
      contract: "SoulboundCredential",
      address,
      txHash: contract.deploymentTransaction()?.hash,
      deployer: wallet.address,
      timestamp: new Date().toISOString(),
    };

    const outFile = path.join(deploymentsDir, `sbt-${networkName}.json`);
    fs.writeFileSync(outFile, JSON.stringify(info, null, 2));
    console.log(`Deployment info saved to deployments/sbt-${networkName}.json`);

    // ── Auto-update .env ───────────────────────────────────────────────────────
    updateEnvFile(address);

    console.log("\n─── Next steps ───────────────────────────────────────────────────────");
    console.log("1. Restart the dev server: npm run dev");
    console.log("2. Issue a credential with MetaMask connected — a badge will be auto-minted.");
    console.log("3. Holders can view their badges under Wallet → Badges tab.");
    console.log(`4. Optional — Supabase secret: npx supabase secrets set VITE_SOULBOUND_CREDENTIAL_ADDRESS=${address}`);
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
