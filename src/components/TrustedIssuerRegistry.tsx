import { useState, useEffect } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Building2,
  Plus,
  CheckCircle2,
  Clock,
  XCircle,
  ExternalLink,
  Search,
  ThumbsUp,
  ThumbsDown,
  ListFilter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { canReviewRegistry } from "@/lib/permissions";
import { motion, AnimatePresence } from "framer-motion";

interface TrustedIssuer {
  id: string;
  issuer_did: string;
  issuer_user_id: string | null;
  organization_name: string;
  domain: string | null;
  verification_status: string;
  trust_level: string;
  verified_at: string | null;
  verified_by: string | null;
  created_at: string;
}

const STATUS_CONFIG: Record<string, {
  icon: React.ElementType;
  label: string;
  badgeClass: string;
  rowBorder: string;
  dotClass: string;
  statAccent: string;
}> = {
  verified: {
    icon: CheckCircle2,
    label: "Verified",
    badgeClass: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    rowBorder: "border-l-emerald-400/60",
    dotClass: "bg-emerald-500",
    statAccent: "hsl(160 60% 45%)",
  },
  pending: {
    icon: Clock,
    label: "Pending",
    badgeClass: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    rowBorder: "border-l-amber-400/60",
    dotClass: "bg-amber-500",
    statAccent: "hsl(38 92% 50%)",
  },
  rejected: {
    icon: XCircle,
    label: "Rejected",
    badgeClass: "bg-red-500/10 text-red-600 border-red-500/20",
    rowBorder: "border-l-red-400/60",
    dotClass: "bg-red-500",
    statAccent: "hsl(0 72% 51%)",
  },
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

  const [pendingAction, setPendingAction] = useState<{
    issuer: TrustedIssuer;
    type: "accept" | "reject";
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const { user, role } = useAuth();
  const { toast } = useToast();
  const canReview = canReviewRegistry(role);
  const [reviewerNames, setReviewerNames] = useState<Record<string, string>>({});

  const loadIssuers = async () => {
    const { data } = await supabase
      .from("trusted_issuers")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) {
      setIssuers(data as any);
      const reviewerIds = [...new Set((data as any[]).map((i: any) => i.verified_by).filter(Boolean))];
      if (reviewerIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", reviewerIds);
        if (profiles) {
          const nameMap: Record<string, string> = {};
          profiles.forEach((p: any) => { nameMap[p.user_id] = p.full_name ?? "Unknown"; });
          setReviewerNames(nameMap);
        }
      }
    }
  };

  useEffect(() => { loadIssuers(); }, []);

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
    loadIssuers();
  };

  const handleConfirmAction = async () => {
    if (!pendingAction || !user) return;
    setActionLoading(true);
    const { issuer, type } = pendingAction;
    const newStatus = type === "accept" ? "verified" : "rejected";
    const profileStatus = type === "accept" ? "approved" : "rejected";

    try {
      const updatePayload: any = { verification_status: newStatus, verified_by: user.id };
      if (type === "accept") updatePayload.verified_at = new Date().toISOString();

      const { error } = await supabase
        .from("trusted_issuers")
        .update(updatePayload)
        .eq("id", issuer.id);

      if (error) throw error;

      // Also update the user's profile account_status if they have one
      if (issuer.issuer_user_id) {
        await supabase
          .from("profiles")
          .update({ account_status: profileStatus })
          .eq("user_id", issuer.issuer_user_id);
      }

      await supabase.from("audit_logs").insert({
        user_id: user.id,
        action: type === "accept" ? "issuer_accepted" : "issuer_rejected",
        entity_type: "trusted_issuer",
        entity_id: issuer.id,
        metadata: { organization_name: issuer.organization_name, issuer_did: issuer.issuer_did },
      } as any);

      toast({
        title: type === "accept" ? "Issuer accepted ✓" : "Issuer rejected",
        description: `${issuer.organization_name} has been ${newStatus}.`,
        variant: type === "reject" ? "destructive" : "default",
      });
      loadIssuers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
      setPendingAction(null);
    }
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
  const pendingCount = issuers.filter((i) => i.verification_status === "pending").length;
  const rejectedCount = issuers.filter((i) => i.verification_status === "rejected").length;

  // ── Compact mode ──
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

  // ── Full mode ──
  return (
    <div className="space-y-4">
      {/* Stats — glassmorphic with status-color top strip */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Registered", value: issuers.length, accent: "hsl(var(--primary))", iconColor: "text-primary", icon: Building2 },
          { label: "Verified", value: verifiedCount, accent: STATUS_CONFIG.verified.statAccent, iconColor: "text-emerald-500", icon: ShieldCheck },
          { label: "Pending Review", value: pendingCount, accent: STATUS_CONFIG.pending.statAccent, iconColor: "text-amber-500", icon: Clock },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            whileHover={{ y: -2 }}
            className="stat-card p-4"
            style={{ "--stat-accent": s.accent } as React.CSSProperties}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ backgroundColor: `${s.accent}18` }}>
                <s.icon className={`h-3 w-3 ${s.iconColor}`} />
              </div>
            </div>
            <p className="text-2xl font-display font-bold text-foreground">{s.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Search + Register */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, DID, or domain..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 rounded-xl"
          />
        </div>
        <Dialog open={isRegisterOpen} onOpenChange={setIsRegisterOpen}>
          <DialogTrigger asChild>
            <Button variant="issuer" size="sm" className="gap-1.5 rounded-xl shrink-0">
              <Plus className="h-3.5 w-3.5" /> Register
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">Register as Trusted Issuer</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Organization Name</Label>
                <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="e.g., University of..." className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label>Domain (optional)</Label>
                <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="e.g., university.edu" className="rounded-xl" />
              </div>
              <div className="text-xs text-muted-foreground bg-muted rounded-lg p-3 font-mono">
                Your DID: did:decentraid:issuer:{user?.id?.substring(0, 8)}...
              </div>
              <Button variant="issuer" className="w-full rounded-xl" onClick={registerIssuer}>
                Submit Registration
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Issuer List */}
      <Card className="border-border/50 overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="font-display text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" /> Issuer Registry
            </CardTitle>
            <div className="flex items-center gap-2">
              {canReview && pendingCount > 0 && (
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping-slow" />
                  {pendingCount} pending
                </span>
              )}
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <ListFilter className="h-3 w-3" /> {filtered.length} shown
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {filtered.length === 0 ? (
            <div className="py-16 text-center">
              <ShieldAlert className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No issuers found.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              <AnimatePresence>
                {filtered.map((issuer, idx) => {
                  const cfg = STATUS_CONFIG[issuer.verification_status] || STATUS_CONFIG.pending;
                  const StatusIcon = cfg.icon;
                  const isPending = issuer.verification_status === "pending";

                  return (
                    <motion.div
                      key={issuer.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.04 }}
                      className={`flex items-center justify-between px-6 py-4 hover:bg-muted/20 transition-colors border-l-2 ${cfg.rowBorder}`}
                    >
                      {/* Left — org info */}
                      <div className="flex items-center gap-4 min-w-0">
                        {/* Status icon bubble */}
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          issuer.verification_status === "verified"
                            ? "bg-emerald-500/10"
                            : issuer.verification_status === "rejected"
                            ? "bg-red-500/10"
                            : "bg-amber-500/10"
                        }`}>
                          {issuer.verification_status === "verified" ? (
                            <ShieldCheck className="h-5 w-5 text-emerald-500" />
                          ) : issuer.verification_status === "rejected" ? (
                            <XCircle className="h-5 w-5 text-red-500" />
                          ) : (
                            <ShieldAlert className="h-5 w-5 text-amber-500" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{issuer.organization_name}</p>
                          <p className="text-xs font-mono text-muted-foreground truncate max-w-[220px] mt-0.5">
                            {issuer.issuer_did}
                          </p>
                          {issuer.domain && (
                            <p className="text-xs text-primary flex items-center gap-1 mt-0.5">
                              <ExternalLink className="h-2.5 w-2.5" /> {issuer.domain}
                            </p>
                          )}
                          {issuer.verified_by && issuer.verification_status !== "pending" && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Reviewed by <span className="font-medium text-foreground">{reviewerNames[issuer.verified_by] ?? "…"}</span>
                              {issuer.verified_at && (
                                <span className="ml-1 text-muted-foreground/70">
                                  · {new Date(issuer.verified_at).toLocaleDateString()}
                                </span>
                              )}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right — badges + actions */}
                      <div className="flex items-center gap-2 shrink-0 ml-4">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize border border-border/50">
                          {issuer.trust_level}
                        </span>

                        {/* Status badge with pulsing dot for pending */}
                        <span className={`text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5 border font-medium ${cfg.badgeClass}`}>
                          {isPending ? (
                            <span className="relative flex items-center justify-center w-2 h-2">
                              <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping-slow ${cfg.dotClass}`} />
                              <span className={`relative inline-flex rounded-full w-1.5 h-1.5 ${cfg.dotClass}`} />
                            </span>
                          ) : (
                            <StatusIcon className="h-3 w-3" />
                          )}
                          {cfg.label}
                        </span>

                        {/* Accept / Reject — only on pending for reviewers */}
                        {canReview && isPending && (
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="sm"
                              className="h-7 px-2.5 text-xs gap-1 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg"
                              variant="ghost"
                              onClick={() => setPendingAction({ issuer, type: "accept" })}
                            >
                              <ThumbsUp className="h-3 w-3" /> Accept
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 px-2.5 text-xs gap-1 bg-red-500/10 text-red-600 hover:bg-red-500/20 border border-red-500/20 rounded-lg"
                              variant="ghost"
                              onClick={() => setPendingAction({ issuer, type: "reject" })}
                            >
                              <ThumbsDown className="h-3 w-3" /> Reject
                            </Button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirm accept/reject dialog */}
      <AlertDialog open={!!pendingAction} onOpenChange={(o) => !o && setPendingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction?.type === "accept" ? "Accept Issuer?" : "Reject Issuer?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.type === "accept"
                ? `This will verify "${pendingAction?.issuer.organization_name}" and allow them to issue credentials on the platform.`
                : `This will reject "${pendingAction?.issuer.organization_name}". They will not be able to issue credentials until re-reviewed.`}
              <br />
              <span className="text-xs font-mono mt-2 block text-muted-foreground">
                {pendingAction?.issuer.issuer_did}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={actionLoading}
              className={
                pendingAction?.type === "reject"
                  ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                  : "bg-emerald-500 hover:bg-emerald-600 text-white"
              }
              onClick={handleConfirmAction}
            >
              {actionLoading
                ? "Processing..."
                : pendingAction?.type === "accept"
                ? "Accept Issuer"
                : "Reject Issuer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TrustedIssuerRegistry;
