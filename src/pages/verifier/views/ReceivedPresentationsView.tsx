import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Inbox, User, Clock, ShieldCheck, Lock, EyeOff, ChevronDown, ChevronUp,
  Sparkles, Loader2, ExternalLink, FileText, Hash, Link2, ArrowRight,
  Building2, Calendar, ScanSearch, XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import VerificationResultView from "@/components/verifier/VerificationResultView";
import {
  callVerifyEdgeFunction,
  applyVerificationToRequest,
  fetchPolicies,
  fetchBlocklist,
  addToBlocklist,
  removeFromBlocklist,
  type VerificationRecord,
  type VerificationPolicyRow,
  type BlocklistEntry,
} from "@/services/api/verifier.service";
import {
  isAwaitingVerification,
  credentialPayload,
  credentialHashOf,
  addressFromDid,
  credentialTypeOf,
} from "@/lib/verifier/intelligence";
import { buildEtherscanUrl } from "@/lib/vpUtils";
import { supabase } from "@/integrations/supabase/client";

interface ReceivedPresentationsViewProps {
  verifierId: string;
  records: VerificationRecord[];
  onRecordsRefresh: () => void;
}

const hasAccess = (r: VerificationRecord): boolean => {
  if (!r.shared_credential_data) return false;
  if (r.storage_consent) return true;
  if (!r.access_expires_at) return false;
  return new Date(r.access_expires_at).getTime() > Date.now();
};

const timeOf = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString()} · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
};

