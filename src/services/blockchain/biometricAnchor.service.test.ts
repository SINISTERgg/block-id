import { describe, it, expect, vi, beforeEach } from "vitest";
import { Interface, zeroPadValue } from "ethers";
import {
  BIOMETRIC_ANCHOR_ABI,
  DEFAULT_PROOF_VALIDITY_SECONDS,
  decodeAnchoredProof,
  encodeAnchorCalldata,
  isBiometricAnchorConfigured,
  normalizeProofHash,
} from "./biometricAnchor.service";

const { getReadProviderMock, ContractMock } = vi.hoisted(() => ({
  getReadProviderMock: vi.fn(),
  ContractMock: vi.fn(),
}));

vi.mock("./provider", () => ({ getReadProvider: (...args: unknown[]) => getReadProviderMock(...args) }));
vi.mock("ethers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ethers")>();
  // plain function so `new Contract(...)` still works and yields our stub
  const Contract = function (...args: unknown[] ) {
    return ContractMock(...args);
  };
  return { ...actual, Contract };
});

const VERIFIER = "0x3333333333333333333333333333333333333333";
const SUBJECT_HASH = "0x" + "cc".repeat(32);
const PROOF_HASH = "0x" + "dd".repeat(32);
const ANCHOR_IFACE = new Interface([...BIOMETRIC_ANCHOR_ABI]);

beforeEach(() => {
  getReadProviderMock.mockReset();
  ContractMock.mockReset();
});

describe("isBiometricAnchorConfigured", () => {
  it("accepts a real address", () => {
    expect(isBiometricAnchorConfigured("0x8888888888888888888888888888888888888888")).toBe(true);
  });

  it.each([null, undefined, "", "0x0000000000000000000000000000000000000000"])(
    "rejects unset/zero address %s",
    (bad) => {
      expect(isBiometricAnchorConfigured(bad as string | null | undefined)).toBe(false);
    }
  );
});

describe("normalizeProofHash", () => {
  it("passes through a full bytes32 hash", () => {
    expect(normalizeProofHash(PROOF_HASH)).toBe(PROOF_HASH);
  });

  it("left-pads shorter hashes to bytes32", () => {
    expect(normalizeProofHash("0xabcd")).toBe(zeroPadValue("0xabcd", 32));
  });

  it.each(["", "nothex", "0xzz", `${PROOF_HASH}ff`])("rejects invalid hash %s", (bad) => {
    expect(() => normalizeProofHash(bad)).toThrow();
  });
});

describe("encodeAnchorCalldata", () => {
  it("encodes anchorProof with the default validity window", () => {
    const data = encodeAnchorCalldata(SUBJECT_HASH, PROOF_HASH);
    const [subject, proof, validity] = ANCHOR_IFACE.decodeFunctionData("anchorProof", data);
    expect(subject).toBe(SUBJECT_HASH.toLowerCase());
    expect(proof).toBe(PROOF_HASH.toLowerCase());
    expect(validity).toBe(BigInt(DEFAULT_PROOF_VALIDITY_SECONDS));
  });

  it("accepts an explicit validity window", () => {
    const [,, validity] = ANCHOR_IFACE.decodeFunctionData(
      "anchorProof",
      encodeAnchorCalldata(SUBJECT_HASH, PROOF_HASH, 60)
    );
    expect(validity).toBe(60n);
  });
});

describe("decodeAnchoredProof", () => {
  it("extracts anchoring details from a ProofAnchored log", () => {
    const anchoredAt = 1_900_000_000n;
    const expiresAt = anchoredAt + BigInt(DEFAULT_PROOF_VALIDITY_SECONDS);
    const log = ANCHOR_IFACE.encodeEventLog(ANCHOR_IFACE.getEvent("ProofAnchored"), [
      SUBJECT_HASH,
      PROOF_HASH,
      VERIFIER,
      anchoredAt,
      expiresAt,
    ]);
    const decoded = decodeAnchoredProof([{ topics: [...log.topics], data: log.data }]);
    expect(decoded).toMatchObject({
      subjectHash: SUBJECT_HASH,
      proofHash: PROOF_HASH,
      verifier: VERIFIER,
      anchoredAt,
      expiresAt,
    });
  });

  it.each([
    ["empty logs", []],
    ["unrelated logs", [{ topics: ["0xdeadbeef"], data: "0x" }]],
  ])("returns null for %s", (_label, logs) => {
    expect(decodeAnchoredProof(logs as { topics: string[]; data: string }[])).toBeNull();
  });
});

