import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Award,
  Wallet,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  Hash,
  Clock,
  Info,
  Copy,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import {
  listHolderSbts,
  isSbtConfigured,
  getSbtAddress,
  toStoredHashFormat,
  type SbtStatus,
} from "@/services/blockchain/sbt.service";
import { fetchHolderBadges, subscribeToHolderCredentials, type HolderBadge } from "@/services/api/holder.service";
import { SBT_NOT_DEPLOYED_HINT, SEPOLIA_EXPLORER } from "@/services/blockchain/config";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { SbtBadgeSvg } from "@/components/holder/SbtBadgeSvg";

interface BadgesViewProps {
  walletAddress: string | undefined;
}

const SBT_CONTRACT = getSbtAddress();

/** What the portal renders for a single badge row. */
interface BadgeRow {
  key: string;
  /** null when the credential has no badge on chain and none recorded. */
  tokenId: number | null;
  credentialHash: string;
  schemaName: string | null;
  credentialType: string | null;
  issuedAt: number | null;
  revoked: boolean;
  /**
   * "minted"    — on chain and valid
   * "revoked"   — on chain but revoked
   * "pending"   — issuer asked for a badge, it is not on chain yet
   * "failed"    — the mint was attempted and did not succeed
   * "unknown"   — recorded token id, chain unreachable
   */
  state: "minted" | "revoked" | "pending" | "failed" | "unknown";
  txHash: string | null;
}

const STATE_STYLES: Record<BadgeRow["state"], { label: string; chip: string; border: string; glow: string }> = {
  minted: {
    label: "Valid",
    chip: "bg-green-500/10 text-green-600 dark:text-green-400",
    border: "border-green-500/20 hover:border-green-500/40",
    glow: "shadow-green-500/5",
  },
  revoked: {
    label: "Revoked",
    chip: "bg-destructive/10 text-destructive",
    border: "border-destructive/30",
    glow: "",
  },
  pending: {
    label: "Pending",
    chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    border: "border-amber-500/30",
    glow: "shadow-amber-500/5",
  },
  failed: {
    label: "Not minted",
    chip: "bg-destructive/10 text-destructive",
    border: "border-destructive/30",
    glow: "",
  },
  unknown: {
    label: "Unverified",
    chip: "bg-muted text-muted-foreground",
    border: "border-border",
    glow: "",
  },
};

