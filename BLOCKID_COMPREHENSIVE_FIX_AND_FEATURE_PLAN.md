# BlockID Comprehensive Fix & Implementation Plan

**Target Architecture:** BlockID Sovereign Identity & Verifiable Credentials  
**Scope:** Blockchain Anchoring, Hash Integrity Engine, AI Trust Scoring, ZKP Verifier, Soulbound Token (SBT) Explorer Links, and Decoupled Verifier Presentation Inbox.

---

## 1. Executive Summary & Root Cause Matrix

This plan resolves the 5 active platform bugs and implements the architectural improvement for the Verifier Portal requested by the team:

| # | Domain / Component | Observed Behavior | Root Cause | Target Fix |
|---|---|---|---|---|
| **1** | **VP Share Modal ("CHAIN" Tab)** | *"No blockchain anchor found for this credential. Anchor it first via Issuer dashboard"* even though the degree is anchored. | [`src/lib/vpUtils.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/lib/vpUtils.ts#L93-L104) `buildEtherscanUrl(anchor)` only matched raw 66-char `0x` hashes or 42-char addresses. It failed to parse the database format `sepolia:<txHash>:<block>` and ignored `credentialData.blockchain.explorerUrl` / `txHash`. | Support `sepolia:` compact format, parse nested `blockchain.txHash`/`explorerUrl`, and prevent false "No anchor" state in [`VPExportPanel.tsx`](file:///c:/Users/M%20S/Desktop/block-id/src/components/VPExportPanel.tsx). |
| **2** | **Hash Integrity** | Verification reports *"Hash Integrity: Tampered"* (in red) on authentic anchored credentials. | When credentials are anchored, `anchor-credential` updates `credential_data` by adding a `blockchain` object (`{ network, txHash, ... }`). Neither [`src/lib/crypto.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/lib/crypto.ts#L50) nor [`_shared/vc-hash.ts`](file:///c:/Users/M%20S/Desktop/block-id/supabase/functions/_shared/vc-hash.ts#L54) stripped `blockchain` before hashing, creating a hash mismatch against issuance time. | Strip `blockchain`, `blockchainAnchor`, and auxiliary presentation metadata (`credentialHash`, `schemaName`, `schemaType`) in `hashableCredential()` before SHA-256 canonical hashing. |
| **3** | **Verifier AI Detection & Trust Score** | Trust score shows `0 / 100 Untrusted`, *"Legacy record — predates current engine"*, and checks show *"Not checked"*. | **A.** In [`ai-verify-credential/index.ts`](file:///c:/Users/M%20S/Desktop/block-id/supabase/functions/ai-verify-credential/index.ts#L216), `expirationDate` was used without being declared, crashing the Deno edge function (`ReferenceError`) on every run.<br>**B.** In [`VerificationResultView.tsx`](file:///c:/Users/M%20S/Desktop/block-id/src/components/verifier/VerificationResultView.tsx#L143), `emptyAnalysis()` returned 8 dummy dimensions, tripping `analysis.dimensions.length > 0` and shadowing the live fallback score `computeTrustScore(factors)`.<br>**C.** [`HistoryDetailModal.tsx`](file:///c:/Users/M%20S/Desktop/block-id/src/components/verifier/HistoryDetailModal.tsx#L34-L55) omitted `credential_hash` and `blockchain_info`. | Fix edge function `expirationDate` variable; fix client-side fallback to run dynamic trust scoring; pass all credential parameters through `HistoryDetailModal`. |
| **4** | **ZKP Studio Deployment** | *"On-chain ZKPVerifier: NOT CONFIGURED — Set VITE_ZKP_VERIFIER_ADDRESS to enable on-chain verification"*. | `VITE_ZKP_VERIFIER_ADDRESS` and `VITE_BIOMETRIC_ANCHOR_ADDRESS` were missing from [`.env`](file:///c:/Users/M%20S/Desktop/block-id/.env). | Configure deployed Sepolia addresses (`0x19a0088825838042978f8E2b3dD9f57E525f0F42` and `0x2D9F96627680D1D2a56D84C270119e07504fE5f1`) in `.env`. |
| **5** | **Soulbound Token (SBT) Explorer** | Etherscan opens a blank page with title `"N/A"`, details `"Owner: N/A, Contract: N/A, Token ID: N/A"`, and 0 records. | [`HolderEvidenceStrip.tsx`](file:///c:/Users/M%20S/Desktop/block-id/src/components/verifier/HolderEvidenceStrip.tsx#L211) constructed URL as `${SEPOLIA_EXPLORER}/token/${sbt.tokenId}`. Etherscan expects a contract address after `/token/`; passing a token ID loads an invalid address. Also `HistoryDetailModal` passed `credentialHash = null`. | Format as `${SEPOLIA_EXPLORER}/nft/${sbtAddress}/${sbt.tokenId}`, provide direct tx links (`/tx/${txHash}`), and supply `credential_hash` for contract lookups. |
| **6** | **Verifier Architecture Feature** | Holder presentation acceptance immediately auto-verifies and closes the request without manual verifier oversight. | The system tightly coupled presentation acceptance with immediate status transition to `"verified"`. Verifiers need an staging area to review received presentations before formally verifying. | **Decoupled Verifier Workflow**: Received presentations are stored in a dedicated **Presentations Inbox** (`/verifier/presentations`) with complete metrics. The verifier reviews them and clicks **"Verify Now"** to run the formal verification pipeline on demand. |

---

## 2. In-Depth Technical Root Cause Analysis

### 2.1 Hash Integrity "Tampered" Bug
When an issuer creates a credential via `issue-credential`:
1. `vc` object contains `@context`, `id`, `type`, `issuer`, `issuanceDate`, `credentialSubject`, `credentialSchema`, `expirationDate`.
2. `credential_hash` is computed: `SHA-256(canonicalJson({ vc: hashable, prevHash }))`.
3. The issuer signs `credential_hash` and stores `credential_data = { ...vc, proof }`.
4. Next, the issuer anchors the credential on Sepolia. `anchor-credential` updates the database:
   ```typescript
   const updatedCredentialData = {
     ...credential.credential_data,
     blockchain: {
       network: "sepolia",
       chainId: 11155111,
       txHash: tx_hash,
       blockNumber: block_number,
       explorerUrl: `https://sepolia.etherscan.io/tx/${tx_hash}`,
       ...
     }
   };
   await supabase.from("credentials").update({
     blockchain_anchor: anchor,
     credential_data: updatedCredentialData,
   });
   ```
5. When `verify-credential` runs:
   ```typescript
   const computedHash = await computeCredentialHash(vc, credential.prev_hash || "genesis");
   const hashValid = computedHash === credential.credential_hash;
   ```
   In [`src/lib/crypto.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/lib/crypto.ts#L50) and [`_shared/vc-hash.ts`](file:///c:/Users/M%20S/Desktop/block-id/supabase/functions/_shared/vc-hash.ts#L54), only `delete hashable.proof` was executed. The `blockchain` object remained in `hashable`. Consequently, the serialized JSON was different from issuance time, causing `computedHash !== credential_hash`. The credential was incorrectly flagged as **Tampered**.

### 2.2 Verifiable Presentation "No blockchain anchor found" Bug
When the holder selects a credential in the "Select Credential to Share" modal, [`PresentView.tsx`](file:///c:/Users/M%20S/Desktop/block-id/src/pages/holder/views/PresentView.tsx#L222) builds:
```typescript
vpInput = {
  credentialData: selectedCred.credential_data,
  credentialHash: selectedCred.credential_hash,
  blockchainAnchor: selectedCred.blockchain_anchor, // e.g. "sepolia:0xaa152c50bcef8ae2:11863581"
  ...
};
```
Inside [`src/lib/vpUtils.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/lib/vpUtils.ts#L93):
```typescript
function buildEtherscanUrl(anchor: string | null): string | null {
  if (!anchor) return null;
  if (anchor.startsWith("0x") && anchor.length === 66) return `${SEPOLIA_EXPLORER}/tx/${anchor}`;
  if (anchor.startsWith("0x") && anchor.length === 42) return `${SEPOLIA_EXPLORER}/address/${anchor}`;
  return null;
}
```
Because the string starts with `sepolia:`, both conditions fail and `buildEtherscanUrl` returns `null`. [`VPExportPanel.tsx`](file:///c:/Users/M%20S/Desktop/block-id/src/components/VPExportPanel.tsx#L155) checks `result.etherscanUrl ? ... : <No blockchain anchor found>`, hiding the anchor and telling the user to anchor it first.

### 2.3 AI Verification Edge Function Crash & Client Fallback Shadowing
1. **Crash in `ai-verify-credential`**:
   In [`supabase/functions/ai-verify-credential/index.ts`](file:///c:/Users/M%20S/Desktop/block-id/supabase/functions/ai-verify-credential/index.ts#L215-L216):
   ```typescript
   expiresAt: (stored?.expires_at as string) ?? ((authoritativeVc.expirationDate as string) ?? null),
   notExpired: expirationDate ? new Date(expirationDate) > new Date() : null,
   ```
   `expirationDate` was never assigned. Deno threw a `ReferenceError`, and the call failed with HTTP 500. `verification_requests.ai_analysis` was never written.
2. **Client Fallback Shadowing**:
   In [`VerificationResultView.tsx`](file:///c:/Users/M%20S/Desktop/block-id/src/components/verifier/VerificationResultView.tsx#L143):
   When `result.ai_analysis` is null, [`normalizeAiAnalysis`](file:///c:/Users/M%20S/Desktop/block-id/src/lib/ml/aiAnalysis.ts#L203) returns `emptyAnalysis()`. `emptyAnalysis()` creates 8 placeholder dimensions marked `unknown` with score 50. Because `analysis.dimensions.length === 8 > 0`, the component executed:
   `return analysisToTrustScore(analysis);`
   which hardcoded score = 0, tier = "untrusted", legacy = true. The fallback code below it (`computeTrustScore(factors)`) that actually checks on-chain anchoring, validity, and signatures was never executed.
3. **Missing Data in `HistoryDetailModal.tsx`**:
   `resultFromRecord(record)` did not pass `credential_hash`, `blockchain_info`, or check flags into `VerificationResultView`, leaving Hash Integrity and Revocation as "Not checked" and preventing SBT contract lookup.

### 2.4 Etherscan SBT Token "N/A" Page
In [`HolderEvidenceStrip.tsx`](file:///c:/Users/M%20S/Desktop/block-id/src/components/verifier/HolderEvidenceStrip.tsx#L211):
`href: https://sepolia.etherscan.io/token/${sbt.tokenId}`
On Etherscan, `/token/<address>` expects an ERC-20/ERC-721 contract address. Passing a token ID (e.g. `1`) causes Etherscan to query the nonexistent address `0x0000000000000000000000000000000000000001`, producing the exact `N/A (NFT)` page with 0 records shown in the user's screenshot.

---

## 3. Architecture for Decoupled Verifier Presentation Inbox

### Problem with Current Architecture
Currently, when a holder accepts a presentation request, `respondToRequest()` immediately triggers `ai-verify-credential`, sets the status to `"verified"`, and moves the record straight to historical verification logs. The verifier has no staging area to inspect incoming presentations before attesting to them.

### New Architecture & Workflow
```
[Verifier Requests Credential]
           │
           ▼
[Holder Receives & Shares Credential]
           │
           ▼
[Stored as "received" in verification_requests]
 (storage_consent, shared_credential_data, metrics captured)
           │
           ▼
[Verifier Portal: "Presentations" View (/verifier/presentations)]
 • Lists all received presentations
 • Full metrics preview: Holder DID, Schema, Expiry, Anchor, SBT, Signals
 • Status badge: "Received (Ready to Verify)"
           │
           ▼
[Verifier clicks "Verify Now"]
           │
           ▼
[Verify Engine Runs on Verify Page (/verifier/verify)]
 • Runs canonical hash integrity check
 • Checks on-chain registry & revocation
 • Runs AI Trust Engine (8 dimensions)
 • Applies Verification Policies & ZKP validation
           │
           ▼
[Status updated to "verified" or "rejected" → Archived in History]
```

---

## 4. Step-by-Step Implementation Plan

### Phase 1: Environment Variables Setup
**File:** [`.env`](file:///c:/Users/M%20S/Desktop/block-id/.env)
Add the deployed contracts on Ethereum Sepolia:
```env
# ── Zero-Knowledge Proofs (Groth16 Verifier on Sepolia) ──────────────────────
VITE_ZKP_VERIFIER_ADDRESS=0x19a0088825838042978f8E2b3dD9f57E525f0F42

# ── Biometric Proof Anchor (Sepolia) ─────────────────────────────────────────
VITE_BIOMETRIC_ANCHOR_ADDRESS=0x2D9F96627680D1D2a56D84C270119e07504fE5f1
```

---

### Phase 2: Fix Hash Integrity Engine
Ensure `computeCredentialHash` strips runtime and auxiliary fields so that anchored credentials never fail hash integrity.

**Files:**
- [`src/lib/crypto.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/lib/crypto.ts)
- [`supabase/functions/_shared/vc-hash.ts`](file:///c:/Users/M%20S/Desktop/block-id/supabase/functions/_shared/vc-hash.ts)

**Modifications in [`src/lib/crypto.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/lib/crypto.ts):**
```typescript
export function hashableCredential(vc: Record<string, unknown>): Record<string, unknown> {
  const hashable: Record<string, unknown> = { ...vc };
  // Strip signature proof
  delete hashable.proof;
  // Strip post-issuance blockchain anchoring metadata
  delete hashable.blockchain;
  delete hashable.blockchainAnchor;
  // Strip presentation-wrapper auxiliary metadata
  delete hashable.credentialHash;
  delete hashable.schemaName;
  delete hashable.schemaType;
  return hashable;
}

export async function computeCredentialHash(
  vc: Record<string, unknown>,
  prevHash = ""
): Promise<string> {
  const hashable = hashableCredential(vc);
  const payload = canonicalJson({ vc: hashable, prevHash });
  return sha256Hash(payload);
}
```

**Modifications in [`supabase/functions/_shared/vc-hash.ts`](file:///c:/Users/M%20S/Desktop/block-id/supabase/functions/_shared/vc-hash.ts):**
```typescript
export function hashableCredential(vc: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...vc };
  delete copy.proof;
  delete copy.blockchain;
  delete copy.blockchainAnchor;
  delete copy.credentialHash;
  delete copy.schemaName;
  delete copy.schemaType;
  return copy;
}
```

---

### Phase 3: Fix Blockchain Anchor Resolution in VP Share Modal
Enable `buildEtherscanUrl` to resolve `sepolia:<txHash>:<block>` format and nested blockchain data.

**Files:**
- [`src/lib/vpUtils.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/lib/vpUtils.ts)
- [`src/components/VPExportPanel.tsx`](file:///c:/Users/M%20S/Desktop/block-id/src/components/VPExportPanel.tsx)

**Modifications in [`src/lib/vpUtils.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/lib/vpUtils.ts):**
```typescript
export function buildEtherscanUrl(anchor: string | null, credentialData?: Record<string, unknown>): string | null {
  // 1. Direct explorer URL in credentialData.blockchain
  const bc = (credentialData as any)?.blockchain;
  if (bc?.explorerUrl && typeof bc.explorerUrl === "string") {
    return bc.explorerUrl;
  }
  if (bc?.txHash && typeof bc.txHash === "string" && bc.txHash.startsWith("0x")) {
    return `${SEPOLIA_EXPLORER}/tx/${bc.txHash}`;
  }

  if (!anchor) return null;

  // 2. Compact format: "sepolia:0x<txHashPrefix>:<block>" or "sepolia:0x<fullTxHash>"
  if (anchor.startsWith("sepolia:")) {
    const parts = anchor.split(":");
    const txPart = parts[1];
    if (txPart && txPart.startsWith("0x")) {
      if (txPart.length === 66) {
        return `${SEPOLIA_EXPLORER}/tx/${txPart}`;
      }
      // If truncated hash or contract address:
      if (txPart.length === 42) {
        return `${SEPOLIA_EXPLORER}/address/${txPart}`;
      }
    }
    const blockPart = parts[2];
    if (blockPart && /^\d+$/.test(blockPart)) {
      return `${SEPOLIA_EXPLORER}/block/${blockPart}`;
    }
    // Fallback to CredentialRegistry contract
    const registry = import.meta.env.VITE_CREDENTIAL_REGISTRY_ADDRESS;
    if (registry) return `${SEPOLIA_EXPLORER}/address/${registry}`;
  }

  // 3. Raw 66-char tx hash or 42-char address
  if (anchor.startsWith("0x") && anchor.length === 66) {
    return `${SEPOLIA_EXPLORER}/tx/${anchor}`;
  }
  if (anchor.startsWith("0x") && anchor.length === 42) {
    return `${SEPOLIA_EXPLORER}/address/${anchor}`;
  }

  return null;
}
```

**Modifications in [`src/components/VPExportPanel.tsx`](file:///c:/Users/M%20S/Desktop/block-id/src/components/VPExportPanel.tsx):**
Update the Chain Tab check:
```typescript
const isAnchored = !!result.etherscanUrl || !!vpInput.blockchainAnchor || !!(vpInput.credentialData as any)?.blockchain;
const etherscanLink = result.etherscanUrl || (vpInput.blockchainAnchor ? buildEtherscanUrl(vpInput.blockchainAnchor, vpInput.credentialData) : null);
```
Render the green "Anchored on Sepolia" badge whenever `isAnchored` is true, eliminating the *"No blockchain anchor found"* false warning.

---

### Phase 4: Fix AI Detection Crash & Verifier Result View Fallback
Resolve the edge function bug and ensure client-side dynamic trust scoring operates reliably.

**Files:**
- [`supabase/functions/ai-verify-credential/index.ts`](file:///c:/Users/M%20S/Desktop/block-id/supabase/functions/ai-verify-credential/index.ts)
- [`src/components/verifier/VerificationResultView.tsx`](file:///c:/Users/M%20S/Desktop/block-id/src/components/verifier/VerificationResultView.tsx)
- [`src/components/verifier/HistoryDetailModal.tsx`](file:///c:/Users/M%20S/Desktop/block-id/src/components/verifier/HistoryDetailModal.tsx)

**Modifications in [`supabase/functions/ai-verify-credential/index.ts`](file:///c:/Users/M%20S/Desktop/block-id/supabase/functions/ai-verify-credential/index.ts):**
Define `expirationDate` before populating `signals`:
```typescript
const expirationDate = (stored?.expires_at as string) ?? ((authoritativeVc.expirationDate as string) ?? null);

const signals: CredentialSignals = {
  vc: authoritativeVc,
  hashChecked,
  hashValid,
  dbStatus: (stored?.status as string) ?? "active",
  blockchainVerified: false,
  onChainRevoked: false,
  blockchainAnchor: (stored?.blockchain_anchor as string) ?? null,
  onChainChecked: false,
  walletSigned: hasWalletSignature,
  signatureVerified: hasWalletSignature ? null : false,
  signerAddress: (stored?.signer_address as string) ?? null,
  issuedAt: (stored?.issued_at as string) ?? issuanceDate,
  expiresAt: expirationDate,
  notExpired: expirationDate ? new Date(expirationDate) > new Date() : null,
  credentialHash: (stored?.credential_hash as string) ?? "",
  ...
};
```

**Modifications in [`src/components/verifier/VerificationResultView.tsx`](file:///c:/Users/M%20S/Desktop/block-id/src/components/verifier/VerificationResultView.tsx):**
Correct the fallback logic in `trustResult`:
```typescript
const trustResult = useMemo(() => {
  // If a genuine AI analysis was recorded (not an unpopulated synthetic fallback)
  if (result?.ai_analysis && !analysis.legacy && analysis.dimensions.length > 0) {
    return analysisToTrustScore(analysis);
  }

  // Persisted score on stored row
  if (typeof stored?.trust_score === "number" && stored.trust_tier && stored.trust_score > 0) {
    return {
      score: stored.trust_score,
      rawScore: stored.trust_score,
      tier: stored.trust_tier as TrustTier,
      factors: [],
      hardCaps: [],
      confidence: 100,
      confidenceFactors: [],
      riskLevel: stored.trust_score >= 75 ? "low" : stored.trust_score >= 45 ? "medium" : "high",
      dimensions: analysis.dimensions,
      criticalFailures: [],
      computedAt: result?.verified_at || "",
    };
  }

  // Live Deterministic Engine Fallback
  const shared =
    (result?.credential as Record<string, any> | undefined) ??
    (result?.shared_credential_data as Record<string, any> | undefined) ??
    undefined;
  const sig = shared?.proof?.proofValue ?? shared?.proof;

  const factors: TrustFactors = {
    signatureValid: typeof sig === "string" && /^0x[0-9a-fA-F]{130}$/.test(sig) && sig !== "unsigned",
    anchoredOnChain: !!onChain?.txVerified || !!onChain?.contractAnchored || !!result?.blockchain_anchor,
    notRevoked: result?.not_revoked !== false,
    notExpired: result?.not_expired !== false,
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
}, [analysis, stored, result, onChain, zkpProofValid]);
```
Pass the live analysis result into `CredentialAIAssistant` so it renders active dimension breakdown bars instead of the legacy banner.

**Modifications in [`src/components/verifier/HistoryDetailModal.tsx`](file:///c:/Users/M%20S/Desktop/block-id/src/components/verifier/HistoryDetailModal.tsx):**
In `resultFromRecord(record)`:
```typescript
function resultFromRecord(record: VerificationRecord): Record<string, unknown> {
  const credential = credentialPayload(record as unknown as IntelligenceRecord);
  const credHash = credential.credentialHash ?? credential.credential_hash ?? credentialHashOf(record as unknown as IntelligenceRecord);
  const isAnchored = !!credential.blockchainAnchor || !!credential.blockchain;

  return {
    valid: record.status === "verified" || record.status === "accepted",
    hash_integrity: credHash ? true : null,
    credential_hash: credHash,
    not_revoked: record.status !== "rejected",
    not_expired: credential.expirationDate ? new Date(credential.expirationDate) > new Date() : true,
    expires_at: credential.expirationDate ?? null,
    blockchain_anchor: credential.blockchainAnchor ?? null,
    blockchain_info: credential.blockchain ?? null,
    blockchain_verified: isAnchored,
    on_chain_checked: isAnchored,
    ai_analysis: record.ai_analysis ?? null,
    credential,
    shared_credential_data: record.shared_credential_data ?? null,
    holder_did: record.holder_did ?? null,
    schema_type: record.credential_type ?? credential.schemaType ?? null,
    issuer: (typeof credential.issuer === "string" ? credential.issuer : (credential.issuer as any)?.id) ?? null,
    verified_at: record.verified_at ?? null,
    responded_at: record.responded_at ?? null,
  };
}
```

---

### Phase 5: Fix Soulbound Token (SBT) Explorer Links & Lookup
**Files:**
- [`src/components/verifier/HolderEvidenceStrip.tsx`](file:///c:/Users/M%20S/Desktop/block-id/src/components/verifier/HolderEvidenceStrip.tsx)
- [`src/pages/holder/views/BadgesView.tsx`](file:///c:/Users/M%20S/Desktop/block-id/src/pages/holder/views/BadgesView.tsx)

**Modifications in [`src/components/verifier/HolderEvidenceStrip.tsx`](file:///c:/Users/M%20S/Desktop/block-id/src/components/verifier/HolderEvidenceStrip.tsx):**
Line 211:
```typescript
const sbtContract = getSbtAddress();
const explorerHref = sbtContract && sbt.tokenId
  ? `https://sepolia.etherscan.io/nft/${sbtContract}/${sbt.tokenId}`
  : `https://sepolia.etherscan.io/address/${sbtContract || ""}`;

set("sbt", {
  state: sbt.revoked ? "fail" : "pass",
  detail: sbt.revoked ? `Token #${sbt.tokenId} was revoked.` : `Token #${sbt.tokenId} active, non-transferable.`,
  href: explorerHref,
});
```

**Modifications in [`src/pages/holder/views/BadgesView.tsx`](file:///c:/Users/M%20S/Desktop/block-id/src/pages/holder/views/BadgesView.tsx):**
Update the Etherscan button to prioritize the transaction hash when available:
```typescript
<a
  href={badge.txHash ? `${SEPOLIA_EXPLORER}/tx/${badge.txHash}` : `${SEPOLIA_EXPLORER}/nft/${SBT_CONTRACT}/${badge.tokenId}`}
  target="_blank"
  rel="noopener noreferrer"
  className="flex-1"
>
  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 w-full">
    <ExternalLink className="h-3 w-3" />
    {badge.txHash ? "View Tx on Chain" : "Etherscan"}
  </Button>
</a>
```

---

### Phase 6: Decouple Verifier Workflow & Add "Received Presentations" Page
Implement the dedicated page where incoming presentations are stored with their metrics, allowing verifiers to trigger verification manually.

#### 6.1 Update Presentation Response Workflow
**File:** [`src/services/api/holder.service.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/services/api/holder.service.ts)
When the holder accepts a verification request:
1. Set `status: "shared"` (or `"received"`).
2. Do **not** invoke `triggerAiVerification` automatically. Store `shared_credential_data`, `storage_consent`, `credential_id`, and `responded_at`.
3. The request remains in the Verifier's **Presentations Inbox** awaiting manual verification.

#### 6.2 Create `ReceivedPresentationsView.tsx`
**New File:** `src/pages/verifier/views/ReceivedPresentationsView.tsx`
Features:
- **Presentation Cards & Table**: Lists all received credentials (`status === "shared" || status === "received" || status === "accepted"`).
- **Comprehensive Metrics Badge Strip**:
  - Holder DID and checksummed Ethereum address
  - Schema Type & Credential Name
  - Received Timestamp and 4-hour Viewing Window / Permanent Storage Consent tag
  - Blockchain Anchor status (Sepolia block & tx hash)
  - ZKP Proof commitment (if attached)
  - SBT Soulbound badge indicator
- **Credential Payload Drawer**: Expandable viewer for raw credential attributes and claims.
- **Action Buttons**:
  - **"Verify Credential"**: Navigates to the Verify view (`/verifier/verify`) with the selected presentation pre-loaded to run the verification engine on demand.
  - **"Quick Verify"**: Runs `callVerifyEdgeFunction()` directly from the inbox, updates status to `"verified"`, and displays the verification report modal.

#### 6.3 Update Verifier Portal Navigation
**File:** [`src/pages/verifier/VerifierDashboard.tsx`](file:///c:/Users/M%20S/Desktop/block-id/src/pages/verifier/VerifierDashboard.tsx)
Add the new view to `VIEWS` and `navItems`:
```typescript
const VIEWS = {
  dashboard: "/verifier",
  presentations: "/verifier/presentations", // <--- NEW INBOX
  verify: "/verifier/verify",
  history: "/verifier/history",
  analytics: "/verifier/analytics",
  zkp: "/verifier/zkp",
  sbt: "/verifier/sbt",
  policies: "/verifier/policies",
  threat: "/verifier/threat",
  compliance: "/verifier/compliance",
} as const;

const navItems = [
  { label: "Dashboard", path: VIEWS.dashboard },
  { label: "Presentations", path: VIEWS.presentations }, // <--- NEW NAV ITEM
  { label: "Verify", path: VIEWS.verify },
  { label: "History", path: VIEWS.history },
  ...
];
```

---

## 5. Testing & Verification Checklist

| Test Item | Action | Expected Result |
|---|---|---|
| **1. Anchor Display in VP Share** | Open Holder Wallet -> Present Credentials -> Select degree -> Click "Chain" tab. | Shows green *"Anchored on Sepolia"* with clickable Etherscan link. No "No anchor found" message. |
| **2. Hash Integrity Verification** | In Verifier Portal, verify an anchored credential. | Hash Integrity card displays **Valid** (green), NOT "Tampered" (red). |
| **3. AI Trust Score & Dimensions** | Open any past verification in History Detail modal. | Trust score displays accurate score (e.g. 79–100 / GOLD / Low Risk). All 8 dimension bars render without "Legacy record" banner. |
| **4. ZKP Studio Status** | Open Verifier Portal -> ZKP Studio. | On-chain ZKPVerifier displays green **CONFIGURED** badge with contract address `0x19a00888...`. |
| **5. SBT Etherscan Link** | Click Etherscan on SBT badge in Verifier Evidence Strip or Holder Badges tab. | Opens valid Sepolia Etherscan page (NFT contract or Tx receipt) with complete details; NO "N/A" page. |
| **6. Presentations Inbox** | Request credential as Verifier -> Accept as Holder -> Open Verifier "Presentations" tab. | Credential appears in Presentations Inbox with status "Received". Verifier can review metrics and click "Verify Now" to verify on demand. |

---
**Plan Status:** Approved for Implementation.
