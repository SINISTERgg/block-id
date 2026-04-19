import { useState, useEffect, useCallback } from "react";
import {
  Fingerprint, LogOut, Shield, Users, CheckCircle2, XCircle,
  Clock, Search, ThumbsUp, ThumbsDown, Eye, EyeOff,
  Lock, Building2, RefreshCw, ListFilter, ChevronRight, Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";

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

// ── Admin credentials (standalone portal — not Supabase Auth) ────

const ADMIN_EMAIL = "admin@blockid.dev";
const ADMIN_PASSWORD = "BlockID@Admin2024";
const ADMIN_SECRET = "blockid-admin-secret-2024";

const callAdminAPI = async (path: string, options: RequestInit = {}) => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const resp = await fetch(`${supabaseUrl}/functions/v1/admin-users${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": ADMIN_SECRET,
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

const AdminPortal = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [users, setUsers] = useState<PendingUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [pendingAction, setPendingAction] = useState<{
    user: PendingUser;
    type: "approve" | "reject";
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Check session on mount
  useEffect(() => {
    const stored = sessionStorage.getItem("blockid_admin_session");
    if (stored === "authenticated") {
      setIsAuthenticated(true);
    }
  }, []);

  // ── Auth (local credentials — no Supabase Auth dependency) ────

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError("");

    try {
      // Local credential check
      if (loginEmail !== ADMIN_EMAIL || loginPassword !== ADMIN_PASSWORD) {
        setLoginError("Invalid admin credentials");
        return;
      }

      // Verify the admin secret works by doing a test fetch
      await callAdminAPI("?action=list", { method: "GET" });

      sessionStorage.setItem("blockid_admin_session", "authenticated");
      setIsAuthenticated(true);
    } catch (err) {
      console.error("Admin login error:", err);
      setLoginError("Login failed. Could not connect to admin API.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("blockid_admin_session");
    setIsAuthenticated(false);
    setLoginEmail("");
    setLoginPassword("");
  };

  // ── Fetch users (via edge function to bypass RLS) ─────────────

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const result = await callAdminAPI("?action=list", { method: "GET" });
      setUsers(result.users || []);
    } catch (err) {
      console.error("Failed to fetch users:", err);
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) fetchUsers();
  }, [isAuthenticated, fetchUsers]);

  // ── Actions ───────────────────────────────────────────────────

  const handleConfirmAction = async () => {
    if (!pendingAction) return;
    setActionLoading(true);

    const newStatus = pendingAction.type === "approve" ? "approved" : "rejected";
    try {
      await callAdminAPI("", {
        method: "POST",
        body: JSON.stringify({
          user_id: pendingAction.user.user_id,
          new_status: newStatus,
        }),
      });

      await fetchUsers();
    } catch (err) {
      console.error("Action failed:", err);
    } finally {
      setActionLoading(false);
      setPendingAction(null);
    }
  };

  // ── Derived data ──────────────────────────────────────────────

  const filtered = users.filter((u) => {
    const matchesSearch = search.trim()
      ? u.full_name.toLowerCase().includes(search.toLowerCase()) ||
        u.organization?.toLowerCase().includes(search.toLowerCase()) ||
        u.user_id.toLowerCase().includes(search.toLowerCase())
      : true;
    const matchesFilter = filter === "all" || u.account_status === filter;
    return matchesSearch && matchesFilter;
  });

  const pendingCount = users.filter((u) => u.account_status === "pending").length;
  const approvedCount = users.filter((u) => u.account_status === "approved").length;
  const rejectedCount = users.filter((u) => u.account_status === "rejected").length;
  const issuerCount = users.filter((u) => u.role === "issuer").length;
  const verifierCount = users.filter((u) => u.role === "verifier").length;

  // ──────────────────────────────────────────────────────────────
  // LOGIN SCREEN
  // ──────────────────────────────────────────────────────────────

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center relative overflow-hidden px-6">
        <div className="absolute inset-0 pattern-dots opacity-30" />
        <div className="absolute top-1/3 -left-48 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 -right-48 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative z-10 w-full max-w-sm"
        >
          {/* Brand */}
          <div className="flex items-center justify-center gap-2 mb-10">
            <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
              <Fingerprint className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-display text-xl font-bold tracking-tight">BlockID</span>
          </div>

          <Card className="solid-card">
            <CardHeader className="pb-4">
              <div className="w-14 h-14 bg-gradient-to-br from-amber-400/20 to-amber-600/20 border border-amber-500/25 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Shield className="h-7 w-7 text-amber-500" />
              </div>
              <CardTitle className="font-display text-xl text-center">Admin Portal</CardTitle>
              <CardDescription className="text-center">
                Sign in with your administrator credentials
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="admin-email">Admin Email</Label>
                  <Input
                    id="admin-email"
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                    placeholder="admin@blockid.dev"
                    className="input-solid h-11"
                    autoComplete="email"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="admin-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="admin-password"
                      type={showPassword ? "text" : "password"}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                      placeholder="••••••••"
                      className="input-solid h-11 pr-10"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {loginError && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-center"
                  >
                    {loginError}
                  </motion.div>
                )}

                <Button
                  type="submit"
                  className="w-full btn-primary h-11"
                  disabled={loginLoading}
                >
                  {loginLoading ? "Signing in..." : "Sign In as Admin"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="mt-6 text-xs text-muted-foreground/60 flex items-center justify-center gap-2">
            <Lock className="h-3 w-3" />
            BlockID Admin Portal · Authorized access only
          </p>
        </motion.div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────
  // ADMIN DASHBOARD
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

            <div className="hidden sm:flex items-center gap-2.5 border-l border-border/50 pl-3">
              <div className="w-8 h-8 rounded-full bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-amber-600">SA</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-foreground leading-none">Super Admin</span>
                <span className="text-[10px] text-muted-foreground">{ADMIN_EMAIL}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
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
              Review and manage issuer & verifier registrations.
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

          {/* Filter tabs + search */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="flex gap-1.5">
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
                placeholder="Search by name, org, or ID..."
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
                  <ListFilter className="h-3 w-3" /> {filtered.length} shown
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
                <div className="divide-y divide-border/40">
                  <AnimatePresence>
                    {filtered.map((u, idx) => {
                      const cfg = STATUS_CONFIG[u.account_status] || STATUS_CONFIG.pending;
                      const StatusIcon = cfg.icon;
                      const isPending = u.account_status === "pending";
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
                            {/* Role avatar */}
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
                            {/* Role badge */}
                            <span className={`text-xs px-2 py-0.5 rounded-full capitalize border border-border/50 ${
                              isIssuer
                                ? "bg-blue-500/10 text-blue-600 border-blue-500/20"
                                : "bg-purple-500/10 text-purple-600 border-purple-500/20"
                            }`}>
                              {u.role}
                            </span>

                            {/* Status badge */}
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

                            {/* Actions for pending users */}
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
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </main>

      {/* Confirm dialog */}
      <AlertDialog open={!!pendingAction} onOpenChange={(o) => !o && setPendingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction?.type === "approve" ? "Approve User?" : "Reject User?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.type === "approve"
                ? `This will approve "${pendingAction?.user.full_name}" and grant them access to the ${pendingAction?.user.role} portal.`
                : `This will reject "${pendingAction?.user.full_name}". They will not be able to access the platform.`}
              <br />
              <span className="text-xs font-mono mt-2 block text-muted-foreground">
                Role: {pendingAction?.user.role} · Org: {pendingAction?.user.organization || "—"}
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
                : "Reject User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminPortal;
