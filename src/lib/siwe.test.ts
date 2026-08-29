import { describe, it, expect } from "vitest";
import {
  DEFAULT_SIWE_CHAIN_ID,
  SIWE_EMAIL_DOMAIN,
  SIWE_VERSION,
  buildSiweMessage,
  generateNonce,
  isBeforeActivation,
  isExpired,
  normalizeAddress,
  parseSiweMessage,
  validateSiweChallenge,
  walletToEmail,
  isoTimestamp,
  type ExpectedChallenge,
} from "./siwe";

const ADDRESS = "0x71C7656EC7ab88b098defB751B7401B5f6d8976F";
const LOWER = "0x71c7656ec7ab88b098defb751b7401b5f6d8976f";

const baseParams = {
  domain: "blockid.app",
  address: ADDRESS,
  uri: "https://blockid.app/login",
  nonce: "N0NCe12345",
};

const buildValid = () =>
  buildSiweMessage({
    ...baseParams,
    statement: "Sign in to BlockID.",
    issuedAt: "2026-01-01T00:00:00.000Z",
    expirationTime: "2026-01-01T00:10:00.000Z",
  });

describe("generateNonce", () => {
  it("defaults to 12 alphanumeric chars", () => {
    const nonce = generateNonce();
    expect(nonce).toHaveLength(12);
    expect(nonce).toMatch(/^[A-Za-z0-9]{12}$/);
  });

  it("honours custom lengths", () => {
    expect(generateNonce(8)).toHaveLength(8);
    expect(generateNonce(64)).toHaveLength(64);
  });

  it("produces unique nonces across calls", () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateNonce()));
    expect(seen.size).toBe(50);
  });

  it.each([0, 4, 7, 129, 12.5])("rejects invalid length %s", (len) => {
    expect(() => generateNonce(len)).toThrow(/length must be an integer between 8 and 128/);
  });
});

describe("normalizeAddress / walletToEmail", () => {
  it("lowercases and trims addresses", () => {
    expect(normalizeAddress(` ${ADDRESS} `)).toBe(LOWER);
  });

  it("maps a wallet to its synthetic identity email", () => {
    expect(walletToEmail(ADDRESS)).toBe(`${LOWER}@${SIWE_EMAIL_DOMAIN}`);
  });

  it("is case-insensitive for the same wallet", () => {
    expect(walletToEmail(LOWER)).toBe(walletToEmail(ADDRESS));
  });
});

describe("isoTimestamp", () => {
  it("emits valid ISO timestamps for now", () => {
    const before = Date.now();
    const ms = Date.parse(isoTimestamp());
    expect(ms).toBeGreaterThanOrEqual(before);
  });

  it("applies millisecond offsets", () => {
    const base = isoTimestamp();
    const offset = Date.parse(isoTimestamp(60_000));
    expect(offset - Date.parse(base)).toBeGreaterThanOrEqual(59_000);
    expect(offset - Date.parse(base)).toBeLessThanOrEqual(61_000);
  });
});

describe("buildSiweMessage", () => {
  it("renders the canonical EIP-4361 layout", () => {
    const msg = buildSiweMessage({ ...baseParams, statement: "Sign in to BlockID.", issuedAt: "2026-01-01T00:00:00.000Z" });
    expect(msg).toBe(
      [
        "blockid.app wants you to sign in with your Ethereum account:",
        ADDRESS,
        "",
        "Sign in to BlockID.",
        "",
        "URI: https://blockid.app/login",
        `Version: ${SIWE_VERSION}`,
        `Chain ID: ${DEFAULT_SIWE_CHAIN_ID}`,
        "Nonce: N0NCe12345",
        "Issued At: 2026-01-01T00:00:00.000Z",
      ].join("\n")
    );
  });

  it("omits statement block when absent", () => {
    const msg = buildSiweMessage({ ...baseParams, issuedAt: "2026-01-01T00:00:00.000Z" });
    expect(msg.split("\n")[2]).toBe("");
    expect(msg.split("\n")[3]).toMatch(/^URI:/);
  });

  it("appends optional temporal/request fields in spec order", () => {
    const msg = buildSiweMessage({
      ...baseParams,
      issuedAt: "2026-01-01T00:00:00.000Z",
      expirationTime: "2026-01-01T01:00:00.000Z",
      notBefore: "2026-01-01T00:05:00.000Z",
      requestId: "req-42",
    });
    const lines = msg.split("\n");
    const issuedIdx = lines.findIndex((l) => l.startsWith("Issued At:"));
    expect(lines[issuedIdx + 1]).toBe("Expiration Time: 2026-01-01T01:00:00.000Z");
    expect(lines[issuedIdx + 2]).toBe("Not Before: 2026-01-01T00:05:00.000Z");
    expect(lines[issuedIdx + 3]).toBe("Request ID: req-42");
  });

  it("renders resources as a trailing list", () => {
    const msg = buildSiweMessage({
      ...baseParams,
      issuedAt: "2026-01-01T00:00:00.000Z",
      resources: ["ipfs://QmY9...", "https://blockid.app/terms"],
    });
    const tail = msg.slice(msg.indexOf("\nResources:\n"));
    expect(tail).toBe("\nResources:\n- ipfs://QmY9...\n- https://blockid.app/terms");
  });

  it.each([
    [{ ...baseParams, domain: "" }, /domain is required/],
    [{ ...baseParams, domain: "two words" }, /domain is required/],
    [{ ...baseParams, address: "0xdeadbeef" }, /Invalid Ethereum address/],
    [{ ...baseParams, uri: "" }, /uri is required/],
    [{ ...baseParams, nonce: "" }, /nonce is required/],
  ] as Array<[Parameters<typeof buildSiweMessage>[0], RegExp]>)(
    "throws on invalid input %#",
    (params, pattern) => {
      expect(() => buildSiweMessage(params)).toThrow(pattern);
    }
  );
});

