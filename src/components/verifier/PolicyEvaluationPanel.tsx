/**
 * PolicyEvaluationPanel — shows how a policy judged a single presentation.
 *
 * Every rule is listed with its verdict, including the rules the policy does
 * *not* require. That is deliberate: a verifier reading "passed" needs to see
 * which checks were skipped by their own policy, otherwise "policy passed" and
 * "everything checked out" become indistinguishable.
 */
import { Check, X, Minus, ShieldCheck, Scale } from "lucide-react";
import { motion } from "framer-motion";
import type { PolicyEvaluation } from "@/lib/verifier/policy";

export default function PolicyEvaluationPanel({ evaluation }: { evaluation: PolicyEvaluation }) {
  const required = evaluation.rules.filter((r) => r.required);
  const optional = evaluation.rules.filter((r) => !r.required);

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Scale className="h-4 w-4 text-verifier shrink-0" />
          <span className="text-sm font-semibold text-foreground truncate">{evaluation.policyName}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-muted-foreground">
            {evaluation.rules.length - evaluation.failedRules.length}/{evaluation.rules.length} rules
          </span>
          <span
            className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
              evaluation.passed
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                : "border-destructive/40 bg-destructive/10 text-destructive"
            }`}
          >
            {evaluation.passed ? "policy met" : "policy failed"}
          </span>
        </div>
      </div>

      {evaluation.failedRules.length > 0 ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
          <p className="text-[11px] text-destructive font-semibold">
            Failed: {evaluation.failedRules.join(", ")}
          </p>
        </div>
      ) : null}

      <div className="space-y-1.5">
        {required.map((r, i) => (
          <RuleRow key={r.key} rule={r} index={i} />
        ))}
      </div>

      {optional.length > 0 ? (
        <details className="group">
          <summary className="cursor-pointer list-none text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1.5">
            <Minus className="h-3 w-3" />
            {optional.length} check{optional.length === 1 ? "" : "s"} not required by this policy
          </summary>
          <div className="mt-2 space-y-1.5">
            {optional.map((r, i) => (
              <RuleRow key={r.key} rule={r} index={i} muted />
            ))}
          </div>
        </details>
      ) : null}

      {evaluation.passed ? (
        <p className="flex items-start gap-1.5 text-[10px] text-muted-foreground leading-relaxed">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
          The policy is a decision aid, not an oracle. It encodes this verifier&apos;s
          stated requirements — it cannot vouch for the truth of the underlying claim.
        </p>
      ) : null}
    </div>
  );
}

function RuleRow({
  rule,
  index,
  muted = false,
}: {
  rule: PolicyEvaluation["rules"][number];
  index: number;
  muted?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      className={`flex items-start gap-2.5 rounded-lg border px-2.5 py-2 ${
        !rule.required
          ? "border-border/60 bg-transparent"
          : rule.passed
            ? "border-emerald-500/30 bg-emerald-500/5"
            : "border-destructive/30 bg-destructive/5"
      }`}
    >
      {rule.passed ? (
        <Check className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${muted ? "text-emerald-500/60" : "text-emerald-500"}`} />
      ) : (
        <X className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${muted ? "text-muted-foreground/50" : "text-destructive"}`} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[11px] font-semibold ${muted ? "text-muted-foreground" : "text-foreground"}`}>
            {rule.label}
          </span>
          {!rule.required ? (
            <span className="rounded-full border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              optional
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{rule.detail}</p>
      </div>
    </motion.div>
  );
}
