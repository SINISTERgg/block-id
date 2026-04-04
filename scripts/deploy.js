import "dotenv/config";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const NETWORKS = {
  amoy: {
    url: process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
    chainId: 80002
  },
  localhost: {
    url: "http://127.0.0.1:8545",
    chainId: 31337
  }
};

/**
 * Auto-update the project .env file with the new contract address.
 * Patches both VITE_CREDENTIAL_REGISTRY_ADDRESS and CREDENTIAL_REGISTRY_ADDRESS.
 */
function updateEnvFile(address) {
  const envPath = path.resolve(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) {
    console.warn("⚠  .env file not found — skipping auto-update. Set manually:");
    console.warn(`   VITE_CREDENTIAL_REGISTRY_ADDRESS=${address}`);
    console.warn(`   CREDENTIAL_REGISTRY_ADDRESS=${address}`);
    return;
  }

  let envContent = fs.readFileSync(envPath, "utf8");
  const keys = ["VITE_CREDENTIAL_REGISTRY_ADDRESS", "CREDENTIAL_REGISTRY_ADDRESS"];

  for (const key of keys) {
    const regex = new RegExp(`^(${key}\\s*=).*$`, "m");
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `$1${address}`);
    } else {
      // Append if not present
      envContent += `\n${key}=${address}`;
    }
  }

  fs.writeFileSync(envPath, envContent, "utf8");
  console.log(`✅ .env updated: VITE_CREDENTIAL_REGISTRY_ADDRESS=${address}`);
}

async function main() {
  const networkArgIdx = process.argv.findIndex(a => a === "--network");
  const networkName = networkArgIdx !== -1 ? process.argv[networkArgIdx + 1] : "amoy";
  const network = NETWORKS[networkName] || NETWORKS.amoy;

  console.log(`Deploying CredentialRegistry to ${networkName} (chainId: ${network.chainId})...`);

  const provider = new ethers.JsonRpcProvider(network.url, network.chainId);
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  
  if (!privateKey) {
    console.error("DEPLOYER_PRIVATE_KEY is missing in .env");
    process.exit(1);
  }

  const wallet = new ethers.Wallet(privateKey, provider);
  console.log(`Deployer: ${wallet.address}`);
  
  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance: ${ethers.formatEther(balance)} MATIC`);

  if (balance === 0n && networkName !== "localhost") {
    console.error("❌ Wallet has 0 MATIC. Get free testnet MATIC at: https://faucet.polygon.technology");
    process.exit(1);
  }

  // Path to artifacts
  const artifactPath = path.resolve(__dirname, "../artifacts/contracts/CredentialRegistry.sol/CredentialRegistry.json");
  if (!fs.existsSync(artifactPath)) {
    console.error("Artifact not found! Run 'npx hardhat compile' first.");
    process.exit(1);
  }
  
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

  console.log("Deploying contract...");

  // Dynamic gas estimation + 20% buffer (avoids over-reserving MATIC)
  const feeData = await provider.getFeeData();
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || ethers.parseUnits("30", "gwei");
  const maxFeePerGas = feeData.maxFeePerGas || (maxPriorityFeePerGas * 2n);

  // Estimate actual gas needed, add 20% safety margin
  const deployTx = await factory.getDeployTransaction({
    maxFeePerGas,
    maxPriorityFeePerGas
  });
  const estimatedGas = await provider.estimateGas({ ...deployTx, from: wallet.address });
  const gasLimit = estimatedGas * 120n / 100n;

  console.log(`Estimated Gas: ${estimatedGas.toString()} (limit: ${gasLimit.toString()})`);
  console.log(`Max Fee: ${ethers.formatUnits(maxFeePerGas, "gwei")} Gwei`);
  console.log(`Max Priority Fee: ${ethers.formatUnits(maxPriorityFeePerGas, "gwei")} Gwei`);
  console.log(`Estimated cost: ${ethers.formatEther(maxFeePerGas * gasLimit)} MATIC`);

  try {
    const contract = await factory.deploy({
      gasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas
    });

    console.log(`Transaction hash: ${contract.deploymentTransaction()?.hash}`);
    
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    
    console.log(`\n✅ CredentialRegistry deployed to: ${address}`);

    // Save deployment info
    const deploymentsDir = path.resolve(__dirname, "..", "deployments");
    if (!fs.existsSync(deploymentsDir)) {
      fs.mkdirSync(deploymentsDir, { recursive: true });
    }

    const deploymentInfo = {
      network: networkName,
      chainId: network.chainId,
      contract: "CredentialRegistry",
      address,
      txHash: contract.deploymentTransaction()?.hash,
      deployer: wallet.address,
      timestamp: new Date().toISOString(),
      version: "v2", // batch + timestamps
    };

    const deploymentsFile = path.join(deploymentsDir, `${networkName}.json`);
    fs.writeFileSync(deploymentsFile, JSON.stringify(deploymentInfo, null, 2));
    
    console.log(`Deployment info saved to deployments/${networkName}.json`);

    // ── Auto-update .env ───────────────────────────────────────────────────
    updateEnvFile(address);

    console.log("\n─── Next steps ───────────────────────────────────────────────────────");
    console.log("1. Restart the dev server: npm run dev");
    console.log("2. Set the contract address as a Supabase secret:");
    console.log(`   npx supabase secrets set CREDENTIAL_REGISTRY_ADDRESS=${address}`);
    console.log("3. Redeploy edge functions:");
    console.log("   npx supabase functions deploy anchor-credential");
    console.log("   npx supabase functions deploy anchor-credential-server");
    console.log("──────────────────────────────────────────────────────────────────────\n");

  } catch (err) {
    console.error("\n❌ Deployment failed during transaction:");
    console.error(err);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment script error:", error);
    process.exit(1);
  });
