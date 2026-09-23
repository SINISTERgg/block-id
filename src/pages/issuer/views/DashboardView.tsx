import { useMemo } from "react";
import { TrendingUp, BarChart3, Link2, ScrollText, Award, Clock, ArrowRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import IssuerStatsOverview from "@/components/issuer/IssuerStatsOverview";
import TrustedIssuerRegistry from "@/components/TrustedIssuerRegistry";
import { motion } from "framer-motion";
import { MOTION } from "@/lib/motion";
import type { IssuerCredential, IssuerSchema } from "@/services/api/issuer.service";

interface DashboardViewProps {
  schemas: IssuerSchema[];
  credentials: IssuerCredential[];
}

const DashboardView = ({ schemas, credentials }: DashboardViewProps) => {
  const navigate = useNavigate();

  const anchoredCount = credentials.filter((c) => c.blockchain_anchor).length;
  const revokedCount = credentials.filter((c) => c.status === "revoked").length;
  const expiredCount = credentials.filter((c) => c.status === "expired").length;

  const recentCredentials = useMemo(() => {
    return [...credentials]
      .sort((a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime())
      .slice(0, 6);
  }, [credentials]);

  const typeDistribution = useMemo(() => {
    const map: Record<string, number> = {};
    credentials.forEach((c) => {
      const type = c.credential_schemas?.credential_type || "unknown";
      map[type] = (map[type] || 0) + 1;
    });
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
    const max = entries[0]?.[1] || 1;
    return entries.map(([name, value]) => ({ name, value, pct: Math.round((value / max) * 100) }));
  }, [credentials]);

  const monthlyIssuance = useMemo(() => {
    const map: Record<string, number> = {};
    credentials.forEach((c) => {
      const month = new Date(c.issued_at).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      map[month] = (map[month] || 0) + 1;
    });
    return Object.entries(map).map(([month, count]) => ({ month, count })).reverse().slice(-6);
  }, [credentials]);

  const activeCredentials = credentials.filter((c) => c.status === "active").length;

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
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-issuer mb-3">
            Operations / Issuer
          </p>
          <h1 className="font-heading text-4xl lg:text-5xl font-bold uppercase tracking-tight leading-[0.95]">
            Credential <span className="font-display lowercase italic text-primary">flow</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-4 max-w-md">
            Issue, version, and anchor credentials on-chain. Live state of your registry.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" className="gap-2" onClick={() => navigate("/issuer/schemas")}>
            <Award className="h-4 w-4" /> Schemas <span className="font-mono text-[10px] text-muted-foreground">{schemas.length}</span>
          </Button>
          <Button variant="solid" className="gap-2" onClick={() => navigate("/issuer/issue")}>
            Issue New <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </motion.div>

      <IssuerStatsOverview
        schemaCount={schemas.length}
        credentialCount={credentials.length}
        anchoredCount={anchoredCount}
        revokedCount={revokedCount}
        expiredCount={expiredCount}
      />

      {credentials.length > 0 && (
        <>
          {/* Asymmetric grid: trend chart + type ledger */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
            <motion.div
              initial={{ opacity: 0, y: MOTION.DISTANCE }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: MOTION.DURATION, ease: MOTION.EASE }}
              className="lg:col-span-2"
            >
              <Card className="solid-card h-full">
                <CardContent className="p-0">
                  <div className="flex items-center justify-between border-b border-border px-6 py-4">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-issuer" />
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-foreground">
                        Issuance Trend
                      </span>
                    </div>
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      Last {monthlyIssuance.length} mo
                    </span>
                  </div>
                  <div className="p-6">
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={monthlyIssuance} barCategoryGap="28%">
                          <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} axisLine={false} tickLine={false} />
                          <Tooltip
                            cursor={{ fill: "hsl(var(--muted) / 0.25)" }}
                            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 0, fontSize: 12, boxShadow: "none" }}
                          />
                          <Bar dataKey="count" fill="hsl(var(--issuer))" radius={[0, 0, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: MOTION.DISTANCE }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.22, duration: MOTION.DURATION, ease: MOTION.EASE }}
            >
              <Card className="solid-card h-full">
                <CardContent className="p-0">
                  <div className="flex items-center justify-between border-b border-border px-6 py-4">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-issuer" />
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-foreground">
                        By Type
                      </span>
                    </div>
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {typeDistribution.length} kinds
                    </span>
                  </div>
                  <div className="p-6 space-y-4">
                    {typeDistribution.map((t) => (
                      <div key={t.name}>
                        <div className="flex items-baseline justify-between mb-1.5">
                          <span className="text-xs text-muted-foreground uppercase tracking-wider truncate pr-2">{t.name}</span>
                          <span className="font-mono text-sm font-bold tabular-nums text-foreground">{t.value}</span>
                        </div>
                        <div className="h-px w-full bg-border relative">
                          <div className="absolute left-0 top-0 h-px bg-issuer" style={{ width: `${t.pct}%` }} />
                        </div>
                      </div>
                    ))}
                    {typeDistribution.length === 0 && (
                      <p className="text-sm text-muted-foreground">No data yet.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Credential ledger */}
          <motion.div
            initial={{ opacity: 0, y: MOTION.DISTANCE }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: MOTION.DURATION, ease: MOTION.EASE }}
            className="mt-6"
          >
            <Card className="solid-card">
              <CardContent className="p-0">
                <div className="flex items-center justify-between border-b border-border px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Award className="h-4 w-4 text-issuer" />
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-foreground">
                      Recent Credentials
                    </span>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {activeCredentials} active
                  </span>
                </div>

                {recentCredentials.length > 0 ? (
                  <div className="divide-y divide-border">
                    {recentCredentials.map((cred, index) => (
                      <div
                        key={cred.id}
                        className="group flex items-center gap-4 px-6 py-4 hover:bg-muted/30 transition-colors"
                      >
                        <span className="font-mono text-[10px] tabular-nums text-muted-foreground/50 shrink-0">
                          {String(index + 1).padStart(3, "0")}
                        </span>
                        <div className={`w-9 h-9 bg-issuer/10 border border-issuer/30 flex items-center justify-center shrink-0`}>
                          <Award className="h-4 w-4 text-issuer" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {cred.credential_schemas?.name || "Credential"}
                          </p>
                          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground truncate">
                            {cred.credential_schemas?.credential_type}
                          </p>
                        </div>
                        <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          {new Date(cred.issued_at).toLocaleDateString()}
                        </div>
                        <div className="flex items-center gap-3">
                          {cred.blockchain_anchor && (
                            <Link2 className="h-4 w-4 text-issuer" />
                          )}
                          <span className={`font-mono text-[9px] font-semibold uppercase tracking-[0.18em] px-2 py-1 border ${
                            cred.status === "active"
                              ? "border-success/40 text-success"
                              : cred.status === "revoked"
                                ? "border-destructive/40 text-destructive"
                                : "border-border text-muted-foreground"
                          }`}>
                            {cred.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    No credentials issued yet. Start by creating a schema and issuing your first credential.
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </>
      )}

      <motion.div
        initial={{ opacity: 0, y: MOTION.DISTANCE }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: MOTION.DURATION, ease: MOTION.EASE }}
        className="flex flex-wrap gap-3 mt-6"
      >
        <Button variant="outline" className="gap-2" onClick={() => navigate("/audit")}>
          <ScrollText className="h-4 w-4" /> Audit Trail
        </Button>
        <Button variant="outline" className="gap-2" onClick={() => navigate("/explorer")}>
          <Link2 className="h-4 w-4" /> Blockchain Explorer
        </Button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: MOTION.DISTANCE }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.48, duration: MOTION.DURATION, ease: MOTION.EASE }}
        className="mt-6"
      >
        <TrustedIssuerRegistry />
      </motion.div>
    </>
  );
};

export default DashboardView;