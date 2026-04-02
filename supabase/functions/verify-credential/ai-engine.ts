/**
 * BlockID Credential AI Engine
 * ─────────────────────────────
 * Self-contained heuristic credential analysis.
 * No external API. Always runs regardless of environment variables.
 *
 * Scores 8 weighted dimensions, produces risk_level, confidence,
 * findings, recommendations, and a per-dimension breakdown.
 */

export interface CredentialInput {
  /** The raw credential_data JSON from the DB */
  vc: Record<string, unknown>;
  /** True if the SHA-256 hash of canonical JSON matches stored hash */
  hashValid: boolean;
  /** DB status field ("active" | "revoked" | ...) */
  dbStatus: string;
  /** True if the CredentialRegistry contract confirms anchoring */
  blockchainVerified: boolean;
  /** True if the on-chain record shows revoked = true */
  onChainRevoked: boolean;
  /** True if the credential carries a real wallet signature (personal_sign) */
  walletSigned: boolean;
  /** Ethereum address of the signer, or null */
  signerAddress: string | null;
  /** ISO string of the DB issued_at timestamp */
  issuedAt: string | null;
  /** ISO string of DB expires_at, or null */
  expiresAt: string | null;
  /** The stored credential_hash (hex) */
  credentialHash: string;
  /** The blockchain_anchor field from the DB (txHash or null) */
  blockchainAnchor: string | null;
}

export interface DimensionScore {
  name: string;
  key: string;
  score: number;   // 0-100
  weight: number;  // relative weight, sums to 100
  status: "pass" | "warn" | "fail" | "unknown";
  detail: string;
}

export interface AIAnalysisResult {
  /** Overall weighted score 0-100 */
  score: number;
  /** "low" | "medium" | "high" */
  risk_level: "low" | "medium" | "high";
  /** 0-100 confidence in the overall assessment */
  confidence: number;
  /** Short natural-language findings */
  findings: string[];
  /** Actionable recommendations */
  recommendations: string[];
  /** Per-dimension breakdown */
  dimensions: DimensionScore[];
  /** ISO timestamp of this analysis */
  analyzed_at: string;
  /** Engine version for traceability */
  engine: "heuristic-v1" | "gemini-enhanced-v1";
}

// ─── Dimension weights (must sum to 100) ─────────────────────────────────────
const WEIGHTS = {
  hashIntegrity:    20,
  blockchainAnchor: 20,
  revocationStatus: 15,
  expiration:       10,
  issuerTrust:      10,
  cryptoProof:      10,
  dataQuality:      10,
  temporalConsist:   5,
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isDIDWellFormed(did: unknown): boolean {
  if (typeof did !== "string") return false;
  return /^did:[a-z0-9]+:[a-zA-Z0-9._:%-]+$/.test(did);
}

function daysUntil(isoDate: string): number {
  return Math.floor((new Date(isoDate).getTime() - Date.now()) / 86_400_000);
}

function daysSince(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000);
}

function hasRequiredVCFields(vc: Record<string, unknown>): { ok: boolean; missing: string[] } {
  const required = ["@context", "type", "issuer", "issuanceDate", "credentialSubject"];
  const missing = required.filter((k) => !vc[k]);
  return { ok: missing.length === 0, missing };
}

// ─── Dimension scorers ────────────────────────────────────────────────────────

function scoreHashIntegrity(input: CredentialInput): DimensionScore {
  const { score, status, detail } = input.hashValid
    ? { score: 100, status: "pass" as const, detail: "SHA-256 hash matches stored digest. No tampering detected." }
    : { score: 0,   status: "fail" as const, detail: "Hash mismatch — credential data has been tampered with or is corrupted." };
  return { name: "Hash Integrity", key: "hashIntegrity", score, weight: WEIGHTS.hashIntegrity, status, detail };
}

function scoreBlockchainAnchor(input: CredentialInput): DimensionScore {
  if (input.blockchainVerified) {
    return {
      name: "Blockchain Anchoring", key: "blockchainAnchor",
      score: 100, weight: WEIGHTS.blockchainAnchor, status: "pass",
      detail: "Credential hash confirmed anchored in the CredentialRegistry smart contract on Polygon Amoy.",
    };
  }
  if (input.blockchainAnchor) {
    return {
      name: "Blockchain Anchoring", key: "blockchainAnchor",
      score: 40, weight: WEIGHTS.blockchainAnchor, status: "warn",
      detail: "Blockchain anchor transaction hash is recorded, but on-chain contract verification could not be confirmed. May be an RPC issue.",
    };
  }
  return {
    name: "Blockchain Anchoring", key: "blockchainAnchor",
    score: 0, weight: WEIGHTS.blockchainAnchor, status: "fail",
    detail: "No on-chain anchor found. Credential has not been recorded on the blockchain.",
  };
}

