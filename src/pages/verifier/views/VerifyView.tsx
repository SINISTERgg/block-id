import { useRef, useState, useEffect } from "react";
import {
  Search, Share2, Link2, Copy, Download, Loader2, FileSearch, Layers,
  ScanLine, CheckCircle2, XCircle, Wand2, Trash2, Send, ChevronRight,
  Sparkles, Info,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import OID4VPRequestDialog from "@/components/OID4VPRequestDialog";
import BulkVerifyDialog from "@/components/verifier/BulkVerifyDialog";
import VerificationResultView from "@/components/verifier/VerificationResultView";
import { loadRequestDefaults } from "@/lib/verifierDefaults";
import { useToast } from "@/hooks/use-toast";
import { callVerifyEdgeFunction, submitVerificationRequest, downloadTextFile } from "@/services/api/verifier.service";
import { supabase } from "@/integrations/supabase/client";
import { SAMPLE_VPS, CREDENTIAL_TYPE_OPTIONS } from "@/data/VerifierSampleVPs";
import { motion, AnimatePresence } from "framer-motion";

interface VerifyViewProps {
  verifierId: string;
  onRecordsRefresh: () => void;
}

const VerifyView = ({ verifierId, onRecordsRefresh }: VerifyViewProps) => {
  const { toast } = useToast();

  // ── Verify mode state ──
  const [verifyMode, setVerifyMode] = useState<"vp" | "id">("vp");
  const [vpJson, setVpJson] = useState("");
  const [credentialId, setCredentialId] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [step, setStep] = useState<"input" | "result">("input");
  const lastVerifyTime = useRef(0);

  // ── Request state ──
  const [requestDid, setRequestDid] = useState("");
  const [requestType, setRequestType] = useState("");
  const [requestPurpose, setRequestPurpose] = useState("");
  const [sending, setSending] = useState(false);

  // ── Bulk state ──
  const [bulkOpen, setBulkOpen] = useState(false);

  useEffect(() => {
    const defaults = loadRequestDefaults();
    setRequestPurpose(defaults.defaultPurpose);
    setRequestType(defaults.defaultType);
  }, []);

  const verifyCredential = async () => {
    const now = Date.now();
    if (now - lastVerifyTime.current < 2000) {
      toast({ title: "Please wait", description: "You can verify again in a moment." });
      return;
    }
    lastVerifyTime.current = now;

    const body = verifyMode === "id"
      ? { credential_id: credentialId.trim() }
      : (() => {
          try {
            const parsed = JSON.parse(vpJson);
            return parsed.credential_id ? { credential_id: parsed.credential_id } : { vp_json: parsed };
          } catch {
            return { vp_json: vpJson };
          }
        })();

    setVerifying(true);
    setVerificationResult(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token ?? "";
      const result = await callVerifyEdgeFunction(body as any, token);
      if ((result as any).error) {
        toast({ title: "Verification failed", description: (result as any).error, variant: "destructive" });
      } else {
        setVerificationResult(result);
        setStep("result");
        toast({ title: (result as any).valid ? "Credential Valid" : "Credential Invalid" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to verify", variant: "destructive" });
    }
    setVerifying(false);
    onRecordsRefresh();
  };

  const applySample = (vp: string) => {
    setVerifyMode("vp");
    setVpJson(vp);
    setStep("input");
    setVerificationResult(null);
    toast({ title: "Sample loaded", description: "Replace the credential_id placeholder before verifying." });
  };

  const resetInput = () => {
    setVpJson("");
    setCredentialId("");
    setVerificationResult(null);
    setStep("input");
  };

  const downloadReport = () => {
    if (!verificationResult) return;
    downloadTextFile(
      `blockid-verification-${Date.now()}.json`,
      JSON.stringify(
        { report_type: "BlockID Verification Report", generated_at: new Date().toISOString(), result: verificationResult },
        null,
        2
      ),
      "application/json"
    );
    toast({ title: "Report downloaded" });
  };

  const sendRequest = async () => {
    if (!requestDid) return;
    setSending(true);
    try {
      await submitVerificationRequest(verifierId, requestDid, requestType || null, requestPurpose);
      toast({ title: "Request sent", description: `Presentation requested from ${requestDid.substring(0, 18)}…` });
      setRequestDid("");
      onRecordsRefresh();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSending(false);
  };

  const verifyInputFilled = verifyMode === "vp" ? vpJson.trim().length > 0 : credentialId.trim().length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-headline mb-1">Verify Credentials</h2>
            <p className="text-muted-foreground">Validate credentials, request presentations, and batch-check at scale</p>
          </div>
          <Button variant="outline" className="gap-2" onClick={() => setBulkOpen(true)}>
            <Layers className="h-4 w-4 text-verifier" /> Bulk Verify
          </Button>
        </div>
      </motion.div>

      <Tabs defaultValue="verify">
        <TabsList className="grid grid-cols-2 max-w-md">
          <TabsTrigger value="verify" className="gap-1.5"><Search className="h-3.5 w-3.5" /> Verify</TabsTrigger>
          <TabsTrigger value="request" className="gap-1.5"><Share2 className="h-3.5 w-3.5" /> Request</TabsTrigger>
        </TabsList>

        {/* ═══════════ VERIFY TAB ═══════════ */}
        <TabsContent value="verify" className="space-y-6">
          {/* Wizard steps indicator */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={`px-2.5 py-1 rounded-full border font-semibold ${step === "input" ? "bg-verifier/10 text-verifier border-verifier/30" : "text-emerald-600 border-emerald-500/30 bg-emerald-500/5"}`}>
              {step === "input" ? "1 · Input" : "✓ 1 · Input"}
            </span>
            <ChevronRight className="h-3 w-3" />
            <span className={`px-2.5 py-1 rounded-full border font-semibold ${step === "result" && verificationResult ? "bg-verifier/10 text-verifier border-verifier/30" : "border-border/50"}`}>
              2 · Result
            </span>
          </div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, duration: 0.3 }}>
            <Card className="solid-card">
              <CardContent className="pt-6 space-y-5">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg bg-verifier flex items-center justify-center">
                      <FileSearch className="h-4 w-4 text-[#030304]" />
                    </div>
                    <div>
                      <h3 className="font-display font-semibold text-foreground">Verify Credential</h3>
                      <p className="text-xs text-muted-foreground">AI analysis · hash integrity · revocation · on-chain anchor</p>
                    </div>
                  </div>

                  {/* Mode toggle */}
                  <div className="flex items-center gap-1 rounded-full border border-border bg-muted/30 p-0.5">
                    <button
                      onClick={() => setVerifyMode("vp")}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${verifyMode === "vp" ? "bg-verifier text-[#030304]" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      VP JSON
                    </button>
                    <button
                      onClick={() => setVerifyMode("id")}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${verifyMode === "id" ? "bg-verifier text-[#030304]" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      Credential ID
                    </button>
                  </div>
                </div>

                {verifyMode === "vp" ? (
                  <div className="space-y-2">
                    <Label>Verifiable Presentation (JSON)</Label>
                    <Textarea
                      value={vpJson}
                      onChange={(e) => { setVpJson(e.target.value); setVerificationResult(null); setStep("input"); }}
                      placeholder={"Paste a VP JSON here, or pick a sample below…"}
                      rows={7}
                      className="font-mono text-xs input-solid"
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Credential ID</Label>
                    <Input
                      value={credentialId}
                      onChange={(e) => { setCredentialId(e.target.value); setVerificationResult(null); setStep("input"); }}
                      placeholder="Paste a credential UUID from the registry…"
                      className="font-mono text-xs input-solid"
                    />
                  </div>
                )}

                {/* Sample library */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Wand2 className="h-3.5 w-3.5 text-verifier" /> Sample library
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {SAMPLE_VPS.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => applySample(s.vpJson)}
                        title={s.description}
                        className="text-[11px] px-3 py-1.5 rounded-full border border-border/60 bg-background hover:border-verifier/40 hover:text-verifier text-muted-foreground transition-colors"
                      >
                        {s.label}
                      </button>
                    ))}
                    <button
                      onClick={() => setVerifyMode("id")}
                      className="text-[11px] px-3 py-1.5 rounded-full border border-border/60 bg-background hover:border-verifier/40 hover:text-verifier text-muted-foreground transition-colors"
                    >
                      Verify by credential ID
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Info className="h-3 w-3" /> Samples are templates — replace the credential_id placeholder with a real one from your registry.
                  </p>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <Button className="btn-primary flex-1 sm:flex-none" onClick={verifyCredential} disabled={verifying || !verifyInputFilled}>
                    {verifying ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Verifying with AI…
                      </span>
                    ) : (
                      <span className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Verify Credential</span>
                    )}
                  </Button>
                  <Button variant="outline" onClick={resetInput} disabled={verifying || (!vpJson && !credentialId && !verificationResult)}>
                    <Trash2 className="h-4 w-4" /> Clear
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Result */}
          <AnimatePresence>
            {step === "result" && verificationResult && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <Card className="solid-card border-2" style={{ borderColor: verificationResult.valid ? "hsla(160 84% 39% / 0.4)" : "hsla(0 72% 51% / 0.4)" }}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between gap-2 mb-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        {verificationResult.valid ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        ) : (
                          <XCircle className="h-5 w-5 text-destructive" />
                        )}
                        Verification Report
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={downloadReport}>
                          <Download className="h-3.5 w-3.5" /> Report
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={() => { navigator.clipboard.writeText(JSON.stringify(verificationResult, null, 2)); toast({ title: "Copied" }); }}>
                          <Copy className="h-3.5 w-3.5" /> Copy JSON
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={() => { setVerificationResult(null); setStep("input"); }}>
                          <Link2 className="h-3.5 w-3.5" /> New verify
                        </Button>
                      </div>
                    </div>
                    <VerificationResultView result={verificationResult} />
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </TabsContent>

        {/* ═══════════ REQUEST TAB ═══════════ */}
        <TabsContent value="request" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Request form */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              <Card className="solid-card">
                <CardContent className="pt-6 space-y-5">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
                      <Share2 className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <h3 className="font-display font-semibold text-foreground">Request Presentation</h3>
                      <p className="text-xs text-muted-foreground">Ask a specific holder to present a credential</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Holder DID</Label>
                    <Input
                      value={requestDid}
                      onChange={(e) => setRequestDid(e.target.value)}
                      placeholder="did:ethr:sepolia:0x…"
                      className="font-mono text-xs input-solid"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Required Credential Type</Label>
                    <Select value={requestType} onValueChange={setRequestType}>
                      <SelectTrigger className="input-solid text-xs">
                        <SelectValue placeholder="Select type (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {CREDENTIAL_TYPE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Purpose</Label>
                    <Input
                      value={requestPurpose}
                      onChange={(e) => setRequestPurpose(e.target.value)}
                      placeholder="e.g., Employment verification"
                      className="input-solid text-xs"
                    />
                  </div>
                  <Button className="w-full btn-primary" onClick={sendRequest} disabled={sending || !requestDid}>
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Send Request
                  </Button>
                </CardContent>
              </Card>
            </motion.div>

            {/* OID4VP card */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.3 }}>
              <Card className="solid-card">
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg bg-holder flex items-center justify-center">
                      <ScanLine className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <h3 className="font-display font-semibold text-foreground">OID4VP Request</h3>
                      <p className="text-xs text-muted-foreground">Request credentials from external wallets via QR</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                    Generate an OpenID4VP presentation request as a scannable QR code. Compatible with Sphereon,
                    Walt.id, MATTR and other OID4VP wallets.
                  </p>
                  <div className="border rounded-lg p-4">
                    <OID4VPRequestDialog />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </TabsContent>
      </Tabs>

      <BulkVerifyDialog open={bulkOpen} onOpenChange={setBulkOpen} onRecordsRefresh={onRecordsRefresh} />
    </div>
  );
};

export default VerifyView;
