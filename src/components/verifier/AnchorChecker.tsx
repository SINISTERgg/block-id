import { useState } from "react";
import {
  Link2, Search, Loader2, ShieldCheck, ShieldAlert, ShieldX,
  Hash, Building2, Calendar, Clock, ExternalLink, User, FileText, Box,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

interface AnchoredCredential {
  id: string;
  credential_hash: string;
  blockchain_anchor: string | null;
  status: string;
  revoked_at: string | null;
  issued_at: string;
  expires_at: string | null;
  holder_did: string;
  signer_address: string | null;
  credential_data: {
    issuer?: unknown;
    blockchain?: {
      network?: string;
      chainId?: number;
      txHash?: string;
      blockNumber?: number;
      anchoredAt?: number;
      anchorWallet?: string | null;
      explorerUrl?: string;
      method?: string;
    } | null;
  } | null;
  credential_schemas?: { name?: string; credential_type?: string } | null;
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  active: { label: "Active", icon: ShieldCheck, cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  revoked: { label: "Revoked", icon: ShieldX, cls: "bg-destructive/10 text-destructive border-destructive/20" },
  expired: { label: "Expired", icon: ShieldAlert, cls: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
};

const AnchorChecker = () => {
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [checking, setChecking] = useState(false);
  const [credential, setCredential] = useState<AnchoredCredential | null>(null);
  const [notFound, setNotFound] = useState(false);

  const lookup = async () => {
    const value = input.trim();
    if (!value) return;
    setChecking(true);
    setCredential(null);
    setNotFound(false);
    try {
      const needle = value.toLowerCase();
      const isHash = /^[0-9a-f]{64}$/.test(needle.replace(/^0x/, ""));

      const { data, error } = await supabase
        .from("credentials")
        .select("*, credential_schemas(name, credential_type)")
        .or(
          isHash
            ? `credential_hash.eq.${needle.replace(/^0x/, "")},blockchain_anchor.ilike.%${needle.slice(0, 18)}%`
            : `blockchain_anchor.ilike.%${needle}%`
        )
        .limit(1);

      if (error) throw error;
      const found = data?.[0] as AnchoredCredential | undefined;
      if (!found) {
        setNotFound(true);
        toast({ title: "Not found", description: "No anchored credential matches that hash or transaction.", variant: "destructive" });
        return;
      }
      setCredential(found);
    } catch (err: any) {
      toast({ title: "Lookup failed", description: err.message, variant: "destructive" });
    } finally {
      setChecking(false);
    }
  };

  const effectiveStatus = credential
    ? credential.status === "active" && credential.expires_at && new Date(credential.expires_at) < new Date()
      ? "expired"
      : credential.status
    : "";
  const cfg = STATUS_CONFIG[effectiveStatus] || STATUS_CONFIG.active;
  const StatusIcon = cfg.icon;
  const chain = credential?.credential_data?.blockchain;
  const subject = credential?.credential_data as any;

  return (
    <Card className="solid-card">
      <CardContent className="pt-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-verifier/10 flex items-center justify-center">
            <Link2 className="h-5 w-5 text-verifier" />
          </div>
          <div>
            <h3 className="font-display font-semibold text-foreground">On-Chain Anchor Checker</h3>
            <p className="text-xs text-muted-foreground">Look up a credential by transaction hash, anchor, or credential hash</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="anchor-input">Transaction hash / anchor / credential hash</Label>
          <div className="flex gap-2">
            <Input
              id="anchor-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && lookup()}
              placeholder="0x… or sepolia:0x…:123 or 64-char SHA-256 hash"
              className="font-mono text-xs input-solid"
            />
            <Button onClick={lookup} disabled={checking || !input.trim()} variant="verifier" className="shrink-0">
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="hidden sm:inline">Check</span>
            </Button>
          </div>
        </div>

        <AnimatePresence>
          {checking && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-6 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-verifier mx-auto" />
              <p className="text-xs text-muted-foreground mt-2">Querying on-chain registry…</p>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {notFound && !checking && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="py-6 text-center">
              <Box className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No matching anchor found.</p>
            </motion.div>
          )}
        </AnimatePresence>

        {credential && !checking && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4 animate-in slide-in-from-top-2 duration-300"
          >
            {/* Header with status */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-verifier/5 to-transparent border border-verifier/10">
              <div className="w-10 h-10 rounded-lg bg-verifier/10 flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5 text-verifier" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {credential.credential_schemas?.name || subject?.schemaName || "Credential"}
                </p>
                <p className="text-xs text-muted-foreground font-mono truncate">{credential.id}</p>
              </div>
              <span className={`inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border font-semibold ${cfg.cls}`}>
                <StatusIcon className="h-3.5 w-3.5" /> {cfg.label.toUpperCase()}
              </span>
            </div>

            {/* Facts grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-md bg-muted/40 border border-border/40">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-0.5 flex items-center gap-1">
                  <Hash className="h-3 w-3" /> Credential Hash
                </p>
                <p className="font-mono text-foreground break-all">{credential.credential_hash}</p>
              </div>
              <div className="p-2.5 rounded-md bg-muted/40 border border-border/40">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-0.5 flex items-center gap-1">
                  <User className="h-3 w-3" /> Holder
                </p>
                <p className="font-mono text-foreground break-all">{credential.holder_did}</p>
              </div>
              <div className="p-2.5 rounded-md bg-muted/40 border border-border/40">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-0.5 flex items-center gap-1">
                  <Building2 className="h-3 w-3" /> Anchor
                </p>
                <p className="font-mono text-foreground break-all">{credential.blockchain_anchor || "—"}</p>
              </div>
              <div className="p-2.5 rounded-md bg-muted/40 border border-border/40">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-0.5 flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Issued
                </p>
                <p className="text-foreground font-medium">{new Date(credential.issued_at).toLocaleDateString()}</p>
                {credential.expires_at && (
                  <p className="text-muted-foreground text-[10px] mt-0.5">
                    Expires {new Date(credential.expires_at).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>

            {/* Chain info */}
            {chain?.txHash && (
              <div className="bg-muted rounded-lg p-3 space-y-1.5">
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Link2 className="h-3.5 w-3.5 text-verifier" /> Blockchain Record
                </p>
                <p className="font-mono text-[11px] text-muted-foreground break-all">Tx: {chain.txHash}</p>
                {chain.blockNumber != null && (
                  <p className="font-mono text-[11px] text-muted-foreground">
                    Block: #{chain.blockNumber} · Network: {chain.network || "sepolia"}
                  </p>
                )}
                {chain.anchoredAt && (
                  <p className="font-mono text-[11px] text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Anchored {new Date(chain.anchoredAt * 1000).toLocaleString()}
                  </p>
                )}
                {chain.explorerUrl && (
                  <a
                    href={chain.explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-primary underline underline-offset-2 hover:text-primary/80"
                  >
                    <ExternalLink className="h-3 w-3" /> View on Etherscan
                  </a>
                )}
              </div>
            )}

            {credential.signer_address && (
              <p className="text-[11px] text-muted-foreground font-mono">
                Signer: {credential.signer_address}
              </p>
            )}
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
};

export default AnchorChecker;
