import { useState, useEffect, useCallback } from "react";
import {
  Users,
  Building2,
  Settings,
  Crown,
  Home,
  LogOut,
  Shield,
  Activity,
  ShieldCheck,
  ScrollText,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useLocation } from "react-router-dom";
import MembersList, { type OrgMember } from "@/components/admin/MembersList";
import NotificationBell from "@/components/NotificationBell";

// ── Extracted view components ─────────────────────────────────────────────────
import { StatsView, type PendingUser, type TrustedIssuer, type AuditEntry } from "./views/StatsView";
import { UsersView } from "./views/UsersView";
import { IssuersView } from "./views/IssuersView";
import { AuditView } from "./views/AuditView";
import { OrgSettingsView } from "./views/OrgSettingsView";

// ── Data helpers (kept here — they use supabase directly as before) ───────────

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

  const { error } = await supabase
    .from("profiles")
    .update({ account_status: status })
    .eq("user_id", userId);

  if (error) throw error;

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

  const { error } = await supabase
    .from("trusted_issuers")
    .update({
      verification_status: newStatus,
      verified_at: actionType === "accept" ? new Date().toISOString() : null,
      verified_by: adminUserId,
    })
    .eq("id", issuerId);

  if (error) throw error;

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

  await supabase.from("audit_logs").insert({
    user_id: adminUserId,
    action: actionType === "accept" ? "issuer_accepted" : "issuer_rejected",
    entity_type: "trusted_issuer",
    entity_id: issuerId,
    metadata: { action: actionType, issuer_id: issuerId },
  });
};

// ── Component ─────────────────────────────────────────────────────────────────

const AdminDashboard = () => {
  const { user, profile, role, signOut, refreshProfile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  // Members / org settings state
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [orgName, setOrgName] = useState(profile?.organization ?? "");
  const [savingSettings, setSavingSettings] = useState(false);

  // Users tab state
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userFilter, setUserFilter] = useState<"all" | "pending" | "approved" | "rejected" | "revoked">("all");
  const [userPage, setUserPage] = useState(1);
  const [pendingAction, setPendingAction] = useState<{
    user: PendingUser;
    type: "approve" | "reject" | "reinstate" | "revoke";
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Issuers tab state
  const [trustedIssuers, setTrustedIssuers] = useState<TrustedIssuer[]>([]);
  const [loadingIssuers, setLoadingIssuers] = useState(false);
  const [issuerSearch, setIssuerSearch] = useState("");
  const [issuerFilter, setIssuerFilter] = useState<"all" | "verified" | "pending" | "rejected">("all");
  const [pendingIssuerAction, setPendingIssuerAction] = useState<{
    issuer: TrustedIssuer;
    type: "accept" | "reject";
  } | null>(null);
  const [issuerActionLoading, setIssuerActionLoading] = useState(false);

  // Audit tab state
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Org deletion state
  const [deleteOrgOpen, setDeleteOrgOpen] = useState(false);
  const [deleteOrgConfirmText, setDeleteOrgConfirmText] = useState("");
  const [deletingOrg, setDeletingOrg] = useState(false);

  const currentTab = location.hash?.replace("#", "") || "overview";

  useEffect(() => {
    fetchMembers();
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

      const adminActions = ["account_approved", "account_rejected", "account_reinstated", "account_revoked", "admin_access_denied", "issuer_accepted", "issuer_rejected", "organization_deleted"];
      setAuditLogs((data || []).filter(log => adminActions.includes(log.action)));
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
      toast({ title: "Action failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
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
      toast({ title: "Action failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setIssuerActionLoading(false);
    }
  };

  const handleDeleteOrganization = async () => {
    if (!user || !profile?.organization) return;
    setDeletingOrg(true);
    try {
      const orgNameVal = profile.organization;

      const { error: profileErr } = await supabase
        .from("profiles")
        .update({ organization: null } as any)
        .eq("organization", orgNameVal);
      if (profileErr) throw profileErr;

      await supabase.from("audit_logs").insert({
        user_id: user.id,
        action: "organization_deleted",
        entity_type: "organization",
        entity_id: null,
        metadata: { organization_name: orgNameVal, deleted_by: user.id },
      });

      toast({ title: "Organization deleted", description: `"${orgNameVal}" has been deleted and all members have been unlinked.` });
      setDeleteOrgOpen(false);
      setDeleteOrgConfirmText("");
      await refreshProfile();
      fetchUsers();
      fetchAuditLogs();
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message || "Unknown error", variant: "destructive" });
    } finally {
      setDeletingOrg(false);
    }
  };

  return (
    <div className="min-h-screen bg-background relative">
      <div className="absolute inset-0 bg-grid-pattern bg-grid-pattern-fade opacity-40 pointer-events-none" />
      <div className="relative z-10">
        {/* Header */}
        <header className="border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 items-center justify-between">
              <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1 underline-brand">
                  <Home className="h-4 w-4" /> Home
                </Button>
                <span className="text-lg font-heading font-semibold uppercase tracking-tight text-foreground">
                  {profile?.organization || "Admin Portal"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <NotificationBell />
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

            <TabsContent value="overview">
              <StatsView users={users} trustedIssuers={trustedIssuers} auditLogs={auditLogs} />
            </TabsContent>

            <TabsContent value="users">
              <UsersView
                users={users}
                loading={loadingUsers}
                search={userSearch}
                setSearch={setUserSearch}
                filter={userFilter}
                setFilter={setUserFilter}
                page={userPage}
                setPage={setUserPage}
                onRefresh={fetchUsers}
                onAction={(user, type) => setPendingAction({ user, type })}
              />
            </TabsContent>

            <TabsContent value="issuers">
              <IssuersView
                issuers={trustedIssuers}
                loading={loadingIssuers}
                search={issuerSearch}
                setSearch={setIssuerSearch}
                filter={issuerFilter}
                setFilter={setIssuerFilter}
                onRefresh={fetchTrustedIssuersData}
                onAction={(issuer, type) => setPendingIssuerAction({ issuer, type })}
              />
            </TabsContent>

            <TabsContent value="organization">
              <OrgSettingsView
                orgName={orgName}
                setOrgName={setOrgName}
                onSaveSettings={handleSaveSettings}
                savingSettings={savingSettings}
                members={members}
                onRefreshMembers={fetchMembers}
                inviteOpen={inviteOpen}
                setInviteOpen={setInviteOpen}
                organizationName={profile?.organization ?? null}
                memberCount={members.length}
                deleteOrgOpen={deleteOrgOpen}
                setDeleteOrgOpen={setDeleteOrgOpen}
                deleteOrgConfirmText={deleteOrgConfirmText}
                setDeleteOrgConfirmText={setDeleteOrgConfirmText}
                deletingOrg={deletingOrg}
                onDeleteOrganization={handleDeleteOrganization}
              />
            </TabsContent>

            <TabsContent value="audit">
              <AuditView auditLogs={auditLogs} loading={loadingAudit} onRefresh={fetchAuditLogs} />
            </TabsContent>
          </Tabs>
        </main>
      </div>

      {/* User action confirmation dialog */}
      <AlertDialog open={!!pendingAction} onOpenChange={() => setPendingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction?.type === "approve" ? "Approve User"
                : pendingAction?.type === "reject" ? "Reject User"
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

      {/* Issuer action confirmation dialog */}
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
    </div>
  );
};

export default AdminDashboard;