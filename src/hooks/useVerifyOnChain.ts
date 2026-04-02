import { useState, useEffect, useCallback } from "react";
import { getCredentialStatus, type CredentialStatus } from "@/services/blockchain/registry";

interface UseVerifyOnChainResult {
  isAnchored: boolean;
  isRevoked: boolean;
  anchorBlock: number;
  issuer: string;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Hook that reads a credential's on-chain status directly from the
 * CredentialRegistry smart contract via a public RPC (no wallet needed).
 *
 * Falls back gracefully if the contract isn't deployed yet or the RPC is down.
 */
export function useVerifyOnChain(
  credentialHash: string | null | undefined
): UseVerifyOnChainResult {
  const [status, setStatus] = useState<CredentialStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!credentialHash) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getCredentialStatus(credentialHash);
      setStatus(result);
    } catch (err: any) {
      setError(err.message ?? "Failed to read on-chain status");
    } finally {
      setLoading(false);
    }
  }, [credentialHash]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return {
    isAnchored: status?.anchored ?? false,
    isRevoked: status?.revoked ?? false,
    anchorBlock: status?.blockAnchored ?? 0,
    issuer: status?.issuer ?? "0x0000000000000000000000000000000000000000",
    loading,
    error,
    refetch: fetch,
  };
}
