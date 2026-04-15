import { useMemo } from "react";
import { AMOY_EXPLORER } from "@/services/blockchain/config";
import { Shield, Copy, QrCode, ExternalLink, Download, Clock, Link2, Wallet, Key, AlertTriangle } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import OnChainStatusBadge from "@/components/OnChainStatusBadge";
import CredentialExport from "@/components/CredentialExport";
import { generateCertificatePdf } from "@/lib/generateCertificatePdf";
import { motion } from "framer-motion";
import type { HolderCredential } from "@/services/api/holder.service";

type StatusFilter = "all" | "active" | "revoked" | "expired";

interface WalletViewProps {
  credentials: HolderCredential[];
  searchQuery: string;
  statusFilter: StatusFilter;
  onSearchChange: (q: string) => void;
  onStatusFilterChange: (f: StatusFilter) => void;
  onShowQR: (value: string, title: string) => void;
  onCopy: (text: string) => void;
  onShareCred: (id: string, name: string, fields: string[]) => void;
  holderDid: string | undefined;
  holderName: string | undefined;
  onGenerateDid: () => void;
  securityScore: number;
  isWalletConnected: boolean;
}

const STATUS_FILTER_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Revoked", value: "revoked" },
  { label: "Expired", value: "expired" },
];

const CHART_COLORS = ["hsl(24, 95%, 45%)", "hsl(0, 72%, 51%)", "hsl(220, 10%, 55%)"];

