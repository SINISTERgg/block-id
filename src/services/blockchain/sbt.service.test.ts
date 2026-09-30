import { describe, it, expect, vi, beforeEach } from "vitest";
import { Interface, keccak256, toUtf8Bytes, zeroPadValue, getAddress } from "ethers";
import {
  SOULBOUND_ABI,
  addressFromDid,
  buildSbtDataUri,
  buildSbtMetadata,
  decodeMintedTokenId,
  encodeMintCalldata,
  encodeRevokeCalldata,
  isSbtConfigured,
  normalizeCredentialHash,
  reconcileBadge,
  resolveHolderAddress,
  sameCredentialHash,
  toStoredHashFormat,
} from "./sbt.service";

const { getReadProviderMock, ContractMock } = vi.hoisted(() => ({
  getReadProviderMock: vi.fn(),
  ContractMock: vi.fn(),
}));

vi.mock("./provider", () => ({ getReadProvider: (...args: unknown[]) => getReadProviderMock(...args) }));
vi.mock("ethers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ethers")>();
  // plain function so `new Contract(...)` still works and yields our stub
  const Contract = function (...args: unknown[]) {
    return ContractMock(...args);
  };
  return { ...actual, Contract };
});

const HOLDER = "0x1111111111111111111111111111111111111111";
const ISSUER = "0x2222222222222222222222222222222222222222";
const HASH32 = "0x" + "ab".repeat(32);
/** Exactly how `credentials.credential_hash` is stored — bare hex, no prefix. */
const STORED_HASH = "ab".repeat(32);

/** Mirrors the anchored address guard inside sbt.service. */
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

beforeEach(() => {
  getReadProviderMock.mockReset();
  ContractMock.mockReset();
});

describe("SOULBOUND_ABI integrity", () => {
  const iface = new Interface([...SOULBOUND_ABI]);

  // A mis-typed indexed param silently changes topic0, so a Transfer declared
  // as (uint256,uint256,uint256) parses fine against itself while never
  // matching a real ERC-721 log. Pin the canonical values.
  it("declares the canonical ERC-721 Transfer signature", () => {
    expect(iface.getEvent("Transfer")!.topicHash).toBe(
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
    );
  });

  it("declares every custom error the contract can revert with", () => {
    for (const name of [
      "NotAdmin",
      "NotIssuer",
      "ZeroAddress",
      "ZeroCredentialHash",
      "NonTransferable",
      "DuplicateCredential",
      "TokenNotFound",
      "AlreadyRevoked",
    ]) {
      expect(iface.getError(name), `missing error ${name}`).toBeTruthy();
    }
  });

  it("uses the real selectors for the errors the app branches on", () => {
    expect(iface.getError("NotIssuer")!.selector).toBe("0x54ec5063");
    expect(iface.getError("DuplicateCredential")!.selector).toBe("0x7f7af7c3");
    expect(iface.getError("ZeroCredentialHash")!.selector).toBe("0xb0e8ec2a");
  });

  it("exposes the authorization views needed to explain a NotIssuer revert", () => {
    expect(iface.getFunction("admin")).toBeTruthy();
    expect(iface.getFunction("isIssuer")).toBeTruthy();
  });
});

describe("isSbtConfigured", () => {
  it("accepts a real address", () => {
    expect(isSbtConfigured("0x9999999999999999999999999999999999999999")).toBe(true);
  });

  it("rejects unset / zero addresses", () => {
    expect(isSbtConfigured(null)).toBe(false);
    expect(isSbtConfigured(undefined)).toBe(false);
    expect(isSbtConfigured("")).toBe(false);
    expect(isSbtConfigured("0x0000000000000000000000000000000000000000")).toBe(false);
  });
});

