/**
 * Intelligence overview — the aggregate views over a verifier's history.
 *
 * Shared by the dashboard (the three headline panels) and Analytics (the full
 * set, including the ZKP adoption trend, detector heatmap and revocation
 * impact). All aggregation lives in `lib/verifier/intelligence.ts`; this
 * component only renders it, so the two surfaces can never disagree.
 */
import { createElement, useMemo, type ElementType, type ReactNode } from "react";
import {
  BarChart3, Cpu, Trophy, TrendingUp, Flame, Undo2, Info,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, Area, AreaChart,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import {
  buildCircuitBreakdown,
  buildDetectorHeatmap,
  buildIssuerLeaderboard,
  buildRevocationImpact,
  buildTrustHistogram,
  buildZkpAdoptionTrend,
  type IntelligenceRecord,
} from "@/lib/verifier/intelligence";

export type IntelligenceSection =
  | "trust"
  | "circuits"
  | "issuers"
  | "zkp"
  | "heatmap"
  | "revocation";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Trust-band colour, so a histogram reads as a quality gradient not a count. */
function trustColor(bucket: string): string {
  const low = parseInt(bucket, 10);
  if (low >= 80) return "hsl(160, 84%, 39%)";
  if (low >= 60) return "hsl(80, 65%, 45%)";
  if (low >= 40) return "hsl(45, 93%, 47%)";
  if (low >= 20) return "hsl(25, 90%, 55%)";
  return "hsl(0, 72%, 51%)";
}

const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 0,
  fontSize: 12,
} as const;

const MUTED = "hsl(var(--muted-foreground))";

interface IntelligenceOverviewProps {
  records: IntelligenceRecord[];
  sections?: IntelligenceSection[];
  className?: string;
}

