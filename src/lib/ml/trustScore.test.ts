import { describe, it, expect } from "vitest";
import {
  analyzeCredential,
  computeTrustScore,
  scoreToTier,
  toCredentialSignals,
  TIER_LABELS,
  DIMENSION_WEIGHTS,
  type CredentialSignals,
} from "./trustScore";

const NOW = Date.parse("2026-06-01T12:00:00Z");

/** A credential where every signal is present, verified and consistent. */
const perfect: CredentialSignals = {
  vc: {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    type: ["VerifiableCredential", "UniversityDegreeCredential"],
    issuer: "did:decentraid:issuer-1",
    issuanceDate: "2024-01-01T00:00:00.000Z",
    expirationDate: "2030-01-01T00:00:00.000Z",
    credentialSubject: {
      id: "did:decentraid:holder-1",
      degree: "BSc Computer Science",
    },
  },
  hashChecked: true,
  hashValid: true,
  dbStatus: "active",
  blockchainVerified: true,
  onChainRevoked: false,
  blockchainAnchor: "0xabc123",
  onChainChecked: true,
  walletSigned: true,
  signatureVerified: true,
  signerAddress: "0xholder",
  issuedAt: "2024-01-01T00:00:00.000Z",
  expiresAt: "2030-01-01T00:00:00.000Z",
  notExpired: true,
  credentialHash: "sha256:deadbeef",
  issuerReputation: 100,
  verificationSuccessRate: 1,
  credentialAgeDays: 400,
  zkProofVerified: true,
  schemaKnown: true,
};

const run = (signals: Partial<CredentialSignals>) =>
  analyzeCredential({ ...perfect, ...signals }, { now: NOW });

const dim = (res: ReturnType<typeof analyzeCredential>, key: string) =>
  res.dimensions.find((d) => d.key === key)!;

const capKeys = (res: ReturnType<typeof analyzeCredential>) =>
  res.hard_caps_applied.map((c) => c.key).sort();

describe("DIMENSION_WEIGHTS", () => {
  it("sums to exactly 100", () => {
    const total = Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });

  it("covers the eight dimensions the engine reports", () => {
    expect(Object.keys(DIMENSION_WEIGHTS)).toHaveLength(8);
  });
});

describe("analyzeCredential", () => {
  it("awards a perfect score with platinum tier when every signal is verified", () => {
    const res = run({});
    expect(res.raw_score).toBe(100);
    expect(res.score).toBe(100);
    expect(res.tier).toBe("platinum");
    expect(res.risk_level).toBe("low");
    expect(res.hard_caps_applied).toEqual([]);
    expect(res.confidence).toBe(100);
    expect(res.dimensions.every((d) => d.status === "pass")).toBe(true);
  });

  it("is deterministic for identical inputs", () => {
    const a = run({});
    const b = run({});
    expect(a).toEqual(b);
  });

  it("stamps a fixed analysis time so replays agree", () => {
    expect(run({}).analyzed_at).toBe(new Date(NOW).toISOString());
  });

  it("charges a failed dimension its own weight and nothing more", () => {
    const res = run({ zkProofVerified: false, signatureVerified: false });
    expect(dim(res, "cryptoProof").score).toBe(0);
    expect(res.raw_score).toBe(100 - DIMENSION_WEIGHTS.cryptoProof);
    // A signature that does not verify zeroes the dimension but is not a hard
    // cap: the anchor still independently attests to the credential, so the
    // score is not ceilinged. `critical` on the dimension is what marks it for
    // the accept/reject decision, not the cap.
    expect(res.hard_caps_applied).toEqual([]);
  });

  it("does not call a credential unprovable when a signature was presented", () => {
    // A signature that fails verification is still an attestation attempt, so
    // the credential is unanchored rather than unattested. Collapsing the two
    // would apply the tighter 30 cap to a signature bug.
    const res = run({ signatureVerified: false, blockchainVerified: false, blockchainAnchor: null });
    expect(capKeys(res)).toEqual(["unanchored"]);
  });
});

