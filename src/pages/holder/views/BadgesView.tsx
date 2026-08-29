import { useState, useEffect, useCallback } from "react";
import { Award, Wallet, ExternalLink, RefreshCw, ShieldCheck, AlertTriangle, Loader2, Hash } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { listHolderSbts, isSbtConfigured, type SbtStatus } from "@/services/blockchain/sbt.service";
import { useToast } from "@/hooks/use-toast";

interface BadgesViewProps {
  walletAddress: string | undefined;
}

const SBT_CONTRACT = import.meta.env.VITE_SOULBOUND_CREDENTIAL_ADDRESS as string | undefined;

const BadgesView = ({ walletAddress }: BadgesViewProps) => {
  const { toast } = useToast();
  const [badges, setBadges] = useState<SbtStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [sbtReady] = useState(() => isSbtConfigured());

  const loadBadges = useCallback(async () => {
    if (!walletAddress || !sbtReady) return;
    setLoading(true);
    try {
      const result = await listHolderSbts(walletAddress);
      setBadges(result);
    } catch (err: any) {
      console.error("Failed to load badges:", err);
    } finally {
      setLoading(false);
    }
  }, [walletAddress, sbtReady]);

  useEffect(() => {
    loadBadges();
  }, [loadBadges]);

  /** Add the SBT to MetaMask as a watched NFT asset */
  const exportToMetaMask = async (badge: SbtStatus) => {
    if (!window.ethereum || !SBT_CONTRACT) return;
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

  const formatDate = (timestamp: number) =>
    new Date(timestamp * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

  const shortHash = (hash: string) =>
    hash.length > 14 ? `${hash.substring(0, 10)}…${hash.substring(hash.length - 6)}` : hash;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-8"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-headline mb-2">My Badges</h2>
            <p className="text-muted-foreground">Soulbound tokens — non-transferable proof of your verified credentials on Ethereum.</p>
          </div>
          {walletAddress && sbtReady && (
            <Button variant="outline" size="sm" onClick={loadBadges} disabled={loading} className="gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          )}
        </div>
      </motion.div>

      {/* Status cards */}
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
                <p className="text-2xl font-bold text-foreground">{badges.length}</p>
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
                <p className="text-2xl font-bold text-foreground">
                  {badges.filter((b) => !b.revoked).length}
                </p>
                <p className="text-sm text-muted-foreground">Valid Badges</p>
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
                  {sbtReady ? "SBT minting is live on Sepolia" : "Run deploy-sbt.js to activate"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Badge list / state screens */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.3 }}
      >
        {!walletAddress ? (
          <Card className="solid-card">
            <CardContent className="py-16">
              <div className="flex flex-col items-center justify-center text-center gap-4">
                <div className="w-14 h-14 bg-muted rounded-xl flex items-center justify-center">
                  <Wallet className="h-7 w-7 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Connect your wallet to view badges</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Your soulbound tokens are linked to your Ethereum wallet address.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : !sbtReady ? (
          <Card className="solid-card">
            <CardContent className="py-16">
              <div className="flex flex-col items-center justify-center text-center gap-4">
                <div className="w-14 h-14 bg-amber-500/10 rounded-xl flex items-center justify-center">
                  <AlertTriangle className="h-7 w-7 text-amber-500" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">SBT Contract Not Deployed</p>
                  <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                    The soulbound credential contract hasn't been deployed yet.
                    Run <code className="text-xs bg-muted px-1.5 py-0.5 rounded">node scripts/deploy-sbt.js --network sepolia</code> then restart the dev server.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : loading ? (
          <Card className="solid-card">
            <CardContent className="py-16">
              <div className="flex items-center justify-center gap-3 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading badges from chain…</span>
              </div>
            </CardContent>
          </Card>
        ) : badges.length === 0 ? (
          <Card className="solid-card">
            <CardContent className="py-16">
              <div className="flex flex-col items-center justify-center text-center gap-4">
                <div className="w-14 h-14 bg-muted rounded-xl flex items-center justify-center">
                  <Award className="h-7 w-7 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">No badges yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Badges (Soulbound Tokens) are automatically minted when an issuer anchors a credential on-chain for your wallet.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="solid-card">
            <CardHeader className="pb-3 bg-muted/30">
              <CardTitle className="font-display text-base flex items-center gap-2">
                <Award className="h-4 w-4 text-primary" />
                Earned Badges
                <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                  {badges.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-4">
                {badges.map((badge, index) => (
                  <motion.div
                    key={badge.tokenId}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`border rounded-lg p-4 transition-colors ${
                      badge.revoked
                        ? "border-destructive/30 bg-destructive/5"
                        : "border-border hover:border-holder/30 bg-card"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${
                          badge.revoked ? "bg-destructive/20" : "bg-holder"
                        }`}>
                          <Award className={`h-5 w-5 ${badge.revoked ? "text-muted-foreground" : "text-white"}`} />
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">Badge #{badge.tokenId}</p>
                          <p className="text-xs text-muted-foreground">Issued {formatDate(badge.issuedAt)}</p>
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        badge.revoked
                          ? "bg-destructive/10 text-destructive"
                          : "bg-green-500/10 text-green-600 dark:text-green-400"
                      }`}>
                        {badge.revoked ? "Revoked" : "Valid"}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center gap-2 font-mono text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">
                      <Hash className="h-3 w-3 shrink-0" />
                      <span className="truncate" title={badge.credentialHash}>
                        Credential: {shortHash(badge.credentialHash)}
                      </span>
                    </div>

                    {!badge.revoked && window.ethereum && SBT_CONTRACT && (
                      <div className="mt-3 flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => exportToMetaMask(badge)}
                        >
                          <ExternalLink className="h-3 w-3" />
                          Export to MetaMask
                        </Button>
                        <a
                          href={`https://sepolia.etherscan.io/nft/${SBT_CONTRACT}/${badge.tokenId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                            <ExternalLink className="h-3 w-3" />
                            View on Etherscan
                          </Button>
                        </a>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </motion.div>

      {/* Info box */}
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
            SBTs are non-transferable NFTs that permanently record your verified credentials on the Ethereum blockchain.
            Unlike regular NFTs, you cannot sell or transfer them — they represent your identity and achievements.
          </p>
        </div>
      </motion.div>
    </>
  );
};

export default BadgesView;