describe("normalizeCredentialHash", () => {
  it("passes through a full bytes32 hash", () => {
    expect(normalizeCredentialHash(HASH32)).toBe(HASH32);
  });

  it("left-pads shorter hashes to bytes32", () => {
    expect(normalizeCredentialHash("0x1234")).toBe(zeroPadValue("0x1234", 32));
  });

  // Regression: the stored hash form is bare hex, and requiring an "0x" prefix
  // made every real issuance throw inside the mint.
  it("accepts the bare-hex form stored in credentials.credential_hash", () => {
    expect(normalizeCredentialHash(STORED_HASH)).toBe(HASH32);
  });

  it("accepts an uppercase 0X prefix", () => {
    expect(normalizeCredentialHash("0X" + "AB".repeat(32))).toBe(HASH32);
  });

  it("lowercases the result", () => {
    expect(normalizeCredentialHash("0x" + "AB".repeat(32))).toBe(HASH32);
  });

  it("tolerates surrounding whitespace", () => {
    expect(normalizeCredentialHash(`  ${STORED_HASH}  `)).toBe(HASH32);
  });

  it.each(["", "not-hex", "0xzz", `${HASH32}ff`])("rejects invalid hash %s", (bad) => {
    expect(() => normalizeCredentialHash(bad)).toThrow();
  });
});

describe("toStoredHashFormat / sameCredentialHash", () => {
  it("converts back to the bare 64-char stored form", () => {
    expect(toStoredHashFormat(HASH32)).toBe(STORED_HASH);
    expect(toStoredHashFormat(STORED_HASH)).toBe(STORED_HASH);
  });

  it("round-trips", () => {
    expect(normalizeCredentialHash(toStoredHashFormat(HASH32))).toBe(HASH32);
  });

  it("compares hashes prefix-insensitively", () => {
    expect(sameCredentialHash(STORED_HASH, HASH32)).toBe(true);
    expect(sameCredentialHash(HASH32, "0x" + "cd".repeat(32))).toBe(false);
  });

  it("never throws on malformed input", () => {
    expect(sameCredentialHash("garbage", HASH32)).toBe(false);
    expect(sameCredentialHash(null, HASH32)).toBe(false);
    expect(sameCredentialHash(undefined, undefined)).toBe(false);
  });
});

describe("addressFromDid / resolveHolderAddress", () => {
  it("extracts the address from an Ethereum DID", () => {
    expect(addressFromDid(`did:ethr:sepolia:${HOLDER}`)).toBe(HOLDER);
  });

  it("returns null for a non-Ethereum DID", () => {
    expect(addressFromDid("did:key:z6Mkabc")).toBeNull();
    expect(addressFromDid("did:web:blockid.example")).toBeNull();
    expect(addressFromDid(null)).toBeNull();
  });

  // Regression: the badge used to default to the issuer's wallet because no
  // holder address was ever passed to the mint.
  it("prefers the DID address over the registered wallet", () => {
    expect(resolveHolderAddress(`did:ethr:sepolia:${HOLDER}`, ISSUER)).toBe(getAddress(HOLDER));
  });

  it("falls back to the registered wallet when the DID has no address", () => {
    expect(resolveHolderAddress("did:key:z6Mkabc", ISSUER)).toBe(getAddress(ISSUER));
  });

  it("returns null when neither source yields an address", () => {
    expect(resolveHolderAddress("did:key:z6Mkabc", null)).toBeNull();
    expect(resolveHolderAddress(null, undefined)).toBeNull();
  });

  it("rejects a malformed fallback address", () => {
    expect(resolveHolderAddress(null, "not-an-address")).toBeNull();
  });
});

describe("buildSbtMetadata / buildSbtDataUri", () => {
  it("fills defaults and marks the token soulbound", () => {
    const meta = buildSbtMetadata({ name: "Diploma #1" });
    expect(meta.name).toBe("Diploma #1");
    expect(meta.description).toMatch(/soulbound/);
    expect(meta.credentialType).toBeNull();
    expect(meta.soulbound).toBe(true);
  });

  it("keeps provided fields", () => {
    const meta = buildSbtMetadata({
      name: "Badge",
      credentialType: "EmployeeBadge",
      holderDid: `did:ethr:sepolia:${HOLDER}`,
      schemaCid: "QmY9",
      explorerUrl: "https://sepolia.etherscan.io/address/0x1",
    });
    expect(meta).toMatchObject({
      credentialType: "EmployeeBadge",
      holderDid: `did:ethr:sepolia:${HOLDER}`,
      schemaCid: "QmY9",
      external_url: "https://sepolia.etherscan.io/address/0x1",
    });
  });

  it("roundtrips metadata through the data URI", () => {
    const meta = buildSbtMetadata({ name: "Ticket", credentialType: "Ticket" });
    const uri = buildSbtDataUri(meta);
    expect(uri.startsWith("data:application/json;base64,")).toBe(true);
    expect(JSON.parse(decodeBase64(uri.split(",")[1]))).toEqual(meta);
  });
});

