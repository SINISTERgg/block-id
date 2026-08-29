# BLOCKID — Comprehensive Project Documentation

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [System Architecture](#3-system-architecture)
4. [Application Routes & Navigation](#4-application-routes--navigation)
5. [Authentication, RBAC & User Approval Workflow](#5-authentication-rbac--user-approval-workflow)
6. [Database Schema Specification (13 Tables)](#6-database-schema-specification-13-tables)
7. [Row-Level Security (RLS) Policies](#7-row-level-security-rls-policies)
8. [Database Functions & Triggers](#8-database-functions--triggers)
9. [Deno Edge Functions API Specification (9 Microservices)](#9-deno-edge-functions-api-specification-9-microservices)
10. [Smart Contract Architecture (`CredentialRegistry.sol`)](#10-smart-contract-architecture-credentialregistrysol)
11. [Portal 1: Issuer Dashboard (`/issuer`)](#11-portal-1-issuer-dashboard-issuer)
12. [Portal 2: Holder Wallet (`/holder`)](#12-portal-2-holder-wallet-holder)
13. [Portal 3: Verifier Portal (`/verifier`)](#13-portal-3-verifier-portal-verifier)
14. [Portal 4: Admin & Governance (`/admin`)](#14-portal-4-admin--governance-admin)
15. [Credential Sharing & Selective Disclosure](#15-credential-sharing--selective-disclosure)
16. [OpenID4VC Protocol Suite (OID4VCI & OID4VP)](#16-openid4vc-protocol-suite-oid4vci--oid4vp)
17. [Blockchain Explorer & Audit Trail](#17-blockchain-explorer--audit-trail)
18. [Trusted Issuer Registry & Trust Infrastructure](#18-trusted-issuer-registry--trust-infrastructure)
19. [AI Verification & Anomaly Engine (Google Gemini)](#19-ai-verification--anomaly-engine-google-gemini)
20. [WebAuthn Biometric Passkey Protection](#20-webauthn-biometric-passkey-protection)
21. [Dynamic Visual Certificates & PDF Generator](#21-dynamic-visual-certificates--pdf-generator)
22. [Privacy & GDPR Compliance (Art. 17 & Art. 20)](#22-privacy--gdpr-compliance-art-17--art-20)
23. [PWA & Offline Service Worker Infrastructure](#23-pwa--offline-service-worker-infrastructure)
24. [Testing & Quality Assurance Suite (101 Vitest Tests)](#24-testing--quality-assurance-suite-101-vitest-tests)
25. [Multi-Phase Roadmap (Phase 0 – Phase 8)](#25-multi-phase-roadmap-phase-0--phase-8)

---

## 1. Project Overview

**BLOCKID** is an enterprise-grade, decentralized **Self-Sovereign Identity (SSI)** platform designed for academic institutions, enterprises, and identity providers. Built upon **W3C Verifiable Credentials**, **W3C Decentralized Identifiers (DIDs)**, **OpenID4VC standards**, and **Ethereum/Polygon smart contract anchoring**, BLOCKID eliminates credential fraud and streamlines identity verification without compromising user privacy.

### Core Value Propositions

- **Cryptographic Trust**: Every issued credential is hashed via SHA-256 and anchored on EVM blockchains (Ethereum Sepolia / Polygon Amoy).
- **Non-Custodial Data Ownership**: Holders store and manage their own credentials with zero central custody.
- **Selective Disclosure**: Share only essential credential fields (e.g., proving degree completion without revealing grades or DOB).
- **Time-Limited Sharing**: Granular expiration controls (1 hour, 24 hours, 7 days, 30 days) for shared credential links.
- **AI Risk Intelligence**: Real-time multi-dimensional risk scoring powered by Google Gemini AI.
- **GDPR Compliance**: Native support for data portability (Art. 20) and right to erasure (Art. 17) via cryptographically verifiable consent logs.

---

## 2. Technology Stack

### Client Layer (Frontend)
- **Framework**: React 18.3 + Vite 6.3
- **Language**: TypeScript 5.8
- **UI Framework & Primitives**: Tailwind CSS 3.4, shadcn/ui, Radix UI primitives
- **Animations**: Framer Motion 12.36
- **State & Query Management**: TanStack React Query v5.83
- **Data Visualization**: Recharts 2.15
- **PDF Export**: jsPDF 4.2
- **QR Code Rendering**: `qrcode.react` 4.2
- **Iconography**: Lucide React 0.462
- **PWA Capabilities**: `vite-plugin-pwa` 0.21

### Backend & Cloud Layer (Supabase BaaS)
- **Database**: PostgreSQL with Row-Level Security (RLS)
- **Serverless Compute**: 9 Deno Edge Functions
- **Authentication**: Supabase Auth (Email/Password with admin approval workflow)
- **Realtime**: WebSocket subscriptions for live credential and notification updates

### Blockchain & Cryptography
- **Networks**: Ethereum Sepolia (Chain ID 11155111), Polygon Amoy (Chain ID 80002), Localhost
- **Smart Contract Language**: Solidity 0.8.19
- **Development Tooling**: Hardhat 3.2, `@nomicfoundation/hardhat-ethers`
- **Web3 Interface**: ethers.js 6.16, MetaMask Extension
- **DID Schemes**: `did:ethr:sepolia`, `did:ethr:amoy`, `did:key`
- **Standards**: W3C Verifiable Credentials Data Model 1.1, OpenID4VCI, OpenID4VP

### Testing & Quality Assurance
- **Unit & Integration Runner**: Vitest 3.1
- **DOM Testing**: `@testing-library/react` 16.0, JSDOM 20.0
- **Contract Test Suite**: Hardhat native runner (`scripts/test-contract.js`)
- **CI/CD**: GitHub Actions workflow (`.github/workflows/ci.yml`)

---

## 3. System Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                            BLOCKID Web App (React)                          │
├─────────────────┬────────────────┬─────────────────┬────────────────────────┤
│ Issuer Portal   │ Holder Wallet  │ Verifier Portal │ Admin & Audit Portal   │
│ (`/issuer`)     │ (`/holder`)    │ (`/verifier`)   │ (`/admin`, `/audit`)   │
└────────┬────────┴───────┬────────┴────────┬────────┴──────────┬─────────────┘
         │                │                 │                   │
         ▼                ▼                 ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Supabase BaaS Engine                              │
│                                                                             │
│  ├── Auth System & Role Guard                                               │
│  ├── PostgreSQL Database (13 Core Tables)                                  │
│  ├── Row-Level Security (RLS Policies)                                      │
│  ├── Realtime Engine (Pub/Sub WebSockets)                                   │
│  └── 9 Deno Edge Functions:                                                 │
│      ├── issue-credential          ├── anchor-credential                    │
│      ├── verify-credential         ├── anchor-credential-server             │
│      ├── manage-schemas            ├── resolve-did                          │
│      ├── oid4vci                   ├── oid4vp                               │
│      └── admin-users                                                        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EVM Blockchain Layer (Smart Contracts)                   │
│                                                                             │
│  CredentialRegistry.sol (Solidity 0.8.19)                                   │
│  ├── anchorCredential(hash)                                                 │
│  ├── anchorCredentialBatch(hashes[1..100])                                  │
│  ├── revokeCredential(hash)                                                 │
│  ├── getCredentialStatus(hash) → (anchored, revoked, issuer, block...)     │
│  ├── getCredentialBatch(hashes[1..100])                                     │
│  └── isValid(hash) → bool                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Application Routes & Navigation

All routes are declared in `src/App.tsx` and protected by `ProtectedRoute.tsx`.

| Route Path | View Component | Access Role | Description |
|---|---|---|---|
| `/` | `Landing.tsx` | Public | Platform introduction, feature breakdown, CTA |
| `/auth` | `Auth.tsx` | Public | Sign-in and sign-up form |
| `/reset-password` | `ResetPassword.tsx` | Public | Password recovery flow |
| `/issuer` | `IssuerDashboard.tsx` | `issuer` | Issuer portal main view |
| `/issuer/issue` | `IssueView.tsx` | `issuer` | Credential issuance & batch form |
| `/issuer/schemas` | `SchemasView.tsx` | `issuer` | Schema builder & manager |
| `/holder` | `HolderWallet.tsx` | `holder` | Holder wallet main view |
| `/holder/present` | `PresentView.tsx` | `holder` | Credential presentation & share builder |
| `/verifier` | `VerifierDashboard.tsx` | `verifier` | Verifier main dashboard |
| `/verifier/verify` | `VerifyView.tsx` | `verifier` | Credential verification engine |
| `/verifier/history` | `HistoryView.tsx` | `verifier` | Past verification records |
| `/verifier/analytics`| `AnalyticsView.tsx` | `verifier` | Analytics & verification statistics |
| `/admin` | `AdminDashboard.tsx` | `org_admin` | Organization & user approval portal |
| `/explorer` | `BlockchainExplorer.tsx` | Protected | In-app EVM anchor lookup tool |
| `/audit` | `AuditLog.tsx` | Protected | Immutable audit log viewer |
| `/shared/:token` | `SharedCredential.tsx` | Public | Time-limited shared credential viewer |
| `/pending-approval`| `PendingApproval.tsx` | Authenticated | Screen shown while user account awaits admin approval |
| `/account-rejected`| `AccountRejected.tsx` | Authenticated | Screen shown if user approval is denied |

---

## 5. Authentication, RBAC & User Approval Workflow

### Supported Roles
1. `issuer`: Educational institutions, employers, certification authorities.
2. `holder`: Students, employees, individuals.
3. `verifier`: Employers, background screening agencies, third parties.
4. `org_admin`: System administrators managing users and platform governance.
5. `auditor`: Compliance officers reviewing audit trails and data consent records.

### User Approval Flow
```text
User Sign-Up → Profile Created (status: 'pending')
                    │
                    ▼
     Admin Portal (`/admin`) Review
      ├── Approve → status: 'approved' → Full Portal Access Granted
      └── Reject  → status: 'rejected' → Redirected to `/account-rejected`
```

---

## 6. Database Schema Specification (13 Tables)

PostgreSQL schema managed via `supabase/migrations/`.

### 1. `user_roles`
Stores role assignments for users.
- `id` (UUID, PK)
- `user_id` (UUID, FK -> `auth.users`)
- `role` (ENUM: `issuer`, `holder`, `verifier`, `org_admin`, `auditor`)
- `created_at` (TIMESTAMPTZ)

### 2. `profiles`
User profile details and approval status.
- `id` (UUID, PK, FK -> `auth.users`)
- `email` (TEXT)
- `full_name` (TEXT)
- `organization_name` (TEXT)
- `did` (TEXT, UNIQUE)
- `approval_status` (TEXT: `pending`, `approved`, `rejected`)
- `approved_by` (UUID)
- `approved_at` (TIMESTAMPTZ)
- `created_at` (TIMESTAMPTZ)

### 3. `credential_schemas`
JSON Schema definitions created by issuers.
- `id` (UUID, PK)
- `issuer_id` (UUID, FK -> `profiles.id`)
- `name` (TEXT)
- `version` (TEXT)
- `description` (TEXT)
- `schema_json` (JSONB)
- `ipfs_cid` (TEXT)
- `created_at` (TIMESTAMPTZ)

### 4. `status_lists`
W3C StatusList2021 revocation bitmaps.
- `id` (UUID, PK)
- `issuer_id` (UUID, FK -> `profiles.id`)
- `encoded_list` (TEXT)
- `created_at` (TIMESTAMPTZ)

### 5. `credentials`
Issued W3C Verifiable Credentials.
- `id` (UUID, PK)
- `credential_id` (TEXT, UNIQUE)
- `issuer_id` (UUID, FK -> `profiles.id`)
- `holder_id` (UUID, FK -> `profiles.id`)
- `holder_did` (TEXT)
- `schema_id` (UUID, FK -> `credential_schemas.id`)
- `credential_subject` (JSONB)
- `credential_hash` (TEXT)
- `signature` (TEXT)
- `status` (TEXT: `active`, `revoked`, `expired`)
- `issuance_date` (TIMESTAMPTZ)
- `expiration_date` (TIMESTAMPTZ)
- `block_number` (BIGINT)
- `transaction_hash` (TEXT)
- `created_at` (TIMESTAMPTZ)

### 6. `credential_shares`
Time-limited credential share tokens.
- `id` (UUID, PK)
- `credential_id` (UUID, FK -> `credentials.id`)
- `holder_id` (UUID, FK -> `profiles.id`)
- `share_token` (TEXT, UNIQUE)
- `disclosed_fields` (JSONB)
- `expires_at` (TIMESTAMPTZ)
- `created_at` (TIMESTAMPTZ)

### 7. `verification_requests`
OID4VP presentation requests sent by verifiers.
- `id` (UUID, PK)
- `verifier_id` (UUID, FK -> `profiles.id`)
- `holder_id` (UUID, FK -> `profiles.id`)
- `required_schema_id` (UUID, FK -> `credential_schemas.id`)
- `status` (TEXT: `pending`, `accepted`, `rejected`, `expired`)
- `response_data` (JSONB)
- `created_at` (TIMESTAMPTZ)

### 8. `notifications`
System notifications delivered to users via Realtime.
- `id` (UUID, PK)
- `user_id` (UUID, FK -> `profiles.id`)
- `title` (TEXT)
- `message` (TEXT)
- `type` (TEXT)
- `read` (BOOLEAN)
- `created_at` (TIMESTAMPTZ)

### 9. `audit_logs`
Immutable audit records.
- `id` (UUID, PK)
- `user_id` (UUID)
- `action` (TEXT)
- `entity_type` (TEXT)
- `entity_id` (TEXT)
- `details` (JSONB)
- `ip_address` (TEXT)
- `created_at` (TIMESTAMPTZ)

### 10. `trusted_issuers`
Accredited issuer registry entries.
- `id` (UUID, PK)
- `issuer_id` (UUID, FK -> `profiles.id`)
- `name` (TEXT)
- `did` (TEXT)
- `status` (TEXT: `trusted`, `suspended`, `revoked`)
- `accreditation_details` (JSONB)
- `created_at` (TIMESTAMPTZ)

### 11. `consent_records`
GDPR consent tracking.
- `id` (UUID, PK)
- `holder_id` (UUID, FK -> `profiles.id`)
- `verifier_id` (UUID)
- `purpose` (TEXT)
- `granted_at` (TIMESTAMPTZ)
- `revoked_at` (TIMESTAMPTZ)

### 12. `data_deletion_requests`
GDPR Art. 17 right-to-erasure logs.
- `id` (UUID, PK)
- `user_id` (UUID, FK -> `profiles.id`)
- `status` (TEXT: `requested`, `processing`, `completed`)
- `requested_at` (TIMESTAMPTZ)

### 13. `oid4vc_sessions`
Active OpenID4VCI and OID4VP protocol sessions.
- `id` (UUID, PK)
- `session_type` (TEXT: `issuance`, `presentation`)
- `state_token` (TEXT, UNIQUE)
- `nonce` (TEXT)
- `payload` (JSONB)
- `expires_at` (TIMESTAMPTZ)
- `created_at` (TIMESTAMPTZ)

---

## 7. Row-Level Security (RLS) Policies

All 13 tables enforce strict PostgreSQL RLS policies to guarantee data isolation:
- **Profiles**: Users can read all profiles (for DID resolution), but can only update their own profile. Admin users can update approval status.
- **Credentials**: Issuers can view credentials they issued; holders can view credentials issued to their DID; verifiers can view credentials shared with them via token.
- **Credential Shares**: Holders can manage their shares; anonymous/public users can read unexpired shares by token matching.
- **Audit Logs**: Authenticated users can view logs pertaining to their actions; org_admins can view all audit records.

---

## 8. Database Functions & Triggers

Stored procedures defined in migrations:
1. `has_role(_user_id UUID, _role app_role) -> BOOLEAN`: Checks user role membership.
2. `handle_new_user() -> TRIGGER`: Automatically creates `profile` and `user_roles` records on sign-up.
3. `generate_did(_user_id UUID) -> TEXT`: Derives deterministic `did:ethr` identifier for user wallet address.
4. `get_my_did() -> TEXT`: Helper view returning current authenticated user's DID.
5. `auto_expire_credential() -> TRIGGER`: Trigger that flags credentials as expired when `expiration_date` passes.
6. `expire_stale_credentials() -> VOID`: Cron-executable procedure for batch credential expiration cleanup.
7. `notify_credential_issued() -> TRIGGER`: Fires a notification and audit log when a new credential is written.
8. `notify_credential_status_change() -> TRIGGER`: Emits real-time event when credential status toggles to revoked.

---

## 9. Deno Edge Functions API Specification (9 Microservices)

Located in `supabase/functions/`:

| Function Name | Endpoint | Description |
|---|---|---|
| `admin-users` | `/functions/v1/admin-users` | List, approve, or reject user registrations |
| `anchor-credential` | `/functions/v1/anchor-credential` | Relay client-signed anchor transaction to EVM RPC |
| `anchor-credential-server` | `/functions/v1/anchor-credential-server` | Automated server-side wallet anchoring |
| `issue-credential` | `/functions/v1/issue-credential` | Issue, format, and sign W3C credential JSON |
| `manage-schemas` | `/functions/v1/manage-schemas` | CRUD operations for credential schemas |
| `oid4vci` | `/functions/v1/oid4vci` | Handle OpenID for VC Issuance credential offers |
| `oid4vp` | `/functions/v1/oid4vp` | Handle OpenID for Verifiable Presentations |
| `resolve-did` | `/functions/v1/resolve-did` | Resolve `did:ethr` and `did:key` DIDs |
| `verify-credential` | `/functions/v1/verify-credential` | Validate VC signatures, expiry, and on-chain anchor |

---

## 10. Smart Contract Architecture (`CredentialRegistry.sol`)

Located at `contracts/CredentialRegistry.sol`.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract CredentialRegistry {
    struct Credential {
        address issuer;
        uint256 blockAnchored;
        uint256 anchoredAt;   // Unix timestamp
        uint256 revokedAt;    // Unix timestamp (0 if active)
        bool revoked;
    }

    mapping(bytes32 => Credential) public credentials;

    event CredentialAnchored(bytes32 indexed hash, address indexed issuer, uint256 blockNumber, uint256 timestamp);
    event CredentialRevoked(bytes32 indexed hash, address indexed issuer, uint256 blockNumber, uint256 timestamp);

    function anchorCredential(bytes32 hash) external;
    function anchorCredentialBatch(bytes32[] calldata hashes) external;
    function revokeCredential(bytes32 hash) external;
    function getCredentialStatus(bytes32 hash) external view returns (bool anchored, bool revoked, address issuer, uint256 blockAnchored, uint256 anchoredAt, uint256 revokedAt);
    function getCredentialBatch(bytes32[] calldata hashes) external view returns (bool[] memory anchored, bool[] memory revoked, address[] memory issuers, uint256[] memory blockNumbers, uint256[] memory timestamps);
    function isValid(bytes32 hash) external view returns (bool);
}
```

---

## 11. Portal 1: Issuer Dashboard (`/issuer`)

The Issuer Dashboard allows credential authorities to:
- Formally define schemas via `SchemaBuilder.tsx`.
- Fill credential fields, perform cryptographic key signing, and trigger on-chain anchoring via `IssueView.tsx`.
- Execute batch issuance CSV pipelines via `BatchIssuanceDialog.tsx`.
- Render dynamic SVG certificates and export dark-mode PDFs via `CertificateRenderer.tsx`.
- Revoke active credentials directly on-chain via `useOnChainRevocation.ts`.

---

## 12. Portal 2: Holder Wallet (`/holder`)

The Holder Wallet provides non-custodial credential management:
- View all held credentials in `WalletView.tsx`.
- Inspect on-chain anchor block numbers and transaction hashes (`OnChainStatusBadge.tsx`).
- Configure selective disclosure parameters and share links in `PresentView.tsx`.
- Lock wallet access using WebAuthn passkeys (`BiometricLockModal.tsx`).
- Monitor proactive expiration banners for credentials expiring within 30 days.

---

## 13. Portal 3: Verifier Portal (`/verifier`)

The Verifier Portal empowers third parties to:
- Verify credential authenticity via direct hash lookup or file upload (`VerifyView.tsx`).
- Receive real-time live verification events (`LiveActivityFeed.tsx`).
- Send structured presentation requests (OID4VP) to holders (`OID4VPRequestDialog.tsx`).
- Perform bulk credential verification (`BulkVerifyDialog.tsx`).
- View verification trends and analytics charts (`AnalyticsView.tsx`).

---

## 14. Portal 4: Admin & Governance (`/admin`)

System Administrators can:
- Review pending user accounts, inspect organization credentials, and approve/reject access (`AdminDashboard.tsx`).
- Maintain accredited issuer listings in `TrustedIssuerRegistry.tsx`.
- Monitor global audit logs and privacy compliance requests.

---

## 15. Credential Sharing & Selective Disclosure

BLOCKID implements privacy-preserving credential sharing:
1. Holder selects credential fields to reveal (e.g., `fullName`, `degree`, masking `gpa` and `birthDate`).
2. Holder chooses token expiration (1 hour, 24 hours, 7 days, 30 days).
3. A unique cryptographically secure `share_token` is written to `credential_shares`.
4. Verifier accesses `/shared/:share_token` to view the selectively disclosed fields alongside the tamper-proof blockchain hash.

---

## 16. OpenID4VC Protocol Suite (OID4VCI & OID4VP)

- **OpenID for VC Issuance (OID4VCI)**: Issuers generate QR codes containing credential offer URIs. Holders scan the QR with their wallet to claim credentials directly (`OID4VCIOfferDialog.tsx`).
- **OpenID for Verifiable Presentations (OID4VP)**: Verifiers specify requested schema fields. Holders approve presentation requests, generating a signed presentation payload (`OID4VPRequestDialog.tsx`).

---

## 17. Blockchain Explorer & Audit Trail

- **Blockchain Explorer (`/explorer`)**: In-app EVM explorer displaying live contract events, block numbers, transaction hashes, and issuer addresses.
- **Audit Log (`/audit`)**: Complete history of credential issuance, sharing, verification, and revocation events.

---

## 18. Trusted Issuer Registry & Trust Infrastructure

The **Trusted Issuer Registry** (`TrustedIssuerRegistry.tsx`) acts as an on-chain/on-database trust anchor listing accredited institutions, public keys, and accreditation levels.

---

## 19. AI Verification & Anomaly Engine (Google Gemini)

Integrated via `src/services/ai/credential-ai.service.ts` and `CredentialAIAssistant.tsx`:
- Evaluates **8 risk dimensions**: Signature Integrity, Blockchain Anchor, Issuer Trust, Schema Compliance, Expiration Risk, Revocation Risk, Subject Anomaly, and Data Consistency.
- Provides natural language findings, anomaly alerts, and recommendations.

---

## 20. WebAuthn Biometric Passkey Protection

Implemented via `webauthnService.ts` and `BiometricLockModal.tsx`:
- Allows holders to register WebAuthn passkeys (FaceID / TouchID / YubiKey).
- Requires biometric authentication before presenting sensitive credentials or revealing private keys.

---

## 21. Dynamic Visual Certificates & PDF Generator

- **SVG Renderer** (`CertificateRenderer.tsx`): High-resolution visual certificate template with embedded QR codes.
- **PDF Generator** (`generateCertificatePdf.ts`): Client-side dark-mode PDF document exporter built on `jsPDF`.

---

## 22. Privacy & GDPR Compliance (Art. 17 & Art. 20)

Available through `PrivacyCenter.tsx`:
- **GDPR Article 20 (Data Portability)**: Export all held credentials and wallet keys as standard JSON-LD files.
- **GDPR Article 17 (Right to Erasure)**: Submit formal data deletion requests tracked in `data_deletion_requests`.

---

## 23. PWA & Offline Service Worker Infrastructure

Configured via `vite-plugin-pwa`:
- Installable as a desktop and mobile PWA.
- Service worker caches core application assets and held credentials for offline access.

---

## 24. Testing & Quality Assurance Suite (127 Vitest Tests)

Automated test suite verified clean via `npm test`:

| Test File | Test Count | Scope |
|---|---|---|
| `credential-ai.service.test.ts` | 39 | AI risk calculation, dimension scoring, fallback engine |
| `crypto.test.ts` | 23 | Canonical JSON normalization & SHA-256 hash calculation |
| `ipfs.test.ts` | 24 | CID extraction/validation, gateway URL resolution, schema JSON-LD builder |
| `permissions.test.ts` | 20 | RBAC matrix enforcement across all 5 roles |
| `generateCertificatePdf.test.ts` | 12 | PDF rendering logic, QR embedding, layout geometry |
| `ProtectedRoute.test.tsx` | 9 | Route protection guards, auth redirects, pending state |

Smart contract test runner (`npm run test:contract` / `CredentialRegistry.test.js`) validates contract anchor, batch operation, and revocation constraints.

---

## 25. Decentralized Storage & IPFS Pinning

Schemas are content-addressed on IPFS so credentials survive independent of the central database.

- **Edge Functions**:
  - `pin-to-ipfs`: Pins a schema's canonical JSON-LD document to IPFS via Pinata; stores the CID in `credential_schemas.ipfs_cid`, writes a `schema_pinned_ipfs` audit entry, and is idempotent (re-pinning returns the existing CID). Owner-only authorization.
  - `fetch-from-ipfs`: Resolves any CID / `ipfs://` URI from a configurable gateway with timeout and size guard rails.
- **Auto-Pinning**: `issue-credential` best-effort pins the schema on first issuance — issuance never fails due to IPFS unavailability.
- **Client Utilities**: `src/lib/ipfs.ts` (CIDv0/CIDv1 parsing & validation, gateway resolution) mirrored by `supabase/functions/_shared/ipfs.ts`; UI access via the issuer Schemas view ("Pin to IPFS" action + gateway link badge).
- **Configuration**: Set `PINATA_JWT` (or `PINATA_API_KEY`/`PINATA_SECRET_API_KEY`) as Supabase Edge Function secrets; optionally override `IPFS_GATEWAY_URL`.

---

## 26. Multi-Phase Roadmap (Phase 0 – Phase 8)

| Phase | Description | Status |
|---|---|---|
| **Phase 0** | **Testing & CI/CD Infrastructure** | ✅ Complete (127 tests passing) |
| **Phase 3** | **Decentralized Storage & IPFS** | ✅ Complete (Pinata pin/fetch functions + schema CIDs + auto-pin on issuance) |
| **Phase 1** | **Zero-Knowledge Proofs (ZK-SNARKs)** | ⏳ Next Up (Circom & Groth16 Verifier) |
| **Phase 2** | **Account Abstraction (ERC-4337)** | ⏳ Pending (Paymaster Gasless Sponsor) |
| **Phase 4** | **Universal Interoperability & SIWE** | ⏳ Pending (Sign-In With Ethereum) |
| **Phase 7** | **Soulbound Tokens (EIP-5192)** | ⏳ Pending (Non-transferable NFTs) |
| **Phase 6** | **Advanced AI & On-Device ML** | ⏳ Pending (TensorFlow.js & OCR) |
| **Phase 5** | **Native Mobile (React Native)** | ⏳ Pending (Expo & NFC credentials) |
| **Phase 8** | **Biometric Proof Pipeline** | ⏳ Pending (On-chain biometric hashes) |