describe("unknown evidence", () => {
  it("reports hash integrity as unknown when it was never checked", () => {
    const res = run({ hashChecked: false });
    expect(dim(res, "hashIntegrity").status).toBe("unknown");
    expect(capKeys(res)).not.toContain("hashMismatch");
    expect(res.confidence).toBeLessThan(100);
    expect(res.confidence_factors.map((f) => f.key)).toContain("hashNotChecked");
  });

  it("does not cap an unanchored credential when the chain was unreachable", () => {
    const res = run({ blockchainVerified: false, blockchainAnchor: null, onChainChecked: false });
    expect(dim(res, "blockchainAnchor").status).toBe("unknown");
    expect(capKeys(res)).not.toContain("unanchored");
    expect(res.confidence_factors.map((f) => f.key)).toContain("onChainUnreachable");
  });

  it("does not invent an expiry when the credential is undated", () => {
    const res = run({ expiresAt: null, notExpired: null });
    expect(dim(res, "expiration").status).toBe("warn");
    expect(capKeys(res)).not.toContain("expired");
    expect(res.confidence_factors.map((f) => f.key)).toContain("expirationUnknown");
  });

  it("keeps confidence strictly between the floor and 100 on sparse evidence", () => {
    const res = analyzeCredential(
      {
        vc: {},
        hashChecked: false,
        hashValid: false,
        dbStatus: "active",
        blockchainVerified: false,
        onChainRevoked: false,
        blockchainAnchor: null,
        onChainChecked: false,
        walletSigned: false,
        signatureVerified: null,
        signerAddress: null,
        issuedAt: null,
        expiresAt: null,
        notExpired: null,
        credentialHash: "",
        issuerReputation: null,
        verificationSuccessRate: null,
        credentialAgeDays: null,
        zkProofVerified: null,
        schemaKnown: null,
      },
      { now: NOW },
    );
    expect(res.confidence).toBeGreaterThan(0);
    expect(res.confidence).toBeLessThan(100);
    expect(res.confidence_factors.length).toBeGreaterThan(5);
  });

  it("describes a positively-known failure with high confidence", () => {
    // Confidence measures evidence coverage, not the outcome: a credential we
    // confirmed is revoked is described with more confidence than one we could
    // not check at all.
    const revoked = run({ dbStatus: "revoked" });
    const unchecked = run({ hashChecked: false, blockchainVerified: false, onChainChecked: false });
    expect(revoked.confidence).toBe(100);
    expect(unchecked.confidence).toBeLessThan(revoked.confidence);
  });
});

describe("hard caps", () => {
  it("caps a confirmed hash mismatch", () => {
    const res = run({ hashValid: false });
    expect(dim(res, "hashIntegrity").status).toBe("fail");
    expect(capKeys(res)).toContain("hashMismatch");
    expect(res.score).toBeLessThanOrEqual(20);
    expect(res.score).toBeLessThan(res.raw_score);
    expect(res.tier).toBe("untrusted");
  });

  it("caps a revoked credential regardless of other strong signals", () => {
    const res = run({ onChainRevoked: true });
    expect(dim(res, "revocationStatus").status).toBe("fail");
    expect(capKeys(res)).toContain("revoked");
    expect(res.score).toBeLessThanOrEqual(20);
  });

  it("trusts the chain over the database when they disagree on revocation", () => {
    const res = run({ dbStatus: "active", onChainRevoked: true });
    expect(dim(res, "revocationStatus").detail).toMatch(/authoritative/i);
  });

  it("caps an expired credential", () => {
    const res = run({ expiresAt: "2020-01-01T00:00:00.000Z" });
    expect(dim(res, "expiration").status).toBe("fail");
    expect(capKeys(res)).toContain("expired");
    expect(res.score).toBeLessThanOrEqual(40);
  });

  it("caps a credential that was checked on-chain and has no anchor", () => {
    const res = run({ blockchainVerified: false, blockchainAnchor: null, onChainChecked: true });
    expect(dim(res, "blockchainAnchor").status).toBe("fail");
    expect(capKeys(res)).toContain("unanchored");
  });

  it("caps a credential with no proof and no anchor at all", () => {
    const res = run({
      walletSigned: false,
      signatureVerified: null,
      zkProofVerified: false,
      blockchainVerified: false,
      blockchainAnchor: null,
      onChainChecked: true,
    });
    expect(capKeys(res)).toContain("unprovable");
    expect(res.score).toBeLessThanOrEqual(30);
  });

  it("lists every applicable cap and applies only the tightest", () => {
    const res = run({
      hashValid: false,
      dbStatus: "revoked",
      expiresAt: "2020-01-01T00:00:00.000Z",
      blockchainVerified: false,
      blockchainAnchor: null,
    });
    expect(capKeys(res)).toEqual(["expired", "hashMismatch", "revoked", "unanchored"]);
    expect(res.score).toBe(Math.min(...res.hard_caps_applied.map((c) => c.cap)));
  });

  it("explains every cap it applies in the findings", () => {
    const res = run({ hashValid: false });
    expect(res.findings.some((f) => f.includes("Score capped at"))).toBe(true);
  });
});

describe("risk level", () => {
  it("is low for a clean credential", () => {
    expect(run({}).risk_level).toBe("low");
  });

  it("is high once a hard cap binds", () => {
    expect(run({ hashValid: false }).risk_level).toBe("high");
    expect(run({ onChainRevoked: true }).risk_level).toBe("high");
  });

  it("tracks the score bands rather than the confidence", () => {
    // A credential we could barely check is high-risk on a high-confidence
    // finding: the two figures are independent by design.
    const res = run({ hashValid: false, blockchainVerified: false, blockchainAnchor: null, onChainChecked: true });
    expect(res.confidence).toBe(100);
    expect(res.risk_level).toBe("high");
  });
});

