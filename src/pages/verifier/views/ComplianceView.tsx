/**
 * Compliance Report generator — an auditable export of what this verifier did.
 *
 * The report is deliberately transparent about its own limitations: it records
 * what was checked and, just as importantly, what was *not* verifiable from the
 * data BlockID holds. A compliance artefact that quietly omits its gaps is worse
 * than no artefact, because it invites reliance it cannot support.
 *
 * Everything in the report is derived deterministically from the verifier's own
 * records, so re-running it on the same data produces byte-identical output
 * apart from the generation timestamp.
 */
import { useMemo, useState } from "react";
import {
  FileText, Download, Copy, ShieldCheck, AlertTriangle, Check, Info, Printer,
} from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { downloadTextFile } from "@/services/api/verifier.service";
import {
  analyzeRecords,
  buildCircuitBreakdown,
  buildIssuerLeaderboard,
  buildRevocationImpact,
  buildTrustHistogram,
  computeRecordTrust,
  credentialTypeOf,
  evaluatePolicyForRecord,
  isAccepted,
  isAwaitingVerification,
  isRejected,
  issuerOf,
  riskLevel,
  RISK_LEVEL_LABEL,
  type IntelligenceRecord,
} from "@/lib/verifier/intelligence";
import type { VerificationPolicy } from "@/lib/verifier/policy";

export interface ComplianceReport {
  report_type: "blockid-verifier-compliance-report";
  schema_version: 1;
  generated_at: string;
  period: { from: string | null; to: string | null };
  organisation: { verifier_id: string; name: string };
  scope: {
    verifications_considered: number;
    accepted: number;
    rejected: number;
    pending: number;
    credential_types: string[];
    issuers: string[];
  };
  assurance: {
    zkp_verified: number;
    zkp_rate_pct: number;
    on_chain_anchored: number;
    on_chain_rate_pct: number;
    biometric_confirmed: number;
    sbt_badged: number;
    avg_trust_score: number;
    trust_distribution: Record<string, number>;
  };
  risk: {
    aggregate_score: number;
    level: string;
    findings: { type: string; severity: string; detail: string }[];
  };
  issuer_breakdown: {
    issuer: string;
    total: number;
    acceptance_rate_pct: number;
    zkp_adoption_pct: number;
    avg_trust_score: number;
  }[];
  circuit_usage: { name: string; value: number }[];
  revocation_impact: { bucket: string; valid: number; invalidated: number }[];
  limitations: string[];
}

/**
 * Static list of what this report cannot attest to. Written as data so it is
 * rendered identically in the preview, the JSON, and the downloaded file.
 */
const LIMITATIONS = [
  "This report evidences the verifier's own process. It does not attest that a presented claim was factually true — that is the issuer's assertion.",
  "Signature validity is reported as observed by the verify-credential service. BlockID does not independently re-run Data Integrity proof validation in the browser.",
  "Biometric and smart-wallet signals are read from their respective on-chain registries and are only present when those contracts are configured and the presentation carried the relevant data.",
  "Anomaly findings are heuristic. They are triage signals, not determinations of misconduct, and are not a basis for adverse action on their own.",
  "Blocklist entries are internal to this verifier organisation and are not disclosed to the holder, the issuer, or other verifiers.",
  "The report covers the selected period only. Verifications outside it are not represented and were not re-examined.",
];

function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 100);
}

