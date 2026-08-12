import { useMemo } from "react";
import {
  TrendingUp, Timer, Brain, Layers, Zap, ShieldCheck, ShieldX, Clock, BarChart3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, LineChart, Line, Cell,
} from "recharts";
import { motion } from "framer-motion";
import type { VerificationRecord } from "@/services/api/verifier.service";

interface AnalyticsViewProps {
  records: VerificationRecord[];
}

const CHART_COLORS = {
  verified: "hsl(160, 84%, 39%)",
  rejected: "hsl(0, 72%, 51%)",
  pending: "hsl(45, 93%, 47%)",
  accent: "hsl(50, 90%, 45%)",
  muted: "hsl(var(--muted-foreground))",
};

const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
} as const;

const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const AnalyticsView = ({ records }: AnalyticsViewProps) => {
  const stats = useMemo(() => {
    const total = records.length;
    const responded = records.filter((r) => r.responded_at).length;
    const verified = records.filter((r) => r.status === "verified" || r.status === "accepted").length;
    const rejected = records.filter((r) => r.status === "rejected").length;
    const pending = records.filter((r) => r.status === "pending").length;
    return { total, responded, verified, rejected, pending };
  }, [records]);

  const responseRate = stats.total > 0 ? Math.round((stats.responded / stats.total) * 100) : 0;
  const successRate = stats.responded > 0 ? Math.round((stats.verified / stats.responded) * 100) : 0;

  // Funnel
  const funnel = useMemo(() => {
    const steps = [
      { name: "Total requests", value: stats.total, color: "hsl(var(--muted-foreground))", pct: 100 },
      { name: "Responded", value: stats.responded, color: "hsl(45, 93%, 47%)", pct: responseRate },
      { name: "Accepted", value: stats.verified, color: "hsl(160, 84%, 39%)", pct: successRate },
      { name: "Rejected", value: stats.rejected, color: "hsl(0, 72%, 51%)", pct: stats.responded > 0 ? Math.round((stats.rejected / stats.responded) * 100) : 0 },
    ];
    return steps;
  }, [stats, responseRate, successRate]);

  // Verification volume by day (last 14 days)
  const volumeByDay = useMemo(() => {
    const days = new Map<string, { day: string; count: number; verified: number; rejected: number }>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toDateString();
      days.set(key, { day: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), count: 0, verified: 0, rejected: 0 });
    }
    records.forEach((r) => {
      const key = new Date(r.created_at).toDateString();
      const bucket = days.get(key);
      if (!bucket) return;
      bucket.count += 1;
      if (r.status === "verified" || r.status === "accepted") bucket.verified += 1;
      if (r.status === "rejected") bucket.rejected += 1;
    });
    return Array.from(days.values());
  }, [records]);

  // By credential type
  const byType = useMemo(() => {
    const map: Record<string, number> = {};
    records.forEach((r) => {
      const t = r.credential_type || "unknown";
      map[t] = (map[t] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [records]);

  // Response time (minutes from created → responded), avg per day
  const responseTime = useMemo(() => {
    const withTime = records
      .filter((r) => r.responded_at)
      .map((r) => ({
        key: new Date(r.created_at).toDateString(),
        mins: (new Date(r.responded_at).getTime() - new Date(r.created_at).getTime()) / 60000,
      }));
    const perDay = new Map<string, { sum: number; n: number }>();
    withTime.forEach((r) => {
      const b = perDay.get(r.key) || { sum: 0, n: 0 };
      b.sum += r.mins;
      b.n += 1;
      perDay.set(r.key, b);
    });
    const avg = withTime.length > 0 ? withTime.reduce((s, r) => s + r.mins, 0) / withTime.length : 0;
    return {
      avg,
      series: Array.from(perDay.entries())
        .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
        .slice(-10)
        .map(([key, v]) => ({
          day: new Date(key).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          mins: Math.round(v.sum / v.n),
        })),
    };
  }, [records]);

  // AI confidence trend
  const confidenceTrend = useMemo(() => {
    const perDay = new Map<string, { sum: number; n: number }>();
    records.forEach((r) => {
      const ai = (r.ai_analysis as any)?.confidence;
      if (typeof ai !== "number") return;
      const key = dayKey(r.created_at);
      const b = perDay.get(key) || { sum: 0, n: 0 };
      b.sum += ai;
      b.n += 1;
      perDay.set(key, b);
    });
    return Array.from(perDay.entries())
      .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
      .slice(-10)
      .map(([day, v]) => ({ day, confidence: Math.round(v.sum / v.n) }));
  }, [records]);

  const avgConfidence = useMemo(() => {
    const confs = records
      .map((r) => (r.ai_analysis as any)?.confidence)
      .filter((c): c is number => typeof c === "number");
    return confs.length > 0 ? Math.round(confs.reduce((s, c) => s + c, 0) / confs.length) : 0;
  }, [records]);

  const statCards = [
    { icon: Layers, label: "Total Requests", value: stats.total, color: "text-foreground bg-foreground/5" },
    { icon: Zap, label: "Response Rate", value: `${responseRate}%`, color: "text-amber-500 bg-amber-500/10" },
    { icon: ShieldCheck, label: "Acceptance Rate", value: `${successRate}%`, color: "text-emerald-600 bg-emerald-500/10" },
    { icon: Timer, label: "Avg Response Time", value: responseTime.avg > 0 ? `${Math.round(responseTime.avg)}m` : "—", color: "text-primary bg-primary/10" },
    { icon: Brain, label: "Avg AI Confidence", value: avgConfidence > 0 ? `${avgConfidence}%` : "—", color: "text-verifier bg-verifier/10" },
  ];

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <h2 className="text-headline mb-1">Verification Analytics</h2>
        <p className="text-muted-foreground">Funnels, response behaviour and AI confidence across all your verifications</p>
      </motion.div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {statCards.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.3 }}>
            <Card className="solid-card">
              <CardContent className="pt-5">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>
                    <s.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-foreground">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {records.length === 0 ? (
        <Card className="solid-card">
          <CardContent className="py-16 text-center text-muted-foreground text-sm">
            No verification data yet. Once you verify credentials, analytics will appear here.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Funnel */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.3 }}>
            <Card className="solid-card overflow-hidden">
              <CardHeader className="pb-2 bg-muted/30">
                <CardTitle className="font-display text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-verifier" /> Verification Funnel
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-5 space-y-3">
                {funnel.map((step, i) => (
                  <div key={step.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-foreground">{step.name}</span>
                      <span className="text-muted-foreground font-mono">
                        {step.value} · {step.pct}%
                      </span>
                    </div>
                    <div className="h-3 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full ${i === 0 ? "bg-muted-foreground/50" : i === 1 ? "bg-amber-500" : i === 2 ? "bg-emerald-500" : "bg-destructive"}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${step.pct}%` }}
                        transition={{ duration: 0.9, delay: 0.2 + i * 0.1, ease: "easeOut" }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Volume by day */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.3 }}>
              <Card className="solid-card overflow-hidden">
                <CardHeader className="pb-2 bg-muted/30">
                  <CardTitle className="font-display text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-verifier" /> Volume (last 14 days)
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={volumeByDay}>
                        <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke={CHART_COLORS.muted} />
                        <YAxis tick={{ fontSize: 10 }} stroke={CHART_COLORS.muted} allowDecimals={false} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Bar dataKey="count" name="Requests" fill={CHART_COLORS.accent} radius={[3, 3, 0, 0]} />
                        <Bar dataKey="verified" name="Accepted" fill={CHART_COLORS.verified} radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* By credential type */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.3 }}>
              <Card className="solid-card overflow-hidden">
                <CardHeader className="pb-2 bg-muted/30">
                  <CardTitle className="font-display text-sm flex items-center gap-2">
                    <Layers className="h-4 w-4 text-verifier" /> By Credential Type
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="h-48">
                    {byType.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={byType} layout="vertical" margin={{ left: 8 }}>
                          <XAxis type="number" tick={{ fontSize: 10 }} stroke={CHART_COLORS.muted} allowDecimals={false} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} stroke={CHART_COLORS.muted} width={80} />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Bar dataKey="count" name="Requests" radius={[0, 3, 3, 0]}>
                            {byType.map((_, i) => (
                              <Cell key={i} fill={i % 2 === 0 ? CHART_COLORS.accent : "hsl(33, 93%, 54%)"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-xs text-muted-foreground">No type data</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Response time */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.3 }}>
              <Card className="solid-card overflow-hidden">
                <CardHeader className="pb-2 bg-muted/30">
                  <CardTitle className="font-display text-sm flex items-center gap-2">
                    <Clock className="h-4 w-4 text-verifier" /> Holder Response Time (avg minutes)
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  {responseTime.series.length > 0 ? (
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={responseTime.series}>
                          <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke={CHART_COLORS.muted} />
                          <YAxis tick={{ fontSize: 10 }} stroke={CHART_COLORS.muted} />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Line type="monotone" dataKey="mins" name="Avg minutes" stroke={CHART_COLORS.accent} strokeWidth={2} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">Waiting for holder responses…</div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* AI confidence */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.3 }}>
              <Card className="solid-card overflow-hidden">
                <CardHeader className="pb-2 bg-muted/30">
                  <CardTitle className="font-display text-sm flex items-center gap-2">
                    <Brain className="h-4 w-4 text-verifier" /> AI Confidence Trend
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  {confidenceTrend.length > 0 ? (
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={confidenceTrend}>
                          <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke={CHART_COLORS.muted} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke={CHART_COLORS.muted} />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Line type="monotone" dataKey="confidence" name="Avg confidence %" stroke={CHART_COLORS.verified} strokeWidth={2} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">No AI analysis yet.</div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </>
      )}
    </div>
  );
};

export default AnalyticsView;
