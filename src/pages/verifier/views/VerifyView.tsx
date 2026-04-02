import { useRef, useState } from "react";
import { Search, Share2, CheckCircle2, XCircle, Link2, Copy, Download, Loader2, PenTool } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import OID4VPRequestDialog from "@/components/OID4VPRequestDialog";
import CredentialAIAssistant from "@/components/CredentialAIAssistant";
import { useToast } from "@/hooks/use-toast";
import { callVerifyEdgeFunction, submitVerificationRequest } from "@/services/api/verifier.service";
import { supabase } from "@/integrations/supabase/client";

interface VerifyViewProps {
  verifierId: string;
  onRecordsRefresh: () => void;
}

const VerifyView = ({ verifierId, onRecordsRefresh }: VerifyViewProps) => {
  const { toast } = useToast();
  const [isVerifyDialogOpen, setIsVerifyDialogOpen] = useState(false);
  const [isRequestDialogOpen, setIsRequestDialogOpen] = useState(false);
  const [vpJson, setVpJson] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [requestDid, setRequestDid] = useState("");
  const [requestType, setRequestType] = useState("");
  const [requestPurpose, setRequestPurpose] = useState("");
  const lastVerifyTime = useRef(0);

  const verifyCredential = async () => {
    if (!vpJson.trim()) return;
    const now = Date.now();
    if (now - lastVerifyTime.current < 2000) {
      toast({ title: "Please wait", description: "You can verify again in a moment." });
      return;
    }
    lastVerifyTime.current = now;
    setVerifying(true);
    setVerificationResult(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token ?? "";
      let body: { credential_id: string } | { vp_json: unknown };
      try {
        const parsed = JSON.parse(vpJson);
        body = parsed.credential_id ? { credential_id: parsed.credential_id } : { vp_json: parsed };
      } catch { body = { vp_json: vpJson }; }
      const result = await callVerifyEdgeFunction(body, token);
      if ((result as any).error) {
        toast({ title: "Verification failed", description: (result as any).error, variant: "destructive" });
      } else {
        setVerificationResult(result);
        toast({ title: (result as any).valid ? "Credential Valid ✓" : "Credential Invalid ✗" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to verify", variant: "destructive" });
    }
    setVerifying(false);
    onRecordsRefresh();
  };

  const copyResult = () => {
    if (!verificationResult) return;
    navigator.clipboard.writeText(JSON.stringify(verificationResult, null, 2));
    toast({ title: "Copied to clipboard", description: "Verification report copied as JSON." });
  };

  const downloadResult = () => {
    if (!verificationResult) return;
    const blob = new Blob([JSON.stringify({ report_type: "BlockID Verification Report", generated_at: new Date().toISOString(), result: verificationResult }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `blockid-verification-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Report downloaded" });
  };

  const sendRequest = async () => {
    if (!requestDid) return;
    try {
      await submitVerificationRequest(verifierId, requestDid, requestType || null, requestPurpose);
      toast({ title: "Request sent" });
      setIsRequestDialogOpen(false);
      setRequestDid(""); setRequestType(""); setRequestPurpose("");
      onRecordsRefresh();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <>
      <h2 className="text-xl font-display font-semibold text-foreground">Verify Credentials</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Verify dialog card */}
        <Card className="border-dashed"><CardContent className="pt-6">
          <Dialog open={isVerifyDialogOpen} onOpenChange={(o) => { setIsVerifyDialogOpen(o); if (!o) setVerificationResult(null); }}>
            <DialogTrigger asChild>
              <button className="w-full text-left group">
                <div className="flex items-center gap-3 mb-2"><Search className="h-5 w-5 text-muted-foreground group-hover:text-verifier transition-colors" /><h3 className="font-display font-semibold text-foreground">Verify Credential</h3></div>
                <p className="text-sm text-muted-foreground">Paste a VP to check validity with AI analysis</p>
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle className="font-display">Verify Credential</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div><Label>Verifiable Presentation (JSON)</Label><Textarea value={vpJson} onChange={(e) => setVpJson(e.target.value)} placeholder="Paste the VP JSON here..." rows={6} className="font-mono text-xs" /></div>
                <Button variant="verifier" className="w-full" onClick={verifyCredential} disabled={verifying}>
                  {verifying ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Verifying with AI...</> : "Verify"}
                </Button>
                {verificationResult && (
                  <div className="space-y-3 border-t border-border pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {verificationResult.valid ? <CheckCircle2 className="h-5 w-5 text-accent-foreground" /> : <XCircle className="h-5 w-5 text-destructive" />}
                        <span className="font-display font-semibold">{verificationResult.valid ? "Valid Credential" : "Invalid Credential"}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copyResult}><Copy className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={downloadResult}><Download className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                    <div className="text-xs space-y-1 text-muted-foreground">
                      <p>Hash Integrity: {verificationResult.hash_integrity ? "✓ Valid" : "✗ Tampered"}</p>
                      <p>Not Revoked: {verificationResult.not_revoked ? "✓ Active" : "✗ Revoked"}</p>
                      <p>Not Expired: {verificationResult.not_expired !== undefined ? (verificationResult.not_expired ? "✓ Valid" : "✗ Expired") : "✓ No expiry"}</p>
                      {verificationResult.expires_at && <p>Expires: {new Date(verificationResult.expires_at).toLocaleDateString()}</p>}
                      {verificationResult.blockchain_anchor && <p className="font-mono flex items-center gap-1"><Link2 className="h-3 w-3 text-primary" /> Anchor: {verificationResult.blockchain_anchor}</p>}
                      {verificationResult.blockchain_info && (
                        <div className="bg-muted rounded p-2 mt-1">
                          <p className="font-mono text-primary">⛓ Blockchain Verified</p>
                          <p className="font-mono">Tx: {verificationResult.blockchain_info.txHash?.substring(0, 22)}...</p>
                          <p className="font-mono">Block: #{verificationResult.blockchain_info.blockNumber}</p>
                          <p className="font-mono">Network: {verificationResult.blockchain_info.network}</p>
                        </div>
                      )}
                      {verificationResult.signature && (
                        <div className="bg-muted rounded p-2 mt-1">
                          <p className="font-mono flex items-center gap-1">
                            <PenTool className="h-3 w-3" />
                            {verificationResult.signature.signed ? <span className="text-accent-foreground">✓ Wallet Signed ({verificationResult.signature.type})</span> : <span className="text-muted-foreground">Simulated proof ({verificationResult.signature.type})</span>}
                          </p>
                          {verificationResult.signature.signer && <p className="font-mono text-xs">Signer: {verificationResult.signature.signer}</p>}
                        </div>
                      )}
                    </div>
                    {verificationResult.ai_analysis?.dimensions && (
                      <CredentialAIAssistant analysis={verificationResult.ai_analysis} verificationContext={{ ai_analysis: verificationResult.ai_analysis, valid: verificationResult.valid, hash_integrity: verificationResult.hash_integrity, not_revoked: verificationResult.not_revoked, not_expired: verificationResult.not_expired, blockchain_verified: verificationResult.blockchain_verified, expires_at: verificationResult.expires_at, blockchain_anchor: verificationResult.blockchain_anchor, signature: verificationResult.signature }} />
                    )}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </CardContent></Card>

        {/* Request presentation card */}
        <Card className="border-dashed"><CardContent className="pt-6">
          <Dialog open={isRequestDialogOpen} onOpenChange={setIsRequestDialogOpen}>
            <DialogTrigger asChild>
              <button className="w-full text-left group">
                <div className="flex items-center gap-3 mb-2"><Share2 className="h-5 w-5 text-muted-foreground group-hover:text-verifier transition-colors" /><h3 className="font-display font-semibold text-foreground">Request Presentation</h3></div>
                <p className="text-sm text-muted-foreground">Request specific credentials from a holder</p>
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="font-display">Request Presentation</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div><Label>Holder DID</Label><Input value={requestDid} onChange={(e) => setRequestDid(e.target.value)} placeholder="did:decentraid:..." /></div>
                <div><Label>Required Credential Type</Label>
                  <Select value={requestType} onValueChange={setRequestType}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent><SelectItem value="degree">Degree</SelectItem><SelectItem value="diploma">Diploma</SelectItem><SelectItem value="certificate">Certificate</SelectItem><SelectItem value="transcript">Transcript</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label>Purpose</Label><Input value={requestPurpose} onChange={(e) => setRequestPurpose(e.target.value)} placeholder="e.g., Employment verification" /></div>
                <Button variant="verifier" className="w-full" onClick={sendRequest}>Send Request</Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardContent></Card>

        <Card className="border-dashed"><CardContent className="pt-6"><OID4VPRequestDialog /></CardContent></Card>
      </div>
    </>
  );
};

export default VerifyView;
