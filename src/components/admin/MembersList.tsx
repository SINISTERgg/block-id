import { useState } from "react";
import {
  Shield,
  ShieldCheck,
  Trash2,
  ChevronDown,
  User,
  Crown,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import type { OrgRole } from "@/lib/permissions";
import { motion } from "framer-motion";

export interface OrgMember {
  user_id: string;
  full_name: string;
  organization: string;
  role: string;
  created_at?: string;
}

interface MembersListProps {
  members: OrgMember[];
  onRefresh: () => void;
}

const ROLE_CONFIG: Record<string, {
  badgeClass: string;
  glowClass: string;
  avatarBg: string;
  avatarColor: string;
  icon: React.ReactNode;
  label: string;
}> = {
  org_admin: {
    badgeClass: "bg-amber-500/10 text-amber-600 border-amber-500/25",
    glowClass: "badge-glow-admin",
    avatarBg: "bg-amber-500/15",
    avatarColor: "text-amber-600",
    icon: <Crown className="h-3 w-3" />,
    label: "Org Admin",
  },
  issuer: {
    badgeClass: "bg-blue-500/10 text-blue-600 border-blue-500/25",
    glowClass: "badge-glow-issuer",
    avatarBg: "bg-blue-500/10",
    avatarColor: "text-blue-600",
    icon: <ShieldCheck className="h-3 w-3" />,
    label: "Issuer",
  },
  verifier: {
    badgeClass: "bg-purple-500/10 text-purple-600 border-purple-500/25",
    glowClass: "badge-glow-verifier",
    avatarBg: "bg-purple-500/10",
    avatarColor: "text-purple-600",
    icon: <Shield className="h-3 w-3" />,
    label: "Verifier",
  },
  holder: {
    badgeClass: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25",
    glowClass: "badge-glow-holder",
    avatarBg: "bg-emerald-500/10",
    avatarColor: "text-emerald-600",
    icon: <User className="h-3 w-3" />,
    label: "Holder",
  },
  auditor: {
    badgeClass: "bg-violet-500/10 text-violet-600 border-violet-500/25",
    glowClass: "",
    avatarBg: "bg-violet-500/10",
    avatarColor: "text-violet-600",
    icon: <User className="h-3 w-3" />,
    label: "Auditor",
  },
};

const CHANGEABLE_ROLES: OrgRole[] = ["issuer", "verifier", "holder", "auditor"];

const MembersList = ({ members, onRefresh }: MembersListProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<OrgMember | null>(null);

  const handleRoleChange = async (member: OrgMember, newRole: OrgRole) => {
    const { error } = await supabase
      .from("user_roles")
      .update({ role: newRole } as any)
      .eq("user_id", member.user_id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    await supabase.from("audit_logs").insert({
      user_id: user!.id,
      action: "member_role_changed",
      entity_type: "user",
      entity_id: member.user_id,
      metadata: { from_role: member.role, to_role: newRole, member_name: member.full_name },
    } as any);

    toast({ title: "Role updated", description: `${member.full_name}'s role changed to ${newRole}.` });
    onRefresh();
  };

  const handleRemove = async () => {
    if (!memberToRemove) return;
    setRemovingId(memberToRemove.user_id);
    try {
      // Downgrade to "holder" instead of deleting the row — Issue #6
      const { error } = await supabase
        .from("user_roles")
        .update({ role: "holder" } as any)
        .eq("user_id", memberToRemove.user_id);

      if (error) throw error;

      await supabase.from("audit_logs").insert({
        user_id: user!.id,
        action: "member_removed",
        entity_type: "user",
        entity_id: memberToRemove.user_id,
        metadata: { member_name: memberToRemove.full_name, previous_role: memberToRemove.role, new_role: "holder" },
      } as any);

      toast({ title: "Member removed", description: `${memberToRemove.full_name} has been downgraded to holder.` });
      onRefresh();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setRemovingId(null);
      setMemberToRemove(null);
    }
  };

  // ── Empty state ──
  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="w-16 h-16 rounded-2xl bg-muted/60 flex items-center justify-center">
          <Users className="h-7 w-7 text-muted-foreground/40" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">No members yet</p>
          <p className="text-xs text-muted-foreground mt-0.5">Invite someone to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-border/50">
            <TableHead className="font-semibold text-foreground/70">Member</TableHead>
            <TableHead className="font-semibold text-foreground/70">Organization</TableHead>
            <TableHead className="font-semibold text-foreground/70">Role</TableHead>
            <TableHead className="text-right font-semibold text-foreground/70">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member, idx) => {
            const roleCfg = ROLE_CONFIG[member.role] ?? ROLE_CONFIG.holder;
            // Two-letter initials
            const initials = member.full_name
              ? member.full_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
              : "?";

            return (
              <motion.tr
                key={member.user_id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04 }}
                className="hover:bg-muted/25 transition-colors border-border/40"
              >
                {/* Member name + avatar */}
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${roleCfg.avatarBg} border border-current/10`}
                    >
                      <span className={`text-xs font-bold ${roleCfg.avatarColor}`}>{initials}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{member.full_name}</p>
                      {member.user_id === user?.id && (
                        <span className="text-xs text-muted-foreground">(you)</span>
                      )}
                    </div>
                  </div>
                </TableCell>

                {/* Org */}
                <TableCell className="text-sm text-muted-foreground">
                  {member.organization || "—"}
                </TableCell>

                {/* Role badge */}
                <TableCell>
                  <Badge
                    variant="outline"
                    className={`flex items-center gap-1 w-fit text-xs font-semibold capitalize ${roleCfg.badgeClass} ${roleCfg.glowClass}`}
                  >
                    {roleCfg.icon}
                    {roleCfg.label}
                  </Badge>
                </TableCell>

                {/* Actions */}
                <TableCell className="text-right">
                  {member.user_id !== user?.id && member.role !== "org_admin" && (
                    <div className="flex items-center justify-end gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1 rounded-lg border-border/60">
                            Change role <ChevronDown className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {CHANGEABLE_ROLES.filter((r) => r !== member.role).map((r) => {
                            const rCfg = ROLE_CONFIG[r] ?? ROLE_CONFIG.holder;
                            return (
                              <DropdownMenuItem
                                key={r}
                                onClick={() => handleRoleChange(member, r)}
                                className="capitalize text-sm gap-2"
                              >
                                <span className={rCfg.avatarColor}>{rCfg.icon}</span>
                                {rCfg.label}
                              </DropdownMenuItem>
                            );
                          })}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10 rounded-lg"
                        onClick={() => setMemberToRemove(member)}
                        disabled={removingId === member.user_id}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </motion.tr>
            );
          })}
        </TableBody>
      </Table>

      {/* Confirm remove dialog */}
      <AlertDialog open={!!memberToRemove} onOpenChange={(o) => !o && setMemberToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>{memberToRemove?.full_name}</strong> from your organization and downgrade their role to <strong>holder</strong>. They will lose access to role-gated features but their account will remain active.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={handleRemove}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default MembersList;
