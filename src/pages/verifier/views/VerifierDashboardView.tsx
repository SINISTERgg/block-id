import { useMemo } from "react";
import { CheckCircle2, XCircle, Clock, Brain, TrendingUp, BarChart3, Eye, Database, ArrowRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import DIDResolver from "@/components/DIDResolver";
import TrustedIssuerRegistry from "@/components/TrustedIssuerRegistry";
import LiveActivityFeed from "@/components/verifier/LiveActivityFeed";
import VerifierOrgCard from "@/components/verifier/VerifierOrgCard";
import AnchorChecker from "@/components/verifier/AnchorChecker";
import IntelligenceOverview from "@/components/verifier/IntelligenceOverview";
import { motion } from "framer-motion";
import { MOTION } from "@/lib/motion";
import { useNavigate } from "react-router-dom";
import type { VerificationRecord } from "@/services/api/verifier.service";

const stats = [
  { icon: CheckCircle2, key: "verified", label: "Verified", caret: "bg-verifier" },
  { icon: Clock, key: "pending", label: "Pending", caret: "bg-muted-foreground" },
  { icon: XCircle, key: "rejected", label: "Rejected", caret: "bg-destructive" },
  { icon: Eye, key: "docsLive", label: "Docs Live", caret: "bg-verifier" },
  { icon: Database, key: "stored", label: "Stored", caret: "bg-verifier" },
  { icon: Brain, key: "aiConfidence", label: "AI Conf.", caret: "bg-verifier", isPercent: true },
];

interface VerifierDashboardViewProps {
  records: VerificationRecord[];
}

const VerifierDashboardView = ({ records }: VerifierDashboardViewProps) => {
  const navigate = useNavigate();
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

  const maxStatus = Math.max(...statusDistribution.map((d) => d.value), 1);

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

  const tooltipStyle = {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 0,
    fontSize: 12,
    boxShadow: "none",
  } as const;

  return (
    <>
      {/* Editorial header */}
      <motion.div
        initial={{ opacity: 0, y: MOTION.DISTANCE }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: MOTION.DURATION, ease: MOTION.EASE }}
        className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-8"
      >
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-verifier mb-3">
            Verification / Verifier
          </p>
          <h1 className="font-heading text-4xl lg:text-5xl font-bold uppercase tracking-tight leading-[0.95]">
            Verify with <span className="font-display lowercase italic text-primary">confidence</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-4 max-w-md">
            Check signatures, anchors, and AI-assisted risk on every presented credential.
          </p>
        </div>
        <Button variant="solid" className="gap-2" onClick={() => navigate("/verifier/verify")}>
          Run Verification <ArrowRight className="h-4 w-4" />
        </Button>
      </motion.div>

      {/* Ticker strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 border border-border divide-x divide-border divide-y lg:divide-y-0">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05, duration: 0.3 }}
            className="group px-5 py-4"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className={`h-1.5 w-1.5 ${stat.caret} shrink-0`} />
              <stat.icon className={`h-3.5 w-3.5 shrink-0 ${
                stat.key === "verified" ? "text-verifier"
                : stat.key === "rejected" ? "text-destructive"
                : stat.key === "pending" ? "text-muted-foreground"
                : "text-verifier"
              }`} />
            </div>
            <p className="font-heading text-2xl font-bold tabular-nums text-foreground leading-none">
              {stat.isPercent ? (statsValues[stat.key] !== null ? `${statsValues[stat.key]}%` : "—") : statsValues[stat.key]}
            </p>
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground mt-1.5">
              {stat.label}
            </p>
          </motion.div>
        ))}
      </div>

      {records.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          <motion.div
            initial={{ opacity: 0, y: MOTION.DISTANCE }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: MOTION.DURATION, ease: MOTION.EASE }}
            className="lg:col-span-2"
          >
            <Card className="solid-card h-full">
              <div className="p-0">
                <div className="flex items-center justify-between border-b border-border px-6 py-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-verifier" />
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-foreground">
                      Verification Trend
                    </span>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    Last {monthlyVerifications.length} mo
                  </span>
                </div>
                <div className="p-6">
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyVerifications} barCategoryGap="28%">
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} axisLine={false} tickLine={false} />
                        <Tooltip
                          cursor={{ fill: "hsl(var(--muted) / 0.25)" }}
                          contentStyle={tooltipStyle}
                        />
                        <Bar dataKey="count" fill="hsl(var(--verifier))" radius={[0, 0, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: MOTION.DISTANCE }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22, duration: MOTION.DURATION, ease: MOTION.EASE }}
          >
            <Card className="solid-card h-full">
              <div className="p-0">
                <div className="flex items-center justify-between border-b border-border px-6 py-4">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-verifier" />
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-foreground">
                      Results
                    </span>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {records.length} total
                  </span>
                </div>
                <div className="p-6 space-y-4">
                  {statusDistribution.map((d) => (
                    <div key={d.name}>
                      <div className="flex items-baseline justify-between mb-1.5">
                        <span className="text-xs text-muted-foreground uppercase tracking-wider">{d.name}</span>
                        <span className="font-mono text-sm font-bold tabular-nums text-foreground">{d.value}</span>
                      </div>
                      <div className="h-px w-full bg-border relative">
                        <div
                          className={`absolute left-0 top-0 h-px ${
                            d.name === "Verified" ? "bg-verifier" : d.name === "Rejected" ? "bg-destructive" : "bg-muted-foreground"
                          }`}
                          style={{ width: `${(d.value / maxStatus) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  {statusDistribution.length === 0 && (
                    <p className="text-sm text-muted-foreground">No results yet.</p>
                  )}
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      )}

      {/* Intelligence overview: trust distribution, circuit usage, issuers */}
      {records.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: MOTION.DISTANCE }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24, duration: MOTION.DURATION, ease: MOTION.EASE }}
          className="mt-6"
        >
          <IntelligenceOverview records={records} />
        </motion.div>
      )}

      {/* Live activity + org profile */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <motion.div
          initial={{ opacity: 0, y: MOTION.DISTANCE }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: MOTION.DURATION, ease: MOTION.EASE }}
          className="lg:col-span-2"
        >
          <LiveActivityFeed records={records} />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: MOTION.DISTANCE }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.36, duration: MOTION.DURATION, ease: MOTION.EASE }}
        >
          <VerifierOrgCard />
        </motion.div>
      </div>

      {/* Tools */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <motion.div initial={{ opacity: 0, y: MOTION.DISTANCE }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.42, duration: MOTION.DURATION, ease: MOTION.EASE }}>
          <AnchorChecker />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: MOTION.DISTANCE }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.48, duration: MOTION.DURATION, ease: MOTION.EASE }}>
          <TrustedIssuerRegistry compact />
        </motion.div>
      </div>

      {/* DID Resolver */}
      <motion.div
        initial={{ opacity: 0, y: MOTION.DISTANCE }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.54, duration: MOTION.DURATION, ease: MOTION.EASE }}
        className="mt-6"
      >
        <DIDResolver compact />
      </motion.div>
    </>
  );
};

export default VerifierDashboardView;