/**
 * reconcile-sbt.js — backfill `credentials.sbt_token_id` from the chain.
 *
 * The mint path used to fail for every issuance, so no token id was ever
 * persisted. Any credential that *did* get a badge on chain (minted manually,
 * or by a build where the hash prefix happened to line up) is therefore
 * invisible to the holder portal and to every verifier SBT read path.
 *
 * This walks the credentials table, asks the soulbound contract for the token
 * id behind each `credential_hash`, and writes back what it finds. It is
 * idempotent and safe to re-run.
 *
 * Usage:
 *   node scripts/reconcile-sbt.js                    # dry run, prints a report
 *   node scripts/reconcile-sbt.js --write            # actually persist
 *   node scripts/reconcile-sbt.js --write --limit 50
 *   node scripts/reconcile-sbt.js --write --id <uuid>
 */
import "dotenv/config";
import { ethers } from "ethers";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const NETWORKS = {
  sepolia: {
    url: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
    chainId: 11155111,
  },
  localhost: { url: "http://127.0.0.1:8545", chainId: 31337 },
};

const ZERO = "0x0000000000000000000000000000000000000000";
const SBT_ABI = [
  "function tokenByCredentialHash(bytes32 credentialHash) external view returns (uint256)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function getCredential(uint256 tokenId) external view returns (bytes32 credentialHash, address holder, uint64 issuedAt, bool revoked)",
  "function totalSupply() external view returns (uint256)",
];

/** Bare 64-char hex (as stored) → bytes32, tolerant of a missing 0x prefix. */
function toBytes32(hash) {
  const body = String(hash).trim().replace(/^0[xX]/, "");
  if (!/^[0-9a-fA-F]+$/.test(body) || body.length > 64) {
    throw new Error(`not a valid hex hash: ${hash}`);
  }
  return "0x" + body.toLowerCase().padStart(64, "0");
}

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

