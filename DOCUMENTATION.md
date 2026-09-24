# BLOCKID — Comprehensive Platform Documentation

**Enterprise Self-Sovereign Identity (SSI), Verifiable Credentials, Zero-Knowledge Privacy & Account Abstraction**

---

## Table of Contents

1. [Executive Summary & SSI Paradigm](#1-executive-summary--ssi-paradigm)
2. [Technology Stack Matrix](#2-technology-stack-matrix)
3. [End-to-End System Architecture](#3-end-to-end-system-architecture)
4. [Application Routes, Navigation & Role Guards](#4-application-routes-navigation--role-guards)
5. [Authentication, RBAC & Approval Workflow](#5-authentication-rbac--approval-workflow)
6. [Database Schema Specification (15 Tables)](#6-database-schema-specification-15-tables)
7. [Row-Level Security (RLS) Policy Architecture](#7-row-level-security-rls-policy-architecture)
8. [Database Stored Procedures, Functions & Triggers](#8-database-stored-procedures-functions--triggers)
9. [Deno Edge Functions API Specification (14 Microservices)](#9-deno-edge-functions-api-specification-14-microservices)
10. [Smart Contract Architecture & Verified Deployments (9 Contracts)](#10-smart-contract-architecture--verified-deployments-9-contracts)
11. [Zero-Knowledge Proofs Architecture (Circom 2.0 & Groth16)](#11-zero-knowledge-proofs-architecture-circom-20--groth16)
12. [ERC-4337 Account Abstraction & Session Key Architecture](#12-erc-4337-account-abstraction--session-key-architecture)
13. [EIP-5192 Soulbound Credential Tokens (SBT)](#13-eip-5192-soulbound-credential-tokens-sbt)
14. [Sign-In With Ethereum (SIWE - EIP-4361)](#14-sign-in-with-ethereum-siwe---eip-4361)
15. [Multi-Detector AI Anomaly & Trust Radar Engine](#15-multi-detector-ai-anomaly--trust-radar-engine)
16. [WebAuthn Biometric & Interactive Liveness Pipeline](#16-webauthn-biometric--interactive-liveness-pipeline)
17. [Decentralized Storage & IPFS Pinning](#17-decentralized-storage--ipfs-pinning)
18. [Dynamic Visual Certificates & PDF Export](#18-dynamic-visual-certificates--pdf-export)
19. [OpenID4VC Protocol Suite (OID4VCI & OID4VP)](#19-openid4vc-protocol-suite-oid4vci--oid4vp)
20. [In-App Blockchain Explorer & Audit Trail](#20-in-app-blockchain-explorer--audit-trail)
21. [Trusted Issuer Registry & Institutional Governance](#21-trusted-issuer-registry--institutional-governance)
22. [Credential Sharing & Selective Disclosure](#22-credential-sharing--selective-disclosure)
23. [Privacy & GDPR Compliance (Articles 17 & 20)](#23-privacy--gdpr-compliance-articles-17--20)
24. [Progressive Web App (PWA) & Offline Caching](#24-progressive-web-app-pwa--offline-caching)
25. [Native Mobile Application (React Native / Expo)](#25-native-mobile-application-react-native--expo)
26. [Testing, Quality Assurance & Benchmarks (416 Tests across 20 Suites)](#26-testing-quality-assurance--benchmarks-416-tests-across-20-suites)
27. [Multi-Phase Roadmap (Phases 0 – 8 Complete)](#27-multi-phase-roadmap-phases-0--8-complete)
28. [Developer Setup & Deployment Guide](#28-developer-setup--deployment-guide)

---

## 1. Executive Summary & SSI Paradigm

**BLOCKID** is a production-grade, decentralized **Self-Sovereign Identity (SSI)** platform designed for academic institutions, enterprises, and identity providers. Built on open W3C and Web3 standards—including **W3C Verifiable Credentials Data Model v1.1**, **W3C Decentralized Identifiers (DIDs: `did:ethr` and `did:key`)**, **OpenID4VC standards (OID4VCI and OID4VP)**, **EIP-712 typed structured data signing**, and **Ethereum Sepolia smart contracts**—BLOCKID eliminates identity fraud and streamlines credential verification without sacrificing privacy.

### The Self-Sovereign Identity Paradigm Shift

In traditional centralized identity systems, identity data is trapped in institutional silos:
```text
CENTRALIZED IDENTITY (Fragile, Custodial, Slow):
User ──────► Gives documents to ──────► Issuer (Govt / University / Bank)
                                                │
                                                ▼
Verifier ◄────── Calls Issuer to manually verify (Takes weeks, metadata leaks)
```

In the BLOCKID SSI architecture:
```text
DECENTRALIZED SSI (Cryptographic, Sovereign, Instant):
1. Issuer Signs VC & Anchors Hash on Sepolia EVM
          │
          ├─────────────────────────┐
          ▼                         ▼
2. Holder Stores in Wallet   Blockchain Anchoring
          │                         │
          ▼                         │
3. Holder Presents ZKP/VC ─────────┼──────► Verifier Validates Instantly (<1s)
                                            (Zero metadata leaks to Issuer)
```

### Core Value Guarantees
- **Cryptographic Trust**: Every issued credential is canonicalized via RFC-8785 JSON normalization, SHA-256 hashed, and anchored to Ethereum Sepolia smart contracts (`CredentialRegistry.sol`).
- **Non-Custodial Data Ownership**: Holders maintain full sovereignty over their credentials in a secure browser/mobile vault encrypted with their keys.
- **Zero-Knowledge Privacy**: Holders generate client-side zk-SNARK proofs using Circom 2.0 and WebAssembly `snarkjs` in <250ms, proving claims (e.g., age > 18 or salary within range) without disclosing personal data.
- **ERC-4337 Account Abstraction**: Smart contract wallets with scoped session keys, operational spending limits, and gasless transaction sponsorship readiness.
- **Non-Transferable Soulbound Badges (EIP-5192)**: On-chain digital credential tokens tied permanently to the holder's wallet address.
- **Statistical Fraud Intelligence**: Multi-detector anomaly engine and 8-factor Trust Radar evaluating verification requests in real time.
- **GDPR Native**: Strict compliance with GDPR Article 17 (Right to Erasure) and Article 20 (Data Portability).

---

## 2. Technology Stack Matrix

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| **Frontend Framework** | React + Vite | 18.3.1 / 6.3.5 | Core Single Page Application (SPA) client |
| **Language** | TypeScript (Strict Mode) | 5.8.3 | Type-safe enterprise code across client and services |
| **Styling & UI Components** | Tailwind CSS + shadcn/ui | 3.4.17 | Modern responsive design system with Radix UI primitives |
| **Micro-Animations** | Framer Motion | 12.36.0 | Fluid gestures, layout transitions, and dialog animations |
| **State & Async Queries** | TanStack React Query | 5.83.0 | Server-state caching, optimistic updates, query invalidation |
| **Data Visualization** | Recharts | 2.15.4 | Real-time Trust Radar charts, verification analytics, time-series |
| **PDF Generation** | jsPDF | 4.2.0 | High-fidelity dark-mode visual certificate rendering and download |
| **QR Code Rendering** | `qrcode.react` | 4.2.0 | SVG/Canvas QR generation for OID4VCI offers and OID4VP requests |
| **PWA & Offline Worker** | `vite-plugin-pwa` (Workbox) | 0.21.0 | Offline credential availability, app manifest, installability |
| **Backend as a Service** | Supabase PostgreSQL | 15.x | Relational storage, Row-Level Security, Realtime WebSockets |
| **Serverless Compute** | Deno Edge Functions | 1.x (ESM) | 14 distributed microservices running at the edge |
| **Smart Contracts** | Solidity | 0.8.19 | 9 EVM smart contracts compiled with Hardhat 3.2.0 |
| **Blockchain Networks** | Ethereum Sepolia / Polygon Amoy | Chain 11155111 / 80002 | Primary EVM testnet deployment and backup L2 network |
| **Web3 Client Interface** | ethers.js | 6.16.0 | Provider abstractions, wallet signers, ABI encoding, contract calls |
| **Zero-Knowledge Proofs** | Circom + snarkjs | 2.0 / 0.7.6 | Groth16 zk-SNARK circuit compilation, proving, verification |
| **Account Abstraction** | ERC-4337 | EntryPoint v0.6 | Smart contract accounts, session keys, UserOperations, Pimlico |
| **Soulbound Tokens** | EIP-5192 / ERC-721 | OpenZeppelin basis | Locked, non-transferable on-chain credential token badges |
| **Wallet Authentication** | Sign-In with Ethereum (SIWE) | EIP-4361 | Cryptographic secp256k1 wallet signature login |
| **Decentralized Storage** | Pinata IPFS Gateway | Pinata API | Content-addressed schema pinning (CIDv0 / CIDv1) |
| **Biometric Security** | WebAuthn / FIDO2 | W3C Standard | Hardware-backed biometric passkeys (TouchID, FaceID, Windows Hello) |
| **Mobile Application** | React Native + Expo | Expo SDK 52 | Native iOS/Android mobile client with SecureStore |
| **Testing Framework** | Vitest + Hardhat Test Runner | 3.1.2 / 3.2.0 | 416 automated tests across 20 suites with JSDOM and Testing Library |

---

## 3. End-to-End System Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   CLIENT PRESENTATION LAYER                                 │
├────────────────────┬────────────────────┬──────────────────────┬────────────────────────────┤
│   Issuer Portal    │   Holder Wallet    │   Verifier Portal    │    Admin & Governance      │
│    (`/issuer`)     │    (`/holder`)     │    (`/verifier`)     │   (`/admin`, `/audit`)     │
└─────────┬──────────┴─────────┬──────────┴──────────┬───────────┴─────────────┬──────────────┘
          │                    │                     │                         │
          ▼                    ▼                     ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                            CLIENT-SIDE CRYPTOGRAPHY & ML ENGINES                            │
│  ├── snarkjs Groth16 WASM Prover (<250ms Browser Execution)                                 │
│  ├── 5-Detector Anomaly Engine & 8-Factor Trust Radar Score Calculator                      │
│  ├── WebAuthn / Passkeys Biometric Manager & Interactive Liveness Detector                  │
│  ├── Ethers.js v6 Signer (EIP-712 Typed Data, SIWE EIP-4361, MetaMask)                      │
│  └── Client IPFS Gateway Client & jsPDF Vector Certificate Generator                        │
└──────────────────────────────────────────────┬──────────────────────────────────────────────┘
                                               │
                      ┌────────────────────────┴────────────────────────┐
                      ▼                                                 ▼
┌──────────────────────────────────────────────┐ ┌────────────────────────────────────────────┐
│         SUPABASE CLOUD / BaaS LAYER          │ │          PINATA IPFS STORAGE LAYER         │
│                                              │ │                                            │
│  ├── PostgreSQL Database (15 Core Tables)    │ │  ├── Content-Addressed JSON-LD Schemas     │
│  ├── Row-Level Security (RLS) Policy Engine  │ │  ├── Immutable CID Resolution              │
│  ├── Realtime Engine (Pub/Sub WebSockets)    │ │  └── Gateway Pinning & Fallbacks           │
│  └── 14 Serverless Deno Edge Functions:       │ └────────────────────────────────────────────┘
│      ├── issue-credential                    │
│      ├── anchor-credential                   │
│      ├── anchor-credential-server            │
│      ├── verify-credential                   │
│      ├── ai-verify-credential                │
│      ├── biometric-verify                    │
│      ├── manage-schemas                      │
│      ├── resolve-did                         │
│      ├── oid4vci                             │
│      ├── oid4vp                              │
│      ├── pin-to-ipfs                         │
│      ├── fetch-from-ipfs                     │
│      ├── siwe-auth                           │
│      └── admin-users                         │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                        EVM BLOCKCHAIN LAYER (ETHEREUM SEPOLIA)                              │
│                                                                                             │
│  ├── CredentialRegistry.sol (v2)        ── SHA-256 Batch Anchor, Revocation, Status Check  │
│  ├── SoulboundCredential.sol            ── EIP-5192 Non-Transferable Credential SBT Tokens  │
│  ├── SmartWalletRegistry.sol            ── ERC-4337 Account Factory & Guardian Recovery     │
│  ├── SimpleAccount.sol                  ── ERC-4337 Smart Account with Scoped Session Keys  │
│  ├── ZKPVerifier.sol                    ── Universal BN254 Pairing Verifier (Precompile 0x08)│
│  ├── AgeVerifier.sol                    ── Precompiled Groth16 Age Threshold Verifier      │
│  ├── AttributeRangeVerifier.sol         ── Precompiled Groth16 Numeric Range Verifier       │
│  ├── IssuerMembershipVerifier.sol       ── Precompiled Groth16 Poseidon Merkle Verifier     │
│  └── BiometricProofAnchor.sol           ── On-Chain Biometric Liveness Commitment Anchor   │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Application Routes, Navigation & Role Guards

All application routes are defined in [`src/App.tsx`](file:///c:/Users/M%20S/Desktop/block-id/src/App.tsx) and guarded by [`src/components/ProtectedRoute.tsx`](file:///c:/Users/M%20S/Desktop/block-id/src/components/ProtectedRoute.tsx) and [`src/components/routing/RoleGuard.tsx`](file:///c:/Users/M%20S/Desktop/block-id/src/components/routing/RoleGuard.tsx).

| Route Path | View Component | Access Role | Description |
|---|---|---|---|
| `/` | `Landing.tsx` | Public | Hero introduction, live metrics, feature breakdown, interactive CTAs |
| `/auth` | `Auth.tsx` | Public | Dual-mode authentication: Supabase Email/Password and SIWE Web3 Login |
| `/reset-password` | `ResetPassword.tsx` | Public | Secure password recovery and token exchange flow |
| `/pending-approval`| `PendingApproval.tsx` | Authenticated | Screen shown to newly registered users awaiting admin review |
| `/account-rejected`| `AccountRejected.tsx` | Authenticated | Screen shown if user registration is rejected by an administrator |
| `/shared/:token` | `SharedCredential.tsx`| Public | View selectively disclosed fields of a time-decayed shared credential |
| `/issuer` | `IssuerDashboard.tsx` | `issuer` | Issuer dashboard overview, active schemas, and recent issuances |
| `/issuer/*` | `IssuerDashboard.tsx` | `issuer` | Subviews: Issue (`/issuer/issue`), Schemas (`/issuer/schemas`) |
| `/holder` | `HolderWallet.tsx` | `holder` | Holder wallet: credential gallery, SBT badges, security controls |
| `/holder/*` | `HolderWallet.tsx` | `holder` | Subviews: Present (`/holder/present`), ZKP Prover, WebAuthn settings |
| `/verifier` | `VerifierDashboard.tsx`| `verifier` | Verifier dashboard overview, live feed, recent checks |
| `/verifier/*` | `VerifierDashboard.tsx`| `verifier` | Subviews: Verify (`/verifier/verify`), History, Analytics |
| `/explorer` | `BlockchainExplorer.tsx`| Protected (`org_admin`, `issuer`, `holder`) | Live EVM on-chain anchor query and transaction explorer |
| `/audit` | `AuditLog.tsx` | Protected (`org_admin`, `issuer`, `verifier`, `auditor`) | Searchable, tamper-evident audit event log stream |
| `/admin` | `AdminDashboard.tsx` | `org_admin` | Organization management, user approval lifecycle, trusted issuers |
| `*` | `NotFound.tsx` | Public | 404 handler with fallback navigation |

---

## 5. Authentication, RBAC & Approval Workflow

BLOCKID implements an enterprise Role-Based Access Control (RBAC) model combined with a dual-mode authentication layer.

### 1. Dual Authentication Mechanisms
1. **Supabase Email & Password**: Standard enterprise email-based authentication with bcrypt hashing, password resets, and session JWTs.
2. **Sign-In with Ethereum (SIWE - EIP-4361)**: Non-custodial Web3 login where the user signs an EIP-4361 challenge string using their Ethereum private key. Authenticated via the `siwe-auth` edge function and backed by replay-resistant single-use nonces.

### 2. User Roles & Permissions Matrix
Defined in [`src/lib/permissions.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/lib/permissions.ts):

| Permission | `issuer` | `holder` | `verifier` | `org_admin` | `auditor` |
|---|:---:|:---:|:---:|:---:|:---:|
| `credentials:issue` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `credentials:revoke` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `schemas:create` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `credentials:view_own`| ✅ | ✅ | ❌ | ❌ | ❌ |
| `credentials:share` | ❌ | ✅ | ❌ | ❌ | ❌ |
| `credentials:verify` | ❌ | ❌ | ✅ | ❌ | ❌ |
| `requests:create` | ❌ | ❌ | ✅ | ❌ | ❌ |
| `users:manage` | ❌ | ❌ | ❌ | ✅ | ❌ |
| `org:manage` | ❌ | ❌ | ❌ | ✅ | ❌ |
| `issuers:manage` | ❌ | ❌ | ❌ | ✅ | ❌ |
| `audit:view` | ✅ | ❌ | ✅ | ✅ | ✅ |
| `explorer:view` | ✅ | ✅ | ❌ | ✅ | ❌ |

### 3. User Approval Lifecycle
To ensure Sybil resistance and institutional legitimacy:
```text
User Sign-Up (Email or SIWE)
             │
             ▼
Profile Created in DB with approval_status = 'pending'
             │
             ▼
User Navigates to Platform ──► Intercepted by ProtectedRoute ──► Redirected to `/pending-approval`
                                                                            │
      ┌─────────────────────────────────────────────────────────────────────┘
      ▼
System Admin Inspects in Admin Portal (`/admin`):
  ├── Option A: APPROVE ──► status = 'approved', approved_at = now() ──► Immediate access granted
  └── Option B: REJECT  ──► status = 'rejected' ──► Redirected to `/account-rejected`
```

---

## 6. Database Schema Specification (15 Tables)

The BLOCKID database runs on PostgreSQL 15 via Supabase, with full schema definitions managed across 21 migration files in `supabase/migrations/`.

### Table 1: `user_roles`
Maps users to their authorized operational roles.
- `id` (`UUID`, PK, default: `gen_random_uuid()`)
- `user_id` (`UUID`, FK -> `auth.users.id` on delete CASCADE)
- `role` (`app_role` ENUM: `'issuer'`, `'holder'`, `'verifier'`, `'org_admin'`, `'auditor'`)
- `created_at` (`TIMESTAMPTZ`, default: `now()`)

### Table 2: `profiles`
User profile details, decentralized identifiers, and administrative approval state.
- `id` (`UUID`, PK, FK -> `auth.users.id` on delete CASCADE)
- `email` (`TEXT`, nullable)
- `full_name` (`TEXT`, nullable)
- `organization_name` (`TEXT`, nullable)
- `did` (`TEXT`, UNIQUE, nullable) — e.g. `did:ethr:sepolia:0x...`
- `approval_status` (`TEXT`, check in `'pending'`, `'approved'`, `'rejected'`, default: `'pending'`)
- `approved_by` (`UUID`, FK -> `auth.users.id`, nullable)
- `approved_at` (`TIMESTAMPTZ`, nullable)
- `created_at` (`TIMESTAMPTZ`, default: `now()`)
- `updated_at` (`TIMESTAMPTZ`, default: `now()`)

### Table 3: `credential_schemas`
JSON-LD Schema definitions created by credential authorities.
- `id` (`UUID`, PK, default: `gen_random_uuid()`)
- `issuer_id` (`UUID`, FK -> `profiles.id` on delete CASCADE)
- `name` (`TEXT`, not null)
- `version` (`TEXT`, not null, default: `'1.0.0'`)
- `description` (`TEXT`, nullable)
- `schema_json` (`JSONB`, not null) — JSON Schema schema definition
- `ipfs_cid` (`TEXT`, nullable) — Content identifier pinned to IPFS
- `ipfs_pinned_at` (`TIMESTAMPTZ`, nullable)
- `created_at` (`TIMESTAMPTZ`, default: `now()`)
- `updated_at` (`TIMESTAMPTZ`, default: `now()`)

### Table 4: `status_lists`
W3C StatusList2021 bitstring revocation lists for off-chain efficiency.
- `id` (`UUID`, PK, default: `gen_random_uuid()`)
- `issuer_id` (`UUID`, FK -> `profiles.id` on delete CASCADE)
- `encoded_list` (`TEXT`, not null) — Gzip + Base64-encoded bitstring
- `created_at` (`TIMESTAMPTZ`, default: `now()`)
- `updated_at` (`TIMESTAMPTZ`, default: `now()`)

### Table 5: `credentials`
Issued W3C Verifiable Credentials with on-chain cryptographic binding.
- `id` (`UUID`, PK, default: `gen_random_uuid()`)
- `credential_id` (`TEXT`, UNIQUE, not null) — URI identifier e.g. `urn:uuid:...`
- `issuer_id` (`UUID`, FK -> `profiles.id` on delete CASCADE)
- `holder_id` (`UUID`, FK -> `profiles.id` on delete SET NULL, nullable)
- `holder_did` (`TEXT`, not null)
- `schema_id` (`UUID`, FK -> `credential_schemas.id` on delete RESTRICT)
- `credential_subject` (`JSONB`, not null) — Raw attribute claims
- `credential_hash` (`TEXT`, not null) — SHA-256 fingerprint of canonical JSON
- `signature` (`TEXT`, not null) — EIP-712 cryptographic signature
- `status` (`TEXT`, check in `'active'`, `'revoked'`, `'expired'`, default: `'active'`)
- `issuance_date` (`TIMESTAMPTZ`, not null, default: `now()`)
- `expiration_date` (`TIMESTAMPTZ`, nullable)
- `block_number` (`BIGINT`, nullable) — On-chain anchor block
- `transaction_hash` (`TEXT`, nullable) — Sepolia anchor transaction hash
- `created_at` (`TIMESTAMPTZ`, default: `now()`)
- `updated_at` (`TIMESTAMPTZ`, default: `now()`)

### Table 6: `credential_shares`
Time-limited, privacy-preserving credential sharing tokens.
- `id` (`UUID`, PK, default: `gen_random_uuid()`)
- `credential_id` (`UUID`, FK -> `credentials.id` on delete CASCADE)
- `holder_id` (`UUID`, FK -> `profiles.id` on delete CASCADE)
- `share_token` (`TEXT`, UNIQUE, not null) — Cryptographically random hex token
- `disclosed_fields` (`JSONB`, not null) — Filtered array of exposed field names
- `expires_at` (`TIMESTAMPTZ`, not null)
- `created_at` (`TIMESTAMPTZ`, default: `now()`)

### Table 7: `verification_requests`
OpenID4VP presentation requests initiated by verifiers.
- `id` (`UUID`, PK, default: `gen_random_uuid()`)
- `verifier_id` (`UUID`, FK -> `profiles.id` on delete CASCADE)
- `holder_id` (`UUID`, FK -> `profiles.id` on delete SET NULL, nullable)
- `required_schema_id` (`UUID`, FK -> `credential_schemas.id` on delete SET NULL, nullable)
- `status` (`TEXT`, check in `'pending'`, `'accepted'`, `'rejected'`, `'expired'`, default: `'pending'`)
- `response_data` (`JSONB`, nullable) — Verifiable Presentation payload
- `created_at` (`TIMESTAMPTZ`, default: `now()`)
- `updated_at` (`TIMESTAMPTZ`, default: `now()`)

### Table 8: `notifications`
Real-time user notification events delivered via Supabase WebSocket channels.
- `id` (`UUID`, PK, default: `gen_random_uuid()`)
- `user_id` (`UUID`, FK -> `profiles.id` on delete CASCADE)
- `title` (`TEXT`, not null)
- `message` (`TEXT`, not null)
- `type` (`TEXT`, check in `'info'`, `'success'`, `'warning'`, `'error'`, default: `'info'`)
- `read` (`BOOLEAN`, not null, default: `false`)
- `created_at` (`TIMESTAMPTZ`, default: `now()`)

### Table 9: `audit_logs`
Immutable, tamper-evident log of all security-sensitive platform operations.
- `id` (`UUID`, PK, default: `gen_random_uuid()`)
- `user_id` (`UUID`, nullable)
- `action` (`TEXT`, not null) — e.g. `'credential_issued'`, `'credential_revoked'`
- `entity_type` (`TEXT`, not null) — e.g. `'credential'`, `'schema'`, `'user'`
- `entity_id` (`TEXT`, nullable)
- `details` (`JSONB`, default: `'{}'::jsonb`)
- `ip_address` (`TEXT`, nullable)
- `created_at` (`TIMESTAMPTZ`, default: `now()`)

### Table 10: `trusted_issuers`
Institutional registry of accredited issuers and trust anchors.
- `id` (`UUID`, PK, default: `gen_random_uuid()`)
- `issuer_id` (`UUID`, FK -> `profiles.id` on delete CASCADE)
- `name` (`TEXT`, not null)
- `did` (`TEXT`, not null)
- `status` (`TEXT`, check in `'trusted'`, `'suspended'`, `'revoked'`, default: `'trusted'`)
- `accreditation_details` (`JSONB`, default: `'{}'::jsonb`)
- `created_at` (`TIMESTAMPTZ`, default: `now()`)
- `updated_at` (`TIMESTAMPTZ`, default: `now()`)

### Table 11: `consent_records`
GDPR consent ledger recording verifier data access permissions.
- `id` (`UUID`, PK, default: `gen_random_uuid()`)
- `holder_id` (`UUID`, FK -> `profiles.id` on delete CASCADE)
- `verifier_id` (`UUID`, not null)
- `purpose` (`TEXT`, not null)
- `granted_at` (`TIMESTAMPTZ`, default: `now()`)
- `revoked_at` (`TIMESTAMPTZ`, nullable)

### Table 12: `data_deletion_requests`
Formal GDPR Article 17 Right to Erasure execution tracking.
- `id` (`UUID`, PK, default: `gen_random_uuid()`)
- `user_id` (`UUID`, FK -> `profiles.id` on delete CASCADE)
- `status` (`TEXT`, check in `'requested'`, `'processing'`, `'completed'`, default: `'requested'`)
- `requested_at` (`TIMESTAMPTZ`, default: `now()`)
- `completed_at` (`TIMESTAMPTZ`, nullable)

### Table 13: `oid4vc_sessions`
Ephemeral state storage for OpenID4VCI and OID4VP protocol transactions.
- `id` (`UUID`, PK, default: `gen_random_uuid()`)
- `session_type` (`TEXT`, check in `'issuance'`, `'presentation'`)
- `state_token` (`TEXT`, UNIQUE, not null)
- `nonce` (`TEXT`, not null)
- `payload` (`JSONB`, not null)
- `expires_at` (`TIMESTAMPTZ`, not null)
- `created_at` (`TIMESTAMPTZ`, default: `now()`)

### Table 14: `siwe_nonces`
Replay-protection store for EIP-4361 Sign-In with Ethereum authentication.
- `nonce` (`TEXT`, PK) — Cryptographic random string
- `address` (`TEXT`, nullable) — Bound Ethereum address
- `created_at` (`TIMESTAMPTZ`, default: `now()`)
- `expires_at` (`TIMESTAMPTZ`, default: `now() + interval '10 minutes'`)
- `used_at` (`TIMESTAMPTZ`, nullable)

### Table 15: `biometric_verifications` & `biometric_challenges`
Zero-raw-data biometric liveness verification records and challenge nonces.
- **`biometric_challenges`**:
  - `id` (`UUID`, PK, default: `gen_random_uuid()`)
  - `nonce` (`TEXT`, UNIQUE, not null)
  - `user_id` (`UUID`, FK -> `auth.users.id`, nullable)
  - `expires_at` (`TIMESTAMPTZ`, default: `now() + interval '5 minutes'`)
  - `used_at` (`TIMESTAMPTZ`, nullable)
- **`biometric_verifications`**:
  - `id` (`UUID`, PK, default: `gen_random_uuid()`)
  - `user_id` (`UUID`, not null, FK -> `auth.users.id` on delete CASCADE)
  - `liveness_score` (`NUMERIC(5,2)`, check 0-100)
  - `face_match_score` (`NUMERIC(5,2)`, check 0-100)
  - `passed` (`BOOLEAN`, not null)
  - `subject_hash` (`TEXT`, not null) — One-way SHA-256 hash of subject identifier
  - `proof_hash` (`TEXT`, UNIQUE, not null) — Cryptographic commitment hash
  - `anchored` (`BOOLEAN`, default: `false`)
  - `anchor_tx_hash` (`TEXT`, nullable)
  - `provider` (`TEXT`, default: `'mock'`)
  - `created_at` (`TIMESTAMPTZ`, default: `now()`)

---

## 7. Row-Level Security (RLS) Policy Architecture

All tables in BLOCKID enforce strict PostgreSQL Row-Level Security. Following security hardening in `20260919000001_remove_role_escalation.sql` and `20260919000002_secure_share_tokens.sql`, privilege escalation and unauthenticated data exposure are completely mitigated.

### Key Policy Rules
1. **`user_roles`**: Authenticated users can only `SELECT` their own role. `INSERT`, `UPDATE`, and `DELETE` are restricted exclusively to the `service_role` (invoked via admin Edge Functions). Self-service role escalation is prevented.
2. **`profiles`**: Public `SELECT` allowed for DID resolution and verification. Users can only `UPDATE` their own metadata. `approval_status` can only be updated by users with the `org_admin` role.
3. **`credentials`**: Issuers can view and manage credentials they issued (`issuer_id = auth.uid()`). Holders can view credentials where `holder_id = auth.uid()`. Verifiers can only read credentials through a valid token match via `credential_shares`.
4. **`credential_shares`**: Holders manage their own shares. Anonymous users can only `SELECT` share records if they supply the exact matching unexpired `share_token`.
5. **`audit_logs`**: Users can `SELECT` logs where `user_id = auth.uid()`. Administrators and auditors (`has_role(auth.uid(), 'org_admin')` or `'auditor'`) can read all audit events. Writes are restricted to the platform service role and security definer triggers.
6. **`siwe_nonces` & `biometric_challenges`**: No client policies exist. All operations occur strictly via Edge Functions executing with `service_role` authorization.

---

## 8. Database Stored Procedures, Functions & Triggers

The database employs several optimized PL/pgSQL stored procedures:

1. **`has_role(_user_id UUID, _role app_role) -> BOOLEAN`**:
   Security definer helper checking role assignment in `user_roles`.
2. **`handle_new_user() -> TRIGGER`**:
   Automatically provisions a corresponding `profiles` row (status: `'pending'`) and default role assignment when a new user registers in `auth.users`.
3. **`generate_did(_user_id UUID) -> TEXT`**:
   Deterministically calculates the user's `did:ethr:sepolia` decentralized identifier from their wallet address or user ID.
4. **`auto_expire_credential() -> TRIGGER`**:
   Fires before credential queries to automatically mark status as `'expired'` if `expiration_date < now()`.
5. **`expire_stale_credentials() -> VOID`**:
   Batch maintenance routine callable by `pg_cron` to transition all expired credentials.
6. **`notify_credential_issued() -> TRIGGER`**:
   Automatically inserts a notification into `notifications` and an audit entry into `audit_logs` when a credential is created.
7. **`notify_credential_status_change() -> TRIGGER`**:
   Emits a real-time event and audit entry when a credential is revoked.
8. **`prune_siwe_nonces() -> VOID`**:
   Deletes expired or used nonces older than 24 hours from `siwe_nonces`.
9. **`prune_expired_biometric_challenges() -> VOID`**:
   Housekeeping routine deleting biometric challenges older than 1 hour.

---

## 9. Deno Edge Functions API Specification (14 Microservices)

BLOCKID provides 14 modular serverless microservices deployed via Supabase Deno Edge Functions:

```text
supabase/functions/
├── _shared/                   ── Shared utilities (cors, canonicalJson, crypto, ipfs, siwe)
├── admin-users/               ── Administrative user management & approvals
├── ai-verify-credential/      ── Google Gemini multi-dimensional verification assistant
├── anchor-credential/         ── Relays client-signed anchor transaction to Sepolia RPC
├── anchor-credential-server/  ── Server-side gasless wallet anchoring service
├── biometric-verify/          ── Evaluates liveness challenges & biometric proofs
├── fetch-from-ipfs/           ── Fetches & caches JSON-LD schemas from IPFS gateways
├── issue-credential/          ── Canonicalizes, hashes, signs & records Verifiable Credentials
├── manage-schemas/            ── CRUD operations for JSON-LD credential schemas
├── oid4vci/                   ── OpenID for Verifiable Credential Issuance endpoint
├── oid4vp/                    ── OpenID for Verifiable Presentations endpoint
├── pin-to-ipfs/               ── Pins schemas to Pinata IPFS & updates DB CIDs
├── resolve-did/               ── W3C DID Document resolver (did:ethr & did:key)
├── siwe-auth/                 ── Generates nonces & verifies EIP-4361 wallet logins
└── verify-credential/         ── Validates cryptographic signatures & on-chain anchor
```

### Microservices Specification Table

| Microservice | Method | Route | Auth | Payload / Parameters | Response |
|---|---|---|---|---|---|
| **`issue-credential`** | `POST` | `/functions/v1/issue-credential` | JWT (`issuer`) | `{ schema_id, holder_did, subject_data, expiration_date }` | Complete signed W3C VC, SHA-256 hash, DB record ID |
| **`verify-credential`** | `POST` | `/functions/v1/verify-credential` | Public / Verifier | `{ credential, verify_on_chain: true }` | `{ valid, signature_valid, anchor: { status, block, tx } }` |
| **`ai-verify-credential`**| `POST` | `/functions/v1/ai-verify-credential`| JWT | `{ credential_data, verification_context }` | `{ risk_score, dimensions: [8], findings: [], recommendations }` |
| **`anchor-credential`** | `POST` | `/functions/v1/anchor-credential` | JWT (`issuer`) | `{ credential_id, tx_hash, block_number }` | Updated credential status (`status: 'active'`) |
| **`anchor-credential-server`** | `POST` | `/functions/v1/anchor-credential-server`| JWT (`issuer`)| `{ credential_id, credential_hash }` | Server wallet tx hash, block number, gas used |
| **`manage-schemas`** | `GET / POST` | `/functions/v1/manage-schemas` | JWT (`issuer`) | GET: `?id=...`; POST: `{ name, version, schema_json }` | Created or retrieved schema object |
| **`pin-to-ipfs`** | `POST` | `/functions/v1/pin-to-ipfs` | JWT (`issuer`) | `{ schema_id, schema_json }` | `{ ipfs_cid, gateway_url }` |
| **`fetch-from-ipfs`** | `GET` | `/functions/v1/fetch-from-ipfs?cid=...` | Public | Query param `cid` | Cached JSON-LD schema document |
| **`resolve-did`** | `GET` | `/functions/v1/resolve-did?did=...` | Public | Query param `did` (`did:ethr` / `did:key`) | W3C DID Document with verificationMethods |
| **`oid4vci`** | `GET / POST` | `/functions/v1/oid4vci` | Public / Token | Credential Offer request or Access Token exchange | W3C Verifiable Credential response |
| **`oid4vp`** | `GET / POST` | `/functions/v1/oid4vp` | Public / Token | Presentation definition query or VP submission | Presentation verification result |
| **`siwe-auth`** | `GET / POST` | `/functions/v1/siwe-auth` | Public | GET: `?address=...` (nonce); POST: `{ message, signature }` | Supabase auth token, user profile, role |
| **`biometric-verify`** | `POST` | `/functions/v1/biometric-verify` | JWT (`holder`) | `{ nonce, liveness_frames, challenge_type }` | `{ passed, liveness_score, proof_hash }` |
| **`admin-users`** | `GET / POST` | `/functions/v1/admin-users` | JWT (`org_admin`)| POST: `{ user_id, action: 'approve' \| 'reject' }` | Updated profile status |

---

## 10. Smart Contract Architecture & Verified Deployments (9 Contracts)

BLOCKID smart contracts are implemented in Solidity 0.8.19 and deployed to the **Ethereum Sepolia Testnet (Chain ID: 11155111)**.

### Verified Contract Deployments Table

| Contract Name | Sepolia Contract Address | Explorer Link | Standard / Purpose |
|---|---|---|---|
| **`CredentialRegistry`** | [`0x1FE3Dce86E02C28b7B5c1CaCf83127874fb5D778`](https://sepolia.etherscan.io/address/0x1FE3Dce86E02C28b7B5c1CaCf83127874fb5D778) | [Etherscan](https://sepolia.etherscan.io/address/0x1FE3Dce86E02C28b7B5c1CaCf83127874fb5D778) | Core SHA-256 Anchor & Revocation Registry (v2) |
| **`SoulboundCredential`**| [`0xC5B743959e651C2cbb60422B3bC44fFD465B46d8`](https://sepolia.etherscan.io/address/0xC5B743959e651C2cbb60422B3bC44fFD465B46d8) | [Etherscan](https://sepolia.etherscan.io/address/0xC5B743959e651C2cbb60422B3bC44fFD465B46d8) | EIP-5192 Non-Transferable Soulbound Token Badges |
| **`SmartWalletRegistry`**| [`0xD7a4375C9bA97B6b5E767AfDbCa48c5d99B68196`](https://sepolia.etherscan.io/address/0xD7a4375C9bA97B6b5E767AfDbCa48c5d99B68196) | [Etherscan](https://sepolia.etherscan.io/address/0xD7a4375C9bA97B6b5E767AfDbCa48c5d99B68196) | ERC-4337 Smart Account Registry & Social Recovery |
| **`ERC-4337 EntryPoint`**| `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` | [Etherscan](https://sepolia.etherscan.io/address/0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789) | Canonical ERC-4337 EntryPoint v0.6 |
| **`Deployer Admin`** | `0x2887Cc5D846ED52314ed7344fa97Dfd358c86238` | [Etherscan](https://sepolia.etherscan.io/address/0x2887Cc5D846ED52314ed7344fa97Dfd358c86238) | Platform Deployer and Multi-Sig Admin |

---

### Detailed Contract Summaries

#### 1. `CredentialRegistry.sol`
The primary on-chain trust anchor. Stores 32-byte cryptographic hashes of canonical credential payloads.
- `anchorCredential(bytes32 hash)`: Anchors a single credential hash.
- `anchorCredentialBatch(bytes32[] calldata hashes)`: Gas-optimized batch anchoring (up to 100 hashes per transaction).
- `revokeCredential(bytes32 hash)`: Irreversibly marks a credential hash as revoked (only callable by original issuer).
- `getCredentialStatus(bytes32 hash)`: Returns `(anchored, revoked, issuer, blockAnchored, anchoredAt, revokedAt)`.
- `isValid(bytes32 hash)`: Returns `true` if anchored and not revoked.

#### 2. `SoulboundCredential.sol`
Implements the **EIP-5192 Minimal Soulbound NFT** standard.
- Tokens cannot be transferred (`transferFrom` and `safeTransferFrom` revert with `ErrSoulboundLocked`).
- `locked(uint256 tokenId)` permanently returns `true`.
- Emits `Locked(tokenId)` event on minting.
- Synchronized with `CredentialRegistry`: if the credential is revoked on the registry, `isCredentialValid(tokenId)` reflects revocation on-chain.

#### 3. `SmartWalletRegistry.sol`
ERC-4337 Account Abstraction factory and guardian-based social recovery registry.
- Maps EOA owners to their deterministic `SimpleAccount` smart wallets.
- Supports guardian nomination, voting thresholds, and timelocked ownership recovery.

#### 4. `SimpleAccount.sol`
The ERC-4337 smart wallet implementation.
- Executes transactions via `execute` and `executeBatch`.
- Supports **session keys**: scoped sub-keys with expiration timestamps and target contract constraints (e.g. key can only call `anchorCredential`).
- Verifies UserOperations submitted by ERC-4337 bundlers.

#### 5. `ZKPVerifier.sol`
Universal Groth16 zero-knowledge proof verification contract.
- Utilizes the EVM BN254 elliptic curve pairing precompile at address `0x08`.
- Verifies proof tuples `(A, B, C)` against public signals with ~215,000 gas.
- Stores spent nullifiers to prevent proof replay attacks.

#### 6. `AgeVerifier.sol`, `AttributeRangeVerifier.sol`, `IssuerMembershipVerifier.sol`
Specialized, precompiled verifier contracts generated from the Circom circuits for zero-overhead direct on-chain verification.

#### 7. `BiometricProofAnchor.sol`
Anchors cryptographic biometric commitments and liveness assertions on-chain without exposing biometric data or raw images.

---

## 11. Zero-Knowledge Proofs Architecture (Circom 2.0 & Groth16)

BLOCKID integrates client-side zero-knowledge proofs (zk-SNARKs) to provide mathematical privacy guarantees.

```text
Holder Browser (WASM Witness + snarkjs Groth16) ──► zk-SNARK Proof (π_A, π_B, π_C, publicSignals)
                                                                 │
                                ┌────────────────────────────────┴────────────────────────────────┐
                                ▼                                                                 ▼
                 Local Verifier (In-Browser)                                         On-Chain Verifier
               snarkjs.groth16.verify (<15ms)                                ZKPVerifier.sol (EVM Precompile 0x08)
```

### The 3 Circom 2.0 Circuits

| Circuit File | Public Signals | Private Signals | Proving Time | Constraints | Purpose |
|---|---|---|---|---|---|
| **`age-verify.circom`** | `currentYear`, `currentMonth`, `currentDay`, `ageThreshold` | `birthYear`, `birthMonth`, `birthDay`, `nullifier` | ~120 ms | 128 | Proves holder is ≥ X years old without revealing birthdate |
| **`attribute-range.circom`** | `minValue`, `maxValue` | `actualValue`, `nullifier` | ~145 ms | 134 | Proves numeric attribute ∈ [min, max] (e.g. salary, GPA) |
| **`issuer-membership.circom`** | `expectedRoot`, `nullifierHash` | `issuerId`, `merklePath[]`, `pathIndices[]`, `secret` | ~210 ms | 286 | Proves issuer is in accredited Merkle tree without revealing which issuer |

### Circuit Artifacts
Precompiled WebAssembly proving artifacts are located in [`public/zkp/`](file:///c:/Users/M%20S/Desktop/block-id/public/zkp/):
- `<circuit>.wasm`: Browser witness calculation engine
- `<circuit>_final.zkey`: Groth16 proving key
- `verification_key.json`: Cryptographic verification key

---

## 12. ERC-4337 Account Abstraction & Session Key Architecture

Implemented in [`src/lib/accountAbstraction.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/lib/accountAbstraction.ts) and [`src/services/blockchain/smartWallet.service.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/services/blockchain/smartWallet.service.ts):

### 1. Counterfactual Smart Wallet Generation
Smart accounts are generated deterministically using `CREATE2` via `SmartWalletRegistry.sol`. A holder receives an immutable smart wallet address before deploying it on-chain.

### 2. Scoped Session Keys
Holders can delegate specific actions to ephemeral session keys stored in the browser:
```typescript
interface SessionKey {
  keyAddress: string;
  validUntil: number;       // Unix timestamp
  validAfter: number;       // Unix timestamp
  targetContract: string;   // e.g. CredentialRegistry address only
  maxGasLimit: bigint;
}
```
This enables one-click credential anchoring and presentation without prompting MetaMask on every transaction.

### 3. Paymaster Gas Sponsorship
UserOperations are constructed and formatted for standard ERC-4337 bundlers (Pimlico / Biconomy). Paymaster sponsorship allows institutions to sponsor transaction gas fees for students or employees.

---

## 13. EIP-5192 Soulbound Credential Tokens (SBT)

Implemented via `contracts/SoulboundCredential.sol` and [`src/services/blockchain/sbt.service.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/services/blockchain/sbt.service.ts):

1. **Minting**: When an issuer issues a degree or credential, they can simultaneously mint an EIP-5192 Soulbound Token directly to the holder's Ethereum address.
2. **Locking**: The smart contract locks the token permanently, preventing transfers, sales, or theft.
3. **On-Chain Metadata**: Includes token URI pointing to the decentralized IPFS metadata schema.
4. **Revocation Sync**: If an institution revokes the credential, the SBT token reflects the revoked state on-chain, automatically invalidating Web3 dApp integrations relying on the token.
5. **Holder Gallery**: The holder wallet displays all earned SBT badges with cryptographic verification status and Etherscan links.

---

## 14. Sign-In With Ethereum (SIWE - EIP-4361)

Implemented in [`src/lib/siwe.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/lib/siwe.ts) and [`src/services/auth/siwe.service.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/services/auth/siwe.service.ts):

### Challenge & Authentication Flow
1. **Nonce Request**: Client requests a cryptographically secure, time-bounded nonce from `siwe-auth` Edge Function. The nonce is saved in `siwe_nonces` table with a 10-minute expiry.
2. **EIP-4361 Message Generation**: Client generates a standard SIWE message:
   ```text
   blockid.id wants you to sign in with your Ethereum account:
   0x2887Cc5D846ED52314ed7344fa97Dfd358c86238

   Sign in with Ethereum to the BLOCKID platform.

   URI: https://blockid.id
   Version: 1
   Chain ID: 11155111
   Nonce: aB3d9F1xZ
   Issued At: 2026-09-24T09:00:00Z
   ```
3. **Signature**: User signs the challenge using MetaMask or Web3 wallet.
4. **Verification**: `siwe-auth` verifies the secp256k1 signature against the address, invalidates the nonce (setting `used_at = now()`), and returns an authenticated Supabase session.

---

## 15. Multi-Detector AI Anomaly & Trust Radar Engine

Implemented in [`src/lib/ml/anomaly.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/lib/ml/anomaly.ts) and [`src/lib/ml/trustScore.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/lib/ml/trustScore.ts):

```text
Incoming Verification Request
             │
   ┌─────────┼───────────────────────┬───────────────────────┬────────────────────────┐
   ▼         ▼                       ▼                       ▼                        ▼
[Burst]  [Failure Streak]     [Geo Velocity Jump]      [Off-Hours]           [Latency Spike]
(Sliding  (Brute-force /      (Haversine distance vs   (Circadian cycle      (Tampering /
 Window)   enumeration)        elapsed time >800km/h)   distribution)         replay anomaly)
   │         │                       │                       │                        │
   └─────────┴───────────────────────┼───────────────────────┴────────────────────────┘
                                     ▼
                    [5-Factor Anomaly Penalty (0 to 1)]
                                     │
                                     ▼
                    [8-Factor Trust Score Radar (0-100)]
```

### The 5 Real-Time Statistical Detectors
1. **Burst / Velocity Detector**: Detects automated scraping or presentation flooding using a sliding time window.
2. **Failure Streak Detector**: Flags credential enumeration attacks or consecutive failed signature checks from an origin.
3. **Geographic Velocity Jump**: Evaluates physical travel feasibility via the Haversine formula; flags presentations occurring faster than supersonic travel velocities (>800 km/h).
4. **Off-Hours Anomaly Detector**: Scores verifications occurring outside normal operational timezone distributions.
5. **Latency Spike Detector**: Flags anomalous network or proving latency that indicates man-in-the-middle tampering or replay attacks.

### The 8-Factor Trust Radar Score (0 – 100)
- **Signature Validity (20 pts)**: Cryptographic integrity of issuer signature.
- **Blockchain Anchor Status (20 pts)**: Verification against `CredentialRegistry.sol`.
- **Issuer Accreditation (15 pts)**: Status in `trusted_issuers` table.
- **Schema Conformity (10 pts)**: Adherence to JSON-LD specification.
- **Anomaly Penalty (-20 pts max)**: Real-time penalty derived from the 5 statistical detectors.
- **Biometric Assurance (10 pts)**: Presence of verified WebAuthn/liveness proof.
- **Credential Freshness (10 pts)**: Time decay curve based on issuance and expiration dates.
- **Consent Compliance (5 pts)**: Active user consent record in `consent_records`.

---

## 16. WebAuthn Biometric & Interactive Liveness Pipeline

Implemented in [`src/lib/biometrics/liveness.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/lib/biometrics/liveness.ts), [`src/services/biometrics/biometric.service.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/services/biometrics/biometric.service.ts), and `contracts/BiometricProofAnchor.sol`:

1. **Hardware Passkeys**: Holders register WebAuthn credentials (TouchID, FaceID, Windows Hello) via `webauthnService.ts` for non-custodial wallet unlock.
2. **Interactive Liveness Challenge**: During high-assurance verification, the browser initiates an interactive challenge (eye blinks, randomized head rotation).
3. **Zero Raw Image Storage**: Raw facial images are never stored or transmitted. The client computes an ephemeral commitment hash `proof_hash = SHA-256(challengeNonce + facialEmbeddings)`.
4. **On-Chain Commitment**: The proof hash is anchored to `BiometricProofAnchor.sol`, providing verifiable liveness without exposing biometric identifiers.

---

## 17. Decentralized Storage & IPFS Pinning

Implemented in [`src/lib/ipfs.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/lib/ipfs.ts), `supabase/functions/pin-to-ipfs/`, and `supabase/functions/fetch-from-ipfs/`:

1. **Schema Pinning**: When an issuer creates a schema, its canonical JSON-LD representation is pinned to IPFS via Pinata.
2. **Content Addressing**: The resulting CIDv0/CIDv1 is stored in `credential_schemas.ipfs_cid`.
3. **Auto-Pinning**: On first issuance, `issue-credential` ensures the schema is pinned to IPFS.
4. **Resilience**: Verifiers can fetch schemas directly from IPFS gateways if the central database is offline.

---

## 18. Dynamic Visual Certificates & PDF Export

Implemented in `src/components/issuer/CertificateRenderer.tsx` and [`src/lib/generateCertificatePdf.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/lib/generateCertificatePdf.ts):

- **SVG Certificate Engine**: Renders high-resolution certificates with customizable institutional branding, dynamic seal vectors, and gold/neon borders.
- **Anti-Counterfeit QR Code**: Generates an encrypted QR code directly into the certificate containing the credential ID, verification URL, and SHA-256 hash.
- **Dark-Mode PDF Generator**: Exports vector-quality PDFs via `jsPDF` formatted for print and digital archival.

---

## 19. OpenID4VC Protocol Suite (OID4VCI & OID4VP)

BLOCKID implements the European digital wallet standards:
- **OID4VCI (Issuance)**: Issuers generate QR credential offers (`openid-credential-offer://`). The holder scans the QR code to fetch the credential directly into their wallet.
- **OID4VP (Presentation)**: Verifiers configure presentation requirements (e.g. proof of degree). The holder reviews requested fields and responds with a signed Verifiable Presentation.

---

## 20. In-App Blockchain Explorer & Audit Trail

- **Blockchain Explorer (`/explorer`)**: Real-time explorer querying `CredentialRegistry.sol` directly via Sepolia RPC. Allows searching by credential hash, transaction hash, or issuer address.
- **Platform Audit Trail (`/audit`)**: Tamper-evident operational log tracking all issuances, revocations, schema creations, and verification events.

---

## 21. Trusted Issuer Registry & Institutional Governance

Located in `/admin`:
- Administrators accredit institutional issuers (universities, government agencies).
- Manages institutional public keys, accreditation levels (`Tier 1 - Accredited University`, `Tier 2 - Enterprise Employer`), and operational status (`trusted`, `suspended`, `revoked`).

---

## 22. Credential Sharing & Selective Disclosure

Located in `/holder/present`:
- **Cryptographic Masking**: Holders choose specific fields to share (e.g. `degree = "B.S. Computer Science"` while hiding `gpa = 3.9` and `birthDate`).
- **Time-Decayed Links**: Share links expire automatically after 1 hour, 24 hours, 7 days, or 30 days.
- **Public Viewer (`/shared/:token`)**: Verifiers view the selectively disclosed fields alongside the cryptographic anchor hash.

---

## 23. Privacy & GDPR Compliance (Articles 17 & 20)

Integrated in `PrivacyCenter.tsx`:
- **GDPR Article 20 (Data Portability)**: Export all held credentials and wallet keys as standard JSON-LD files with a single click.
- **GDPR Article 17 (Right to Erasure)**: Submit formal data deletion requests. Database records are deleted while on-chain anchor hashes remain irreversibly anonymized (hashes without off-chain data cannot be reversed).

---

## 24. Progressive Web App (PWA) & Offline Caching

Configured via `vite-plugin-pwa`:
- Installable on desktop and mobile devices.
- Caches UI assets, font files, and held credentials locally using IndexedDB and CacheStorage for offline wallet access.

---

## 25. Native Mobile Application (React Native / Expo)

Located in the [`mobile/`](file:///c:/Users/M%20S/Desktop/block-id/mobile/) directory:
- Built with React Native and Expo SDK 52.
- Shares authentication, database schema, and verification logic with the web portal.
- Integrates `expo-secure-store` for hardware-backed key storage (iOS Keychain and Android Keystore).
- Screens: `LoginScreen.tsx`, `WalletScreen.tsx`, and `CredentialCard.tsx`.

---

## 26. Testing, Quality Assurance & Benchmarks (416 Tests across 20 Suites)

The platform enforces 100% pass rates across **416 automated tests** spanning 20 suites.

### Complete Test Suites Table

| Test Suite | Test Count | Scope |
|---|:---:|---|
| [`src/lib/zkp.test.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/lib/zkp.test.ts) | 79 | Circom circuit witness parsing, Groth16 proof generation, nullifier hashing, signal verification |
| [`src/services/ai/credential-ai.service.test.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/services/ai/credential-ai.service.test.ts) | 39 | Multi-dimensional AI risk calculation, Gemini prompt synthesis, heuristic fallbacks |
| [`src/lib/siwe.test.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/lib/siwe.test.ts) | 33 | EIP-4361 message parsing, nonce validation, expiration, address case-sensitivity |
| [`src/lib/ml/anomaly.test.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/lib/ml/anomaly.test.ts) | 30 | 5-detector statistical engine: burst velocity, failure streaks, Haversine geo-hops, off-hours, latency |
| [`src/lib/crypto.test.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/lib/crypto.test.ts) | 27 | Canonical JSON RFC-8785 normalization, deterministic SHA-256 fingerprinting |
| [`src/lib/ipfs.test.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/lib/ipfs.test.ts) | 24 | CIDv0/CIDv1 validation, gateway URL builders, JSON-LD schema pinning payload builder |
| [`src/lib/permissions.test.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/lib/permissions.test.ts) | 20 | RBAC matrix enforcement across all 5 roles (`issuer`, `holder`, `verifier`, `org_admin`, `auditor`) |
| [`src/lib/zkp.integration.test.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/lib/zkp.integration.test.ts) | 19 | End-to-end circuit execution with real `.wasm` and `.zkey` files |
| [`test/CredentialRegistry.test.js`](file:///c:/Users/M%20S/Desktop/block-id/test/CredentialRegistry.test.js) | 18 | Solidity smart contract unit tests: single/batch anchor, revocation, status checks |
| [`src/lib/biometrics/liveness.test.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/lib/biometrics/liveness.test.ts) | 16 | Interactive liveness challenge generation, frame variance analysis, blink scoring |
| [`src/services/blockchain/sbt.service.test.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/services/blockchain/sbt.service.test.ts) | 16 | EIP-5192 Soulbound token minting, lock state verification, revocation synchronization |
| [`src/lib/accountAbstraction.test.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/lib/accountAbstraction.test.ts) | 13 | Smart account address derivation, UserOperation packing, session key constraints |
| [`src/lib/fileValidation.test.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/lib/fileValidation.test.ts) | 13 | File upload validation: size limits, MIME type guards, malicious payload rejection |
| [`src/lib/generateCertificatePdf.test.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/lib/generateCertificatePdf.test.ts) | 12 | jsPDF vector layout geometry, QR code embedding, dark-mode color styling |
| [`src/lib/ml/trustScore.test.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/lib/ml/trustScore.test.ts) | 11 | 8-factor Trust Radar calculation, boundary conditions, weighting verification |
| [`src/services/auth/siwe.service.test.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/services/auth/siwe.service.test.ts) | 11 | End-to-end SIWE authentication flow, nonce generation, session exchange |
| [`src/services/blockchain/biometricAnchor.service.test.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/services/blockchain/biometricAnchor.service.test.ts) | 11 | On-chain biometric commitment anchoring and nullifier verification |
| [`src/services/biometrics/biometric.service.test.ts`](file:///c:/Users/M%20S/Desktop/block-id/src/services/biometrics/biometric.service.test.ts) | 10 | Biometric challenge consumption, proof hash generation, score thresholding |
| [`src/components/ProtectedRoute.test.tsx`](file:///c:/Users/M%20S/Desktop/block-id/src/components/ProtectedRoute.test.tsx) | 9 | Route authentication guards, pending approval redirects, rejected screen routing |
| [`src/components/layout/PortalLayout.test.tsx`](file:///c:/Users/M%20S/Desktop/block-id/src/components/layout/PortalLayout.test.tsx) | 5 | Navigation bar rendering, active portal tab highlighting, responsive sidebar |
| **TOTAL** | **416** | **20 Suites Passing (100% Success Rate)** |

### Performance Benchmarks
- **ZKP Proving Latency**: ~120ms (Age Verify), ~145ms (Attribute Range), ~210ms (Issuer Membership).
- **ZKP On-Chain Verification**: ~215,000 gas via EVM precompile `0x08`.
- **Batch Anchoring**: ~46,000 gas per credential when anchored in batches of 50.
- **Trust Radar Calculation**: <5ms per verification event.

---

## 27. Multi-Phase Roadmap (Phases 0 – 8 Complete)

All phases from the Master Implementation Plan have been engineered, tested, and integrated:

| Phase | Subsystem | Engineering Delivery | Status |
|---|---|---|:---:|
| **Phase 0** | **Testing & CI/CD Infrastructure** | 416 automated tests across 20 suites, GitHub Actions workflow | ✅ Complete |
| **Phase 1** | **Zero-Knowledge Proofs (ZK-SNARKs)** | Circom circuits, browser WASM proving (<250ms), EVM pairing precompile verifier | ✅ Complete |
| **Phase 2** | **Account Abstraction (ERC-4337)** | `SimpleAccount.sol`, `SmartWalletRegistry.sol`, session keys, UserOp builder | ✅ Complete |
| **Phase 3** | **Decentralized Storage & IPFS** | Pinata IPFS pinning, CID schema resolution, auto-pin on issuance | ✅ Complete |
| **Phase 4** | **Universal Interoperability & SIWE** | EIP-4361 Web3 sign-in, replay-resistant nonces, OID4VCI & OID4VP | ✅ Complete |
| **Phase 5** | **Native Mobile Client** | React Native Expo application in `mobile/`, `expo-secure-store` key storage | ✅ Complete |
| **Phase 6** | **Advanced AI & Anomaly Engine** | 5 real-time statistical anomaly detectors, 8-factor Trust Radar, Gemini assistant | ✅ Complete |
| **Phase 7** | **Visual Credentials & SBTs** | EIP-5192 Soulbound Tokens deployed on Sepolia, SVG certificate renderer, dark PDF | ✅ Complete |
| **Phase 8** | **Biometric Verification Pipeline** | WebAuthn passkeys, interactive liveness detection, on-chain commitment anchor | ✅ Complete |

---

## 28. Developer Setup & Deployment Guide

### Prerequisites
- Node.js >= 20.x
- npm >= 10.x
- MetaMask browser extension (configured for Sepolia testnet)

### 1. Installation
```bash
# Clone the repository
git clone https://github.com/SINISTERgg/block-id.git
cd block-id

# Install dependencies
npm install

# Install mobile dependencies (optional)
cd mobile && npm install && cd ..
```

### 2. Environment Configuration
Create `.env` in the project root:
```env
# Supabase Configuration
VITE_SUPABASE_PROJECT_ID="your-project-id"
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="your-anon-key"

# Blockchain Configuration (Ethereum Sepolia)
SEPOLIA_RPC_URL="https://ethereum-sepolia-rpc.publicnode.com"
DEPLOYER_PRIVATE_KEY="your-private-key"
ETHERSCAN_API_KEY="your-etherscan-key"

# Deployed Contract Addresses
VITE_CREDENTIAL_REGISTRY_ADDRESS="0x1FE3Dce86E02C28b7B5c1CaCf83127874fb5D778"
VITE_SOULBOUND_CREDENTIAL_ADDRESS="0xC5B743959e651C2cbb60422B3bC44fFD465B46d8"
VITE_SMART_WALLET_REGISTRY_ADDRESS="0xD7a4375C9bA97B6b5E767AfDbCa48c5d99B68196"

# ERC-4337 Account Abstraction
VITE_CHAIN_ID=11155111
VITE_BUNDLER_URL="https://api.pimlico.io/v2/11155111/rpc?apikey=your-api-key"

# IPFS Configuration
VITE_IPFS_GATEWAY="https://gateway.pinata.cloud/ipfs/"

# AI Verification (Optional)
GEMINI_API_KEY="your-gemini-api-key"
```

### 3. Execution Commands
```bash
# Start local web development server
npm run dev

# Run full Vitest test suite (416 tests)
npm test

# Run smart contract integration tests
npm run test:contract

# Compile Solidity smart contracts via Hardhat
npm run compile

# Build ZKP Circom circuits & generate keys
npm run build:circuits

# Deploy contracts to Ethereum Sepolia
npm run deploy:sepolia

# Run gas and latency benchmarks
npm run benchmark:gas
npm run benchmark:latency

# Evaluate AI anomaly engine on synthetic datasets
npm run eval:anomaly

# Launch Expo mobile app
cd mobile && npx expo start
```
