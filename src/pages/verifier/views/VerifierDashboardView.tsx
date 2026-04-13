import { useMemo } from "react";
import { CheckCircle2, XCircle, Clock, Brain, TrendingUp, BarChart3, Eye, Database } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DIDResolver from "@/components/DIDResolver";
import TrustedIssuerRegistry from "@/components/TrustedIssuerRegistry";
import { motion } from "framer-motion";
import type { VerificationRecord } from "@/services/api/verifier.service";

const CHART_COLORS = [
  "hsl(24, 95%, 45%)",
  "hsl(0, 72%, 51%)",
  "hsl(45, 80%, 55%)",
];

interface VerifierDashboardViewProps {
  records: VerificationRecord[];
}

const stats = [
  { icon: CheckCircle2, key: "verified", label: "Verified", color: "bg-primary" },
  { icon: Clock, key: "pending", label: "Pending", color: "bg-muted" },
  { icon: XCircle, key: "rejected", label: "Rejected", color: "bg-destructive" },
  { icon: Eye, key: "docsLive", label: "Docs Live", color: "bg-verifier" },
  { icon: Database, key: "stored", label: "Stored", color: "bg-verifier" },
  { icon: Brain, key: "aiConfidence", label: "AI Conf.", color: "bg-verifier", isPercent: true },
];

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
    { name: "Verified", value: verified, fill: CHART_COLORS[0] },
    { name: "Rejected", value: rejected, fill: CHART_COLORS[1] },
    { name: "Pending", value: pending, fill: CHART_COLORS[2] },
  ].filter((d) => d.value > 0), [verified, rejected, pending]);

  const monthlyVerifications = useMemo(() => {
    const map: Record<string, number> = {};
    records.forEach((r) => {
      const month = new Date(r.created_at).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      map[month] = (map[month] || 0) + 1;
    });
    return Object.entries(map).map(([month, count]) => ({ month, count })).reverse().slice(-6);
  }, [records]);

  const statsValues: Record<string, any> = {
    verified,
    pending,
    rejected,
    docsLive,
    stored,
    aiConfidence: aiAnalyzedCount > 0 ? avgConfidence : null,
  };

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06, duration: 0.3 }}
          >
            <Card className="solid-card">
              <CardContent className="pt-5">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 ${stat.color} rounded-lg flex items-center justify-center ${
                    stat.color === "bg-muted" ? "" : ""
                  }`}>
                    <stat.icon className={`h-5 w-5 ${stat.color === "bg-muted" ? "text-muted-foreground" : "text-white"}`} />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-foreground">
                      {stat.isPercent ? (statsValues[stat.key] !== null ? `${statsValues[stat.key]}%` : "—") : statsValues[stat.key]}
                    </p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {records.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.3 }}
          >
            <Card className="solid-card overflow-hidden">
              <CardHeader className="pb-2 bg-muted/30">
                <CardTitle className="font-display text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-verifier" />
                  Verification Trend
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
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
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.3 }}
          >
            <Card className="solid-card overflow-hidden">
              <CardHeader className="pb-2 bg-muted/30">
                <CardTitle className="font-display text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-verifier" />
                  Results Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="h-48 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} innerRadius={40} labelLine={false}>
                        {statusDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.3 }}
        className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6"
      >
        <Card className="solid-card">
          <CardHeader className="pb-2 bg-muted/30">
            <CardTitle className="font-display text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-verifier" />
              DID Resolver
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DIDResolver compact />
          </CardContent>
        </Card>
        <Card className="solid-card">
          <CardHeader className="pb-2 bg-muted/30">
            <CardTitle className="font-display text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-issuer" />
              Trusted Issuers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TrustedIssuerRegistry compact />
          </CardContent>
        </Card>
      </motion.div>
    </>
  );
};

export default VerifierDashboardView;
