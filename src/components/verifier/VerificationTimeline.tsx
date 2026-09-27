/**
 * VerificationTimeline — the credential's lifecycle as the verifier can
 * actually observe it.
 *
 * Every step carries a `verified` state derived from evidence, never from a
 * client-supplied flag, and steps that could not be checked are rendered as
 * "unknown" rather than being quietly dropped. A timeline that silently omits
 * the revocation check reads exactly like one where revocation passed.
 */
import { Check, X, CircleHelp, Clock } from "lucide-react";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

type StepState = "pass" | "fail" | "unknown";

export interface TimelineStep {
  key: string;
  label: string;
  detail: string;
  state: StepState;
  /** ISO timestamp, when the event has one. */
  at?: string | null;
  icon?: LucideIcon;
}

const STATE_META: Record<StepState, { icon: LucideIcon; cls: string; word: string }> = {
  pass: { icon: Check, cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500", word: "pass" },
  fail: { icon: X, cls: "border-destructive/40 bg-destructive/10 text-destructive", word: "fail" },
  unknown: { icon: CircleHelp, cls: "border-border bg-muted/30 text-muted-foreground", word: "not checked" },
};

function formatAt(at: string | null | undefined): string | null {
  if (!at) return null;
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0, 16).replace("T", " ") + "Z";
}

export default function VerificationTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="relative space-y-0">
      {steps.map((s, i) => {
        const meta = STATE_META[s.state];
        const StateIcon = s.state === "unknown" ? meta.icon : meta.icon;
        const isLast = i === steps.length - 1;
        return (
          <motion.li
            key={s.key}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05, duration: 0.25 }}
            className="relative flex gap-3 pb-4 last:pb-0"
          >
            {/* Connector */}
            {!isLast ? (
              <span className="absolute left-[11px] top-6 bottom-0 w-px bg-border" aria-hidden />
            ) : null}

            <span
              className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${meta.cls}`}
            >
              <StateIcon className="h-3 w-3" />
            </span>

            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <span className="text-[12px] font-semibold text-foreground">{s.label}</span>
                <span className="flex items-center gap-2">
                  {s.at ? (
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                      <Clock className="h-2.5 w-2.5" />
                      {formatAt(s.at)}
                    </span>
                  ) : null}
                  <span className={`font-mono text-[10px] uppercase tracking-wider ${meta.cls.split(" ").pop()}`}>
                    {meta.word}
                  </span>
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{s.detail}</p>
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
