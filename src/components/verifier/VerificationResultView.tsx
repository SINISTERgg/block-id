import { useState } from "react";
import { CheckCircle2, XCircle, Link2, PenTool, Copy, Check, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import CredentialAIAssistant from "@/components/CredentialAIAssistant";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

interface VerificationResultViewProps {
  result: Record<string, any>;
  compact?: boolean;
}

const ResultBadge = ({ valid }: { valid: boolean }) =>
  valid ? (
    <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-semibold">
      <CheckCircle2 className="h-3.5 w-3.5" /> VALID
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-destructive/10 text-destructive border border-destructive/20 font-semibold">
      <XCircle className="h-3.5 w-3.5" /> INVALID
    </span>
  );

const CheckTile = ({ ok, label, value }: { ok: boolean; label: string; value: string }) => (
  <div className={`p-3 rounded-lg text-center border ${ok ? "bg-emerald-500/10 border-emerald-500/20" : "bg-destructive/10 border-destructive/20"}`}>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className={`font-semibold ${ok ? "text-emerald-600" : "text-destructive"}`}>{value}</p>
  </div>
);

export const VerificationResultView = ({ result, compact = false }: VerificationResultViewProps) => {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const copyJson = () => {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopied(true);
    toast({ title: "Copied to clipboard", description: "Verification report copied as JSON." });
    setTimeout(() => setCopied(false), 2000);
  };

  if (!result) return null;

  const valid = !!result.valid;
  const onChain = result.on_chain_verification || result.blockchain_info;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {valid ? (
            <CheckCircle2 className="h-6 w-6 text-emerald-500" />
          ) : (
            <XCircle className="h-6 w-6 text-destructive" />
          )}
          <span className={`font-display font-semibold text-lg ${valid ? "text-emerald-600" : "text-destructive"}`}>
            {valid ? "Valid Credential" : "Invalid Credential"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <ResultBadge valid={valid} />
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={copyJson} title="Copy report JSON">
            {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <CheckTile ok={!!result.hash_integrity} label="Hash Integrity" value={result.hash_integrity ? "Valid" : "Tampered"} />
        <CheckTile ok={!!result.not_revoked} label="Revocation" value={result.not_revoked ? "Active" : "Revoked"} />
        <CheckTile ok={result.not_expired !== false} label="Expiry" value={result.not_expired !== false ? "Valid" : "Expired"} />
      </div>

      {result.expires_at && (
        <p className="text-xs text-muted-foreground">
          Expires: {new Date(result.expires_at).toLocaleDateString()}
        </p>
      )}

      {result.blockchain_anchor && (
        <div className="bg-muted rounded-lg p-3">
          <p className="font-mono text-sm flex items-center gap-2 text-verifier break-all">
            <Link2 className="h-4 w-4 shrink-0" />
            Anchor: {result.blockchain_anchor}
          </p>
        </div>
      )}

      {onChain && (
        <div className="bg-muted rounded-lg p-3 space-y-1">
          <p className="font-mono text-sm text-verifier flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Blockchain Verified
          </p>
          {(onChain.contractVerified !== undefined ? onChain.contractAnchored : onChain.txVerified) && (
            <p className="font-mono text-xs text-emerald-600">✓ Anchored on-chain</p>
          )}
          {onChain.blockNumber && (
            <p className="font-mono text-xs text-muted-foreground">Block: #{onChain.blockNumber}</p>
          )}
          {onChain.contractBlockAnchored && (
            <p className="font-mono text-xs text-muted-foreground">Block: #{onChain.contractBlockAnchored}</p>
          )}
          {onChain.explorerUrl && (
            <a
              href={onChain.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs text-primary underline underline-offset-2 hover:text-primary/80"
            >
              View on Etherscan →
            </a>
          )}
        </div>
      )}

      {result.signature && (
        <div className="bg-muted rounded-lg p-3">
          <p className="font-mono text-sm flex items-center gap-2">
            <PenTool className="h-4 w-4 shrink-0" />
            {result.signature.signed ? (
              <span className="text-emerald-600">Wallet Signed ({result.signature.type})</span>
            ) : (
              <span className="text-muted-foreground">Simulated proof ({result.signature.type})</span>
            )}
          </p>
          {result.signature.signer && (
            <p className="font-mono text-xs text-muted-foreground mt-1 break-all">Signer: {result.signature.signer}</p>
          )}
        </div>
      )}

      {result.ai_analysis?.dimensions && (
        <CredentialAIAssistant
          analysis={result.ai_analysis}
          verificationContext={{
            ai_analysis: result.ai_analysis,
            valid: result.valid,
            hash_integrity: result.hash_integrity,
            not_revoked: result.not_revoked,
            not_expired: result.not_expired,
            blockchain_verified: result.blockchain_verified,
            expires_at: result.expires_at,
            blockchain_anchor: result.blockchain_anchor,
            signature: result.signature,
          }}
        />
      )}

      {!compact && (
        <div className="pt-1">
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={() => setShowRaw(p => !p)}>
            {showRaw ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showRaw ? "Hide raw report" : "View raw report"}
          </Button>
          {showRaw && (
            <pre className="mt-2 text-[10px] font-mono bg-muted rounded-lg p-3 overflow-auto max-h-72">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </motion.div>
  );
};

export default VerificationResultView;
