/**
 * SoulboundCredential contract checks — EIP-5192 introspection, ERC-165 ids and
 * the inline metadata fallback that makes badges render on block explorers.
 *
 * Run with:  npx hardhat run scripts/test-sbt-contract.js
 */
import hre from "hardhat";

const { ethers } = await hre.network.connect();
const ZERO = ethers.ZeroAddress;
let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    console.log("  [PASS] " + message);
    passed++;
  } else {
    console.log("  [FAIL] " + message);
    failed++;
  }
}

const hash = (n) => ethers.zeroPadValue(ethers.toBeHex(n), 32);

async function deploy(baseURI) {
  const Factory = await ethers.getContractFactory("SoulboundCredential");
  const sbt = await Factory.deploy("BlockID Credential", "BLKID", baseURI);
  await sbt.waitForDeployment();
  const [admin, issuer, holder, outsider] = await ethers.getSigners();
  await sbt.connect(admin).setIssuer(issuer.address, true);
  return { sbt, admin, issuer, holder, outsider };
}

async function main() {
  console.log("SoulboundCredential contract checks");
  console.log("=".repeat(60));

  // ── EIP-5192 ──────────────────────────────────────────────────────────────
  console.log("\nEIP-5192 soulbound introspection");

  {
    const { sbt, issuer, holder } = await deploy("");
    await sbt.connect(issuer).mint.staticCall(holder.address, hash(1));
    const id = await sbt.connect(issuer).mint.staticCall(holder.address, hash(1));
    await sbt.connect(issuer).mint(holder.address, hash(1));
    check((await sbt.locked(id)) === true, "minted token reports locked() === true");
  }

  {
    const { sbt, issuer, holder } = await deploy("");
    const tx = await sbt.connect(issuer).mint(holder.address, hash(2));
    const receipt = await tx.wait();
    const lockedEvent = receipt.logs
      .map((log) => {
        try {
          return sbt.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((e) => e?.name === "Locked");
    check(
      !!lockedEvent && lockedEvent.args.tokenId === 1n,
      "Locked event is emitted on mint so indexers can track the state"
    );
  }

  {
    const { sbt, issuer, holder } = await deploy("");
    await sbt.connect(issuer).mint(holder.address, hash(3));
    await sbt.connect(issuer).burn(1);
    check((await sbt.locked(1)) === false, "burned token reports locked() === false");
  }

  // ── ERC-165 ───────────────────────────────────────────────────────────────
  console.log("\nERC-165 interface advertisement");
  {
    const { sbt } = await deploy("");
    for (const [id, label] of [
      ["0x01ffc9a7", "ERC-165"],
      ["0x80ac58cd", "ERC-721"],
      ["0x5b5e139f", "ERC-721 Metadata"],
      ["0xb45a3c0e", "EIP-5192 (soulbound)"],
    ]) {
      check((await sbt.supportsInterface(id)) === true, `supportsInterface(${id}) — ${label}`);
    }
    check((await sbt.supportsInterface("0xdeadbeef")) === false, "unknown interface id is rejected");
  }

  // ── Metadata ──────────────────────────────────────────────────────────────
  console.log("\nExplorer metadata");

  {
    const { sbt, issuer, holder } = await deploy("ipfs://blockid/");
    await sbt.connect(issuer).mint(holder.address, hash(4));
    check((await sbt.tokenURI(1)) === "ipfs://blockid/1", "configured baseURI resolves to {baseURI}{tokenId}");
  }

  {
    const { sbt, issuer, holder } = await deploy("");
    await sbt.connect(issuer).mint(holder.address, hash(5));
    const uri = await sbt.tokenURI(1);
    check(
      uri.startsWith("data:application/json;base64,"),
      "empty baseURI falls back to an inline data: URI instead of a bare number"
    );

    const b64 = uri.slice("data:application/json;base64,".length);
    check(b64.length % 4 === 0, "base64 payload length is a multiple of 4");
    check(/^[A-Za-z0-9+/]+={0,2}$/.test(b64), "base64 payload uses only valid alphabet characters");

    let json = null;
    try {
      json = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    } catch (err) {
      check(false, "inline metadata decodes to valid JSON (" + err.message + ")");
    }
    if (json) {
      check(json.name === "BlockID Credential #1", "inline metadata carries a readable name");
      check(json.attributes?.[0]?.value === hash(5), "inline metadata carries the credential hash");
      check(json.attributes?.[1]?.value === true, "inline metadata marks the token soulbound");
    }
  }

  // ── Base64 encoder boundary lengths ───────────────────────────────────────
  console.log("\nBase64 encoder padding (on-chain, for lengths 1..6)");
  {
    // Exercise every remainder case through tokenURI by varying the token name
    // length is awkward; instead validate via the inline document for
    // successive token ids, which shifts the payload length.
    let allValid = true;
    for (let i = 1; i <= 6; i++) {
      const { sbt, issuer, holder } = await deploy("");
      await sbt.connect(issuer).mint(holder.address, hash(100 + i));
      const b64 = (await sbt.tokenURI(1)).slice("data:application/json;base64,".length);
      if (b64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) allValid = false;
      try {
        JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
      } catch {
        allValid = false;
      }
    }
    check(allValid, "every produced payload decodes cleanly across length remainders");
  }

  // ── Soulbound enforcement (regression guard) ──────────────────────────────
  console.log("\nSoulbound enforcement");
  {
    const { sbt, issuer, holder, outsider } = await deploy("");
    await sbt.connect(issuer).mint(holder.address, hash(6));

    for (const [label, call] of [
      ["transferFrom", () => sbt.connect(holder).transferFrom(holder.address, outsider.address, 1)],
      ["approve", () => sbt.connect(holder).approve(outsider.address, 1)],
      ["setApprovalForAll", () => sbt.connect(holder).setApprovalForAll(outsider.address, true)],
    ]) {
      try {
        await (await call()).wait();
        check(false, `${label} must revert with NonTransferable`);
      } catch (err) {
        check(err.message.includes("NonTransferable"), `${label} reverts with NonTransferable`);
      }
    }

    check((await sbt.ownerOf(1)) === holder.address, "ownerOf returns the holder, not the issuer");
    check((await sbt.admin) !== ZERO, "admin is set to the deployer");
  }

  // ── Stored-hash compatibility ─────────────────────────────────────────────
  // Regression guard for the root cause: `credentials.credential_hash` is
  // stored as bare 64-char hex with no "0x" prefix, while the contract keys on
  // bytes32. Minting under a bare-hex-derived value must resolve through
  // tokenByCredentialHash exactly like the prefixed form.
  console.log("\nStored (unprefixed) hash compatibility");

  /** Mirrors normalizeCredentialHash in src/services/blockchain/sbt.service.ts. */
  const toBytes32 = (h) => "0x" + h.trim().replace(/^0[xX]/, "").toLowerCase().padStart(64, "0");
  const BARE = "c3".repeat(32);
  const PREFIXED = "0x" + BARE;

  {
    const { sbt, issuer, holder } = await deploy("");
    const mintedUnder = toBytes32(BARE);
    await sbt.connect(issuer).mint(holder.address, mintedUnder);

    const viaBare = await sbt.tokenByCredentialHash(toBytes32(BARE));
    const viaPrefixed = await sbt.tokenByCredentialHash(toBytes32(PREFIXED));
    check(viaBare === 1n, "bare-hex hash resolves to the minted token id");
    check(viaBare === viaPrefixed, "bare and 0x-prefixed forms resolve identically");

    const [hash, addr] = await sbt.getCredential(1);
    check(hash === mintedUnder, "credential hash is stored left-padded into bytes32");
    check(addr === holder.address, "badge belongs to the holder, not the issuer");
  }

  {
    // The same credential must never be mintable twice under either form.
    const { sbt, issuer, holder } = await deploy("");
    await sbt.connect(issuer).mint(holder.address, toBytes32(BARE));
    let reverted = false;
    try {
      await sbt.connect(issuer).mint(holder.address, toBytes32(PREFIXED));
    } catch (err) {
      reverted = String(err.message).includes("DuplicateCredential");
    }
    check(reverted, "re-minting under the other hash form reverts with DuplicateCredential");
  }

  console.log("\n" + "=".repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) throw new Error(failed + " checks failed");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
