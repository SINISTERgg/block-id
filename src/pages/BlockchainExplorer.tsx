import { useState, useEffect, useMemo, useCallback } from "react";
import { Link2, Home, Shield, Hash, Clock, ChevronRight, Search, ExternalLink, CheckCircle2, XCircle, Loader2, DatabaseZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import ParticleBackground from "@/components/ui/ParticleBackground";
import AnimatedCounter from "@/components/ui/AnimatedCounter";
import DashboardSkeleton from "@/components/ui/DashboardSkeleton";
import { getCredentialStatus, type CredentialStatus } from "@/services/blockchain/registry";
import { AMOY_EXPLORER, IS_CONTRACT_DEPLOYED } from "@/services/blockchain/config";



interface BlockCredential {
  id: string;
  credential_hash: string;
  prev_hash: string | null;
  blockchain_anchor: string | null;
  credential_data: any;
  status: string;
  issued_at: string;
  holder_did: string;
  credential_schemas: { name: string; credential_type: string } | null;
}

// ── On-chain badge component — lazily fetches from the contract when the block is expanded ──
const OnChainBadge = ({ hash }: { hash: string | null }) => {
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

// ── On-chain details panel — shows blockchain details sourced from the smart contract ──
// Verifies the actual on-chain anchoring state independently of stored metadata.
const OnChainDetailsPanel = ({ credentialHash, storedTxHash }: { credentialHash: string; storedTxHash?: string }) => {
  const [status, setStatus] = useState<CredentialStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [txLookupError, setTxLookupError] = useState<string | null>(null);

  useEffect(() => {
    if (!IS_CONTRACT_DEPLOYED || !credentialHash) { setLoading(false); return; }
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const fetchOnChainData = async () => {
      try {
        const contractStatus = await getCredentialStatus(credentialHash);
        if (!cancelled) {
          setStatus(contractStatus);
          if (storedTxHash && contractStatus.anchored && contractStatus.blockAnchored > 0) {
            setTxLookupError(`Stored txHash differs from on-chain record`);
          }
        }
      } catch (err) {
        console.warn("[BlockID] OnChainDetailsPanel fetch error:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    timeoutId = setTimeout(() => {
      if (!cancelled) {
        setLoading(false);
      }
    }, 5000);

    fetchOnChainData();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
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
      {txLookupError && (
        <p className="text-xs text-amber-500 flex items-center gap-1">
          <span className="font-medium">⚠</span> {txLookupError}
        </p>
      )}
      {status.blockAnchored > 0 && (
        <p className="font-mono">Block: #{status.blockAnchored}</p>
      )}
      {status.anchoredAt > 0 && (
        <p className="font-mono">
          Anchored: {new Date(status.anchoredAt * 1000).toLocaleString()}
        </p>
      )}
      {status.issuer && status.issuer !== "0x0000000000000000000000000000000000000000" && (
        <p className="font-mono break-all">Issuer: {status.issuer.substring(0, 10)}...{status.issuer.substring(status.issuer.length - 6)}</p>
      )}
      {contractAddr && (
        <a
          href={`${AMOY_EXPLORER}/address/${contractAddr}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary underline font-mono hover:opacity-80 transition-opacity text-xs"
        >
          <ExternalLink className="h-3 w-3" />
          View Contract ↗
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

const BlockchainExplorer = () => {
  const [credentials, setCredentials] = useState<BlockCredential[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBlock, setSelectedBlock] = useState<BlockCredential | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  const fetchChain = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const { data } = await supabase
      .from("credentials")
      .select("id, credential_hash, prev_hash, blockchain_anchor, credential_data, status, issued_at, holder_did, credential_schemas(name, credential_type)")
      .order("issued_at", { ascending: true })
      .limit(200);
    if (data) setCredentials(data as any);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) { setIsLoading(false); return; }
    fetchChain();
  }, [user, fetchChain]);



  const filteredCredentials = useMemo(() => {
    if (!searchQuery.trim()) return credentials;
    const q = searchQuery.toLowerCase();
    return credentials.filter(c =>
      c.credential_hash.toLowerCase().includes(q) ||
      c.blockchain_anchor?.toLowerCase().includes(q) ||
      c.holder_did.toLowerCase().includes(q) ||
      c.credential_schemas?.name.toLowerCase().includes(q) ||
      c.credential_data?.blockchain?.txHash?.toLowerCase().includes(q)
    );
  }, [credentials, searchQuery]);

  const totalBlocks = credentials.length;
  const activeBlocks = credentials.filter(c => c.status === "active").length;
  const onChainAnchored = credentials.filter(c => c.credential_data?.blockchain?.txHash).length;
  const chainIntegrity = totalBlocks > 0 ? Math.round((activeBlocks / totalBlocks) * 100) : 100;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden">
        <ParticleBackground particleCount={30} className="opacity-25" />
        <div className="absolute inset-0 mesh-gradient pointer-events-none" />
        <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 relative z-10">
          <DashboardSkeleton stats={4} showCharts={false} listItems={6} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <ParticleBackground particleCount={30} className="opacity-25" />
      <div className="absolute inset-0 mesh-gradient pointer-events-none" />

      <header className="glass-header px-4 sm:px-6 py-3 sticky top-0 z-50 relative">
        <div className="container mx-auto flex items-center justify-between">
          <motion.div
            initial={{ opacity: 0, x: -15 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={() => navigate("/")} className="border-border hover:border-primary hover:text-primary transition-colors">
                  <Home className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Back to Home</TooltipContent>
            </Tooltip>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Link2 className="h-5 w-5 text-primary" />
                <div className="absolute -inset-1 bg-primary/20 rounded-full blur-md -z-10 animate-glow-pulse" />
              </div>
              <span className="font-display text-lg font-semibold tracking-tight">Blockchain Explorer</span>
            </div>
          </motion.div>

          {IS_CONTRACT_DEPLOYED && (
            <motion.a
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              href={`${AMOY_EXPLORER}/address/${import.meta.env.VITE_CREDENTIAL_REGISTRY_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              View Contract on Etherscan
            </motion.a>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 relative z-10">
        {/* Anchoring Methods Info */}
        <Card className="glass-card border-0 rounded-2xl">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <DatabaseZap className="h-4 w-4 text-primary" />
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-foreground text-sm">How Anchoring Works</p>
                <div className="grid sm:grid-cols-2 gap-3 text-xs">
                  <div className="flex items-start gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 font-medium shrink-0">Contract</span>
                    <span className="text-muted-foreground">Credential hash stored as bytes32 in the CredentialRegistry smart contract on Ethereum Sepolia. Provides immutable, cryptographically verifiable proof of existence.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 font-medium shrink-0">Legacy</span>
                    <span className="text-muted-foreground">Hash embedded in transaction calldata. Legacy method for credentials anchored before contract deployment or via external systems.</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          <Card className="glass-card border-0 rounded-2xl">
            <CardContent className="pt-6">
              <AnimatedCounter
                value={totalBlocks}
                label="Total Blocks"
                icon={<Hash className="h-5 w-5 text-primary" />}
              />
            </CardContent>
          </Card>
          <Card className="glass-card border-0 rounded-2xl">
            <CardContent className="pt-6">
              <AnimatedCounter
                value={activeBlocks}
                label="Active"
                icon={<Shield className="h-5 w-5 text-accent-foreground" />}
              />
            </CardContent>
          </Card>
          <Card className="glass-card border-0 rounded-2xl">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl glass flex items-center justify-center">
                  <DatabaseZap className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-display font-bold text-foreground">{onChainAnchored}</p>
                  <p className="text-sm text-muted-foreground">On-Chain Anchored</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card border-0 rounded-2xl">
            <CardContent className="pt-6">
              <AnimatedCounter
                value={chainIntegrity}
                label="Chain Integrity"
                suffix="%"
                icon={<Link2 className="h-5 w-5 text-primary" />}
              />
            </CardContent>
          </Card>
        </motion.div>

        {/* Search */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="relative"
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by hash, tx, DID, or credential name..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10 rounded-xl glass border-0"
          />
        </motion.div>

        {/* Visual Hash Chain */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="glass-card border-0 rounded-2xl">
            <CardHeader>
              <CardTitle className="font-display text-lg flex items-center gap-2">
                <Link2 className="h-5 w-5 text-primary" />
                Credential Hash Chain
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredCredentials.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  {searchQuery ? "No blocks match your search." : "No credentials on-chain yet."}
                </div>
              ) : (
                <div className="space-y-0">
                  {filteredCredentials.map((cred, index) => {
                    const bc = cred.credential_data?.blockchain;
                    const isSelected = selectedBlock?.id === cred.id;
                    return (
                      <motion.div
                        key={cred.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.03 }}
                      >
                        {index > 0 && (
                          <div className="flex items-center gap-3 py-1">
                            <div className="w-10 flex justify-center">
                              <div className="w-0.5 h-6 bg-primary/30" />
                            </div>
                            <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                              <ChevronRight className="h-3 w-3 text-primary/50" />
                              prev: {cred.prev_hash?.substring(0, 16)}...
                            </div>
                          </div>
                        )}

                        <div
                          onClick={() => setSelectedBlock(isSelected ? null : cred)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedBlock(isSelected ? null : cred); }}
                          className={`w-full text-left flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? "border-primary/40 bg-primary/5 shadow-lg glow-primary"
                              : cred.status === "revoked"
                              ? "border-destructive/30 bg-destructive/5 hover:border-destructive/50"
                              : cred.status === "expired"
                              ? "border-muted bg-muted/50 hover:border-muted-foreground/30"
                              : "border-border/40 hover:border-primary/30 hover:bg-primary/5"
                          }`}
                        >
                          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                            <span className="text-xs font-mono font-bold text-primary">#{index + 1}</span>
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-display font-semibold text-foreground">
                                {cred.credential_schemas?.name || "Credential"}
                              </span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                cred.status === "active" ? "bg-accent text-accent-foreground" :
                                cred.status === "expired" ? "bg-muted text-muted-foreground" :
                                "bg-destructive/10 text-destructive"
                              }`}>{cred.status}</span>
                              {/* Compact on-chain indicator in list view */}
                              {bc?.txHash && !isSelected && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 font-medium hidden sm:inline">
                                  ⛓ Contract
                                </span>
                              )}
                              {bc?.txHash && !bc?.contractAddress && !isSelected && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-medium hidden sm:inline">
                                  📝 Legacy
                                </span>
                              )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                              <p className="font-mono truncate" title={cred.credential_hash}>
                                Hash: {cred.credential_hash.substring(0, 20)}...
                              </p>
                              {cred.blockchain_anchor && (
                                <p className="font-mono text-primary truncate" title={cred.blockchain_anchor}>
                                  ⛓ {cred.blockchain_anchor}
                                </p>
                              )}
                              <p className="truncate" title={cred.holder_did}>
                                Holder: {cred.holder_did.substring(0, 28)}...
                              </p>
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">Schema:</span>
                                <p className="font-mono text-foreground">{cred.credential_schemas?.name || "—"}</p>
                              </div>
                            </div>

                            {/* Expanded detail panel */}
                            <AnimatePresence>
                              {isSelected && (
                                <motion.div
                                  key="detail"
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: "auto" }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="mt-3 pt-3 border-t border-border/50 space-y-3"
                                >
                                  {/* On-chain verification badge */}
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">On-chain status:</span>
                                    <OnChainBadge hash={cred.credential_hash} />
                                  </div>

                                  <div className="grid grid-cols-1 gap-2 text-xs">
                                    <div>
                                      <span className="text-muted-foreground">Full Hash:</span>
                                      <p className="font-mono text-foreground break-all">{cred.credential_hash}</p>
                                    </div>
                                    {cred.prev_hash && (
                                      <div>
                                        <span className="text-muted-foreground">Previous Hash:</span>
                                        <p className="font-mono text-foreground break-all">{cred.prev_hash}</p>
                                      </div>
                                    )}
                                    <div>
                                      <span className="text-muted-foreground">Holder DID:</span>
                                      <p className="font-mono text-foreground break-all">{cred.holder_did}</p>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">Issued:</span>
                                      <p className="font-mono text-foreground">
                                        {new Date(cred.issued_at).toLocaleString()}
                                      </p>
                                    </div>
                                    {bc && (
                                      <div className="glass rounded-xl p-3 space-y-1.5">
                                        <p className="font-semibold text-foreground flex items-center gap-1">
                                          <ExternalLink className="h-3 w-3" /> Blockchain Details
                                        </p>

                                        <p className="font-mono">Network: {bc.network} {bc.chainId ? `(Chain ID: ${bc.chainId})` : ''}</p>
                                        {bc.network === "polygon" || (bc.chainId && [137, 80002].includes(Number(bc.chainId))) ? (
                                          <p className="text-xs text-amber-500 font-medium">⚠ Legacy record from Polygon — tx may not resolve on Sepolia</p>
                                        ) : null}
                                        <p className="font-mono break-all">Tx Hash: {bc.txHash}</p>
                                        <p className="font-mono">Block: #{bc.blockNumber}</p>
                                        {bc.anchoredAt && (
                                          <p className="font-mono">
                                            Anchored: {new Date(bc.anchoredAt * 1000).toLocaleString()}
                                          </p>
                                        )}
                                        {bc.anchorWallet && <p className="font-mono break-all">Anchor Wallet: {bc.anchorWallet}</p>}
                                        {bc.contractAddress && <p className="font-mono break-all">Contract: {bc.contractAddress}</p>}
                                        {bc.txHash && (() => {
                                          const isMainnet = bc.chainId && Number(bc.chainId) === 1;
                                          const isLegacyPolygon = bc.network === "polygon" || (bc.chainId && [137, 80002].includes(Number(bc.chainId)));
                                          const explorerBase = isMainnet
                                            ? "https://etherscan.io"
                                            : isLegacyPolygon
                                              ? (Number(bc.chainId) === 80002 ? "https://amoy.polygonscan.com" : "https://polygonscan.com")
                                              : AMOY_EXPLORER;
                                          const explorerLabel = isMainnet
                                            ? "Etherscan (Mainnet)"
                                            : isLegacyPolygon
                                              ? "PolygonScan (Legacy)"
                                              : "Sepolia Etherscan";
                                          return (
                                            <a
                                              href={`${explorerBase}/tx/${bc.txHash}`}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="inline-flex items-center gap-1 text-primary underline font-mono hover:opacity-80 transition-opacity"
                                            >
                                              <ExternalLink className="h-3 w-3" />
                                              View on {explorerLabel} ↗
                                            </a>
                                          );
                                        })()}
                                      </div>
                                    )}

                                    {IS_CONTRACT_DEPLOYED && (
                                      <OnChainDetailsPanel credentialHash={cred.credential_hash} storedTxHash={bc?.txHash} />
                                    )}

                                    {cred.credential_data?.proof && (
                                      <div className="glass rounded-xl p-3 space-y-1">
                                        <p className="font-semibold text-foreground">Cryptographic Proof</p>
                                        <p className="font-mono">Type: {cred.credential_data.proof.type}</p>
                                        <p className="font-mono">Purpose: {cred.credential_data.proof.proofPurpose}</p>
                                        <p className="font-mono break-all">Method: {cred.credential_data.proof.verificationMethod}</p>
                                      </div>
                                    )}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
};

export default BlockchainExplorer;
