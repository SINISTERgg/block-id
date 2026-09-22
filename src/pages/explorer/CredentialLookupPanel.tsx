/**
 * CredentialLookupPanel — search input and the visual hash chain list.
 * Extracted from BlockchainExplorer.tsx.
 */
import React from "react";
import { Search, Link2, ChevronRight, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { AMOY_EXPLORER, IS_CONTRACT_DEPLOYED } from "@/services/blockchain/config";
import { OnChainBadge, OnChainDetailsPanel } from "./OnChainPanels";

interface BlockCredential {
  id: string;
  credential_hash: string;
  prev_hash: string | null;
  blockchain_anchor: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  credential_data: any;
  status: string;
  issued_at: string;
  holder_did: string;
  credential_schemas: { name: string; credential_type: string } | null;
}

interface CredentialLookupPanelProps {
  credentials: BlockCredential[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedBlock: BlockCredential | null;
  onSelectBlock: (cred: BlockCredential | null) => void;
}

export const CredentialLookupPanel: React.FC<CredentialLookupPanelProps> = ({
  credentials,
  searchQuery,
  onSearchChange,
  selectedBlock,
  onSelectBlock,
}) => (
  <>
    {/* Search bar */}
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
        onChange={(e) => onSearchChange(e.target.value)}
        className="pl-10 rounded-xl glass border-0"
      />
    </motion.div>

    {/* Hash chain */}
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <Card className="glass-card border-0 rounded-2xl">
        <CardHeader>
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" /> Credential Hash Chain
          </CardTitle>
        </CardHeader>
        <CardContent>
          {credentials.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {searchQuery ? "No blocks match your search." : "No credentials on-chain yet."}
            </div>
          ) : (
            <div className="space-y-0">
              {credentials.map((cred, index) => {
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
                      onClick={() => onSelectBlock(isSelected ? null : cred)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelectBlock(isSelected ? null : cred); }}
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
                                  <p className="font-mono text-foreground">{new Date(cred.issued_at).toLocaleString()}</p>
                                </div>
                                {bc && (
                                  <div className="glass rounded-xl p-3 space-y-1.5">
                                    <p className="font-semibold text-foreground flex items-center gap-1">
                                      <ExternalLink className="h-3 w-3" /> Blockchain Details
                                    </p>
                                    <p className="font-mono">Network: {bc.network} {bc.chainId ? `(Chain ID: ${bc.chainId})` : ""}</p>
                                    {bc.network === "polygon" || (bc.chainId && [137, 80002].includes(Number(bc.chainId))) ? (
                                      <p className="text-xs text-amber-500 font-medium">⚠ Legacy record from Polygon — tx may not resolve on Sepolia</p>
                                    ) : null}
                                    <p className="font-mono break-all">Tx Hash: {bc.txHash}</p>
                                    <p className="font-mono">Block: #{bc.blockNumber}</p>
                                    {bc.anchoredAt && (
                                      <p className="font-mono">Anchored: {new Date(bc.anchoredAt * 1000).toLocaleString()}</p>
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
                                      const explorerLabel = isMainnet ? "Etherscan (Mainnet)" : isLegacyPolygon ? "PolygonScan (Legacy)" : "Sepolia Etherscan";
                                      return (
                                        <a
                                          href={`${explorerBase}/tx/${bc.txHash}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 text-primary underline font-mono hover:opacity-80 transition-opacity"
                                        >
                                          <ExternalLink className="h-3 w-3" /> View on {explorerLabel} ↗
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
  </>
);

export type { BlockCredential };
