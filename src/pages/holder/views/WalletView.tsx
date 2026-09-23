import { useMemo, useState } from "react";
import { AMOY_EXPLORER } from "@/services/blockchain/config";
import { Shield, Copy, QrCode, ExternalLink, Clock, Link2, Wallet, Key, AlertTriangle, FileImage, Fingerprint } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CertificateRenderer from "@/components/issuer/CertificateRenderer";
import OnChainStatusBadge from "@/components/OnChainStatusBadge";
import { motion } from "framer-motion";
import { MOTION } from "@/lib/motion";
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
  const [certPreview, setCertPreview] = useState<HolderCredential | null>(null);

  const activeCount = credentials.filter((c) => c.status === "active").length;
  const revokedCount = credentials.filter((c) => c.status === "revoked").length;
  const expiredCount = credentials.filter((c) => c.status === "expired").length;

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

  /** Build the verification URL from credential hash (matches CertificateRenderer) */
  const getVerificationUrl = (hash: string) => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/verify?hash=${encodeURIComponent(hash)}`;
  };

  const createPresentation = (cred: HolderCredential) => JSON.stringify({
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    type: ["VerifiablePresentation"],
    holder: holderDid,
    verifiableCredential: { ...(cred.credential_data as any), id: cred.id },
    credential_id: cred.id,
  });

  const total = credentials.length;
  const totalCheck = Math.max(total, 1);

  return (
    <>
      {/* Editorial header */}
      <motion.div
        initial={{ opacity: 0, y: MOTION.DISTANCE }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: MOTION.DURATION, ease: MOTION.EASE }}
        className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-8"
      >
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-holder mb-3">
            Wallet / Holder
          </p>
          <h1 className="font-heading text-4xl lg:text-5xl font-bold uppercase tracking-tight leading-[0.95]">
            Your <span className="font-display lowercase italic text-primary">vault</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-4 max-w-md">
            Credentials issued to your DID live here. Present, share, and export on demand.
          </p>
        </div>

        {/* DID module */}
        <div className="border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-holder flex items-center gap-1.5">
              <Key className="h-3 w-3" /> Your DID
            </span>
            {holderDid && (
              <button onClick={() => onShowQR(holderDid, "Your DID")} className="p-1 hover:bg-muted transition-colors">
                <QrCode className="h-4 w-4 text-muted-foreground hover:text-holder" />
              </button>
            )}
          </div>
          <div className="px-4 py-3">
            {holderDid ? (
              <div className="flex items-center gap-2">
                <p className="font-mono text-xs text-foreground truncate max-w-[260px] bg-muted px-2.5 py-1.5">
                  {holderDid}
                </p>
                <button onClick={() => onCopy(holderDid)} className="p-1.5 hover:bg-muted transition-colors">
                  <Copy className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                </button>
              </div>
            ) : isWalletConnected ? (
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 border-2 border-holder border-t-transparent animate-spin" />
                <p className="font-mono text-xs text-muted-foreground">Generating from wallet…</p>
              </div>
            ) : (
              <p className="font-mono text-xs text-muted-foreground">
                Connect a wallet below to generate your DID
              </p>
            )}
          </div>
        </div>
      </motion.div>

      {/* Status modules */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <motion.div
          initial={{ opacity: 0, y: MOTION.DISTANCE }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: MOTION.DURATION, ease: MOTION.EASE }}
        >
          <div className="border border-border h-full p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
                <Shield className="h-3 w-3 text-holder" /> Security Score
              </span>
            </div>
            <p className="font-heading text-4xl font-bold tabular-nums text-foreground leading-none">
              {securityScore}<span className="text-lg text-muted-foreground">%</span>
            </p>
            <div className="mt-4 h-1.5 bg-muted">
              <motion.div
                className="h-full bg-holder"
                initial={{ width: 0 }}
                animate={{ width: `${securityScore}%` }}
                transition={{ delay: 0.3, duration: 0.6, ease: MOTION.EASE }}
              />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: MOTION.DISTANCE }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: MOTION.DURATION, ease: MOTION.EASE }}
        >
          <div className="border border-border h-full p-5">
            <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5 mb-4">
              <Wallet className="h-3 w-3 text-primary" /> Total Credentials
            </span>
            <p className="font-heading text-4xl font-bold tabular-nums text-foreground leading-none">
              {total}
            </p>
            <div className="mt-4 flex divide-x divide-border border border-border">
              {[
                { label: "Act", count: activeCount, cls: "bg-holder text-holder-foreground" },
                { label: "Rev", count: revokedCount, cls: "bg-destructive text-destructive-foreground" },
                { label: "Exp", count: expiredCount, cls: "bg-muted text-muted-foreground" },
              ].map((s) => (
                <div key={s.label} className="flex-1 px-2 py-1.5 text-center">
                  <p className={`font-mono text-sm font-bold tabular-nums ${s.count > 0 ? s.cls : "text-muted-foreground"}`}>
                    {s.count}
                  </p>
                  <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-muted-foreground mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: MOTION.DISTANCE }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, duration: MOTION.DURATION, ease: MOTION.EASE }}
        >
          <div className="border border-border h-full p-5">
            <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5 mb-4">
              <Fingerprint className="h-3 w-3 text-holder" /> Distribution
            </span>
            <div className="flex h-6 w-full border border-border">
              <motion.div
                className="h-full bg-holder"
                initial={{ width: 0 }}
                animate={{ width: `${(activeCount / totalCheck) * 100}%` }}
                transition={{ delay: 0.3, duration: 0.6, ease: MOTION.EASE }}
              />
              <motion.div
                className="h-full bg-destructive"
                initial={{ width: 0 }}
                animate={{ width: `${(revokedCount / totalCheck) * 100}%` }}
                transition={{ delay: 0.36, duration: 0.6, ease: MOTION.EASE }}
              />
              <motion.div
                className="h-full bg-muted"
                initial={{ width: 0 }}
                animate={{ width: `${(expiredCount / totalCheck) * 100}%` }}
                transition={{ delay: 0.42, duration: 0.6, ease: MOTION.EASE }}
              />
            </div>
            <div className="flex gap-4 mt-3">
              <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                <span className="h-2 w-2 bg-holder" /> Active
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                <span className="h-2 w-2 bg-destructive" /> Revoked
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                <span className="h-2 w-2 bg-muted" /> Expired
              </span>
            </div>
          </div>
        </motion.div>
      </div>

      {expiringSoon.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 border-l-2 border-warning bg-warning/10 p-4 mb-6"
        >
          <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
          <p className="text-sm text-muted-foreground flex-1">
            <strong className="text-foreground">{expiringSoon.length}</strong> credential{expiringSoon.length !== 1 ? "s" : ""} expiring within 30 days
          </p>
        </motion.div>
      )}

      {/* Credential registry */}
      <motion.div
        initial={{ opacity: 0, y: MOTION.DISTANCE }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.36, duration: MOTION.DURATION, ease: MOTION.EASE }}
      >
        <Card className="solid-card">
          <div className="p-0">
            {/* Registry header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border px-6 py-4">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-holder" />
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-foreground">
                  Credential Registry
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  ({filteredCredentials.length})
                </span>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Input
                  placeholder="Search registry…"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="h-8 w-full sm:w-52 text-xs input-solid"
                />
                <div className="flex border border-border">
                  {STATUS_FILTER_OPTIONS.map((btn) => {
                    const count = btn.value === "all" ? credentials.length : credentials.filter((c) => c.status === btn.value).length;
                    return (
                      <button
                        key={btn.value}
                        onClick={() => onStatusFilterChange(btn.value)}
                        className={`px-3 py-1.5 text-[10px] font-mono font-semibold uppercase tracking-[0.12em] transition-colors ${
                          statusFilter === btn.value
                            ? "bg-holder text-holder-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                        }`}
                      >
                        {btn.label}
                        <span className="ml-1 opacity-60">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {credentials.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 bg-muted flex items-center justify-center mb-4">
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
              <div className="divide-y divide-border">
                {filteredCredentials.map((cred, index) => (
                  <motion.div
                    key={cred.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05, duration: 0.2 }}
                    className={`group px-6 py-5 flex flex-col lg:flex-row lg:items-center gap-4 ${cred.status === "active" ? "hover:bg-muted/30" : ""}`}
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground/50 shrink-0">
                        {String(index + 1).padStart(3, "0")}
                      </span>
                      <div className={`w-10 h-10 flex items-center justify-center shrink-0 ${
                        cred.status === "active"
                          ? "bg-holder text-holder-foreground"
                          : cred.status === "revoked"
                            ? "bg-destructive/20 text-destructive"
                            : "bg-muted text-muted-foreground"
                      }`}>
                        <Shield className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-semibold text-foreground truncate">
                          {cred.credential_schemas?.name || "Credential"}
                        </h4>
                        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                          {cred.credential_schemas?.credential_type}
                        </p>
                      </div>
                    </div>

                    <div className="hidden md:flex items-center gap-x-5 gap-y-1 text-xs text-muted-foreground shrink-0 flex-wrap">
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        Issued {new Date(cred.issued_at).toLocaleDateString()}
                      </span>
                      {(cred.credential_data as any)?.expirationDate && (
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          Exp {new Date((cred.credential_data as any).expirationDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {cred.status === "active" && (
                        <div className="hidden lg:flex items-center gap-2 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="sm" className="h-7 gap-1.5" onClick={() => onShowQR(getVerificationUrl(cred.credential_hash), "Credential QR")}>
                            <QrCode className="h-3.5 w-3.5" /><span className="font-mono text-[9px] uppercase tracking-[0.12em]">QR</span>
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 gap-1.5" onClick={() => onCopy(createPresentation(cred))}>
                            <Shield className="h-3.5 w-3.5" /><span className="font-mono text-[9px] uppercase tracking-[0.12em]">Copy</span>
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 gap-1.5" onClick={() => {
                            const subject = (cred.credential_data as any)?.credentialSubject;
                            onShareCred(cred.id, cred.credential_schemas?.name || "Credential", subject ? Object.keys(subject) : []);
                          }}>
                            <ExternalLink className="h-3.5 w-3.5" /><span className="font-mono text-[9px] uppercase tracking-[0.12em]">Share</span>
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 gap-1.5" onClick={() => setCertPreview(cred)}>
                            <FileImage className="h-3.5 w-3.5" /><span className="font-mono text-[9px] uppercase tracking-[0.12em]">Cert</span>
                          </Button>
                        </div>
                      )}

                      <span className={`font-mono text-[9px] font-semibold uppercase tracking-[0.18em] px-2 py-1 border shrink-0 ${
                        cred.status === "active"
                          ? "border-success/40 text-success"
                          : cred.status === "expired"
                            ? "border-border text-muted-foreground"
                            : "border-destructive/40 text-destructive"
                      }`}>
                        {cred.status}
                      </span>
                    </div>

                    {/* Mobile action row */}
                    {cred.status === "active" && (
                      <div className="flex lg:hidden items-center gap-2">
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 flex-1" onClick={() => onShowQR(getVerificationUrl(cred.credential_hash), "Credential QR")}>
                          <QrCode className="h-4 w-4" /> QR
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 flex-1" onClick={() => onCopy(createPresentation(cred))}>
                          <Shield className="h-4 w-4" /> Copy
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 flex-1" onClick={() => {
                          const subject = (cred.credential_data as any)?.credentialSubject;
                          onShareCred(cred.id, cred.credential_schemas?.name || "Credential", subject ? Object.keys(subject) : []);
                        }}>
                          <ExternalLink className="h-4 w-4" /> Share
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 flex-1" onClick={() => setCertPreview(cred)}>
                          <FileImage className="h-4 w-4" /> Cert
                        </Button>
                      </div>
                    )}

                    {cred.blockchain_anchor && (() => {
                      const bc = (cred.credential_data as any)?.blockchain;
                      const txHash = bc?.txHash as string | undefined;
                      return (
                        <div className="flex items-center gap-2 flex-wrap lg:ml-4 shrink-0">
                          <p className="font-mono flex items-center gap-1.5 text-xs">
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
                                  {txHash.substring(0, 18)}…
                                </a>
                              );
                            })()}
                          </p>
                          <OnChainStatusBadge credentialId={cred.id} credentialData={cred.credential_data} blockchainAnchor={cred.blockchain_anchor} />
                        </div>
                      );
                    })()}
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </motion.div>

      {/* Visual Certificate Modal (holder side) */}
      <CertificateRenderer
        open={!!certPreview}
        onOpenChange={(open) => !open && setCertPreview(null)}
        certificate={
          certPreview
            ? {
                credentialName: certPreview.credential_schemas?.name || "Credential",
                credentialType: certPreview.credential_schemas?.credential_type || "certificate",
                holderName:
                  holderName ||
                  (certPreview.credential_data as any)?.credentialSubject?.name ||
                  (certPreview.credential_data as any)?.credentialSubject?.studentName ||
                  (certPreview.credential_data as any)?.credentialSubject?.employeeName ||
                  (certPreview.credential_data as any)?.credentialSubject?.holderName ||
                  (certPreview.credential_data as any)?.credentialSubject?.fullName ||
                  "Credential Holder",
                holderDid: holderDid || "",
                issuedAt: certPreview.issued_at,
                status: certPreview.status,
                credentialHash: certPreview.credential_hash || "",
                blockchainAnchor: certPreview.blockchain_anchor,
                credentialData: (certPreview.credential_data as Record<string, any>) || {},
              }
            : null
        }
      />
    </>
  );
};

export default WalletView;