const WalletView = ({
  credentials,
  searchQuery,
  statusFilter,
  onSearchChange,
  onStatusFilterChange,
  onShowQR,
  onCopy,
  onShareCred,
  holderDid,
  holderName,
  onGenerateDid,
  securityScore,
  isWalletConnected,
}: WalletViewProps) => {
  const activeCount = credentials.filter((c) => c.status === "active").length;
  const revokedCount = credentials.filter((c) => c.status === "revoked").length;
  const expiredCount = credentials.filter((c) => c.status === "expired").length;

  const statusData = useMemo(() => [
    { name: "Active", value: activeCount, fill: CHART_COLORS[0] },
    { name: "Revoked", value: revokedCount, fill: CHART_COLORS[1] },
    { name: "Expired", value: expiredCount, fill: CHART_COLORS[2] },
  ].filter((d) => d.value > 0), [activeCount, revokedCount, expiredCount]);

  const expiringSoon = useMemo(() => {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    return credentials.filter((c) => {
      if (c.status !== "active") return false;
      const expDate = (c.credential_data as any)?.expirationDate;
      if (!expDate) return false;
      const exp = new Date(expDate);
      return exp > new Date() && exp <= thirtyDaysFromNow;
    });
  }, [credentials]);

  const filteredCredentials = useMemo(() => credentials.filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        c.credential_schemas?.name?.toLowerCase().includes(q) ||
        c.credential_schemas?.credential_type?.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q)
      );
    }
    return true;
  }), [credentials, statusFilter, searchQuery]);

  const createPresentation = (cred: HolderCredential) => JSON.stringify({
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    type: ["VerifiablePresentation"],
    holder: holderDid,
    verifiableCredential: { ...(cred.credential_data as any), id: cred.id },
    credential_id: cred.id,
  });

  return (
    <>
      {expiringSoon.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-6"
        >
          <div className="w-9 h-9 bg-amber-100 dark:bg-amber-900/50 rounded-lg flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          </div>
          <p className="text-sm text-amber-800 dark:text-amber-300 flex-1">
            <strong>{expiringSoon.length}</strong> credential{expiringSoon.length !== 1 ? "s" : ""} expiring within 30 days
          </p>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          <Card className="solid-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-holder rounded-lg flex items-center justify-center">
                  <Shield className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{securityScore}%</p>
                  <p className="text-sm text-muted-foreground">Security Score</p>
                </div>
              </div>
              <div className="mt-4 h-2 bg-muted rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-holder rounded-full" 
                  initial={{ width: 0 }}
                  animate={{ width: `${securityScore}%` }}
                  transition={{ delay: 0.3, duration: 0.6 }}
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
        >
          <Card className="solid-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
                  <Wallet className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{credentials.length}</p>
                  <p className="text-sm text-muted-foreground">Total Credentials</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.3 }}
        >
          <Card className="solid-card">
            <CardContent className="pt-6">
              {statusData.length > 0 ? (
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={statusData} dataKey="value" cx="50%" cy="50%" outerRadius={28} innerRadius={16}>
                          {statusData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="text-sm space-y-1">
                    <p className="text-foreground"><span className="font-bold">{activeCount}</span> active</p>
                    {revokedCount > 0 && <p className="text-destructive"><span className="font-bold">{revokedCount}</span> revoked</p>}
                    {expiredCount > 0 && <p className="text-muted-foreground"><span className="font-bold">{expiredCount}</span> expired</p>}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-holder rounded-lg flex items-center justify-center">
                    <QrCode className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">0</p>
                    <p className="text-sm text-muted-foreground">Credentials</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.3 }}
      >
        <Card className="solid-card mb-6">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 bg-holder rounded-lg flex items-center justify-center">
                  <Key className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Your Decentralized Identifier</p>
                  {holderDid ? (
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-sm text-foreground bg-muted px-3 py-1.5 rounded-lg">{holderDid}</p>
                      <button onClick={() => onCopy(holderDid)} className="p-2 hover:bg-muted rounded-lg transition-colors">
                        <Copy className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                      </button>
                    </div>
                  ) : isWalletConnected ? (
                    <Button variant="default" size="sm" onClick={onGenerateDid} className="btn-primary">
                      Generate DID
                    </Button>
                  ) : (
                    <p className="text-sm text-muted-foreground bg-muted px-3 py-2 rounded-lg">
                      Connect your wallet to generate a DID
                    </p>
                  )}
                </div>
              </div>
              {holderDid && (
                <button onClick={() => onShowQR(holderDid, "Your DID")} className="p-3 hover:bg-muted rounded-lg transition-colors">
                  <QrCode className="h-7 w-7 text-muted-foreground hover:text-primary" />
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.3 }}
      >
        <Card className="solid-card">
          <CardHeader className="pb-4 bg-muted/30">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-holder rounded-lg flex items-center justify-center">
                  <Shield className="h-5 w-5 text-white" />
                </div>
                <CardTitle className="font-display text-lg">My Credentials</CardTitle>
              </div>
              {credentials.length > 0 && (
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative">
                    <Input 
                      placeholder="Search credentials…" 
                      value={searchQuery} 
                      onChange={(e) => onSearchChange(e.target.value)} 
                      className="pl-9 h-9 w-full sm:w-56 input-solid" 
                    />
                  </div>
                  <div className="flex gap-1 p-1 bg-muted rounded-lg">
                    {STATUS_FILTER_OPTIONS.map((btn) => {
                      const count = btn.value === "all" ? credentials.length : credentials.filter((c) => c.status === btn.value).length;
                      return (
                        <button 
                          key={btn.value} 
                          onClick={() => onStatusFilterChange(btn.value)} 
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                            statusFilter === btn.value 
                              ? "bg-holder text-white" 
                              : "text-muted-foreground hover:text-foreground hover:bg-background"
                          }`}
                        >
                          {btn.label} {count > 0 && <span className="ml-1 opacity-70">({count})</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {credentials.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 bg-muted rounded-xl flex items-center justify-center mb-4">
                  <Shield className="h-7 w-7 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground">No credentials yet.</p>
                <p className="text-sm text-muted-foreground mt-1">Credentials issued to your DID will appear here.</p>
              </div>
            ) : filteredCredentials.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                No credentials match your search.
              </div>
            ) : (
              <div className="space-y-4">
                {filteredCredentials.map((cred, index) => (
                  <motion.div
                    key={cred.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05, duration: 0.2 }}
                    className={`border rounded-lg p-5 transition-colors ${
                      cred.status === "revoked" 
                        ? "border-destructive/30 bg-destructive/5" 
                        : cred.status === "expired" 
                          ? "border-border bg-muted/30" 
                          : "border-border hover:border-holder/30 solid-card"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-4">
                        <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${
                          cred.status === "active" 
                            ? "bg-holder" 
                            : cred.status === "revoked" 
                              ? "bg-destructive/20" 
                              : "bg-muted"
                        }`}>
                          <Shield className={`h-5 w-5 ${cred.status === "active" ? "text-white" : "text-muted-foreground"}`} />
                        </div>
                        <div>
                          <h4 className="font-semibold text-foreground">
                            {cred.credential_schemas?.name || "Credential"}
                          </h4>
                          <p className="text-xs text-muted-foreground">{cred.credential_schemas?.credential_type}</p>
                        </div>
                      </div>
                      <span className={`badge-solid ${
                        cred.status === "active" 
                          ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400" 
                          : cred.status === "expired" 
                            ? "bg-muted text-muted-foreground" 
                            : "bg-destructive/10 text-destructive"
                      }`}>
                        {cred.status}
                      </span>
                    </div>
                    
                    {cred.status === "active" && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        <Button variant="outline" size="sm" className="h-8" onClick={() => onShowQR(createPresentation(cred), "Credential QR")}>
                          <QrCode className="h-4 w-4 mr-1.5" /> QR
                        </Button>
                        <Button variant="outline" size="sm" className="h-8" onClick={() => onCopy(createPresentation(cred))}>
                          <Shield className="h-4 w-4 mr-1.5" /> Copy
                        </Button>
                        <Button variant="outline" size="sm" className="h-8" onClick={() => { 
                          const subject = (cred.credential_data as any)?.credentialSubject; 
                          onShareCred(cred.id, cred.credential_schemas?.name || "Credential", subject ? Object.keys(subject) : []); 
                        }}>
                          <ExternalLink className="h-4 w-4 mr-1.5" /> Share
                        </Button>
                        <CredentialExport credential={cred as any} holderDid={holderDid || ""} />
                        <Button variant="outline" size="sm" className="h-8" onClick={() => generateCertificatePdf({ 
                          credentialName: cred.credential_schemas?.name || "Credential", 
                          credentialType: cred.credential_schemas?.credential_type || "", 
                          holderName: holderName || "", 
                          holderDid: holderDid || "", 
                          issuedAt: cred.issued_at, 
                          status: cred.status, 
                          credentialHash: cred.credential_hash, 
                          blockchainAnchor: cred.blockchain_anchor, 
                          credentialData: cred.credential_data as Record<string, any> 
                        })}>
                          <Download className="h-4 w-4 mr-1.5" /> PDF
                        </Button>
                      </div>
                    )}
                    
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
                      <p className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        Issued: {new Date(cred.issued_at).toLocaleDateString()}
                      </p>
                      {(cred.credential_data as any)?.expirationDate && (
                        <p className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          Expires: {new Date((cred.credential_data as any).expirationDate).toLocaleDateString()}
                        </p>
                      )}
                      {cred.blockchain_anchor && (() => {
                        const bc = (cred.credential_data as any)?.blockchain;
                        const txHash = bc?.txHash as string | undefined;
                        return (
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-mono flex items-center gap-1.5">
                              <Link2 className="h-3.5 w-3.5 text-holder" />
                              {(() => {
                                if (!txHash) return <span className="text-muted-foreground">{cred.blockchain_anchor}</span>;
                                const isMainnet = bc?.chainId && Number(bc.chainId) === 1;
                                const isLegacyPolygon = bc?.network === "polygon" || (bc?.chainId && [137, 80002].includes(Number(bc.chainId)));
                                const explorerBase = isMainnet
                                  ? "https://etherscan.io"
                                  : isLegacyPolygon
                                    ? (Number(bc.chainId) === 80002 ? "https://amoy.polygonscan.com" : "https://polygonscan.com")
                                    : AMOY_EXPLORER;
                                return (
                                  <a href={`${explorerBase}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="text-holder hover:underline">
                                    {txHash.substring(0, 22)}…
                                  </a>
                                );
                              })()}
                            </p>
                            <OnChainStatusBadge credentialId={cred.id} credentialData={cred.credential_data} blockchainAnchor={cred.blockchain_anchor} />
                          </div>
                        );
                      })()}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </>
  );
};

export default WalletView;
