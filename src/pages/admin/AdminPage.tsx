import { useState, useEffect, useCallback } from "react";
import {
  Users,
  Shield,
  Building2,
  Settings,
  Crown,
  Home,
  LogOut,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  RefreshCw,
  ListFilter,
  ChevronLeft,
  ChevronRight,
  ScrollText,
  Download,
  Mail,
  UserPlus,
  ShieldCheck,
  ShieldAlert,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import ThemeToggle from "@/components/ui/ThemeToggle";
import NotificationBell from "@/components/NotificationBell";

interface PendingUser {
  user_id: string;
  full_name: string;
  organization: string | null;
  account_status: string;
  created_at: string;
  role: string;
  email: string;
}

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

interface OrgMember {
  user_id: string;
  full_name: string;
  organization: string;
  role: string;
}

interface AuditEntry {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

const ADMIN_ACTION_LABELS: Record<string, { label: string; color: string }> = {
  account_approved: { label: "Approved", color: "bg-emerald-500/10 text-emerald-600" },
  account_rejected: { label: "Rejected", color: "bg-red-500/10 text-red-600" },
  account_reinstated: { label: "Reinstated", color: "bg-amber-500/10 text-amber-600" },
  admin_access_denied: { label: "Access Denied", color: "bg-red-500/10 text-red-600" },
};

const ITEMS_PER_PAGE = 15;

const callAdminAPI = async (path: string, options: RequestInit = {}) => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || "";
  const resp = await fetch(`${supabaseUrl}/functions/v1/admin-users${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "x-admin-key": "blockid-admin-secret-2024",
      ...(options.headers || {}),
    },
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || "API request failed");
  return data;
};

const STATUS_CONFIG: Record<string, {
  icon: React.ElementType;
  label: string;
  badgeClass: string;
  dotClass: string;
  rowBorder: string;
}> = {
  pending: {
    icon: Clock,
    label: "Pending",
    badgeClass: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    dotClass: "bg-amber-500",
    rowBorder: "border-l-amber-400/60",
  },
  approved: {
    icon: CheckCircle2,
    label: "Approved",
    badgeClass: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    dotClass: "bg-emerald-500",
    rowBorder: "border-l-emerald-400/60",
  },
  rejected: {
    icon: XCircle,
    label: "Rejected",
    badgeClass: "bg-red-500/10 text-red-600 border-red-500/20",
    dotClass: "bg-red-500",
    rowBorder: "border-l-red-400/60",
  },
};

const ISSUER_STATUS_CONFIG: Record<string, {
  icon: React.ElementType;
  label: string;
  badgeClass: string;
  rowBorder: string;
  dotClass: string;
}> = {
  verified: {
    icon: CheckCircle2,
    label: "Verified",
    badgeClass: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    rowBorder: "border-l-emerald-400/60",
    dotClass: "bg-emerald-500",
  },
  pending: {
    icon: Clock,
    label: "Pending",
    badgeClass: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    rowBorder: "border-l-amber-400/60",
    dotClass: "bg-amber-500",
  },
  rejected: {
    icon: XCircle,
    label: "Rejected",
    badgeClass: "bg-red-500/10 text-red-600 border-red-500/20",
    rowBorder: "border-l-red-400/60",
    dotClass: "bg-red-500",
  },
};

const AdminPage = () => {
  const { user, profile, role, signOut, refreshProfile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [users, setUsers] = useState<PendingUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userFilter, setUserFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [pendingUserAction, setPendingUserAction] = useState<{
    user: PendingUser;
    type: "approve" | "reject" | "reinstate";
  } | null>(null);
  const [userActionLoading, setUserActionLoading] = useState(false);
  const [userPage, setUserPage] = useState(1);

  const [trustedIssuers, setTrustedIssuers] = useState<TrustedIssuer[]>([]);
  const [loadingIssuers, setLoadingIssuers] = useState(false);
  const [issuerSearch, setIssuerSearch] = useState("");
  const [issuerFilter, setIssuerFilter] = useState<"all" | "verified" | "pending" | "rejected">("all");
  type IssuerFilterType = "all" | "verified" | "pending" | "rejected";
  const [pendingIssuerAction, setPendingIssuerAction] = useState<{
    issuer: TrustedIssuer;
    type: "accept" | "reject";
  } | null>(null);
  const [issuerActionLoading, setIssuerActionLoading] = useState(false);

  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);

  const [orgName, setOrgName] = useState(profile?.organization ?? "");
  const [savingSettings, setSavingSettings] = useState(false);

  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const result = await callAdminAPI("?action=list", { method: "GET" });
      setUsers(result.users || []);
    } catch (err) {
      console.error("Failed to fetch users:", err);
      toast({
        title: "Failed to load users",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }, [toast]);

  const fetchTrustedIssuers = useCallback(async () => {
    setLoadingIssuers(true);
    try {
      const { data } = await supabase
        .from("trusted_issuers")
        .select("*")
        .order("created_at", { ascending: false });
      setTrustedIssuers((data as TrustedIssuer[]) || []);
    } catch (err) {
      console.error("Failed to fetch issuers:", err);
    } finally {
      setLoadingIssuers(false);
    }
  }, []);

  const fetchMembers = useCallback(async () => {
    setLoadingMembers(true);
    try {
      const orgNameVal = profile?.organization;
      if (!orgNameVal) { setMembers([]); return; }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, organization")
        .eq("organization", orgNameVal);

      if (!profiles || profiles.length === 0) { setMembers([]); return; }

      const userIds = profiles.map((p) => p.user_id);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);

      if (!roles) return;

      const combined: OrgMember[] = roles.map((r) => {
        const p = profiles.find((p) => p.user_id === r.user_id);
        return {
          user_id: r.user_id,
          full_name: p?.full_name ?? "Unknown",
          organization: p?.organization ?? "",
          role: r.role,
        };
      });
      setMembers(combined);
    } catch (err) {
      console.error("Failed to fetch members:", err);
    } finally {
      setLoadingMembers(false);
    }
  }, [profile?.organization]);

  const fetchAuditLogs = useCallback(async () => {
    setLoadingAudit(true);
    try {
      const { data } = await supabase
        .from("audit_logs")
        .select("*")
        .in("action", ["account_approved", "account_rejected", "account_reinstated", "admin_access_denied"])
        .order("created_at", { ascending: false })
        .limit(50);
      setAuditLogs((data as AuditEntry[]) || []);
    } catch {
      setAuditLogs([]);
    } finally {
      setLoadingAudit(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchTrustedIssuers();
    fetchMembers();
    fetchAuditLogs();
  }, [fetchUsers, fetchTrustedIssuers, fetchMembers, fetchAuditLogs]);

  useEffect(() => {
    setOrgName(profile?.organization ?? "");
  }, [profile?.organization]);

  useEffect(() => {
    const channel = supabase
      .channel("admin-profiles-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        fetchUsers();
        fetchMembers();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchUsers, fetchMembers]);

  const exportUsersCSV = () => {
    if (filteredUsers.length === 0) return;
    const headers = ["Name", "Email", "Organization", "Role", "Status", "Registered"];
    const rows = filteredUsers.map((u) => [
      u.full_name,
      u.email,
      u.organization || "",
      u.role,
      u.account_status,
      new Date(u.created_at).toISOString(),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `blockid-users-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exported", description: `${filteredUsers.length} user records exported.` });
  };

  const handleUserAction = async () => {
    if (!pendingUserAction) return;
    setUserActionLoading(true);

    const newStatus = pendingUserAction.type === "reject" ? "rejected" : "approved";
    const actionLabel = pendingUserAction.type === "approve" ? "approved" : pendingUserAction.type === "reject" ? "rejected" : "reinstated";

    try {
      await callAdminAPI("", {
        method: "POST",
        body: JSON.stringify({
          user_id: pendingUserAction.user.user_id,
          new_status: newStatus,
        }),
      });

      toast({
        title: `User ${actionLabel}`,
        description: `${pendingUserAction.user.full_name} has been ${actionLabel} successfully.`,
      });

      await fetchUsers();
      await fetchAuditLogs();
    } catch (err) {
      console.error("Action failed:", err);
      toast({
        title: "Action failed",
        description: err instanceof Error ? err.message : "Could not update user status.",
        variant: "destructive",
      });
    } finally {
      setUserActionLoading(false);
      setPendingUserAction(null);
    }
  };

  const handleIssuerAction = async () => {
    if (!pendingIssuerAction) return;
    setIssuerActionLoading(true);

    const newStatus = pendingIssuerAction.type === "accept" ? "verified" : "rejected";
    const profileStatus = pendingIssuerAction.type === "accept" ? "approved" : "rejected";

    try {
      const { error } = await supabase
        .from("trusted_issuers")
        .update({ 
          verification_status: newStatus,
          verified_at: newStatus === "verified" ? new Date().toISOString() : null,
          verified_by: newStatus === "verified" ? user?.id : null,
        })
        .eq("id", pendingIssuerAction.issuer.id);

      if (error) throw error;

      // Also update the user's profile account_status if they have one
      if (pendingIssuerAction.issuer.issuer_user_id) {
        await supabase
          .from("profiles")
          .update({ account_status: profileStatus })
          .eq("user_id", pendingIssuerAction.issuer.issuer_user_id);
      }

      toast({
        title: newStatus === "verified" ? "Issuer Verified" : "Issuer Rejected",
        description: `${pendingIssuerAction.issuer.organization_name} has been ${newStatus}.`,
      });

      await fetchTrustedIssuers();
      await fetchUsers();
    } catch (err) {
      console.error("Action failed:", err);
      toast({
        title: "Action failed",
        description: err instanceof Error ? err.message : "Could not update issuer status.",
        variant: "destructive",
      });
    } finally {
      setIssuerActionLoading(false);
      setPendingIssuerAction(null);
    }
  };

  const saveOrgSettings = async () => {
    if (!user) return;
    setSavingSettings(true);
    const { error } = await supabase
      .from("profiles")
      .update({ organization: orgName })
      .eq("user_id", user.id);
    setSavingSettings(false);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    await refreshProfile();
    toast({ title: "Settings saved", description: "Organization name updated." });
  };

  const filteredUsers = users.filter((u) => {
    const q = userSearch.trim().toLowerCase();
    const matchesSearch = q
      ? u.full_name.toLowerCase().includes(q) ||
        u.organization?.toLowerCase().includes(q) ||
        u.user_id.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
      : true;
    const matchesFilter = userFilter === "all" || u.account_status === userFilter;
    return matchesSearch && matchesFilter;
  });

  const filteredIssuers = trustedIssuers.filter((i) => {
    const q = issuerSearch.trim().toLowerCase();
    const matchesSearch = q
      ? i.organization_name.toLowerCase().includes(q) ||
        i.issuer_did.toLowerCase().includes(q) ||
        i.domain?.toLowerCase().includes(q)
      : true;
    const matchesFilter = issuerFilter === "all" || i.verification_status === issuerFilter;
    return matchesSearch && matchesFilter;
  });

  const pendingCount = users.filter((u) => u.account_status === "pending").length;
  const approvedCount = users.filter((u) => u.account_status === "approved").length;
  const rejectedCount = users.filter((u) => u.account_status === "rejected").length;
  const issuerCount = users.filter((u) => u.role === "issuer").length;
  const verifierCount = users.filter((u) => u.role === "verifier").length;
  const pendingIssuerCount = trustedIssuers.filter((i) => i.verification_status === "pending").length;
  const verifiedIssuerCount = trustedIssuers.filter((i) => i.verification_status === "verified").length;

  const userTotalPages = Math.max(1, Math.ceil(filteredUsers.length / ITEMS_PER_PAGE));
  const paginatedUsers = filteredUsers.slice((userPage - 1) * ITEMS_PER_PAGE, userPage * ITEMS_PER_PAGE);

  useEffect(() => { setUserPage(1); }, [userFilter, userSearch]);

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
    : "SA";

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      <div className="absolute inset-0 pattern-dots opacity-10 pointer-events-none" />

      <header className="border-b border-border bg-card/80 backdrop-blur-sm px-4 sm:px-6 py-3 sticky top-0 z-50 relative">
        <div className="container mx-auto flex items-center justify-between">
          <motion.div
            initial={{ opacity: 0, x: -15 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => navigate("/")}
                  className="border-border hover:border-primary hover:text-primary transition-colors rounded-xl"
                >
                  <Home className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Back to Home</TooltipContent>
            </Tooltip>

            <div className="flex items-center gap-2.5">
              <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400/20 to-amber-600/20 border border-amber-500/25 flex items-center justify-center">
                <Crown className="h-4.5 w-4.5 text-amber-500" />
              </div>
              <div>
                <span className="font-display text-base font-semibold tracking-tight">
                  Admin Portal
                </span>
                <p className="text-xs text-muted-foreground leading-none mt-0.5">
                  {profile?.organization || "BlockID Platform"}
                </p>
              </div>
            </div>
          </motion.div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchUsers}
              disabled={loadingUsers}
              className="gap-1.5 rounded-xl"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingUsers ? "animate-spin" : ""}`} />
              Refresh
            </Button>

            <NotificationBell />
            <ThemeToggle className="shrink-0 rounded-xl" />

            <div className="hidden sm:flex items-center gap-2.5 border-l border-border/50 pl-3">
              <div className="w-8 h-8 rounded-full bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-amber-600">{initials}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-foreground leading-none">{profile?.full_name || "Admin"}</span>
                <Badge variant="outline" className="mt-0.5 text-[10px] capitalize bg-amber-500/10 text-amber-600 border-amber-500/20 w-fit px-1.5 py-0 leading-4">
                  <Crown className="h-2.5 w-2.5 mr-0.5" />{role}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => signOut().then(() => navigate("/"))}
                className="rounded-xl h-8 w-8"
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 sm:px-6 py-6 sm:py-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-6"
        >
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage account approvals, trusted issuers, and organization settings.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
            {[
              { label: "Pending Users", value: pendingCount, accent: "hsl(38 92% 50%)", iconColor: "text-amber-500", icon: Clock },
              { label: "Approved", value: approvedCount, accent: "hsl(160 60% 45%)", iconColor: "text-emerald-500", icon: CheckCircle2 },
              { label: "Rejected", value: rejectedCount, accent: "hsl(0 72% 51%)", iconColor: "text-red-500", icon: XCircle },
              { label: "Issuers", value: issuerCount, accent: "hsl(220 75% 55%)", iconColor: "text-blue-500", icon: Shield },
              { label: "Verifiers", value: verifierCount, accent: "hsl(270 60% 55%)", iconColor: "text-purple-500", icon: Building2 },
              { label: "Pending Issuers", value: pendingIssuerCount, accent: "hsl(25 95% 53%)", iconColor: "text-orange-500", icon: ShieldAlert },
              { label: "Verified", value: verifiedIssuerCount, accent: "hsl(142 60% 45%)", iconColor: "text-green-500", icon: ShieldCheck },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
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

          <Tabs defaultValue="approvals" className="space-y-4">
            <TabsList className="grid grid-cols-4 w-full sm:w-auto">
              <TabsTrigger value="approvals" className="gap-1.5">
                <Users className="h-3.5 w-3.5" /> Approvals
              </TabsTrigger>
              <TabsTrigger value="issuers" className="gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" /> Issuers
              </TabsTrigger>
              <TabsTrigger value="members" className="gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> Members
              </TabsTrigger>
              <TabsTrigger value="settings" className="gap-1.5">
                <Settings className="h-3.5 w-3.5" /> Settings
              </TabsTrigger>
            </TabsList>

            <TabsContent value="approvals" className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                <div className="flex gap-1.5 flex-wrap">
                  {(["all", "pending", "approved", "rejected"] as const).map((f) => (
                    <Button
                      key={f}
                      variant={userFilter === f ? "default" : "outline"}
                      size="sm"
                      onClick={() => setUserFilter(f)}
                      className={`rounded-xl capitalize text-xs h-8 px-3 ${
                        userFilter === f ? "" : "text-muted-foreground"
                      }`}
                    >
                      {f === "pending" && pendingCount > 0 && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 animate-pulse" />
                      )}
                      {f}
                      {f === "all" ? ` (${users.length})` : f === "pending" ? ` (${pendingCount})` : f === "approved" ? ` (${approvedCount})` : ` (${rejectedCount})`}
                    </Button>
                  ))}
                </div>

                <div className="relative flex-1 w-full sm:w-auto">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, email, org, or ID..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="pl-10 rounded-xl"
                  />
                </div>
              </div>

              <Card className="border-border/50 overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="font-display text-lg flex items-center gap-2">
                      <Users className="h-5 w-5 text-primary" />
                      User Registrations
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <ListFilter className="h-3 w-3" /> {filteredUsers.length} total
                      </span>
                      <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={exportUsersCSV} disabled={filteredUsers.length === 0}>
                        <Download className="h-3.5 w-3.5" /> CSV
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="px-0 pb-0">
                  {loadingUsers ? (
                    <div className="py-16 text-center">
                      <RefreshCw className="h-6 w-6 text-muted-foreground/40 mx-auto mb-3 animate-spin" />
                      <p className="text-sm text-muted-foreground">Loading users...</p>
                    </div>
                  ) : filteredUsers.length === 0 ? (
                    <div className="py-16 text-center">
                      <Users className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">
                        {userFilter === "pending" ? "No pending registrations" : "No users found."}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="divide-y divide-border/40">
                        <AnimatePresence>
                          {paginatedUsers.map((u, idx) => {
                            const cfg = STATUS_CONFIG[u.account_status] || STATUS_CONFIG.pending;
                            const StatusIcon = cfg.icon;
                            const isPending = u.account_status === "pending";
                            const isRejected = u.account_status === "rejected";
                            const isIssuer = u.role === "issuer";

                            return (
                              <motion.div
                                key={u.user_id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.03 }}
                                className={`flex items-center justify-between px-6 py-4 hover:bg-muted/20 transition-colors border-l-2 ${cfg.rowBorder}`}
                              >
                                <div className="flex items-center gap-4 min-w-0">
                                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                    isIssuer ? "bg-blue-500/10" : "bg-purple-500/10"
                                  }`}>
                                    {isIssuer ? (
                                      <Shield className="h-5 w-5 text-blue-500" />
                                    ) : (
                                      <Building2 className="h-5 w-5 text-purple-500" />
                                    )}
                                  </div>

                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-foreground truncate">{u.full_name}</p>
                                    {u.email && (
                                      <p className="text-xs text-muted-foreground truncate mt-0.5 flex items-center gap-1">
                                        <Mail className="h-3 w-3 shrink-0" />
                                        {u.email}
                                      </p>
                                                            )}
                                    {u.organization && (
                                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                                        {u.organization}
                                      </p>
                                                            )}
                                    <p className="text-xs font-mono text-muted-foreground/60 truncate max-w-[200px] mt-0.5">
                                      {u.user_id.substring(0, 8)}...
                                    </p>
                                    <p className="text-xs text-muted-foreground/50 mt-0.5">
                                      Registered {new Date(u.created_at).toLocaleDateString()}
                                    </p>
                                                          </div>
                                                        </div>

                                <div className="flex items-center gap-2 shrink-0 ml-4">
                                  <span className={`text-xs px-2 py-0.5 rounded-full capitalize border border-border/50 ${
                                    isIssuer
                                      ? "bg-blue-500/10 text-blue-600 border-blue-500/20"
                                      : "bg-purple-500/10 text-purple-600 border-purple-500/20"
                                  }`}>
                                    {u.role}
                                  </span>

                                  <span className={`text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5 border font-medium ${cfg.badgeClass}`}>
                                    {isPending ? (
                                      <span className="relative flex items-center justify-center w-2 h-2">
                                        <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${cfg.dotClass}`} />
                                        <span className={`relative inline-flex rounded-full w-1.5 h-1.5 ${cfg.dotClass}`} />
                                      </span>
                                    ) : (
                                      <StatusIcon className="h-3 w-3" />
                                    )}
                                    {cfg.label}
                                  </span>

                                  {isPending && (
                                    <div className="flex items-center gap-1.5">
                                      <Button
                                        size="sm"
                                        className="h-7 px-2.5 text-xs gap-1 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg"
                                        variant="ghost"
                                        onClick={() => setPendingUserAction({ user: u, type: "approve" })}
                                      >
                                        <ThumbsUp className="h-3 w-3" /> Approve
                                      </Button>
                                      <Button
                                        size="sm"
                                        className="h-7 px-2.5 text-xs gap-1 bg-red-500/10 text-red-600 hover:bg-red-500/20 border border-red-500/20 rounded-lg"
                                        variant="ghost"
                                        onClick={() => setPendingUserAction({ user: u, type: "reject" })}
                                      >
                                        <ThumbsDown className="h-3 w-3" /> Reject
                                      </Button>
                                                            </div>
                                                          )}

                                  {isRejected && (
                                    <Button
                                      size="sm"
                                      className="h-7 px-2.5 text-xs gap-1 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg"
                                      variant="ghost"
                                      onClick={() => setPendingUserAction({ user: u, type: "reinstate" })}
                                    >
                                      <RotateCcw className="h-3 w-3" /> Reinstate
                                    </Button>
                                                          )}
                                </div>
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>
                      </div>

                      {userTotalPages > 1 && (
                        <div className="flex items-center justify-between px-6 py-3 border-t border-border/40">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={userPage <= 1}
                            onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                            className="gap-1 text-xs rounded-lg"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" /> Previous
                          </Button>
                          <span className="text-xs text-muted-foreground">
                            Page {userPage} of {userTotalPages}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={userPage >= userTotalPages}
                            onClick={() => setUserPage((p) => Math.min(userTotalPages, p + 1))}
                            className="gap-1 text-xs rounded-lg"
                          >
                            Next <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="issuers" className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                <div className="flex gap-1.5 flex-wrap">
                  {(["all", "verified", "pending", "rejected"] as const).map((f) => (
                    <Button
                      key={f}
                      variant={issuerFilter === f ? "default" : "outline"}
                      size="sm"
                      onClick={() => setIssuerFilter(f as IssuerFilterType)}
                      className={`rounded-xl capitalize text-xs h-8 px-3 ${
                        issuerFilter === f ? "" : "text-muted-foreground"
                      }`}
                    >
                      {f === "pending" && pendingIssuerCount > 0 && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 animate-pulse" />
                      )}
                      {f}
                    </Button>
                  ))}
                </div>

                <div className="relative flex-1 w-full sm:w-auto">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by org, DID, or domain..."
                    value={issuerSearch}
                    onChange={(e) => setIssuerSearch(e.target.value)}
                    className="pl-10 rounded-xl"
                  />
                </div>
              </div>

              <Card className="border-border/50 overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="font-display text-lg flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-primary" />
                      Trusted Issuer Registry
                    </CardTitle>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <ListFilter className="h-3 w-3" /> {filteredIssuers.length} total
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="px-0 pb-0">
                  {loadingIssuers ? (
                    <div className="py-16 text-center">
                      <RefreshCw className="h-6 w-6 text-muted-foreground/40 mx-auto mb-3 animate-spin" />
                      <p className="text-sm text-muted-foreground">Loading issuers...</p>
                    </div>
                  ) : filteredIssuers.length === 0 ? (
                    <div className="py-16 text-center">
                      <ShieldCheck className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">
                        {issuerFilter === "pending" ? "No pending issuer requests" : "No issuers found."}
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/40">
                      <AnimatePresence>
                        {filteredIssuers.map((issuer, idx) => {
                          const cfg = ISSUER_STATUS_CONFIG[issuer.verification_status] || ISSUER_STATUS_CONFIG.pending;
                          const StatusIcon = cfg.icon;
                          const isPending = issuer.verification_status === "pending";

                          return (
                            <motion.div
                              key={issuer.id}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: idx * 0.03 }}
                              className={`flex items-center justify-between px-6 py-4 hover:bg-muted/20 transition-colors border-l-2 ${cfg.rowBorder}`}
                            >
                              <div className="flex items-center gap-4 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                                  <ShieldCheck className="h-5 w-5 text-blue-500" />
                                </div>

                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-foreground truncate">{issuer.organization_name}</p>
                                  {issuer.domain && (
                                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                                      {issuer.domain}
                                    </p>
                                                          )}
                                  <p className="text-xs font-mono text-muted-foreground/60 truncate max-w-[250px] mt-0.5">
                                    {issuer.issuer_did}
                                  </p>
                                                          <p className="text-xs text-muted-foreground/50 mt-0.5">
                                                            Requested {new Date(issuer.created_at).toLocaleDateString()}
                                                          </p>
                                                        </div>
                                                      </div>

                              <div className="flex items-center gap-2 shrink-0 ml-4">
                                <span className={`text-xs px-2 py-0.5 rounded-full capitalize border bg-blue-500/10 text-blue-600 border-blue-500/20`}>
                                  {issuer.trust_level || "standard"}
                                </span>

                                <span className={`text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5 border font-medium ${cfg.badgeClass}`}>
                                  {isPending ? (
                                    <span className="relative flex items-center justify-center w-2 h-2">
                                      <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${cfg.dotClass}`} />
                                      <span className={`relative inline-flex rounded-full w-1.5 h-1.5 ${cfg.dotClass}`} />
                                    </span>
                                  ) : (
                                    <StatusIcon className="h-3 w-3" />
                                  )}
                                  {cfg.label}
                                </span>

                                {isPending && (
                                  <div className="flex items-center gap-1.5">
                                    <Button
                                      size="sm"
                                      className="h-7 px-2.5 text-xs gap-1 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg"
                                      variant="ghost"
                                      onClick={() => setPendingIssuerAction({ issuer, type: "accept" })}
                                    >
                                      <ThumbsUp className="h-3 w-3" /> Verify
                                    </Button>
                                    <Button
                                      size="sm"
                                      className="h-7 px-2.5 text-xs gap-1 bg-red-500/10 text-red-600 hover:bg-red-500/20 border border-red-500/20 rounded-lg"
                                      variant="ghost"
                                      onClick={() => setPendingIssuerAction({ issuer, type: "reject" })}
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
            </TabsContent>

            <TabsContent value="members">
              <Card className="border-border/50">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="font-display text-lg flex items-center gap-2">
                        <Users className="h-5 w-5 text-primary" /> Team Members
                      </CardTitle>
                      <CardDescription>
                        {members.length} member{members.length !== 1 ? "s" : ""} in your organization
                      </CardDescription>
                    </div>
                    <Button size="sm" className="gap-1.5 rounded-xl" onClick={() => setInviteOpen(true)}>
                      <UserPlus className="h-4 w-4" /> Invite
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {loadingMembers ? (
                    <div className="py-10 text-center text-sm text-muted-foreground animate-pulse">
                      Loading members...
                    </div>
                  ) : members.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                      No members found.
                    </div>
                  ) : (
                    <div className="divide-y divide-border/40">
                      {members.map((m) => (
                        <div key={m.user_id} className="flex items-center justify-between py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-xs font-medium">{m.full_name[0]}</span>
                            </div>
                            <div>
                              <p className="text-sm font-medium">{m.full_name}</p>
                              <p className="text-xs text-muted-foreground">{m.organization}</p>
                            </div>
                          </div>
                          <Badge variant="outline" className="capitalize">
                            {m.role}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="settings">
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="font-display text-lg flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" /> Organization Settings
                  </CardTitle>
                  <CardDescription>Update your organization details.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 max-w-md">
                  <div className="space-y-1.5">
                    <Label htmlFor="org-name">Organization Name</Label>
                    <Input
                      id="org-name"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder="e.g., Acme Corporation"
                      className="rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Your Role</Label>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize text-sm bg-amber-500/10 text-amber-600 border-amber-500/20">
                        <Crown className="h-3 w-3 mr-1" /> {role}
                      </Badge>
                      <span className="text-xs text-muted-foreground">You have full administrative access.</span>
                    </div>
                  </div>

                  <Button
                    onClick={saveOrgSettings}
                    disabled={savingSettings || !orgName.trim()}
                    className="w-full sm:w-auto rounded-xl"
                  >
                    {savingSettings ? "Saving..." : "Save Changes"}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </motion.div>
      </main>

      <AlertDialog open={!!pendingUserAction} onOpenChange={(o) => !o && setPendingUserAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingUserAction?.type === "approve"
                ? "Approve User?"
                : pendingUserAction?.type === "reject"
                ? "Reject User?"
                : "Reinstate User?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingUserAction?.type === "approve"
                ? `This will approve "${pendingUserAction?.user.full_name}" and grant them access to the ${pendingUserAction?.user.role} portal.`
                : pendingUserAction?.type === "reject"
                ? `This will reject "${pendingUserAction?.user.full_name}". They will not be able to access the platform.`
                : `This will reinstate "${pendingUserAction?.user.full_name}" and re-approve their access to the ${pendingUserAction?.user.role} portal.`}
              <br />
              <span className="text-xs font-mono mt-2 block text-muted-foreground">
                Role: {pendingUserAction?.user.role} · Org: {pendingUserAction?.user.organization || "—"}
                {pendingUserAction?.user.email ? ` · ${pendingUserAction.user.email}` : ""}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={userActionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={userActionLoading}
              className={
                pendingUserAction?.type === "reject"
                  ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                  : "bg-emerald-500 hover:bg-emerald-600 text-white"
              }
              onClick={handleUserAction}
            >
              {userActionLoading
                ? "Processing..."
                : pendingUserAction?.type === "approve"
                ? "Approve User"
                : pendingUserAction?.type === "reject"
                ? "Reject User"
                : "Reinstate User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingIssuerAction} onOpenChange={(o) => !o && setPendingIssuerAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingIssuerAction?.type === "accept"
                ? "Verify Issuer?"
                : "Reject Issuer?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingIssuerAction?.type === "accept"
                ? `This will mark "${pendingIssuerAction?.issuer.organization_name}" as a verified trusted issuer.`
                : `This will reject the issuer request from "${pendingIssuerAction?.issuer.organization_name}".`}
              <br />
              <span className="text-xs font-mono mt-2 block text-muted-foreground">
                Domain: {pendingIssuerAction?.issuer.domain || "—"}
                <br />
                DID: {pendingIssuerAction?.issuer.issuer_did.substring(0, 20)}...
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={issuerActionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={issuerActionLoading}
              className={
                pendingIssuerAction?.type === "reject"
                  ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                  : "bg-emerald-500 hover:bg-emerald-600 text-white"
              }
              onClick={handleIssuerAction}
            >
              {issuerActionLoading
                ? "Processing..."
                : pendingIssuerAction?.type === "accept"
                ? "Verify Issuer"
                : "Reject Issuer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminPage;