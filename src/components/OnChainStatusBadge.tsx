import { useState } from "react";
import { CheckCircle2, XCircle, Loader2, RefreshCw, ExternalLink } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";

interface OnChainStatusBadgeProps {
  credentialId: string;
  credentialData: any;
  blockchainAnchor: string | null;
}

type VerifyStatus = "idle" | "checking" | "verified" | "failed";

const OnChainStatusBadge = ({ credentialId, credentialData, blockchainAnchor }: OnChainStatusBadgeProps) => {
  const [status, setStatus] = useState<VerifyStatus>("idle");
  const [details, setDetails] = useState<string>("");

  const blockchain = credentialData?.blockchain;
  const txHash = blockchain?.txHash;
  const explorerUrl = blockchain?.explorerUrl;

  if (!blockchainAnchor || !txHash) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
        <XCircle className="h-3 w-3" /> No anchor
      </span>
    );
  }

  const verify = async () => {
    setStatus("checking");
    try {
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-credential`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.session?.access_token}`,
          },
          body: JSON.stringify({ credential_id: credentialId }),
        }
      );
      const result = await res.json();
      if (result.blockchain_verified) {
        setStatus("verified");
        setDetails(`Block #${result.on_chain_verification?.blockNumber || "?"}`);
      } else {
        setStatus("failed");
        setDetails(result.error || "Hash mismatch or tx not found");
      }
    } catch {
      setStatus("failed");
      setDetails("Network error");
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={(e) => { e.stopPropagation(); if (status !== "checking") verify(); }}
            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full transition-colors cursor-pointer ${
              status === "verified"
                ? "bg-accent text-accent-foreground"
                : status === "failed"
                ? "bg-destructive/10 text-destructive"
                : status === "checking"
                ? "bg-muted text-muted-foreground animate-pulse"
                : "bg-primary/10 text-primary hover:bg-primary/20"
            }`}
          >
            {status === "checking" && <Loader2 className="h-3 w-3 animate-spin" />}
            {status === "verified" && <CheckCircle2 className="h-3 w-3" />}
            {status === "failed" && <XCircle className="h-3 w-3" />}
            {status === "idle" && <RefreshCw className="h-3 w-3" />}
            {status === "idle" ? "Verify on-chain" : status === "checking" ? "Checking..." : status === "verified" ? "On-chain ✓" : "Failed"}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          {status === "idle" && <p>Click to verify this credential's hash on the Polygon Amoy blockchain</p>}
          {status === "checking" && <p>Querying blockchain RPCs...</p>}
          {status === "verified" && <p>✅ On-chain hash matches. {details}</p>}
          {status === "failed" && <p>❌ {details}</p>}
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline mt-1"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3 w-3" /> View on PolygonScan
            </a>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default OnChainStatusBadge;
