/**
 * OnChainBadge — compact inline on-chain status badge.
 * Lazily fetches from the CredentialRegistry contract when rendered.
 * Extracted from BlockchainExplorer.tsx.
 */
import { useState, useEffect } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { getCredentialStatus, type CredentialStatus } from "@/services/blockchain/registry";
import { IS_CONTRACT_DEPLOYED } from "@/services/blockchain/config";

export const OnChainBadge = ({ hash }: { hash: string | null }) => {
  const [status, setStatus] = useState<CredentialStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (!hash || !IS_CONTRACT_DEPLOYED || fetched) return;
    let cancelled = false;
    setLoading(true);
    getCredentialStatus(hash)
      .then((s) => { if (!cancelled) { setStatus(s); setFetched(true); } })
      .catch(() => { if (!cancelled) setFetched(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [hash, fetched]);

  if (!IS_CONTRACT_DEPLOYED) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
        Contract not deployed
      </span>
    );
  }
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking...
      </span>
    );
  }
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground">
        — Not checked
      </span>
    );
  }
  if (status.revoked) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium">
        <XCircle className="h-3 w-3" /> Revoked on-chain
      </span>
    );
  }
  if (status.anchored) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 font-medium">
        <CheckCircle2 className="h-3 w-3" /> Verified on Sepolia ✓
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-600 font-medium">
      ⚠ Not anchored on-chain
    </span>
  );
};

/**
 * OnChainDetailsPanel — expanded anchor details sourced from the smart contract.
 * Independently verifies on-chain anchoring state.
 * Extracted from BlockchainExplorer.tsx.
 */
import { AMOY_EXPLORER } from "@/services/blockchain/config";
import { ExternalLink } from "lucide-react";

export const OnChainDetailsPanel = ({
  credentialHash,
  storedTxHash,
}: {
  credentialHash: string;
  storedTxHash?: string;
}) => {
  const [status, setStatus] = useState<CredentialStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!IS_CONTRACT_DEPLOYED || !credentialHash) { setLoading(false); return; }
    let cancelled = false;

    const fetchOnChainData = async () => {
      try {
        const contractStatus = await getCredentialStatus(credentialHash);
        if (!cancelled) {
          setStatus(contractStatus);
        }
      } catch (err) {
        console.warn("[BlockID] OnChainDetailsPanel fetch error:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const timeoutId = setTimeout(() => { if (!cancelled) setLoading(false); }, 5000);
    fetchOnChainData();
    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, [credentialHash, storedTxHash]);

  if (loading) {
    return (
      <div className="glass rounded-xl p-3 space-y-1.5">
        <p className="font-semibold text-foreground flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Verifying on-chain anchoring…
        </p>
      </div>
    );
  }

  if (!status) return null;

  const contractAddr = import.meta.env.VITE_CREDENTIAL_REGISTRY_ADDRESS;

  if (!status.anchored) {
    return (
      <div className="glass rounded-xl p-3 space-y-1.5 border border-destructive/30">
        <p className="font-semibold text-destructive flex items-center gap-1">
          <XCircle className="h-3 w-3" /> Not Anchored on Sepolia
        </p>
        {storedTxHash && (
          <p className="text-xs text-amber-500">
            Stored txHash: {storedTxHash.substring(0, 18)}... but not found on-chain
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="glass rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-green-500" />
        <p className="font-semibold text-foreground">On-Chain Anchored via Smart Contract</p>
      </div>
      <p className="text-xs text-muted-foreground">
        The credential hash is stored as bytes32 in the CredentialRegistry contract on Ethereum Sepolia.
        This provides immutable, cryptographic proof of existence at a specific point in time.
      </p>
      {status.blockAnchored > 0 && <p className="font-mono">Block: #{status.blockAnchored}</p>}
      {status.anchoredAt > 0 && (
        <p className="font-mono">Anchored: {new Date(status.anchoredAt * 1000).toLocaleString()}</p>
      )}
      {status.issuer && status.issuer !== "0x0000000000000000000000000000000000000000" && (
        <p className="font-mono break-all">
          Issuer: {status.issuer.substring(0, 10)}...{status.issuer.substring(status.issuer.length - 6)}
        </p>
      )}
      {contractAddr && (
        <a
          href={`${AMOY_EXPLORER}/address/${contractAddr}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary underline font-mono hover:opacity-80 transition-opacity text-xs"
        >
          <ExternalLink className="h-3 w-3" /> View Contract ↗
        </a>
      )}
      {status.revoked && status.revokedAt > 0 && (
        <p className="font-mono text-destructive">
          Revoked: {new Date(status.revokedAt * 1000).toLocaleString()}
        </p>
      )}
    </div>
  );
};
