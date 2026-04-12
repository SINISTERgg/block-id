import { useMemo } from "react";
import { CheckCircle2, XCircle, Clock, Brain, TrendingUp, BarChart3, Link2, Eye, Lock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DIDResolver from "@/components/DIDResolver";
import TrustedIssuerRegistry from "@/components/TrustedIssuerRegistry";
import type { VerificationRecord } from "@/services/api/verifier.service";

const CHART_COLORS = ["hsl(175, 60%, 38%)", "hsl(0, 72%, 51%)", "hsl(45, 80%, 55%)"];

interface VerifierDashboardViewProps {
  records: VerificationRecord[];
}

const VerifierDashboardView = ({ records }: VerifierDashboardViewProps) => {
  const verified = records.filter((r) => r.status === "verified" || r.status === "accepted").length;
  const pending = records.filter((r) => r.status === "pending").length;
  const rejected = records.filter((r) => r.status === "rejected").length;
  const aiAnalyzedCount = records.filter((r) => r.ai_analysis).length;
  const docsLive = records.filter((r) => {
    if (!r.shared_credential_data) return false;
    if (r.storage_consent) return true;
    if (!r.access_expires_at) return false;
    return new Date(r.access_expires_at).getTime() > Date.now();
  }).length;
  const stored = records.filter((r) => r.storage_consent && r.shared_credential_data).length;

  const avgConfidence = useMemo(() => {
    const analyzed = records.filter((r) => (r.ai_analysis as any)?.confidence);
    if (analyzed.length === 0) return 0;
    return Math.round(analyzed.reduce((sum, r) => sum + (r.ai_analysis as any).confidence, 0) / analyzed.length);
  }, [records]);

  const statusDistribution = useMemo(() => [
    { name: "Verified", value: verified },
    { name: "Rejected", value: rejected },
    { name: "Pending", value: pending },
  ].filter((d) => d.value > 0), [verified, rejected, pending]);

  const monthlyVerifications = useMemo(() => {
    const map: Record<string, number> = {};
    records.forEach((r) => {
      const month = new Date(r.created_at).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      map[month] = (map[month] || 0) + 1;
    });
    return Object.entries(map).map(([month, count]) => ({ month, count })).reverse().slice(-6);
  }, [records]);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { icon: CheckCircle2, value: verified, label: "Verified" },
          { icon: Clock, value: pending, label: "Pending" },
          { icon: XCircle, value: rejected, label: "Rejected" },
          { icon: Eye, value: docsLive, label: "Docs Live" },
          { icon: Lock, value: stored, label: "Stored" },
          { icon: Brain, value: aiAnalyzedCount > 0 ? `${avgConfidence}%` : "—", label: "AI Confidence" },
        ].map(({ icon: Icon, value, label }) => (
          <Card key={label}><CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-verifier-muted flex items-center justify-center">
                <Icon className="h-5 w-5" style={{ color: "hsl(var(--verifier))" }} />
              </div>
              <div>
                <p className="text-2xl font-display font-bold text-foreground">{value}</p>
                <p className="text-sm text-muted-foreground">{label}</p>
              </div>
            </div>
          </CardContent></Card>
        ))}
      </div>

      {records.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="font-display text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" style={{ color: "hsl(var(--verifier))" }} />Verification Trend</CardTitle></CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyVerifications}>
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="count" fill="hsl(var(--verifier))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="font-display text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4" style={{ color: "hsl(var(--verifier))" }} />Results Distribution</CardTitle></CardHeader>
            <CardContent>
              <div className="h-48 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} labelLine fontSize={11}>
                      {statusDistribution.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DIDResolver compact />
        <TrustedIssuerRegistry compact />
      </div>
    </>
  );
};

export default VerifierDashboardView;
