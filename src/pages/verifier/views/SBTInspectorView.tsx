/**
 * SBT Inspector — what a soulbound token actually asserts.
 *
 * A soulbound badge is a *pointer*, not a credential: it says "a credential
 * with this hash was minted to this address". It carries none of the
 * credential's contents and does not inherit the credential's validity. The
 * inspector is written to make that boundary explicit, because "the SBT is
 * valid" and "the credential is valid" are very different claims and
 * dashboards routinely conflate them.
 */
import { useCallback, useEffect, useState } from "react";
import { Award, Search, Loader2, Copy, ExternalLink, Ban, AlertTriangle, Check } from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  getSbtForCredential,
  getSbtTotalSupply,
  getSbtAddress,
  isSbtConfigured,
  normalizeCredentialHash,
  type SbtStatus,
} from "@/services/blockchain/sbt.service";

/** Sibling of the holder evidence strip: a one-line SBT verdict. */
export function SbtBadge({ status }: { status: SbtStatus | null | undefined }) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        no badge
      </span>
    );
  }
  if (status.revoked) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-destructive">
        <Ban className="h-2.5 w-2.5" /> revoked #{status.tokenId}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-emerald-500">
      <Award className="h-2.5 w-2.5" /> sbt #{status.tokenId}
    </span>
  );
}

const SBTInspectorView = () => {
  const { toast } = useToast();
  const [hashInput, setHashInput] = useState("");
  const [status, setStatus] = useState<SbtStatus | null>(null);
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [supply, setSupply] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const configured = isSbtConfigured();
  const soulboundAddress = getSbtAddress();

  useEffect(() => {
    if (!configured) return;
    getSbtTotalSupply().then(setSupply);
  }, [configured]);

  const lookup = useCallback(
    async (hash: string) => {
      const trimmed = hash.trim();
      if (!trimmed) return;
      if (!configured) {
        setError("Soulbound contract not configured — set VITE_SOULBOUND_CREDENTIAL_ADDRESS.");
        setStatus(null);
        setChecked(true);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        setStatus(await getSbtForCredential(normalizeCredentialHash(trimmed)));
        setChecked(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus(null);
        setChecked(true);
      } finally {
        setLoading(false);
      }
    },
    [configured]
  );

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <h2 className="text-headline mb-1">SBT Inspector</h2>
        <p className="text-muted-foreground">
          Resolve the soulbound badge bound to a credential hash
        </p>
      </motion.div>

      <Card className="solid-card">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-verifier flex items-center justify-center">
                <Award className="h-4 w-4 text-[#030304]" />
              </div>
              <div>
                <h3 className="font-display font-semibold text-foreground">Credential hash lookup</h3>
                <p className="text-xs text-muted-foreground">
                  {configured
                    ? supply !== null
                      ? `${supply} badge${supply === 1 ? "" : "s"} minted on this deployment`
                      : "Soulbound registry on Sepolia"
                    : "Contract not configured"}
                </p>
              </div>
            </div>
            {soulboundAddress ? (
              <a
                href={`https://sepolia.etherscan.io/address/${soulboundAddress}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[10px] text-verifier hover:underline inline-flex items-center gap-1"
              >
                {soulboundAddress.slice(0, 12)}…<ExternalLink className="h-2.5 w-2.5" />
              </a>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Credential SHA-256 hash</Label>
            <div className="flex gap-2">
              <Input
                value={hashInput}
                onChange={(e) => setHashInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") lookup(hashInput); }}
                placeholder="0x… (64 hex chars)"
                className="font-mono text-xs input-solid"
              />
              <Button className="btn-primary gap-2 shrink-0" onClick={() => lookup(hashInput)} disabled={loading || !hashInput.trim()}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Look up
              </Button>
            </div>
          </div>

          {error ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[11px] text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          ) : null}

          {checked && !loading && !error ? (
            status ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <SbtBadge status={status} />
                  <span className="font-mono text-[11px] text-muted-foreground">
                    minted {new Date(status.issuedAt * 1000).toISOString().slice(0, 10)}
                  </span>
                </div>

                <div className="rounded-lg border border-border divide-y divide-border/60 overflow-hidden">
                  {[
                    { k: "Token ID", v: `#${status.tokenId}` },
                    { k: "Holder", v: status.holder },
                    { k: "Credential hash", v: status.credentialHash },
                    { k: "Transferable", v: "no — soulbound by contract" },
                    {
                      k: "Status",
                      v: status.revoked ? "revoked" : "active",
                    },
                  ].map((row) => (
                    <div key={row.k} className="flex items-center justify-between gap-3 px-3 py-2 text-[11px]">
                      <span className="text-muted-foreground shrink-0">{row.k}</span>
                      <span className="font-mono text-foreground truncate flex items-center gap-1.5">
                        {row.v}
                        <button
                          onClick={() => { navigator.clipboard.writeText(row.v); toast({ title: "Copied" }); }}
                          className="text-muted-foreground hover:text-foreground shrink-0"
                          aria-label={`Copy ${row.k}`}
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </span>
                    </div>
                  ))}
                </div>

                <Separator />

                <div className="flex items-start gap-2 text-[10px] text-muted-foreground leading-relaxed">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <span>
                    A badge proves a credential with this hash was minted to this address. It
                    does <em>not</em> carry the credential&apos;s claims and does not stay valid
                    if the credential is revoked off-chain — check revocation separately.
                  </span>
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-3 text-[11px] text-muted-foreground"
              >
                <Check className="h-3.5 w-3.5 shrink-0" />
                No soulbound token is bound to this hash. Either it was never minted, or it
                was minted against a different hash form (the registry keys on{" "}
                <span className="font-mono">0x</span>-prefixed SHA-256).
              </motion.div>
            )
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};

export default SBTInspectorView;
