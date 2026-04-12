import { useState, useEffect, useCallback } from "react";
import { QrCode, Share2, ExternalLink, Inbox, CheckCircle2, XCircle, Loader2, Clock, FileCheck, ShieldCheck, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import ActiveShareLinks from "@/components/ActiveShareLinks";
import PrivacyCenter from "@/components/PrivacyCenter";
import { useToast } from "@/hooks/use-toast";
import {
  fetchPendingRequests,
  respondToRequest,
  subscribeToVerificationRequests,
  type HolderCredential,
  type VerificationRequest,
} from "@/services/api/holder.service";

interface PresentViewProps {
  credentials: HolderCredential[];
  holderDid: string | undefined;
  onShowQR: (value: string, title: string) => void;
  onCopy: (text: string) => void;
  onShareCred: (id: string, name: string, fields: string[]) => void;
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

const PresentView = ({ credentials, holderDid, onShowQR, onCopy, onShareCred }: PresentViewProps) => {
  const { toast } = useToast();
  const activeCredentials = credentials.filter((c) => c.status === "active");

  // ── Incoming verification requests ──
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  // ── Credential picker dialog ──
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerRequestId, setPickerRequestId] = useState<string | null>(null);
  const [pickerRequestType, setPickerRequestType] = useState<string | null>(null);
  const [selectedCredId, setSelectedCredId] = useState<string | null>(null);
  const [storageConsent, setStorageConsent] = useState(false);

  const loadRequests = useCallback(async () => {
    if (!holderDid) return;
    setLoadingRequests(true);
    try {
      const data = await fetchPendingRequests(holderDid);
      setRequests(data);
    } catch {
      // silently fail — not critical
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

  const openCredentialPicker = (req: VerificationRequest) => {
    setPickerRequestId(req.id);
    setPickerRequestType(req.credential_type);
    setSelectedCredId(null);
    setStorageConsent(false);
    setPickerOpen(true);
  };

  // Filter credentials matching the requested type (if any)
  const matchingCredentials = activeCredentials.filter((c) => {
    if (!pickerRequestType) return true; // show all if no specific type requested
    const type = c.credential_schemas?.credential_type?.toLowerCase() || "";
    const name = c.credential_schemas?.name?.toLowerCase() || "";
    const reqType = pickerRequestType.toLowerCase();
    return type.includes(reqType) || name.includes(reqType);
  });

  const handleAcceptWithCredential = async () => {
    if (!pickerRequestId || !selectedCredId) return;
    const cred = activeCredentials.find((c) => c.id === selectedCredId);
    if (!cred) return;

    setRespondingId(pickerRequestId);
    setPickerOpen(false);

    try {
      const credData = cred.credential_data as Record<string, unknown>;
      const sharedData: Record<string, unknown> = {
        credentialSubject: (credData as any)?.credentialSubject || {},
        type: (credData as any)?.type || [],
        issuer: (credData as any)?.issuer || null,
        issuanceDate: (credData as any)?.issuanceDate || null,
        expirationDate: (credData as any)?.expirationDate || null,
        proof: (credData as any)?.proof || null,
        blockchain: (credData as any)?.blockchain || null,
        schemaName: cred.credential_schemas?.name || "Credential",
        schemaType: cred.credential_schemas?.credential_type || "",
        credentialHash: cred.credential_hash,
        blockchainAnchor: cred.blockchain_anchor,
      };

      await respondToRequest(pickerRequestId, "accepted", {
        credentialId: cred.id,
        sharedData,
        storageConsent,
      });

      toast({
        title: "Credential shared ✓",
        description: storageConsent
          ? "The verifier can store this credential permanently."
          : "The verifier can view this credential for 4 hours.",
      });
      setRequests((prev) => prev.filter((r) => r.id !== pickerRequestId));
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

  const createPresentation = (cred: HolderCredential) => JSON.stringify({
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    type: ["VerifiablePresentation"],
    holder: holderDid,
    verifiableCredential: { ...(cred.credential_data as any), id: cred.id },
    credential_id: cred.id,
  });

  return (
    <>
      <h2 className="text-xl font-display font-semibold text-foreground">Present Credentials</h2>

      {/* ── Incoming Verification Requests ── */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-base flex items-center gap-2">
            <Inbox className="h-4 w-4 text-primary" />
            Incoming Verification Requests
            {requests.length > 0 && (
              <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold animate-pulse">
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
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
                        pending
                      </span>
                    </div>
                    {req.purpose && (
                      <p className="text-xs text-muted-foreground mb-0.5">
                        Purpose: {req.purpose}
                      </p>
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
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1 border-destructive/30 text-destructive hover:bg-destructive/10"
                      disabled={respondingId === req.id}
                      onClick={() => handleDecline(req.id)}
                    >
                      {respondingId === req.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                      Decline
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1"
                      disabled={respondingId === req.id}
                      onClick={() => openCredentialPicker(req)}
                    >
                      {respondingId === req.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileCheck className="h-3 w-3" />}
                      Accept & Share
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Credential Picker Dialog ── */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Select Credential to Share
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Choose which credential to share with the verifier.
              {pickerRequestType && (
                <> They requested a <strong>{pickerRequestType}</strong>.</>
              )}
            </p>

            {matchingCredentials.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                No matching active credentials found.
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {(matchingCredentials.length > 0 ? matchingCredentials : activeCredentials).map((cred) => (
                  <button
                    key={cred.id}
                    onClick={() => setSelectedCredId(cred.id)}
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

            <Button
              className="w-full gap-2"
              disabled={!selectedCredId}
              onClick={handleAcceptWithCredential}
            >
              <ShieldCheck className="h-4 w-4" />
              Share Selected Credential
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Credentials available to present ── */}
      {activeCredentials.length === 0 ? (
        <Card><CardContent className="py-12"><div className="flex items-center justify-center text-muted-foreground text-sm">No active credentials to present.</div></CardContent></Card>
      ) : (
        <div className="space-y-4">
          {activeCredentials.map((cred) => (
            <Card key={cred.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-display font-semibold text-foreground">{cred.credential_schemas?.name || "Credential"}</h4>
                    <p className="text-xs text-muted-foreground">{cred.credential_schemas?.credential_type}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground">active</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => onShowQR(createPresentation(cred), cred.credential_schemas?.name || "Credential")}>
                    <QrCode className="h-3 w-3" /> Show QR
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => onCopy(createPresentation(cred))}>
                    <Share2 className="h-3 w-3" /> Copy VP
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
