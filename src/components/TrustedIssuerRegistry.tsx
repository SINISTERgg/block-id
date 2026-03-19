import { useState, useEffect } from "react";
import { ShieldCheck, ShieldAlert, Building2, Plus, CheckCircle2, Clock, XCircle, ExternalLink, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface TrustedIssuer {
  id: string;
  issuer_did: string;
  issuer_user_id: string | null;
  organization_name: string;
  domain: string | null;
  verification_status: string;
  trust_level: string;
  verified_at: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<string, { icon: any; color: string }> = {
  verified: { icon: CheckCircle2, color: "text-accent-foreground bg-accent" },
  pending: { icon: Clock, color: "text-muted-foreground bg-muted" },
  rejected: { icon: XCircle, color: "text-destructive bg-destructive/10" },
};

interface TrustedIssuerRegistryProps {
  compact?: boolean;
}

const TrustedIssuerRegistry = ({ compact = false }: TrustedIssuerRegistryProps) => {
  const [issuers, setIssuers] = useState<TrustedIssuer[]>([]);
  const [search, setSearch] = useState("");
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [domain, setDomain] = useState("");
  const { user, profile } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("trusted_issuers")
        .select("*")
        .order("created_at", { ascending: false });
      if (data) setIssuers(data as any);
    };
    fetch();
  }, []);

  const registerIssuer = async () => {
    if (!user || !orgName) return;
    const issuerDid = `did:decentraid:issuer:${user.id}`;
    const { error } = await supabase.from("trusted_issuers").insert({
      issuer_did: issuerDid,
      issuer_user_id: user.id,
      organization_name: orgName,
      domain: domain || null,
    } as any);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Registration submitted", description: "Your issuer registration is pending review." });
    setIsRegisterOpen(false);
    setOrgName("");
    setDomain("");
    // Refresh
    const { data } = await supabase.from("trusted_issuers").select("*").order("created_at", { ascending: false });
    if (data) setIssuers(data as any);
  };

  const filtered = search.trim()
    ? issuers.filter(
        (i) =>
          i.organization_name.toLowerCase().includes(search.toLowerCase()) ||
          i.issuer_did.toLowerCase().includes(search.toLowerCase()) ||
          i.domain?.toLowerCase().includes(search.toLowerCase())
      )
    : issuers;

  const verifiedCount = issuers.filter((i) => i.verification_status === "verified").length;

  if (compact) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-sm flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" /> Trusted Issuers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-display font-bold text-foreground">{verifiedCount}</p>
          <p className="text-xs text-muted-foreground">{issuers.length} total registered</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-display font-bold text-foreground">{issuers.length}</p>
            <p className="text-xs text-muted-foreground">Total Registered</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-display font-bold text-accent-foreground">{verifiedCount}</p>
            <p className="text-xs text-muted-foreground">Verified</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-display font-bold text-muted-foreground">
              {issuers.filter((i) => i.verification_status === "pending").length}
            </p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
      </div>

      {/* Register + Search */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search issuers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Dialog open={isRegisterOpen} onOpenChange={setIsRegisterOpen}>
          <DialogTrigger asChild>
            <Button variant="issuer" size="sm" className="gap-1">
              <Plus className="h-3 w-3" /> Register
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">Register as Trusted Issuer</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>Organization Name</Label>
                <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="e.g., University of..." />
              </div>
              <div>
                <Label>Domain (optional)</Label>
                <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="e.g., university.edu" />
              </div>
              <div className="text-xs text-muted-foreground bg-muted rounded-lg p-2">
                Your DID: did:decentraid:issuer:{user?.id?.substring(0, 8)}...
              </div>
              <Button variant="issuer" className="w-full" onClick={registerIssuer}>
                Submit Registration
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Issuer List */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" /> Issuer Registry
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No issuers registered yet.</div>
          ) : (
            <div className="space-y-2">
              {filtered.map((issuer) => {
                const statusInfo = STATUS_STYLES[issuer.verification_status] || STATUS_STYLES.pending;
                const StatusIcon = statusInfo.icon;
                return (
                  <div key={issuer.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                        {issuer.verification_status === "verified" ? (
                          <ShieldCheck className="h-5 w-5 text-accent-foreground" />
                        ) : (
                          <ShieldAlert className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{issuer.organization_name}</p>
                        <p className="text-xs font-mono text-muted-foreground truncate max-w-[200px]">{issuer.issuer_did}</p>
                        {issuer.domain && (
                          <p className="text-xs text-primary flex items-center gap-1">
                            <ExternalLink className="h-2.5 w-2.5" /> {issuer.domain}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded-full capitalize bg-muted text-muted-foreground">
                        {issuer.trust_level}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${statusInfo.color}`}>
                        <StatusIcon className="h-3 w-3" />
                        {issuer.verification_status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TrustedIssuerRegistry;
