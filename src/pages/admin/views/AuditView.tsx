/**
 * AuditView — Admin audit log tab.
 * Extracted from AdminDashboard.tsx.
 */
import React from "react";
import { RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ADMIN_ACTION_LABELS, type AuditEntry } from "./StatsView";

interface AuditViewProps {
  auditLogs: AuditEntry[];
  loading: boolean;
  onRefresh: () => void;
}

export const AuditView: React.FC<AuditViewProps> = ({ auditLogs, loading, onRefresh }) => (
  <div className="space-y-6">
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Audit Logs</CardTitle>
          <CardDescription>Administrative actions and changes</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading} className="gap-1">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
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
  </div>
);