function scoreRevocationStatus(input: CredentialInput): DimensionScore {
  const dbOk = input.dbStatus === "active";
  const onchainOk = !input.onChainRevoked;

  if (dbOk && onchainOk) {
    return {
      name: "Revocation Status", key: "revocationStatus",
      score: 100, weight: WEIGHTS.revocationStatus, status: "pass",
      detail: "Credential is active in database and not revoked on-chain.",
    };
  }
  if (!dbOk && !onchainOk) {
    return {
      name: "Revocation Status", key: "revocationStatus",
      score: 0, weight: WEIGHTS.revocationStatus, status: "fail",
      detail: `Credential is revoked both in the database (status: ${input.dbStatus}) and on-chain.`,
    };
  }
  if (!dbOk) {
    return {
      name: "Revocation Status", key: "revocationStatus",
      score: 5, weight: WEIGHTS.revocationStatus, status: "fail",
      detail: `Credential status is "${input.dbStatus}" in database. It is not active.`,
    };
  }
  // on-chain revoked but DB says active — inconsistency
  return {
    name: "Revocation Status", key: "revocationStatus",
    score: 20, weight: WEIGHTS.revocationStatus, status: "warn",
    detail: "Database shows active, but on-chain registry marks this credential as revoked. Possible desync.",
  };
}

function scoreExpiration(input: CredentialInput): DimensionScore {
  if (!input.expiresAt) {
    return {
      name: "Expiration", key: "expiration",
      score: 85, weight: WEIGHTS.expiration, status: "pass",
      detail: "No expiration date set. Credential is perpetual (consider adding an expiry for better security).",
    };
  }
  const days = daysUntil(input.expiresAt);
  if (days < 0) {
    return {
      name: "Expiration", key: "expiration",
      score: 0, weight: WEIGHTS.expiration, status: "fail",
      detail: `Credential expired ${Math.abs(days)} day(s) ago (${new Date(input.expiresAt).toLocaleDateString()}).`,
    };
  }
  if (days < 30) {
    return {
      name: "Expiration", key: "expiration",
      score: 50, weight: WEIGHTS.expiration, status: "warn",
      detail: `Credential expires in ${days} day(s) — expires soon on ${new Date(input.expiresAt).toLocaleDateString()}.`,
    };
  }
  return {
    name: "Expiration", key: "expiration",
    score: 100, weight: WEIGHTS.expiration, status: "pass",
    detail: `Credential is valid until ${new Date(input.expiresAt).toLocaleDateString()} (${days} days remaining).`,
  };
}

function scoreIssuerTrust(input: CredentialInput): DimensionScore {
  const issuer = input.vc.issuer;
  const issuerStr = typeof issuer === "object" && issuer !== null
    ? (issuer as Record<string, unknown>).id as string
    : issuer as string;

  if (!issuerStr) {
    return {
      name: "Issuer Trust", key: "issuerTrust",
      score: 0, weight: WEIGHTS.issuerTrust, status: "fail",
      detail: "No issuer DID found in the credential.",
    };
  }
  if (!isDIDWellFormed(issuerStr)) {
    return {
      name: "Issuer Trust", key: "issuerTrust",
      score: 30, weight: WEIGHTS.issuerTrust, status: "warn",
      detail: `Issuer identifier "${issuerStr}" does not conform to DID specification format.`,
    };
  }

  // Check for known BlockID DID prefixes
  const isDecentraidDID = issuerStr.startsWith("did:decentraid:");
  const score = isDecentraidDID ? 100 : 75;
  const detail = isDecentraidDID
    ? `Issuer ${issuerStr} is a recognized BlockID platform DID.`
    : `Issuer ${issuerStr} is a well-formed DID (external issuer).`;

  return { name: "Issuer Trust", key: "issuerTrust", score, weight: WEIGHTS.issuerTrust, status: "pass", detail };
}

function scoreCryptoProof(input: CredentialInput): DimensionScore {
  if (input.walletSigned && input.signerAddress) {
    return {
      name: "Cryptographic Proof", key: "cryptoProof",
      score: 100, weight: WEIGHTS.cryptoProof, status: "pass",
      detail: `Credential carries a real wallet signature (personal_sign). Signer: ${input.signerAddress.substring(0, 10)}...`,
    };
  }
  const proof = input.vc.proof as Record<string, unknown> | undefined;
  if (proof) {
    return {
      name: "Cryptographic Proof", key: "cryptoProof",
      score: 60, weight: WEIGHTS.cryptoProof, status: "warn",
      detail: `Credential has a proof of type "${proof.type || "unknown"}" but no cryptographic wallet signature detected.`,
    };
  }
  return {
    name: "Cryptographic Proof", key: "cryptoProof",
    score: 20, weight: WEIGHTS.cryptoProof, status: "warn",
    detail: "No cryptographic proof attached. Authenticity relies on database integrity alone.",
  };
}

