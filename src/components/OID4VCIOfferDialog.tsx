import { useState } from "react";
import { Smartphone, Copy, Check, QrCode, ExternalLink, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { QRCodeSVG } from "qrcode.react";
import SchemaForm from "@/components/SchemaForm";

interface Schema {
  id: string;
  name: string;
  credential_type: string;
  fields: any;
  version: number;
  is_latest: boolean;
}

interface OID4VCIOfferDialogProps {
  schemas: Schema[];
}

const OID4VCIOfferDialog = ({ schemas }: OID4VCIOfferDialogProps) => {
  const [open, setOpen] = useState(false);
  const [selectedSchema, setSelectedSchema] = useState("");
  const [holderDid, setHolderDid] = useState("");
  const [credentialData, setCredentialData] = useState<Record<string, any>>({});
  const [generating, setGenerating] = useState(false);
  const [offer, setOffer] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const selectedSchemaObj = schemas.find((s) => s.id === selectedSchema);
  const latestSchemas = schemas.filter((s) => s.is_latest);

  const generateOffer = async () => {
    if (!selectedSchema) return;
    setGenerating(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oid4vci/offer`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.session?.access_token}`,
          },
          body: JSON.stringify({
            schema_id: selectedSchema,
            credential_data: credentialData,
            holder_did: holderDid || undefined,
            expires_in_minutes: 30,
          }),
        }
      );
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      setOffer(result);
      toast({ title: "Credential offer created" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setGenerating(false);
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(offer?.offer_url || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied to clipboard" });
  };

  const reset = () => {
    setOffer(null);
    setSelectedSchema("");
    setHolderDid("");
    setCredentialData({});
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <button className="w-full text-left group">
          <div className="flex items-center gap-3 mb-2">
            <Smartphone className="h-5 w-5 text-muted-foreground group-hover:text-issuer transition-colors" />
            <h3 className="font-display font-semibold text-foreground">OID4VCI Offer</h3>
          </div>
          <p className="text-sm text-muted-foreground">Issue credentials to external wallets via OpenID4VCI</p>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" /> OpenID4VCI Credential Offer
          </DialogTitle>
        </DialogHeader>

        {!offer ? (
          <div className="space-y-4 pt-2">
            <div>
              <Label>Schema</Label>
              <Select value={selectedSchema} onValueChange={(v) => { setSelectedSchema(v); setCredentialData({}); }}>
                <SelectTrigger><SelectValue placeholder="Select schema" /></SelectTrigger>
                <SelectContent>
                  {latestSchemas.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} v{s.version}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Holder DID (optional)</Label>
              <Input value={holderDid} onChange={(e) => setHolderDid(e.target.value)} placeholder="did:key:... or leave blank" />
              <p className="text-[10px] text-muted-foreground mt-1">Leave empty for any wallet to claim</p>
            </div>

            {selectedSchemaObj && (
              <SchemaForm
                fields={selectedSchemaObj.fields as any[]}
                value={credentialData}
                onChange={setCredentialData}
              />
            )}

            <Button variant="issuer" className="w-full" onClick={generateOffer} disabled={generating || !selectedSchema}>
              {generating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</> : "Generate Offer"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="flex justify-center p-4 bg-background rounded-lg border border-border">
              <QRCodeSVG value={offer.offer_url} size={200} level="M" />
            </div>

            <p className="text-sm text-center text-muted-foreground">
              Scan with an OID4VCI-compatible wallet
            </p>

            <div className="bg-muted rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Pre-Authorized Code</span>
                <span className="text-xs font-mono text-foreground">{offer.pre_authorized_code?.substring(0, 16)}...</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Expires</span>
                <span className="text-xs text-foreground">{new Date(offer.expires_at).toLocaleTimeString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Format</span>
                <span className="text-xs text-foreground">OID4VCI (Pre-Auth Code)</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 gap-2" onClick={copyUrl}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy URI"}
              </Button>
              <Button variant="outline" className="flex-1 gap-2" onClick={() => window.open(offer.offer_url, "_blank")}>
                <ExternalLink className="h-4 w-4" /> Open
              </Button>
            </div>

            <Button variant="ghost" className="w-full text-sm" onClick={reset}>Create Another Offer</Button>

            <p className="text-[10px] text-muted-foreground text-center">
              Compatible with Sphereon, Walt.id, MATTR, and other OID4VCI wallets
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default OID4VCIOfferDialog;