describe("encodeMintCalldata", () => {
  it("produces mint(address,bytes32) calldata with padded args", () => {
    const data = encodeMintCalldata(HOLDER, HASH32);
    const expectedSelector = keccak256(toUtf8Bytes("mint(address,bytes32)")).slice(0, 10);
    expect(data.slice(0, 10)).toBe(expectedSelector);
    expect(data.slice(10, 74)).toBe(zeroPadValue(HOLDER, 32).slice(2));
    expect(data.slice(74, 138)).toBe(HASH32.slice(2));
  });

  it("normalises a short hash before encoding", () => {
    const data = encodeMintCalldata(HOLDER, "0xab");
    expect(data.endsWith("ab".padStart(64, "0"))).toBe(true);
  });

  // Regression: this is the exact call the issuer portal makes.
  it("encodes a stored (unprefixed) credential hash", () => {
    const data = encodeMintCalldata(HOLDER, STORED_HASH);
    expect(data.slice(74, 138)).toBe(HASH32.slice(2));
  });

  it("refuses an empty credential hash (contract reverts anyway)", () => {
    expect(() => encodeMintCalldata(HOLDER, "0x")).toThrow();
  });

  it("refuses a non-address holder", () => {
    expect(() => encodeMintCalldata("did:ethr:sepolia:" + HOLDER, HASH32)).toThrow(/0x-prefixed address/);
  });

  // Regression guard: an unanchored address regex matches a whole DID, which
  // would let a DID reach the ABI encoder and fail with an opaque error.
  it.each([
    "did:ethr:sepolia:" + HOLDER,
    HOLDER + " extra",
    " " + HOLDER,
    HOLDER.slice(0, 39),
  ])("refuses holder %s", (bad) => {
    expect(ADDRESS_PATTERN.test(bad)).toBe(false);
  });

  it("still accepts a valid mixed-case address", () => {
    expect(ADDRESS_PATTERN.test(HOLDER)).toBe(true);
  });
});

describe("encodeRevokeCalldata", () => {
  it("produces revoke(uint256) calldata with the token id left-padded", () => {
    const data = encodeRevokeCalldata(7);
    const expectedSelector = keccak256(toUtf8Bytes("revoke(uint256)")).slice(0, 10);
    expect(data.slice(0, 10)).toBe(expectedSelector);
    expect(data.slice(10)).toBe(zeroPadValue("0x07", 32).slice(2));
  });
});

describe("decodeMintedTokenId", () => {
  const iface = new Interface([...SOULBOUND_ABI]);
  const issuedAt = 1_750_000_000;

  function buildMintedLog(tokenId: bigint) {
    const encoded = iface.encodeEventLog(iface.getEvent("Minted"), [tokenId, HOLDER, HASH32, issuedAt]);
    return { topics: [...encoded.topics], data: encoded.data };
  }

  function buildTransferLog(tokenId: bigint) {
    const encoded = iface.encodeEventLog(iface.getEvent("Transfer"), [
      "0x0000000000000000000000000000000000000000",
      HOLDER,
      tokenId,
    ]);
    return { topics: [...encoded.topics], data: encoded.data };
  }

  it("extracts tokenId, holder and credentialHash from a Minted log", () => {
    expect(decodeMintedTokenId([buildMintedLog(7n)])).toEqual({
      tokenId: 7n,
      holder: HOLDER,
      credentialHash: HASH32,
    });
  });

  // A receipt usually carries both events; Minted must win.
  it("prefers Minted when both Minted and Transfer are present", () => {
    const logs = [buildTransferLog(7n), buildMintedLog(7n)];
    expect(decodeMintedTokenId(logs)?.credentialHash).toBe(HASH32);
  });

  it("falls back to the ERC-721 mint Transfer when Minted is absent", () => {
    const decoded = decodeMintedTokenId([buildTransferLog(9n)]);
    expect(decoded).toEqual({ tokenId: 9n, holder: HOLDER, credentialHash: null });
  });

  it("returns null for empty or unrelated logs", () => {
    const other = { topics: ["0x" + "ee".repeat(32)], data: "0x" };
    expect(decodeMintedTokenId([])).toBeNull();
    expect(decodeMintedTokenId([other])).toBeNull();
  });

  it("skips logs from an unrelated contract instead of throwing", () => {
    const junk = { topics: ["not-a-topic"], data: "0xdeadbeef" };
    expect(decodeMintedTokenId([junk, buildMintedLog(3n)])?.tokenId).toBe(3n);
  });
});

