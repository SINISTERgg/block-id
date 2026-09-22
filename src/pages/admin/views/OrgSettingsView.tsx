/**
 * OrgSettingsView — Organization settings and danger zone tab.
 * Extracted from AdminDashboard.tsx.
 */
import React from "react";
import { Settings, RefreshCw, UserPlus, AlertTriangle, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import MembersList, { type OrgMember } from "@/components/admin/MembersList";
import InviteMemberDialog from "@/components/admin/InviteMemberDialog";

interface OrgSettingsViewProps {
  orgName: string;
  setOrgName: (v: string) => void;
  onSaveSettings: () => void;
  savingSettings: boolean;
  members: OrgMember[];
  onRefreshMembers: () => void;
  inviteOpen: boolean;
  setInviteOpen: (v: boolean) => void;
  organizationName: string | null;
  memberCount: number;
  deleteOrgOpen: boolean;
  setDeleteOrgOpen: (v: boolean) => void;
  deleteOrgConfirmText: string;
  setDeleteOrgConfirmText: (v: string) => void;
  deletingOrg: boolean;
  onDeleteOrganization: () => void;
}

export const OrgSettingsView: React.FC<OrgSettingsViewProps> = ({
  orgName, setOrgName, onSaveSettings, savingSettings,
  members, onRefreshMembers, inviteOpen, setInviteOpen,
  organizationName, memberCount,
  deleteOrgOpen, setDeleteOrgOpen, deleteOrgConfirmText, setDeleteOrgConfirmText,
  deletingOrg, onDeleteOrganization,
}) => (
  <div className="space-y-6">
    {/* Org name */}
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
        <Button onClick={onSaveSettings} disabled={savingSettings} className="gap-2">
          {savingSettings ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Settings className="h-4 w-4" />}
          Save Settings
        </Button>
      </CardContent>
    </Card>

    {/* Members */}
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
        <MembersList members={members} onRefresh={onRefreshMembers} />
      </CardContent>
    </Card>

    {/* Danger Zone */}
    <Card className="border-red-500/40 bg-red-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-red-600">
          <AlertTriangle className="h-5 w-5" />
          Danger Zone
        </CardTitle>
        <CardDescription className="text-red-500/80">
          Destructive actions — these cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/5 p-4">
          <div>
            <p className="font-medium text-sm text-red-700 dark:text-red-400">Delete Organization</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Permanently dissolve <span className="font-semibold">{organizationName || "this organization"}</span> and unlink all members.
            </p>
          </div>
          <Button
            id="delete-org-btn"
            variant="destructive"
            size="sm"
            className="gap-2 shrink-0 ml-4"
            onClick={() => { setDeleteOrgConfirmText(""); setDeleteOrgOpen(true); }}
            disabled={!organizationName}
          >
            <Trash2 className="h-4 w-4" /> Delete Organization
          </Button>
        </div>
      </CardContent>
    </Card>

    {/* Invite dialog */}
    <InviteMemberDialog open={inviteOpen} onOpenChange={setInviteOpen} onSuccess={onRefreshMembers} />

    {/* Delete org confirmation */}
    <AlertDialog open={deleteOrgOpen} onOpenChange={(o) => { if (!deletingOrg) { setDeleteOrgOpen(o); setDeleteOrgConfirmText(""); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-red-600">
            <Trash2 className="h-5 w-5" /> Delete Organization
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                This will permanently delete{" "}
                <span className="font-semibold text-foreground">{organizationName}</span>{" "}
                and unlink all {memberCount} member{memberCount !== 1 ? "s" : ""}.
                This action <span className="font-semibold text-red-600">cannot be undone</span>.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="delete-org-confirm" className="text-xs text-muted-foreground">
                  Type <span className="font-mono font-bold text-foreground">{organizationName}</span> to confirm
                </Label>
                <Input
                  id="delete-org-confirm"
                  value={deleteOrgConfirmText}
                  onChange={(e) => setDeleteOrgConfirmText(e.target.value)}
                  placeholder={organizationName ?? ""}
                  className="border-red-500/40 focus-visible:ring-red-500/40"
                  disabled={deletingOrg}
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deletingOrg}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            id="delete-org-confirm-btn"
            onClick={onDeleteOrganization}
            disabled={deletingOrg || deleteOrgConfirmText !== organizationName}
            className="bg-red-600 hover:bg-red-700 text-white focus-visible:ring-red-600"
          >
            {deletingOrg ? (
              <><RefreshCw className="h-4 w-4 animate-spin mr-2" />Deleting...</>
            ) : (
              <><Trash2 className="h-4 w-4 mr-2" />Delete Organization</>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
);
