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
  Link2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import {
  listHolderSbts,
  isSbtConfigured,
  getSbtAddress,
  toStoredHashFormat,
  resolveHolderAddress,
  type SbtStatus,
} from "@/services/blockchain/sbt.service";
import { fetchHolderBadges, subscribeToHolderCredentials, type HolderBadge } from "@/services/api/holder.service";
import {
  SBT_NOT_DEPLOYED_HINT,
  SEPOLIA_CHAIN_ID_HEX,
  SEPOLIA_EXPLORER,
  SEPOLIA_NETWORK,
} from "@/services/blockchain/config";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { SbtBadgeSvg, buildBadgeSvgDataUri } from "@/components/holder/SbtBadgeSvg";

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
  /**
   * Address the badge was minted to (case-preserved). null for credentials
   * whose badge was never minted — those belong to the signed-in holder no
   * matter which wallet is connected, so they are never filtered out.
   */
  holderAddress: string | null;
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
  const { user, profile } = useAuth();
  const [rows, setRows] = useState<BadgeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [scope, setScope] = useState<"account" | "all">("account");
  const [exportBadge, setExportBadge] = useState<BadgeRow | null>(null);
  const [watchResult, setWatchResult] = useState<"added" | "failed" | "skipped">("skipped");
  const sbtReady = isSbtConfigured();

  /**
   * The address the current account is "acting as": the connected wallet, or
   * failing that the address bound into the holder's DID. null when neither
   * exists — in that case there is nothing to scope badges against.
   */
  const activeAddress = useMemo(() => {
    const resolved = walletAddress ?? resolveHolderAddress(profile?.did, null);
    return resolved ? resolved.toLowerCase() : null;
  }, [walletAddress, profile?.did]);

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
          holderAddress: b.sbt_holder_address,
        });
      }

      // 2. Overlay on-chain truth. A chain token with no DB row (minted before
      //    this was persisted, or issued by another issuer) still shows up —
      //    it was read from the contract for `walletAddress`, so it is by
      //    definition owned by the active account.
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
          holderAddress: existing?.holderAddress ?? walletAddress ?? null,
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

  /**
   * Scope filter. The DB feed (`get_holder_badges`) is scoped to the
   * signed-in *user*, not to the connected wallet, so a holder who has used
   * more than one account/wallet sees every badge they have ever collected.
   * Default scope is the active account:
   *   - rows minted to a different address are hidden
   *   - rows never minted (`sbt_holder_address` null) stay — they still belong
   *     to this holder regardless of which wallet is connected
   * "all" restores the full feed. Without a resolvable address there is
   * nothing to scope against, so the toggle collapses to "all".
   */
  const effectiveScope: "account" | "all" = activeAddress ? scope : "all";

  const visibleRows = useMemo(() => {
    if (effectiveScope === "all" || !activeAddress) return rows;
    return rows.filter((r) => !r.holderAddress || r.holderAddress.toLowerCase() === activeAddress);
  }, [rows, effectiveScope, activeAddress]);

  const hiddenCount = rows.length - visibleRows.length;

  /** Ask MetaMask to move to Sepolia first — the SBT only exists there. */
  const ensureSepolia = async (): Promise<boolean> => {
    if (!window.ethereum) return false;
    try {
      const current = String(await window.ethereum.request({ method: "eth_chainId" })).toLowerCase();
      if (current === SEPOLIA_CHAIN_ID_HEX) return true;
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
      });
      const after = String(await window.ethereum.request({ method: "eth_chainId" })).toLowerCase();
      if (after === SEPOLIA_CHAIN_ID_HEX) return true;
      toast({
        title: "Switch to Sepolia",
        description: `This badge lives on ${SEPOLIA_NETWORK.chainName}.`,
        variant: "destructive",
      });
      return false;
    } catch (err: any) {
      // 4902 = chain not added to the wallet; anything else = user rejected.
      toast({
        title: "Sepolia required",
        description: err?.message?.slice(0, 160) ?? "Approve the network switch in MetaMask to import this badge.",
        variant: "destructive",
      });
      return false;
    }
  };

  /**
   * Add the SBT to MetaMask as a watched NFT asset.
   *
   * `wallet_watchAsset` for ERC721 only accepts `address` + `tokenId`, and on
   * testnets MetaMask frequently shows an empty tile because its NFT service
   * has not indexed the contract (or the wallet is on the wrong chain). So:
   * guard the chain first, then always fall through to the import dialog which
   * carries the preview, contract address, token id, an Etherscan link and the
   * manual "Import NFT" instructions.
   */
  const exportToMetaMask = async (badge: BadgeRow) => {
    if (badge.tokenId === null || !SBT_CONTRACT) {
      setExportBadge(badge);
      setWatchResult("skipped");
      return;
    }

    if (!window.ethereum) {
      setExportBadge(badge);
      setWatchResult("skipped");
      return;
    }

    const onSepolia = await ensureSepolia();
    if (!onSepolia) {
      setExportBadge(badge);
      setWatchResult("skipped");
      return;
    }

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
      setWatchResult("added");
    } catch {
      // Rejected, unsupported, or the wallet could not render the token —
      // the dialog below covers every one of those cases.
      setWatchResult("failed");
    }
    setExportBadge(badge);
  };

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash).catch(() => {});
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const stats = useMemo(
    () => ({
      total: visibleRows.length,
      valid: visibleRows.filter((r) => r.state === "minted").length,
      pending: visibleRows.filter((r) => r.state === "pending" || r.state === "failed").length,
    }),
    [visibleRows]
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-headline mb-2">My Badges</h2>
            <p className="text-muted-foreground">
              Soulbound tokens — non-transferable proof of your verified credentials on Ethereum.
            </p>
            {activeAddress && (
              <p className="mt-1 text-xs font-mono text-muted-foreground/80 flex items-center gap-1.5">
                <Link2 className="h-3 w-3" />
                Active account {shortAddr(activeAddress)}
                {effectiveScope === "account" && (
                  <span className="text-muted-foreground/60">
                    · {stats.total} badge{stats.total === 1 ? "" : "s"}
                    {hiddenCount > 0 ? ` · ${hiddenCount} on other wallets` : ""}
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeAddress && (
              <div className="flex rounded-lg border border-border/60 bg-muted/40 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setScope("account")}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    effectiveScope === "account"
                      ? "bg-background text-foreground shadow-sm font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Current Account
                </button>
                <button
                  type="button"
                  onClick={() => setScope("all")}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    effectiveScope === "all"
                      ? "bg-background text-foreground shadow-sm font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  All My Badges
                </button>
              </div>
            )}
            {loaded && (
              <Button variant="outline" size="sm" onClick={loadBadges} disabled={loading} className="gap-1.5">
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            )}
          </div>
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
        ) : visibleRows.length === 0 ? (
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
                  {rows.length > 0 ? (
                    <>
                      <p className="font-semibold text-foreground">
                        No badges on this account
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Your other {rows.length} badge{rows.length === 1 ? "" : "s"} were minted to a
                        different wallet. Switch to “All My Badges” to see them.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 gap-1.5"
                        onClick={() => setScope("all")}
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        Show all my badges
                      </Button>
                    </>
                  ) : (
                    <>
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
                    </>
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
                    {visibleRows.length}
                  </span>
                </CardTitle>
              </CardHeader>
            </Card>

            {/* Badge cards grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <AnimatePresence>
                {visibleRows.map((badge, index) => {
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
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs gap-1 flex-1"
                                onClick={() => exportToMetaMask(badge)}
                              >
                                <ExternalLink className="h-3 w-3" />
                                {window.ethereum ? "Add to MetaMask" : "Export badge"}
                              </Button>
                              <a
                                href={
                                  badge.txHash
                                    ? `${SEPOLIA_EXPLORER}/tx/${badge.txHash}`
                                    : `${SEPOLIA_EXPLORER}/nft/${SBT_CONTRACT}/${badge.tokenId}`
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1"
                              >
                                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 w-full">
                                  <ExternalLink className="h-3 w-3" />
                                  {badge.txHash ? "View Tx on Chain" : "Etherscan"}
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
      {/* ── Export / import dialog ── */}
      <Dialog open={exportBadge !== null} onOpenChange={(open) => { if (!open) setExportBadge(null); }}>
        <DialogContent className="max-w-md">
          {exportBadge && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-primary" />
                  Add badge to wallet
                </DialogTitle>
                <DialogDescription>
                  {watchResult === "added"
                    ? "Sent to MetaMask. If the tile looks empty, use the manual import below."
                    : watchResult === "failed"
                      ? "MetaMask did not accept the automatic import — use the manual steps below."
                      : "Confirm your wallet is on Ethereum Sepolia, or import the NFT manually."}
                </DialogDescription>
              </DialogHeader>

              <div className="flex items-start gap-4">
                <img
                  src={buildBadgeSvgDataUri(
                    exportBadge.credentialType,
                    exportBadge.schemaName,
                    exportBadge.tokenId
                  )}
                  alt="Badge preview"
                  width={96}
                  height={96}
                  className="w-24 h-24 rounded-xl shrink-0 border border-border/60"
                />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="font-semibold text-foreground text-sm leading-snug truncate">
                    {exportBadge.schemaName ??
                      (exportBadge.tokenId !== null ? `Badge #${exportBadge.tokenId}` : "Credential badge")}
                  </p>
                  {exportBadge.credentialType && (
                    <span className="inline-block text-xs px-1.5 py-0.5 rounded bg-primary/8 text-primary/70 font-mono">
                      {exportBadge.credentialType}
                    </span>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {exportBadge.issuedAt ? `Issued ${formatDate(exportBadge.issuedAt)}` : "—"}
                  </p>
                </div>
              </div>

              {/* Contract / token / network */}
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2 bg-muted/60 rounded-lg px-3 py-2">
                  <Hash className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wide">Contract</p>
                    <p className="font-mono truncate" title={SBT_CONTRACT}>{SBT_CONTRACT}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyHash(SBT_CONTRACT)}
                    className="shrink-0 hover:text-foreground transition-colors"
                    title="Copy contract address"
                  >
                    {copiedHash === SBT_CONTRACT ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-2 bg-muted/60 rounded-lg px-3 py-2">
                  <Hash className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wide">Token ID</p>
                    <p className="font-mono truncate">{String(exportBadge.tokenId)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyHash(String(exportBadge.tokenId))}
                    className="shrink-0 hover:text-foreground transition-colors"
                    title="Copy token ID"
                  >
                    {copiedHash === String(exportBadge.tokenId) ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-2 bg-muted/60 rounded-lg px-3 py-2">
                  <Wallet className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wide">Network</p>
                    <p className="font-mono truncate">
                      {SEPOLIA_NETWORK.chainName} · chain ID {SEPOLIA_NETWORK.chainId}
                    </p>
                  </div>
                </div>
              </div>

              {/* Manual import fallback */}
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Manual import in MetaMask</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Open MetaMask and switch to <span className="text-foreground">Ethereum Sepolia</span></li>
                  <li>Go to the <span className="text-foreground">NFTs</span> tab → <span className="text-foreground">Import NFT</span></li>
                  <li>Paste the contract address and token ID above</li>
                </ol>
                <p className="text-[11px] pt-1">
                  Testnet NFTs often render as an empty tile until MetaMask&apos;s indexer picks them up —
                  the badge itself is already on chain.
                </p>
              </div>

              <div className="flex gap-2">
                <a
                  href={`${SEPOLIA_EXPLORER}/nft/${SBT_CONTRACT}/${exportBadge.tokenId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1"
                >
                  <Button variant="outline" size="sm" className="w-full gap-1.5">
                    <ExternalLink className="h-3.5 w-3.5" />
                    View on Etherscan
                  </Button>
                </a>
                {window.ethereum && exportBadge.tokenId !== null && (
                  <Button
                    size="sm"
                    className="flex-1 gap-1.5"
                    onClick={() => exportToMetaMask(exportBadge)}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry auto-import
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
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
