/**
 * SBT service — Phase 7 (Soulbound Credentials).
 *
 * Wraps SoulboundCredential.sol:
 *  - mints a non-transferable token when a credential is anchored on-chain
 *  - one SBT per credential hash (duplicate-proof)
 *  - revocation mirrors CredentialRegistry revocations
 *  - ERC-721-compatible reads so wallets/explorers render the badge
 *
 * Pure helpers (metadata building, calldata encoding, event decoding) are
 * exported separately so flows work offline and are fully unit-testable.
 */
import { Contract, Interface } from "ethers";
import { getReadProvider } from "./provider";
import { toBytes32 } from "@/lib/crypto";

const SBT_ADDRESS_ENV = import.meta.env.VITE_SOULBOUND_CREDENTIAL_ADDRESS as `0x${string}` | undefined;

export const SOULBOUND_ABI = [
  // Write
  "function mint(address to, bytes32 credentialHash) external returns (uint256)",
  "function revoke(uint256 tokenId) external",
  "function burn(uint256 tokenId) external",
  "function setIssuer(address issuer, bool allowed) external",
  // Read
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function balanceOf(address holder) external view returns (uint256)",
  "function totalSupply() external view returns (uint256)",
  "function tokenIdsOf(address holder) external view returns (uint256[])",
  "function tokenByCredentialHash(bytes32 credentialHash) external view returns (uint256)",
  "function getCredential(uint256 tokenId) external view returns (bytes32 credentialHash, address holder, uint64 issuedAt, bool revoked)",
  "function isRevoked(uint256 tokenId) external view returns (bool)",
  "function isValid(uint256 tokenId) external view returns (bool)",
  "function tokenURI(uint256 tokenId) external view returns (string)",
  // Events
  "event Minted(uint256 indexed tokenId, address indexed holder, bytes32 indexed credentialHash, uint64 issuedAt)",
  "event Revoked(uint256 indexed tokenId, address indexed issuer)",
  "event Burned(uint256 indexed tokenId, address indexed burnedBy)",
] as const;

const SBTS_IFACE = new Interface([...SOULBOUND_ABI]);

/** True when an SBT contract address is configured (env or explicit). */
export function isSbtConfigured(address: string | null | undefined = SBT_ADDRESS_ENV): boolean {
  return !!address && address !== "0x0000000000000000000000000000000000000000";
}

