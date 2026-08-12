import { useMemo, useState, useEffect, useCallback } from "react";
import {
  Brain, ChevronDown, ChevronUp, Clock, Eye, EyeOff, FileText,
  Lock, ShieldCheck, Timer, User, Building2, Calendar, Link2, Hash,
  Filter, Download, FileJson, Loader2, Search, RefreshCw, FileUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious,
} from "@/components/ui/pagination";
import {
  fetchVerificationRecords, downloadTextFile, verificationRecordsToCSV,
  type VerificationRecord,
} from "@/services/api/verifier.service";
import { CREDENTIAL_TYPE_OPTIONS } from "@/data/VerifierSampleVPs";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

interface HistoryViewProps {
  verifierId: string;
  refreshSignal: number;
}

const PAGE_SIZES = [10, 25, 50];
const STATUS_OPTIONS = ["pending", "verified", "accepted", "rejected"];

// ── Countdown timer component ──
const CountdownBadge = ({ expiresAt }: { expiresAt: string }) => {
  const [remaining, setRemaining] = useState("");
  const [expired, setExpired] = useState(false);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const totalMs = 4 * 60 * 60 * 1000;
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
function getStatusBadge(status: string) {
  if (status === "accepted" || status === "verified") {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground">
        <ShieldCheck className="h-3 w-3" /> {status}
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
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
      <Clock className="h-3 w-3" /> {status}
    </span>
  );
}

const isAccessible = (r: VerificationRecord): boolean => {
  if (!r.shared_credential_data) return false;
  if (r.storage_consent) return true;
  if (!r.access_expires_at) return false;
  return new Date(r.access_expires_at).getTime() > Date.now();
};

// ── Main HistoryView ──
const HistoryView = ({ verifierId, refreshSignal }: HistoryViewProps) => {
  const { toast } = useToast();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [type, setType] = useState<string>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Data
  const [records, setRecords] = useState<VerificationRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"csv" | "json" | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [status, type, debouncedSearch, startDate, endDate, pageSize]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = (page - 1) * pageSize;
      const { records: rows, count } = await fetchVerificationRecords(verifierId, {
        status: status === "all" ? null : status,
        credentialType: type === "all" ? null : type,
        search: debouncedSearch || null,
        startDate: startDate || null,
        endDate: endDate ? new Date(new Date(endDate).getTime() + 86_400_000).toISOString() : null,
        from,
        to: from + pageSize - 1,
      });
      setRecords(rows);
      setTotal(count);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [verifierId, page, pageSize, status, type, debouncedSearch, startDate, endDate, toast]);

  useEffect(() => { load(); }, [load]);

  // Refresh when the parent reloads records (realtime changes, new verifications)
  useEffect(() => { load(); }, [refreshSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const exportData = async (format: "csv" | "json") => {
    setExporting(format);
    try {
      const { records: all } = await fetchVerificationRecords(verifierId, {
        status: status === "all" ? null : status,
        credentialType: type === "all" ? null : type,
        search: debouncedSearch || null,
        startDate: startDate || null,
        endDate: endDate ? new Date(new Date(endDate).getTime() + 86_400_000).toISOString() : null,
      });
      if (format === "csv") {
        downloadTextFile(`blockid-verifications-${Date.now()}.csv`, verificationRecordsToCSV(all), "text/csv");
      } else {
        downloadTextFile(
          `blockid-verifications-${Date.now()}.json`,
          JSON.stringify({ exported_at: new Date().toISOString(), count: all.length, records: all }, null, 2),
          "application/json"
        );
      }
      toast({ title: "Export complete", description: `${all.length} records exported as ${format.toUpperCase()}.` });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  const hasFilters = search || status !== "all" || type !== "all" || startDate || endDate;

  const stats = useMemo(() => {
    // Dashboard-wide stats are computed in the parent; here we show current-filter totals.
    return {
      shown: records.length,
      total,
    };
  }, [records.length, total]);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-xl font-display font-semibold text-foreground">Verification History</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {stats.total.toLocaleString()} record{stats.total === 1 ? "" : "s"}
              {hasFilters && ` · filtered`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              disabled={exporting !== null}
              onClick={() => exportData("csv")}
            >
              {exporting === "csv" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              disabled={exporting !== null}
              onClick={() => exportData("json")}
            >
              {exporting === "json" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileJson className="h-3.5 w-3.5" />}
              JSON
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => load()} title="Refresh">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, duration: 0.3 }}>
        <Card className="solid-card">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-3 text-xs font-semibold text-muted-foreground">
              <Filter className="h-3.5 w-3.5 text-verifier" /> Filters
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="relative lg:col-span-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search holder, type, purpose…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
              </div>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {CREDENTIAL_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 text-xs" aria-label="From date" />
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 text-xs" aria-label="To date" />
              </div>
              {hasFilters && (
                <Button variant="ghost" size="sm" className="h-9 text-xs text-muted-foreground" onClick={() => {
                  setSearch(""); setDebouncedSearch(""); setStatus("all"); setType("all"); setStartDate(""); setEndDate("");
                }}>
                  Clear
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Records list */}
      <Card className="solid-card">
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-verifier" />
            </div>
          ) : records.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm flex-col gap-2">
              <FileUp className="h-8 w-8 text-muted-foreground/30" />
              {hasFilters ? "No records match your filters." : "No verifications yet. Verify a credential to get started."}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {records.map((r) => {
                  const accessible = isAccessible(r);
                  const hasData = !!r.shared_credential_data;
                  const isExpanded = expandedId === r.id;
                  const isAccepted = r.status === "accepted" || r.status === "verified";

                  return (
                    <div key={r.id} className="rounded-lg border border-border/50 overflow-hidden transition-all hover:border-border">
                      <button
                        className="w-full text-left p-3 flex items-center justify-between gap-3"
                        onClick={() => hasData ? setExpandedId(isExpanded ? null : r.id) : undefined}
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
                          {isAccepted && hasData && !r.storage_consent && r.access_expires_at && (
                            <CountdownBadge expiresAt={r.access_expires_at} />
                          )}
                          {r.storage_consent && hasData && (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                              <Lock className="h-3 w-3" /> Stored
                            </span>
                          )}
                          {r.ai_analysis && <Brain className="h-3 w-3 text-primary" />}
                          {getStatusBadge(r.status)}

                          {hasData && (
                            accessible ? (
                              isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <span title="Access expired">
                                <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                              </span>
                            )
                          )}
                        </div>
                      </button>

                      <AnimatePresence>
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
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between gap-3 pt-5 flex-wrap">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Label className="sr-only">Page size</Label>
                  <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                    <SelectTrigger className="h-8 w-[80px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZES.map((n) => (
                        <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span>
                    Page {page} of {totalPages} · {total.toLocaleString()} total
                  </span>
                </div>
                <Pagination className="justify-end">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(e) => { e.preventDefault(); if (page > 1) setPage(page - 1); }}
                        className={page <= 1 ? "pointer-events-none opacity-40" : ""}
                      />
                    </PaginationItem>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      let p = i + 1;
                      if (totalPages > 5 && page > 3) p = page - 3 + i;
                      if (p > totalPages) return null;
                      return (
                        <PaginationItem key={p}>
                          <PaginationLink
                            href="#"
                            isActive={p === page}
                            onClick={(e) => { e.preventDefault(); setPage(p); }}
                          >
                            {p}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    })}
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(e) => { e.preventDefault(); if (page < totalPages) setPage(page + 1); }}
                        className={page >= totalPages ? "pointer-events-none opacity-40" : ""}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default HistoryView;
