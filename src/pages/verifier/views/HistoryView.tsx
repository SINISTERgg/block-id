import { useMemo, useState, useEffect } from "react";
import {
  Brain, ChevronDown, ChevronUp, Clock, Eye, EyeOff, FileText,
  Lock, ShieldCheck, Timer, User, Building2, Calendar, Link2, Hash
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { VerificationRecord } from "@/services/api/verifier.service";

interface HistoryViewProps {
  records: VerificationRecord[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

// ── Countdown timer component ──
const CountdownBadge = ({ expiresAt }: { expiresAt: string }) => {
  const [remaining, setRemaining] = useState("");
  const [expired, setExpired] = useState(false);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const totalMs = 4 * 60 * 60 * 1000; // 4 hours
    const tick = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setExpired(true);
        setRemaining("Expired");
        setProgress(0);
        return;
      }
      const hours = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setRemaining(`${hours}h ${mins}m ${secs}s`);
      setProgress(Math.max(0, (diff / totalMs) * 100));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (expired) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
        <EyeOff className="h-3 w-3" /> Access Expired
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        <Timer className="h-3 w-3 text-amber-500 animate-pulse" />
        <span className="text-xs font-mono text-amber-600 dark:text-amber-400 font-medium">{remaining}</span>
      </div>
      <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{
            width: `${progress}%`,
            backgroundColor: progress > 50 ? "hsl(142, 76%, 36%)" : progress > 20 ? "hsl(45, 93%, 47%)" : "hsl(0, 72%, 51%)",
          }}
        />
      </div>
    </div>
  );
};

