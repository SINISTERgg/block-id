/**
 * IssuerProfile — who issued the credential, and should the verifier care?
 *
 * Reputation is derived from this verifier's own history (acceptance rate,
 * revocation rate, average trust score, ZKP adoption) rather than from a
 * self-reported number, because a reputation a verifier cannot observe is not
 * evidence.
 *
 * Deliberately read-only. The only denylist in BlockID is scoped to *holder*
 * DIDs, so an "Block issuer" button here would either write an issuer into the
 * holder column or need a second, org-visible list with different disclosure
 * rules. Neither is something to do quietly inside a profile card — issuer-level
 * escalation is a policy decision, not a UI affordance.
 */
import { Building2, BadgeCheck, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { TIER_COLORS, scoreToTier } from "@/lib/ml/trustScore";
import { useState } from "react";
import { issuerOf, isAccepted, computeRecordTrust } from "@/lib/verifier/intelligence";
import type { IntelligenceRecord } from "@/lib/verifier/intelligence";

interface IssuerProfileProps {
  issuer: string | null;
  /** All of this verifier's records, used to build the issuer's track record. */
  records: IntelligenceRecord[];
}

function Trend({ value }: { value: number }) {
  if (value > 0) return <TrendingUp className="h-3 w-3 text-emerald-500" />;
  if (value < 0) return <TrendingDown className="h-3 w-3 text-destructive" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
}

export default function IssuerProfile({ issuer, records }: IssuerProfileProps) {
  const [expanded, setExpanded] = useState(false);

  if (!issuer) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-3 text-[11px] text-muted-foreground">
        <Building2 className="h-4 w-4 shrink-0" />
        This presentation did not identify its issuer.
      </div>
    );
  }

  const mine = records.filter((r) => issuerOf(r) === issuer);
  const total = mine.length;
  const accepted = mine.filter(isAccepted).length;
  const acceptanceRate = total ? Math.round((accepted / total) * 100) : 0;
  const revoked = total - accepted;
  const zkpAdoption = total
    ? Math.round((mine.filter((r) => r.zkp_proof_valid).length / total) * 100)
    : 0;
  const scores = mine.map((r) => computeRecordTrust(r).score);
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const tier = scoreToTier(avgScore);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-verifier/15 flex items-center justify-center shrink-0">
            <Building2 className="h-4 w-4 text-verifier" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono text-[11px] font-semibold text-foreground break-all">{issuer}</span>
              {total > 0 ? (
                <BadgeCheck className="h-3.5 w-3.5 text-emerald-500" />
              ) : null}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {total === 0
                ? "No prior verifications from this issuer"
                : `${total} verification${total === 1 ? "" : "s"} in your history`}
            </p>
          </div>
        </div>
      </div>

      {total > 0 ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { k: "Acceptance", v: `${acceptanceRate}%`, trend: acceptanceRate - 70 },
              { k: "Revoked", v: String(revoked), trend: -Math.round((revoked / total) * 100) },
              { k: "ZKP use", v: `${zkpAdoption}%`, trend: zkpAdoption - 50 },
              { k: "Avg trust", v: String(Math.round(avgScore)), trend: avgScore - 60 },
            ].map((s) => (
              <div key={s.k} className="rounded-lg border border-border px-2.5 py-2">
                <div className="flex items-center gap-1">
                  <span className="font-mono text-[10px] text-muted-foreground">{s.k}</span>
                  <Trend value={s.trend} />
                </div>
                <div className="font-mono text-sm font-semibold text-foreground mt-0.5">{s.v}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-muted-foreground">Reputation tier</span>
            <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${TIER_COLORS[tier]}`}>
              {tier}
            </span>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="ml-auto text-[10px] text-verifier hover:underline"
            >
              {expanded ? "Hide method" : "How this is computed"}
            </button>
          </div>

          {expanded ? (
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 space-y-1.5">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Tier is derived from this portal&apos;s own history of the issuer — not from
                anything the issuer claims about itself.
              </p>
              <Separator />
              <ul className="space-y-1 text-[10px] text-muted-foreground">
                <li>· Acceptance rate is accepted / total for this issuer, in your verifications only.</li>
                <li>· Revoked counts every non-accepted presentation, including policy failures.</li>
                <li>· ZKP use is the share of presentations where a Groth16 proof was verified.</li>
                <li>· Avg trust is the mean of the 8-factor model across those verifications.</li>
              </ul>
              <p className="text-[10px] text-muted-foreground/80">
                A new issuer with no history is unrated rather than rated badly — a low
                sample is missing information, not evidence of a bad issuer.
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
