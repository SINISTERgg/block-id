/**
 * TrustScoreRadar — the verifier-facing view of the 8-factor trust model.
 *
 * The model is deliberately explainable (see `@/lib/ml/trustScore`), so this
 * component never shows a bare number: every factor gets its weight, the
 * points it actually earned, and the sentence explaining why. When a critical
 * factor failed, the cap is surfaced explicitly instead of being hidden inside
 * the final number — a score of 30 with a broken signature is a very different
 * decision from a score of 30 earned legitimately.
 */
import { AlertTriangle, Info, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import {
  TIER_COLORS,
  TIER_LABELS,
  type TrustScoreResult,
} from "@/lib/ml/trustScore";

interface TrustScoreRadarProps {
  result: TrustScoreResult;
  /** Show the per-factor breakdown table under the score. */
  expanded?: boolean;
}

export default function TrustScoreRadar({ result, expanded = true }: TrustScoreRadarProps) {
  const capped = result.criticalFailures.length > 0;
  const lost = result.rawScore - result.score;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          <div
            className={`flex h-20 w-20 items-center justify-center rounded-2xl border text-2xl font-mono font-bold ${TIER_COLORS[result.tier]}`}
          >
            {Math.round(result.score)}
          </div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            / 100
          </span>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground">Trust score</span>
            <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${TIER_COLORS[result.tier]}`}>
              {TIER_LABELS[result.tier]}
            </span>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Weighted across {result.factors.length || 8} factors. Deterministic — the same
            credential always produces the same score.
          </p>

          {capped ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
              <div className="text-[11px]">
                <div className="font-semibold text-destructive">
                  Capped at {Math.round(result.score)} — critical failure
                  {result.criticalFailures.length > 1 ? "s" : ""}:{" "}
                  {result.criticalFailures.join(", ")}
                </div>
                <div className="text-muted-foreground mt-0.5">
                  Raw score was {result.rawScore}. Positive signals cannot mask{" "}
                  {result.criticalFailures.includes("signature") ? "an invalid signature" : "a revoked credential"}.
                </div>
              </div>
            </div>
          ) : lost > 0 ? (
            <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
              <Info className="h-3.5 w-3.5 shrink-0" />
              {Math.round(lost)} points were withheld by critical-failure capping.
            </div>
          ) : null}
        </div>
      </div>

      {expanded && result.factors.length > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="space-y-2.5"
        >
          {result.factors.map((f) => {
            const ratio = f.weight === 0 ? 0 : f.points / f.weight;
            const failed = f.points === 0;
            return (
              <div key={f.key} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[11px] text-foreground">
                    {f.label}
                    <span className="font-mono text-[10px] text-muted-foreground">
                      w{f.weight}
                    </span>
                  </span>
                  <span
                    className={`font-mono text-[11px] font-semibold ${failed ? "text-destructive" : "text-emerald-500"}`}
                  >
                    {f.points}/{f.weight}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${ratio * 100}%` }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    // Colour by outcome, not by tier — a full green bar next to a
                    // red "0/20" would be actively misleading.
                    className={`h-full rounded-full ${
                      failed ? "bg-destructive" : ratio > 0.66 ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">{f.detail}</p>
              </div>
            );
          })}
        </motion.div>
      ) : null}

      {result.factors.length === 0 ? (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          Score was persisted at verification time; the factor breakdown was not stored.
        </p>
      ) : null}
    </div>
  );
}
