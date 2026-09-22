/**
 * StatsView — Admin overview stats cards and recent activity.
 * Extracted from AdminDashboard.tsx.
 */
import React from "react";
import { Users, Clock, CheckCircle2, XCircle, Shield, ShieldCheck, Activity, ScrollText, Settings, UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: any;
  created_at: string;
}

const ADMIN_ACTION_LABELS: Record<string, { label: string; color: string }> = {
  account_approved:    { label: "Approved",        color: "bg-emerald-500/10 text-emerald-600" },
  account_rejected:    { label: "Rejected",         color: "bg-red-500/10 text-red-600" },
  account_reinstated:  { label: "Reinstated",       color: "bg-amber-500/10 text-amber-600" },
  admin_access_denied: { label: "Access Denied",    color: "bg-red-500/10 text-red-600" },
  issuer_accepted:     { label: "Issuer Verified",  color: "bg-emerald-500/10 text-emerald-600" },
  issuer_rejected:     { label: "Issuer Rejected",  color: "bg-red-500/10 text-red-600" },
  account_revoked:     { label: "Revoked",          color: "bg-red-500/10 text-red-600" },
  organization_deleted:{ label: "Org Deleted",      color: "bg-red-700/10 text-red-700" },
};

interface StatsViewProps {
  users: PendingUser[];
  trustedIssuers: TrustedIssuer[];
  auditLogs: AuditEntry[];
}

export const StatsView: React.FC<StatsViewProps> = ({ users, trustedIssuers, auditLogs }) => {
  const navigate = useNavigate();

  const statCards = [
    { label: "Total Users",       value: users.length,                                                        icon: Users,       accentColor: "#3b82f6", iconColor: "text-blue-500" },
    { label: "Pending Approval",  value: users.filter((u) => u.account_status === "pending").length,           icon: Clock,       accentColor: "#f59e0b", iconColor: "text-amber-500" },
    { label: "Approved",          value: users.filter((u) => u.account_status === "approved").length,          icon: CheckCircle2,accentColor: "#10b981", iconColor: "text-emerald-500" },
    { label: "Rejected",          value: users.filter((u) => u.account_status === "rejected").length,          icon: XCircle,     accentColor: "#ef4444", iconColor: "text-red-500" },
    { label: "Trusted Issuers",   value: trustedIssuers.length,                                                icon: ShieldCheck, accentColor: "#8b5cf6", iconColor: "text-purple-500" },
    { label: "Pending Issuers",   value: trustedIssuers.filter((i) => i.verification_status === "pending").length, icon: Shield, accentColor: "#f97316", iconColor: "text-orange-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Card className="relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: stat.accentColor }} />
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
    </div>
  );
};

export { ADMIN_ACTION_LABELS };
export type { PendingUser, TrustedIssuer, AuditEntry };
