import { useState, useEffect } from "react";
import { Building2, ShieldCheck, User, Globe, Save } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { CREDENTIAL_TYPE_OPTIONS } from "@/data/VerifierSampleVPs";
import { loadRequestDefaults, saveRequestDefaults, type VerifierRequestDefaults } from "@/lib/verifierDefaults";
import { motion } from "framer-motion";

const VerifierOrgCard = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [defaults, setDefaults] = useState<VerifierRequestDefaults>(loadRequestDefaults);
  const [draft, setDraft] = useState<VerifierRequestDefaults>(defaults);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(defaults);
  }, [defaults]);

  const save = () => {
    saveRequestDefaults(draft);
    setDefaults(draft);
    setSaved(true);
    toast({ title: "Defaults saved", description: "New requests will be prefilled with these settings." });
    setTimeout(() => setSaved(false), 2000);
  };

  const orgName = profile?.organization || "Your Organization";
  const memberName = profile?.full_name || "Verifier";
  const did = profile?.did;

  return (
    <Card className="solid-card overflow-hidden">
      <div className="h-1.5 bg-gradient-to-r from-[#F7931A] to-[#FFD600]" />
      <CardContent className="pt-5 space-y-5">
        {/* Org identity */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#F7931A] to-[#FFD600] flex items-center justify-center shadow-[0_0_20px_-5px_rgba(247,147,26,0.5)]">
            <Building2 className="h-6 w-6 text-[#030304]" />
          </div>
          <div className="min-w-0">
            <p className="font-display font-bold text-foreground truncate">{orgName}</p>
            <p className="text-xs text-muted-foreground truncate">Verifier organization</p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-semibold">
            <ShieldCheck className="h-3 w-3" /> VERIFIED
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 text-xs">
          <div className="p-2.5 rounded-md bg-muted/40 border border-border/40 flex items-center gap-2">
            <User className="h-3.5 w-3.5 text-verifier shrink-0" />
            <span className="text-muted-foreground">Contact:</span>
            <span className="text-foreground font-medium truncate">{memberName}</span>
          </div>
          <div className="p-2.5 rounded-md bg-muted/40 border border-border/40 flex items-center gap-2">
            <Globe className="h-3.5 w-3.5 text-verifier shrink-0" />
            <span className="text-muted-foreground">DID:</span>
            <span className="font-mono text-foreground truncate">{did || "Not set"}</span>
          </div>
        </div>

        {/* Request defaults */}
        <div className="border-t border-border/40 pt-4 space-y-3">
          <p className="text-xs font-semibold text-foreground">Default request settings</p>
          <div className="space-y-1.5">
            <Label className="text-[11px]">Default purpose</Label>
            <Input
              value={draft.defaultPurpose}
              onChange={(e) => setDraft((p) => ({ ...p, defaultPurpose: e.target.value }))}
              placeholder="e.g., Employment verification"
              className="text-xs input-solid h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px]">Default credential type</Label>
            <Select value={draft.defaultType} onValueChange={(v) => setDraft((p) => ({ ...p, defaultType: v }))}>
              <SelectTrigger className="text-xs h-9 input-solid">
                <SelectValue placeholder="No default" />
              </SelectTrigger>
              <SelectContent>
                {CREDENTIAL_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" className="w-full gap-1.5" variant="verifier" onClick={save}>
            <Save className="h-3.5 w-3.5" /> {saved ? "Saved" : "Save defaults"}
          </Button>
          <p className="text-[10px] text-muted-foreground text-center">
            This identity is shown to holders when you request their credentials.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default VerifierOrgCard;
