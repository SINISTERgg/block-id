import { describe, it, expect } from "vitest";
import { canonicalJson, sha256Hash, computeCredentialHash, toBytes32 } from "./crypto";
import { computeCredentialHash as edgeHash } from "../../supabase/functions/_shared/vc-hash.ts";

describe("canonicalJson", () => {
  it("returns null as stringified null", () => {
    expect(canonicalJson(null)).toBe("null");
  });

  it("returns primitives as-is", () => {
    expect(canonicalJson(42)).toBe("42");
    expect(canonicalJson("hello")).toBe('"hello"');
    expect(canonicalJson(true)).toBe("true");
  });

  it("sorts object keys deterministically", () => {
    const a = { z: 1, a: 2, m: 3 };
    const b = { a: 2, m: 3, z: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson(a)).toBe('{"a":2,"m":3,"z":1}');
  });

  it("sorts nested object keys recursively", () => {
    const obj = { b: { d: 1, c: 2 }, a: 3 };
    const result = canonicalJson(obj);
    expect(result).toBe('{"a":3,"b":{"c":2,"d":1}}');
  });

  it("handles arrays in order", () => {
    const arr = [3, 1, 2];
    expect(canonicalJson(arr)).toBe("[3,1,2]");
  });

  it("handles nested arrays with objects", () => {
    const input = [{ b: 2, a: 1 }, { d: 4, c: 3 }];
    expect(canonicalJson(input)).toBe('[{"a":1,"b":2},{"c":3,"d":4}]');
  });

  it("handles empty objects and arrays", () => {
    expect(canonicalJson({})).toBe("{}");
    expect(canonicalJson([])).toBe("[]");
  });

  it("handles nested null values", () => {
    expect(canonicalJson({ a: null })).toBe('{"a":null}');
  });

  it("produces identical output for identical objects", () => {
    const obj1 = { "@context": ["https://w3.org/2018/credentials/v1"], type: ["VerifiableCredential", "Diploma"], issuer: "did:decentraid:issuer:abc" };
    const obj2 = { type: ["VerifiableCredential", "Diploma"], issuer: "did:decentraid:issuer:abc", "@context": ["https://w3.org/2018/credentials/v1"] };
    expect(canonicalJson(obj1)).toBe(canonicalJson(obj2));
  });
});

describe("sha256Hash", () => {
  it("returns consistent hex hash for same input", async () => {
    const h1 = await sha256Hash("test");
    const h2 = await sha256Hash("test");
    expect(h1).toBe(h2);
  });

  it("returns 64-character hex string", async () => {
    const hash = await sha256Hash("hello world");
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
  });

  it("returns different hashes for different inputs", async () => {
    const h1 = await sha256Hash("hello");
    const h2 = await sha256Hash("world");
    expect(h1).not.toBe(h2);
  });

  it("known SHA-256 of 'hello'", async () => {
    const hash = await sha256Hash("hello");
    expect(hash).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });

  it("handles empty string", async () => {
    const hash = await sha256Hash("");
    expect(hash).toHaveLength(64);
  });

  it("handles unicode", async () => {
    const hash = await sha256Hash("\u00e9");
    expect(hash).toHaveLength(64);
  });
});

describe("computeCredentialHash", () => {
  const vc = {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    type: ["VerifiableCredential", "Diploma"],
    issuer: "did:decentraid:issuer:abc",
    issuanceDate: "2026-01-01T00:00:00Z",
    credentialSubject: {
      id: "did:decentraid:holder123",
      degree: "Bachelor of Science",
      university: "MIT",
    },
  };

  it("produces a 64-char hex hash", async () => {
    const hash = await computeCredentialHash(vc);
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
  });

  it("produces different hashes with different prevHash", async () => {
    const h1 = await computeCredentialHash(vc, "");
    const h2 = await computeCredentialHash(vc, "abc");
    expect(h1).not.toBe(h2);
  });

  it("produces deterministic output", async () => {
    const h1 = await computeCredentialHash(vc, "prev");
    const h2 = await computeCredentialHash(vc, "prev");
    expect(h1).toBe(h2);
  });

  it("produces different hashes for different VC data", async () => {
    const vc2 = { ...vc, credentialSubject: { ...vc.credentialSubject, degree: "Master of Science" } };
    const h1 = await computeCredentialHash(vc);
    const h2 = await computeCredentialHash(vc2);
    expect(h1).not.toBe(h2);
  });

  it("ignores a top-level proof field (parity with stored credential_data)", async () => {
    const stored = {
      ...vc,
      proof: { type: "Ed25519Signature2020", created: "2026-01-02T00:00:00Z", proofValue: "abc..." },
    };
    expect(await computeCredentialHash(stored, "prev")).toBe(await computeCredentialHash(vc, "prev"));
  });
});

// ── Round-trip parity: client ↔ Supabase edge-function module ────────────────
// C7 — the credential hash MUST be reproducible across every producer
// (issue-credential, oid4vci) and every verifier (verify-credential, client).
describe("credential hash round-trip parity (C7)", () => {
  const issuedVC = {
    "@context": ["https://www.w3.org/2018/credentials/v1", "https://w3id.org/security/suites/ed25519-2020/v1"],
    type: ["VerifiableCredential", "Diploma"],
    issuer: "did:decentraid:issuer:abc",
    issuanceDate: "2026-01-01T00:00:00Z",
    credentialSubject: { id: "did:decentraid:holder123", degree: "Bachelor of Science" },
    credentialSchema: { id: "uuid-1", type: "Diploma", version: 1 },
  };
  const prevHash = "abc123chain";

  it("client and edge-function module produce identical digests", async () => {
    const client = await computeCredentialHash(issuedVC, prevHash);
    const server = await edgeHash({ ...issuedVC, proof: { type: "sig" } }, prevHash);
    expect(client).toBe(server);
  });

  it("issue → store → verify round trip (verify from full credential_data)", async () => {
    // Issue step: hash computed BEFORE proof attachment (as in issue-credential).
    const issuedHash = await edgeHash(issuedVC, prevHash);
    // Store step: proof is appended to credential_data (as in the DB row).
    const stored = { ...issuedVC, proof: { type: "EcdsaSecp256k1Signature2019", proofValue: issuedHash.slice(0, 64) } };
    // Verify step: client recomputes from the STORED row using the same algorithm.
    const recomputed = await computeCredentialHash(stored, prevHash);
    expect(recomputed).toBe(issuedHash);
  });

  it("a tampered credential (key-order-independent) still yields a different digest", async () => {
    const tampered = { ...issuedVC, issuer: "did:decentraid:issuer:EVIL" };
    expect(await edgeHash(tampered, prevHash)).not.toBe(await computeCredentialHash(issuedVC, prevHash));
  });
});

describe("toBytes32", () => {
  it("pads a short hex to 64 chars", () => {
    const result = toBytes32("abc");
    expect(result).toBe("0x" + "abc".padStart(64, "0"));
  });

  it("strips 0x prefix before padding", () => {
    const result = toBytes32("0xabc");
    expect(result).toBe("0x" + "abc".padStart(64, "0"));
  });

  it("returns unchanged value when already 64 hex chars", () => {
    const hex = "a".repeat(64);
    expect(toBytes32(hex)).toBe("0x" + hex);
  });

  it("returns 0x + 64 zeros for empty input", () => {
    expect(toBytes32("")).toBe("0x" + "0".repeat(64));
  });
});
