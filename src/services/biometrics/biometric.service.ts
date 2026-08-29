/**
 * Biometric verification service — Phase 8 client side.
 *
 * Talks to the `biometric-verify` edge function:
 *   - requestLivenessChallenge()  → single-use nonce
 *   - verifyBiometrics(...)       → face match + liveness verdict (hashes only)
 *
 * Pure helpers (hashing, bundle building) are exported separately for tests.
 */
import { supabase } from "@/services/api/supabaseClient";

export const BIOMETRIC_VERIFY_FN = "biometric-verify";

export interface LivenessChallenge {
  nonce: string;
  expires_at: string;
}

export interface BiometricVerifyInput {
  nonce: string;
  /** Base64 (optionally data-URI prefixed) selfie frame. */
  selfieBase64: string;
  /** Optional reference image (ID document). Defaults to selfie on server. */
  documentBase64?: string;
  /** Client-computed liveness score (0–100) from LivenessDetector. */
  livenessScore: number;
}

export interface BiometricVerifyResult {
  passed: boolean;
  similarity: number;
  liveness_required: number;
  similarity_threshold: number;
  subject_hash: string;
  proof_hash: string;
  verified_at: string;
  provider: string;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

/** Strip data-URI prefix from a base64 image payload. */
export function stripDataUri(base64: string): string {
  const idx = base64.indexOf("base64,");
  return idx === -1 ? base64 : base64.slice(idx + "base64,".length);
}

/** SHA-256 hex of a UTF-8 string via WebCrypto. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Local preview of what the edge function will anchor — useful for optimistic
 * UI and offline tests. The server proof_hash remains authoritative.
 */
export function buildProofBundleParts(input: {
  nonce: string;
  subjectHash: string;
  similarity: number;
  verifiedAt: string;
}): { canonical: string } {
  return {
    canonical: `${input.nonce}:${input.subjectHash}:${input.similarity.toFixed(2)}:${input.verifiedAt}`,
  };
}

// ── Network calls ────────────────────────────────────────────────────────────

/** Request a single-use biometric challenge nonce. */
export async function requestLivenessChallenge(userId?: string): Promise<LivenessChallenge> {
  const { data, error } = await supabase.functions.invoke(BIOMETRIC_VERIFY_FN, {
    body: { action: "liveness-challenge", user_id: userId },
  });
  if (error) throw new Error(error.message);
  if (!data?.nonce) throw new Error(data?.error ?? "Failed to issue biometric challenge");
  return { nonce: data.nonce, expires_at: data.expires_at };
}

/** Run server-side face match + liveness evaluation for a captured session. */
export async function verifyBiometrics(input: BiometricVerifyInput): Promise<BiometricVerifyResult> {
  const { data, error } = await supabase.functions.invoke(BIOMETRIC_VERIFY_FN, {
    body: {
      action: "verify",
      nonce: input.nonce,
      selfie_base64: stripDataUri(input.selfieBase64),
      document_base64: input.documentBase64 ? stripDataUri(input.documentBase64) : undefined,
      liveness_score: input.livenessScore,
    },
  });
  if (error) throw new Error(error.message);
  if (!data || data.error) throw new Error(data?.error ?? "Biometric verification failed");
  return data as BiometricVerifyResult;
}
