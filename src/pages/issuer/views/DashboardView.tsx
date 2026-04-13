import { useMemo } from "react";
import { TrendingUp, BarChart3, Link2, ScrollText, Award, Clock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import IssuerStatsOverview from "@/components/issuer/IssuerStatsOverview";
import TrustedIssuerRegistry from "@/components/TrustedIssuerRegistry";
import { motion } from "framer-motion";
import type { IssuerCredential, IssuerSchema } from "@/services/api/issuer.service";

const CHART_COLORS = [
  "hsl(220, 75%, 48%)",
  "hsl(24, 95%, 45%)",
  "hsl(270, 60%, 48%)",
  "hsl(45, 80%, 55%)",
];

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
      .slice(0, 5);
  }, [credentials]);

  const typeDistribution = useMemo(() => {
    const map: Record<string, number> = {};
    credentials.forEach((c) => {
      const type = c.credential_schemas?.credential_type || "unknown";
      map[type] = (map[type] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
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
      <IssuerStatsOverview
        schemaCount={schemas.length}
        credentialCount={credentials.length}
        anchoredCount={anchoredCount}
        revokedCount={revokedCount}
        expiredCount={expiredCount}
      />

      {credentials.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.3 }}
          >
            <Card className="solid-card overflow-hidden">
              <CardHeader className="pb-2 bg-muted/30">
                <CardTitle className="font-display text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-issuer" />
                  Issuance Trend
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyIssuance}>
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="count" fill="hsl(var(--issuer))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.3 }}
          >
            <Card className="solid-card overflow-hidden">
              <CardHeader className="pb-2 bg-muted/30">
                <CardTitle className="font-display text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-issuer" />
                  Credentials by Type
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="h-48 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={typeDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} innerRadius={40} labelLine={false} fontSize={11}>
                        {typeDistribution.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
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

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.3 }}
            className="lg:col-span-2"
          >
            <Card className="solid-card overflow-hidden">
              <CardHeader className="pb-4 bg-muted/30">
                <div className="flex items-center justify-between">
                  <CardTitle className="font-display text-sm flex items-center gap-2">
                    <Award className="h-4 w-4 text-issuer" />
                    Recent Credentials
                  </CardTitle>
                  <span className="text-sm text-muted-foreground">{activeCredentials} active</span>
                </div>
              </CardHeader>
              <CardContent>
                {recentCredentials.length > 0 ? (
                  <div className="space-y-3">
                    {recentCredentials.map((cred, index) => (
                      <motion.div
                        key={cred.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 + index * 0.05, duration: 0.2 }}
                        className="flex items-center justify-between p-4 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-issuer rounded-lg flex items-center justify-center">
                            <Award className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">
                              {cred.credential_schemas?.name || "Credential"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {cred.credential_schemas?.credential_type}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(cred.issued_at).toLocaleDateString()}
                            </p>
                            <p className={`text-xs font-medium ${
                              cred.status === "active" ? "text-green-600" :
                              cred.status === "revoked" ? "text-destructive" : "text-muted-foreground"
                            }`}>
                              {cred.status}
                            </p>
                          </div>
                          {cred.blockchain_anchor && (
                            <Link2 className="h-4 w-4 text-issuer" />
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No credentials issued yet. Start by creating a schema and issuing your first credential.
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.3 }}
        className="flex flex-wrap gap-3"
      >
        <Button variant="outline" className="gap-2" onClick={() => navigate("/audit")}>
          <ScrollText className="h-4 w-4" /> Audit Trail
        </Button>
        <Button variant="outline" className="gap-2" onClick={() => navigate("/explorer")}>
          <Link2 className="h-4 w-4" /> Blockchain Explorer
        </Button>
      </motion.div>

      <TrustedIssuerRegistry />
    </>
  );
};

export default DashboardView;
