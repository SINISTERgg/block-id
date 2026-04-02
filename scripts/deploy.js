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

  // Path to artifacts
  const artifactPath = path.resolve(__dirname, "../artifacts/contracts/CredentialRegistry.sol/CredentialRegistry.json");
  if (!fs.existsSync(artifactPath)) {
    console.error("Artifact not found! Run 'npx hardhat compile' first.");
    process.exit(1);
  }
  
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

  console.log("Deploying contract...");

  // High gas limit and priority fees for Amoy
  const gasLimit = 2000000n;
  const feeData = await provider.getFeeData();
  
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || ethers.parseUnits("30", "gwei");
  const maxFeePerGas = feeData.maxFeePerGas || (maxPriorityFeePerGas * 2n);

  console.log(`Gas Limit: ${gasLimit.toString()}`);
  console.log(`Max Fee: ${ethers.formatUnits(maxFeePerGas, "gwei")} Gwei`);
  console.log(`Max Priority Fee: ${ethers.formatUnits(maxPriorityFeePerGas, "gwei")} Gwei`);

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
    };

    const deploymentsFile = path.join(deploymentsDir, `${networkName}.json`);
    fs.writeFileSync(deploymentsFile, JSON.stringify(deploymentInfo, null, 2));
    
    console.log(`Deployment info saved to deployments/${networkName}.json`);
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