// ── Credential document viewer ──
const CredentialDocumentViewer = ({ data }: { data: Record<string, unknown> }) => {
  const subject = (data.credentialSubject || {}) as Record<string, unknown>;
  const subjectEntries = Object.entries(subject).filter(([k]) => k !== "id");

  return (
    <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
      {/* Document header */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-primary/5 to-transparent border border-primary/10">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{(data.schemaName as string) || "Credential"}</p>
          <p className="text-xs text-muted-foreground">{(data.schemaType as string) || "Verifiable Credential"}</p>
        </div>
        <ShieldCheck className="h-5 w-5 text-accent-foreground shrink-0" />
      </div>

      {/* Subject fields */}
      {subjectEntries.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {subjectEntries.map(([key, value]) => (
            <div key={key} className="p-2.5 rounded-md bg-muted/40 border border-border/40">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-0.5">
                {key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}
              </p>
              <p className="text-sm text-foreground font-medium truncate" title={String(value ?? "")}>
                {String(value ?? "—")}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Metadata row */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {data.issuer && (
          <span className="inline-flex items-center gap-1">
            <Building2 className="h-3 w-3" />
            Issuer: {typeof data.issuer === "string" ? data.issuer.substring(0, 24) + "…" : (data.issuer as any)?.id?.substring(0, 24) + "…" || "Unknown"}
          </span>
        )}
        {data.issuanceDate && (
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Issued: {new Date(data.issuanceDate as string).toLocaleDateString()}
          </span>
        )}
        {data.expirationDate && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Expires: {new Date(data.expirationDate as string).toLocaleDateString()}
          </span>
        )}
      </div>

      {/* Blockchain info */}
      {(data.blockchainAnchor || data.credentialHash) && (
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground border-t border-border/40 pt-3">
          {data.credentialHash && (
            <span className="inline-flex items-center gap-1 font-mono">
              <Hash className="h-3 w-3 text-primary" />
              Hash: {(data.credentialHash as string).substring(0, 16)}…
            </span>
          )}
          {data.blockchainAnchor && (
            <span className="inline-flex items-center gap-1 font-mono">
              <Link2 className="h-3 w-3 text-primary" />
              Anchor: {(data.blockchainAnchor as string).substring(0, 16)}…
            </span>
          )}
          {(data.blockchain as any)?.txHash && (
            <span className="inline-flex items-center gap-1 font-mono">
              ⛓ Tx: {((data.blockchain as any).txHash as string).substring(0, 16)}…
            </span>
          )}
        </div>
      )}
    </div>
  );
};

// ── Status helpers ──
function getStatusBadge(status: string, storageConsent: boolean) {
  if (status === "accepted" || status === "verified") {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground">
        <CheckIcon /> {status}
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
        {status}
      </span>
    );
  }
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{status}</span>
  );
}

function CheckIcon() {
  return <ShieldCheck className="h-3 w-3" />;
}

// ── Main HistoryView ──
const HistoryView = ({ records, searchQuery, onSearchChange }: HistoryViewProps) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredRecords = useMemo(() => {
    if (!searchQuery) return records;
    const q = searchQuery.toLowerCase();
    return records.filter((r) =>
      r.holder_did?.toLowerCase().includes(q) ||
      r.credential_type?.toLowerCase().includes(q) ||
      r.purpose?.toLowerCase().includes(q) ||
      r.status.toLowerCase().includes(q)
    );
  }, [records, searchQuery]);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  // Check if credential data is still accessible
  const isAccessible = (r: VerificationRecord): boolean => {
    if (!r.shared_credential_data) return false;
    if (r.storage_consent) return true;
    if (!r.access_expires_at) return false;
    return new Date(r.access_expires_at).getTime() > Date.now();
  };

  const stats = useMemo(() => {
    const total = records.length;
    const accepted = records.filter((r) => r.status === "accepted" || r.status === "verified").length;
    const accessible = records.filter(isAccessible).length;
    const stored = records.filter((r) => r.storage_consent && r.shared_credential_data).length;
    return { total, accepted, accessible, stored };
  }, [records]);

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xl font-display font-semibold text-foreground">Verification History</h2>
        <Input
          placeholder="Search history…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="max-w-xs h-8 text-xs"
        />
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: FileText, value: stats.total, label: "Total Requests", color: "text-muted-foreground" },
          { icon: ShieldCheck, value: stats.accepted, label: "Accepted", color: "text-accent-foreground" },
          { icon: Eye, value: stats.accessible, label: "Documents Live", color: "text-primary" },
          { icon: Lock, value: stats.stored, label: "Permanently Stored", color: "text-amber-500" },
        ].map(({ icon: Icon, value, label, color }) => (
          <Card key={label}>
            <CardContent className="py-3 px-4 flex items-center gap-3">
              <Icon className={`h-4 w-4 ${color}`} />
              <div>
                <p className="text-lg font-display font-bold text-foreground">{value}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Records List */}
      <Card>
        <CardContent className="pt-6">
          {filteredRecords.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              {records.length === 0 ? "No verifications yet." : "No results match your search."}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredRecords.map((r) => {
                const accessible = isAccessible(r);
                const hasData = !!r.shared_credential_data;
                const isExpanded = expandedId === r.id;
                const isAccepted = r.status === "accepted" || r.status === "verified";

                return (
                  <div key={r.id} className="rounded-lg border border-border/50 overflow-hidden transition-all hover:border-border">
                    {/* Row header */}
                    <button
                      className="w-full text-left p-3 flex items-center justify-between gap-3"
                      onClick={() => hasData ? toggleExpand(r.id) : undefined}
                      style={{ cursor: hasData ? "pointer" : "default" }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-medium text-foreground">
                            {r.credential_type || "Credential"} {r.purpose && `— ${r.purpose}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                          {r.holder_did && (
                            <span className="inline-flex items-center gap-1 font-mono">
                              <User className="h-3 w-3" />
                              {r.holder_did.substring(0, 28)}…
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(r.created_at).toLocaleDateString()} {new Date(r.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {r.responded_at && (
                            <span className="inline-flex items-center gap-1 text-accent-foreground">
                              <ShieldCheck className="h-3 w-3" />
                              Responded {new Date(r.responded_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Time-limited access indicator */}
                        {isAccepted && hasData && !r.storage_consent && r.access_expires_at && (
                          <CountdownBadge expiresAt={r.access_expires_at} />
                        )}
                        {/* Storage consent badge */}
                        {r.storage_consent && hasData && (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                            <Lock className="h-3 w-3" /> Stored
                          </span>
                        )}
                        {r.ai_analysis && <Brain className="h-3 w-3 text-primary" />}
                        {getStatusBadge(r.status, r.storage_consent)}

                        {/* Expand/collapse indicator */}
                        {hasData && (
                          accessible ? (
                            isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <EyeOff className="h-3.5 w-3.5 text-muted-foreground" title="Access expired" />
                          )
                        )}
                      </div>
                    </button>

                    {/* Expanded document viewer */}
                    {isExpanded && hasData && (
                      <div className="px-3 pb-3 border-t border-border/40">
                        {accessible ? (
                          <div className="pt-3">
                            <CredentialDocumentViewer data={r.shared_credential_data!} />
                          </div>
                        ) : (
                          <div className="py-6 text-center text-muted-foreground text-sm">
                            <EyeOff className="h-5 w-5 mx-auto mb-2 opacity-50" />
                            <p className="font-medium">Access Expired</p>
                            <p className="text-xs mt-1">The 4-hour viewing window has closed. Request a new presentation from the holder.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
};

export default HistoryView;