describe("read helpers against a mocked contract", () => {
  function stubContract(methods: Record<string, unknown>) {
    getReadProviderMock.mockResolvedValue({ provider: true });
    ContractMock.mockImplementation(() => methods);
  }

  it("getSbtForCredential returns null for un-minted credentials", async () => {
    stubContract({ tokenByCredentialHash: vi.fn().mockResolvedValue(0n) });
    const { getSbtForCredential } = await import("./sbt.service");
    await expect(getSbtForCredential(HASH32, "0xabc")).resolves.toBeNull();
  });

  // Regression: the DB hash reaches this function unprefixed.
  it("getSbtForCredential accepts the stored unprefixed hash", async () => {
    stubContract({ tokenByCredentialHash: vi.fn().mockResolvedValue(0n) });
    const { getSbtForCredential } = await import("./sbt.service");
    await expect(getSbtForCredential(STORED_HASH, "0xabc")).resolves.toBeNull();
    expect(ContractMock.mock.calls[0][0]).toBe("0xabc");
  });

  it("getSbtForCredential maps the contract tuple into SbtStatus", async () => {
    stubContract({
      tokenByCredentialHash: vi.fn().mockResolvedValue(3n),
      getCredential: vi.fn().mockResolvedValue({
        credentialHash: HASH32,
        holder: HOLDER,
        issuedAt: 1750000000n,
        revoked: false,
      }),
    });
    const { getSbtForCredential } = await import("./sbt.service");

    await expect(getSbtForCredential(HASH32, "0xabc")).resolves.toEqual({
      tokenId: 3,
      credentialHash: HASH32,
      holder: HOLDER,
      issuedAt: 1750000000,
      revoked: false,
    });
    // address override must reach the Contract constructor
    expect(ContractMock.mock.calls[0][0]).toBe("0xabc");
  });

  it("listHolderSbts expands token ids into statuses", async () => {
    stubContract({
      tokenIdsOf: vi.fn().mockResolvedValue([1n, 2n]),
      getCredential: vi.fn().mockImplementation((id: bigint) =>
        Promise.resolve({
          credentialHash: zeroPadValue(`0x${id.toString(16)}0`, 32),
          holder: HOLDER,
          issuedAt: 100n,
          revoked: id === 2n,
        })
      ),
    });
    const { listHolderSbts } = await import("./sbt.service");

    const statuses = await listHolderSbts(HOLDER, "0xabc");
    expect(statuses.map((s) => s.tokenId)).toEqual([1, 2]);
    expect(statuses[1].revoked).toBe(true);
  });

  it("listHolderSbts returns an empty list for a wallet with no badges", async () => {
    stubContract({ tokenIdsOf: vi.fn().mockResolvedValue([]) });
    const { listHolderSbts } = await import("./sbt.service");
    await expect(listHolderSbts(HOLDER, "0xabc")).resolves.toEqual([]);
  });

  it("listHolderSbts rejects a malformed holder", async () => {
    const { listHolderSbts } = await import("./sbt.service");
    await expect(listHolderSbts("nope", "0xabc")).rejects.toThrow(/0x-prefixed address/);
  });

  it("throws a descriptive error when no address is configured", async () => {
    // `import.meta.env` properties are not deletable under Vitest, so blank the
    // value to the zero address — which isSbtConfigured() rejects.
    const origEnv = import.meta.env.VITE_SOULBOUND_CREDENTIAL_ADDRESS;
    try {
      (import.meta.env as any).VITE_SOULBOUND_CREDENTIAL_ADDRESS =
        "0x0000000000000000000000000000000000000000";
      getReadProviderMock.mockResolvedValue({ provider: true });
      const { getSbtForCredential } = await import("./sbt.service");
      await expect(getSbtForCredential(HASH32)).rejects.toThrow(/not configured/);
      expect(ContractMock).not.toHaveBeenCalled();
    } finally {
      (import.meta.env as any).VITE_SOULBOUND_CREDENTIAL_ADDRESS = origEnv;
    }
  });

  it("throws a descriptive error for an unconfigured mint", async () => {
    const { mintSbtForCredential } = await import("./sbt.service");
    const signer = {
      getAddress: vi.fn().mockResolvedValue(ISSUER),
      sendTransaction: vi.fn(),
    };
    await expect(
      mintSbtForCredential(signer, {
        credentialHash: STORED_HASH,
        holderDid: `did:ethr:sepolia:${HOLDER}`,
        address: "0x0000000000000000000000000000000000000000",
      })
    ).rejects.toThrow(/not configured/);
  });
});

