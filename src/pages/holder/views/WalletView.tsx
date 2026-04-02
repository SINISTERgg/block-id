import { useMemo } from "react";
import { Shield, Copy, QrCode, ExternalLink, Download, Clock, Link2 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import OnChainStatusBadge from "@/components/OnChainStatusBadge";
import CredentialExport from "@/components/CredentialExport";
import { generateCertificatePdf } from "@/lib/generateCertificatePdf";
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
}

const STATUS_FILTER_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Revoked", value: "revoked" },
  { label: "Expired", value: "expired" },
];

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
}: WalletViewProps) => {
  const activeCount = credentials.filter((c) => c.status === "active").length;
  const revokedCount = credentials.filter((c) => c.status === "revoked").length;
  const expiredCount = credentials.filter((c) => c.status === "expired").length;

  const statusData = useMemo(() => [
    { name: "Active", value: activeCount },
    { name: "Revoked", value: revokedCount },
    { name: "Expired", value: expiredCount },
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
        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
          <Clock className="h-4 w-4 text-amber-500 shrink-0" />
          <p className="text-sm text-amber-600 dark:text-amber-400">
            <strong>{expiringSoon.length}</strong> credential{expiringSoon.length !== 1 ? "s" : ""} expiring within 30 days
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-holder-muted flex items-center justify-center">
                <Shield className="h-5 w-5" style={{ color: "hsl(var(--holder))" }} />
              </div>
              <div>
                <p className="text-2xl font-display font-bold text-foreground">{securityScore}%</p>
                <p className="text-sm text-muted-foreground">Security Score</p>
              </div>
            </div>
            <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${securityScore}%` }} />
            </div>
          </CardContent>
        </Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-holder-muted flex items-center justify-center"><Shield className="h-5 w-5" style={{ color: "hsl(var(--holder))" }} /></div><div><p className="text-2xl font-display font-bold text-foreground">{credentials.length}</p><p className="text-sm text-muted-foreground">Total Credentials</p></div></div></CardContent></Card>
        <Card>
          <CardContent className="pt-6">
            {statusData.length > 0 ? (
              <div className="flex items-center gap-3">
                <div className="w-16 h-16">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart><Pie data={statusData} dataKey="value" cx="50%" cy="50%" outerRadius={28} innerRadius={16}>{statusData.map((_, i) => <Cell key={i} fill={i === 0 ? "hsl(175, 60%, 38%)" : "hsl(0, 72%, 51%)"} />)}</Pie></PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="text-xs space-y-1">
                  <p className="text-foreground"><span className="font-semibold">{activeCount}</span> active</p>
                  {revokedCount > 0 && <p className="text-destructive"><span className="font-semibold">{revokedCount}</span> revoked</p>}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-holder-muted flex items-center justify-center"><QrCode className="h-5 w-5" style={{ color: "hsl(var(--holder))" }} /></div><div><p className="text-2xl font-display font-bold text-foreground">0</p><p className="text-sm text-muted-foreground">Credentials</p></div></div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* DID Card */}
      <Card className="border-primary/20">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm text-muted-foreground mb-1">Your Decentralized Identifier</p>
              {holderDid ? (
                <div className="flex items-center gap-2">
                  <p className="font-mono text-sm text-foreground break-all">{holderDid}</p>
                  <button onClick={() => onCopy(holderDid)}><Copy className="h-4 w-4 text-muted-foreground hover:text-foreground" /></button>
                </div>
              ) : (
                <Button variant="holder" size="sm" onClick={onGenerateDid}>Generate DID</Button>
              )}
            </div>
            {holderDid && (
              <button onClick={() => onShowQR(holderDid, "Your DID")}>
                <QrCode className="h-8 w-8 text-muted-foreground hover:text-primary transition-colors cursor-pointer" />
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Credentials list */}
      <Card>
        <CardHeader className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <CardTitle className="font-display text-lg">My Credentials</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </div>
          {credentials.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Input placeholder="Search credentials…" value={searchQuery} onChange={(e) => onSearchChange(e.target.value)} className="pl-9 h-8 text-xs" />
              </div>
              <div className="flex gap-1">
                {STATUS_FILTER_OPTIONS.map((btn) => {
                  const count = btn.value === "all" ? credentials.length : credentials.filter((c) => c.status === btn.value).length;
                  return (
                    <button key={btn.value} onClick={() => onStatusFilterChange(btn.value)} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${statusFilter === btn.value ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                      {btn.label} {count > 0 && <span className="ml-1 opacity-60">({count})</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {credentials.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">No credentials yet. Credentials issued to your DID will appear here.</div>
          ) : filteredCredentials.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">No credentials match your search.</div>
          ) : (
            <div className="space-y-4">
              {filteredCredentials.map((cred) => (
                <div key={cred.id} className={`border rounded-lg p-4 ${cred.status === "revoked" ? "border-destructive/30 opacity-60" : cred.status === "expired" ? "border-muted opacity-60" : "border-border/60"}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-display font-semibold text-foreground">{cred.credential_schemas?.name || "Credential"}</h4>
                      <p className="text-xs text-muted-foreground">{cred.credential_schemas?.credential_type}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {cred.status === "active" && (
                        <>
                          <button onClick={() => onShowQR(createPresentation(cred), "Credential QR")}><QrCode className="h-4 w-4 text-muted-foreground hover:text-primary" /></button>
                          <button onClick={() => onCopy(createPresentation(cred))}><Shield className="h-4 w-4 text-muted-foreground hover:text-primary" /></button>
                          <button onClick={() => { const subject = (cred.credential_data as any)?.credentialSubject; onShareCred(cred.id, cred.credential_schemas?.name || "Credential", subject ? Object.keys(subject) : []); }}>
                            <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-primary" />
                          </button>
                        </>
                      )}
                      <CredentialExport credential={cred as any} holderDid={holderDid || ""} />
                      <button onClick={() => generateCertificatePdf({ credentialName: cred.credential_schemas?.name || "Credential", credentialType: cred.credential_schemas?.credential_type || "", holderName: holderName || "", holderDid: holderDid || "", issuedAt: cred.issued_at, status: cred.status, credentialHash: cred.credential_hash, blockchainAnchor: cred.blockchain_anchor, credentialData: cred.credential_data as Record<string, any> })}>
                        <Download className="h-4 w-4 text-muted-foreground hover:text-primary" />
                      </button>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${cred.status === "active" ? "bg-accent text-accent-foreground" : cred.status === "expired" ? "bg-muted text-muted-foreground" : "bg-destructive/10 text-destructive"}`}>{cred.status}</span>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>Issued: {new Date(cred.issued_at).toLocaleDateString()}</p>
                    {(cred.credential_data as any)?.expirationDate && (
                      <p className="flex items-center gap-1"><Clock className="h-3 w-3" />Expires: {new Date((cred.credential_data as any).expirationDate).toLocaleDateString()}</p>
                    )}
                    {cred.blockchain_anchor && (() => {
                      const bc = (cred.credential_data as any)?.blockchain;
                      const txHash = bc?.txHash as string | undefined;
                      const explorerUrl = bc?.explorerUrl as string | undefined;
                      return (
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-mono flex items-center gap-1 text-xs">
                            <Link2 className="h-3 w-3 text-primary" />
                            <span className="text-primary">⛓</span>
                            {txHash ? (
                              explorerUrl ? (
                                <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                  {txHash.substring(0, 22)}…
                                </a>
                              ) : (
                                <span>{txHash.substring(0, 22)}…</span>
                              )
                            ) : (
                              <span className="text-muted-foreground">{cred.blockchain_anchor}</span>
                            )}
                          </p>
                          <OnChainStatusBadge credentialId={cred.id} credentialData={cred.credential_data} blockchainAnchor={cred.blockchain_anchor} />
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
};

export default WalletView;
