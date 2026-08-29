import { useState, useEffect, useCallback } from "react";
import {
  QrCode, ExternalLink, Inbox, CheckCircle2, XCircle, Loader2, Clock,
  FileCheck, ShieldCheck, Lock, Smartphone, Eye, Bot, AlertCircle, RefreshCw
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import ActiveShareLinks from "@/components/ActiveShareLinks";
import PrivacyCenter from "@/components/PrivacyCenter";
import OID4VCIReceiveDialog from "@/components/OID4VCIReceiveDialog";
import VPExportPanel from "@/components/VPExportPanel";
import { useToast } from "@/hooks/use-toast";
import {
  fetchPendingRequests,
  respondToRequest,
  subscribeToVerificationRequests,
  fetchRequestAiResult,
  type HolderCredential,
  type VerificationRequest,
  type AiVerificationResult,
} from "@/services/api/holder.service";

interface PresentViewProps {
  credentials: HolderCredential[];
  holderDid: string | undefined;
  holderAddress?: string | undefined;
  onShowQR: (value: string, title: string) => void;
  onCopy: (text: string) => void;
  onShareCred: (id: string, name: string, fields: string[]) => void;
  isWalletConnected: boolean;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── AI Verdict Badge ──────────────────────────────────────────────────────────

function AiBadge({ verdict, confidence }: { verdict: AiVerificationResult["verdict"]; confidence: number }) {
  const pct = Math.round(confidence * 100);
  if (verdict === "verified") {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 font-medium">
        <Bot className="h-3 w-3" /> AI Verified · {pct}%
      </span>
    );
  }
  if (verdict === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 font-medium">
        <Bot className="h-3 w-3" /> AI Rejected · {pct}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
      <Bot className="h-3 w-3" /> AI Review · {pct}%
    </span>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

const PresentView = ({
  credentials, holderDid, holderAddress, onShowQR, onCopy, onShareCred, isWalletConnected
}: PresentViewProps) => {
  const { toast } = useToast();
  const activeCredentials = credentials.filter((c) => c.status === "active");

  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  // AI verdict state: requestId → result (polled after accept)
  const [aiResults, setAiResults] = useState<Record<string, AiVerificationResult | "pending">>({});

  // Credential picker dialog
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerRequest, setPickerRequest] = useState<VerificationRequest | null>(null);
  const [selectedCredId, setSelectedCredId] = useState<string | null>(null);
  const [storageConsent, setStorageConsent] = useState(false);
  const [vpPanelOpen, setVpPanelOpen] = useState(false);

  const loadRequests = useCallback(async () => {
    if (!holderDid) return;
    setLoadingRequests(true);
    try {
      const data = await fetchPendingRequests(holderDid);
      setRequests(data);
    } catch {
      // silently fail
    } finally {
      setLoadingRequests(false);
    }
  }, [holderDid]);

  useEffect(() => {
    loadRequests();
    if (!holderDid) return;
    const unsub = subscribeToVerificationRequests(holderDid, loadRequests);
    return unsub;
  }, [holderDid, loadRequests]);

  // Poll AI result for a request (up to 10 attempts, every 2s)
  const pollAiResult = useCallback(async (requestId: string) => {
    setAiResults((prev) => ({ ...prev, [requestId]: "pending" }));
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const result = await fetchRequestAiResult(requestId);
        if (result?.verdict) {
          setAiResults((prev) => ({ ...prev, [requestId]: result }));
          return;
        }
      } catch { /* ignore */ }
    }
    // Give up after 20s — remove pending indicator
    setAiResults((prev) => {
      const next = { ...prev };
      delete next[requestId];
      return next;
    });
  }, []);

  const matchingCredentials = activeCredentials.filter((c) => {
    if (!pickerRequest?.credential_type) return true;
    const type = c.credential_schemas?.credential_type?.toLowerCase() || "";
    const name = c.credential_schemas?.name?.toLowerCase() || "";
    const reqType = pickerRequest.credential_type.toLowerCase();
    return type.includes(reqType) || name.includes(reqType);
  });

  const selectedCred = activeCredentials.find((c) => c.id === selectedCredId) ?? null;

  const openCredentialPicker = (req: VerificationRequest) => {
    setPickerRequest(req);
    setSelectedCredId(null);
    setStorageConsent(false);
    setVpPanelOpen(false);
    setPickerOpen(true);
  };

  const handleAcceptWithCredential = async () => {
    if (!pickerRequest || !selectedCredId || !selectedCred) return;

    setRespondingId(pickerRequest.id);
    setPickerOpen(false);

    try {
      const credData = selectedCred.credential_data as Record<string, unknown>;
      const sharedData: Record<string, unknown> = {
        credentialSubject: (credData as any)?.credentialSubject || {},
        type: (credData as any)?.type || [],
        issuer: (credData as any)?.issuer || null,
        issuanceDate: (credData as any)?.issuanceDate || null,
        expirationDate: (credData as any)?.expirationDate || null,
        proof: (credData as any)?.proof || null,
        blockchain: (credData as any)?.blockchain || null,
        schemaName: selectedCred.credential_schemas?.name || "Credential",
        schemaType: selectedCred.credential_schemas?.credential_type || "",
        credentialHash: selectedCred.credential_hash,
        blockchainAnchor: selectedCred.blockchain_anchor,
      };

      await respondToRequest(pickerRequest.id, "accepted", {
        credentialId: selectedCred.id,
        sharedData,
        storageConsent,
        purpose: pickerRequest.purpose,
        credentialType: pickerRequest.credential_type,
      });

      toast({
        title: "Credential shared ✓",
        description: storageConsent
          ? "Verifier can store this credential. AI is verifying in the background…"
          : "Verifier has 4-hour access. AI is verifying in the background…",
      });

      setRequests((prev) => prev.filter((r) => r.id !== pickerRequest.id));

      // Background AI polling — no await
      pollAiResult(pickerRequest.id);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setRespondingId(null);
    }
  };

  const handleDecline = async (id: string) => {
    setRespondingId(id);
    try {
      await respondToRequest(id, "rejected");
      toast({ title: "Request declined" });
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setRespondingId(null);
    }
  };

  // VP input for the selected credential in the picker
  const vpInput = selectedCred
    ? {
        credentialData: selectedCred.credential_data as Record<string, unknown>,
        credentialHash: selectedCred.credential_hash,
        blockchainAnchor: selectedCred.blockchain_anchor,
        holderDid: holderDid || "",
        holderAddress: holderAddress || "",
      }
    : null;

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-headline">Present Credentials</h2>
        <OID4VCIReceiveDialog onCredentialReceived={loadRequests} />
      </div>

      {/* ── AI Verdict Notifications ───────────────────────────────────────── */}
      {Object.entries(aiResults).map(([reqId, res]) => (
        res !== "pending" ? (
          <div
            key={reqId}
            className={`mb-4 flex items-start gap-3 p-3 rounded-lg border text-sm ${
              res.verdict === "verified"
                ? "border-green-500/30 bg-green-500/5"
                : res.verdict === "rejected"
                ? "border-red-500/30 bg-red-500/5"
                : "border-amber-500/30 bg-amber-500/5"
            }`}
          >
            <Bot className={`h-4 w-4 mt-0.5 shrink-0 ${
              res.verdict === "verified" ? "text-green-500"
                : res.verdict === "rejected" ? "text-red-500"
                : "text-amber-500"
            }`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-medium text-foreground">
                  AI {res.verdict === "verified" ? "Verified" : res.verdict === "rejected" ? "Rejected" : "Needs Review"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {Math.round(res.confidence * 100)}% confidence · {res.engine}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{res.summary}</p>
            </div>
            <button
              onClick={() => setAiResults((p) => { const n = {...p}; delete n[reqId]; return n; })}
              className="text-muted-foreground hover:text-foreground text-xs shrink-0"
            >
              ✕
            </button>
          </div>
        ) : (
          <div key={reqId} className="mb-4 flex items-center gap-2 p-3 rounded-lg border border-border/60 bg-muted/20 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            AI is verifying the shared credential in the background…
          </div>
        )
      ))}

      {/* ── Incoming Requests ─────────────────────────────────────────────── */}
      <Card className="solid-card mb-6">
        <CardHeader className="pb-3 bg-muted/30">
          <CardTitle className="font-display text-base flex items-center gap-2">
            <Inbox className="h-4 w-4 text-primary" />
            Incoming Verification Requests
            {requests.length > 0 && (
              <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                {requests.length} pending
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingRequests ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading requests…
            </div>
          ) : !holderDid && !isWalletConnected ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              Connect your wallet and generate a DID to receive verification requests.
            </div>
          ) : !holderDid ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              Generate your DID first to receive verification requests.
            </div>
          ) : requests.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              No pending verification requests.
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/60 bg-card hover:border-primary/30 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-foreground">
                        {req.credential_type
                          ? req.credential_type.charAt(0).toUpperCase() + req.credential_type.slice(1)
                          : "Any Credential"}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-medium">
                        pending
                      </span>
                    </div>
                    {req.purpose && (
                      <p className="text-xs text-muted-foreground mb-0.5">Purpose: {req.purpose}</p>
                    )}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {timeAgo(req.created_at)}
                      <span className="mx-1">·</span>
                      <span className="font-mono truncate" title={req.verifier_id}>
                        Verifier: {req.verifier_id.substring(0, 12)}…
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline" size="sm"
                      className="h-7 text-xs gap-1 border-destructive/30 text-destructive hover:bg-destructive/10"
                      disabled={respondingId === req.id}
                      onClick={() => handleDecline(req.id)}
                    >
                      {respondingId === req.id
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <XCircle className="h-3 w-3" />}
                      Decline
                    </Button>
                    <Button
                      size="sm" className="h-7 text-xs gap-1"
                      disabled={respondingId === req.id}
                      onClick={() => openCredentialPicker(req)}
                    >
                      {respondingId === req.id
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <FileCheck className="h-3 w-3" />}
                      Accept & Share
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Credential Picker Dialog ──────────────────────────────────────── */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Select Credential to Share
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Choose which credential to share with the verifier.
              {pickerRequest?.credential_type && (
                <> They requested a <strong>{pickerRequest.credential_type}</strong>.</>
              )}
              {pickerRequest?.purpose && (
                <> Purpose: <em>{pickerRequest.purpose}</em>.</>
              )}
            </p>

            {/* Credential list */}
            {matchingCredentials.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                No matching active credentials found.
              </div>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {(matchingCredentials.length > 0 ? matchingCredentials : activeCredentials).map((cred) => (
                  <button
                    key={cred.id}
                    onClick={() => { setSelectedCredId(cred.id); setVpPanelOpen(false); }}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      selectedCredId === cred.id
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : "border-border/60 hover:border-primary/30"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {cred.credential_schemas?.name || "Credential"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {cred.credential_schemas?.credential_type} · Issued {new Date(cred.issued_at).toLocaleDateString()}
                        </p>
                      </div>
                      {selectedCredId === cred.id && (
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* VP Export Panel — shown when a credential is selected */}
            {selectedCred && vpInput && (
              <Collapsible open={vpPanelOpen} onOpenChange={setVpPanelOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full gap-2 text-xs">
                    <Eye className="h-3.5 w-3.5" />
                    {vpPanelOpen ? "Hide" : "Preview"} Verifiable Presentation (QR / JWT / JSON / Chain)
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 border border-border/60 rounded-lg p-3">
                  <VPExportPanel vpInput={vpInput} />
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Storage consent toggle */}
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/60 bg-muted/30">
              <div className="flex items-start gap-2">
                <Lock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <Label className="text-sm font-medium">Allow permanent storage</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {storageConsent
                      ? "The verifier can store this credential indefinitely."
                      : "Access expires after 4 hours (default)."}
                  </p>
                </div>
              </div>
              <Switch checked={storageConsent} onCheckedChange={setStorageConsent} />
            </div>

            {/* AI notice */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
              <Bot className="h-3.5 w-3.5 shrink-0 text-primary" />
              AI will automatically verify this credential in the background after sharing.
            </div>

            <Button
              className="w-full"
              disabled={!selectedCredId}
              onClick={handleAcceptWithCredential}
            >
              <ShieldCheck className="h-4 w-4 mr-2" />
              Share Selected Credential
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Active credentials list ───────────────────────────────────────── */}
      {activeCredentials.length === 0 ? (
        <Card className="solid-card">
          <CardContent className="py-12">
            <div className="flex items-center justify-center text-muted-foreground text-sm">
              No active credentials to present.
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {activeCredentials.map((cred) => (
            <Card key={cred.id} className="solid-card">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-display font-semibold text-foreground">
                      {cred.credential_schemas?.name || "Credential"}
                    </h4>
                    <p className="text-xs text-muted-foreground">{cred.credential_schemas?.credential_type}</p>
                  </div>
                  <span className="badge-solid bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400">
                    active
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => {
                    const subject = (cred.credential_data as any)?.credentialSubject;
                    onShareCred(cred.id, cred.credential_schemas?.name || "Credential", subject ? Object.keys(subject) : []);
                  }}>
                    <QrCode className="h-3 w-3" /> Share & QR
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => {
                    const subject = (cred.credential_data as any)?.credentialSubject;
                    onShareCred(cred.id, cred.credential_schemas?.name || "Credential", subject ? Object.keys(subject) : []);
                  }}>
                    <ExternalLink className="h-3 w-3" /> Share Link
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ActiveShareLinks />
      <PrivacyCenter />
    </>
  );
};

export default PresentView;