describe("parseSiweMessage", () => {
  it("roundtrips a built message with all fields", () => {
    const parsed = parseSiweMessage(
      buildSiweMessage({
        ...baseParams,
        statement: "Sign in to BlockID.",
        issuedAt: "2026-01-01T00:00:00.000Z",
        expirationTime: "2026-01-01T00:10:00.000Z",
        notBefore: "2026-01-01T00:02:00.000Z",
        requestId: "req-7",
        chainId: 137,
        version: "1",
        resources: ["ipfs://QmY9..."],
      })
    );
    expect(parsed).toEqual({
      domain: "blockid.app",
      address: ADDRESS,
      statement: "Sign in to BlockID.",
      uri: "https://blockid.app/login",
      version: "1",
      chainId: 137,
      nonce: "N0NCe12345",
      issuedAt: "2026-01-01T00:00:00.000Z",
      expirationTime: "2026-01-01T00:10:00.000Z",
      notBefore: "2026-01-01T00:02:00.000Z",
      requestId: "req-7",
      resources: ["ipfs://QmY9..."],
    });
  });

  it("preserves lowercase addresses as-is", () => {
    const parsed = parseSiweMessage(buildSiweMessage({ ...baseParams, address: LOWER }));
    expect(parsed?.address).toBe(LOWER);
  });

  it("normalises CRLF line endings", () => {
    const parsed = parseSiweMessage(buildValid().replace(/\n/g, "\r\n"));
    expect(parsed?.nonce).toBe("N0NCe12345");
  });

  it("returns undefined statement when absent", () => {
    const parsed = parseSiweMessage(buildSiweMessage(baseParams));
    expect(parsed?.statement).toBeUndefined();
  });

  it.each([
    ["", "empty string"],
    ["hello world this is not siwe", "plain text"],
    ["blockid.app wants you to sign in with your Ethereum account:\nnot-an-address\nURI: x\nVersion: 1\nChain ID: 1\nNonce: n\nIssued At: t", "invalid address"],
    ["blockid.app wants you to sign in with your Ethereum account:\n" + ADDRESS, "no fields at all"],
  ])("returns null for %s", (input) => {
    expect(parseSiweMessage(input)).toBeNull();
  });

  it("returns null when a required field line is stripped", () => {
    const stripped = buildValid()
      .split("\n")
      .filter((l) => !l.startsWith("Nonce:"))
      .join("\n");
    expect(parseSiweMessage(stripped)).toBeNull();
  });

  it("returns null when Chain ID is not numeric", () => {
    const broken = buildValid().replace("Chain ID: 11155111", "Chain ID: sepolia?");
    expect(parseSiweMessage(broken)).toBeNull();
  });

  it("keeps multi-line statements intact", () => {
    const parsed = parseSiweMessage(
      buildSiweMessage({
        ...baseParams,
        statement: "Line one.\nLine two.",
        issuedAt: "2026-01-01T00:00:00.000Z",
      })
    );
    expect(parsed?.statement).toBe("Line one.\nLine two.");
  });
});

