import { useState } from "react";
import { Smartphone, Copy, Check, QrCode, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { QRCodeSVG } from "qrcode.react";

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
    <div className="space-y-3">
      <Button 
        variant="outline" 
        className="w-full justify-start gap-2" 
        onClick={() => setOpen(true)}
      >
        <QrCode className="h-4 w-4" /> Create QR Offer
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="bg-card rounded-lg border border-border p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {!offer ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display font-semibold text-lg flex items-center gap-2">
                    <Smartphone className="h-5 w-5 text-primary" /> OpenID4VCI Offer
                  </h3>
                  <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>✕</Button>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium">Schema</Label>
                    <Select value={selectedSchema} onValueChange={(v) => { setSelectedSchema(v); setCredentialData({}); }}>
                      <SelectTrigger className="w-full mt-1">
                        <SelectValue placeholder="Select schema" />
                      </SelectTrigger>
                      <SelectContent>
                        {latestSchemas.length === 0 ? (
                          <SelectItem value="none" disabled>No schemas available</SelectItem>
                        ) : (
                          latestSchemas.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name} v{s.version}</SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-sm font-medium">Holder DID (optional)</Label>
                    <Input 
                      value={holderDid} 
                      onChange={(e) => setHolderDid(e.target.value)} 
                      placeholder="did:key:... or leave blank"
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Leave empty for any wallet to claim</p>
                  </div>

                  <Button 
                    className="w-full btn-primary" 
                    onClick={generateOffer} 
                    disabled={generating || !selectedSchema || latestSchemas.length === 0}
                  >
                    {generating ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
                    ) : "Generate Offer"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display font-semibold text-lg">Offer Created</h3>
                  <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>✕</Button>
                </div>

                <div className="flex justify-center p-4 bg-muted rounded-lg mb-4">
                  <QRCodeSVG value={offer.offer_url} size={200} level="M" />
                </div>

                <p className="text-sm text-center text-muted-foreground mb-4">
                  Scan with an OID4VCI-compatible wallet
                </p>

                <div className="bg-muted rounded-lg p-3 space-y-2 mb-4">
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

                <Button variant="ghost" className="w-full text-sm mt-3" onClick={reset}>Create Another Offer</Button>

                <p className="text-xs text-muted-foreground text-center mt-3">
                  Compatible with Sphereon, Walt.id, MATTR, and other OID4VCI wallets
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default OID4VCIOfferDialog;
