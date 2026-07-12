import { useState, useEffect, useCallback } from "react";
import {
  Fingerprint, LogOut, Shield, Users, CheckCircle2, XCircle,
  Clock, Search, ThumbsUp, ThumbsDown, Eye, EyeOff,
  Lock, Building2, RefreshCw, ListFilter, ChevronRight, Activity,
  Home, Crown, RotateCcw, Mail, Download, ScrollText,
  ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import ThemeToggle from "@/components/ui/ThemeToggle";
import NotificationBell from "@/components/NotificationBell";

// ── Types ──────────────────────────────────────────────────────────

interface PendingUser {
  user_id: string;
  full_name: string;
  organization: string | null;
  account_status: string;
  created_at: string;
  role: string;
  email: string;
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

const ADMIN_ACTION_LABELS: Record<string, { label: string; color: string }> = {
  account_approved: { label: "Approved", color: "bg-emerald-500/10 text-emerald-600" },
  account_rejected: { label: "Rejected", color: "bg-red-500/10 text-red-600" },
  account_reinstated: { label: "Reinstated", color: "bg-amber-500/10 text-amber-600" },
  admin_access_denied: { label: "Access Denied", color: "bg-red-500/10 text-red-600" },
};

const ITEMS_PER_PAGE = 15;

// ── Admin API helper (uses Supabase JWT — no separate secret needed) ────

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

// ── Status config ────────────────────────────────────────────────

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

// ── Component ────────────────────────────────────────────────────
// NOTE: Route is now protected by <ProtectedRoute requiredRole="org_admin">
// so we no longer need an inline login screen or sessionStorage auth.

const AdminPortal = () => {
  const { user, profile, role, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [users, setUsers] = useState<PendingUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [pendingAction, setPendingAction] = useState<{
    user: PendingUser;
    type: "approve" | "reject" | "reinstate";
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // ── Fetch users (via edge function to bypass RLS) ─────────────

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

  // ── Fetch audit logs (#11) ──────────────────────────────────────

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
    fetchAuditLogs();
  }, [fetchUsers, fetchAuditLogs]);

  // ── Real-time subscription (#15) ────────────────────────────────

  useEffect(() => {
    const channel = supabase
      .channel("admin-profiles-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        fetchUsers();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchUsers]);

  // ── CSV Export (#20) ────────────────────────────────────────────

  const exportUsersCSV = () => {
    if (filtered.length === 0) return;
    const headers = ["Name", "Email", "Organization", "Role", "Status", "Registered"];
    const rows = filtered.map((u) => [
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
    toast({ title: "CSV exported", description: `${filtered.length} user records exported.` });
  };

  // ── Actions ───────────────────────────────────────────────────

  const handleConfirmAction = async () => {
    if (!pendingAction) return;
    setActionLoading(true);

    const newStatus = pendingAction.type === "reject" ? "rejected" : "approved";
    const actionLabel = pendingAction.type === "approve" ? "approved" : pendingAction.type === "reject" ? "rejected" : "reinstated";

    try {
      await callAdminAPI("", {
        method: "POST",
        body: JSON.stringify({
          user_id: pendingAction.user.user_id,
          new_status: newStatus,
        }),
      });

      toast({
        title: `User ${actionLabel}`,
        description: `${pendingAction.user.full_name} has been ${actionLabel} successfully.`,
      });

      await fetchUsers();
    } catch (err) {
      console.error("Action failed:", err);
      toast({
        title: "Action failed",
        description: err instanceof Error ? err.message : "Could not update user status.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
      setPendingAction(null);
    }
  };

  // ── Derived data ──────────────────────────────────────────────

  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = q
      ? u.full_name.toLowerCase().includes(q) ||
        u.organization?.toLowerCase().includes(q) ||
        u.user_id.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
      : true;
    const matchesFilter = filter === "all" || u.account_status === filter;
    return matchesSearch && matchesFilter;
  });

  const pendingCount = users.filter((u) => u.account_status === "pending").length;
  const approvedCount = users.filter((u) => u.account_status === "approved").length;
  const rejectedCount = users.filter((u) => u.account_status === "rejected").length;
  const issuerCount = users.filter((u) => u.role === "issuer").length;
  const verifierCount = users.filter((u) => u.role === "verifier").length;

  // Pagination (#14)
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginatedUsers = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  // Reset page when filter/search changes
  useEffect(() => { setPage(1); }, [filter, search]);

  // Initials avatar helper
  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
    : "SA";

  // ──────────────────────────────────────────────────────────────
  // ADMIN DASHBOARD (the only view — login is handled by ProtectedRoute)
  // ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      <div className="absolute inset-0 pattern-dots opacity-10 pointer-events-none" />

      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm px-4 sm:px-6 py-3 sticky top-0 z-50 relative">
        <div className="container mx-auto flex items-center justify-between">
          <motion.div
            initial={{ opacity: 0, x: -15 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            {/* Home button (#22) */}
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
                <Shield className="h-4 w-4 text-amber-500" />
              </div>
              <div>
                <span className="font-display text-base font-semibold tracking-tight">
                  Admin Portal
                </span>
                <p className="text-xs text-muted-foreground leading-none mt-0.5">
                  BlockID Platform
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

            {/* Notification bell (#21) */}
            <NotificationBell />

            {/* Theme toggle (#17) */}
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

      {/* Main */}
      <main className="flex-1 container mx-auto px-4 sm:px-6 py-6 sm:py-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-6"
        >
          {/* Title */}
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Account Approvals</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Review and manage issuer &amp; verifier registrations.
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            {[
              { label: "Pending", value: pendingCount, accent: "hsl(38 92% 50%)", iconColor: "text-amber-500", icon: Clock },
              { label: "Approved", value: approvedCount, accent: "hsl(160 60% 45%)", iconColor: "text-emerald-500", icon: CheckCircle2 },
              { label: "Rejected", value: rejectedCount, accent: "hsl(0 72% 51%)", iconColor: "text-red-500", icon: XCircle },
              { label: "Issuers", value: issuerCount, accent: "hsl(220 75% 55%)", iconColor: "text-blue-500", icon: Shield },
              { label: "Verifiers", value: verifierCount, accent: "hsl(270 60% 55%)", iconColor: "text-purple-500", icon: Building2 },
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

          {/* Tabs: Users + Audit Log (#11) */}
          <Tabs defaultValue="users" className="space-y-4">
            <div className="flex items-center justify-between">
              <TabsList className="grid grid-cols-2 w-full sm:w-64">
                <TabsTrigger value="users" className="gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Users
                </TabsTrigger>
                <TabsTrigger value="audit" className="gap-1.5">
                  <ScrollText className="h-3.5 w-3.5" /> Activity Log
                </TabsTrigger>
              </TabsList>

              {/* CSV Export (#20) */}
              <Button variant="outline" size="sm" className="rounded-xl gap-1.5 hidden sm:flex" onClick={exportUsersCSV} disabled={filtered.length === 0}>
                <Download className="h-3.5 w-3.5" /> Export CSV
              </Button>
            </div>

            {/* ── Users Tab ─────────────────────────────── */}
            <TabsContent value="users" className="space-y-4">
              {/* Filter buttons + search */}
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                <div className="flex gap-1.5 flex-wrap">
                  {(["all", "pending", "approved", "rejected"] as const).map((f) => (
                    <Button
                      key={f}
                      variant={filter === f ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFilter(f)}
                      className={`rounded-xl capitalize text-xs h-8 px-3 ${
                        filter === f ? "" : "text-muted-foreground"
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
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10 rounded-xl"
                  />
                </div>
              </div>

              {/* User list */}
              <Card className="border-border/50 overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="font-display text-lg flex items-center gap-2">
                      <Users className="h-5 w-5 text-primary" />
                      User Registrations
                    </CardTitle>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <ListFilter className="h-3 w-3" /> {filtered.length} total · Page {page}/{totalPages}
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="px-0 pb-0">
                  {loadingUsers ? (
                    <div className="py-16 text-center">
                      <RefreshCw className="h-6 w-6 text-muted-foreground/40 mx-auto mb-3 animate-spin" />
                      <p className="text-sm text-muted-foreground">Loading users...</p>
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="py-16 text-center">
                      <Users className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">
                        {filter === "pending" ? "No pending registrations 🎉" : "No users found."}
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
                                {/* Left — user info */}
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

                                {/* Right — badges + actions */}
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
                                        onClick={() => setPendingAction({ user: u, type: "approve" })}
                                      >
                                        <ThumbsUp className="h-3 w-3" /> Approve
                                      </Button>
                                      <Button
                                        size="sm"
                                        className="h-7 px-2.5 text-xs gap-1 bg-red-500/10 text-red-600 hover:bg-red-500/20 border border-red-500/20 rounded-lg"
                                        variant="ghost"
                                        onClick={() => setPendingAction({ user: u, type: "reject" })}
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
                                      onClick={() => setPendingAction({ user: u, type: "reinstate" })}
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

                      {/* Pagination controls (#14) */}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between px-6 py-3 border-t border-border/40">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={page <= 1}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            className="gap-1 text-xs rounded-lg"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" /> Previous
                          </Button>
                          <span className="text-xs text-muted-foreground">
                            Page {page} of {totalPages}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={page >= totalPages}
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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

            {/* ── Audit Log Tab (#11) ────────────────────── */}
            <TabsContent value="audit">
              <Card className="border-border/50 overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="font-display text-lg flex items-center gap-2">
                      <ScrollText className="h-5 w-5 text-primary" />
                      Admin Activity Log
                    </CardTitle>
                    <Button variant="outline" size="sm" onClick={fetchAuditLogs} disabled={loadingAudit} className="gap-1.5 rounded-xl">
                      <RefreshCw className={`h-3.5 w-3.5 ${loadingAudit ? "animate-spin" : ""}`} /> Refresh
                    </Button>
                  </div>
                  <CardDescription>Recent admin actions — approvals, rejections, and access events.</CardDescription>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  {loadingAudit ? (
                    <div className="py-16 text-center">
                      <RefreshCw className="h-6 w-6 text-muted-foreground/40 mx-auto mb-3 animate-spin" />
                      <p className="text-sm text-muted-foreground">Loading activity log...</p>
                    </div>
                  ) : auditLogs.length === 0 ? (
                    <div className="py-16 text-center">
                      <ScrollText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">No admin activity recorded yet.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/40">
                      {auditLogs.map((log, idx) => {
                        const info = ADMIN_ACTION_LABELS[log.action] || { label: log.action, color: "bg-muted text-muted-foreground" };
                        return (
                          <motion.div
                            key={log.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.02 }}
                            className="flex items-start gap-3 px-6 py-3 hover:bg-muted/20 transition-colors"
                          >
                            <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className={`text-xs px-2 py-0.5 rounded-full ${info.color}`}>
                                  {info.label}
                                </span>
                                <span className="text-xs text-muted-foreground font-mono truncate">
                                  {log.entity_id ? log.entity_id.substring(0, 8) + "..." : "—"}
                                </span>
                              </div>
                              {log.metadata?.admin_email && (
                                <p className="text-xs text-muted-foreground">
                                  By: {log.metadata.admin_email}
                                </p>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {new Date(log.created_at).toLocaleString()}
                            </span>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </motion.div>
      </main>

      {/* Confirm dialog */}
      <AlertDialog open={!!pendingAction} onOpenChange={(o) => !o && setPendingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction?.type === "approve"
                ? "Approve User?"
                : pendingAction?.type === "reject"
                ? "Reject User?"
                : "Reinstate User?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.type === "approve"
                ? `This will approve "${pendingAction?.user.full_name}" and grant them access to the ${pendingAction?.user.role} portal.`
                : pendingAction?.type === "reject"
                ? `This will reject "${pendingAction?.user.full_name}". They will not be able to access the platform.`
                : `This will reinstate "${pendingAction?.user.full_name}" and re-approve their access to the ${pendingAction?.user.role} portal.`}
              <br />
              <span className="text-xs font-mono mt-2 block text-muted-foreground">
                Role: {pendingAction?.user.role} · Org: {pendingAction?.user.organization || "—"}
                {pendingAction?.user.email ? ` · ${pendingAction.user.email}` : ""}
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
                : pendingAction?.type === "approve"
                ? "Approve User"
                : pendingAction?.type === "reject"
                ? "Reject User"
                : "Reinstate User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminPortal;