function sbtAddress(explicit?: string): string {
  const addr = explicit ?? SBT_ADDRESS_ENV;
  if (!isSbtConfigured(addr)) throw new Error("Soulbound credential contract not configured");
  return addr!;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

/** Accepts any 32-byte-prefixed hex hash and normalises to bytes32 form. */
export function normalizeCredentialHash(hash: string): string {
  if (!hash || !/^0x[0-9a-fA-F]+$/.test(hash)) {
    throw new Error("credentialHash must be a hex string");
  }
  if (hash.replace(/^0x/, "").length > 64) {
    throw new Error("credentialHash exceeds 32 bytes");
  }
  return toBytes32(hash);
}

export interface SbtMetadataInput {
  name: string;
  description?: string;
  credentialType?: string;
  holderDid?: string;
  schemaCid?: string;
  issuedAt?: string;
  explorerUrl?: string;
}

/** Build the off-chain JSON metadata document served at `{baseURI}/{tokenId}`. */
export function buildSbtMetadata(input: SbtMetadataInput): Record<string, unknown> {
  return {
    name: input.name,
    description: input.description ?? "BlockID verifiable credential (soulbound)",
    credentialType: input.credentialType ?? null,
    holderDid: input.holderDid ?? null,
    schemaCid: input.schemaCid ?? null,
    issuedAt: input.issuedAt ?? null,
    external_url: input.explorerUrl ?? null,
    soulbound: true,
  };
}

/** Base64 data URI encoding of metadata (for wallets that accept data URIs). */
export function buildSbtDataUri(metadata: Record<string, unknown>): string {
  const json = JSON.stringify(metadata);
  let base64: string;
  if (typeof btoa === "function") {
    base64 = btoa(unescape(encodeURIComponent(json)));
  } else {
    base64 = Buffer.from(json, "utf-8").toString("base64");
  }
  return `data:application/json;base64,${base64}`;
}

/** ABI-encode the mint call (selector + args) without touching the network. */
export function encodeMintCalldata(holder: string, credentialHash: string): string {
  return SBTS_IFACE.encodeFunctionData("mint", [holder, normalizeCredentialHash(credentialHash)]);
}

/**
 * Extract the minted tokenId from transaction receipt logs.
 * Returns null when no Minted event is present (e.g. reverted silently).
 */
export function decodeMintedTokenId(
  logs: { topics: string[]; data: string }[]
): { tokenId: bigint; holder: string; credentialHash: string } | null {
  for (const log of logs) {
    const parsed = SBTS_IFACE.parseLog({ topics: [...log.topics], data: log.data });
    if (parsed?.name === "Minted") {
      return {
        tokenId: parsed.args.tokenId,
        holder: parsed.args.holder,
        credentialHash: parsed.args.credentialHash,
      };
    }
  }
  return null;
}

// ── Network calls ────────────────────────────────────────────────────────────

export interface MintResult {
  txHash: string;
  tokenId: bigint | null;
}

/**
 * Mint the SBT for an anchored credential. Best-effort: callers should treat
 * failure as non-fatal (anchoring remains the source of truth).
 */
export async function mintSbtForCredential(
  signer: { getAddress(): Promise<string>; sendTransaction(tx: { to: string; data: string }): Promise<{ hash: string; wait(): Promise<{ logs: unknown[] }> }> },
  options: { holder?: string; credentialHash: string; address?: string }
): Promise<MintResult> {
  const to = await (options.holder ? Promise.resolve(options.holder) : signer.getAddress());
  const data = encodeMintCalldata(to, options.credentialHash);
  const sent = await signer.sendTransaction({ to: sbtAddress(options.address), data });
  const receipt = await sent.wait();

  let tokenId: bigint | null = null;
  try {
    tokenId = decodeMintedTokenId(receipt?.logs as { topics: string[]; data: string }[])?.tokenId ?? null;
  } catch {
    tokenId = null;
  }
  return { txHash: sent.hash, tokenId };
}

/** Revoke the SBT when its underlying credential gets revoked. */
export async function revokeSbt(
  signer: { sendTransaction(tx: { to: string; data: string }): Promise<{ hash: string }> },
  tokenId: bigint | number,
  address?: string
): Promise<string> {
  const data = SBTS_IFACE.encodeFunctionData("revoke", [tokenId]);
  const sent = await signer.sendTransaction({ to: sbtAddress(address), data });
  return sent.hash;
}

export interface SbtStatus {
  tokenId: number;
  credentialHash: string;
  holder: string;
  issuedAt: number;
  revoked: boolean;
}

/** Look up the SBT bound to a credential hash (null when none was minted). */
export async function getSbtForCredential(credentialHash: string, address?: string): Promise<SbtStatus | null> {
  const provider = await getReadProvider();
  const sbt = new Contract(sbtAddress(address), SOULBOUND_ABI, provider);
  const tokenId = (await sbt.tokenByCredentialHash(normalizeCredentialHash(credentialHash))) as bigint;
  if (tokenId === 0n) return null;

  const cred = await sbt.getCredential(tokenId);
  return {
    tokenId: Number(tokenId),
    credentialHash: cred.credentialHash,
    holder: cred.holder,
    issuedAt: Number(cred.issuedAt),
    revoked: cred.revoked,
  };
}

/** All SBTs held by a wallet (for the holder wallet UI). */
export async function listHolderSbts(holder: string, address?: string): Promise<SbtStatus[]> {
  const provider = await getReadProvider();
  const sbt = new Contract(sbtAddress(address), SOULBOUND_ABI, provider);
  const ids = (await sbt.tokenIdsOf(holder)) as bigint[];
  const statuses = await Promise.all(
    ids.map(async (id) => {
      const cred = await sbt.getCredential(id);
      return {
        tokenId: Number(id),
        credentialHash: cred.credentialHash,
        holder: cred.holder,
        issuedAt: Number(cred.issuedAt),
        revoked: cred.revoked,
      } satisfies SbtStatus;
    })
  );
  return statuses;
}
