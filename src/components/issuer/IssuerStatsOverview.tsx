import { FileText, Send, Link2, Ban, Calendar } from "lucide-react";
import { motion } from "framer-motion";

interface IssuerStatsOverviewProps {
  schemaCount: number;
  credentialCount: number;
  anchoredCount: number;
  revokedCount: number;
  expiredCount: number;
}

const stats = [
  { key: "schemaCount", label: "Schemas", icon: FileText, accent: "text-issuer" },
  { key: "credentialCount", label: "Issued", icon: Send, accent: "text-issuer" },
  { key: "anchoredCount", label: "On-Chain", icon: Link2, accent: "text-issuer" },
  { key: "revokedCount", label: "Revoked", icon: Ban, accent: "text-destructive" },
  { key: "expiredCount", label: "Expired", icon: Calendar, accent: "text-muted-foreground" },
];

const IssuerStatsOverview = ({
  schemaCount,
  credentialCount,
  anchoredCount,
  revokedCount,
  expiredCount,
}: IssuerStatsOverviewProps) => {
  const values = { schemaCount, credentialCount, anchoredCount, revokedCount, expiredCount };

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 border border-border divide-x divide-border divide-y md:divide-y-0">
      {stats.map((stat, index) => (
        <motion.div
          key={stat.key}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.06, duration: 0.3 }}
          className="px-5 py-4 flex items-center gap-4 group"
        >
          <stat.icon className={`h-4 w-4 shrink-0 ${stat.accent} transition-transform group-hover:translate-x-0.5`} />
          <div className="min-w-0">
            <p className="font-heading text-2xl font-bold tabular-nums text-foreground leading-none">
              {values[stat.key as keyof typeof values]}
            </p>
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground mt-1 truncate">
              {stat.label}
            </p>
          </div>
        </motion.div>
      ))}
    </div>
  );
};

export default IssuerStatsOverview;