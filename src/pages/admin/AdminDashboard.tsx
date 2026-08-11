import { useState, useEffect, useCallback } from "react";
import {
  Users,
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
  ChevronLeft,
  ChevronRight,
  ScrollText,
  Download,
  UserPlus,
  Shield,
  Activity,
  ListFilter,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import MembersList, { type OrgMember } from "@/components/admin/MembersList";
import InviteMemberDialog from "@/components/admin/InviteMemberDialog";
import ThemeToggle from "@/components/ui/ThemeToggle";
import NotificationBell from "@/components/NotificationBell";
import ParticleBackground from "@/components/ui/ParticleBackground";

interface PendingUser {
  user_id: string;
  full_name: string | null;
  organization: string | null;
  account_status: string;
  created_at: string;
  role: string;
  email?: string;
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

interface AuditEntry {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: any;
  created_at: string;
}

interface StatCard {
  label: string;
  value: number;
  icon: React.ElementType;
  accentColor: string;
  iconColor: string;
}

const ADMIN_ACTION_LABELS: Record<string, { label: string; color: string }> = {
  account_approved: { label: "Approved", color: "bg-emerald-500/10 text-emerald-600" },
  account_rejected: { label: "Rejected", color: "bg-red-500/10 text-red-600" },
  account_reinstated: { label: "Reinstated", color: "bg-amber-500/10 text-amber-600" },
  admin_access_denied: { label: "Access Denied", color: "bg-red-500/10 text-red-600" },
};

const ITEMS_PER_PAGE = 15;

const fetchAllUsers = async (): Promise<PendingUser[]> => {
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("profiles error:", error);
    throw error;
  }
  
  const { data: roles } = await supabase
    .from("user_roles")
    .select("user_id, role");
  
  const roleMap = new Map((roles || []).map(r => [r.user_id, r.role]));
  
  return (profiles || []).map(p => ({
    ...p,
    role: roleMap.get(p.user_id) || "user",
  }));
};

const updateUserStatus = async (
  userId: string, 
  actionType: "approve" | "reject" | "reinstate" | "revoke", 
  adminUserId: string
) => {
  let status: string;
  let auditAction: string;
  
  switch (actionType) {
    case "approve":
    case "reinstate":
      status = "approved";
      auditAction = actionType === "approve" ? "account_approved" : "account_reinstated";
      break;
    case "revoke":
      status = "rejected";
      auditAction = "account_revoked";
      break;
    case "reject":
    default:
      status = "rejected";
      auditAction = "account_rejected";
      break;
  }
  
  // Update profile status
  const { error } = await supabase
    .from("profiles")
    .update({ account_status: status })
    .eq("user_id", userId);
  
  if (error) throw error;

  // RLS can silently drop the update (0 rows affected). Verify it applied.
  const { data: verifyProfile, error: verifyErr } = await supabase
    .from("profiles")
    .select("account_status")
    .eq("user_id", userId)
    .single();
  if (verifyErr) throw new Error(`Failed to verify profile update: ${verifyErr.message}`);
  if (!verifyProfile || verifyProfile.account_status !== status) {
    throw new Error(
      "Profile update was blocked (RLS). The admin role is missing update permissions. Apply the admin_approval_rls migration."
    );
  }
  
  // Check if user is an issuer and update trusted_issuers
  const { data: userRoles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .single();

  if (userRoles && userRoles.role === "issuer") {
    const issuerStatus = status === "approved" ? "verified" : status;
    await supabase
      .from("trusted_issuers")
      .update({ 
        verification_status: issuerStatus,
        verified_at: status === "approved" ? new Date().toISOString() : null,
        verified_by: adminUserId,
      })
      .eq("issuer_user_id", userId);
  }
  
  // Log audit
  if (adminUserId) {
    await supabase.from("audit_logs").insert({
      user_id: adminUserId,
      action: auditAction,
      entity_type: "profile",
      entity_id: userId,
      metadata: { target_user_id: userId, new_status: status },
    });
  }
};

const fetchTrustedIssuers = async (): Promise<TrustedIssuer[]> => {
  const { data, error } = await supabase
    .from("trusted_issuers")
    .select("*")
    .order("created_at", { ascending: false });
  
  if (error) {
    console.error("trusted_issuers error:", error);
    return [];
  }
  return data || [];
};

const updateIssuerStatus = async (
  issuerId: string,
  userId: string,
  actionType: "accept" | "reject",
  adminUserId: string
) => {
  const newStatus = actionType === "accept" ? "verified" : "rejected";
  const profileStatus = actionType === "accept" ? "approved" : "rejected";
  
  // Update trusted_issuers
  const { error } = await supabase
    .from("trusted_issuers")
    .update({ 
      verification_status: newStatus,
      verified_at: actionType === "accept" ? new Date().toISOString() : null,
      verified_by: adminUserId,
    })
    .eq("id", issuerId);
  
  if (error) throw error;
  
  // Get the issuer's user_id and update their profile
  const { data: issuer } = await supabase
    .from("trusted_issuers")
    .select("issuer_user_id")
    .eq("id", issuerId)
    .single();
  
  if (issuer?.issuer_user_id) {
    await supabase
      .from("profiles")
      .update({ account_status: profileStatus })
      .eq("user_id", issuer.issuer_user_id);
  }
  
  // Log audit
  await supabase.from("audit_logs").insert({
    user_id: adminUserId,
    action: actionType === "accept" ? "issuer_accepted" : "issuer_rejected",
    entity_type: "trusted_issuer",
    entity_id: issuerId,
    metadata: { action: actionType, issuer_id: issuerId },
  });
};

const AdminDashboard = () => {
  const { user, profile, role, signOut, refreshProfile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [orgName, setOrgName] = useState(profile?.organization ?? "");
  const [savingSettings, setSavingSettings] = useState(false);
  const [pendingIssuers, setPendingIssuers] = useState(0);

  const [users, setUsers] = useState<PendingUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected" | "revoked">("all");
  const [pendingAction, setPendingAction] = useState<{
    user: PendingUser;
    type: "approve" | "reject" | "reinstate" | "revoke";
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Trusted Issuers state
  const [trustedIssuers, setTrustedIssuers] = useState<TrustedIssuer[]>([]);
  const [loadingIssuers, setLoadingIssuers] = useState(false);
  const [issuerSearch, setIssuerSearch] = useState("");
  const [issuerFilter, setIssuerFilter] = useState<"all" | "verified" | "pending" | "rejected">("all");
  const [pendingIssuerAction, setPendingIssuerAction] = useState<{
    issuer: TrustedIssuer;
    type: "accept" | "reject";
  } | null>(null);
  const [issuerActionLoading, setIssuerActionLoading] = useState(false);

  const currentTab = location.hash?.replace("#", "") || "overview";

  useEffect(() => {
    fetchMembers();
    fetchPendingIssuers();
    fetchUsers();
    fetchAuditLogs();
    fetchTrustedIssuersData();
  }, [profile?.organization]);

  useEffect(() => {
    setOrgName(profile?.organization ?? "");
  }, [profile?.organization]);

  const fetchMembers = async () => {
    if (!profile?.organization) return;
    setLoadingMembers(true);
    try {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name, organization, account_status, did, biometric_registered, face_registered")
        .eq("organization", profile.organization);
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      const memberMap: Record<string, OrgMember> = {};
      for (const p of data || []) {
        const r = roles?.find((x) => x.user_id === p.user_id);
        memberMap[p.user_id] = { ...p, role: r?.role || "unknown" };
      }
      setMembers(Object.values(memberMap));
    } catch (e) {
      console.error("Failed to fetch members:", e);
    } finally {
      setLoadingMembers(false);
    }
  };

  const fetchPendingIssuers = async () => {
    const { count } = await supabase
      .from("profiles")
      .select("user_id", { count: "exact", head: true })
      .eq("account_status", "pending");
    setPendingIssuers(count || 0);
  };

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const result = await fetchAllUsers();
      setUsers(result);
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

  const fetchAuditLogs = useCallback(async () => {
    setLoadingAudit(true);
    try {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      
      const adminActions = ["account_approved", "account_rejected", "account_reinstated", "account_revoked", "admin_access_denied", "issuer_accepted", "issuer_rejected"];
      const filtered = (data || []).filter(log => adminActions.includes(log.action));
      setAuditLogs(filtered);
    } catch (err) {
      console.error("Failed to fetch audit logs:", err);
    } finally {
      setLoadingAudit(false);
    }
  }, []);

  const fetchTrustedIssuersData = useCallback(async () => {
    setLoadingIssuers(true);
    try {
      const result = await fetchTrustedIssuers();
      setTrustedIssuers(result);
    } catch (err) {
      console.error("Failed to fetch trusted issuers:", err);
    } finally {
      setLoadingIssuers(false);
    }
  }, []);

  const handleSaveSettings = async () => {
    if (!user || !orgName.trim()) return;
    setSavingSettings(true);
    try {
      await supabase.from("profiles").update({ organization: orgName.trim() }).eq("user_id", user.id);
      await refreshProfile();
      toast({ title: "Organization settings saved" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleUserAction = async () => {
    if (!pendingAction) return;
    setActionLoading(true);
    try {
      await updateUserStatus(pendingAction.user.user_id, pendingAction.type, user?.id);
      const actionMsg = pendingAction.type === "revoke" ? "revoked" : `${pendingAction.type}ed`;
      toast({ title: `User ${actionMsg} successfully` });
      fetchUsers();
      fetchAuditLogs();
      setPendingAction(null);
    } catch (err) {
      toast({
        title: "Action failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleIssuerAction = async () => {
    if (!pendingIssuerAction || !user) return;
    setIssuerActionLoading(true);
    try {
      await updateIssuerStatus(
        pendingIssuerAction.issuer.id,
        pendingIssuerAction.issuer.issuer_user_id || "",
        pendingIssuerAction.type,
        user.id
      );
      const actionMsg = pendingIssuerAction.type === "accept" ? "verified" : "rejected";
      toast({ title: `Issuer ${actionMsg} successfully` });
      fetchTrustedIssuersData();
      fetchUsers();
      fetchAuditLogs();
      setPendingIssuerAction(null);
    } catch (err) {
      toast({
        title: "Action failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIssuerActionLoading(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      !search ||
      u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.organization?.toLowerCase().includes(search.toLowerCase());
    const matchesFilter =
      filter === "all" ||
      (filter === "pending" && u.account_status === "pending") ||
      (filter === "approved" && u.account_status === "approved") ||
      (filter === "revoked" && u.account_status === "revoked") ||
      (filter === "rejected" && u.account_status === "rejected");
    return matchesSearch && matchesFilter;
  });

  const filteredIssuers = trustedIssuers.filter((i) => {
    const matchesSearch =
      !issuerSearch ||
      i.organization_name?.toLowerCase().includes(issuerSearch.toLowerCase()) ||
      i.issuer_did?.toLowerCase().includes(issuerSearch.toLowerCase()) ||
      i.domain?.toLowerCase().includes(issuerSearch.toLowerCase());
    const matchesFilter =
      issuerFilter === "all" ||
      (issuerFilter === "pending" && i.verification_status === "pending") ||
      (issuerFilter === "verified" && i.verification_status === "verified") ||
      (issuerFilter === "rejected" && i.verification_status === "rejected");
    return matchesSearch && matchesFilter;
  });

  const paginatedUsers = filteredUsers.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
  const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE);

  const statCards: StatCard[] = [
    {
      label: "Total Users",
      value: users.length,
      icon: Users,
      accentColor: "#3b82f6",
      iconColor: "text-blue-500",
    },
    {
      label: "Pending Approval",
      value: users.filter((u) => u.account_status === "pending").length,
      icon: Clock,
      accentColor: "#f59e0b",
      iconColor: "text-amber-500",
    },
    {
      label: "Approved",
      value: users.filter((u) => u.account_status === "approved").length,
      icon: CheckCircle2,
      accentColor: "#10b981",
      iconColor: "text-emerald-500",
    },
    {
      label: "Rejected",
      value: users.filter((u) => u.account_status === "rejected").length,
      icon: XCircle,
      accentColor: "#ef4444",
      iconColor: "text-red-500",
    },
    {
      label: "Trusted Issuers",
      value: trustedIssuers.length,
      icon: ShieldCheck,
      accentColor: "#8b5cf6",
      iconColor: "text-purple-500",
    },
    {
      label: "Pending Issuers",
      value: trustedIssuers.filter((i) => i.verification_status === "pending").length,
      icon: Shield,
      accentColor: "#f97316",
      iconColor: "text-orange-500",
    },
  ];

  return (
    <div className="min-h-screen bg-background relative">
      <ParticleBackground />
      <div className="relative z-10">
        {/* Header */}
        <header className="border-b border-border/40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 items-center justify-between">
              <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1">
                  <Home className="h-4 w-4" /> Home
                </Button>
                <span className="text-lg font-display font-semibold text-foreground">
                  {profile?.organization || "Admin Portal"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <NotificationBell />
                <ThemeToggle />
                <Button variant="ghost" size="sm" onClick={signOut} className="gap-1 text-muted-foreground">
                  <LogOut className="h-4 w-4" /> Sign Out
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Tabs value={currentTab} onValueChange={(v) => navigate(`/admin#${v}`)} className="space-y-6">
            <TabsList className="bg-muted/50">
              <TabsTrigger value="overview" className="gap-1">
                <Activity className="h-4 w-4" /> Overview
              </TabsTrigger>
              <TabsTrigger value="users" className="gap-1">
                <Users className="h-4 w-4" /> User Approvals
              </TabsTrigger>
              <TabsTrigger value="issuers" className="gap-1">
                <ShieldCheck className="h-4 w-4" /> Trusted Issuers
              </TabsTrigger>
              <TabsTrigger value="organization" className="gap-1">
                <Building2 className="h-4 w-4" /> Organization
              </TabsTrigger>
              <TabsTrigger value="audit" className="gap-1">
                <ScrollText className="h-4 w-4" /> Audit Logs
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map((stat, i) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Card className="relative overflow-hidden">
                      <div
                        className="absolute top-0 left-0 right-0 h-1"
                        style={{ backgroundColor: stat.accentColor }}
                      />
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-muted-foreground">{stat.label}</p>
                            <p className="text-2xl font-semibold mt-1">{stat.value}</p>
                          </div>
                          <div
                            className={`h-10 w-10 rounded-lg flex items-center justify-center ${stat.iconColor} bg-muted`}
                            style={{ backgroundColor: `${stat.accentColor}15` }}
                          >
                            <stat.icon className="h-5 w-5" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>

              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Quick Actions</CardTitle>
                  <CardDescription>Common administrative tasks</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => navigate("/admin#users")} className="gap-2">
                    <UserPlus className="h-4 w-4" /> Review Pending Users
                  </Button>
                  <Button variant="outline" onClick={() => navigate("/admin#organization")} className="gap-2">
                    <Settings className="h-4 w-4" /> Organization Settings
                  </Button>
                  <Button variant="outline" onClick={() => navigate("/admin#audit")} className="gap-2">
                    <ScrollText className="h-4 w-4" /> View Audit Logs
                  </Button>
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Recent Admin Activity</CardTitle>
                  <CardDescription>Latest administrative actions</CardDescription>
                </CardHeader>
                <CardContent>
                  {auditLogs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No admin activity recorded yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {auditLogs.slice(0, 5).map((log) => (
                        <div key={log.id} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-muted-foreground" />
                            <span>
                              {ADMIN_ACTION_LABELS[log.action]?.label || log.action}
                              {log.metadata?.target_user_id && ` (${log.metadata.target_user_id.slice(0, 8)})`}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(log.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* User Approvals Tab */}
            <TabsContent value="users" className="space-y-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle>User Approvals</CardTitle>
                    <CardDescription>Review and approve new user registrations</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loadingUsers} className="gap-1">
                    <RefreshCw className={`h-4 w-4 ${loadingUsers ? "animate-spin" : ""}`} /> Refresh
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search users..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <div className="flex gap-1">
                      {(["all", "pending", "approved", "rejected", "revoked"] as const).map((f) => (
                        <Button
                          key={f}
                          variant={filter === f ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            setFilter(f);
                            setPage(1);
                          }}
                        >
                          {f.charAt(0).toUpperCase() + f.slice(1)}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-md border">
                    <table className="w-full">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">User</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Role</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Organization</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Date</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {paginatedUsers.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                              No users found
                            </td>
                          </tr>
                        ) : (
                          paginatedUsers.map((u) => (
                            <tr key={u.user_id} className="hover:bg-muted/50">
                              <td className="px-4 py-3">
                                <div className="font-medium">{u.full_name || "—"}</div>
                                <div className="text-xs text-muted-foreground">{u.email}</div>
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant="outline" className="capitalize">
                                  {u.role}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-sm">{u.organization || "—"}</td>
                              <td className="px-4 py-3">
                                <Badge
                                  variant={
                                    u.account_status === "approved"
                                      ? "default"
                                      : u.account_status === "rejected"
                                      ? "destructive"
                                      : u.account_status === "revoked"
                                      ? "destructive"
                                      : "outline"
                                  }
                                  className="capitalize"
                                >
                                  {u.account_status}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">
                                {new Date(u.created_at).toLocaleDateString()}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {u.account_status === "pending" && (
                                  <div className="flex justify-end gap-1">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                      onClick={() => setPendingAction({ user: u, type: "approve" })}
                                    >
                                      <ThumbsUp className="h-3 w-3" /> Approve
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 gap-1 text-red-600 border-red-200 hover:bg-red-50"
                                      onClick={() => setPendingAction({ user: u, type: "reject" })}
                                    >
                                      <ThumbsDown className="h-3 w-3" /> Reject
                                    </Button>
                                  </div>
                                )}
                                {u.account_status === "rejected" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 gap-1"
                                    onClick={() => setPendingAction({ user: u, type: "reinstate" })}
                                  >
                                    <RotateCcw className="h-3 w-3" /> Reinstate
                                  </Button>
                                )}
                                {u.account_status === "approved" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 gap-1 text-red-600 border-red-200 hover:bg-red-50"
                                    onClick={() => setPendingAction({ user: u, type: "revoke" })}
                                  >
                                    <XCircle className="h-3 w-3" /> Revoke
                                  </Button>
                                )}
                                {u.account_status === "revoked" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 gap-1"
                                    onClick={() => setPendingAction({ user: u, type: "reinstate" })}
                                  >
                                    <RotateCcw className="h-3 w-3" /> Reinstate
                                  </Button>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        Showing {(page - 1) * ITEMS_PER_PAGE + 1} to{" "}
                        {Math.min(page * ITEMS_PER_PAGE, filteredUsers.length)} of {filteredUsers.length}
                      </p>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={page === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                          disabled={page === totalPages}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Trusted Issuers Tab */}
            <TabsContent value="issuers" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5" /> Trusted Issuer Registry
                      </CardTitle>
                      <CardDescription>Manage trusted issuer registrations</CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={fetchTrustedIssuersData}
                      disabled={loadingIssuers}
                      className="gap-2"
                    >
                      <RefreshCw className={`h-4 w-4 ${loadingIssuers ? "animate-spin" : ""}`} />
                      Refresh
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Search and Filter */}
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by name, DID, or domain..."
                        value={issuerSearch}
                        onChange={(e) => setIssuerSearch(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <div className="flex gap-2">
                      {(["all", "verified", "pending", "rejected"] as const).map((f) => (
                        <Button
                          key={f}
                          variant={issuerFilter === f ? "default" : "outline"}
                          size="sm"
                          onClick={() => setIssuerFilter(f)}
                          className="capitalize"
                        >
                          {f}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Issuers List */}
                  {loadingIssuers ? (
                    <div className="py-8 text-center">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto" />
                      <p className="text-sm text-muted-foreground mt-2">Loading issuers...</p>
                    </div>
                  ) : filteredIssuers.length === 0 ? (
                    <div className="py-8 text-center">
                      <ShieldCheck className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                      <p className="text-sm text-muted-foreground mt-2">No issuers found</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {filteredIssuers.map((issuer) => (
                        <div key={issuer.id} className="flex items-center justify-between py-4">
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                              issuer.verification_status === "verified" 
                                ? "bg-emerald-500/10" 
                                : issuer.verification_status === "rejected"
                                ? "bg-red-500/10"
                                : "bg-amber-500/10"
                            }`}>
                              {issuer.verification_status === "verified" ? (
                                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                              ) : issuer.verification_status === "rejected" ? (
                                <XCircle className="h-5 w-5 text-red-500" />
                              ) : (
                                <Clock className="h-5 w-5 text-amber-500" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium">{issuer.organization_name}</p>
                              <p className="text-sm text-muted-foreground font-mono">{issuer.issuer_did}</p>
                              {issuer.domain && (
                                <p className="text-xs text-muted-foreground">{issuer.domain}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <Badge variant="outline" className="capitalize">
                              {issuer.verification_status}
                            </Badge>
                            {issuer.verification_status === "pending" && (
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                  onClick={() => setPendingIssuerAction({ issuer, type: "accept" })}
                                >
                                  <ThumbsUp className="h-4 w-4 mr-1" /> Verify
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600 border-red-200 hover:bg-red-50"
                                  onClick={() => setPendingIssuerAction({ issuer, type: "reject" })}
                                >
                                  <ThumbsDown className="h-4 w-4 mr-1" /> Reject
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Organization Tab */}
            <TabsContent value="organization" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Organization Settings</CardTitle>
                  <CardDescription>Manage your organization details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="org-name">Organization Name</Label>
                    <Input
                      id="org-name"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder="Your organization name"
                    />
                  </div>
                  <Button onClick={handleSaveSettings} disabled={savingSettings} className="gap-2">
                    {savingSettings ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Settings className="h-4 w-4" />}
                    Save Settings
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle>Organization Members</CardTitle>
                    <CardDescription>Manage members of your organization</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setInviteOpen(true)} className="gap-1">
                    <UserPlus className="h-4 w-4" /> Invite
                  </Button>
                </CardHeader>
                <CardContent>
                  <MembersList
                    members={members}
                    onRefresh={fetchMembers}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Audit Logs Tab */}
            <TabsContent value="audit" className="space-y-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle>Audit Logs</CardTitle>
                    <CardDescription>Administrative actions and changes</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchAuditLogs} disabled={loadingAudit} className="gap-1">
                    <RefreshCw className={`h-4 w-4 ${loadingAudit ? "animate-spin" : ""}`} /> Refresh
                  </Button>
                </CardHeader>
                <CardContent>
                  {auditLogs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No admin activity recorded yet.</p>
                  ) : (
                    <div className="rounded-md border">
                      <table className="w-full">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Action</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">User</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Details</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {auditLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-muted/50">
                              <td className="px-4 py-3">
                                <Badge className={ADMIN_ACTION_LABELS[log.action]?.color || "bg-muted"}>
                                  {ADMIN_ACTION_LABELS[log.action]?.label || log.action}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-sm">
                                {log.entity_id?.slice(0, 8) || "System"}
                              </td>
                              <td className="px-4 py-3 text-sm text-muted-foreground">
                                {log.entity_type && (
                                  <span>
                                    {log.entity_type}: {(log.metadata as any)?.new_status || log.entity_id?.slice(0, 8)}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">
                                {new Date(log.created_at).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </main>
      </div>

      <AlertDialog open={!!pendingAction} onOpenChange={() => setPendingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction?.type === "approve"
                ? "Approve User"
                : pendingAction?.type === "reject"
                ? "Reject User"
                : "Reinstate User"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to {pendingAction?.type}{" "}
              {pendingAction?.user.full_name || pendingAction?.user.email}? This action will update their account status.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUserAction} disabled={actionLoading}>
              {actionLoading ? "Processing..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingIssuerAction} onOpenChange={() => setPendingIssuerAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingIssuerAction?.type === "accept" ? "Verify Issuer" : "Reject Issuer"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to {pendingIssuerAction?.type === "accept" ? "verify" : "reject"}{" "}
              {pendingIssuerAction?.issuer.organization_name}? This will also update their account status.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleIssuerAction} disabled={issuerActionLoading}>
              {issuerActionLoading ? "Processing..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <InviteMemberDialog open={inviteOpen} onOpenChange={setInviteOpen} onSuccess={fetchMembers} />
    </div>
  );
};

export default AdminDashboard;