async function main() {
  const networkName = arg("network", "sepolia");
  const net = NETWORKS[networkName];
  if (!net) {
    console.error(`Unknown network "${networkName}". Try: ${Object.keys(NETWORKS).join(", ")}`);
    process.exit(1);
  }

  const contractAddress = arg("contract", process.env.VITE_SOULBOUND_CREDENTIAL_ADDRESS);
  if (!contractAddress || contractAddress === ZERO) {
    console.error("No soulbound contract address. Pass --contract 0x… or set VITE_SOULBOUND_CREDENTIAL_ADDRESS.");
    process.exit(1);
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const provider = new ethers.JsonRpcProvider(net.url, net.chainId);
  const sbt = new ethers.Contract(contractAddress, SBT_ABI, provider);

  console.log("SBT reconciliation");
  console.log("=".repeat(70));
  console.log(`network    ${networkName} (chainId ${net.chainId})`);
  console.log(`contract   ${contractAddress}`);
  console.log(`supply     ${await sbt.totalSupply()}`);
  console.log(`mode       ${hasFlag("write") ? "WRITE" : "DRY RUN (pass --write to persist)"}`);
  console.log("=".repeat(70));

  // Only credentials that were anchored are worth checking.
  let query = supabase
    .from("credentials")
    .select("id, credential_hash, holder_did, blockchain_anchor, sbt_token_id, sbt_holder_address, status")
    .not("credential_hash", "is", null);

  const onlyId = arg("id", null);
  if (onlyId) {
    query = query.eq("id", onlyId);
  } else {
    const limit = Number(arg("limit", "500"));
    query = query.order("issued_at", { ascending: false }).limit(limit);
  }

  const { data: credentials, error } = await query;
  if (error) {
    console.error("Failed to read credentials:", error.message);
    process.exit(1);
  }
  console.log(`\nscanning ${credentials.length} credential(s)…\n`);

  const report = {
    backfilled: [],
    alreadyRecorded: [],
    noBadge: 0,
    mismatched: [],
    failed: [],
  };

  for (const cred of credentials) {
    let tokenId = 0n;
    try {
      tokenId = await sbt.tokenByCredentialHash(toBytes32(cred.credential_hash));
    } catch (err) {
      report.failed.push({ id: cred.id, error: err.shortMessage ?? err.message });
      continue;
    }

    if (tokenId === 0n) {
      report.noBadge++;
      continue;
    }

    const id = Number(tokenId);
    const existing = cred.sbt_token_id === null || cred.sbt_token_id === undefined ? null : Number(cred.sbt_token_id);

    if (existing === id) {
      report.alreadyRecorded.push(id);
      continue;
    }

    // Where does the badge actually live? Flag holder mismatches loudly —
    // these are the records where the badge landed on the wrong wallet.
    let holder = null;
    let onChainHolder = null;
    try {
      onChainHolder = await sbt.ownerOf(id);
      const tuple = await sbt.getCredential(id);
      holder = tuple.holder;
    } catch {
      /* burned token — the lookup above already returned a live id */
    }

    const row = {
      credential_id: cred.id,
      credential_hash: cred.credential_hash,
      token_id: id,
      previous_token_id: existing,
      on_chain_holder: onChainHolder,
      holder_did: cred.holder_did,
    };
    if (existing !== null) report.mismatched.push(row);
    else report.backfilled.push(row);
  }

  // ── Report ────────────────────────────────────────────────────────────────
  console.log(`badges found on chain but not recorded : ${report.backfilled.length}`);
  console.log(`already recorded correctly             : ${report.alreadyRecorded.length}`);
  console.log(`recorded id differs from chain         : ${report.mismatched.length}`);
  console.log(`no badge on chain                      : ${report.noBadge}`);
  console.log(`lookup errors                          : ${report.failed.length}`);

  if (report.backfilled.length) {
    console.log("\n── Missing token ids ──────────────────────────────────────────");
    for (const r of report.backfilled) {
      console.log(`  ${r.credential_id}  token #${r.token_id}  holder ${r.on_chain_holder}`);
    }
  }

  if (report.mismatched.length) {
    console.log("\n── Token id mismatches (chain wins) ───────────────────────────");
    for (const r of report.mismatched) {
      console.log(
        `  ${r.credential_id}  db=${r.previous_token_id} chain=${r.token_id}  holder ${r.on_chain_holder}`
      );
    }
  }

  // Holder mismatch: the badge is on-chain but not on the holder's DID address.
  const wrongHolder = [...report.backfilled, ...report.mismatched].filter((r) => {
    const didAddr = /0x[a-fA-F0-9]{40}/.exec(r.holder_did ?? "")?.[0];
    return didAddr && r.on_chain_holder && didAddr.toLowerCase() !== r.on_chain_holder.toLowerCase();
  });
  if (wrongHolder.length) {
    console.log("\n!! Badge is NOT on the holder's DID address ──────────────────────");
    for (const r of wrongHolder) {
      console.log(`  ${r.credential_id}  on-chain ${r.on_chain_holder}  did ${r.holder_did}`);
      console.log("    The badge cannot be moved — the holder must be re-issued the credential.");
    }
  }

  if (report.failed.length) {
    console.log("\n── Lookup errors ──────────────────────────────────────────────");
    for (const f of report.failed.slice(0, 10)) console.log(`  ${f.id}: ${f.error}`);
  }

  // ── Persist ───────────────────────────────────────────────────────────────
  const toWrite = [...report.backfilled, ...report.mismatched];
  if (!hasFlag("write")) {
    console.log(`\nDry run — ${toWrite.length} row(s) would be written. Re-run with --write to apply.`);
    return;
  }
  if (toWrite.length === 0) {
    console.log("\nNothing to write.");
    return;
  }

  console.log(`\nWriting ${toWrite.length} row(s)…`);
  let written = 0;
  const failures = [];
  for (const r of toWrite) {
    const { error: rpcError } = await supabase.rpc("record_sbt_mint", {
      p_credential_id: r.credential_id,
      p_token_id: r.token_id,
      p_tx_hash: null,
      p_holder_address: r.on_chain_holder,
      p_status: "minted",
    });
    if (rpcError) failures.push({ id: r.credential_id, error: rpcError.message });
    else written++;
  }

  console.log(`  written   ${written}`);
  console.log(`  failed    ${failures.length}`);
  for (const f of failures.slice(0, 10)) console.log(`    ${f.id}: ${f.error}`);

  console.log("\n" + "=".repeat(70));
  console.log("Reconciliation complete.");
  console.log("=".repeat(70));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
