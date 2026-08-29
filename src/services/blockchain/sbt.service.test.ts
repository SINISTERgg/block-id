import { describe, it, expect, vi, beforeEach } from "vitest";
import { Interface, keccak256, toUtf8Bytes, zeroPadValue } from "ethers";
import {
  SOULBOUND_ABI,
  buildSbtDataUri,
  buildSbtMetadata,
  decodeMintedTokenId,
  encodeMintCalldata,
  isSbtConfigured,
  normalizeCredentialHash,
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
const HASH32 = "0x" + "ab".repeat(32);

beforeEach(() => {
  getReadProviderMock.mockReset();
  ContractMock.mockReset();
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

  it.each(["", "not-hex", "0xzz", `${HASH32}ff`])("rejects invalid hash %s", (bad) => {
    expect(() => normalizeCredentialHash(bad)).toThrow();
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

  it("refuses an empty credential hash (contract reverts anyway)", () => {
    expect(() => encodeMintCalldata(HOLDER, "0x")).toThrow();
  });
});

describe("decodeMintedTokenId", () => {
  const iface = new Interface([...SOULBOUND_ABI]);
  const issuedAt = 1_750_000_000;

  function buildMintedLog(tokenId: bigint) {
    const encoded = iface.encodeEventLog(iface.getEvent("Minted"), [tokenId, HOLDER, HASH32, issuedAt]);
    return { topics: [...encoded.topics], data: encoded.data };
  }

  it("extracts tokenId, holder and credentialHash from a Minted log", () => {
    expect(decodeMintedTokenId([buildMintedLog(7n)])).toEqual({
      tokenId: 7n,
      holder: HOLDER,
      credentialHash: HASH32,
    });
  });

  it("returns null for empty or unrelated logs", () => {
    const other = { topics: ["0x" + "ee".repeat(32)], data: "0x" };
    expect(decodeMintedTokenId([])).toBeNull();
    expect(decodeMintedTokenId([other])).toBeNull();
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

  it("throws a descriptive error when no address is configured", async () => {
    getReadProviderMock.mockResolvedValue({ provider: true });
    const { getSbtForCredential } = await import("./sbt.service");
    await expect(getSbtForCredential(HASH32)).rejects.toThrow(/not configured/);
    expect(ContractMock).not.toHaveBeenCalled();
  });
});

function decodeBase64(value: string): string {
  if (typeof atob === "function") return decodeURIComponent(escape(atob(value)));
  return Buffer.from(value, "base64").toString("utf-8");
}
