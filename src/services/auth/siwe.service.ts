/**
 * SIWE service — wallet-based sign-in (EIP-4361) bridged to a Supabase session.
 *
 * Flow:
 *  1. `requestChallenge()`  — siwe-auth edge fn mints + stores a single-use nonce
 *  2. `signMessage()`       — user signs the EIP-4361 message with their wallet
 *  3. `verifyAndSignIn()`   — edge fn recovers the address, consumes the nonce,
 *                             binds/creates the Supabase identity and returns a
 *                             token hash which is exchanged for a real session
 */
import { ethers } from "ethers";
import { buildSiweMessage } from "@/lib/siwe";
import { supabase } from "@/services/api/supabaseClient";

export interface SiweChallenge {
  nonce: string;
  expiresAt: string;
}

export interface SiweSessionResult {
  address: string;
  userId?: string;
}

const EDGE_FUNCTION = "siwe-auth";

async function callEdgeFn<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(EDGE_FUNCTION, { body });
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`${EDGE_FUNCTION} returned no data`);
  return data;
}

/** Request a fresh single-use challenge nonce from the server. */
export async function requestChallenge(address: string): Promise<SiweChallenge> {
  const res = await callEdgeFn<{ nonce: string; expires_at: string }>({
    action: "nonce",
    address,
  });
  if (!res.nonce) throw new Error("Server did not issue a nonce");
  return { nonce: res.nonce, expiresAt: res.expires_at };
}

/** Ask the user's connected wallet to sign an EIP-4361 message (personal_sign). */
export async function signMessage(message: string, signer: ethers.Signer): Promise<string> {
  return signer.signMessage(message);
}

interface VerifyResponse {
  token_hash: string;
  email: string;
  address: string;
  type: "magiclink";
}

/**
 * Verify message + signature server-side and establish the Supabase session.
 * Returns the authenticated wallet address on success.
 */
export async function verifyAndSignIn(
  message: string,
  signature: string
): Promise<SiweSessionResult> {
  const res = await callEdgeFn<VerifyResponse>({ action: "verify", message, signature });
  if (!res.token_hash) throw new Error("Verification succeeded but no session token was returned");

  const { error } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: res.token_hash,
  });
  if (error) throw new Error(`Failed to establish session: ${error.message}`);

  return { address: res.address };
}

export interface SignInWithEthereumOptions {
  /** Connected signer; defaults to the first account in window.ethereum. */
  signer?: ethers.Signer;
  /** Human-readable statement; defaults to a no-transaction notice. */
  statement?: string;
  /** Override domain binding (defaults to current host). */
  domain?: string;
  /** Override resource URI binding (defaults to current origin). */
  uri?: string;
}

/**
 * One-shot "Sign-In with Ethereum": challenge → sign → verify → session.
 * The domain/URI default to the current origin so the challenge is bound
 * to the app that initiated it.
 */
export async function signInWithEthereum(options: SignInWithEthereumOptions = {}): Promise<SiweSessionResult> {
  let signer = options.signer;
  if (!signer) {
    const eth = (globalThis as { ethereum?: unknown }).ethereum;
    if (!eth || typeof eth !== "object") {
      throw new Error("No Ethereum provider available — connect a wallet first");
    }
    const browserProvider = new ethers.BrowserProvider(eth as ethers.Eip1193Provider);
    signer = await browserProvider.getSigner();
  }

  const address = await signer.getAddress();
  const url = options.uri ?? (typeof window !== "undefined" ? window.location.origin : "");
  const domain = options.domain ?? (typeof location !== "undefined" ? location.host : "");
  if (!url) throw new Error("Cannot determine SIWE URI — pass options.uri explicitly");
  if (!domain) throw new Error("Cannot determine SIWE domain — pass options.domain explicitly");

  const challenge = await requestChallenge(address);
  const message = buildSiweMessage({
    domain,
    address,
    uri: url,
    statement:
      options.statement ??
      "Sign in to BlockID. This request will not trigger a blockchain transaction.",
    nonce: challenge.nonce,
    expirationTime: challenge.expiresAt || undefined,
  });

  const signature = await signMessage(message, signer);
  return verifyAndSignIn(message, signature);
}
