import { useState } from "react";
import { Link2, Copy, Clock, Check, QrCode, Eye, EyeOff } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ShareCredentialDialogProps {
  credentialId: string;
  credentialName: string;
  credentialFields?: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EXPIRY_OPTIONS = [
  { label: "1 hour", value: "1h", hours: 1 },
  { label: "24 hours", value: "24h", hours: 24 },
  { label: "7 days", value: "7d", hours: 168 },
  { label: "30 days", value: "30d", hours: 720 },
];

const ShareCredentialDialog = ({ credentialId, credentialName, credentialFields = [], open, onOpenChange }: ShareCredentialDialogProps) => {
  const [expiry, setExpiry] = useState("24h");
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [disclosedFields, setDisclosedFields] = useState<string[]>(credentialFields);
  const [selectiveMode, setSelectiveMode] = useState(false);
  const { toast } = useToast();

  const toggleField = (field: string) => {
    setDisclosedFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
    );
  };

  const generateLink = async () => {
    setLoading(true);
    try {
      const hours = EXPIRY_OPTIONS.find((o) => o.value === expiry)!.hours;
      const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const insertData: any = {
        credential_id: credentialId,
        holder_id: user.id,
        expires_at: expiresAt,
      };

      if (selectiveMode && disclosedFields.length > 0 && disclosedFields.length < credentialFields.length) {
        insertData.disclosed_fields = disclosedFields;
      }

      const { data, error } = await supabase
        .from("credential_shares")
        .insert(insertData)
        .select("token")
        .single();

      if (error) throw error;
      const link = `${window.location.origin}/shared/${data.token}`;
      setShareLink(link);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    toast({ title: "Link copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) {
      setShareLink(null);
      setCopied(false);
      setSelectiveMode(false);
      setDisclosedFields(credentialFields);
    }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            Share Credential
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Generate a time-limited link for <span className="font-semibold text-foreground">{credentialName}</span>
          </p>

          {!shareLink ? (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Link expires in
                </label>
                <Select value={expiry} onValueChange={setExpiry}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXPIRY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Selective Disclosure */}
              {credentialFields.length > 0 && (
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      setSelectiveMode(!selectiveMode);
                      if (!selectiveMode) setDisclosedFields(credentialFields);
                    }}
                    className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
                  >
                    {selectiveMode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    Selective Disclosure {selectiveMode ? "(enabled)" : ""}
                  </button>
                  {selectiveMode && (
                    <div className="bg-muted rounded-lg p-3 space-y-2">
                      <p className="text-xs text-muted-foreground">Choose which fields to reveal:</p>
                      {credentialFields.map((field) => (
                        <label key={field} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={disclosedFields.includes(field)}
                            onCheckedChange={() => toggleField(field)}
                          />
                          <span className="capitalize text-foreground">{field.replace(/([A-Z])/g, " $1")}</span>
                        </label>
                      ))}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {disclosedFields.length}/{credentialFields.length} fields will be shared
                      </p>
                    </div>
                  )}
                </div>
              )}

              <Button variant="holder" className="w-full" onClick={generateLink} disabled={loading}>
                {loading ? "Generating..." : selectiveMode ? `Share ${disclosedFields.length} Fields` : "Generate Share Link"}
              </Button>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-border/50">
                  <QRCodeSVG value={shareLink} size={180} level="M" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5">
                <QrCode className="h-3.5 w-3.5" /> Scan to view credential
              </p>
              {selectiveMode && disclosedFields.length < credentialFields.length && (
                <p className="text-xs text-center text-primary">
                  🔒 Selective disclosure: {disclosedFields.length}/{credentialFields.length} fields shared
                </p>
              )}
              <div className="bg-muted rounded-lg p-3 flex items-center gap-2">
                <p className="text-xs font-mono text-foreground break-all flex-1">{shareLink}</p>
                <Button size="icon" variant="ghost" className="shrink-0" onClick={copyLink}>
                  {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                This link expires in {EXPIRY_OPTIONS.find((o) => o.value === expiry)?.label}
              </p>
              <Button variant="outline" className="w-full" onClick={() => setShareLink(null)}>
                Generate Another Link
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ShareCredentialDialog;
