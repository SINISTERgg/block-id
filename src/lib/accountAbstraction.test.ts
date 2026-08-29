import { describe, it, expect } from "vitest";
import { AbiCoder, getCreate2Address, keccak256 } from "ethers";
import {
  ENTRY_POINT_V07,
  buildPackedUserOp,
  computeAccountAddress,
  encodeExecuteCall,
  getUserOpHash,
  packAccountGasLimits,
  packGasFees,
  unpackAccountGasLimits,
  unpackGasFees,
} from "./accountAbstraction";

const SENDER = "0x1111111111111111111111111111111111111111";
const DEST = "0x2222222222222222222222222222222222222222";

describe("gas packing", () => {
  it("roundtrips account gas limits", () => {
    const packed = packAccountGasLimits(150_000n, 250_000n);
    expect(unpackAccountGasLimits(packed)).toEqual([150_000n, 250_000n]);
  });

  it("roundtrips gas fees", () => {
    const packed = packGasFees(100_000_000n, 2_000_000_000n);
    expect(unpackGasFees(packed)).toEqual([100_000_000n, 2_000_000_000n]);
  });

  it("produces exactly 32 bytes", () => {
    expect(packAccountGasLimits(1n, 2n)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(packGasFees(3n, 4n)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("keeps high/low halves independent", () => {
    const a = packGasFees(7n, 9n);
    const b = packGasFees(8n, 9n);
    expect(a).not.toBe(b);
  });
});

describe("buildPackedUserOp", () => {
  it("applies v0.7 defaults", () => {
    const op = buildPackedUserOp({ sender: SENDER, callData: "0xdeadbeef" });
    expect(op.sender).toBe(SENDER);
    expect(op.nonce).toBe(0n);
    expect(op.initCode).toBe("0x");
    expect(unpackAccountGasLimits(op.accountGasLimits)).toEqual([150_000n, 100_000n]);
    expect(op.preVerificationGas).toBe(50_000n);
    expect(op.paymasterAndData).toBe("0x");
    expect(op.signature).toBe("0x");
  });

  it("throws without callData", () => {
    // @ts-expect-error — exercising runtime guard
    expect(() => buildPackedUserOp({ sender: SENDER })).toThrow(/callData is required/);
  });
});

describe("getUserOpHash", () => {
  const op = buildPackedUserOp({
    sender: SENDER,
    callData: encodeExecuteCall(DEST, 0n, "0xab"),
  });

  it("is deterministic for identical ops", () => {
    expect(getUserOpHash(op, ENTRY_POINT_V07, 80002)).toBe(
      getUserOpHash(op, ENTRY_POINT_V07, 80002)
    );
  });

  it("changes with chainId and entrypoint", () => {
    const base = getUserOpHash(op, ENTRY_POINT_V07, 80002);
    expect(getUserOpHash(op, ENTRY_POINT_V07, 1)).not.toBe(base);
    expect(getUserOpHash(op, DEST, 80002)).not.toBe(base);
  });

  it("changes when any packed field changes", () => {
    const base = getUserOpHash(op, ENTRY_POINT_V07, 80002);

    const nonceChanged = { ...op, nonce: 1n };
    const callDataChanged = { ...op, callData: encodeExecuteCall(SENDER) };
    const paymasterChanged = { ...op, paymasterAndData: "0xbeef" };
    const feesChanged = { ...op, gasFees: packGasFees(5n, 5n) };

    for (const variant of [nonceChanged, callDataChanged, paymasterChanged, feesChanged]) {
      expect(getUserOpHash(variant, ENTRY_POINT_V07, 80002)).not.toBe(base);
    }
  });

  it("matches a hand-derived reference hash", () => {
    // Independent recomputation using ethers primitives only
    const coder = AbiCoder.defaultAbiCoder();
    const inner = keccak256(
      coder.encode(
        ["address", "uint256", "bytes32", "bytes32", "bytes32", "uint256", "bytes32", "bytes32"],
        [
          op.sender,
          op.nonce,
          keccak256(op.initCode),
          keccak256(op.callData),
          op.accountGasLimits,
          op.preVerificationGas,
          op.gasFees,
          keccak256(op.paymasterAndData),
        ]
      )
    );
    const expected = keccak256(
      coder.encode(["bytes32", "address", "uint256"], [inner, ENTRY_POINT_V07, 80002])
    );
    expect(getUserOpHash(op, ENTRY_POINT_V07, 80002)).toBe(expected);
  });
});

describe("encodeExecuteCall", () => {
  it("produces the SimpleAccount.execute selector", () => {
    const data = encodeExecuteCall(DEST, 123n, "0xff");
    expect(data.startsWith("0xb61d27f6")).toBe(true); // keccak("execute(address,uint256,bytes)")[:4]
  });
});

describe("computeAccountAddress", () => {
  const factory = "0x3333333333333333333333333333333333333333";
  // Simulated SimpleAccount.creationCode ++ abi.encode(owner, entryPoint, factory)
  function initCode(owner: string): string {
    return (
      "0x608060405234801561001157600060fd5b50" +
      owner.slice(2).toLowerCase().padStart(64, "0")
    );
  }

  function salt(n: number): string {
    return "0x" + n.toString(16).padStart(64, "0");
  }

  it("matches ethers.getCreate2Address directly", () => {
    const computed = computeAccountAddress({
      owner: SENDER,
      salt: salt(1),
      factory,
      creationCodeWithArgs: initCode(SENDER),
    });
    const direct = getCreate2Address(factory, salt(1), keccak256(initCode(SENDER)));
    expect(computed).toBe(direct);
  });

  it("derives distinct addresses per salt and owner", () => {
    const a = computeAccountAddress({ owner: SENDER, salt: salt(1), factory, creationCodeWithArgs: initCode(SENDER) });
    const b = computeAccountAddress({ owner: SENDER, salt: salt(2), factory, creationCodeWithArgs: initCode(SENDER) });
    const c = computeAccountAddress({ owner: DEST, salt: salt(1), factory, creationCodeWithArgs: initCode(DEST) });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});
