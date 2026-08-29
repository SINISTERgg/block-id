import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  TIER_COLORS,
  TIER_LABELS,
  type TrustFactorContribution,
  type TrustScoreResult,
} from "@/lib/ml/trustScore";

interface TrustScoreCardProps {
  result: TrustScoreResult | null;
  loading?: boolean;
  className?: string;
}

const FACTOR_STATUS: Record<number, "text-emerald-600" | "text-amber-600" | "text-red-500"> = {
  0: "text-red-500",
};

function FactorRow({ factor }: { factor: TrustFactorContribution }) {
  const ratio = Math.round((factor.points / Math.max(factor.weight, 1)) * 100);
  const tone =
    factor.value >= 0.99
      ? "text-emerald-600"
      : factor.value > 0
      ? "text-amber-600"
      : "text-red-500";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{factor.label}</span>
        <span className={tone}>
          {factor.points}/{factor.weight}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full ${ratio >= 99 ? "bg-emerald-500" : ratio > 0 ? "bg-amber-500" : "bg-red-400"}`}
            style={{ width: `${ratio}%` }}
          />
        </div>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">{factor.detail}</p>
    </div>
  );
}

/**
 * Phase 6 — displays the explainable AI trust score for a credential:
 * tier badge, weighted score and per-factor breakdown ("model card").
 */
const TrustScoreCard = ({ result, loading = false, className }: TrustScoreCardProps) => {
  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">Computing trust score…</CardContent>
      </Card>
    );
  }
  if (!result) return null;

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Trust Score
          </CardTitle>
          <Badge variant="outline" className={TIER_COLORS[result.tier]}>
            {TIER_LABELS[result.tier]}
          </Badge>
        </div>
        <CardDescription>Explainable multi-factor assessment of this credential.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-end gap-2">
          <span className="text-4xl font-bold leading-none">{result.score}</span>
          <span className="pb-1 text-sm text-muted-foreground">/ 100</span>
          {result.score !== result.rawScore && (
            <span className="ml-auto pb-1 flex items-center gap-1 text-xs text-red-500">
              <AlertTriangle className="h-3.5 w-3.5" />
              capped by critical failures
            </span>
          )}
        </div>
        <Progress value={result.score} className="h-2" />

        {result.criticalFailures.length > 0 && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            Critical signals failed: {result.criticalFailures.join(", ")}. Score is capped until resolved.
          </div>
        )}

        <div className="space-y-3">
          {result.factors.map((factor) => (
            <FactorRow key={factor.key} factor={factor} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default TrustScoreCard;
