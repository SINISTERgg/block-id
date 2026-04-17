import { useRef, useState } from "react";
import { Search, Share2, CheckCircle2, XCircle, Link2, Copy, Download, Loader2, PenTool, QrCode, FileSearch } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import OID4VPRequestDialog from "@/components/OID4VPRequestDialog";
import CredentialAIAssistant from "@/components/CredentialAIAssistant";
import { useToast } from "@/hooks/use-toast";
import { callVerifyEdgeFunction, submitVerificationRequest } from "@/services/api/verifier.service";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";

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
        toast({ title: (result as any).valid ? "Credential Valid" : "Credential Invalid" });
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
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-8"
      >
        <h2 className="text-headline mb-2">Verify Credentials</h2>
        <p className="text-muted-foreground">Validate credentials and request presentations from holders</p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          <Card className="solid-card overflow-hidden">
            <CardContent className="pt-6">
              <Button 
                variant="ghost" 
                className="w-full h-auto p-0 hover:bg-transparent" 
                onClick={() => setIsVerifyDialogOpen(true)}
              >
                <div className="flex items-center gap-4 text-left w-full">
                  <div className="w-12 h-12 bg-verifier rounded-lg flex items-center justify-center">
                    <Search className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Verify Credential</h3>
                    <p className="text-sm text-muted-foreground">Paste a VP to check validity with AI analysis</p>
                  </div>
                </div>
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
        >
          <Card className="solid-card overflow-hidden">
            <CardContent className="pt-6">
              <Button 
                variant="ghost" 
                className="w-full h-auto p-0 hover:bg-transparent" 
                onClick={() => setIsRequestDialogOpen(true)}
              >
                <div className="flex items-center gap-4 text-left w-full">
                  <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
                    <Share2 className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Request Presentation</h3>
                    <p className="text-sm text-muted-foreground">Request specific credentials from a holder</p>
                  </div>
                </div>
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.3 }}
        >
          <Card className="solid-card overflow-hidden">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-holder rounded-lg flex items-center justify-center">
                  <QrCode className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground">OID4VP Request</h3>
                  <p className="text-sm text-muted-foreground mb-3">Create QR code request</p>
                  <OID4VPRequestDialog />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <Dialog open={isVerifyDialogOpen} onOpenChange={(o) => { setIsVerifyDialogOpen(o); if (!o) { setVerificationResult(null); setVpJson(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              <FileSearch className="h-5 w-5 text-verifier" />
              Verify Credential
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="space-y-2">
              <Label>Verifiable Presentation (JSON)</Label>
              <Textarea 
                value={vpJson} 
                onChange={(e) => setVpJson(e.target.value)} 
                placeholder="Paste the VP JSON here..." 
                rows={6} 
                className="font-mono text-xs input-solid" 
              />
            </div>
            <Button 
              className="w-full btn-primary" 
              onClick={verifyCredential} 
              disabled={verifying || !vpJson.trim()}
            >
              {verifying ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Verifying with AI...
                </span>
              ) : "Verify Credential"}
            </Button>
            
            <AnimatePresence>
              {verificationResult && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-4 border-t border-border pt-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {verificationResult.valid ? (
                        <>
                          <CheckCircle2 className="h-6 w-6 text-green-500" />
                          <span className="font-display font-semibold text-lg text-green-600">Valid Credential</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="h-6 w-6 text-destructive" />
                          <span className="font-display font-semibold text-lg text-destructive">Invalid Credential</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={copyResult}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={downloadResult}>
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-3">
                    <div className={`p-3 rounded-lg text-center ${verificationResult.hash_integrity ? "bg-green-500/10" : "bg-destructive/10"}`}>
                      <p className="text-xs text-muted-foreground">Hash Integrity</p>
                      <p className={`font-semibold ${verificationResult.hash_integrity ? "text-green-600" : "text-destructive"}`}>
                        {verificationResult.hash_integrity ? "Valid" : "Tampered"}
                      </p>
                    </div>
                    <div className={`p-3 rounded-lg text-center ${verificationResult.not_revoked ? "bg-green-500/10" : "bg-destructive/10"}`}>
                      <p className="text-xs text-muted-foreground">Revocation</p>
                      <p className={`font-semibold ${verificationResult.not_revoked ? "text-green-600" : "text-destructive"}`}>
                        {verificationResult.not_revoked ? "Active" : "Revoked"}
                      </p>
                    </div>
                    <div className={`p-3 rounded-lg text-center ${verificationResult.not_expired !== false ? "bg-green-500/10" : "bg-destructive/10"}`}>
                      <p className="text-xs text-muted-foreground">Expiry</p>
                      <p className={`font-semibold ${verificationResult.not_expired !== false ? "text-green-600" : "text-destructive"}`}>
                        {verificationResult.not_expired !== false ? "Valid" : "Expired"}
                      </p>
                    </div>
                  </div>

                  {verificationResult.expires_at && (
                    <p className="text-xs text-muted-foreground">
                      Expires: {new Date(verificationResult.expires_at).toLocaleDateString()}
                    </p>
                  )}
                  
                  {verificationResult.blockchain_anchor && (
                    <div className="bg-muted rounded-lg p-3">
                      <p className="font-mono text-sm flex items-center gap-2 text-verifier">
                        <Link2 className="h-4 w-4" />
                        Anchor: {verificationResult.blockchain_anchor}
                      </p>
                    </div>
                  )}
                  
                  {verificationResult.blockchain_info && (
                    <div className="bg-muted rounded-lg p-3 space-y-1">
                      <p className="font-mono text-sm text-verifier flex items-center gap-2">
                        <Link2 className="h-4 w-4" /> Blockchain Verified
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">Tx: {verificationResult.blockchain_info.txHash?.substring(0, 22)}...</p>
                      <p className="font-mono text-xs text-muted-foreground">Block: #{verificationResult.blockchain_info.blockNumber}</p>
                      <p className="font-mono text-xs text-muted-foreground">Network: {verificationResult.blockchain_info.network}</p>
                    </div>
                  )}
                  
                  {verificationResult.signature && (
                    <div className="bg-muted rounded-lg p-3">
                      <p className="font-mono text-sm flex items-center gap-2">
                        <PenTool className="h-4 w-4" />
                        {verificationResult.signature.signed ? (
                          <span className="text-green-600">Wallet Signed ({verificationResult.signature.type})</span>
                        ) : (
                          <span className="text-muted-foreground">Simulated proof ({verificationResult.signature.type})</span>
                        )}
                      </p>
                      {verificationResult.signature.signer && (
                        <p className="font-mono text-xs text-muted-foreground mt-1">Signer: {verificationResult.signature.signer}</p>
                      )}
                    </div>
                  )}
                  
                  {verificationResult.ai_analysis?.dimensions && (
                    <CredentialAIAssistant 
                      analysis={verificationResult.ai_analysis} 
                      verificationContext={{ 
                        ai_analysis: verificationResult.ai_analysis, 
                        valid: verificationResult.valid, 
                        hash_integrity: verificationResult.hash_integrity, 
                        not_revoked: verificationResult.not_revoked, 
                        not_expired: verificationResult.not_expired, 
                        blockchain_verified: verificationResult.blockchain_verified, 
                        expires_at: verificationResult.expires_at, 
                        blockchain_anchor: verificationResult.blockchain_anchor, 
                        signature: verificationResult.signature 
                      }} 
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isRequestDialogOpen} onOpenChange={setIsRequestDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              <Share2 className="h-5 w-5 text-primary" />
              Request Presentation
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="space-y-2">
              <Label>Holder DID</Label>
              <Input 
                value={requestDid} 
                onChange={(e) => setRequestDid(e.target.value)} 
                placeholder="did:ethr:sepolia:0x..." 
                className="input-solid"
              />
            </div>
            <div className="space-y-2">
              <Label>Required Credential Type</Label>
              <Select value={requestType} onValueChange={setRequestType}>
                <SelectTrigger className="input-solid">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="degree">Degree</SelectItem>
                  <SelectItem value="diploma">Diploma</SelectItem>
                  <SelectItem value="certificate">Certificate</SelectItem>
                  <SelectItem value="transcript">Transcript</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Purpose</Label>
              <Input 
                value={requestPurpose} 
                onChange={(e) => setRequestPurpose(e.target.value)} 
                placeholder="e.g., Employment verification" 
                className="input-solid"
              />
            </div>
            <Button className="w-full btn-primary" onClick={sendRequest}>
              Send Request
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default VerifyView;
