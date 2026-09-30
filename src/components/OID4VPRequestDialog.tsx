import { useState, useEffect, useRef } from "react";
import { ScanLine, Copy, Check, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { QRCodeSVG } from "qrcode.react";

const OID4VPRequestDialog = () => {
  const [open, setOpen] = useState(false);
  const [credentialType, setCredentialType] = useState("");
  const [purpose, setPurpose] = useState("");
  const [generating, setGenerating] = useState(false);
  const [request, setRequest] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<string>("pending");
  const [responseData, setResponseData] = useState<any>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  // The request's presentation definition filters on `$.type` containing the
  // chosen `credential_type`. That has to be a value that actually exists in
  // `credential_schemas`, so the options are read from the database rather than
  // hardcoded — the old fixed list (degree/diploma/transcript) matched nothing
  // this deployment issues, so every generated request was unsatisfiable.
  const [credentialTypes, setCredentialTypes] = useState<{ type: string; label: string }[]>([]);
  const [typesLoading, setTypesLoading] = useState(false);

  // Held in a ref so the fetch effect does not depend on `toast` identity —
  // adding it to the dep array would re-run the query whenever it changed.
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setTypesLoading(true);
    supabase
      .from("credential_schemas")
      .select("credential_type, name, is_latest")
      .eq("is_latest", true)
      .order("credential_type", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toastRef.current({
            title: "Could not load credential types",
            description: error.message,
            variant: "destructive",
          });
          setCredentialTypes([]);
        } else {
          const seen = new Map<string, string>();
          for (const row of (data ?? []) as { credential_type?: string; name?: string }[]) {
            const type = row?.credential_type;
            if (typeof type === "string" && type && !seen.has(type)) {
              seen.set(type, row?.name || type);
            }
          }
          setCredentialTypes([...seen.entries()].map(([type, label]) => ({ type, label })));
        }
        setTypesLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Re-fetch each time the dialog opens so newly created schemas show up.
  }, [open]);

  const generateRequest = async () => {
    if (!credentialType) return;
    setGenerating(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oid4vp/request`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.session?.access_token}`,
          },
          body: JSON.stringify({
            credential_types: [credentialType],
            purpose: purpose || "Verification",
            expires_in_minutes: 15,
          }),
        }
      );
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      setRequest(result);
      toast({ title: "Presentation request created" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setGenerating(false);
  };

  // Poll for response
  useEffect(() => {
    if (!request?.session_id || status !== "pending") return;

    pollRef.current = setInterval(async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oid4vp/status?session_id=${request.session_id}`,
          { headers: { Authorization: `Bearer ${sess?.session?.access_token}` } }
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "completed") {
          setStatus("completed");
          setResponseData(data.response_data);
          toast({ title: "Presentation received!" });
          if (pollRef.current) clearInterval(pollRef.current);
        } else if (data.status === "expired" || new Date(data.expires_at) < new Date()) {
          setStatus("expired");
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch { /* ignore polling errors */ }
    }, 3000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [request?.session_id, status]);

  const copyUrl = () => {
    navigator.clipboard.writeText(request?.request_url || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const reset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setRequest(null);
    setCredentialType("");
    setPurpose("");
    setStatus("pending");
    setResponseData(null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <button className="w-full text-left group">
          <div className="flex items-center gap-3 mb-2">
            <ScanLine className="h-5 w-5 text-muted-foreground group-hover:text-verifier transition-colors" />
            <h3 className="font-display font-semibold text-foreground">OID4VP Request</h3>
          </div>
          <p className="text-sm text-muted-foreground">Request credentials from external wallets via OpenID4VP</p>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-primary" /> OpenID4VP Presentation Request
          </DialogTitle>
        </DialogHeader>

        {!request ? (
          <div className="space-y-4 pt-2">
            <div>
              <Label>Credential Type</Label>
              <Select value={credentialType} onValueChange={setCredentialType} disabled={typesLoading || credentialTypes.length === 0}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      typesLoading
                        ? "Loading types…"
                        : credentialTypes.length === 0
                          ? "No schemas published yet"
                          : "Select required type"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {credentialTypes.map((t) => (
                    <SelectItem key={t.type} value={t.type}>
                      {t.label} ({t.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Matched against the credential's <span className="font-mono">type</span>, so the
                options come from schemas that actually exist in this deployment.
              </p>
            </div>

            <div>
              <Label>Purpose</Label>
              <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g., Employment verification" />
            </div>

            <Button variant="verifier" className="w-full" onClick={generateRequest} disabled={generating || !credentialType}>
              {generating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</> : "Create Request"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            {status === "completed" ? (
              <div className="space-y-3">
                <div className="flex items-center justify-center gap-2 py-4">
                  <CheckCircle2 className="h-8 w-8 text-primary" />
                  <span className="text-lg font-display font-semibold text-foreground">Presentation Received</span>
                </div>
                {responseData?.verification && (
                  <div className="bg-muted rounded-lg p-3 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Holder</span>
                      <span className="font-mono text-xs text-foreground">{responseData.verification.holder?.substring(0, 24)}...</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Credentials</span>
                      <span className="text-foreground">{responseData.verification.credentials_count}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Format</span>
                      <span className="text-foreground">{responseData.verification.format}</span>
                    </div>
                  </div>
                )}
                <Button variant="ghost" className="w-full" onClick={reset}>New Request</Button>
              </div>
            ) : status === "expired" ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <XCircle className="h-8 w-8 text-destructive" />
                <span className="text-foreground font-medium">Request Expired</span>
                <Button variant="ghost" onClick={reset}>Try Again</Button>
              </div>
            ) : (
              <>
                <div className="flex justify-center p-4 bg-background rounded-lg border border-border">
                  <QRCodeSVG value={request.request_url} size={200} level="M" />
                </div>

                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Waiting for wallet response...
                </div>

                <div className="bg-muted rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Protocol</span>
                    <span className="text-xs text-foreground">OpenID4VP</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Response Mode</span>
                    <span className="text-xs text-foreground">direct_post</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Expires</span>
                    <span className="text-xs text-foreground">{new Date(request.expires_at).toLocaleTimeString()}</span>
                  </div>
                </div>

                <Button variant="outline" className="w-full gap-2" onClick={copyUrl}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied" : "Copy Request URI"}
                </Button>

                <p className="text-[10px] text-muted-foreground text-center">
                  Scan with Sphereon, Walt.id, MATTR or other OID4VP-compatible wallets
                </p>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default OID4VPRequestDialog;