const BadgesView = ({ walletAddress }: BadgesViewProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [rows, setRows] = useState<BadgeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const sbtReady = isSbtConfigured();

  /**
   * Badges come from two independent sources and neither is sufficient alone:
   *
   *   • the chain knows which tokens exist and whether they are still valid,
   *     but cannot tell you which credentials you were *supposed* to be
   *     badged for, and returns nothing if the RPC is down
   *   • the database knows which credentials you hold and which badge the
   *     issuer recorded, but is a cache of chain state
   *
   * So: load the database feed, load the wallet's on-chain tokens, then merge
   * on the credential hash (compared prefix-insensitively, because the DB
   * stores bare hex and the chain stores bytes32).
   */
  const loadBadges = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setChainError(null);

    try {
      const [dbBadges, chainSbts] = await Promise.all([
        fetchHolderBadges(user.id),
        (async () => {
          if (!sbtReady || !walletAddress) return [] as SbtStatus[];
          try {
            return await listHolderSbts(walletAddress);
          } catch (err: any) {
            setChainError(err?.message ?? "Failed to read the soulbound contract");
            return [] as SbtStatus[];
          }
        })(),
      ]);

      const merged = new Map<string, BadgeRow>();

      // 1. Database feed first — the authoritative list of "should have a badge".
      for (const b of dbBadges) {
        merged.set(toStoredHashFormat(b.credential_hash), {
          key: b.credential_id,
          tokenId: toNumberOrNull(b.sbt_token_id),
          credentialHash: b.credential_hash,
          schemaName: b.schema_name,
          credentialType: b.credential_type,
          issuedAt: b.sbt_minted_at ? Math.floor(new Date(b.sbt_minted_at).getTime() / 1000) : null,
          revoked: b.sbt_status === "revoked" || b.status === "revoked",
          state: stateFromDb(b),
          txHash: b.sbt_tx_hash,
        });
      }

      // 2. Overlay on-chain truth. A chain token with no DB row (minted before
      //    this was persisted, or issued by another issuer) still shows up.
      for (const s of chainSbts) {
        const hashKey = toStoredHashFormat(s.credentialHash);
        const existing = merged.get(hashKey);
        merged.set(hashKey, {
          key: existing?.key ?? `chain-${s.tokenId}`,
          tokenId: s.tokenId,
          credentialHash: existing?.credentialHash ?? s.credentialHash,
          schemaName: existing?.schemaName ?? null,
          credentialType: existing?.credentialType ?? null,
          issuedAt: s.issuedAt || existing?.issuedAt || null,
          revoked: s.revoked,
          state: s.revoked ? "revoked" : "minted",
          txHash: existing?.txHash ?? null,
        });
      }

      setRows(
        [...merged.values()].sort((a, b) => (b.issuedAt ?? 0) - (a.issuedAt ?? 0))
      );
      setLoaded(true);
    } catch (err: any) {
      console.error("Failed to load badges:", err);
      toast({
        title: "Could not load badges",
        description: err?.message?.slice(0, 200) ?? "Unexpected error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [user, walletAddress, sbtReady, toast]);

  useEffect(() => {
    loadBadges();
  }, [loadBadges]);

  // A badge minted moments ago should appear without a manual refresh.
  useEffect(() => {
    if (!user) return;
    return subscribeToHolderCredentials(user.id, loadBadges);
  }, [user, loadBadges]);

  /** Add the SBT to MetaMask as a watched NFT asset */
  const exportToMetaMask = async (badge: BadgeRow) => {
    if (!window.ethereum || !SBT_CONTRACT || badge.tokenId === null) return;
    try {
      await window.ethereum.request({
        method: "wallet_watchAsset",
        params: {
          type: "ERC721",
          options: {
            address: SBT_CONTRACT,
            tokenId: String(badge.tokenId),
          },
        } as any,
      });
      toast({ title: "Badge added to MetaMask ✓" });
    } catch (err: any) {
      toast({ title: "MetaMask error", description: err.message, variant: "destructive" });
    }
  };

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash).catch(() => {});
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const stats = useMemo(
    () => ({
      total: rows.length,
      valid: rows.filter((r) => r.state === "minted").length,
      pending: rows.filter((r) => r.state === "pending" || r.state === "failed").length,
    }),
    [rows]
  );

  const formatDate = (timestamp: number | null) =>
    timestamp
      ? new Date(timestamp * 1000).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "—";

  const shortHash = (hash: string) =>
    hash.length > 14 ? `${hash.substring(0, 10)}…${hash.substring(hash.length - 6)}` : hash;

  return (
    <>
      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-8"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-headline mb-2">My Badges</h2>
            <p className="text-muted-foreground">
              Soulbound tokens — non-transferable proof of your verified credentials on Ethereum.
            </p>
          </div>
          {loaded && (
            <Button variant="outline" size="sm" onClick={loadBadges} disabled={loading} className="gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          )}
        </div>
      </motion.div>

      {/* ── Stats ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6"
      >
        <Card className="solid-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-holder rounded-lg flex items-center justify-center">
                <Award className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Total Badges</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="solid-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
                <ShieldCheck className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.valid}</p>
                <p className="text-sm text-muted-foreground">Valid On-Chain</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="solid-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${sbtReady ? "bg-green-500/15" : "bg-muted"}`}>
                <Wallet className={`h-6 w-6 ${sbtReady ? "text-green-600" : "text-muted-foreground"}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {sbtReady ? "Contract Active" : "Contract Not Deployed"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {sbtReady
                    ? walletAddress
                      ? `Reading ${shortAddr(walletAddress)}`
                      : "Connect a wallet to read on-chain badges"
                    : "Run deploy-sbt.js to activate"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Chain read failure banner ── */}
      {chainError && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
          <div>
            <p className="font-medium text-foreground">Could not read the soulbound contract</p>
            <p className="text-muted-foreground mt-0.5">
              Showing only what is recorded in the database. {chainError.slice(0, 160)}
            </p>
          </div>
        </div>
      )}

      {/* ── Badge list / state screens ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.3 }}
      >
        {!user ? (
          <Card className="solid-card">
            <CardContent className="py-16">
              <div className="flex flex-col items-center justify-center text-center gap-4">
                <div className="w-14 h-14 bg-muted rounded-xl flex items-center justify-center">
                  <Wallet className="h-7 w-7 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Sign in to view your badges</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Your soulbound tokens are linked to your account and Ethereum wallet.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : loading && !loaded ? (
          <Card className="solid-card">
            <CardContent className="py-16">
              <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading badges…</span>
              </div>
            </CardContent>
          </Card>
        ) : rows.length === 0 ? (
          <Card className="solid-card">
            <CardContent className="py-16">
              <div className="flex flex-col items-center justify-center text-center gap-4">
                <div className="w-20 h-20">
                  <SbtBadgeSvg
                    credentialType={null}
                    schemaName="None"
                    tokenId={null}
                    size={80}
                  />
                </div>
                <div className="max-w-md">
                  <p className="font-semibold text-foreground">No badges yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    When an issuer issues you a credential with the badge option enabled, a
                    non-transferable soulbound token is minted to your wallet on Ethereum Sepolia and
                    appears here.
                  </p>
                  {!walletAddress && (
                    <p className="text-xs text-muted-foreground mt-3">
                      Connect a wallet from the Wallet tab so on-chain badges can be located.
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="solid-card mb-4">
              <CardHeader className="pb-3 bg-muted/30">
                <CardTitle className="font-display text-base flex items-center gap-2">
                  <Award className="h-4 w-4 text-primary" />
                  Earned Badges
                  <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                    {rows.length}
                  </span>
                </CardTitle>
              </CardHeader>
            </Card>

            {/* Badge cards grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <AnimatePresence>
                {rows.map((badge, index) => {
                  const style = STATE_STYLES[badge.state];
                  return (
                    <motion.div
                      key={badge.key}
                      initial={{ opacity: 0, y: 16, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: index * 0.05, type: "spring", stiffness: 280, damping: 24 }}
                    >
                      <Card
                        className={`border transition-all duration-200 shadow-sm ${style.border} ${style.glow} hover:shadow-md bg-card`}
                      >
                        <CardContent className="p-5">
                          {/* Top section: SVG badge + title */}
                          <div className="flex items-start gap-4 mb-4">
                            {/* SVG Badge Thumbnail */}
                            <div className="shrink-0">
                              {badge.state === "pending" ? (
                                <div className="w-[72px] h-[72px] rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center">
                                  <Clock className="h-8 w-8 text-amber-500 opacity-70" />
                                </div>
                              ) : badge.state === "failed" ? (
                                <div className="w-[72px] h-[72px] rounded-xl bg-destructive/10 border border-destructive/25 flex items-center justify-center">
                                  <AlertTriangle className="h-8 w-8 text-destructive opacity-70" />
                                </div>
                              ) : (
                                <SbtBadgeSvg
                                  credentialType={badge.credentialType}
                                  schemaName={badge.schemaName}
                                  tokenId={badge.tokenId}
                                  size={72}
                                  revoked={badge.revoked}
                                  className="rounded-xl"
                                />
                              )}
                            </div>

                            {/* Title + status chip */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <p className="font-semibold text-foreground text-sm leading-snug truncate">
                                  {badge.schemaName ?? (badge.tokenId !== null ? `Badge #${badge.tokenId}` : "Credential badge")}
                                </p>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap shrink-0 ${style.chip}`}>
                                  {style.label}
                                </span>
                              </div>

                              {/* Token # + date */}
                              <p className="text-xs text-muted-foreground">
                                {badge.tokenId !== null ? (
                                  <span className="font-mono">Token #{badge.tokenId}</span>
                                ) : (
                                  <span className="italic opacity-60">Not yet minted</span>
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {badge.issuedAt ? `Issued ${formatDate(badge.issuedAt)}` : "Not yet on chain"}
                              </p>

                              {/* Credential type tag */}
                              {badge.credentialType && (
                                <span className="inline-block mt-1.5 text-xs px-1.5 py-0.5 rounded bg-primary/8 text-primary/70 font-mono">
                                  {badge.credentialType}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Credential hash */}
                          <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground bg-muted/60 rounded-lg px-3 py-2 mb-3">
                            <Hash className="h-3 w-3 shrink-0" />
                            <span className="truncate flex-1" title={badge.credentialHash}>
                              {shortHash(badge.credentialHash)}
                            </span>
                            <button
                              onClick={() => copyHash(badge.credentialHash)}
                              className="shrink-0 hover:text-foreground transition-colors"
                              title="Copy full hash"
                            >
                              {copiedHash === badge.credentialHash ? (
                                <CheckCircle2 className="h-3 w-3 text-green-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          </div>

                          {/* State-specific messages */}
                          {badge.state === "pending" && (
                            <p className="mb-3 text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
                              <Info className="h-3 w-3 shrink-0 mt-0.5" />
                              Badge requested but not yet minted on chain. Ask the issuer to retry.
                            </p>
                          )}
                          {badge.state === "failed" && (
                            <p className="mb-3 text-xs text-destructive flex items-start gap-1.5">
                              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                              The badge mint failed. The credential itself is unaffected.
                            </p>
                          )}
                          {badge.revoked && badge.state === "revoked" && (
                            <p className="mb-3 text-xs text-destructive flex items-start gap-1.5">
                              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                              This soulbound badge has been revoked on-chain.
                            </p>
                          )}

                          {/* Action buttons */}
                          {badge.state === "minted" && SBT_CONTRACT && badge.tokenId !== null && (
                            <div className="flex flex-wrap gap-2">
                              {window.ethereum && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs gap-1 flex-1"
                                  onClick={() => exportToMetaMask(badge)}
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  Add to MetaMask
                                </Button>
                              )}
                              <a
                                href={`${SEPOLIA_EXPLORER}/nft/${SBT_CONTRACT}/${badge.tokenId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1"
                              >
                                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 w-full">
                                  <ExternalLink className="h-3 w-3" />
                                  Etherscan
                                </Button>
                              </a>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </>
        )}
      </motion.div>

      {/* ── Contract not deployed ── */}
      {!sbtReady && user && (
        <div className="mt-6 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
          <div>
            <p className="font-medium text-foreground">Soulbound contract not deployed</p>
            <p className="text-muted-foreground mt-0.5 font-mono text-xs">{SBT_NOT_DEPLOYED_HINT}</p>
          </div>
        </div>
      )}

      {/* ── Info box ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.3 }}
        className="mt-6"
      >
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 text-sm text-muted-foreground space-y-1">
          <p className="font-medium text-foreground flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            What are Soulbound Tokens (SBTs)?
          </p>
          <p>
            SBTs are non-transferable NFTs that permanently record your verified credentials on the
            Ethereum blockchain. Unlike regular NFTs, you cannot sell or transfer them — they
            represent your identity and achievements.
          </p>
        </div>
      </motion.div>
    </>
  );
};

/** Derive the render state from what the database recorded. */
function stateFromDb(b: HolderBadge): BadgeRow["state"] {
  if (b.sbt_status === "failed") return "failed";
  if (b.sbt_token_id === null || b.sbt_token_id === undefined || b.sbt_token_id === "") {
    if (b.sbt_status === "revoked") return "revoked";
    // No token and no explicit state: only a *requested* badge is "pending".
    // Anything else means the feed leaked a non-badge credential.
    return b.sbt_requested ? "pending" : "unknown";
  }
  if (b.sbt_status === "revoked" || b.sbt_status === "burned") return "revoked";
  if (b.sbt_status === "minted") return "minted";
  return "minted";
}

function toNumberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function shortAddr(addr: string): string {
  return `${addr.substring(0, 8)}…${addr.substring(addr.length - 4)}`;
}

export default BadgesView;