export function buildComplianceReport(input: {
  verifierId: string;
  organisationName: string;
  records: IntelligenceRecord[];
  from: string | null;
  to: string | null;
}): ComplianceReport {
  const { verifierId, organisationName, records, from, to } = input;

  // Mutually exclusive buckets. Anything still waiting on a decision — a
  // pending request, a presentation parked in the inbox, or a legacy
  // auto-verify row that never got scored — is pending, never rejected.
  const isPendingRow = (r: IntelligenceRecord) =>
    r.status === "pending" || isAwaitingVerification(r);
  const pending = records.filter(isPendingRow);
  const accepted = records.filter((r) => !isPendingRow(r) && isAccepted(r));
  const rejected = records.filter((r) => !isPendingRow(r) && isRejected(r));

  const zkpVerified = records.filter((r) => r.zkp_proof_valid === true).length;
  const onChain = records.filter((r) => r.zkp_on_chain_valid === true).length;
  const biometric = records.filter((r) => r.biometric_verified === true).length;
  const badged = records.filter((r) => typeof r.sbt_token_id === "number").length;

  const scores = records.map((r) => computeRecordTrust(r).score);
  const avgTrust = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  const report = analyzeRecords(records);
  const level = riskLevel(report?.riskScore);

  return {
    report_type: "blockid-verifier-compliance-report",
    schema_version: 1,
    generated_at: new Date().toISOString(),
    period: {
      from: from ?? (records.length ? records[records.length - 1].created_at : null),
      to: to ?? (records.length ? records[0].created_at : null),
    },
    organisation: { verifier_id: verifierId, name: organisationName },
    scope: {
      verifications_considered: records.length,
      accepted: accepted.length,
      rejected: rejected.length,
      pending: pending.length,
      credential_types: [...new Set(records.map(credentialTypeOf).filter((t): t is string => !!t))].sort(),
      issuers: [...new Set(records.map(issuerOf).filter((i): i is string => !!i))].sort(),
    },
    assurance: {
      zkp_verified: zkpVerified,
      zkp_rate_pct: pct(zkpVerified, records.length),
      on_chain_anchored: onChain,
      on_chain_rate_pct: pct(onChain, records.length),
      biometric_confirmed: biometric,
      sbt_badged: badged,
      avg_trust_score: Math.round(avgTrust),
      trust_distribution: buildTrustHistogram(records).reduce<Record<string, number>>((acc, b) => {
        acc[b.bucket] = b.count;
        return acc;
      }, {}),
    },
    risk: {
      aggregate_score: Math.round(report?.riskScore ?? 0),
      level: RISK_LEVEL_LABEL[level],
      findings: (report?.findings ?? []).map((f) => ({
        type: f.type,
        severity: f.severity,
        detail: f.detail,
      })),
    },
    issuer_breakdown: buildIssuerLeaderboard(records, 50).map((r) => ({
      issuer: r.issuer,
      total: r.total,
      acceptance_rate_pct: r.acceptanceRate,
      zkp_adoption_pct: r.zkpAdoption,
      avg_trust_score: r.avgTrustScore,
    })),
    circuit_usage: buildCircuitBreakdown(records),
    revocation_impact: buildRevocationImpact(records),
    limitations: LIMITATIONS,
  };
}

interface ComplianceViewProps {
  verifierId: string;
  history: IntelligenceRecord[];
  organisationName?: string;
  activePolicy?: VerificationPolicy | null;
}

