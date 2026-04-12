import { useState, useEffect } from "react";
import { Shield, Trash2, FileCheck, Download, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface ConsentRecord {
  id: string;
  consent_type: string;
  granted: boolean;
  purpose: string;
  created_at: string;
  revoked_at: string | null;
}

const CONSENT_TYPES = [
  { type: "data_storage", label: "Data Storage", purpose: "Store your credentials and profile data on the platform." },
  { type: "credential_sharing", label: "Credential Sharing", purpose: "Allow sharing credentials with verifiers via time-limited links." },
  { type: "biometric_data", label: "Biometric Data", purpose: "Store biometric authentication data (WebAuthn, face capture)." },
  { type: "analytics", label: "Analytics", purpose: "Collect usage data to improve the platform experience." },
  { type: "blockchain_anchoring", label: "Blockchain Anchoring", purpose: "Anchor credential hashes on the Ethereum Sepolia network." },
];

const PrivacyCenter = () => {
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [deletionReason, setDeletionReason] = useState("");
  const [isDeletionOpen, setIsDeletionOpen] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) return;
    const fetchConsents = async () => {
      const { data } = await supabase
        .from("consent_records")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (data) setConsents(data as any);

      // Check pending deletion
      const { data: del } = await supabase
        .from("data_deletion_requests")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .limit(1);
      if (del && del.length > 0) setPendingDeletion(true);
    };
    fetchConsents();
  }, [user]);

  const getConsentStatus = (type: string): boolean => {
    const latest = consents.find((c) => c.consent_type === type && !c.revoked_at);
    return latest?.granted ?? false;
  };

  const toggleConsent = async (type: string, granted: boolean) => {
    if (!user) return;

    if (!granted) {
      // Revoke existing consent
      const existing = consents.find((c) => c.consent_type === type && !c.revoked_at && c.granted);
      if (existing) {
        await supabase
          .from("consent_records")
          .update({ revoked_at: new Date().toISOString() } as any)
          .eq("id", existing.id);
      }
    }

    const purpose = CONSENT_TYPES.find((c) => c.type === type)?.purpose || "";
    await supabase.from("consent_records").insert({
      user_id: user.id,
      consent_type: type,
      granted,
      purpose,
    } as any);

    // Refresh
    const { data } = await supabase
      .from("consent_records")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (data) setConsents(data as any);

    toast({ title: granted ? "Consent granted" : "Consent revoked" });
  };

  const requestDeletion = async () => {
    if (!user) return;
    await supabase.from("data_deletion_requests").insert({
      user_id: user.id,
      reason: deletionReason || null,
    } as any);
    setPendingDeletion(true);
    setIsDeletionOpen(false);
    setDeletionReason("");
    toast({ title: "Deletion request submitted", description: "Your data deletion request is being processed." });
  };

  const exportData = async () => {
    if (!user) return;
    const [profileRes, credsRes, consentsRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", user.id).single(),
      supabase.from("credentials").select("*").eq("holder_id", user.id),
      supabase.from("consent_records").select("*").eq("user_id", user.id),
    ]);

    const exportPayload = {
      exported_at: new Date().toISOString(),
      format: "GDPR_Data_Export",
      profile: profileRes.data,
      credentials: credsRes.data,
      consent_records: consentsRes.data,
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `decentraid-data-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Data exported" });
  };

  return (
    <div className="space-y-6">
      {/* Consent Management */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-primary" /> Consent Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {CONSENT_TYPES.map((ct) => (
            <div key={ct.type} className="flex items-center justify-between p-3 rounded-lg border border-border/50">
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{ct.label}</p>
                <p className="text-xs text-muted-foreground">{ct.purpose}</p>
              </div>
              <Switch
                checked={getConsentStatus(ct.type)}
                onCheckedChange={(checked) => toggleConsent(ct.type, checked)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Data Rights */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" /> Your Data Rights
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
            <div>
              <p className="text-sm font-medium text-foreground">Export Your Data</p>
              <p className="text-xs text-muted-foreground">Download all your data in JSON format (GDPR Art. 20)</p>
            </div>
            <Button variant="outline" size="sm" onClick={exportData} className="gap-1">
              <Download className="h-3 w-3" /> Export
            </Button>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border border-destructive/30">
            <div>
              <p className="text-sm font-medium text-foreground">Request Data Deletion</p>
              <p className="text-xs text-muted-foreground">Right to erasure (GDPR Art. 17)</p>
            </div>
            {pendingDeletion ? (
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Pending</span>
            ) : (
              <Dialog open={isDeletionOpen} onOpenChange={setIsDeletionOpen}>
                <DialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="gap-1">
                    <Trash2 className="h-3 w-3" /> Delete
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="font-display flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-destructive" /> Request Data Deletion
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-2">
                    <p className="text-sm text-muted-foreground">
                      This will request the deletion of all your personal data, including your profile, credentials, and biometric data.
                      <strong className="text-destructive"> This action cannot be undone.</strong>
                    </p>
                    <div>
                      <label className="text-sm font-medium">Reason (optional)</label>
                      <Textarea
                        value={deletionReason}
                        onChange={(e) => setDeletionReason(e.target.value)}
                        placeholder="Why are you requesting data deletion?"
                        rows={3}
                      />
                    </div>
                    <Button variant="destructive" className="w-full" onClick={requestDeletion}>
                      Confirm Deletion Request
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Consent History */}
      {consents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-sm">Consent History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-48 overflow-auto">
              {consents.slice(0, 20).map((c) => (
                <div key={c.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/30 last:border-0">
                  <span className="text-muted-foreground capitalize">{c.consent_type.replace(/_/g, " ")}</span>
                  <div className="flex items-center gap-2">
                    <span className={c.granted ? "text-accent-foreground" : "text-destructive"}>
                      {c.granted ? "Granted" : "Revoked"}
                    </span>
                    <span className="text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PrivacyCenter;
