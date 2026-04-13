import { FileText, Send, Link2, Ban, Calendar, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";

interface IssuerStatsOverviewProps {
  schemaCount: number;
  credentialCount: number;
  anchoredCount: number;
  revokedCount: number;
  expiredCount: number;
}

const stats = [
  { key: "schemaCount", label: "Schemas", icon: FileText, color: "bg-issuer" },
  { key: "credentialCount", label: "Issued", icon: Send, color: "bg-issuer" },
  { key: "anchoredCount", label: "On-Chain", icon: Link2, color: "bg-issuer" },
  { key: "revokedCount", label: "Revoked", icon: Ban, color: "bg-destructive" },
  { key: "expiredCount", label: "Expired", icon: Calendar, color: "bg-muted" },
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
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {stats.map((stat, index) => (
        <motion.div
          key={stat.key}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.06, duration: 0.3 }}
          className="solid-card p-5"
        >
          <div className="flex items-center gap-4">
            <div className={`w-11 h-11 ${stat.color} rounded-lg flex items-center justify-center shrink-0`}>
              <stat.icon className={`h-5 w-5 ${stat.color === "bg-muted" ? "text-muted-foreground" : "text-white"}`} />
            </div>
            <div>
              <p className="stat-number text-xl text-foreground">{values[stat.key as keyof typeof values]}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
};

export default IssuerStatsOverview;
