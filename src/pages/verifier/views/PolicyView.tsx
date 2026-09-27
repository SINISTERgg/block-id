/**
 * Policy Builder — compose a declarative acceptance policy.
 *
 * The policy document is pure JSON (`@/lib/verifier/policy`); this view is a
 * form over it. Two things it deliberately provides:
 *
 *   1. A live preview against real verifications, so a verifier can see what a
 *      candidate policy would have done to their *existing* history before
 *      activating it. Editing blind and then discovering the policy rejects
 *      everything is the failure mode this prevents.
 *   2. An explicit rule count, because a policy with no requirements always
 *      "passes" — which must never be mistaken for a strict policy.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Scale, Plus, Trash2, Check, Loader2, Star, Copy, AlertTriangle, Play,
} from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  activatePolicy,
  createPolicy,
  deletePolicy,
  fetchPolicies,
  updatePolicy,
  type VerificationPolicyRow,
} from "@/services/api/verifier.service";
import {
  DEFAULT_POLICY,
  evaluatePolicy,
  normalizePolicy,
  policyRuleCount,
  type PolicyZkpRequirement,
  type VerificationPolicy,
} from "@/lib/verifier/policy";
import { evidenceFromRecord, type IntelligenceRecord } from "@/lib/verifier/intelligence";
import { TIER_LABELS, type TrustTier } from "@/lib/ml/trustScore";
import { CIRCUIT_META, CIRCUIT_ORDER } from "@/data/zkpCircuits";
import type { CircuitName } from "@/lib/zkp";

const TRUST_TIERS: TrustTier[] = ["untrusted", "bronze", "silver", "gold", "platinum"];

interface PolicyBuilderViewProps {
  verifierId: string;
  /** The verifier's verification history, used for the live preview. */
  history: IntelligenceRecord[];
}