function scoreDataQuality(input: CredentialInput): DimensionScore {
  const { ok, missing } = hasRequiredVCFields(input.vc);
  const subject = input.vc.credentialSubject as Record<string, unknown> | undefined;
  const subjectId = subject?.id;
  const typeArr = Array.isArray(input.vc.type) ? input.vc.type : [];
  const hasVCType = typeArr.includes("VerifiableCredential");

  if (!ok) {
    return {
      name: "Data Quality", key: "dataQuality",
      score: 20, weight: WEIGHTS.dataQuality, status: "fail",
      detail: `Credential is missing required W3C VC fields: ${missing.join(", ")}.`,
    };
  }
  const issues: string[] = [];
  if (!subjectId || !isDIDWellFormed(subjectId as string)) issues.push("credentialSubject.id is not a valid DID");
  if (!hasVCType) issues.push("type array does not include 'VerifiableCredential'");

  if (issues.length > 0) {
    return {
      name: "Data Quality", key: "dataQuality",
      score: 65, weight: WEIGHTS.dataQuality, status: "warn",
      detail: `Credential has minor data quality issues: ${issues.join("; ")}.`,
    };
  }
  return {
    name: "Data Quality", key: "dataQuality",
    score: 100, weight: WEIGHTS.dataQuality, status: "pass",
    detail: "Credential contains all required W3C VC fields and subject identifiers are well-formed.",
  };
}

function scoreTemporalConsistency(input: CredentialInput): DimensionScore {
  const vcIssuance = input.vc.issuanceDate as string | undefined;
  if (!vcIssuance) {
    return {
      name: "Temporal Consistency", key: "temporalConsist",
      score: 30, weight: WEIGHTS.temporalConsist, status: "warn",
      detail: "No issuanceDate found in the credential data.",
    };
  }

  const vcDate = new Date(vcIssuance);
  const now = new Date();

  if (vcDate > now) {
    return {
      name: "Temporal Consistency", key: "temporalConsist",
      score: 10, weight: WEIGHTS.temporalConsist, status: "fail",
      detail: `issuanceDate (${vcDate.toLocaleDateString()}) is in the future — this is suspicious.`,
    };
  }

  // Compare with DB issued_at if available
  if (input.issuedAt) {
    const dbDate = new Date(input.issuedAt);
    const diffHours = Math.abs(vcDate.getTime() - dbDate.getTime()) / 3_600_000;
    if (diffHours > 48) {
      return {
        name: "Temporal Consistency", key: "temporalConsist",
        score: 50, weight: WEIGHTS.temporalConsist, status: "warn",
        detail: `issuanceDate in VC (${vcDate.toLocaleDateString()}) differs from DB issued_at (${dbDate.toLocaleDateString()}) by more than 48 hours.`,
      };
    }
  }

  const ageDays = daysSince(vcIssuance);
  return {
    name: "Temporal Consistency", key: "temporalConsist",
    score: 100, weight: WEIGHTS.temporalConsist, status: "pass",
    detail: `Credential was issued ${ageDays} day(s) ago. Timestamps are internally consistent.`,
  };
}

// ─── Main analysis function ───────────────────────────────────────────────────

