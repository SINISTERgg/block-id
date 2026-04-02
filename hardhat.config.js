import "dotenv/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import { task } from "hardhat/config";

const config = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    amoy: {
      type: "http",
      url: process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
      chainId: 80002,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY ?? "0x0000000000000000000000000000000000000000000000000000000000000000"],
    },
    polygon: {
      type: "http",
      url: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
      chainId: 137,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY ?? "0x0000000000000000000000000000000000000000000000000000000000000000"],
    },
  },
  etherscan: {
    amoy: {
      apiKey: {
        polygonAmoy: process.env.POLYGONSCAN_API_KEY || "",
      },
    },
    polygon: {
      apiKey: {
        polygon: process.env.POLYGONSCAN_API_KEY || "",
      },
    },
  },
};

task("test-contract", "Run CredentialRegistry contract tests")
  .setAction(async (_, hre) => {
    const ethers = hre.ethers;
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    const issuer1 = accounts[1];

    console.log("Deployer:", await deployer.getAddress());
    console.log("Network:", (await ethers.provider.getNetwork()).chainId);

    const CredentialRegistry = await ethers.getContractFactory("CredentialRegistry");
    const registry = await CredentialRegistry.deploy();
    await registry.waitForDeployment();
    console.log("Deployed to:", await registry.getAddress());

    console.log("\nRunning tests...\n");

    let passed = 0;
    let failed = 0;

    function check(condition, message) {
      if (condition) { console.log("  [PASS] " + message); passed++; }
      else { console.log("  [FAIL] " + message); failed++; }
    }

    const hash1 = ethers.zeroPadValue(ethers.id("test-1"), 32);
    await (await registry.connect(deployer).anchorCredential(hash1)).wait();
    const s1 = await registry.getCredentialStatus(hash1);
    check(s1[0] === true, "Credential should be anchored");
    check(s1[1] === false, "Credential should not be revoked");
    check(s1[2] === await deployer.getAddress(), "Issuer should match deployer");

    const hash2 = ethers.zeroPadValue(ethers.id("duplicate"), 32);
    await (await registry.connect(deployer).anchorCredential(hash2)).wait();
    try { await (await registry.connect(deployer).anchorCredential(hash2)).wait(); check(false, "Should have reverted on duplicate anchor"); }
    catch (e) { check(e.message.includes("already anchored"), "Should revert with 'already anchored'"); }

    const hash3 = ethers.zeroPadValue(ethers.id("revoke-test"), 32);
    await (await registry.connect(deployer).anchorCredential(hash3)).wait();
    check((await registry.getCredentialStatus(hash3))[1] === false, "Should not be revoked before");
    await (await registry.connect(deployer).revokeCredential(hash3)).wait();
    check((await registry.getCredentialStatus(hash3))[1] === true, "Should be revoked after");

    const hash4 = ethers.zeroPadValue(ethers.id("non-issuer"), 32);
    await (await registry.connect(deployer).anchorCredential(hash4)).wait();
    try { await (await registry.connect(issuer1).revokeCredential(hash4)).wait(); check(false, "Should have reverted on non-issuer revoke"); }
    catch (e) { check(e.message.includes("caller is not issuer"), "Should revert with 'caller is not issuer'"); }

    const hash5 = ethers.zeroPadValue(ethers.id("valid-cred"), 32);
    await (await registry.connect(deployer).anchorCredential(hash5)).wait();
    check(await registry.isValid(hash5) === true, "Active credential should be valid");

    const hash6 = ethers.zeroPadValue(ethers.id("revoked-valid"), 32);
    await (await registry.connect(deployer).anchorCredential(hash6)).wait();
    await (await registry.connect(deployer).revokeCredential(hash6)).wait();
    check(await registry.isValid(hash6) === false, "Revoked credential should not be valid");

    const hash7 = ethers.zeroPadValue(ethers.id("never-anchored"), 32);
    const s7 = await registry.getCredentialStatus(hash7);
    check(s7[0] === false, "Unanchored: not anchored");
    check(s7[1] === false, "Unanchored: not revoked");
    check(s7[2] === ethers.ZeroAddress, "Unanchored: zero address");
    check(s7[3] === 0, "Unanchored: block 0");

    console.log("\n" + "=".repeat(40));
    console.log("Results: " + passed + " passed, " + failed + " failed");
    console.log("=".repeat(40));

    if (failed > 0) throw new Error(failed + " tests failed");
  });

export default config;
