import { useCallback, useEffect, useMemo, useState } from "react";
import { listBiometricCredentials, hasEncryptedKey } from "@/services/webauthnService";

/** Label the encrypted wallet private key is stored under (see SecurityView). */
export const WALLET_KEY_LABEL = "wallet-private-key";

/** Each checklist item is worth an equal 25% of the total score. */
export const CHECK_WEIGHT = 25;

export type SecurityAction = "generate-did" | "connect-wallet" | "setup-passkey";

export interface SecurityCheck {
  id: "did" | "wallet" | "credentials" | "biometric";
  label: string;
  ok: boolean;
  detail: string;
  weight: number;
  /** Only present while the check is failing — drives the recommendation chips. */
  action?: SecurityAction;
  actionLabel?: string;
}

export interface UseSecurityHealthResult {
  /** Weighted 0–100% score. */
  score: number;
  checks: SecurityCheck[];
  /** Failing checks, each carrying the action that would close it. */
  recommendations: SecurityCheck[];
  /** True until the async biometric probe has resolved. */
  loading: boolean;
  /** True once a biometric credential exists (regardless of key protection). */
  biometricRegistered: boolean;
  /** True once the wallet private key is wrapped by a registered biometric. */
  keyIsProtected: boolean;
  refresh: () => Promise<void>;
}

export interface UseSecurityHealthParams {
  userId: string | undefined;
  holderDid: string | undefined;
  walletAddress: string | undefined;
  /** Only the `status` field is read. */
  credentials: { status: string }[];
}

/**
 * Single source of truth for the holder's security posture.
 *
 * Every consumer (WalletView, SecurityView) derives its score and checklist from
 * this hook so the number can never drift between tabs. Each of the four
 * controls contributes an equal 25%.
 */
export function useSecurityHealth({
  userId,
  holderDid,
  walletAddress,
  credentials,
}: UseSecurityHealthParams): UseSecurityHealthResult {
  const [biometricRegistered, setBiometricRegistered] = useState(false);
  const [keyIsProtected, setKeyIsProtected] = useState(false);
  const [loading, setLoading] = useState(false);

  const probeBiometrics = useCallback(async () => {
    if (!userId) {
      setBiometricRegistered(false);
      setKeyIsProtected(false);
      return;
    }
    setLoading(true);
    try {
      const creds = await listBiometricCredentials(userId);
      const first = creds[0] ?? null;
      setBiometricRegistered(!!first);
      setKeyIsProtected(first ? await hasEncryptedKey(first.credentialId, WALLET_KEY_LABEL) : false);
    } catch {
      setBiometricRegistered(false);
      setKeyIsProtected(false);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void probeBiometrics();
  }, [probeBiometrics]);

  const activeCredCount = useMemo(
    () => credentials.filter((c) => c.status === "active").length,
    [credentials],
  );

  const checks = useMemo<SecurityCheck[]>(() => {
    const hasDid = !!holderDid;
    const hasWallet = !!walletAddress;
    const hasCreds = activeCredCount > 0;

    return [
      {
        id: "did",
        label: "Decentralized Identifier (DID)",
        ok: hasDid,
        detail: hasDid ? holderDid! : "Not generated — connect a wallet",
        weight: CHECK_WEIGHT,
        action: hasDid ? undefined : "generate-did",
        actionLabel: hasDid ? undefined : "Generate DID",
      },
      {
        id: "wallet",
        label: "Web3 Wallet",
        ok: hasWallet,
        detail: hasWallet ? `${walletAddress!.substring(0, 10)}…` : "Not connected",
        weight: CHECK_WEIGHT,
        action: hasWallet ? undefined : "connect-wallet",
        actionLabel: hasWallet ? undefined : "Connect Wallet",
      },
      {
        id: "credentials",
        label: "Active Credentials",
        ok: hasCreds,
        detail: hasCreds ? `${activeCredCount} active` : "No credentials yet",
        weight: CHECK_WEIGHT,
      },
      {
        id: "biometric",
        label: "Biometric Key Protection",
        ok: keyIsProtected,
        detail: keyIsProtected
          ? "Private key is biometric-protected"
          : biometricRegistered
            ? "Biometric registered, key not yet protected"
            : "Not set up",
        weight: CHECK_WEIGHT,
        action: keyIsProtected ? undefined : "setup-passkey",
        actionLabel: keyIsProtected ? undefined : "Setup Passkey",
      },
    ];
  }, [holderDid, walletAddress, activeCredCount, keyIsProtected, biometricRegistered]);

  const score = useMemo(
    () => checks.reduce((total, c) => total + (c.ok ? c.weight : 0), 0),
    [checks],
  );

  return {
    score,
    checks,
    recommendations: checks.filter((c) => !c.ok && !!c.action),
    loading,
    biometricRegistered,
    keyIsProtected,
    refresh: probeBiometrics,
  };
}