export function analyzeCredential(input: CredentialInput): AIAnalysisResult {
  const dimensions: DimensionScore[] = [
    scoreHashIntegrity(input),
    scoreBlockchainAnchor(input),
    scoreRevocationStatus(input),
    scoreExpiration(input),
    scoreIssuerTrust(input),
    scoreCryptoProof(input),
    scoreDataQuality(input),
    scoreTemporalConsistency(input),
  ];

  // Weighted average score
  const totalWeight = dimensions.reduce((s, d) => s + d.weight, 0);
  const weightedScore = dimensions.reduce((s, d) => s + (d.score * d.weight), 0) / totalWeight;
  const score = Math.round(weightedScore);

  // Risk level
  const risk_level: "low" | "medium" | "high" =
    score >= 75 ? "low" : score >= 45 ? "medium" : "high";

  // Confidence: how many dimensions returned definitive (not "unknown") answers
  const definitive = dimensions.filter(d => d.status !== "unknown").length;
  const confidence = Math.round((definitive / dimensions.length) * 100);

  // Build findings from failed/warned dimensions
  const findings: string[] = [];
  const recommendations: string[] = [];

  for (const dim of dimensions) {
    if (dim.status === "fail") {
      findings.push(`❌ ${dim.name}: ${dim.detail}`);
    } else if (dim.status === "warn") {
      findings.push(`⚠️ ${dim.name}: ${dim.detail}`);
    } else if (dim.status === "pass") {
      findings.push(`✅ ${dim.name}: ${dim.detail}`);
    }
  }

  // Targeted recommendations
  if (!input.hashValid)           recommendations.push("Re-issue the credential — the hash mismatch indicates data corruption or tampering.");
  if (!input.blockchainVerified)  recommendations.push("Anchor this credential on-chain via the BlockID issuer portal to establish immutable proof.");
  if (!input.walletSigned)        recommendations.push("Request that the issuer re-sign the credential with a MetaMask wallet for stronger cryptographic proof.");
  if (input.expiresAt && daysUntil(input.expiresAt) < 30 && daysUntil(input.expiresAt) >= 0)
                                  recommendations.push("Contact the issuer to renew this credential before it expires.");
  if (input.dbStatus !== "active") recommendations.push("This credential has been revoked. Contact the issuer if you believe this is an error.");
  if (recommendations.length === 0) recommendations.push("No action required. This credential passed all verification checks.");

  return {
    score,
    risk_level,
    confidence,
    findings,
    recommendations,
    dimensions,
    analyzed_at: new Date().toISOString(),
    engine: "heuristic-v1",
  };
}

// ─── Gemini enhancement (called if GEMINI_API_KEY is set) ────────────────────

export async function enhanceWithGemini(
  baseResult: AIAnalysisResult,
  input: CredentialInput,
  apiKey: string
): Promise<AIAnalysisResult> {
  const systemPrompt = `You are BlockID's credential verification AI. You receive a structured heuristic analysis of a W3C Verifiable Credential and must enhance it with deeper insight.

Rules:
1. Return ONLY valid JSON. No markdown, no explanation.
2. Schema: { "enhanced_findings": string[], "enhanced_recommendations": string[], "gemini_summary": string, "adjusted_risk_level": "low"|"medium"|"high"|null }
3. "adjusted_risk_level" should be null if you agree with the heuristic, or override if you detect something the heuristic missed.
4. "gemini_summary" is a 1-2 sentence plain English summary of the verification for a non-technical audience.
5. Keep all arrays under 5 items.`;

  const userPrompt = `Heuristic result: ${JSON.stringify({
    score: baseResult.score,
    risk_level: baseResult.risk_level,
    confidence: baseResult.confidence,
    dimensions: baseResult.dimensions.map(d => ({ key: d.key, score: d.score, status: d.status, detail: d.detail })),
  })}

Credential snapshot: ${JSON.stringify({
    type: input.vc.type,
    issuer: input.vc.issuer,
    issuanceDate: input.vc.issuanceDate,
    expirationDate: (input.vc as Record<string, unknown>).expirationDate,
    hasSubject: !!input.vc.credentialSubject,
    hashValid: input.hashValid,
    blockchainVerified: input.blockchainVerified,
    walletSigned: input.walletSigned,
    dbStatus: input.dbStatus,
  })}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
        }),
      }
    );

    if (!res.ok) {
      console.warn("Gemini API error:", res.status, await res.text());
      return baseResult;
    }

    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return baseResult;

    const geminiData = JSON.parse(jsonMatch[0]) as {
      enhanced_findings?: string[];
      enhanced_recommendations?: string[];
      gemini_summary?: string;
      adjusted_risk_level?: "low" | "medium" | "high" | null;
    };

    // Merge Gemini enhancements into base result
    const merged: AIAnalysisResult = {
      ...baseResult,
      engine: "gemini-enhanced-v1",
      risk_level: geminiData.adjusted_risk_level ?? baseResult.risk_level,
      findings: [
        ...(geminiData.gemini_summary ? [`🤖 AI Summary: ${geminiData.gemini_summary}`] : []),
        ...baseResult.findings,
        ...(geminiData.enhanced_findings ?? []).map(f => `🔍 ${f}`),
      ],
      recommendations: [
        ...(geminiData.enhanced_recommendations ?? []),
        ...baseResult.recommendations,
      ].filter((v, i, arr) => arr.indexOf(v) === i).slice(0, 6),
    };

    return merged;
  } catch (err) {
    console.error("Gemini enhancement failed, using heuristic result:", err);
    return baseResult;
  }
}
