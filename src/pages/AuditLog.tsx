import { useState, useEffect } from "react";
import { ArrowLeft, ScrollText, Shield, Search, Filter, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import ParticleBackground from "@/components/ui/ParticleBackground";
import AnimatedCounter from "@/components/ui/AnimatedCounter";
import DashboardSkeleton from "@/components/ui/DashboardSkeleton";

interface AuditEntry {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: any;
  created_at: string;
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  credential_issued: { label: "Issued", color: "bg-accent text-accent-foreground" },
  credential_verified: { label: "Verified", color: "bg-primary/10 text-primary" },
  credential_revoked: { label: "Revoked", color: "bg-destructive/10 text-destructive" },
  credential_shared: { label: "Shared", color: "bg-muted text-muted-foreground" },
  batch_issuance: { label: "Batch", color: "bg-accent text-accent-foreground" },
  schema_created: { label: "Schema", color: "bg-primary/10 text-primary" },
  schema_versioned: { label: "Versioned", color: "bg-muted text-muted-foreground" },
};

const AuditLog = () => {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Task #23: Export audit logs as CSV
  const exportCSV = () => {
    if (filtered.length === 0) return;
    const headers = ["Timestamp", "Action", "Entity Type", "Entity ID", "Metadata"];
    const rows = filtered.map(l => [
      new Date(l.created_at).toISOString(),
      l.action,
      l.entity_type,
      l.entity_id || "",
      JSON.stringify(l.metadata || {}),
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `blockid-audit-log-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exported", description: `${filtered.length} records exported.` });
  };

  // Task #23: Export audit logs as JSON
  const exportJSON = () => {
    if (filtered.length === 0) return;
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `blockid-audit-log-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "JSON exported", description: `${filtered.length} records exported.` });
  };

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    const fetchLogs = async () => {
      setIsLoading(true);
      let query = supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (actionFilter !== "all") {
        query = query.eq("action", actionFilter);
      }

      const { data } = await query;
      if (data) setLogs(data as any);
      setIsLoading(false);
    };

    fetchLogs();
  }, [user, actionFilter]);

  const filtered = search.trim()
    ? logs.filter(
        (l) =>
          l.action.toLowerCase().includes(search.toLowerCase()) ||
          l.entity_type.toLowerCase().includes(search.toLowerCase()) ||
          JSON.stringify(l.metadata).toLowerCase().includes(search.toLowerCase())
      )
    : logs;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden">
        <ParticleBackground particleCount={25} className="opacity-20" />
        <div className="absolute inset-0 mesh-gradient pointer-events-none" />
        <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 relative z-10">
          <DashboardSkeleton stats={4} showCharts={false} listItems={6} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <ParticleBackground particleCount={25} className="opacity-20" />
      <div className="absolute inset-0 mesh-gradient pointer-events-none" />

      <header className="glass-header px-4 sm:px-6 py-3 sticky top-0 z-50 relative">
        <div className="container mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-xl">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="relative">
            <ScrollText className="h-5 w-5 text-primary" />
            <div className="absolute -inset-1 bg-primary/20 rounded-full blur-md -z-10 animate-glow-pulse" />
          </div>
          <span className="font-display text-lg font-semibold tracking-tight">Audit Trail</span>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 relative z-10">
        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          <Card className="glass-card border-0 rounded-2xl">
            <CardContent className="pt-6">
              <AnimatedCounter value={logs.length} label="Total Events" />
            </CardContent>
          </Card>
          <Card className="glass-card border-0 rounded-2xl">
            <CardContent className="pt-6">
              <AnimatedCounter
                value={logs.filter((l) => l.action === "credential_issued").length}
                label="Issuances"
              />
            </CardContent>
          </Card>
          <Card className="glass-card border-0 rounded-2xl">
            <CardContent className="pt-6">
              <AnimatedCounter
                value={logs.filter((l) => l.action === "credential_verified").length}
                label="Verifications"
              />
            </CardContent>
          </Card>
          <Card className="glass-card border-0 rounded-2xl">
            <CardContent className="pt-6">
              <AnimatedCounter
                value={logs.filter((l) => l.metadata?.signed_by_wallet).length}
                label="Wallet Signed"
              />
            </CardContent>
          </Card>
        </motion.div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex gap-3 flex-wrap"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search audit logs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 rounded-xl glass border-0"
            />
          </div>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-44 rounded-xl glass border-0">
              <Filter className="h-3 w-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="credential_issued">Issued</SelectItem>
              <SelectItem value="credential_verified">Verified</SelectItem>
              <SelectItem value="credential_revoked">Revoked</SelectItem>
              <SelectItem value="batch_issuance">Batch</SelectItem>
              <SelectItem value="schema_created">Schema Created</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={exportCSV} disabled={filtered.length === 0}>
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={exportJSON} disabled={filtered.length === 0}>
            <Download className="h-3.5 w-3.5" /> JSON
          </Button>
        </motion.div>

        {/* Log entries */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="glass-card border-0 rounded-2xl">
            <CardHeader>
              <CardTitle className="font-display text-lg flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" /> Event Log
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filtered.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">No audit events found.</div>
              ) : (
                <div className="space-y-2">
                  {filtered.map((log, index) => {
                    const actionInfo = ACTION_LABELS[log.action] || { label: log.action, color: "bg-muted text-muted-foreground" };
                    return (
                      <motion.div
                        key={log.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.02 }}
                        className="flex items-start gap-3 p-3 rounded-xl border border-border/30 hover:bg-muted/20 transition-all hover:border-primary/20"
                      >
                        <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0 animate-glow-pulse" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${actionInfo.color}`}>
                              {actionInfo.label}
                            </span>
                            <span className="text-xs text-muted-foreground">{log.entity_type}</span>
                            {log.metadata?.signed_by_wallet && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">🔏 Signed</span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground space-y-0.5">
                            {log.entity_id && (
                              <p className="font-mono truncate">ID: {log.entity_id}</p>
                            )}
                            {log.metadata?.holder_did && (
                              <p className="truncate">Holder: {log.metadata.holder_did}</p>
                            )}
                            {log.metadata?.schema_name && (
                              <p>Schema: {log.metadata.schema_name}</p>
                            )}
                            {log.metadata?.signer_address && (
                              <p className="font-mono">Signer: {log.metadata.signer_address.substring(0, 10)}...</p>
                            )}
                            {log.metadata?.total != null && (
                              <p>Batch: {log.metadata.issued}/{log.metadata.total} issued, {log.metadata.failed} failed</p>
                            )}
                            {log.metadata?.result && (
                              <p>Result: <span className={log.metadata.result === "valid" ? "text-accent-foreground" : "text-destructive"}>{log.metadata.result}</span></p>
                            )}
                          </div>
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
        </motion.div>
      </main>
    </div>
  );
};

export default AuditLog;
