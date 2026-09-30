/**
 * set-issuer.js — manage the SoulboundCredential issuer allow-list.
 *
 * `mint`, `revoke` and `burn` are all gated by the contract's `onlyIssuer`
 * modifier, which accepts an address only when it is either the contract admin
 * or has been allow-listed. The allow-list starts empty, so a freshly deployed
 * contract rejects every mint from a non-admin wallet with `NotIssuer()`.
 *
 * Usage:
 *   node scripts/set-issuer.js                              # inspect only
 *   node scripts/set-issuer.js --issuer 0xABC...            # allow-list
 *   node scripts/set-issuer.js --issuer 0xABC... --revoke   # remove
 *   node scripts/set-issuer.js --network localhost
 *
 * Must be signed by the wallet that deployed the contract (the admin).
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
  },
  localhost: { url: "http://127.0.0.1:8545", chainId: 31337 },
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** Minimal ABI — read + the single setter we need. */
const ABI = [
  "function admin() view returns (address)",
  "function isIssuer(address account) view returns (bool)",
  "function totalSupply() view returns (uint256)",
  "function setIssuer(address issuer, bool allowed)",
  "event IssuerUpdated(address indexed issuer, bool allowed)",
];

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const networkName = arg("--network") || "sepolia";
  const network = NETWORKS[networkName] || NETWORKS.sepolia;

  let address =
    arg("--address") ||
    process.env.VITE_SOULBOUND_CREDENTIAL_ADDRESS ||
    (() => {
      // Fall back to the recorded deployment so `--issuer` works without .env
      const f = path.resolve(__dirname, "..", "deployments", `sbt-${networkName}.json`);
      if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).address;
      return undefined;
    })();

  if (!address || address === ZERO_ADDRESS) {
    console.error("❌ No SBT contract address. Pass --address 0x… or set VITE_SOULBOUND_CREDENTIAL_ADDRESS.");
    process.exit(1);
  }
  if (!ethers.isAddress(address)) {
    console.error(`❌ "${address}" is not a valid address.`);
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(network.url, network.chainId);
  const contract = new ethers.Contract(address, ABI, provider);

  const admin = await contract.admin();
  const totalSupply = await contract.totalSupply();

  console.log(`\nSoulboundCredential @ ${address}  (${networkName})`);
  console.log(`  admin:       ${admin}`);
  console.log(`  totalSupply: ${totalSupply.toString()}`);

  // ── Inspect mode ───────────────────────────────────────────────────────────
  const issuerArg = arg("--issuer");
  if (!issuerArg) {
    console.log("\nRun with --issuer <address> to allow-list a wallet, or --issuer <address> --revoke to remove.");
    if (totalSupply === 0n) {
      console.log("\n⚠  totalSupply is 0 — no badge has ever been minted on this contract.");
      console.log("   A mint from a non-admin wallet will revert with NotIssuer().");
    }
    return;
  }

  if (!ethers.isAddress(issuerArg)) {
    console.error(`❌ --issuer "${issuerArg}" is not a valid address.`);
    process.exit(1);
  }
  const issuer = ethers.getAddress(issuerArg);
  const allow = !process.argv.includes("--revoke");
  const already = await contract.isIssuer(issuer);

  console.log(`  target:      ${issuer}`);
  console.log(`  isIssuer:    ${already}`);
  console.log(`  action:      ${allow ? "allow" : "revoke"}`);

  if (already === allow) {
    console.log(`\n✓ Already ${allow ? "allow-listed" : "removed"} — nothing to do.`);
    return;
  }

  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    console.error("\n❌ DEPLOYER_PRIVATE_KEY is missing in .env (needed to sign as admin).");
    process.exit(1);
  }
  const wallet = new ethers.Wallet(privateKey, provider);

  if (wallet.address !== admin) {
    console.error(`\n❌ DEPLOYER_PRIVATE_KEY is ${wallet.address}, but the contract admin is ${admin}.`);
    console.error("   setIssuer is onlyAdmin — use the admin key, or transfer admin first.");
    process.exit(1);
  }

  const balance = await provider.getBalance(wallet.address);
  if (balance === 0n) {
    console.error(`\n❌ Admin wallet has 0 ETH. Fund it from ${networkName === "sepolia" ? "https://sepoliafaucet.com" : "your local node"}.`);
    process.exit(1);
  }

  console.log(`\nSending setIssuer(${issuer}, ${allow})...`);
  try {
    const tx = await contract.connect(wallet).setIssuer(issuer, allow);
    console.log(`  tx: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`✅ ${allow ? "Allow-listed" : "Removed"} in block ${receipt.blockNumber}`);
  } catch (err) {
    console.error("\n❌ setIssuer failed:", err.shortMessage || err.message);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ Script error:", err.shortMessage || err.message);
    process.exit(1);
  });
