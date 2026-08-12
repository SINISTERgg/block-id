import { useMemo } from "react";
import {
  Activity, CheckCircle2, XCircle, Clock, Share2, Brain, Zap, EyeOff,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { VerificationRecord } from "@/services/api/verifier.service";
import { motion } from "framer-motion";

interface LiveActivityFeedProps {
  records: VerificationRecord[];
}

const timeAgo = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const ACTIONS: Record<string, { icon: React.ElementType; label: string; cls: string }> = {
  verified: { icon: CheckCircle2, label: "Credential verified", cls: "text-emerald-500 bg-emerald-500/10" },
  accepted: { icon: CheckCircle2, label: "Presentation accepted", cls: "text-emerald-500 bg-emerald-500/10" },
  rejected: { icon: XCircle, label: "Credential rejected", cls: "text-destructive bg-destructive/10" },
  pending: { icon: Clock, label: "Request pending", cls: "text-amber-500 bg-amber-500/10" },
};

const LiveActivityFeed = ({ records }: LiveActivityFeedProps) => {
  const events = useMemo(() => {
    return records
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 8)
      .map((r) => {
        const cfg = ACTIONS[r.status] || ACTIONS.pending;
        const isNew = Date.now() - new Date(r.created_at).getTime() < 5 * 60 * 1000;
        const ai = (r.ai_analysis as any) ?? null;
        return { record: r, cfg, isNew, ai };
      });
  }, [records]);

  const liveCount = useMemo(
    () => events.filter((e) => e.record.status === "pending" || e.isNew).length,
    [events]
  );

  return (
    <Card className="solid-card overflow-hidden">
      <CardHeader className="pb-2 bg-muted/30 flex flex-row items-center justify-between">
        <CardTitle className="font-display text-sm flex items-center gap-2">
          <div className="relative">
            <Activity className="h-4 w-4 text-verifier" />
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-verifier animate-glow-pulse" />
          </div>
          Live Activity
        </CardTitle>
        {liveCount > 0 && (
          <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-verifier/10 text-verifier border border-verifier/20">
            {liveCount} live
          </span>
        )}
      </CardHeader>
      <CardContent className="pt-3">
        {events.length === 0 ? (
          <div className="py-8 text-center">
            <Zap className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No activity yet. Verify a credential to see it stream in live.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {events.map(({ record: r, cfg, isNew, ai }, i) => {
              const Icon = cfg.icon;
              return (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03, duration: 0.25 }}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.cls}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">
                      {cfg.label}
                      {r.credential_type && (
                        <span className="text-muted-foreground"> · {r.credential_type}</span>
                      )}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono truncate">
                      {r.holder_did || "unknown holder"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {ai?.score != null && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-primary font-mono" title={`AI score ${ai.score}`}>
                        <Brain className="h-3 w-3" /> {ai.score}
                      </span>
                    )}
                    {r.access_expires_at && !r.storage_consent && (
                      <EyeOff className="h-3 w-3 text-muted-foreground/50" />
                    )}
                    {isNew && (
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-verifier text-[#030304] animate-glow-pulse">
                        NEW
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground">{timeAgo(r.created_at)}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LiveActivityFeed;
