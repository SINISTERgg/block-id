/**
 * vpUtils.ts — Verifiable Presentation generation utilities.
 *
 * Supports 4 export formats:
 *   1. W3C VP JSON  — standard VerifiablePresentation object
 *   2. VP-JWT       — compact base64url-encoded signed presentation
 *   3. QR payload   — the VP-JWT string ready to be encoded as a QR code
 *   4. Etherscan    — link to the on-chain anchor transaction / contract
 *
 * Signing uses ethers `personal_sign` (EIP-191) via the connected wallet.
 * The resulting signature is embedded as the VP's `proof.proofValue`.
 */

import { BrowserProvider } from "ethers";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VPInput {
  credentialData: Record<string, unknown>;
  credentialHash: string;
  blockchainAnchor: string | null;
  holderDid: string;
  holderAddress: string;
}

export interface VerifiablePresentation {
  "@context": string[];
  type: string[];
  id: string;
  holder: string;
  verifiableCredential: Record<string, unknown>[];
  proof: {
    type: string;
    created: string;
    proofPurpose: string;
    verificationMethod: string;
    proofValue: string;
  };
}

export interface VPExportResult {
  vpJson: VerifiablePresentation;
  vpJwt: string;            // compact base64url token
  qrPayload: string;        // the string to encode in a QR code (= vpJwt)
  etherscanUrl: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function base64urlEncode(str: string): string {
  // Use TextEncoder so that Unicode / non-Latin-1 characters are handled
  // correctly. btoa() only accepts Latin-1 and throws for anything outside
  // the 0-255 range, which causes a crash for credentials with accented
  // characters or emoji in the subject fields.
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function base64urlEncodeObj(obj: unknown): string {
  return base64urlEncode(JSON.stringify(obj));
}

/**
 * Strip or truncate fields that would make the QR payload too large for
 * most QR scanners (practical limit ~2 KB for high-density codes).
 */
function sanitizeForQR(credData: Record<string, unknown>): Record<string, unknown> {
  const clone = { ...credData };
  // Remove large embedded proof blobs that are not needed in the VP QR code
  if (clone.proof && typeof clone.proof === "object") {
    const p = clone.proof as Record<string, unknown>;
    if (typeof p.jws === "string" && p.jws.length > 200) p.jws = p.jws.slice(0, 200) + "…";
    if (typeof p.proofValue === "string" && p.proofValue.length > 200) p.proofValue = p.proofValue.slice(0, 200) + "…";
  }
  // Drop any top-level key whose value is a very long string (> 500 chars)
  for (const key of Object.keys(clone)) {
    if (typeof clone[key] === "string" && (clone[key] as string).length > 500) {
      clone[key] = (clone[key] as string).slice(0, 500) + "…";
    }
  }
  return clone;
}

const SEPOLIA_EXPLORER = "https://sepolia.etherscan.io";

function buildEtherscanUrl(anchor: string | null): string | null {
  if (!anchor) return null;
  if (anchor.startsWith("0x") && anchor.length === 66) {
    // It's a tx hash
    return `${SEPOLIA_EXPLORER}/tx/${anchor}`;
  }
  if (anchor.startsWith("0x") && anchor.length === 42) {
    // It's a contract address
    return `${SEPOLIA_EXPLORER}/address/${anchor}`;
  }
  return null;
}

// ─── Main generator ───────────────────────────────────────────────────────────

/**
 * Build and sign a Verifiable Presentation in all 4 export formats.
 * Requires a connected MetaMask wallet (window.ethereum).
 */
export async function generateVP(input: VPInput): Promise<VPExportResult> {
  const { credentialData, credentialHash, blockchainAnchor, holderDid, holderAddress } = input;

  const presentationId = `urn:uuid:${crypto.randomUUID()}`;
  const created = new Date().toISOString();

  // ── 1. Build unsigned VP ──────────────────────────────────────────────────
  const vpUnsigned: Omit<VerifiablePresentation, "proof"> = {
    "@context": [
      "https://www.w3.org/2018/credentials/v1",
      "https://www.w3.org/2018/credentials/examples/v1",
    ],
    type: ["VerifiablePresentation"],
    id: presentationId,
    holder: holderDid,
    verifiableCredential: [credentialData],
  };

  // ── 2. Sign the VP ────────────────────────────────────────────────────────
  let proofValue = "unsigned";
  let signedSuccessfully = false;
  try {
    if (window.ethereum) {
      const provider = new BrowserProvider(window.ethereum as any);
      const signer = await provider.getSigner();
      // Sign a canonical representation of the unsigned VP
      const message = JSON.stringify({
        presentationId,
        credentialHash,
        holder: holderDid,
        created,
      });
      proofValue = await signer.signMessage(message);
      signedSuccessfully = true;
    }
  } catch {
    // Non-fatal — VP is still useful without a live signature
    proofValue = "signature-declined";
  }

  // ── 3. Assemble W3C VP JSON ───────────────────────────────────────────────
  const vpJson: VerifiablePresentation = {
    ...vpUnsigned,
    proof: {
      type: "EthereumPersonalSignature2021",
      created,
      proofPurpose: "authentication",
      verificationMethod: `${holderDid}#wallet`,
      proofValue,
    },
  };

  // ── 4. Build VP-JWT ───────────────────────────────────────────────────────
  // Header
  const header = base64urlEncodeObj({ alg: "ETH-personal-sign", typ: "JWT" });

  // Sanitize credential data for the QR/JWT payload — strip large binary
  // blobs (embedded JWS/proofValue) so the JWT stays within QR scanner limits
  // (~2 KB). The full un-sanitized credential is preserved in vpJson below.
  const credentialDataForJwt = sanitizeForQR(credentialData as Record<string, unknown>);
  const vpUnsignedForJwt = { ...vpUnsigned, verifiableCredential: [credentialDataForJwt] };

  // Payload (W3C VP-JWT spec §6.3)
  const payload = base64urlEncodeObj({
    iss: holderAddress,        // issuer = holder's wallet address
    sub: holderDid,
    iat: Math.floor(Date.now() / 1000),
    jti: presentationId,
    vp: vpUnsignedForJwt,
    // Extra claim: on-chain anchor for independent verification
    blockchainAnchor: blockchainAnchor ?? undefined,
    credentialHash,
  });

  // Signature — if signed successfully embed just the last 87 chars (r+s bytes)
  // to keep the JWT compact; use the full hex sig as metadata in vpJson.proof.
  const sigPart = signedSuccessfully
    ? base64urlEncode(proofValue)   // full hex sig encoded as base64url
    : base64urlEncode(proofValue);

  const vpJwt = `${header}.${payload}.${sigPart}`;

  // ── 5. QR payload = the compact JWT ──────────────────────────────────────
  const qrPayload = vpJwt;

  // ── 6. Etherscan URL ──────────────────────────────────────────────────────
  const etherscanUrl = buildEtherscanUrl(blockchainAnchor);

  return { vpJson, vpJwt, qrPayload, etherscanUrl };
}
