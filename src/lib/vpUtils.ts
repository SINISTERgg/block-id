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
 * Build a compact QR payload from the minimal fields needed for a verifier
 * to locate and look up the credential. The full VP-JWT is kept in the JWT
 * tab only; putting it in a QR exceeds the ~2 KB QR code data limit for any
 * real credential and causes the qrcode library to throw "Data too long".
 */
function buildQrPayload(
  credentialHash: string,
  holderDid: string,
  blockchainAnchor: string | null,
  credentialType?: unknown
): string {
  const payload: Record<string, unknown> = {
    v: 1,
    type: "blockid-vc-ref",
    hash: credentialHash,
    holder: holderDid,
  };
  if (blockchainAnchor) payload.anchor = blockchainAnchor;
  if (credentialType && typeof credentialType === "string") payload.ctype = credentialType;
  return JSON.stringify(payload);
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

  // Payload (W3C VP-JWT spec §6.3) — the full credential is included here;
  // this JWT is only shown in the JWT tab, not encoded in the QR code.
  const payload = base64urlEncodeObj({
    iss: holderAddress,
    sub: holderDid,
    iat: Math.floor(Date.now() / 1000),
    jti: presentationId,
    vp: vpUnsigned,
    blockchainAnchor: blockchainAnchor ?? undefined,
    credentialHash,
  });

  const sigPart = base64urlEncode(proofValue);
  const vpJwt = `${header}.${payload}.${sigPart}`;

  // ── 5. QR payload — MINIMAL reference, not the full JWT ──────────────────
  // The qrcode library throws "Data too long" when the data exceeds ~2 KB.
  // Real credentials easily exceed that limit, so we encode only the fields
  // a verifier needs to look up the credential (hash + holder + anchor).
  const credType = (credentialData as any)?.type?.find?.((t: string) => t !== "VerifiableCredential");
  const qrPayload = buildQrPayload(credentialHash, holderDid, blockchainAnchor, credType);

  // ── 6. Etherscan URL ──────────────────────────────────────────────────────
  const etherscanUrl = buildEtherscanUrl(blockchainAnchor);

  return { vpJson, vpJwt, qrPayload, etherscanUrl };
}