const PolicyView = ({ verifierId, history }: PolicyBuilderViewProps) => {
  const { toast } = useToast();
  const [policies, setPolicies] = useState<VerificationPolicyRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<VerificationPolicy>(DEFAULT_POLICY);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [newType, setNewType] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchPolicies(verifierId);
      setPolicies(rows);
      const active = rows.find((r) => r.is_active) ?? rows[0] ?? null;
      if (active) {
        setSelectedId(active.id);
        setName(active.name);
        setDescription(active.description ?? "");
        setDraft(normalizePolicy(active.policy_json));
      }
    } catch (err) {
      toast({
        title: "Could not load policies",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [verifierId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const ruleCount = policyRuleCount(draft);

  // Preview the draft against real history. Capped at 200 rows so the
  // synchronous evaluator never blocks the main thread on a large account.
  const preview = useMemo(() => {
    const sample = history.slice(0, 200);
    if (sample.length === 0) return null;
    let passed = 0;
    const failedByRule = new Map<string, number>();
    for (const r of sample) {
      const result = evaluatePolicy(draft, evidenceFromRecord(r), "Draft policy");
      if (result.passed) passed += 1;
      for (const key of result.failedRules) {
        failedByRule.set(key, (failedByRule.get(key) ?? 0) + 1);
      }
    }
    return {
      total: sample.length,
      passed,
      passRate: Math.round((passed / sample.length) * 100),
      topFailure: [...failedByRule.entries()].sort((a, b) => b[1] - a[1])[0] ?? null,
    };
  }, [draft, history]);

  const patch = (p: Partial<VerificationPolicy>) => setDraft((d) => ({ ...d, ...p }));

  const toggleZkp = (circuit: CircuitName) => {
    setDraft((d) => {
      const has = d.require_zkp.some((r) => r.circuit === circuit);
      return {
        ...d,
        require_zkp: has
          ? d.require_zkp.filter((r) => r.circuit !== circuit)
          : [...d.require_zkp, { circuit }],
      };
    });
  };

  const setZkpThreshold = (circuit: CircuitName, value: string) => {
    setDraft((d) => ({
      ...d,
      require_zkp: d.require_zkp.map((r) =>
        r.circuit === circuit
          ? { ...r, min_threshold: value === "" ? undefined : Number(value) }
          : r
      ),
    }));
  };

  const addType = () => {
    const t = newType.trim();
    if (!t) return;
    if (draft.required_credential_types.some((x) => x.toLowerCase() === t.toLowerCase())) {
      toast({ title: "Already in the allow-list" });
      return;
    }
    patch({ required_credential_types: [...draft.required_credential_types, t] });
    setNewType("");
  };

  const save = async () => {
    if (!name.trim()) {
      toast({ title: "Name required", description: "Give the policy a name so it can be selected later." });
      return;
    }
    setSaving(true);
    try {
      if (selectedId) {
        await updatePolicy(selectedId, { name, description, policy_json: draft });
        toast({ title: "Policy saved" });
      } else {
        const created = await createPolicy(verifierId, { name, description, policy_json: draft });
        setSelectedId(created.id);
        toast({ title: "Policy created", description: "Activate it to use it during verification." });
      }
      await load();
    } catch (err) {
      toast({
        title: "Could not save policy",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const activate = async (id: string) => {
    try {
      await activatePolicy(verifierId, id);
      toast({ title: "Policy activated", description: "New verifications will be evaluated against it." });
      await load();
    } catch (err) {
      toast({
        title: "Could not activate policy",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

  const remove = async (id: string) => {
    try {
      await deletePolicy(id);
      if (selectedId === id) {
        setSelectedId(null);
        setName("");
        setDescription("");
        setDraft(DEFAULT_POLICY);
      }
      toast({ title: "Policy deleted" });
      await load();
    } catch (err) {
      toast({
        title: "Could not delete policy",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

  const newPolicy = () => {
    setSelectedId(null);
    setName("");
    setDescription("");
    setDraft(DEFAULT_POLICY);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-headline mb-1">Verification Policies</h2>
            <p className="text-muted-foreground">
              Declarative acceptance rules, evaluated deterministically and offline
            </p>
          </div>
          <Button variant="outline" className="gap-2" onClick={newPolicy}>
            <Plus className="h-4 w-4" /> New policy
          </Button>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* ── Policy list ── */}
        <Card className="solid-card lg:col-span-1 self-start">
          <CardContent className="pt-6 space-y-2">
            <Label>Saved policies</Label>
            {policies.length === 0 ? (
              <p className="text-[11px] text-muted-foreground py-3">
                No policies yet. Without one, verifications report evidence but apply no gating rules.
              </p>
            ) : (
              policies.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelectedId(p.id);
                    setName(p.name);
                    setDescription(p.description ?? "");
                    setDraft(normalizePolicy(p.policy_json));
                  }}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    selectedId === p.id
                      ? "border-verifier/50 bg-verifier/10"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-semibold text-foreground truncate flex-1">
                      {p.name}
                    </span>
                    {p.is_active ? (
                      <Star className="h-3 w-3 text-amber-500 shrink-0" />
                    ) : null}
                  </div>
                  <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
                    {policyRuleCount(normalizePolicy(p.policy_json))} rules
                    {p.is_active ? " · active" : ""}
                  </p>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        {/* ── Builder ── */}
        <Card className="solid-card lg:col-span-3">
          <CardContent className="pt-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Policy name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. KYC — regulated onboarding"
                  className="input-solid text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What this policy is for"
                  className="input-solid text-xs"
                />
              </div>
            </div>

            <Separator />

            {/* Credential types */}
            <div className="space-y-2">
              <Label>Credential type allow-list</Label>
              {draft.required_credential_types.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Empty — every credential type is accepted. A verifier that intends to be
                  selective should name at least one type.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {draft.required_credential_types.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 font-mono text-[10px]"
                    >
                      {t}
                      <button
                        onClick={() => patch({ required_credential_types: draft.required_credential_types.filter((x) => x !== t) })}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Remove ${t}`}
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addType(); } }}
                  placeholder="e.g. UniversityDegreeCredential"
                  className="font-mono text-xs input-solid"
                />
                <Button variant="outline" size="sm" onClick={addType} disabled={!newType.trim()}>
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              </div>
            </div>

            <Separator />

            {/* ZKP requirements */}
            <div className="space-y-2.5">
              <Label>Require a zero-knowledge proof</Label>
              <div className="space-y-2">
                {CIRCUIT_ORDER.map((c) => {
                  const req = draft.require_zkp.find((r) => r.circuit === c) as PolicyZkpRequirement | undefined;
                  return (
                    <div
                      key={c}
                      className={`rounded-lg border p-2.5 ${req ? "border-verifier/50 bg-verifier/5" : "border-border"}`}
                    >
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={!!req}
                          onCheckedChange={() => toggleZkp(c)}
                          aria-label={`Require ${c}`}
                        />
                        <span className="font-mono text-[11px] font-semibold text-foreground flex-1">{c}</span>
                        {c !== "issuer-membership" ? (
                          <Input
                            value={req?.min_threshold ?? ""}
                            onChange={(e) => setZkpThreshold(c, e.target.value)}
                            disabled={!req}
                            placeholder={c === "age-verify" ? "min years" : "min value"}
                            className="w-28 font-mono text-[11px] input-solid h-7"
                          />
                        ) : null}
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground pl-1">
                        {CIRCUIT_META[c].claim}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Boolean requirements */}
            <div className="space-y-2.5">
              <Label>Required evidence</Label>
              {(
                [
                  { key: "require_on_chain_anchor" as const, label: "On-chain anchor", hint: "Credential must be committed to the on-chain registry." },
                  { key: "require_sbt_badge" as const, label: "Soulbound badge", hint: "A non-transferable SBT must exist for the credential hash." },
                  { key: "require_biometric" as const, label: "Biometric proof", hint: "An anchored liveness proof must cover the holder." },
                  { key: "require_smart_wallet" as const, label: "Smart wallet", hint: "Holder must control an ERC-4337 smart account." },
                ] as const
              ).map((row) => (
                <label
                  key={row.key}
                  className="flex items-start gap-2.5 rounded-lg border border-border px-2.5 py-2 cursor-pointer hover:bg-muted/30"
                >
                  <Switch
                    checked={draft[row.key]}
                    onCheckedChange={(v) => patch({ [row.key]: v })}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block text-[12px] font-semibold text-foreground">{row.label}</span>
                    <span className="block text-[10px] text-muted-foreground">{row.hint}</span>
                  </span>
                </label>
              ))}
            </div>

            <Separator />

            {/* Thresholds */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Minimum trust tier</Label>
                <div className="flex flex-wrap gap-1.5">
                  {TRUST_TIERS.map((t) => (
                    <button
                      key={t}
                      onClick={() => patch({ min_trust_tier: t })}
                      className={`rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                        draft.min_trust_tier === t
                          ? "border-verifier/50 bg-verifier/10 text-verifier"
                          : "border-border text-muted-foreground hover:bg-muted/40"
                      }`}
                    >
                      {TIER_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Max credential age (days)</Label>
                <Input
                  type="number"
                  min={1}
                  value={draft.max_credential_age_days}
                  onChange={(e) => patch({ max_credential_age_days: Number(e.target.value) || 1 })}
                  className="font-mono text-xs input-solid"
                />
              </div>
            </div>

            <Separator />

            {/* Actions + preview */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Badge variant={ruleCount > 0 ? "secondary" : "destructive"} size="sm">
                  {ruleCount} rule{ruleCount === 1 ? "" : "s"}
                </Badge>
                {ruleCount === 0 ? (
                  <span className="text-[10px] text-muted-foreground">
                    A policy with no rules always passes.
                  </span>
                ) : null}
              </div>
              <div className="flex gap-2">
                {selectedId ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-destructive hover:text-destructive"
                      onClick={() => remove(selectedId)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => activate(selectedId)}>
                      <Star className="h-3.5 w-3.5" /> Make active
                    </Button>
                  </>
                ) : null}
                <Button className="btn-primary gap-2" onClick={save} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {selectedId ? "Save changes" : "Create policy"}
                </Button>
              </div>
            </div>

            {/* Live preview */}
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-center gap-2">
                <Play className="h-3.5 w-3.5 text-verifier" />
                <span className="text-[11px] font-semibold text-foreground">
                  Preview against your history
                </span>
              </div>
              {preview ? (
                <div className="mt-2 space-y-1.5">
                  <p className="font-mono text-[11px] text-muted-foreground">
                    This policy would accept{" "}
                    <span className={preview.passRate > 0 ? "text-emerald-500" : "text-destructive"}>
                      {preview.passRate}%
                    </span>{" "}
                    of your last {preview.total} verifications ({preview.passed} passed).
                  </p>
                  {preview.topFailure ? (
                    <p className="text-[10px] text-muted-foreground">
                      Most common rejection: <span className="font-mono text-foreground">{preview.topFailure[0]}</span>{" "}
                      ({preview.topFailure[1]} of {preview.total}).
                    </p>
                  ) : preview.passRate === 100 ? (
                    <p className="text-[10px] text-emerald-500">
                      No rejections in this sample — confirm the rules are as strict as you intend.
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  No verification history yet, so there is nothing to preview against.
                </p>
              )}
              {ruleCount > 0 && preview && preview.passRate === 0 ? (
                <p className="mt-2 flex items-start gap-1.5 text-[10px] text-amber-500">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  This policy would reject every verification in your history. Check the
                  thresholds before activating it.
                </p>
              ) : null}
            </div>

            {/* Raw JSON */}
            <Tabs defaultValue="form">
              <TabsList>
                <TabsTrigger value="form" className="text-xs">Form</TabsTrigger>
                <TabsTrigger value="json" className="text-xs gap-1.5">
                  <Copy className="h-3 w-3" /> JSON
                </TabsTrigger>
              </TabsList>
              <TabsContent value="json" className="pt-3">
                <pre className="text-[10px] font-mono bg-muted rounded-lg p-3 overflow-auto max-h-64">
                  {JSON.stringify(draft, null, 2)}
                </pre>
              </TabsContent>
              <TabsContent value="form" />
            </Tabs>

            <div className="space-y-2">
              <Label>Import policy JSON</Label>
              <Textarea
                rows={3}
                className="font-mono text-xs input-solid"
                placeholder='{ "require_zkp": [{ "circuit": "age-verify", "min_threshold": 18 }] }'
                onBlur={(e) => {
                  const text = e.target.value.trim();
                  if (!text) return;
                  try {
                    setDraft(normalizePolicy(JSON.parse(text)));
                    e.target.value = "";
                    toast({ title: "Policy imported" });
                  } catch {
                    toast({ title: "Invalid JSON", variant: "destructive" });
                  }
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PolicyView;
