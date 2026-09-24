import { describe, it, expect } from "vitest";
import {
  getExtension,
  looksLikeDid,
  validateFile,
  validateLineCount,
} from "./fileValidation";

describe("getExtension", () => {
  it("returns the lowercase extension", () => {
    expect(getExtension("holders.csv")).toBe("csv");
    expect(getExtension("LIST.TXT")).toBe("txt");
  });

  it("returns empty for dotfiles or missing extensions", () => {
    expect(getExtension("README")).toBe("");
    expect(getExtension(".env")).toBe("");
    expect(getExtension("noext.")).toBe("");
  });
});

describe("validateFile", () => {
  it("accepts a valid CSV under the size cap", () => {
    expect(validateFile({ name: "holders.csv", size: 1024 })).toEqual({ ok: true });
  });

  it("rejects unsupported extensions", () => {
    const res = validateFile({ name: "payload.exe", size: 100 });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Unsupported file type");
  });

  it("rejects oversized files with a readable message", () => {
    const res = validateFile({ name: "big.csv", size: 5 * 1024 * 1024 });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("MB upload limit");
  });

  it("rejects empty files", () => {
    expect(validateFile({ name: "empty.csv", size: 0 }).ok).toBe(false);
  });

  it("respects a custom extension allowlist", () => {
    expect(validateFile({ name: "data.json", size: 10 }, { allowedExtensions: ["json"] })).toEqual({ ok: true });
    expect(validateFile({ name: "data.csv", size: 10 }, { allowedExtensions: ["json"] }).ok).toBe(false);
  });

  it("respects a custom size cap", () => {
    expect(validateFile({ name: "a.csv", size: 300 }, { maxBytes: 256 }).ok).toBe(false);
  });

  it("handles null/invalid input defensively", () => {
    const res = validateFile(null as unknown as { name: string; size: number });
    expect(res.ok).toBe(false);
  });
});

describe("validateLineCount", () => {
  it("accepts rows within the limit", () => {
    expect(validateLineCount(["a", "b", "c"], 5)).toEqual({ ok: true });
  });

  it("rejects too many rows", () => {
    const res = validateLineCount(Array.from({ length: 10 }, (_, i) => `r${i}`), 5);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("maximum is 5");
  });
});

describe("looksLikeDid", () => {
  it("matches well-formed DIDs", () => {
    expect(looksLikeDid("did:ethr:sepolia:0x123")).toBe(true);
    expect(looksLikeDid("did:decentraid:holder:abc")).toBe(true);
  });

  it("rejects garbage and empty strings", () => {
    expect(looksLikeDid("")).toBe(false);
    expect(looksLikeDid("not-a-did")).toBe(false);
    expect(looksLikeDid("  ")).toBe(false);
    expect(looksLikeDid("did:")).toBe(false);
  });
});