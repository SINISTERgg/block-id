/**
 * UsersView — User approval management tab.
 * Extracted from AdminDashboard.tsx.
 */
import React from "react";
import {
  Search, RefreshCw, ThumbsUp, ThumbsDown, RotateCcw, XCircle,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { PendingUser } from "./StatsView";

const ITEMS_PER_PAGE = 15;

interface UsersViewProps {
  users: PendingUser[];
  loading: boolean;
  search: string;
  setSearch: (v: string) => void;
  filter: "all" | "pending" | "approved" | "rejected" | "revoked";
  setFilter: (v: "all" | "pending" | "approved" | "rejected" | "revoked") => void;
  page: number;
  setPage: (v: number) => void;
  onRefresh: () => void;
  onAction: (user: PendingUser, type: "approve" | "reject" | "reinstate" | "revoke") => void;
}

export const UsersView: React.FC<UsersViewProps> = ({
  users, loading, search, setSearch, filter, setFilter, page, setPage, onRefresh, onAction,
}) => {
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      !search ||
      u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.organization?.toLowerCase().includes(search.toLowerCase());
    const matchesFilter =
      filter === "all" ||
      (filter === "pending"  && u.account_status === "pending") ||
      (filter === "approved" && u.account_status === "approved") ||
      (filter === "revoked"  && u.account_status === "revoked") ||
      (filter === "rejected" && u.account_status === "rejected");
    return matchesSearch && matchesFilter;
  });

  const paginatedUsers = filteredUsers.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
  const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>User Approvals</CardTitle>
            <CardDescription>Review and approve new user registrations</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading} className="gap-1">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
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
                  onClick={() => { setFilter(f); setPage(1); }}
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
                        <Badge variant="outline" className="capitalize">{u.role}</Badge>
                      </td>
                      <td className="px-4 py-3 text-sm">{u.organization || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            u.account_status === "approved" ? "default"
                            : u.account_status === "rejected" || u.account_status === "revoked" ? "destructive"
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
                            <Button variant="outline" size="sm" className="h-7 gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50" onClick={() => onAction(u, "approve")}>
                              <ThumbsUp className="h-3 w-3" /> Approve
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 gap-1 text-red-600 border-red-200 hover:bg-red-50" onClick={() => onAction(u, "reject")}>
                              <ThumbsDown className="h-3 w-3" /> Reject
                            </Button>
                          </div>
                        )}
                        {u.account_status === "rejected" && (
                          <Button variant="outline" size="sm" className="h-7 gap-1" onClick={() => onAction(u, "reinstate")}>
                            <RotateCcw className="h-3 w-3" /> Reinstate
                          </Button>
                        )}
                        {u.account_status === "approved" && (
                          <Button variant="outline" size="sm" className="h-7 gap-1 text-red-600 border-red-200 hover:bg-red-50" onClick={() => onAction(u, "revoke")}>
                            <XCircle className="h-3 w-3" /> Revoke
                          </Button>
                        )}
                        {u.account_status === "revoked" && (
                          <Button variant="outline" size="sm" className="h-7 gap-1" onClick={() => onAction(u, "reinstate")}>
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
                <Button variant="outline" size="sm" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