describe("mintSbtForCredential", () => {
  const ADDRESS = "0xabc";

  function fakeSigner(receipt: { logs: unknown[] } | null) {
    return {
      getAddress: vi.fn().mockResolvedValue(ISSUER),
      sendTransaction: vi.fn().mockResolvedValue({
        hash: "0xtx",
        wait: vi.fn().mockResolvedValue(receipt),
      }),
    };
  }

  function mintLog(tokenId: bigint) {
    const iface = new Interface([...SOULBOUND_ABI]);
    const encoded = iface.encodeEventLog(iface.getEvent("Minted"), [tokenId, HOLDER, HASH32, 1n]);
    return { topics: [...encoded.topics], data: encoded.data };
  }

  it("mints to the holder resolved from the DID, never to the signing wallet", async () => {
    const { mintSbtForCredential } = await import("./sbt.service");
    const signer = fakeSigner({ logs: [mintLog(5n)] });

    const result = await mintSbtForCredential(signer, {
      credentialHash: STORED_HASH,
      holderDid: `did:ethr:sepolia:${HOLDER}`,
      address: ADDRESS,
    });

    expect(result.holder).toBe(getAddress(HOLDER));
    expect(result.tokenId).toBe(5n);
    expect(result.credentialHash).toBe(HASH32);
    // The calldata must carry the holder, not getAddress()
    const sent = signer.sendTransaction.mock.calls[0][0] as { to: string; data: string };
    expect(sent.data.slice(34, 74).toLowerCase()).toBe(HOLDER.slice(2));
  });

  it("falls back to the registered wallet when the DID is not an Ethereum DID", async () => {
    const { mintSbtForCredential } = await import("./sbt.service");
    const signer = fakeSigner({ logs: [] });
    const result = await mintSbtForCredential(signer, {
      credentialHash: STORED_HASH,
      holderDid: "did:key:z6Mkabc",
      fallbackAddress: ISSUER,
      address: ADDRESS,
    });
    expect(result.holder).toBe(getAddress(ISSUER));
  });

  it("refuses to mint when no holder address can be resolved", async () => {
    const { mintSbtForCredential } = await import("./sbt.service");
    const signer = fakeSigner({ logs: [] });
    await expect(
      mintSbtForCredential(signer, { credentialHash: STORED_HASH, holderDid: "did:key:z6Mkabc", address: ADDRESS })
    ).rejects.toThrow(/no holder Ethereum address/);
    expect(signer.sendTransaction).not.toHaveBeenCalled();
  });

  it("surfaces a user rejection as reason 'rejected'", async () => {
    const { mintSbtForCredential } = await import("./sbt.service");
    const signer = {
      getAddress: vi.fn().mockResolvedValue(ISSUER),
      sendTransaction: vi.fn().mockRejectedValue({ code: "ACTION_REJECTED", message: "user rejected action" }),
    };
    await expect(
      mintSbtForCredential(signer, { credentialHash: STORED_HASH, holderDid: `did:ethr:sepolia:${HOLDER}`, address: ADDRESS })
    ).rejects.toMatchObject({ reason: "rejected" });
  });

  it("surfaces a non-issuer revert with actionable guidance", async () => {
    const { mintSbtForCredential } = await import("./sbt.service");
    const signer = {
      getAddress: vi.fn().mockResolvedValue(ISSUER),
      sendTransaction: vi.fn().mockRejectedValue({ message: "execution reverted: NotIssuer" }),
    };
    await expect(
      mintSbtForCredential(signer, { credentialHash: STORED_HASH, holderDid: `did:ethr:sepolia:${HOLDER}`, address: ADDRESS })
    ).rejects.toMatchObject({ reason: "not_issuer" });
  });

  // Real-world shape from Sepolia: the browser signer is a JsonRpcSigner-ish
  // object whose revert arrives as an unnamed 4-byte selector, so ethers prints
  // "unknown custom error" and the name never appears in the message.
  it("decodes NotIssuer from a bare revert selector", async () => {
    const { mintSbtForCredential } = await import("./sbt.service");
    const signer = {
      getAddress: vi.fn().mockResolvedValue(ISSUER),
      sendTransaction: vi.fn().mockRejectedValue({
        code: "CALL_EXCEPTION",
        message: "execution reverted (unknown custom error)",
        data: "0x54ec5063",
      }),
    };
    await expect(
      mintSbtForCredential(signer, { credentialHash: STORED_HASH, holderDid: `did:ethr:sepolia:${HOLDER}`, address: ADDRESS })
    ).rejects.toMatchObject({ reason: "not_issuer" });
  });

  it("decodes a duplicate from a bare revert selector", async () => {
    const { mintSbtForCredential } = await import("./sbt.service");
    const signer = {
      getAddress: vi.fn().mockResolvedValue(ISSUER),
      sendTransaction: vi.fn().mockRejectedValue({
        code: "CALL_EXCEPTION",
        message: "execution reverted (unknown custom error)",
        data: "0x7f7af7c3",
      }),
    };
    await expect(
      mintSbtForCredential(signer, { credentialHash: STORED_HASH, holderDid: `did:ethr:sepolia:${HOLDER}`, address: ADDRESS })
    ).rejects.toMatchObject({ reason: "duplicate" });
  });

  it("still reports the selector when no error name can be resolved", async () => {
    const { mintSbtForCredential } = await import("./sbt.service");
    const signer = {
      getAddress: vi.fn().mockResolvedValue(ISSUER),
      sendTransaction: vi.fn().mockRejectedValue({
        code: "CALL_EXCEPTION",
        message: "execution reverted (unknown custom error)",
        data: "0xdeadbeef",
      }),
    };
    await expect(
      mintSbtForCredential(signer, { credentialHash: STORED_HASH, holderDid: `did:ethr:sepolia:${HOLDER}`, address: ADDRESS })
    ).rejects.toThrow(/0xdeadbeef/);
  });

  it("surfaces a duplicate credential hash", async () => {
    const { mintSbtForCredential } = await import("./sbt.service");
    const signer = {
      getAddress: vi.fn().mockResolvedValue(ISSUER),
      sendTransaction: vi.fn().mockRejectedValue({ message: "execution reverted: DuplicateCredential" }),
    };
    await expect(
      mintSbtForCredential(signer, { credentialHash: STORED_HASH, holderDid: `did:ethr:sepolia:${HOLDER}`, address: ADDRESS })
    ).rejects.toMatchObject({ reason: "duplicate" });
  });

  it("surfaces insufficient gas funds", async () => {
    const { mintSbtForCredential } = await import("./sbt.service");
    const signer = {
      getAddress: vi.fn().mockResolvedValue(ISSUER),
      sendTransaction: vi.fn().mockRejectedValue({ message: "insufficient funds for gas * price + value" }),
    };
    await expect(
      mintSbtForCredential(signer, { credentialHash: STORED_HASH, holderDid: `did:ethr:sepolia:${HOLDER}`, address: ADDRESS })
    ).rejects.toMatchObject({ reason: "insufficient_funds" });
  });

  it("throws when the tx produced no receipt", async () => {
    const { mintSbtForCredential } = await import("./sbt.service");
    const signer = fakeSigner(null);
    await expect(
      mintSbtForCredential(signer, { credentialHash: STORED_HASH, holderDid: `did:ethr:sepolia:${HOLDER}`, address: ADDRESS })
    ).rejects.toThrow(/no receipt/);
  });

  it("returns a null tokenId rather than throwing when the log is undecodable", async () => {
    const { mintSbtForCredential } = await import("./sbt.service");
    const signer = fakeSigner({ logs: [] });
    const result = await mintSbtForCredential(signer, {
      credentialHash: STORED_HASH,
      holderDid: `did:ethr:sepolia:${HOLDER}`,
      address: ADDRESS,
    });
    expect(result.tokenId).toBeNull();
  });
});

