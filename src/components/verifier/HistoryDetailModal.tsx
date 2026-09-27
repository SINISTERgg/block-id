/**
 * HistoryDetailModal — the full intelligence report for one past verification.
 *
 * Two things this component is careful about:
 *
 * 1. It reuses `VerificationResultView` with the *persisted* per-request
 *    intelligence (`stored`), so the score and anomaly findings shown in history
 *    are the ones captured at verification time. Recomputing them from a stored
 *    row would let the audit trail drift away from what the verifier actually
 *    saw.
 *
 * 2. Checks that were never persisted are passed as `null`, not `false`. The
 *    result view is tri-state, so "we did not record this" renders as unknown
 *    rather than as a silent failure.
 */
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import VerificationResultView from "@/components/verifier/VerificationResultView";
import type { VerificationRecord } from "@/services/api/verifier.service";
import type { AnomalyFinding } from "@/lib/ml/anomaly";
import type { TrustTier } from "@/lib/ml/trustScore";
import type { CircuitName } from "@/lib/zkp";
import type { VerificationPolicy } from "@/lib/verifier/policy";
import type { IntelligenceRecord } from "@/lib/verifier/intelligence";
import { credentialPayload } from "@/lib/verifier/intelligence";

/**
 * Rebuild a result envelope from a persisted row. Only what was actually
 * recorded is filled in; everything else stays `null` so the UI reports
 * "not checked" rather than implying a clean or failed check.
 */
function resultFromRecord(record: VerificationRecord): Record<string, unknown> {
  const credential = credentialPayload(record as unknown as IntelligenceRecord);
  return {
    valid: record.status === "verified" || record.status === "accepted",
    // Not persisted per-request; the row only records the aggregate status.
    hash_integrity: null,
    not_revoked: null,
    not_expired: null,
    expires_at: credential.expirationDate ?? null,
    blockchain_anchor: credential.blockchainAnchor ?? null,
    blockchain_verified: null,
    ai_analysis: record.ai_analysis ?? null,
    credential,
    shared_credential_data: record.shared_credential_data ?? null,
    holder_did: record.holder_did ?? null,
    schema_type: record.credential_type ?? credential.schemaType ?? null,
    issuer:
      (typeof credential.issuer === "string" ? credential.issuer : (credential.issuer as any)?.id) ?? null,
    verified_at: record.verified_at ?? null,
    responded_at: record.responded_at ?? null,
  };
}

interface HistoryDetailModalProps {
  record: VerificationRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The verifier's wider history, for holder/issuer priors. */
  history: IntelligenceRecord[];
  policy?: VerificationPolicy | null;
  blockedHolders?: string[];
  onBlockHolder?: (did: string) => void;
  onUnblockHolder?: (did: string) => void;
}

const HistoryDetailModal = ({
  record,
  open,
  onOpenChange,
  history,
  policy,
  blockedHolders,
  onBlockHolder,
  onUnblockHolder,
}: HistoryDetailModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            {record ? record.credential_type || "Verification detail" : "Verification detail"}
            {record?.purpose ? <span className="text-muted-foreground font-normal"> — {record.purpose}</span> : null}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2 text-xs">
            {record ? (
              <>
                <span>
                  {new Date(record.created_at).toLocaleString()}
                </span>
                <Badge variant="secondary" size="sm" className="capitalize">
                  {record.status}
                </Badge>
                {record.storage_consent ? (
                  <Badge variant="outline" size="sm">stored with consent</Badge>
                ) : record.access_expires_at ? (
                  <Badge variant="outline" size="sm">viewing window only</Badge>
                ) : null}
              </>
            ) : (
              "No record selected"
            )}
          </DialogDescription>
        </DialogHeader>

        {record ? (
          <VerificationResultView
            result={resultFromRecord(record)}
            history={history}
            policy={policy}
            stored={{
              zkp_circuit: (record.zkp_circuit as CircuitName | null) ?? null,
              zkp_proof_valid: record.zkp_proof_valid ?? null,
              zkp_on_chain_valid: record.zkp_on_chain_valid ?? null,
              zkp_nullifier: record.zkp_nullifier ?? null,
              trust_score: record.trust_score ?? null,
              trust_tier: (record.trust_tier as TrustTier | null) ?? null,
              anomaly_risk: record.anomaly_risk ?? null,
              anomaly_findings: (record.anomaly_findings as AnomalyFinding[] | null) ?? null,
              biometric_verified: record.biometric_verified ?? null,
              sbt_token_id: record.sbt_token_id ?? null,
            }}
            blockedHolders={blockedHolders}
            onBlockHolder={onBlockHolder}
            onUnblockHolder={onUnblockHolder}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

export default HistoryDetailModal;
