import { FileText, Send, Link2, Ban, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface IssuerStatsOverviewProps {
  schemaCount: number;
  credentialCount: number;
  anchoredCount: number;
  revokedCount: number;
  expiredCount: number;
}

const IssuerStatsOverview = ({
  schemaCount,
  credentialCount,
  anchoredCount,
  revokedCount,
  expiredCount,
}: IssuerStatsOverviewProps) => (
  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-issuer-muted flex items-center justify-center">
            <FileText className="h-5 w-5" style={{ color: "hsl(var(--issuer))" }} />
          </div>
          <div>
            <p className="text-2xl font-display font-bold text-foreground">{schemaCount}</p>
            <p className="text-sm text-muted-foreground">Schemas</p>
          </div>
        </div>
      </CardContent>
    </Card>
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-issuer-muted flex items-center justify-center">
            <Send className="h-5 w-5" style={{ color: "hsl(var(--issuer))" }} />
          </div>
          <div>
            <p className="text-2xl font-display font-bold text-foreground">{credentialCount}</p>
            <p className="text-sm text-muted-foreground">Issued</p>
          </div>
        </div>
      </CardContent>
    </Card>
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-issuer-muted flex items-center justify-center">
            <Link2 className="h-5 w-5" style={{ color: "hsl(var(--issuer))" }} />
          </div>
          <div>
            <p className="text-2xl font-display font-bold text-foreground">{anchoredCount}</p>
            <p className="text-sm text-muted-foreground">On-Chain</p>
          </div>
        </div>
      </CardContent>
    </Card>
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
            <Ban className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <p className="text-2xl font-display font-bold text-foreground">{revokedCount}</p>
            <p className="text-sm text-muted-foreground">Revoked</p>
          </div>
        </div>
      </CardContent>
    </Card>
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
            <Calendar className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-2xl font-display font-bold text-foreground">{expiredCount}</p>
            <p className="text-sm text-muted-foreground">Expired</p>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
);

export default IssuerStatsOverview;