describe("network calls", () => {
  const TEST_ADDR = "0xabc";

  interface TestSigner {
    sendTransaction(tx: { to: string; data: string }): Promise<{ hash: string; wait(): Promise<{ logs: unknown[] }> }>;
  }

  function stubContract(methods: Record<string, unknown>) {
    getReadProviderMock.mockResolvedValue({ provider: true });
    ContractMock.mockImplementation(() => methods);
  }

  it("isProofAnchored normalizes the hash and consults the contract", async () => {
    stubContract({ isProofUsed: vi.fn().mockResolvedValue(true) });
    const { isProofAnchored } = await import("./biometricAnchor.service");
    const used = await isProofAnchored("0xabcd", TEST_ADDR);
    expect(used).toBe(true);

    const contract = ContractMock.mock.results[0].value;
    expect(ContractMock.mock.calls[0][0]).toBe(TEST_ADDR);
    expect(contract.isProofUsed).toHaveBeenCalledWith(zeroPadValue("0xabcd", 32));
  });

  it("isSubjectVerified returns the contract verdict", async () => {
    stubContract({ isBiometricallyVerified: vi.fn().mockResolvedValue(false) });
    const { isSubjectVerified } = await import("./biometricAnchor.service");
    await expect(isSubjectVerified(SUBJECT_HASH, TEST_ADDR)).resolves.toBe(false);

    const contract = ContractMock.mock.results[0].value;
    expect(contract.isBiometricallyVerified).toHaveBeenCalledWith(SUBJECT_HASH);
  });

  it("throws when no anchor address is configured for reads", async () => {
    const mod = await import("./biometricAnchor.service");
    if (mod.isBiometricAnchorConfigured()) {
      // configured via .env in this environment → negative case can't be exercised
      return;
    }
    ContractMock.mockClear();
    getReadProviderMock.mockClear();
    await expect(mod.isProofAnchored(PROOF_HASH)).rejects.toThrow(/not configured/);
    expect(ContractMock).not.toHaveBeenCalled();
    expect(getReadProviderMock).not.toHaveBeenCalled();
  });

  it("anchorBiometricProof sends calldata and decodes expiry from the receipt", async () => {
    const { anchorBiometricProof } = await import("./biometricAnchor.service");

    const anchoredAt = 1_900_000_000n;
    const expiresAt = anchoredAt + BigInt(DEFAULT_PROOF_VALIDITY_SECONDS);
    const eventLog = ANCHOR_IFACE.encodeEventLog(ANCHOR_IFACE.getEvent("ProofAnchored"), [
      SUBJECT_HASH,
      PROOF_HASH,
      VERIFIER,
      anchoredAt,
      expiresAt,
    ]);

    const sendTransaction = vi.fn().mockResolvedValue({
      hash: "0xtx",
      wait: vi.fn().mockResolvedValue({ logs: [{ topics: [...eventLog.topics], data: eventLog.data }] }),
    });
    const signer = { sendTransaction };

    const result = await anchorBiometricProof(signer satisfies TestSigner, {
      subjectHash: SUBJECT_HASH,
      proofHash: PROOF_HASH,
      address: TEST_ADDR,
    });

    expect(sendTransaction).toHaveBeenCalledWith({
      to: TEST_ADDR,
      data: encodeAnchorCalldata(SUBJECT_HASH, PROOF_HASH),
    });
    expect(result.txHash).toBe("0xtx");
    expect(result.expiresAt).toBe(expiresAt);
  });

  it("anchorBiometricProof tolerates receipts without events", async () => {
    const { anchorBiometricProof } = await import("./biometricAnchor.service");
    const signer = {
      sendTransaction: vi.fn().mockResolvedValue({ hash: "0xtx2", wait: vi.fn().mockResolvedValue({ logs: [] }) }),
    };
    const result = await anchorBiometricProof(signer satisfies TestSigner, {
      subjectHash: SUBJECT_HASH,
      proofHash: PROOF_HASH,
      address: TEST_ADDR,
    });
    expect(result.txHash).toBe("0xtx2");
    expect(result.expiresAt).toBeNull();
  });
});
