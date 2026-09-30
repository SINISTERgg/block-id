import { useState, useRef, useEffect } from "react";
import { Smartphone, Camera, Loader2, CheckCircle2, XCircle, AlertCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { claimCredential, type IssuedCredential } from "@/lib/oid4vci";
import { useToast } from "@/hooks/use-toast";

interface OID4VCIReceiveDialogProps {
  /** The holder's own DID, so the credential is bound to them rather than to
   *  the `did:key:external-wallet` fallback the issuer would otherwise use. */
  holderDid?: string;
  onCredentialReceived?: () => void;
}

const OID4VCIReceiveDialog = ({ holderDid, onCredentialReceived }: OID4VCIReceiveDialogProps) => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"select" | "scanning" | "processing" | "success" | "error">("select");
  const [manualCode, setManualCode] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receivedCredential, setReceivedCredential] = useState<IssuedCredential | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (mode === "scanning" && videoRef.current) {
      startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [mode]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err: any) {
      setError("Camera access denied. Please use manual code entry.");
      setMode("select");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const processCode = async (raw: string) => {
    setProcessing(true);
    setError(null);
    setMode("processing");

    try {
      const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oid4vci`;
      // Two steps: /token trades the pre-authorized code for a bearer token,
      // then /credential is called with it. Previously this skipped /token and
      // sent the Supabase session JWT, which the endpoint rejects.
      const result = await claimCredential(baseUrl, raw, { did: holderDid });
      setReceivedCredential(result);
      setMode("success");
      toast({ title: "Credential received successfully!" });
      onCredentialReceived?.();
    } catch (err: any) {
      setError(err?.message || "Failed to receive credential");
      setMode("error");
      toast({ title: "Error", description: err?.message, variant: "destructive" });
    }

    setProcessing(false);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      processCode(manualCode.trim());
    }
  };

  const reset = () => {
    setMode("select");
    setManualCode("");
    setError(null);
    setReceivedCredential(null);
    stopCamera();
  };

  return (
    <div className="space-y-3">
      <Button 
        variant="outline" 
        className="w-full justify-start gap-2" 
        onClick={() => setOpen(true)}
      >
        <Smartphone className="h-4 w-4" /> Receive Credential
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="bg-card rounded-lg border border-border p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            
            {mode === "select" && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display font-semibold text-lg flex items-center gap-2">
                    <Smartphone className="h-5 w-5 text-primary" /> Receive Credential
                  </h3>
                  <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>✕</Button>
                </div>

                <p className="text-sm text-muted-foreground mb-4">
                  Scan a QR code or paste an OID4VCI offer to receive a credential. Both a
                  full <span className="font-mono text-xs">openid-credential-offer://</span> URI
                  and a bare pre-authorized code are accepted.
                </p>

                <div className="space-y-3">
                  <Button 
                    className="w-full gap-2" 
                    onClick={() => setMode("scanning")}
                  >
                    <Camera className="h-4 w-4" /> Scan QR Code
                  </Button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">or</span>
                    </div>
                  </div>

                  <form onSubmit={handleManualSubmit}>
                    <Label className="text-sm font-medium">Paste offer or code</Label>
                    <Input
                      value={manualCode}
                      onChange={(e) => setManualCode(e.target.value)}
                      placeholder="openid-credential-offer://… or paste the code"
                      className="mt-1 mb-3 font-mono text-sm"
                    />

                    <Button 
                      type="submit" 
                      variant="outline" 
                      className="w-full" 
                      disabled={!manualCode.trim()}
                    >
                      Submit Code
                    </Button>
                  </form>
                </div>
              </>
            )}

            {mode === "scanning" && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display font-semibold text-lg flex items-center gap-2">
                    <Camera className="h-5 w-5 text-primary" /> Scan QR Code
                  </h3>
                  <Button variant="ghost" size="sm" onClick={reset}>← Back</Button>
                </div>

                <div className="relative bg-black rounded-lg overflow-hidden mb-4">
                  <video 
                    ref={videoRef} 
                    className="w-full h-64 object-cover"
                    playsInline
                    muted
                  />
                  <canvas ref={canvasRef} className="hidden" />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-48 h-48 border-2 border-white rounded-lg" />
                  </div>
                </div>

                <p className="text-sm text-muted-foreground text-center mb-4">
                  Point your camera at the QR code
                </p>

                <div className="space-y-3">
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => {
                      // For now, use manual entry since QR scanning requires additional library
                      setMode("select");
                    }}
                  >
                    Use Manual Entry Instead
                  </Button>
                  
                  <form onSubmit={handleManualSubmit} className="space-y-2">
                    <Label className="text-sm font-medium">Or paste offer / code</Label>
                    <Input
                      value={manualCode}
                      onChange={(e) => setManualCode(e.target.value)}
                      placeholder="Paste the offer URI or code…"
                      className="font-mono text-sm"
                    />

                    <Button 
                      type="submit" 
                      className="w-full btn-primary" 
                      disabled={!manualCode.trim() || processing}
                    >
                      {processing ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</>
                      ) : "Submit Code"}
                    </Button>
                  </form>
                </div>
              </>
            )}

            {mode === "processing" && (
              <>
                <div className="flex flex-col items-center justify-center py-8">
                  <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
                  <h3 className="font-display font-semibold text-lg mb-2">Processing...</h3>
                  <p className="text-sm text-muted-foreground">Receiving your credential</p>
                </div>
              </>
            )}

            {mode === "success" && receivedCredential && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display font-semibold text-lg flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" /> Credential Received!
                  </h3>
                  <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>✕</Button>
                </div>

                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center">
                      <CheckCircle2 className="h-6 w-6 text-white" />
                    </div>
                    <div className="min-w-0">
                      {/* The endpoint returns the VC itself, not a
                          {schema_name, credential_type, issued_at} summary —
                          reading those fields rendered a blank card. */}
                      <p className="font-semibold text-foreground truncate">
                        {receivedCredential.credential.credentialSchema?.type
                          || receivedCredential.credential.type?.slice(1).join(", ")
                          || "Verifiable Credential"}
                      </p>
                      <p className="text-sm text-muted-foreground font-mono truncate">
                        {receivedCredential.credential.issuer}
                      </p>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    {receivedCredential.credential.issuanceDate && (
                      <p>Issued: {new Date(receivedCredential.credential.issuanceDate).toLocaleString()}</p>
                    )}
                    {receivedCredential.credential.expirationDate && (
                      <p>Expires: {new Date(receivedCredential.credential.expirationDate).toLocaleString()}</p>
                    )}
                    {receivedCredential.credential.credentialSubject?.id && (
                      <p className="font-mono truncate">
                        Holder: {receivedCredential.credential.credentialSubject.id}
                      </p>
                    )}
                    <p>Format: {receivedCredential.format}</p>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground text-center mb-4">
                  Your credential has been added to your wallet.
                </p>

                {!holderDid && (
                  <p className="flex items-start gap-2 text-xs text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded-md p-3 mb-4">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    No holder DID was supplied, so the issuer bound this credential to
                    its fallback identifier. Connect your wallet and retry to bind it to you.
                  </p>
                )}

                <p className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 border border-border rounded-md p-3 mb-4">
                  <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
                  Issued as an unsigned LDP credential. The issuer holds no signing key,
                  so this is a valid data payload without a cryptographic proof.
                </p>

                <Button className="w-full" onClick={() => setOpen(false)}>
                  Done
                </Button>
              </>
            )}

            {mode === "error" && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display font-semibold text-lg flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-destructive" /> Error
                  </h3>
                  <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>✕</Button>
                </div>

                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="h-6 w-6 text-destructive shrink-0" />
                    <p className="text-sm text-destructive">{error || "Failed to receive credential"}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <Button className="w-full" onClick={reset}>
                    Try Again
                  </Button>
                  <Button variant="outline" className="w-full" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default OID4VCIReceiveDialog;