// ── Raw presentation attributes ───────────────────────────────────────────────
const PayloadDrawer = ({ data }: { data: Record<string, unknown> }) => {
  const subject = (data.credentialSubject ?? {}) as Record<string, unknown>;
  const subjectEntries = Object.entries(subject).filter(([k]) => k !== "id");
  const issuer =
    typeof data.issuer === "string" ? data.issuer : ((data.issuer as any)?.id as string | undefined);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-primary/5 to-transparent border border-primary/10">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {(data.schemaName as string) || "Credential"}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {(data.schemaType as string) || "Verifiable Credential"}
          </p>
        </div>
      </div>

      {subjectEntries.length > 0 ? (
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
      ) : (
        <p className="text-xs text-muted-foreground">No credential subject fields were shared.</p>
      )}

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {issuer && (
          <span className="inline-flex items-center gap-1">
            <Building2 className="h-3 w-3" /> Issuer: {issuer.substring(0, 26)}…
          </span>
        )}
        {data.issuanceDate && (
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" /> Issued {new Date(data.issuanceDate as string).toLocaleDateString()}
          </span>
        )}
        {data.expirationDate && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" /> Expires {new Date(data.expirationDate as string).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
};

// ── Main view ─────────────────────────────────────────────────────────────────
const ReceivedPresentationsView = ({
  verifierId,
  records,
  onRecordsRefresh,
}: ReceivedPresentationsViewProps) => {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [report, setReport] = useState<{
    record: VerificationRecord;
    result: Record<string, unknown>;
  } | null>(null);

  const [policies, setPolicies] = useState<VerificationPolicyRow[]>([]);
  const [blocklist, setBlocklist] = useState<BlocklistEntry[]>([]);

  const activePolicy = useMemo(
    () => policies.find((p) => p.is_active)?.policy_json ?? null,
    [policies]
  );

  const inbox = useMemo(
    () =>
      records
        .filter(isAwaitingVerification)
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
    [records]
  );

  const loadContext = useCallback(async () => {
    try {
      const [p, b] = await Promise.all([
        fetchPolicies(verifierId).catch(() => []),
        fetchBlocklist(verifierId).catch(() => []),
      ]);
      setPolicies(p);
      setBlocklist(b);
    } catch {
      // The report degrades to per-presentation signals only.
    }
  }, [verifierId]);

  useEffect(() => { loadContext(); }, [loadContext]);

  /**
   * Run the full verification right here and close the inbox row out.
   *
   * `request_id` tells the edge function to write onto this row instead of
   * inserting a duplicate history entry, and `applyVerificationToRequest` is
   * the belt-and-braces write that guarantees the row leaves the inbox even
   * against a deployed function that predates `request_id` support.
   */
  const quickVerify = async (record: VerificationRecord) => {
    if (!record.credential_id) return;
    setVerifyingId(record.id);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token ?? "";
      const result = await callVerifyEdgeFunction(
        { credential_id: record.credential_id, request_id: record.id },
        token
      );
      if (result.error) throw new Error(String(result.error));
      await applyVerificationToRequest(record.id, verifierId, result);
      setReport({ record, result });
      toast({
        title: result.valid ? "Presentation verified" : "Presentation rejected",
        description: `Score ${((result.ai_analysis as any)?.score ?? "—")}/100 recorded against this request.`,
      });
      onRecordsRefresh();
    } catch (err) {
      toast({
        title: "Verification failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setVerifyingId(null);
    }
  };

  const blockHolder = async (did: string) => {
    try {
      await addToBlocklist(verifierId, did, "Blocked from the presentation inbox");
      await loadContext();
      toast({ title: "Holder blocklisted", description: did });
    } catch (err) {
      toast({
        title: "Could not block holder",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

  const unblockHolder = async (did: string) => {
    const entry = blocklist.find((e) => e.holder_did === did);
    try {
      if (entry) await removeFromBlocklist(entry.id);
      await loadContext();
      toast({ title: "Holder unblocked", description: did });
    } catch (err) {
      toast({
        title: "Could not unblock holder",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-end justify-between flex-wrap gap-3"
      >
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-verifier mb-3">
            Verification / Inbox
          </p>
          <h2 className="text-headline mb-1">Received Presentations</h2>
          <p className="text-muted-foreground text-sm max-w-2xl">
            Credentials a holder has shared with you. Nothing here has been verified yet —
            inspect the payload first, then attest to it.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs font-mono uppercase tracking-[0.16em] text-muted-foreground">
          <Inbox className="h-3.5 w-3.5 text-verifier" />
          {inbox.length} awaiting verification
        </span>
      </motion.div>

      <Card className="solid-card">
        <CardHeader className="pb-3 bg-muted/30">
          <CardTitle className="font-display text-base flex items-center gap-2">
            <Inbox className="h-4 w-4 text-verifier" />
            Inbox
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {inbox.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-14 text-muted-foreground text-sm">
              <Inbox className="h-9 w-9 opacity-30" />
              <p className="font-medium">No presentations waiting.</p>
              <p className="text-xs text-center max-w-sm">
                When a holder accepts one of your requests it lands here for you to review
                and verify.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {inbox.map((r) => {
                const payload = credentialPayload(r);
                const accessible = hasAccess(r);
                const hasData = !!r.shared_credential_data;
                const isExpanded = expandedId === r.id;
                const address = addressFromDid(r.holder_did);
                const hash = credentialHashOf(r);
                const txHash =
                  typeof (payload?.blockchain as any)?.txHash === "string"
                    ? (payload.blockchain as any).txHash
                    : null;
                const explorerUrl = buildEtherscanUrl(
                  (payload?.blockchainAnchor as string) ?? null,
                  payload
                );
                const type = credentialTypeOf(r) || r.credential_type || "Credential";
                const schemaName =
                  typeof payload?.schemaName === "string" ? (payload.schemaName as string) : null;
                const schemaType =
                  typeof payload?.schemaType === "string" ? (payload.schemaType as string) : null;
                const zkp = (payload?.zkp ?? null) as Record<string, unknown> | null;
                const zkpCommitment =
                  typeof zkp?.commitment === "string"
                    ? (zkp.commitment as string)
                    : typeof zkp?.nullifier === "string"
                      ? (zkp.nullifier as string)
                      : null;
                const busy = verifyingId === r.id;

                return (
                  <div
                    key={r.id}
                    className="rounded-lg border border-verifier/25 bg-card overflow-hidden"
                  >
                    {/* Row header */}
                    <div className="p-3.5 flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-[240px]">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="text-sm font-semibold text-foreground">{type}</p>
                          {schemaName && schemaName !== type && (
                            <p className="w-full text-xs text-muted-foreground">{schemaName}</p>
                          )}
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-verifier/10 text-verifier font-medium">
                            <Inbox className="h-3 w-3" /> Received
                          </span>
                          {r.storage_consent ? (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                              <Lock className="h-3 w-3" /> Stored
                            </span>
                          ) : r.access_expires_at ? (
                            <span
                              className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                                accessible
                                  ? "bg-muted text-muted-foreground"
                                  : "bg-destructive/10 text-destructive"
                              }`}
                            >
                              <EyeOff className="h-3 w-3" />
                              {accessible ? `Access until ${timeOf(r.access_expires_at)}` : "Access expired"}
                            </span>
                          ) : null}
                        </div>

                        {r.purpose && (
                          <p className="text-xs text-muted-foreground mb-1">Purpose: {r.purpose}</p>
                        )}

                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                          {r.holder_did && (
                            <span className="inline-flex items-center gap-1 font-mono" title={r.holder_did}>
                              <User className="h-3 w-3" />
                              {address ? `${address.substring(0, 10)}…${address.slice(-4)}` : r.holder_did.substring(0, 22) + "…"}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Shared {timeOf(r.responded_at ?? r.created_at)}
                          </span>
                          {hash && (
                            <span className="inline-flex items-center gap-1 font-mono" title={hash}>
                              <Hash className="h-3 w-3 text-primary" />
                              {hash.substring(0, 14)}…
                            </span>
                          )}
                          {schemaType && (
                            <span className="inline-flex items-center gap-1 font-mono" title={`Schema ${schemaType}`}>
                              <FileText className="h-3 w-3" /> {schemaType}
                            </span>
                          )}
                          {zkpCommitment && (
                            <span
                              className="inline-flex items-center gap-1 font-mono"
                              title={`ZKP commitment ${zkpCommitment}`}
                            >
                              <ScanSearch className="h-3 w-3 text-primary" />
                              ZKP {zkpCommitment.substring(0, 12)}…
                            </span>
                          )}
                          {txHash && explorerUrl && (
                            <a
                              href={explorerUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              <Link2 className="h-3 w-3" /> Anchor
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          {typeof r.sbt_token_id === "number" && (
                            <span className="inline-flex items-center gap-1 text-primary">
                              <ShieldCheck className="h-3 w-3" /> Badge #{r.sbt_token_id}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 text-xs"
                          onClick={() => setExpandedId(isExpanded ? null : r.id)}
                          disabled={!hasData}
                        >
                          {hasData ? (
                            <>
                              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              Payload
                            </>
                          ) : (
                            <>
                              <EyeOff className="h-3.5 w-3.5" /> No payload
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 text-xs"
                          onClick={() =>
                            navigate("/verifier/verify", {
                              state: { credentialId: r.credential_id, requestId: r.id },
                            })
                          }
                          disabled={!r.credential_id}
                          title={r.credential_id ? "Open in Verify with full policy context" : "This presentation has no stored credential"}
                        >
                          Verify Credential <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          className="h-8 gap-1 text-xs"
                          onClick={() => quickVerify(r)}
                          disabled={busy || !r.credential_id}
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="h-3.5 w-3.5" />
                          )}
                          Quick Verify
                        </Button>
                      </div>
                    </div>

                    {/* Payload drawer */}
                    <AnimatePresence initial={false}>
                      {isExpanded && hasData && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden border-t border-border/40"
                        >
                          <div className="p-3.5 pt-3">
                            {accessible ? (
                              <PayloadDrawer data={r.shared_credential_data!} />
                            ) : (
                              <div className="py-6 text-center text-muted-foreground text-sm">
                                <EyeOff className="h-5 w-5 mx-auto mb-2 opacity-50" />
                                <p className="font-medium">Access expired</p>
                                <p className="text-xs mt-1">
                                  The 4-hour viewing window has closed. You can still verify by
                                  credential ID, or request a fresh presentation.
                                </p>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Verification report */}
      <Dialog open={report !== null} onOpenChange={(open) => { if (!open) setReport(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="font-display flex items-center gap-2">
              {report?.result.valid ? (
                <ShieldCheck className="h-5 w-5 text-emerald-500" />
              ) : (
                <XCircle className="h-5 w-5 text-destructive" />
              )}
              Verification Report
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-1">
            {report && (
              <VerificationResultView
                result={report.result}
                history={records}
                policy={activePolicy}
                blockedHolders={blocklist.map((b) => b.holder_did)}
                onBlockHolder={blockHolder}
                onUnblockHolder={unblockHolder}
              />
            )}
          </div>
          <div className="shrink-0 pt-3 border-t border-border/40 flex justify-end">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setReport(null)}>
              <ScanSearch className="h-3.5 w-3.5" /> Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ReceivedPresentationsView;
