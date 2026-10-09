import { useMemo, useState } from "react";
import { CheckCircle2, XCircle, Link2, PenTool, Copy, Check, ChevronDown, ChevronUp, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CredentialAIAssistant from "@/components/CredentialAIAssistant";
import TrustScoreRadar from "@/components/verifier/TrustScoreRadar";
import AnomalyPanel from "@/components/verifier/AnomalyPanel";
import VerificationTimeline from "@/components/verifier/VerificationTimeline";
import SelectiveDisclosureInspector from "@/components/verifier/SelectiveDisclosureInspector";
import HolderEvidenceStrip from "@/components/verifier/HolderEvidenceStrip";
import IssuerProfile from "@/components/verifier/IssuerProfile";
import PolicyEvaluationPanel from "@/components/verifier/PolicyEvaluationPanel";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { computeTrustScore, analysisToTrustScore, type TrustFactors, type TrustTier } from "@/lib/ml/trustScore";
import { normalizeAiAnalysis } from "@/lib/ml/aiAnalysis";
import type { AnomalyFinding, AnomalyReport } from "@/lib/ml/anomaly";
import { evaluatePolicy, normalizePolicy, type VerificationPolicy } from "@/lib/verifier/policy";
import { analyzeHolderRecords } from "@/lib/verifier/intelligence";
import type { IntelligenceRecord } from "@/lib/verifier/intelligence";
import type { TimelineStep } from "@/components/verifier/VerificationTimeline";
import type { CircuitName } from "@/lib/zkp";

interface VerificationResultViewProps {
  result: Record<string, any>;
  compact?: boolean;
  /**
   * Verifier's own verification history. Supplies the holder/issuer priors the
   * trust model and anomaly detectors need — a single presentation alone is
   * not enough history to judge behaviour.
   */
  history?: IntelligenceRecord[];
  /** Active policy to evaluate this presentation against. */
  policy?: VerificationPolicy | null;
  /** Persisted per-request intelligence from the verification_requests row. */
  stored?: {
    zkp_circuit?: CircuitName | null;
    zkp_proof_valid?: boolean | null;
    zkp_on_chain_valid?: boolean | null;
    zkp_nullifier?: string | null;
    trust_score?: number | null;
    trust_tier?: TrustTier | null;
    anomaly_risk?: number | null;
    anomaly_findings?: AnomalyFinding[] | null;
    biometric_verified?: boolean | null;
    sbt_token_id?: number | null;
  };
  blockedHolders?: string[];
  onBlockHolder?: (did: string) => void;
  onUnblockHolder?: (did: string) => void;
}

const ResultBadge = ({ valid }: { valid: boolean }) =>
  valid ? (
    <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-semibold">
      <CheckCircle2 className="h-3.5 w-3.5" /> VALID
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-destructive/10 text-destructive border border-destructive/20 font-semibold">
      <XCircle className="h-3.5 w-3.5" /> INVALID
    </span>
  );

/**
 * Tri-state tile for a check whose outcome can legitimately be "not checked".
 * Two-state tiles make an unperformed check look like a pass.
 */
const TriTile = ({ state, label, value }: { state: "pass" | "fail" | "unknown"; label: string; value: string }) => {
  const cls =
    state === "pass"
      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600"
      : state === "fail"
        ? "bg-destructive/10 border-destructive/20 text-destructive"
        : "bg-muted/40 border-border text-muted-foreground";
  return (
    <div className={`p-3 rounded-lg text-center border ${cls}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
};

export const VerificationResultView = ({
  result,
  compact = false,
  history = [],
  policy,
  stored,
  blockedHolders = [],
  onBlockHolder,
  onUnblockHolder,
}: VerificationResultViewProps) => {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const copyJson = () => {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopied(true);
    toast({ title: "Copied to clipboard", description: "Verification report copied as JSON." });
    setTimeout(() => setCopied(false), 2000);
  };

  // Everything below the guard is derived from `result`; the early return sits
  // just above the JSX so that every hook above it runs unconditionally. An
  // early return placed before these hooks would change the hook count between
  // renders whenever a caller passes a result that can become null.
  const valid = !!result?.valid;
  const onChain = result?.on_chain_verification || result?.blockchain_info;

  // ── Intelligence derived from this presentation ──
  const holderDid: string | null = result?.holder_did ?? result?.holderDid ?? null;
  const credentialHash: string | null = result?.credential_hash ?? result?.hash ?? null;
  const biometricProofHash: string | null =
    result?.biometric_proof_hash ?? result?.biometricProofHash ?? null;
  const schemaType: string | null = result?.schema_type ?? result?.schemaType ?? null;
  const issuer: string | null = result?.issuer ?? result?.issuer_did ?? result?.issuerDid ?? null;

  // A ZKP may have been attached either to this live report or to the persisted row.
  const zkpCircuit: CircuitName | null =
    (result.zkp?.circuit as CircuitName | undefined) ?? stored?.zkp_circuit ?? null;
  const zkpProofValid: boolean | null =
    result.zkp?.proof_valid ?? result.zkp_proof_valid ?? stored?.zkp_proof_valid ?? null;
  const zkpOnChainValid: boolean | null =
    result.zkp?.on_chain_valid ?? result.zkp_on_chain_valid ?? stored?.zkp_on_chain_valid ?? null;
  const zkpNullifier: string | null = result.zkp?.nullifier ?? stored?.zkp_nullifier ?? null;

  const anomalyReport: AnomalyReport | null = useMemo(() => {
    if (!holderDid) return null;
    const scoped = history.filter((r) => r.holder_did === holderDid);
    if (scoped.length < 2) return null;
    return analyzeHolderRecords(scoped);
  }, [history, holderDid]);

  // The canonical analysis, normalised onto the current schema. Any historical
  // or v1 payload still renders correctly instead of half-populating the panel.
  const analysis = useMemo(() => normalizeAiAnalysis(result?.ai_analysis), [result?.ai_analysis]);

  /**
   * `normalizeAiAnalysis(null)` returns a synthetic zeroed analysis so the
   * panels always have a structurally valid object to render. That placeholder
   * carries eight `unknown` dimensions, which is enough to fool a naive
   * `dimensions.length > 0` test — and it did: the result view kept reading it
   * as a real engine run and hard-coded 0 / UNTRUSTED instead of falling back
   * to the live trust engine. A recorded analysis is one where the row actually
   * carried `ai_analysis` *and* it normalised onto concrete results.
   */
  const hasRecordedAnalysis =
    !!result?.ai_analysis &&
    (analysis.score > 0 ||
      analysis.confidence > 0 ||
      analysis.dimensions.some((d) => d.status !== "unknown"));

  const trustResult = useMemo(() => {
    // Prefer the engine's own analysis: it carries the full factor breakdown,
    // so the radar and the trust panel are guaranteed to show the same number.
    if (hasRecordedAnalysis) {
      return analysisToTrustScore(analysis);
    }

    // Next best: a score persisted at verification time. The breakdown was not
    // retained for this row, so the factor list stays empty and the radar
    // renders its "not recorded" state.
    if (typeof stored?.trust_score === "number" && stored.trust_tier && stored.trust_score > 0) {
      return {
        score: stored.trust_score,
        rawScore: stored.trust_score,
        tier: stored.trust_tier as TrustTier,
        factors: [],
        hardCaps: [],
        confidence: 0,
        confidenceFactors: [],
        riskLevel: "medium" as const,
        dimensions: [],
        criticalFailures: [] as string[],
        computedAt: "",
      };
    }

    // Last resort: derive signals from the raw response and run the engine.
    const shared =
      (result?.credential as Record<string, any> | undefined) ??
      (result?.shared_credential_data as Record<string, any> | undefined) ??
      undefined;
    const sig = shared?.proof?.proofValue ?? shared?.proof;
    const factors: TrustFactors = {
      signatureValid:
        typeof sig === "string" && /^0x[0-9a-fA-F]{130}$/.test(sig) && sig !== "unsigned",
      anchoredOnChain: !!onChain?.txVerified || !!onChain?.contractAnchored || !!result?.blockchain_anchor,
      notRevoked: result?.not_revoked !== false,
      notExpired: result?.not_expired !== false,
      // The server did not report a reputation here, so it stays unknown rather
      // than being back-filled with an optimistic constant.
      issuerReputation: result?.issuer_reputation ?? null,
      zkProofVerified: zkpProofValid === true,
      biometricBound: stored?.biometric_verified === true,
      hashChecked: result?.hash_integrity !== undefined && result?.hash_integrity !== null,
      hashValid: result?.hash_integrity === true,
      onChainChecked: result?.on_chain_checked ?? !!onChain?.contractVerified,
      expiresAt: result?.expires_at ?? null,
      issuedAt: shared?.issuanceDate ?? null,
      credentialAgeDays: typeof result?.age_in_days === "number" ? result.age_in_days : null,
    };
    return computeTrustScore(factors);
  }, [hasRecordedAnalysis, analysis, stored, result, onChain, zkpProofValid]);

  /**
   * What the AI assistant renders.
   *
   * When the engine actually ran, that is the analysis. When it did not but
   * the trust engine could still score the presentation, the breakdown is
   * projected off that live result — so the verifier sees eight real dimension
   * bars rather than a synthetic "legacy record" placeholder describing data
   * that was never written.
   */
  const displayAnalysis = useMemo(() => {
    if (hasRecordedAnalysis) return analysis;
    if (trustResult.dimensions.length > 0) {
      return {
        ...analysis,
        score: trustResult.score,
        raw_score: trustResult.rawScore,
        tier: trustResult.tier,
        risk_level: trustResult.riskLevel,
        confidence: trustResult.confidence,
        hard_caps_applied: trustResult.hardCaps,
        legacy: false,
        findings: trustResult.factors
          .filter((f) => !!f.detail)
          .map((f) => `${f.label}: ${f.detail}`)
          .slice(0, 8),
        dimensions: trustResult.dimensions,
      };
    }
    return analysis;
  }, [analysis, hasRecordedAnalysis, trustResult]);

  const policyEvaluation = useMemo(() => {
    if (!policy) return null;
    return evaluatePolicy(
      normalizePolicy(policy),
      {
        credentialType: schemaType,
        zkpCircuit,
        zkpProofValid,
        anchoredOnChain: !!result?.blockchain_anchor || !!onChain?.txVerified || !!onChain?.contractAnchored,
        sbtBadge: stored?.sbt_token_id ? true : null,
        biometricVerified: stored?.biometric_verified ?? null,
        smartWallet: null,
        trustTier: trustResult.tier as TrustTier,
        trustScore: trustResult.score,
        credentialAgeDays: typeof result?.age_in_days === "number" ? result.age_in_days : null,
      },
      "Active policy"
    );
  }, [policy, schemaType, zkpCircuit, zkpProofValid, result, onChain, stored, trustResult]);

  const timeline: TimelineStep[] = useMemo(() => {
    const steps: TimelineStep[] = [
      {
        key: "hash",
        label: "Hash integrity",
        detail: result?.hash_integrity
          ? (typeof result?.hash_integrity_note === "string" && result.hash_integrity_note
              ? result.hash_integrity_note
              : "Credential bytes hash to the value the registry committed.")
          : "Recomputed hash does not match the registry commitment.",
        state: result?.hash_integrity ? "pass" : result?.hash_integrity === false ? "fail" : "unknown",
        at: result?.verified_at ?? null,
      },
      {
        key: "signature",
        label: "Holder signature",
        detail: result?.signature?.signed
          ? `Wallet signature verified (${result.signature.type}).`
          : result?.signature
            ? `Unsigned or simulated presentation (${result.signature.type}).`
            : "No signature information was returned with this report.",
        state: result?.signature?.signed ? "pass" : result?.signature ? "fail" : "unknown",
      },
      {
        key: "revocation",
        label: "Revocation status",
        detail:
          result?.not_revoked === false
            ? "The issuer has revoked this credential."
            : result?.not_revoked === true
              ? "No active revocation found."
              : "Revocation was not reported for this presentation.",
        state: result?.not_revoked === false ? "fail" : result?.not_revoked === true ? "pass" : "unknown",
        at: result?.responded_at ?? null,
      },
      {
        key: "expiry",
        label: "Validity window",
        detail:
          result?.not_expired === false
            ? `Expired ${result?.expires_at ? new Date(result.expires_at).toLocaleDateString() : "at an unknown date"}.`
            : result?.not_expired === true
              ? `Valid until ${result?.expires_at ? new Date(result.expires_at).toLocaleDateString() : "unknown"}.`
              : "Expiry was not reported for this presentation.",
        state: result?.not_expired === false ? "fail" : result?.not_expired === true ? "pass" : "unknown",
      },
      {
        key: "anchor",
        label: "On-chain anchor",
        detail: onChain?.txVerified || onChain?.contractAnchored
          ? `Anchored in the credential registry at block ${onChain.blockNumber ?? onChain.contractBlockAnchored ?? "?"}.`
          : onChain
            ? "Registry lookup ran but found no anchor for this credential."
            : "No registry lookup was performed for this presentation.",
        state: onChain?.txVerified || onChain?.contractAnchored ? "pass" : onChain ? "fail" : "unknown",
      },
      {
        key: "zkp",
        label: "Zero-knowledge proof",
        detail: zkpCircuit
          ? `${zkpCircuit} proof ${zkpProofValid ? "passed" : "failed"} local verification${
              zkpOnChainValid ? " and was accepted on-chain" : zkpOnChainValid === false ? " but was rejected on-chain" : " (on-chain check not run)"
            }.`
          : "No zero-knowledge proof accompanied this presentation.",
        state: zkpCircuit ? (zkpProofValid ? "pass" : "fail") : "unknown",
      },
      {
        key: "behaviour",
        label: "Behavioural analysis",
        detail: anomalyReport
          ? `${anomalyReport.findings.length} of 5 detectors fired — aggregate risk ${Math.round(anomalyReport.riskScore)}/100.`
          : "Not enough history for this holder to run behavioural detectors.",
        state: anomalyReport ? (anomalyReport.isAnomalous ? "fail" : "pass") : "unknown",
      },
    ];
    return steps;
  }, [result, onChain, zkpCircuit, zkpProofValid, zkpOnChainValid, anomalyReport]);

  const disclosed = useMemo(() => {
    const raw = result?.shared_credential_data ?? result?.credential ?? result?.credentialSubject;
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  }, [result]);

  const holderBlocked = holderDid ? blockedHolders.includes(holderDid) : false;

  if (!result) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {valid ? (
            <CheckCircle2 className="h-6 w-6 text-emerald-500" />
          ) : (
            <XCircle className="h-6 w-6 text-destructive" />
          )}
          <span className={`font-display font-semibold text-lg ${valid ? "text-emerald-600" : "text-destructive"}`}>
            {valid ? "Valid Credential" : "Invalid Credential"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <ResultBadge valid={valid} />
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={copyJson} title="Copy report JSON">
            {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <TriTile
          state={result.hash_integrity ? "pass" : result.hash_integrity === false ? "fail" : "unknown"}
          label="Hash Integrity"
          value={result.hash_integrity ? "Valid" : result.hash_integrity === false ? "Tampered" : "Not checked"}
        />
        <TriTile
          state={result.not_revoked === false ? "fail" : result.not_revoked === true ? "pass" : "unknown"}
          label="Revocation"
          value={result.not_revoked === false ? "Revoked" : result.not_revoked === true ? "Active" : "Not checked"}
        />
        <TriTile
          state={result.not_expired === false ? "fail" : "pass"}
          label="Expiry"
          value={result.not_expired === false ? "Expired" : "Valid"}
        />
      </div>

      {zkpCircuit ? (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[11px] font-semibold text-foreground">Zero-knowledge proof</span>
            <span className="flex items-center gap-2">
              <TriTile
                state={zkpProofValid ? "pass" : "fail"}
                label="local"
                value={zkpProofValid ? "valid" : "invalid"}
              />
              {zkpOnChainValid !== null ? (
                <TriTile
                  state={zkpOnChainValid ? "pass" : "fail"}
                  label="on-chain"
                  value={zkpOnChainValid ? "valid" : "invalid"}
                />
              ) : null}
            </span>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground break-all">
            {zkpCircuit}
            {zkpNullifier ? ` · nullifier ${zkpNullifier.slice(0, 18)}…` : ""}
          </p>
        </div>
      ) : null}

      {!compact ? (
        <Tabs defaultValue="trust">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="trust" className="text-xs">Trust</TabsTrigger>
            <TabsTrigger value="timeline" className="text-xs">Timeline</TabsTrigger>
            <TabsTrigger value="disclosure" className="text-xs">Disclosure</TabsTrigger>
            <TabsTrigger value="issuer" className="text-xs">Issuer</TabsTrigger>
            {policyEvaluation ? <TabsTrigger value="policy" className="text-xs">Policy</TabsTrigger> : null}
          </TabsList>

          <TabsContent value="trust" className="space-y-4 pt-4">
            <TrustScoreRadar result={trustResult} />
            <HolderEvidenceStrip
              holderDid={holderDid}
              credentialHash={credentialHash}
              biometricProofHash={biometricProofHash}
            />
            {/* The blocklist is scoped to holder DIDs, so the block control lives
                with the holder evidence — never on the issuer card. */}
            {holderDid && (onBlockHolder || onUnblockHolder) ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-foreground">
                    {holderBlocked ? "Holder is on your blocklist" : "Block this holder"}
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground truncate">{holderDid}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className={`shrink-0 gap-1.5 text-xs ${
                    holderBlocked
                      ? "border-destructive/40 text-destructive hover:bg-destructive/10"
                      : "text-muted-foreground"
                  }`}
                  onClick={() => {
                    if (holderBlocked) onUnblockHolder?.(holderDid);
                    else onBlockHolder?.(holderDid);
                  }}
                >
                  <Ban className="h-3.5 w-3.5" />
                  {holderBlocked ? "Unblock" : "Block"}
                </Button>
              </div>
            ) : null}
            <AnomalyPanel
              report={anomalyReport}
              sampleSize={history.filter((r) => r.holder_did === holderDid).length}
              scope={holderDid ? "this holder" : "all verifications"}
              storedFindings={stored?.anomaly_findings}
              storedRisk={stored?.anomaly_risk}
            />
          </TabsContent>

          <TabsContent value="timeline" className="pt-4">
            <VerificationTimeline steps={timeline} />
          </TabsContent>

          <TabsContent value="disclosure" className="pt-4">
            <SelectiveDisclosureInspector
              disclosed={disclosed}
              credentialFingerprint={credentialHash}
              zkpCoveredFields={zkpCircuit ? ["dateOfBirth", "birthDate", "age"] : []}
            />
          </TabsContent>

          <TabsContent value="issuer" className="pt-4">
            <IssuerProfile issuer={issuer} records={history} />
          </TabsContent>

          {policyEvaluation ? (
            <TabsContent value="policy" className="pt-4">
              <PolicyEvaluationPanel evaluation={policyEvaluation} />
            </TabsContent>
          ) : null}
        </Tabs>
      ) : null}

      {result.expires_at && (
        <p className="text-xs text-muted-foreground">
          Expires: {new Date(result.expires_at).toLocaleDateString()}
        </p>
      )}

      {result.blockchain_anchor && (
        <div className="bg-muted rounded-lg p-3">
          <p className="font-mono text-sm flex items-center gap-2 text-verifier break-all">
            <Link2 className="h-4 w-4 shrink-0" />
            Anchor: {result.blockchain_anchor}
          </p>
        </div>
      )}

      {onChain && (
        <div className="bg-muted rounded-lg p-3 space-y-1">
          <p className="font-mono text-sm text-verifier flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Blockchain Verified
          </p>
          {(onChain.contractVerified !== undefined ? onChain.contractAnchored : onChain.txVerified) && (
            <p className="font-mono text-xs text-emerald-600">✓ Anchored on-chain</p>
          )}
          {onChain.blockNumber && (
            <p className="font-mono text-xs text-muted-foreground">Block: #{onChain.blockNumber}</p>
          )}
          {onChain.contractBlockAnchored && (
            <p className="font-mono text-xs text-muted-foreground">Block: #{onChain.contractBlockAnchored}</p>
          )}
          {onChain.explorerUrl && (
            <a
              href={onChain.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs text-primary underline underline-offset-2 hover:text-primary/80"
            >
              View on Etherscan →
            </a>
          )}
        </div>
      )}

      {result.signature && (
        <div className="bg-muted rounded-lg p-3">
          <p className="font-mono text-sm flex items-center gap-2">
            <PenTool className="h-4 w-4 shrink-0" />
            {result.signature.signed ? (
              <span className="text-emerald-600">Wallet Signed ({result.signature.type})</span>
            ) : (
              <span className="text-muted-foreground">Simulated proof ({result.signature.type})</span>
            )}
          </p>
          {result.signature.signer && (
            <p className="font-mono text-xs text-muted-foreground mt-1 break-all">Signer: {result.signature.signer}</p>
          )}
        </div>
      )}

      {displayAnalysis.dimensions.length > 0 && (
        <CredentialAIAssistant
          analysis={displayAnalysis}
          verificationContext={{
            ai_analysis: displayAnalysis,
            valid: result.valid,
            hash_integrity: result.hash_integrity,
            hash_checked: result.hash_integrity !== undefined && result.hash_integrity !== null,
            not_revoked: result.not_revoked,
            not_expired: result.not_expired,
            blockchain_verified: result.blockchain_verified,
            blockchain_checked: result.on_chain_checked ?? false,
            expires_at: result.expires_at,
            blockchain_anchor: result.blockchain_anchor,
            unverified_checks: result.unverified_checks,
            provisional: result.provisional,
            signature: result.signature,
          }}
        />
      )}

      {!compact && (
        <div className="pt-1">
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={() => setShowRaw(p => !p)}>
            {showRaw ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showRaw ? "Hide raw report" : "View raw report"}
          </Button>
          {showRaw && (
            <pre className="mt-2 text-[10px] font-mono bg-muted rounded-lg p-3 overflow-auto max-h-72">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </motion.div>
  );
};

export default VerificationResultView;
