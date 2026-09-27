/**
 * AnomalyPanel — surfaces the 5-detector behavioural model.
 *
 * Detectors (see `@/lib/ml/anomaly`): request burst, failure streak,
 * impossible travel, off-hours activity, latency spike. Each finding states
 * its own magnitude so a verifier can triage — a "high" finding that is one
 * request in a batch is different from a sustained one.
 *
 * A clean report is reported as such; silence here would be indistinguishable
 * from "we did not run the detectors".
 */
import { Radar, ShieldCheck, Zap, Users, Moon, Gauge, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import type { AnomalyFinding, AnomalyReport, AnomalyType } from "@/lib/ml/anomaly";
import { RISK_LEVEL_CLASS, RISK_LEVEL_LABEL, riskLevel } from "@/lib/verifier/intelligence";

const DETECTOR_META: Record<AnomalyType, { label: string; icon: LucideIcon; blurb: string }> = {
  burst: { label: "Request burst", icon: Zap, blurb: "Unusually high verification volume" },
  failure_streak: { label: "Failure streak", icon: AlertTriangle, blurb: "Consecutive rejected presentations" },
  geo_jump: { label: "Impossible travel", icon: Users, blurb: "Contradictory geolocations in a short window" },
  off_hours: { label: "Off-hours activity", icon: Moon, blurb: "Activity outside expected hours" },
  latency_spike: { label: "Latency spike", icon: Gauge, blurb: "Verification latency far above the norm" },
};

const SEVERITY_CLASS: Record<AnomalyFinding["severity"], string> = {
  high: "border-destructive/40 bg-destructive/10 text-destructive",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-500",
  low: "border-border bg-muted/40 text-muted-foreground",
};

interface AnomalyPanelProps {
  report: AnomalyReport | null;
  /** Number of events the detectors actually saw. */
  sampleSize: number;
  /** Scope label, e.g. "all verifications" or a holder DID. */
  scope?: string;
  /** Findings persisted on the row, shown when no live report is available. */
  storedFindings?: AnomalyFinding[] | null;
  storedRisk?: number | null;
}

export default function AnomalyPanel({
  report,
  sampleSize,
  scope = "all verifications",
  storedFindings,
  storedRisk,
}: AnomalyPanelProps) {
  // Prefer a freshly computed report; fall back to whatever was persisted so a
  // historical row still shows the verdicts recorded at verification time.
  const risk = report?.riskScore ?? storedRisk ?? null;
  const findings = report?.findings ?? storedFindings ?? [];
  const level = riskLevel(risk);

  if (sampleSize === 0 && !report && !storedRisk) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-3 text-[11px] text-muted-foreground">
        <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
        Not enough verification history to run behavioural detectors yet.
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Radar className="h-4 w-4 text-verifier" />
          <span className="text-sm font-semibold text-foreground">Anomaly detection</span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {sampleSize} event{sampleSize === 1 ? "" : "s"} · {scope}
          </span>
        </div>
        {risk !== null ? (
          <span
            className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${RISK_LEVEL_CLASS[level]}`}
          >
            {RISK_LEVEL_LABEL[level]} risk · {Math.round(risk)}
          </span>
        ) : null}
      </div>

      {report?.stats ? (
        <div className="grid grid-cols-3 gap-2">
          {[
            { k: "Success rate", v: `${Math.round(report.stats.successRate * 100)}%` },
            { k: "Median latency", v: report.stats.medianLatencyMs !== null ? `${report.stats.medianLatencyMs}ms` : "n/a" },
            { k: "Detections", v: String(report.findings.length) },
          ].map((s) => (
            <div key={s.k} className="rounded-lg border border-border px-2.5 py-2">
              <div className="font-mono text-[10px] text-muted-foreground">{s.k}</div>
              <div className="font-mono text-sm font-semibold text-foreground mt-0.5">{s.v}</div>
            </div>
          ))}
        </div>
      ) : null}

      <AnimatePresence mode="wait">
        {findings.length === 0 ? (
          <motion.div
            key="clean"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-3 text-[11px] text-emerald-500"
          >
            <ShieldCheck className="h-4 w-4 shrink-0" />
            All 5 detectors ran clean — no burst, failure streak, impossible travel,
            off-hours, or latency anomalies detected.
          </motion.div>
        ) : (
          <motion.div
            key={`findings-${findings.length}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-2"
          >
            {findings.map((f, i) => {
              const meta = DETECTOR_META[f.type];
              const Icon = meta.icon;
              return (
                <motion.div
                  key={`${f.type}-${i}`}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className={`rounded-lg border p-3 ${SEVERITY_CLASS[f.severity]}`}
                >
                  <div className="flex items-start gap-2.5">
                    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-semibold">{meta.label}</span>
                        <span className="font-mono text-[10px] uppercase opacity-80">{f.severity}</span>
                        <span className="font-mono text-[10px] opacity-80">magnitude {Math.round(f.score)}</span>
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed opacity-90">{f.detail}</p>
                      <p className="mt-1 text-[10px] opacity-70">{meta.blurb}</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
