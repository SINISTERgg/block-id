/**
 * SBT service — Soulbound Credentials.
 *
 * Wraps SoulboundCredential.sol:
 *  - mints a non-transferable token when a credential is anchored on-chain
 *  - one SBT per credential hash (duplicate-proof)
 *  - revocation mirrors CredentialRegistry revocations
 *  - ERC-721 + EIP-5192 compatible reads so wallets/explorers render the badge
 *
 * ── Hash format invariant ──────────────────────────────────────────────────
 * `credentials.credential_hash` is produced by `_shared/vc-hash.ts:sha256Hex`
 * and is stored as **64 lowercase hex characters with no "0x" prefix**. The
 * on-chain representation is bytes32, i.e. always "0x"-prefixed. Historically
 * `normalizeCredentialHash` required the prefix, so every real credential hash
 * was rejected and the mint threw for every single issuance. The normaliser
 * below is now deliberately permissive about the prefix and only strict about
 * the hex digits, so both stored hashes and user-pasted "0x" values work.
 *
 * Pure helpers (hash/address normalisation, metadata building, calldata
 * encoding, event decoding) are exported separately so flows work offline and
 * are fully unit-testable.
 */
import { Contract, Interface, getAddress as toChecksumAddress } from "ethers";
import { getReadProvider } from "./provider";
import {
  SBT_ADDRESS,
  SBT_ADDRESS_ENV_KEY,
  IS_SBT_DEPLOYED,
  SOULBOUND_ABI,
} from "./config";

const SBTS_IFACE = new Interface([...SOULBOUND_ABI]);

/** Re-exported for callers that imported the ABI from this module. */
export { SOULBOUND_ABI };

/**
 * True when an SBT contract address is configured.
 *
 * Omitting the argument reads the environment; passing `undefined` or `null`
 * explicitly means "definitely not configured" (distinguished via
 * `arguments.length`, as callers rely on that to probe an override).
 */
