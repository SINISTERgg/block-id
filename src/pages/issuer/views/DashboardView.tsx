import { useMemo } from "react";
import { TrendingUp, BarChart3, Link2, ScrollText } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import IssuerStatsOverview from "@/components/issuer/IssuerStatsOverview";
import TrustedIssuerRegistry from "@/components/TrustedIssuerRegistry";
import type { IssuerCredential, IssuerSchema } from "@/services/api/issuer.service";

const CHART_COLORS = [
  "hsl(175, 60%, 38%)",
  "hsl(220, 70%, 55%)",
  "hsl(262, 60%, 55%)",
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4" style={{ color: "hsl(var(--issuer))" }} />
                Issuance Trend
              </CardTitle>
            </CardHeader>
            <CardContent>
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
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4" style={{ color: "hsl(var(--issuer))" }} />
                By Type
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={typeDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} labelLine fontSize={11}>
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
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate("/audit")}>
          <ScrollText className="h-4 w-4" /> Audit Trail
        </Button>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate("/explorer")}>
          <Link2 className="h-4 w-4" /> Blockchain Explorer
        </Button>
      </div>

      <TrustedIssuerRegistry />
    </>
  );
};

export default DashboardView;