const IntelligenceOverview = ({
  records,
  sections = ["trust", "circuits", "issuers"],
  className,
}: IntelligenceOverviewProps) => {
  const trust = useMemo(() => buildTrustHistogram(records), [records]);
  const circuits = useMemo(() => buildCircuitBreakdown(records), [records]);
  const issuers = useMemo(() => buildIssuerLeaderboard(records, 6), [records]);
  const zkpTrend = useMemo(() => buildZkpAdoptionTrend(records, 30), [records]);
  const heatmap = useMemo(() => buildDetectorHeatmap(records), [records]);
  const revocation = useMemo(() => buildRevocationImpact(records), [records]);

  const has = (s: IntelligenceSection) => sections.includes(s);
  const nothing = records.length === 0;

  const heatMax = Math.max(...heatmap.map((c) => c.count), 1);
  const heatAt = (day: string, hour: number) =>
    heatmap.find((c) => c.day === day && c.hour === hour)?.count ?? 0;

  const panel = (icon: ElementType, title: string, subtitle: string, body: ReactNode) => (
    <Card className="solid-card h-full">
      <div className="p-0">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2 min-w-0">
            {createElement(icon, { className: "h-4 w-4 text-verifier shrink-0" })}
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-foreground truncate">
              {title}
            </span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground shrink-0">
            {subtitle}
          </span>
        </div>
        <div className="p-6">{body}</div>
      </div>
    </Card>
  );

  return (
    <div className={className}>
      {nothing ? (
        <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-3 text-[11px] text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0" />
          No verification history yet — trust, circuit and issuer breakdowns appear once
          you start verifying credentials.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── Trust distribution ── */}
          {has("trust")
            ? panel(
                BarChart3,
                "Trust Distribution",
                `${records.length} scored`,
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trust} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <XAxis dataKey="bucket" tick={{ fontSize: 9 }} stroke={MUTED} interval={1} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10 }} stroke={MUTED} allowDecimals={false} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted) / 0.25)" }} />
                      <Bar dataKey="count" name="Verifications" radius={[0, 0, 0, 0]}>
                        {trust.map((b, i) => (
                          <Cell key={i} fill={trustColor(b.bucket)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )
            : null}

          {/* ── Circuit usage ── */}
          {has("circuits")
            ? panel(
                Cpu,
                "ZKP Circuit Usage",
                circuits.length === 0 ? "no data" : `${circuits.length} used`,
                circuits.length === 0 ? (
                  <p className="h-56 flex items-center justify-center text-xs text-muted-foreground text-center px-6">
                    No presentations carried a ZKP. Holders are presenting credentials directly,
                    which is expected for most verifications.
                  </p>
                ) : (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={circuits} layout="vertical" margin={{ left: 8, right: 16 }}>
                        <XAxis type="number" tick={{ fontSize: 10 }} stroke={MUTED} allowDecimals={false} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} stroke={MUTED} width={140} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted) / 0.25)" }} />
                        <Bar dataKey="value" name="Verifications" fill="hsl(var(--verifier))" radius={[0, 0, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )
              )
            : null}

          {/* ── Issuer leaderboard ── */}
          {has("issuers")
            ? panel(
                Trophy,
                "Issuer Leaderboard",
                `${issuers.length} issuers`,
                <div className="space-y-2.5">
                  {issuers.map((r) => (
                    <div key={r.issuer} className="group">
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <span className="font-mono text-[10px] text-foreground truncate" title={r.issuer}>
                          {r.issuer}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                          {r.total} req · {r.acceptanceRate}% acc · {r.zkpAdoption}% zkp
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-px flex-1 bg-border relative">
                          <div
                            className="absolute left-0 top-0 h-px bg-verifier"
                            style={{ width: `${r.acceptanceRate}%` }}
                          />
                        </div>
                        <span className="font-mono text-[9px] text-muted-foreground w-6 text-right">
                          {r.avgTrustScore}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )
            : null}

          {/* ── ZKP adoption trend ── */}
          {has("zkp")
            ? panel(
                TrendingUp,
                "ZKP Adoption",
                "last 30 days",
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={zkpTrend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <XAxis dataKey="day" tick={{ fontSize: 9 }} stroke={MUTED} interval={6} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10 }} stroke={MUTED} allowDecimals={false} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Area type="monotone" dataKey="zkp" name="ZKP" stackId="1" stroke="hsl(var(--verifier))" fill="hsl(var(--verifier) / 0.35)" />
                      <Area type="monotone" dataKey="raw" name="Direct" stackId="1" stroke="hsl(var(--muted-foreground))" fill="hsl(var(--muted-foreground) / 0.2)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )
            : null}

          {/* ── Detector heatmap ── */}
          {has("heatmap")
            ? panel(
                Flame,
                "Detector Heatmap",
                "weekday × hour",
                <div className="space-y-2">
                  <div className="flex gap-1 pl-8">
                    {Array.from({ length: 24 }).map((_, h) => (
                      <span key={h} className="flex-1 text-center font-mono text-[7px] text-muted-foreground">
                        {h % 3 === 0 ? h : ""}
                      </span>
                    ))}
                  </div>
                  {DAYS.map((day) => (
                    <div key={day} className="flex items-center gap-1">
                      <span className="w-7 shrink-0 font-mono text-[9px] text-muted-foreground">{day}</span>
                      <div className="flex-1 flex gap-[2px]">
                        {Array.from({ length: 24 }).map((_, h) => {
                          const n = heatAt(day, h);
                          return (
                            <span
                              key={h}
                              title={`${day} ${h}:00 — ${n} verifications`}
                              className="flex-1 h-3"
                              style={{
                                background:
                                  n === 0
                                    ? "hsl(var(--muted) / 0.35)"
                                    : `hsl(var(--verifier) / ${0.18 + 0.82 * (n / heatMax)})`,
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <p className="text-[10px] text-muted-foreground pt-1">
                    Local browser time. Clusters here mean verifications arrive in bursts — a
                    normal integration pattern, not necessarily coordinated activity.
                  </p>
                </div>
              )
            : null}

          {/* ── Revocation impact ── */}
          {has("revocation")
            ? panel(
                Undo2,
                "Revocation Impact",
                `${revocation.length} periods`,
                revocation.length === 0 ? (
                  <p className="h-56 flex items-center justify-center text-xs text-muted-foreground text-center px-6">
                    No accepted or rejected verifications to attribute yet.
                  </p>
                ) : (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={revocation} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <XAxis dataKey="bucket" tick={{ fontSize: 9 }} stroke={MUTED} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10 }} stroke={MUTED} allowDecimals={false} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted) / 0.25)" }} />
                        <Bar dataKey="valid" name="Unaffected" stackId="a" fill="hsl(160, 84%, 39%)" />
                        <Bar dataKey="invalidated" name="Invalidated" stackId="a" fill="hsl(var(--destructive))" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )
              )
            : null}
        </div>
      )}
    </div>
  );
};

export default IntelligenceOverview;
