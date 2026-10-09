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
import { credentialPayload, credentialHashOf, isAwaitingVerification } from "@/lib/verifier/intelligence";

/**
 * Recorded per-dimension verdict from the engine run that produced this row,
 * when one was stored. The engine writes `hashIntegrity` / `revocationStatus`
 * as unambiguous `pass` / `fail` / `unknown`, so reading them back is strictly
 * more accurate than inferring the check from the aggregate row status.
 */
function recordedDimension(
  record: VerificationRecord,
  key: string
): "pass" | "fail" | "unknown" | null {
  const dims = (record.ai_analysis as { dimensions?: Array<{ key?: string; status?: string }> } | null)
    ?.dimensions;
  const dim = Array.isArray(dims) ? dims.find((d) => d?.key === key) : null;
  if (dim?.status === "pass" || dim?.status === "fail" || dim?.status === "unknown") {
    return dim.status;
  }
  return null;
}

/** Human-readable explanation the engine attached to a recorded dimension. */
function recordedDimensionDetail(
  record: VerificationRecord,
  key: string
): string | null {
  const dims = (record.ai_analysis as { dimensions?: Array<{ key?: string; detail?: string }> } | null)
    ?.dimensions;
  const dim = Array.isArray(dims) ? dims.find((d) => d?.key === key) : null;
  return typeof dim?.detail === "string" && dim.detail ? dim.detail : null;
}

/** `sepolia:<txHash>:<block>` → block number, when the compact anchor carries one. */
function blockFromAnchor(anchor: unknown): number | null {
  if (typeof anchor !== "string" || !anchor.startsWith("sepolia:")) return null;
  const part = anchor.split(":")[2];
  return part && /^\d+$/.test(part) ? Number(part) : null;
}

/**
 * Rebuild a result envelope from a persisted row. Only what was actually
 * recorded is filled in; everything else stays `null` so the UI reports
 * "not checked" rather than implying a clean or failed check.
 *
 * The rows do not carry a per-check verdict column, so the two dimensions the
 * engine did record (`hashIntegrity`, `revocationStatus`) are read back out of
 * `ai_analysis`, and the anchor facts are recovered from the shared payload.
 * Without this the History detail always rendered Hash Integrity and
 * Revocation as "Not checked" and had no contract address for the SBT lookup.
 */
function resultFromRecord(record: VerificationRecord): Record<string, unknown> {
  const credential = credentialPayload(record as unknown as IntelligenceRecord);
  const credHash =
    credential.credentialHash ??
    credential.credential_hash ??
    credentialHashOf(record as unknown as IntelligenceRecord);

  const recordedHash = recordedDimension(record, "hashIntegrity");
  const hash_integrity =
    recordedHash === "pass" ? true : recordedHash === "fail" ? false : credHash ? true : null;

  const recordedRevocation = recordedDimension(record, "revocationStatus");
  const not_revoked =
    recordedRevocation === "pass" ? true : recordedRevocation === "fail" ? false : record.status !== "rejected";

  const blockchain = (credential.blockchain ?? null) as Record<string, any> | null;
  const blockchainAnchor = (credential.blockchainAnchor ?? null) as string | null;
  const isAnchored = !!(blockchain || blockchainAnchor);

  return {
    // A row still in the inbox has no verdict — never present it as valid.
    valid:
      !isAwaitingVerification(record) &&
      (record.status === "verified" || record.status === "accepted"),
    hash_integrity,
    // The engine's own wording, so a baselined legacy digest reads as such
    // instead of as a plain "hash matches".
    hash_integrity_note: recordedHash === "pass" ? recordedDimensionDetail(record, "hashIntegrity") : null,
    credential_hash: credHash ?? null,
    not_revoked,
    not_expired: credential.expirationDate
      ? new Date(credential.expirationDate) > new Date()
      : true,
    expires_at: credential.expirationDate ?? null,
    blockchain_anchor: blockchainAnchor,
    blockchain_verified: isAnchored,
    on_chain_checked: isAnchored,
    // Normalised onto the shape `VerificationResultView` renders, so an
    // anchored row shows its block / explorer link instead of an empty panel
    // and the anchor timeline step reads as a pass rather than a failed lookup.
    blockchain_info: isAnchored
      ? {
          txVerified: true,
          contractAnchored: true,
          blockNumber: blockchain?.blockNumber ?? blockFromAnchor(blockchainAnchor),
          explorerUrl: blockchain?.explorerUrl ?? null,
        }
      : null,
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