const ComplianceView = ({ verifierId, history, organisationName, activePolicy }: ComplianceViewProps) => {
  const { toast } = useToast();
  const [name, setName] = useState(organisationName ?? "My verification organisation");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const scoped = useMemo(() => {
    if (!from && !to) return history;
    const lo = from ? Date.parse(from) : -Infinity;
    const hi = to ? Date.parse(`${to}T23:59:59Z`) : Infinity;
    return history.filter((r) => {
      const t = Date.parse(r.created_at);
      return Number.isFinite(t) && t >= lo && t <= hi;
    });
  }, [history, from, to]);

  const report = useMemo(
    () =>
      buildComplianceReport({
        verifierId,
        organisationName: name,
        records: scoped,
        from: from ? new Date(`${from}T00:00:00Z`).toISOString() : null,
        to: to ? new Date(`${to}T23:59:59Z`).toISOString() : null,
      }),
    [verifierId, name, scoped, from, to]
  );

  const policyCoverage = useMemo(() => {
    if (!activePolicy) return null;
    const pass = scoped.filter(
      (r) => evaluatePolicyForRecord(activePolicy, r).passed
    ).length;
    return { total: scoped.length, passed: pass, rate: pct(pass, scoped.length) };
  }, [activePolicy, scoped]);

  const asJson = useMemo(() => JSON.stringify(report, null, 2), [report]);

  const asMarkdown = useMemo(() => {
    const L: string[] = [];
    L.push(`# Compliance Report — ${report.organisation.name}`);
    L.push("");
    L.push(`Generated ${report.generated_at} · schema v${report.schema_version}`);
    L.push("");
    L.push("## Period");
    L.push(`${report.period.from ?? "n/a"} → ${report.period.to ?? "n/a"}`);
    L.push("");
    L.push("## Scope");
    L.push(`- Verifications considered: ${report.scope.verifications_considered}`);
    L.push(`- Accepted: ${report.scope.accepted}`);
    L.push(`- Rejected: ${report.scope.rejected}`);
    L.push(`- Pending: ${report.scope.pending}`);
    L.push(`- Distinct credential types: ${report.scope.credential_types.length}`);
    L.push(`- Distinct issuers: ${report.scope.issuers.length}`);
    L.push("");
    L.push("## Assurance signals");
    L.push(`| Signal | Count | Rate |`);
    L.push(`| --- | --- | --- |`);
    L.push(`| ZKP verified | ${report.assurance.zkp_verified} | ${report.assurance.zkp_rate_pct}% |`);
    L.push(`| On-chain verified | ${report.assurance.on_chain_anchored} | ${report.assurance.on_chain_rate_pct}% |`);
    L.push(`| Biometric confirmed | ${report.assurance.biometric_confirmed} | — |`);
    L.push(`| SBT badged | ${report.assurance.sbt_badged} | — |`);
    L.push(`| Average trust score | ${report.assurance.avg_trust_score}/100 | — |`);
    L.push("");
    L.push(`## Risk`);
    L.push(`${report.risk.level} (${report.risk.aggregate_score}/100)`);
    if (report.risk.findings.length === 0) {
      L.push("");
      L.push("No anomaly detectors fired in this period.");
    } else {
      L.push("");
      for (const f of report.risk.findings) {
        L.push(`- **${f.type}** (${f.severity}) — ${f.detail}`);
      }
    }
    L.push("");
    L.push("## Issuer breakdown");
    L.push(`| Issuer | Verifications | Acceptance | ZKP adoption | Avg trust |`);
    L.push(`| --- | --- | --- | --- | --- |`);
    for (const r of report.issuer_breakdown) {
      const short = r.issuer.length > 28 ? `${r.issuer.slice(0, 14)}…${r.issuer.slice(-10)}` : r.issuer;
      L.push(`| ${short} | ${r.total} | ${r.acceptance_rate_pct}% | ${r.zkp_adoption_pct}% | ${r.avg_trust_score} |`);
    }
    L.push("");
    L.push("## Limitations");
    L.push("This report does not attest to the following:");
    for (const lim of report.limitations) {
      L.push(`- ${lim}`);
    }
    return L.join("\n");
  }, [report]);

  const download = (filename: string, content: string, mime: string) => {
    downloadTextFile(filename, content, mime);
    toast({ title: "Downloaded", description: filename });
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-headline mb-1">Compliance Report</h2>
            <p className="text-muted-foreground">
              An auditable export of what was checked — and what could not be
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => download(`blockid-compliance-${Date.now()}.md`, asMarkdown, "text/markdown")}
              disabled={scoped.length === 0}
            >
              <FileText className="h-4 w-4" /> Markdown
            </Button>
            <Button
              className="btn-primary gap-2"
              onClick={() => download(`blockid-compliance-${Date.now()}.json`, asJson, "application/json")}
              disabled={scoped.length === 0}
            >
              <Download className="h-4 w-4" /> JSON
            </Button>
          </div>
        </div>
      </motion.div>

      {/* ── Configuration ── */}
      <Card className="solid-card">
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2 sm:col-span-1">
              <Label>Organisation name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="input-solid text-xs" />
            </div>
            <div className="space-y-2">
              <Label>From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input-solid text-xs" />
            </div>
            <div className="space-y-2">
              <Label>To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input-solid text-xs" />
            </div>
          </div>

          {scoped.length === 0 ? (
            <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-[11px] text-amber-500">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              No verifications fall in this period, so there is nothing to report. Widen the date
              range or clear the filters.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {scoped.length} verification{scoped.length === 1 ? "" : "s"} in scope
              {scoped.length !== history.length ? ` (of ${history.length} total)` : ""}.
            </p>
          )}
        </CardContent>
      </Card>

      {scoped.length > 0 ? (
        <Tabs defaultValue="summary">
          <TabsList>
            <TabsTrigger value="summary" className="text-xs">Summary</TabsTrigger>
            <TabsTrigger value="issuers" className="text-xs">Issuers</TabsTrigger>
            <TabsTrigger value="raw" className="text-xs gap-1.5">
              <Copy className="h-3 w-3" /> JSON
            </TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="space-y-4 pt-4">
            {/* Headline numbers */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { k: "Considered", v: String(report.scope.verifications_considered) },
                { k: "Accepted", v: String(report.scope.accepted) },
                { k: "Rejected", v: String(report.scope.rejected) },
                { k: "Avg trust", v: `${report.assurance.avg_trust_score}` },
              ].map((s) => (
                <div key={s.k} className="rounded-lg border border-border p-3">
                  <p className="font-mono text-[10px] text-muted-foreground">{s.k}</p>
                  <p className="font-mono text-xl font-semibold text-foreground mt-1">{s.v}</p>
                </div>
              ))}
            </div>

            {/* Assurance table */}
            <Card className="solid-card">
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-verifier" />
                  <span className="text-sm font-semibold text-foreground">Assurance signals</span>
                </div>
                <div className="rounded-lg border border-border divide-y divide-border/60 overflow-hidden">
                  {[
                    { k: "ZKP verified", n: report.assurance.zkp_verified, p: report.assurance.zkp_rate_pct },
                    { k: "On-chain verified", n: report.assurance.on_chain_anchored, p: report.assurance.on_chain_rate_pct },
                    { k: "Biometric confirmed", n: report.assurance.biometric_confirmed, p: null },
                    { k: "SBT badged", n: report.assurance.sbt_badged, p: null },
                  ].map((r) => (
                    <div key={r.k} className="flex items-center justify-between px-3 py-2 text-[11px]">
                      <span className="text-muted-foreground">{r.k}</span>
                      <span className="font-mono text-foreground">
                        {r.n}
                        {r.p !== null ? <span className="text-muted-foreground"> ({r.p}%)</span> : null}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Rates are share of verifications in period. A low ZKP rate is not a defect — it
                  means most holders presented their credentials directly.
                </p>
              </CardContent>
            </Card>

            {/* Policy coverage */}
            {policyCoverage ? (
              <Card className="solid-card">
                <CardContent className="pt-6 space-y-2">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-verifier" />
                    <span className="text-sm font-semibold text-foreground">Active policy coverage</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Your active policy would accept{" "}
                    <span className={policyCoverage.rate > 0 ? "text-emerald-500" : "text-destructive"}>
                      {policyCoverage.rate}%
                    </span>{" "}
                    of the verifications in this period ({policyCoverage.passed}/{policyCoverage.total}).
                  </p>
                </CardContent>
              </Card>
            ) : null}

            {/* Risk */}
            <Card className="solid-card">
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">Aggregate risk</span>
                  <Badge variant="outline" size="sm">
                    {report.risk.level} · {report.risk.aggregate_score}/100
                  </Badge>
                </div>
                {report.risk.findings.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    No anomaly detectors fired during this period.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {report.risk.findings.map((f, i) => (
                      <li key={i} className="text-[11px] text-muted-foreground">
                        <span className="font-mono text-foreground">{f.type}</span> ({f.severity}) —{" "}
                        {f.detail}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Limitations — deliberately prominent */}
            <Card className="solid-card border-amber-500/30">
              <CardContent className="pt-6 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-semibold text-foreground">
                    What this report does not attest to
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {report.limitations.map((lim, i) => (
                    <li key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                      <span className="text-amber-500 shrink-0">·</span>
                      <span className="leading-relaxed">{lim}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="issuers" className="pt-4">
            <Card className="solid-card">
              <CardContent className="pt-6 space-y-3">
                <div className="rounded-lg border border-border divide-y divide-border/60 overflow-hidden">
                  {report.issuer_breakdown.map((r) => (
                    <div key={r.issuer} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30">
                      <span className="font-mono text-[10px] text-foreground flex-1 truncate">{r.issuer}</span>
                      <span className="font-mono text-[10px] text-muted-foreground w-12 text-right">
                        {r.total} req
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground w-14 text-right">
                        {r.acceptance_rate_pct}% acc
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground w-14 text-right">
                        {r.zkp_adoption_pct}% zkp
                      </span>
                      <span className="font-mono text-[10px] text-foreground w-10 text-right">
                        {r.avg_trust_score}
                      </span>
                    </div>
                  ))}
                </div>
                {report.circuit_usage.length > 0 ? (
                  <>
                    <Separator />
                    <p className="font-mono text-[10px] text-muted-foreground">Circuit usage</p>
                    <div className="flex flex-wrap gap-1.5">
                      {report.circuit_usage.map((c) => (
                        <Badge key={c.name} variant="secondary" size="sm">
                          {c.name} · {c.value}
                        </Badge>
                      ))}
                    </div>
                  </>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="raw" className="pt-4">
            <div className="flex justify-end gap-2 mb-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => { navigator.clipboard.writeText(asJson); toast({ title: "Copied JSON" }); }}
              >
                <Copy className="h-3.5 w-3.5" /> Copy
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => window.print()}
              >
                <Printer className="h-3.5 w-3.5" /> Print
              </Button>
            </div>
            <Textarea
              readOnly
              value={asJson}
              rows={24}
              className="font-mono text-[10px] input-solid"
            />
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  );
}

export default ComplianceView;