describe("reconcileBadge", () => {
  it("reports a chain badge as needing a backfill when the DB has no token id", async () => {
    const { reconcileBadge: reconcile } = await import("./sbt.service");
    getReadProviderMock.mockResolvedValue({ provider: true });
    ContractMock.mockImplementation(() => ({
      tokenByCredentialHash: vi.fn().mockResolvedValue(4n),
      getCredential: vi.fn().mockResolvedValue({
        credentialHash: HASH32,
        holder: HOLDER,
        issuedAt: 1_750_000_000n,
        revoked: false,
      }),
    }));

    const result = await reconcile(
      { sbt_token_id: null, credential_hash: STORED_HASH },
      "0xabc"
    );
    expect(result.source).toBe("chain");
    expect(result.status?.tokenId).toBe(4);
    expect(result.needsBackfill).toBe(true);
    expect(result.drifted).toBe(false);
  });

  it("flags a mismatch between the recorded and on-chain token id", async () => {
    const { reconcileBadge: reconcile } = await import("./sbt.service");
    getReadProviderMock.mockResolvedValue({ provider: true });
    ContractMock.mockImplementation(() => ({
      tokenByCredentialHash: vi.fn().mockResolvedValue(9n),
      getCredential: vi.fn().mockResolvedValue({
        credentialHash: HASH32,
        holder: HOLDER,
        issuedAt: 1n,
        revoked: false,
      }),
    }));

    const result = await reconcile({ sbt_token_id: 2, credential_hash: STORED_HASH }, "0xabc");
    expect(result.drifted).toBe(true);
    expect(result.status?.tokenId).toBe(9);
  });

  it("accepts a numeric token id delivered as a string (Postgres numeric)", async () => {
    const { reconcileBadge: reconcile } = await import("./sbt.service");
    getReadProviderMock.mockResolvedValue({ provider: true });
    ContractMock.mockImplementation(() => ({
      tokenByCredentialHash: vi.fn().mockResolvedValue(11n),
      getCredential: vi.fn().mockResolvedValue({
        credentialHash: HASH32,
        holder: HOLDER,
        issuedAt: 1n,
        revoked: false,
      }),
    }));

    const result = await reconcile({ sbt_token_id: "11", credential_hash: STORED_HASH }, "0xabc");
    expect(result.drifted).toBe(false);
    expect(result.needsBackfill).toBe(false);
  });

  it("falls back to the DB row when the RPC is unavailable", async () => {
    const { reconcileBadge: reconcile } = await import("./sbt.service");
    getReadProviderMock.mockRejectedValue(new Error("RPC down"));
    ContractMock.mockImplementation(() => ({
      tokenByCredentialHash: vi.fn().mockRejectedValue(new Error("RPC down")),
    }));

    const result = await reconcile(
      { sbt_token_id: 3, credential_hash: STORED_HASH, sbt_holder_address: HOLDER },
      "0xabc"
    );
    expect(result.source).toBe("db");
    expect(result.status?.tokenId).toBe(3);
  });

  it("reports nothing when neither source knows about a badge", async () => {
    const { reconcileBadge: reconcile } = await import("./sbt.service");
    getReadProviderMock.mockResolvedValue({ provider: true });
    ContractMock.mockImplementation(() => ({
      tokenByCredentialHash: vi.fn().mockResolvedValue(0n),
    }));

    const result = await reconcile({ sbt_token_id: null, credential_hash: STORED_HASH }, "0xabc");
    expect(result).toEqual({ status: null, source: "none", needsBackfill: false, drifted: false });
  });
});

function decodeBase64(value: string): string {
  if (typeof atob === "function") return decodeURIComponent(escape(atob(value)));
  return Buffer.from(value, "base64").toString("utf-8");
}