describe("isExpired / isBeforeActivation", () => {
  const now = Date.parse("2026-06-15T12:00:00.000Z");

  const withTimes = (fields: { expirationTime?: string; notBefore?: string }) => ({
    ...parseSiweMessage(buildValid())!,
    ...fields,
  });

  it("flags past expiration times", () => {
    expect(isExpired(withTimes({ expirationTime: "2026-06-15T11:59:59.999Z" }), now)).toBe(true);
  });

  it("accepts future expiration times", () => {
    expect(isExpired(withTimes({ expirationTime: "2026-06-15T12:00:00.001Z" }), now)).toBe(false);
  });

  it("treats missing expiration as never-expiring", () => {
    expect(isExpired(withTimes({ expirationTime: undefined }), now)).toBe(false);
  });

  it("ignores malformed dates", () => {
    expect(isExpired(withTimes({ expirationTime: "tomorrow-ish" }), now)).toBe(false);
  });

  it("blocks messages whose notBefore is still in the future", () => {
    expect(isBeforeActivation(withTimes({ notBefore: "2026-06-15T12:00:00.001Z" }), now)).toBe(true);
  });

  it("allows messages once notBefore has passed", () => {
    expect(isBeforeActivation(withTimes({ notBefore: "2026-06-15T11:00:00.000Z" }), now)).toBe(false);
  });

  it("treats missing notBefore as immediately active", () => {
    expect(isBeforeActivation(withTimes({}), now)).toBe(false);
  });
});

describe("validateSiweChallenge", () => {
  const now = Date.parse("2026-06-15T12:00:00.000Z");

  const buildAt = (overrides: Record<string, unknown> = {}) =>
    buildSiweMessage({
      ...baseParams,
      issuedAt: "2026-06-15T11:58:00.000Z",
      expirationTime: "2026-06-15T12:08:00.000Z",
      ...overrides,
    } as Parameters<typeof buildSiweMessage>[0]);

  /** Unwrap the error message from a rejected validation result. */
  function invalidError(res: ReturnType<typeof validateSiweChallenge>): string {
    if (res.valid === true) throw new Error("Expected challenge to be rejected");
    return (res as { valid: false; error: string }).error;
  }

  it("accepts a well-formed challenge and returns the parsed fields", () => {
    const res = validateSiweChallenge(buildAt(), { nowMs: now });
    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.parsed.nonce).toBe("N0NCe12345");
      expect(res.parsed.chainId).toBe(DEFAULT_SIWE_CHAIN_ID);
    }
  });

  it("matches expected domain / uri / nonce / address / chain", () => {
    const res = validateSiweChallenge(
      buildAt(),
      { domain: "blockid.app", uri: "https://blockid.app/login", nonce: "N0NCe12345", address: LOWER, chainId: DEFAULT_SIWE_CHAIN_ID, nowMs: now }
    );
    expect(res.valid).toBe(true);
  });

  const mismatchCases: Array<[ExpectedChallenge, RegExp]> = [
    [{ domain: "evil.example" }, /Domain mismatch/],
    [{ uri: "https://phish.example/login" }, /URI mismatch/],
    [{ nonce: "different" }, /Nonce mismatch/],
    [{ address: "0x2222222222222222222222222222222222222222" }, /Address mismatch/],
    [{ chainId: 1 }, /Chain ID mismatch/],
  ];
  it.each(mismatchCases)("rejects binding mismatches (%#)", (expected, pattern) => {
    const res = validateSiweChallenge(buildAt(), { ...expected, nowMs: now });
    expect(res.valid).toBe(false);
    expect(invalidError(res)).toMatch(pattern);
  });

  it("compares addresses case-insensitively", () => {
    const res = validateSiweChallenge(buildAt(), { address: ADDRESS.toUpperCase(), nowMs: now });
    expect(res.valid).toBe(true);
  });

  it("rejects expired challenges", () => {
    const res = validateSiweChallenge(buildAt(), { nowMs: now + 11 * 60 * 1000 });
    expect(res.valid).toBe(false);
    expect(invalidError(res)).toBe("Challenge expired");
  });

  it("rejects challenges that are not yet active", () => {
    const early = buildSiweMessage({
      ...baseParams,
      issuedAt: "2026-06-15T11:58:00.000Z",
      expirationTime: "2026-06-15T12:30:00.000Z",
      notBefore: "2026-06-15T13:00:00.000Z",
    });
    const res = validateSiweChallenge(early, { nowMs: now });
    expect(res.valid).toBe(false);
    expect(invalidError(res)).toBe("Challenge not yet active");
  });

  it("rejects malformed messages", () => {
    expect(validateSiweChallenge("", {})).toEqual({ valid: false, error: "Malformed EIP-4361 message" });
  });

  it("rejects unsupported versions", () => {
    const v2 = buildAt().replace("Version: 1", "Version: 2");
    const res = validateSiweChallenge(v2, { nowMs: now });
    expect(res.valid).toBe(false);
    expect(invalidError(res)).toBe("Unsupported SIWE version");
  });
});
