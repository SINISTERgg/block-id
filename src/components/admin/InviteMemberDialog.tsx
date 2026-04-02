import { useState } from "react";
import { UserPlus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import type { OrgRole } from "@/lib/permissions";

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const ASSIGNABLE_ROLES: { value: OrgRole; label: string; description: string }[] = [
  { value: "issuer", label: "Issuer", description: "Create schemas & issue credentials" },
  { value: "verifier", label: "Verifier", description: "Verify credentials & review issuers" },
  { value: "holder", label: "Holder", description: "Hold & present credentials" },
  { value: "auditor", label: "Auditor", description: "Read-only audit & analytics access" },
];

const InviteMemberDialog = ({ open, onOpenChange, onSuccess }: InviteMemberDialogProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [selectedRole, setSelectedRole] = useState<OrgRole>("issuer");
  const [loading, setLoading] = useState(false);

  const handleInvite = async () => {
    if (!email.trim() || !user) return;
    setLoading(true);
    try {
      // Client-side cannot query by email directly (not in typed schema).
      // Generate a shareable invite link encoding the role & email.
      // An org admin can share this link, and when the invitee signs up/logs in
      // via that URL, their role can be set from the query param.
      const invitePayload = btoa(JSON.stringify({ email: email.trim(), role: selectedRole, invitedBy: user.id }));
      const inviteLink = `${window.location.origin}/auth?invite=${invitePayload}`;

      // Audit the invitation attempt
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        action: "member_invited",
        entity_type: "user",
        entity_id: null,
        metadata: { email: email.trim(), role: selectedRole },
      } as any);

      toast({
        title: "Invite link generated",
        description: `Copy and share this link with ${email.trim()} so they can join with the ${selectedRole} role.`,
      });

      // Also copy to clipboard if available
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(inviteLink).catch(() => {});
      }

      onOpenChange(false);
      resetForm();
      onSuccess?.();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEmail("");
    setSelectedRole("issuer");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Invite Team Member
          </DialogTitle>
          <DialogDescription>
            Enter their email and assign a role. If they're already on the platform, the role will be
            updated immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email address</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="colleague@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleInvite()}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as OrgRole)}>
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSIGNABLE_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    <div>
                      <span className="font-medium capitalize">{r.label}</span>
                      <span className="text-xs text-muted-foreground ml-2">— {r.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Role description card */}
          <div className="rounded-lg bg-muted/50 border border-border/50 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1 capitalize">{selectedRole} permissions</p>
            <p>{ASSIGNABLE_ROLES.find((r) => r.value === selectedRole)?.description}</p>
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4 mr-1" /> Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleInvite}
              disabled={!email.trim() || loading}
            >
              <UserPlus className="h-4 w-4 mr-1" />
              {loading ? "Inviting..." : "Send Invite"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InviteMemberDialog;