describe("explainability", () => {
  it("emits one finding per dimension", () => {
    const res = run({ hashValid: false });
    expect(res.findings.length).toBeGreaterThanOrEqual(res.dimensions.length);
    for (const d of res.dimensions) {
      expect(res.findings.some((f) => f.includes(d.name))).toBe(true);
    }
  });

  it("adds a confidence finding only when confidence was actually reduced", () => {
    expect(run({}).findings.some((f) => f.includes("Confidence"))).toBe(false);
    expect(run({ hashChecked: false }).findings.some((f) => f.includes("Confidence"))).toBe(true);
  });

  it("gives every dimension a weight from the table and a non-empty detail", () => {
    const res = run({});
    for (const d of res.dimensions) {
      expect(d.weight).toBe(DIMENSION_WEIGHTS[d.key]);
      expect(d.detail.length).toBeGreaterThan(0);
      expect(d.score).toBeGreaterThanOrEqual(0);
      expect(d.score).toBeLessThanOrEqual(100);
    }
  });

  it("carries no LLM narrative unless one is attached", () => {
    expect(run({}).llm).toBeNull();
  });
});

describe("toCredentialSignals", () => {
  it("treats an unsupplied hash result as unchecked rather than valid", () => {
    const signals = toCredentialSignals({ signatureValid: true, anchoredOnChain: true, notRevoked: true });
    expect(signals.hashChecked).toBe(false);
    expect(signals.hashValid).toBe(false);
  });

  it("treats an absent signature as unverifiable, not as a failure", () => {
    const signals = toCredentialSignals({ anchoredOnChain: true });
    expect(signals.walletSigned).toBe(false);
    expect(signals.signatureVerified).toBeNull();
  });

  it("defaults an omitted revocation to active", () => {
    expect(toCredentialSignals({}).dbStatus).toBe("active");
  });
});

describe("computeTrustScore adapter", () => {
  it("maps engine dimensions onto the client factor shape", () => {
    const res = computeTrustScore({
      signatureValid: true,
      anchoredOnChain: true,
      notRevoked: true,
      notExpired: true,
      hashValid: true,
    });
    expect(res.factors).toHaveLength(8);
    expect(res.factors.reduce((s, f) => s + f.points, 0)).toBeGreaterThan(0);
    expect(res.dimensions).toHaveLength(8);
    expect(res.hardCaps).toEqual([]);
    // Same eight dimensions on both views, order aside: the adapter sorts
    // factors by points while the engine keeps the weight-table order.
    expect([...res.dimensions.map((d) => d.key)].sort()).toEqual(res.factors.map((f) => f.key).sort());
  });

  it("carries the engine's caps through unchanged", () => {
    const res = computeTrustScore({
      signatureValid: true,
      anchoredOnChain: false,
      onChainChecked: true,
      notRevoked: false,
    });
    expect(res.hardCaps.length).toBeGreaterThan(0);
    for (const cap of res.hardCaps) {
      expect(res.score).toBeLessThanOrEqual(cap.cap);
    }
  });

  it("sorts factors by points descending", () => {
    const res = computeTrustScore({ signatureValid: true, anchoredOnChain: true, notRevoked: true });
    const points = res.factors.map((f) => f.points);
    expect([...points].sort((a, b) => b - a)).toEqual(points);
  });

  it("never reports a hash failure when the caller supplied no hash signal", () => {
    const res = computeTrustScore({ signatureValid: true, anchoredOnChain: true, notRevoked: true });
    expect(res.hardCaps.map((c) => c.key)).not.toContain("hashMismatch");
    expect(res.dimensions.find((d) => d.key === "hashIntegrity")!.status).toBe("unknown");
  });

  it("flags a revoked credential as a critical failure", () => {
    const res = computeTrustScore({ notRevoked: false, anchoredOnChain: true });
    expect(res.criticalFailures).toContain("revocationStatus");
  });
});

describe("scoreToTier", () => {
  it.each([
    [100, "platinum"],
    [90, "platinum"],
    [89, "gold"],
    [75, "gold"],
    [74, "silver"],
    [60, "silver"],
    [59, "bronze"],
    [40, "bronze"],
    [39, "untrusted"],
    [0, "untrusted"],
  ] as const)("tier(%s) → %s", (score, tier) => {
    expect(scoreToTier(score)).toBe(tier);
  });

  it("labels every tier", () => {
    for (const tier of Object.values(TIER_LABELS)) expect(typeof tier).toBe("string");
    expect(Object.keys(TIER_LABELS)).toHaveLength(5);
  });
});