export function isSbtConfigured(address?: string | null): boolean {
  const envAddr = import.meta.env[SBT_ADDRESS_ENV_KEY] as string | undefined;
  const addr = arguments.length > 0 ? address : (envAddr ?? SBT_ADDRESS);
  return !!addr && addr !== ZERO_ADDRESS;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Anchored 20-byte hex address test.
 *
 * Deliberately anchored: an unanchored `/0x[a-fA-F0-9]{40}/` also matches a
 * whole `did:ethr:sepolia:0x…` string, which would let a DID through as an
 * address and blow up later inside the ABI encoder.
 */
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

/**
 * Resolve the SBT contract address.
 * @param explicit Overrides configuration (used by tests and the inspector).
 * @throws when unconfigured or set to the zero address.
 */
function sbtAddress(explicit?: string): string {
  // Read the env var at call time rather than relying only on the module-level
  // constant, so a redeploy + restart (or a test toggling the env) is picked up
  // without a stale captured value.
  const envAddr = import.meta.env[SBT_ADDRESS_ENV_KEY] as string | undefined;
  const addr = explicit ?? envAddr ?? SBT_ADDRESS;
  if (!isSbtConfigured(addr)) {
    throw new Error(
      `Soulbound credential contract not configured — set ${SBT_ADDRESS_ENV_KEY} to the deployed SoulboundCredential address.`
    );
  }
  return addr;
}

/** Configured Soulbound address, or null. For UI links — not for contract calls. */
export function getSbtAddress(): string | null {
  return isSbtConfigured() ? SBT_ADDRESS : null;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Normalise any credential hash into canonical bytes32 form.
 *
 * Accepts, and treats as equivalent:
 *   - `ab…64`                     bare hex, as stored in Postgres (no prefix)
 *   - `0xab…64`                   the same value, prefixed
 *   - shorter values              left-padded to 32 bytes
 *
 * Rejects empty strings, non-hex characters and anything over 32 bytes — those
 * are genuine mistakes rather than formatting differences, and the contract
 * would reject them anyway (`ZeroCredentialHash` / a silently truncated value).
 *
 * @throws when the input is not usable as a credential hash.
 */
export function normalizeCredentialHash(hash: string): string {
  if (typeof hash !== "string") {
    throw new Error("credentialHash must be a hex string");
  }
  const body = hash.trim().replace(/^0[xX]/, "");

  if (body.length === 0 || !/^[0-9a-fA-F]+$/.test(body)) {
    throw new Error("credentialHash must be a hex string");
  }
  if (body.length > 64) {
    throw new Error("credentialHash exceeds 32 bytes");
  }
  return "0x" + body.toLowerCase().padStart(64, "0");
}

/**
 * Inverse of {@link normalizeCredentialHash} — the bare 64-char form used in
 * the `credentials.credential_hash` column. Useful for DB comparisons and for
 * rendering hashes in the UI.
 */
export function toStoredHashFormat(hash: string): string {
  return normalizeCredentialHash(hash).slice(2);
}

/** True when two hashes refer to the same credential, prefix-insensitively. */
export function sameCredentialHash(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  try {
    return normalizeCredentialHash(a) === normalizeCredentialHash(b);
  } catch {
    return false;
  }
}

const DID_ADDRESS = /0x[a-fA-F0-9]{40}/;

/**
 * Extract the `0x…` address from a `did:ethr:<chain>:0x…` DID.
 *
 * Non-ETH DIDs (`did:key`, `did:web`, …) intentionally return null — an SBT can
 * only be bound to an Ethereum address, so callers must fall back to the
 * holder's registered wallet address.
 */
export function addressFromDid(did: string | null | undefined): string | null {
  if (!did) return null;
  const m = did.match(DID_ADDRESS);
  return m ? m[0] : null;
}

/**
 * Decide which address should own an SBT for a given holder.
 *
 * Preference order:
 *   1. the address bound into the holder DID (the credential's own subject)
 *   2. `fallbackAddress` — the holder's registered `profiles.wallet_address`
 *
 * @returns a checksummed address, or null when neither source yields one.
 */
export function resolveHolderAddress(
  holderDid: string | null | undefined,
  fallbackAddress?: string | null
): string | null {
  const fromDid = addressFromDid(holderDid);
  const raw = (fromDid ?? fallbackAddress ?? null)?.trim() ?? null;
  if (!raw || !ADDRESS_PATTERN.test(raw)) return null;
  return toChecksumAddress(raw);
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
  if (!ADDRESS_PATTERN.test(holder)) {
    throw new Error(`holder must be a 0x-prefixed address, got "${holder}"`);
  }
  return SBTS_IFACE.encodeFunctionData("mint", [holder, normalizeCredentialHash(credentialHash)]);
}

/** ABI-encode a revoke call without touching the network. */
export function encodeRevokeCalldata(tokenId: bigint | number): string {
  return SBTS_IFACE.encodeFunctionData("revoke", [tokenId]);
}

/**
 * Extract the minted tokenId from transaction receipt logs.
 *
 * Both `Minted` and the ERC-721 `Transfer(0x0 → holder)` are recognised, so a
 * tokenId is still recovered if the `Minted` log is absent (for example from a
 * contract variant that only emits the ERC-721 event).
 *
 * @returns null when neither event is present.
 */
export function decodeMintedTokenId(
  logs: { topics: string[]; data: string }[]
): { tokenId: bigint; holder: string; credentialHash: string | null } | null {
  let transfer: { tokenId: bigint; holder: string } | null = null;

  for (const log of logs ?? []) {
    let parsed;
    try {
      parsed = SBTS_IFACE.parseLog({ topics: [...log.topics], data: log.data });
    } catch {
      // A log from an unrelated contract in the same receipt — skip it.
      continue;
    }
    if (parsed?.name === "Minted") {
      return {
        tokenId: parsed.args.tokenId as bigint,
        holder: parsed.args.holder as string,
        credentialHash: parsed.args.credentialHash as string,
      };
    }
    if (parsed?.name === "Transfer" && (parsed.args.from as string) === ZERO_ADDRESS && !transfer) {
      transfer = { tokenId: parsed.args.tokenId as bigint, holder: parsed.args.to as string };
    }
  }
  return transfer ? { ...transfer, credentialHash: null } : null;
}

// ── Network calls ────────────────────────────────────────────────────────────

export interface MintResult {
  txHash: string;
  /** Token id from the `Minted` event, or null if the log was undecodable. */
  tokenId: bigint | null;
  /** Address the token was minted to. */
  holder: string;
  /** Bytes32 credential hash committed on-chain. */
  credentialHash: string;
}

/** The minimal signer surface `mintSbtForCredential` needs. */
export interface SbtSigner {
  getAddress(): Promise<string>;
  sendTransaction(tx: { to: string; data: string }): Promise<{
    hash: string;
    wait(): Promise<{ logs: unknown[] } | null>;
  }>;
}

export type MintFailureReason = "rejected" | "not_issuer" | "duplicate" | "insufficient_funds" | "unknown";

/**
 * keccak256 selectors of the contract's custom errors.
 *
 * ethers only names a custom error when the ABI it was called through declares
 * it; otherwise a caller sees "execution reverted (unknown custom error)" with
 * no clue what went wrong. Matching the raw selector keeps the actionable
 * message working no matter which path produced the error.
 *
 * Derived from SOULBOUND_ABI rather than hardcoded so they cannot drift.
 */
function errorSelector(name: string): string {
  try {
    return (SBTS_IFACE.getError(name)?.selector ?? "").toLowerCase();
  } catch {
    return "";
  }
}
const NOT_ISSUER_SELECTOR = errorSelector("NotIssuer");
const NOT_ADMIN_SELECTOR = errorSelector("NotAdmin");
const DUPLICATE_SELECTOR = errorSelector("DuplicateCredential");
const ZERO_HASH_SELECTOR = errorSelector("ZeroCredentialHash");

export interface MintSbtOptions {
  /** The address that should receive the badge. Defaults to `holderDid`. */
  holder?: string;
  /** The holder's DID — the preferred source for the recipient address. */
  holderDid?: string;
  /**
   * The holder's registered `profiles.wallet_address`, used only when
   * `holderDid` / `holder` yield no Ethereum address.
   */
  fallbackAddress?: string;
  /** Bare or prefixed credential hash, as stored in `credentials.credential_hash`. */
  credentialHash: string;
  /** Contract override (tests / multi-network inspection). */
  address?: string;
}

export class SbtMintError extends Error {
  readonly reason: MintFailureReason;
  readonly cause?: unknown;
  constructor(reason: MintFailureReason, message: string, cause?: unknown) {
    super(message);
    this.name = "SbtMintError";
    this.reason = reason;
    this.cause = cause;
  }
}

/** Turn a raw wallet/ethers error into a stable, human-usable reason. */
function classifyMintError(err: unknown): { reason: MintFailureReason; message: string } {
  const raw = (err as {
    shortMessage?: string;
    message?: string;
    reason?: string;
    code?: string;
    data?: string;
    revert?: { name?: string };
    info?: { error?: { data?: string } };
  }) ?? {};
  const text = `${raw.shortMessage ?? ""} ${raw.message ?? ""} ${raw.reason ?? ""} ${raw.revert?.name ?? ""}`.trim();
  const lower = text.toLowerCase();

  // Revert data may arrive as a bare 4-byte selector (ethers only names the
  // error when the ABI it was called through declares it), so match both.
  const revertData = `${raw.data ?? ""} ${raw.info?.error?.data ?? ""}`.toLowerCase();

  if (raw.code === "ACTION_REJECTED" || lower.includes("user rejected") || lower.includes("user denied") || lower.includes("rejected the request")) {
    return { reason: "rejected", message: "You rejected the mint transaction in your wallet." };
  }
  if (lower.includes("notissuer") || lower.includes("not issuer") || revertData.includes(NOT_ISSUER_SELECTOR)) {
    return {
      reason: "not_issuer",
      message:
        "This wallet is not an allow-listed issuer on the soulbound contract, so the mint was rejected. " +
        "The contract admin must allow-list it first: " +
        "node scripts/set-issuer.js --issuer <your wallet address>",
    };
  }
  if (lower.includes("notadmin") || lower.includes("not admin") || revertData.includes(NOT_ADMIN_SELECTOR)) {
    return {
      reason: "not_issuer",
      message: "Only the soulbound contract admin can do this. Run: node scripts/set-issuer.js --issuer <your wallet>",
    };
  }
  if (
    lower.includes("duplicatecredential") ||
    lower.includes("already minted") ||
    lower.includes("alreadyexists") ||
    revertData.includes(DUPLICATE_SELECTOR)
  ) {
    return { reason: "duplicate", message: "A badge already exists on-chain for this credential hash." };
  }
  if (lower.includes("zerocredentialhash") || revertData.includes(ZERO_HASH_SELECTOR)) {
    return { reason: "unknown", message: "The credential hash was empty, so the contract rejected the mint." };
  }
  if (lower.includes("insufficient funds") || lower.includes("insufficient_funds")) {
    return { reason: "insufficient_funds", message: "Wallet needs Sepolia ETH to pay the mint gas fee." };
  }
  if (lower.includes("unknown custom error") && revertData) {
    return {
      reason: "unknown",
      message: `The soulbound contract rejected the mint (revert data ${revertData.slice(0, 10)}). ` +
        "Check that the signing wallet is an allow-listed issuer on the contract.",
    };
  }
  return { reason: "unknown", message: text || "SBT mint failed for an unknown reason." };
}

/**
 * Mint the SBT for an anchored credential.
 *
 * The recipient is resolved from `holder` → `holderDid` → `fallbackAddress`.
 * It deliberately does **not** fall back to the signing wallet: minting a
 * credential badge to the issuer is always wrong, and silently doing so is how
 * badges ended up invisible in the holder's portal in the first place.
 *
 * @throws {SbtMintError} with a `reason` the UI can branch on.
 */
export async function mintSbtForCredential(signer: SbtSigner, options: MintSbtOptions): Promise<MintResult> {
  const contractAddress = sbtAddress(options.address);
  const holder = resolveHolderAddress(options.holderDid, options.holder ?? options.fallbackAddress);
  if (!holder) {
    throw new SbtMintError(
      "unknown",
      "Cannot mint a soulbound badge: no holder Ethereum address. The holder DID must be an " +
        "Ethereum DID (did:ethr:<chain>:0x…) or the holder must have a wallet address on file."
    );
  }

  const credentialHash = normalizeCredentialHash(options.credentialHash);
  const data = encodeMintCalldata(holder, credentialHash);

  let sent: { hash: string; wait(): Promise<{ logs: unknown[] } | null> };
  try {
    sent = await signer.sendTransaction({ to: contractAddress, data });
  } catch (err) {
    const { reason, message } = classifyMintError(err);
    throw new SbtMintError(reason, message, err);
  }

  let receipt: { logs: unknown[] } | null = null;
  try {
    receipt = await sent.wait();
  } catch (err) {
    // The tx was submitted but reverted during mining (e.g. ran out of gas).
    const { reason, message } = classifyMintError(err);
    throw new SbtMintError(reason, `Mint transaction reverted: ${message}`, err);
  }

  if (!receipt) {
    throw new SbtMintError("unknown", "Mint transaction produced no receipt.");
  }

  const decoded = decodeMintedTokenId(receipt.logs as { topics: string[]; data: string }[]);

  return {
    txHash: sent.hash,
    tokenId: decoded?.tokenId ?? null,
    holder,
    credentialHash,
  };
}

/** Revoke the SBT when its underlying credential gets revoked. */
export async function revokeSbt(
  signer: { sendTransaction(tx: { to: string; data: string }): Promise<{ hash: string }> },
  tokenId: bigint | number,
  address?: string
): Promise<string> {
  const sent = await signer.sendTransaction({
    to: sbtAddress(address),
    data: encodeRevokeCalldata(tokenId),
  });
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

  return readSbtStatus(sbt, tokenId);
}

/** All SBTs held by a wallet (for the holder wallet UI). */
export async function listHolderSbts(holder: string, address?: string): Promise<SbtStatus[]> {
  if (!ADDRESS_PATTERN.test(holder)) {
    throw new Error(`holder must be a 0x-prefixed address, got "${holder}"`);
  }
  const provider = await getReadProvider();
  const sbt = new Contract(sbtAddress(address), SOULBOUND_ABI, provider);
  const ids = (await sbt.tokenIdsOf(holder)) as bigint[];
  return Promise.all(ids.map((id) => readSbtStatus(sbt, id)));
}

/**
 * Read one token's record. `getCredential` reverts for burned tokens, which is
 * the correct signal that the badge no longer exists, so it is mapped to null
 * rather than aborting the whole listing.
 */
async function readSbtStatus(sbt: Contract, tokenId: bigint): Promise<SbtStatus> {
  const cred = await sbt.getCredential(tokenId);
  return {
    tokenId: Number(tokenId),
    credentialHash: cred.credentialHash as string,
    holder: cred.holder as string,
    issuedAt: Number(cred.issuedAt),
    revoked: Boolean(cred.revoked),
  };
}

/** Total number of SBTs ever minted on this deployment. Never throws. */
export async function getSbtTotalSupply(address?: string): Promise<number> {
  try {
    const provider = await getReadProvider();
    const sbt = new Contract(sbtAddress(address), SOULBOUND_ABI, provider);
    return Number((await sbt.totalSupply()) as bigint);
  } catch {
    return 0;
  }
}

/**
 * Resolve SBTs by credential hash for many credentials in one batch of reads.
 * Used by the dashboard's "batch re-check" widget to surface newly minted or
 * newly revoked badges after a set of verifications.
 */
export async function getSbtForCredentials(
  credentialHashes: string[],
  address?: string
): Promise<Map<string, SbtStatus | null>> {
  const out = new Map<string, SbtStatus | null>();
  if (credentialHashes.length === 0 || !isSbtConfigured(address)) {
    credentialHashes.forEach((h) => out.set(h, null));
    return out;
  }
  await Promise.all(
    credentialHashes.map(async (hash) => {
      try {
        out.set(hash, await getSbtForCredential(hash, address));
      } catch {
        out.set(hash, null);
      }
    })
  );
  return out;
}

// ── Reconcile DB records against the chain ───────────────────────────────────

/** A badge row as persisted on the `credentials` table. */
export interface StoredSbtRecord {
  sbt_token_id: number | string | null;
  sbt_tx_hash?: string | null;
  sbt_holder_address?: string | null;
  sbt_minted_at?: string | null;
  credential_hash: string;
}

export interface BadgeReconciliation {
  /** The token to render, or null when neither source knows about a badge. */
  status: SbtStatus | null;
  /** Where the badge knowledge came from. */
  source: "chain" | "db" | "none";
  /** True when the chain disagrees with (or has no record of) the stored row. */
  needsBackfill: boolean;
  /** True when the stored token id no longer matches the on-chain one. */
  drifted: boolean;
}

/**
 * Merge a persisted badge row with on-chain state.
 *
 * The database is the only thing that knows which credentials a holder
 * *should* have badges for, and the chain is the only thing that knows whether
 * a badge is actually valid. This reconciles the two so the portal can show
 * pending, active and revoked badges rather than only the ones that happened
 * to mint successfully.
 */
export async function reconcileBadge(
  record: StoredSbtRecord,
  address?: string
): Promise<BadgeReconciliation> {
  if (!isSbtConfigured(address)) {
    const fallback = storedStatus(record);
    return {
      status: fallback,
      source: fallback ? "db" : "none",
      needsBackfill: Boolean(fallback),
      drifted: false,
    };
  }

  try {
    const status = await getSbtForCredential(record.credential_hash, address);
    const storedId = toTokenId(record.sbt_token_id);

    if (!status) {
      // No badge on-chain for this credential.
      return { status: null, source: "none", needsBackfill: false, drifted: storedId !== null };
    }
    return {
      status,
      source: "chain",
      needsBackfill: storedId === null,
      drifted: storedId !== null && storedId !== status.tokenId,
    };
  } catch {
    // RPC unavailable — fall back to whatever the database recorded.
    const fallback = storedStatus(record);
    return {
      status: fallback,
      source: fallback ? "db" : "none",
      needsBackfill: Boolean(fallback),
      drifted: false,
    };
  }
}

/** Build an SbtStatus from a DB row, when it recorded a token id. */
function storedStatus(record: StoredSbtRecord): SbtStatus | null {
  const tokenId = toTokenId(record.sbt_token_id);
  if (tokenId === null) return null;
  return {
    tokenId,
    credentialHash: (() => {
      try {
        return normalizeCredentialHash(record.credential_hash);
      } catch {
        return record.credential_hash;
      }
    })(),
    holder: record.sbt_holder_address ?? ZERO_ADDRESS,
    issuedAt: record.sbt_minted_at ? Math.floor(new Date(record.sbt_minted_at).getTime() / 1000) : 0,
    revoked: false,
  };
}

/**
 * Postgres `numeric` is serialised as a JSON number only when it has no
 * fractional part; otherwise PostgREST sends a string. Accept both.
 */
function toTokenId(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}
