import { useState, useEffect } from "react";
import {
  Users,
  Building2,
  UserPlus,
  Settings,
  Crown,
  ChevronRight,
  Shield,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import MembersList, { type OrgMember } from "@/components/admin/MembersList";
import InviteMemberDialog from "@/components/admin/InviteMemberDialog";
import { motion } from "framer-motion";
import ParticleBackground from "@/components/ui/ParticleBackground";
import ThemeToggle from "@/components/ui/ThemeToggle";
import NotificationBell from "@/components/NotificationBell";
import { useNavigate } from "react-router-dom";
import { Home, LogOut } from "lucide-react";

interface StatCard {
  label: string;
  value: number;
  icon: React.ElementType;
  accentColor: string;       // CSS color string for top strip + icon bg
  iconColor: string;         // Tailwind text class
}

const OrgManagement = () => {
  const { user, profile, role, signOut, refreshProfile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);

  const [orgName, setOrgName] = useState(profile?.organization ?? "");
  const [savingSettings, setSavingSettings] = useState(false);

  const [pendingIssuers, setPendingIssuers] = useState(0);

  useEffect(() => {
    fetchMembers();
    fetchPendingIssuers();
  }, [profile?.organization]);

  useEffect(() => {
    setOrgName(profile?.organization ?? "");
  }, [profile?.organization]);

  const fetchMembers = async () => {
    setLoadingMembers(true);
    try {
      const orgNameVal = profile?.organization;
      if (!orgNameVal) { setMembers([]); return; }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, organization")
        .eq("organization", orgNameVal);

      if (!profiles || profiles.length === 0) { setMembers([]); return; }

      const userIds = profiles.map((p: any) => p.user_id);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds) as any;

      if (!roles) return;

      const combined: OrgMember[] = roles.map((r: any) => {
        const p = profiles.find((p: any) => p.user_id === r.user_id);
        return {
          user_id: r.user_id,
          full_name: p?.full_name ?? "Unknown",
          organization: p?.organization ?? "",
          role: r.role,
        };
      });
      setMembers(combined);
    } finally {
      setLoadingMembers(false);
    }
  };

  const fetchPendingIssuers = async () => {
    const { count } = await supabase
      .from("trusted_issuers")
      .select("id", { count: "exact", head: true })
      .eq("verification_status", "pending");
    setPendingIssuers(count ?? 0);
  };

  const saveOrgSettings = async () => {
    if (!user) return;
    setSavingSettings(true);
    const { error } = await supabase
      .from("profiles")
      .update({ organization: orgName } as any)
      .eq("user_id", user.id);
    setSavingSettings(false);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    await refreshProfile();
    toast({ title: "Settings saved", description: "Organization name updated." });
  };

  const roleCount = (r: string) => members.filter((m) => m.role === r).length;

  const statCards: StatCard[] = [
    {
      label: "Total Members",
      value: members.length,
      icon: Users,
      accentColor: "hsl(var(--primary))",
      iconColor: "text-primary",
    },
    {
      label: "Issuers",
      value: roleCount("issuer"),
      icon: Shield,
      accentColor: "hsl(220 72% 55%)",
      iconColor: "text-blue-500",
    },
    {
      label: "Verifiers",
      value: roleCount("verifier"),
      icon: Building2,
      accentColor: "hsl(262 65% 55%)",
      iconColor: "text-purple-500",
    },
    {
      label: "Pending Issuers",
      value: pendingIssuers,
      icon: Clock,
      accentColor: "hsl(25 95% 53%)",
      iconColor: "text-orange-500",
    },
  ];

  // Initials avatar helper
  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
    : "U";

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      <ParticleBackground particleCount={20} className="opacity-20" />
      <div className="absolute inset-0 mesh-gradient pointer-events-none" />

      {/* Header */}
      <header className="glass-header px-4 sm:px-6 py-3 sticky top-0 z-50 relative">
        <div className="container mx-auto flex items-center justify-between">
          <motion.div
            initial={{ opacity: 0, x: -15 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={() => navigate("/")} className="border-border hover:border-primary hover:text-primary transition-colors">
                  <Home className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Back to Home</TooltipContent>
            </Tooltip>
            <div className="flex items-center gap-2.5">
              {/* Gold crown icon */}
              <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400/20 to-amber-600/20 border border-amber-500/25 flex items-center justify-center">
                <Crown className="h-4.5 w-4.5 text-amber-500" />
                <div className="absolute -inset-0.5 rounded-xl border border-amber-400/10 pointer-events-none" />
              </div>
              <div>
                <span className="font-display text-base font-semibold tracking-tight">
                  Org Admin
                </span>
                {profile?.organization && (
                  <p className="text-xs text-muted-foreground leading-none mt-0.5">
                    {profile.organization}
                  </p>
                )}
              </div>
            </div>
          </motion.div>

          <div className="flex items-center gap-2">
            <NotificationBell />
            <ThemeToggle className="shrink-0 rounded-xl" />
            <div className="hidden sm:flex items-center gap-2.5 border-l border-border/50 pl-3">
              {/* Initials avatar */}
              <div className="w-8 h-8 rounded-full bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-amber-600">{initials}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-foreground leading-none">{profile?.full_name}</span>
                <Badge variant="outline" className="mt-0.5 text-[10px] capitalize bg-amber-500/10 text-amber-600 border-amber-500/20 w-fit px-1.5 py-0 leading-4 badge-glow-admin">
                  <Crown className="h-2.5 w-2.5 mr-0.5" />{role}
                </Badge>
              </div>
              <Button variant="ghost" size="icon" onClick={() => signOut().then(() => navigate("/"))} className="rounded-xl h-8 w-8">
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
          {/* Page title */}
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Organization Management</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage your team members, roles, and organization settings.
            </p>
          </div>

          {/* Stats — glassmorphic with colored top accent */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {statCards.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                whileHover={{ y: -3, transition: { duration: 0.2 } }}
                className="stat-card p-5"
                style={{ "--stat-accent": s.accentColor } as React.CSSProperties}
              >
                <div className="flex items-start justify-between mb-3">
                  <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${s.accentColor}18` }}
                  >
                    <s.icon className={`h-3.5 w-3.5 ${s.iconColor}`} />
                  </div>
                </div>
                <p className="text-3xl font-display font-bold text-foreground">{s.value}</p>
              </motion.div>
            ))}
          </div>

          {/* Tabs */}
          <Tabs defaultValue="members" className="space-y-4">
            <TabsList className="grid grid-cols-2 w-full sm:w-72">
              <TabsTrigger value="members" className="gap-1.5">
                <Users className="h-3.5 w-3.5" /> Members
              </TabsTrigger>
              <TabsTrigger value="settings" className="gap-1.5">
                <Settings className="h-3.5 w-3.5" /> Settings
              </TabsTrigger>
            </TabsList>

            {/* Members tab */}
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
                  ) : (
                    <MembersList members={members} onRefresh={fetchMembers} />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Settings tab */}
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
                      <Badge variant="outline" className="capitalize text-sm bg-amber-500/10 text-amber-600 border-amber-500/20 badge-glow-admin">
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

      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onSuccess={fetchMembers}
      />
    </div>
  );
};

export default OrgManagement;
