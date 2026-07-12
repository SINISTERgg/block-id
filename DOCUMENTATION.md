# DecentraID — Comprehensive Project Documentation

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Architecture](#3-architecture)
4. [Application Routes & Navigation](#4-application-routes--navigation)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [Database Schema](#6-database-schema)
7. [Row-Level Security (RLS) Policies](#7-row-level-security-rls-policies)
8. [Database Functions & Triggers](#8-database-functions--triggers)
9. [Edge Functions (Backend API)](#9-edge-functions-backend-api)
10. [Portal 1: Issuer Dashboard](#10-portal-1-issuer-dashboard)
11. [Portal 2: Holder Wallet](#11-portal-2-holder-wallet)
12. [Portal 3: Verifier Dashboard](#12-portal-3-verifier-dashboard)
13. [Credential Sharing & Selective Disclosure](#13-credential-sharing--selective-disclosure)
14. [Blockchain Explorer](#14-blockchain-explorer)
15. [Trust Infrastructure](#15-trust-infrastructure)
16. [OpenID4VC (OID4VCI / OID4VP)](#16-openid4vc-oid4vci--oid4vp)
17. [Privacy & GDPR Compliance](#17-privacy--gdpr-compliance)
18. [Multi-Factor Verification](#18-multi-factor-verification)
19. [Credential Export & Interoperability](#19-credential-export--interoperability)
20. [Notification System](#20-notification-system)
21. [AI Integration](#21-ai-integration)
22. [Audit Trail](#22-audit-trail)
23. [PDF Certificate Generation](#23-pdf-certificate-generation)
24. [PWA & Offline Support](#24-pwa--offline-support)
25. [Design System](#25-design-system)
26. [Component Inventory](#26-component-inventory)
27. [Security Considerations](#27-security-considerations)
28. [Data Flow Diagrams](#28-data-flow-diagrams)

---

## 1. Project Overview

**DecentraID** is a decentralized identity platform for the education sector implementing W3C Verifiable Credentials, Decentralized Identifiers (DIDs), and OpenID4VC protocols. It enables educational institutions to issue tamper-proof digital credentials, students to store and share them with selective disclosure, and organizations to verify authenticity — including cross-wallet exchange with external identity wallets.

### Key Capabilities

| Category             | Features                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| **Standards**        | W3C Verifiable Credentials, W3C DID Documents, OpenID4VCI, OpenID4VP, StatusList2021             |
| **Cryptography**     | SHA-256 hash chain, wallet-signed credentials (EcdsaSecp256k1), WebAuthn biometrics              |
| **Privacy**          | Selective disclosure, GDPR consent management, data export (Art. 20), right to erasure (Art. 17) |
| **Trust**            | Trusted Issuer Registry, DID resolution, multi-factor verification                               |
| **Interoperability** | JSON-LD export, JWT-VC export, OID4VCI credential offers, OID4VP presentation requests           |
| **Intelligence**     | AI-powered verification risk assessment (Google Gemini)                                          |
| **Infrastructure**   | Polygon blockchain anchoring, real-time notifications, PWA offline support                       |

### User Roles

| Role         | Description                                                                                        | Portal      |
| ------------ | -------------------------------------------------------------------------------------------------- | ----------- |
| **Issuer**   | Educational institutions that create schemas, issue credentials, and manage trust registry entries | `/issuer`   |
| **Holder**   | Students/individuals who receive, store, selectively share, and export credentials                 | `/holder`   |
| **Verifier** | Organizations that verify credentials via VP, OID4VP, or DID resolution                            | `/verifier` |

---

## 2. Technology Stack

### Frontend

| Technology               | Purpose                                             |
| ------------------------ | --------------------------------------------------- |
| **React 18**             | UI framework                                        |
| **TypeScript**           | Type safety                                         |
| **Vite**                 | Build tool with PWA plugin                          |
| **Tailwind CSS**         | Utility-first styling with design tokens            |
| **shadcn/ui**            | Component library (Radix UI primitives)             |
| **React Router v6**      | Client-side routing                                 |
| **TanStack React Query** | Server state management                             |
| **Recharts**             | Charts and analytics visualization                  |
| **qrcode.react**         | QR code generation (credential offers, VP requests) |
| **jsPDF**                | PDF certificate generation                          |
| **Lucide React**         | Icon library                                        |
| **vite-plugin-pwa**      | Service worker & offline caching                    |

### Backend (Lovable Cloud)

| Technology             | Purpose                                                       |
| ---------------------- | ------------------------------------------------------------- |
| **PostgreSQL + RLS**   | Database with row-level security (12 tables, 30+ policies)    |
| **Authentication**     | Email/password with email verification                        |
| **Edge Functions**     | 5 Deno serverless functions for credential lifecycle + OID4VC |
| **Realtime**           | WebSocket subscriptions for live notifications                |
| **Lovable AI Gateway** | AI-powered credential analysis (Gemini)                       |

### Fonts

- **Display**: Space Grotesk (headings, titles, emphasis)
- **Body**: Inter (paragraphs, form labels, general text)

---

## 3. Architecture

<div style="font-family: sans-serif; background: #1e1e24; color: #fff; padding: 20px; border-radius: 8px;">
  <h3 style="color: #4ade80; margin-top: 0;">Frontend (React SPA + PWA)</h3>
  <div style="display: flex; gap: 10px; margin-bottom: 20px;">
    <div style="background: #2d2d3a; padding: 10px; border-radius: 4px; flex: 1; text-align: center;">Landing</div>
    <div style="background: #2d2d3a; padding: 10px; border-radius: 4px; flex: 1; text-align: center;">Auth/Reset</div>
    <div style="background: #2d2d3a; padding: 10px; border-radius: 4px; flex: 1; text-align: center;">Shared View</div>
    <div style="background: #2d2d3a; padding: 10px; border-radius: 4px; flex: 1; text-align: center;">Explorer</div>
  </div>
  <div style="display: flex; gap: 10px;">
    <div style="background: #2d2d3a; padding: 15px; border-radius: 4px; flex: 1;">
      <h4 style="margin-top: 0; color: #60a5fa;">Issuer Portal</h4>
      <ul style="padding-left: 20px; font-size: 14px; margin-bottom: 0;">
        <li>Schemas (v)</li>
        <li>Issue (sign)</li>
        <li>Batch CSV</li>
        <li>OID4VCI Offer</li>
        <li>Revoke</li>
        <li>Trust Registry</li>
        <li>Audit Trail</li>
        <li>Analytics</li>
      </ul>
    </div>
    <div style="background: #2d2d3a; padding: 15px; border-radius: 4px; flex: 1;">
      <h4 style="margin-top: 0; color: #a78bfa;">Holder Wallet</h4>
      <ul style="padding-left: 20px; font-size: 14px; margin-bottom: 0;">
        <li>DID Mgmt</li>
        <li>Biometrics</li>
        <li>Selective Disclosure</li>
        <li>Export VC</li>
        <li>MFA Verify</li>
        <li>Privacy/GDPR</li>
        <li>Web3 Wallet</li>
      </ul>
    </div>
    <div style="background: #2d2d3a; padding: 15px; border-radius: 4px; flex: 1;">
      <h4 style="margin-top: 0; color: #f472b6;">Verifier Portal</h4>
      <ul style="padding-left: 20px; font-size: 14px; margin-bottom: 0;">
        <li>Verify VP</li>
        <li>OID4VP Request</li>
        <li>DID Resolver</li>
        <li>Trust Registry</li>
        <li>AI Analysis</li>
        <li>History</li>
        <li>Analytics</li>
      </ul>
    </div>
  </div>
</div>
<div style="text-align: center; color: #888; margin: 10px 0; font-size: 20px;">⬇️ Supabase JS Client ⬇️</div>
<div style="font-family: sans-serif; background: #1e1e24; color: #fff; padding: 20px; border-radius: 8px;">
  <h3 style="color: #fb923c; margin-top: 0;">Backend (Lovable Cloud)</h3>
  <div style="display: flex; gap: 10px; margin-bottom: 20px;">
    <div style="background: #2d2d3a; padding: 15px; border-radius: 4px; flex: 1;">
      <h4 style="margin-top: 0; color: #cbd5e1;">Authentication</h4>
      <p style="font-size: 14px; margin: 0;">(Email/Pass)</p>
    </div>
    <div style="background: #2d2d3a; padding: 15px; border-radius: 4px; flex: 1;">
      <h4 style="margin-top: 0; color: #cbd5e1;">PostgreSQL + RLS</h4>
      <p style="font-size: 14px; margin: 0;">12 tables, 30+ policies</p>
    </div>
  </div>
  <div style="background: #2d2d3a; padding: 15px; border-radius: 4px; margin-bottom: 20px;">
    <h4 style="margin-top: 0; color: #fcd34d;">Edge Functions (Deno)</h4>
    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
      <div style="background: #3f3f4e; padding: 10px; border-radius: 4px; flex: 1; min-width: 200px;">
        <strong style="color: #fff;">issue-credential</strong>
        <ul style="padding-left: 20px; font-size: 14px; margin-bottom: 0; color: #cbd5e1;"><li>W3C VC + proof</li><li>Wallet signing</li><li>Hash chain</li></ul>
      </div>
      <div style="background: #3f3f4e; padding: 10px; border-radius: 4px; flex: 1; min-width: 200px;">
        <strong style="color: #fff;">verify-credential</strong>
        <ul style="padding-left: 20px; font-size: 14px; margin-bottom: 0; color: #cbd5e1;"><li>Hash integrity</li><li>Status check</li><li>AI analysis</li></ul>
      </div>
      <div style="background: #3f3f4e; padding: 10px; border-radius: 4px; flex: 1; min-width: 200px;">
        <strong style="color: #fff;">resolve-did</strong>
        <ul style="padding-left: 20px; font-size: 14px; margin-bottom: 0; color: #cbd5e1;"><li>did:decentraid</li><li>did:ethr</li><li>Trust metadata</li></ul>
      </div>
      <div style="background: #3f3f4e; padding: 10px; border-radius: 4px; flex: 1; min-width: 200px;">
        <strong style="color: #fff;">oid4vci / oid4vp</strong>
        <ul style="padding-left: 20px; font-size: 14px; margin-bottom: 0; color: #cbd5e1;"><li>Credential Offer</li><li>Auth Request/Response</li></ul>
      </div>
    </div>
  </div>
  <div style="display: flex; gap: 10px;">
    <div style="background: #2d2d3a; padding: 15px; border-radius: 4px; flex: 1;">
      <h4 style="margin-top: 0; color: #cbd5e1;">Realtime Channels</h4>
      <p style="font-size: 14px; margin: 0;">(credentials, notifications)</p>
    </div>
    <div style="background: #2d2d3a; padding: 15px; border-radius: 4px; flex: 1;">
      <h4 style="margin-top: 0; color: #cbd5e1;">Lovable AI Gateway</h4>
      <p style="font-size: 14px; margin: 0;">(Gemini 3 Flash) Credential analysis</p>
    </div>
  </div>
</div>

---

## 4. Application Routes & Navigation

| Route             | Component            | Access            | Description                                                |
| ----------------- | -------------------- | ----------------- | ---------------------------------------------------------- |
| `/`               | `Landing`            | Public            | Homepage with portal cards; auto-redirects logged-in users |
| `/auth`           | `Auth`               | Public            | Login, signup, forgot password flows                       |
| `/reset-password` | `ResetPassword`      | Public            | Password reset form (from email link)                      |
| `/issuer`         | `IssuerDashboard`    | Issuer only       | Full issuer management portal                              |
| `/issuer/*`       | `IssuerDashboard`    | Issuer only       | Sub-routes: schemas, issue                                 |
| `/holder`         | `HolderWallet`       | Holder only       | Full holder wallet portal                                  |
| `/holder/*`       | `HolderWallet`       | Holder only       | Sub-routes: biometrics, present                            |
| `/verifier`       | `VerifierDashboard`  | Verifier only     | Full verifier portal                                       |
| `/verifier/*`     | `VerifierDashboard`  | Verifier only     | Sub-routes: verify, history                                |
| `/explorer`       | `BlockchainExplorer` | Any authenticated | Hash chain visualization                                   |
| `/audit`          | `AuditLog`           | Any authenticated | Audit trail viewer                                         |
| `/shared/:token`  | `SharedCredential`   | Public (no auth)  | Time-limited credential view with selective disclosure     |
| `*`               | `NotFound`           | Public            | 404 page                                                   |

### Route Protection

- `ProtectedRoute` component wraps portal routes
- Checks `user` (authenticated) and `role` (matches `requiredRole` prop)
- Unauthenticated users → redirect to `/auth`
- Wrong role → redirect to `/`

---

## 5. Authentication & Authorization

### Authentication Flow

<div style="background: #1e1e24; border-radius: 6px; overflow: hidden; margin-bottom: 15px; border: 1px solid #333;">
  <div style="background: #2d2d3a; padding: 8px 12px; font-family: monospace; font-size: 12px; color: #a1a1aa; border-bottom: 1px solid #333;">
    code
  </div>
  <pre style="margin: 0; padding: 15px; overflow-x: auto; color: #e5e7eb; font-size: 13px;">
<code class="language-">1. User signs up → selects role (issuer/holder/verifier)
2. Auth creates user → stores role in metadata
3. Database trigger `handle_new_user` fires:
   a. Creates profile in `profiles` table
   b. Inserts role into `user_roles` table
   c. If role is "holder", generates a DID via `generate_did()`
4. Confirmation email sent → user verifies
5. User logs in → `useAuth` hook fetches profile + role
6. Auto-redirect to role-specific portal (e.g., `/holder`)
</code>
  </pre>
</div>

### Auth Context (`useAuth` hook)

| Property           | Type              | Description                                       |
| ------------------ | ----------------- | ------------------------------------------------- |
| `user`             | `User \| null`    | Auth user object                                  |
| `session`          | `Session \| null` | Active session                                    |
| `loading`          | `boolean`         | Auth state loading                                |
| `profile`          | `object \| null`  | User profile (name, org, DID, biometrics, wallet) |
| `role`             | `string \| null`  | User role from `user_roles` table                 |
| `signUp()`         | function          | Create account with role metadata                 |
| `signIn()`         | function          | Email/password login                              |
| `signOut()`        | function          | Clear session and state                           |
| `refreshProfile()` | function          | Re-fetch profile and role                         |

### Password Reset Flow

1. User clicks "Forgot password?" → enters email
2. `resetPasswordForEmail()` sends link with `redirectTo: /reset-password`
3. User clicks email link → lands on `/reset-password`
4. Page detects `type=recovery` in URL hash or `PASSWORD_RECOVERY` event
5. User enters new password → `updateUser({ password })` called
6. Redirect to `/auth`

---

## 6. Database Schema

### Tables (12 total)

#### `profiles`

Stores extended user information. Created automatically on signup via trigger.

| Column                 | Type          | Nullable | Default             | Description              |
| ---------------------- | ------------- | -------- | ------------------- | ------------------------ |
| `id`                   | `uuid`        | No       | `gen_random_uuid()` | Primary key              |
| `user_id`              | `uuid`        | No       | —                   | References auth users    |
| `full_name`            | `text`        | No       | `''`                | Display name             |
| `organization`         | `text`        | Yes      | `''`                | Institution/company      |
| `did`                  | `text`        | Yes      | `null`              | Decentralized Identifier |
| `wallet_address`       | `text`        | Yes      | `null`              | Polygon wallet address   |
| `biometric_registered` | `boolean`     | Yes      | `false`             | WebAuthn enrolled        |
| `face_registered`      | `boolean`     | Yes      | `false`             | Face capture completed   |
| `created_at`           | `timestamptz` | No       | `now()`             | —                        |
| `updated_at`           | `timestamptz` | No       | `now()`             | —                        |

#### `user_roles`

Stores user role assignments. Separate table to prevent privilege escalation.

| Column    | Type            | Nullable | Default             | Description                       |
| --------- | --------------- | -------- | ------------------- | --------------------------------- |
| `id`      | `uuid`          | No       | `gen_random_uuid()` | Primary key                       |
| `user_id` | `uuid`          | No       | —                   | References auth users             |
| `role`    | `app_role` enum | No       | —                   | `issuer`, `holder`, or `verifier` |

**Unique constraint**: `(user_id, role)`

#### `credential_schemas`

Defines credential types with versioning support.

| Column             | Type          | Nullable | Default             | Description                              |
| ------------------ | ------------- | -------- | ------------------- | ---------------------------------------- |
| `id`               | `uuid`        | No       | `gen_random_uuid()` | Primary key                              |
| `issuer_id`        | `uuid`        | No       | —                   | Creator's user ID                        |
| `name`             | `text`        | No       | —                   | Schema name                              |
| `credential_type`  | `text`        | No       | `'certificate'`     | degree, diploma, certificate, transcript |
| `fields`           | `jsonb`       | No       | `'[]'`              | Field definitions array                  |
| `version`          | `integer`     | No       | `1`                 | Schema version number                    |
| `parent_schema_id` | `uuid`        | Yes      | `null`              | FK → previous schema version             |
| `is_latest`        | `boolean`     | No       | `true`              | Whether this is the current version      |
| `created_at`       | `timestamptz` | No       | `now()`             | —                                        |

#### `credentials`

Core table storing issued verifiable credentials with blockchain anchoring and wallet signatures.

| Column              | Type          | Nullable | Default             | Description                                |
| ------------------- | ------------- | -------- | ------------------- | ------------------------------------------ |
| `id`                | `uuid`        | No       | `gen_random_uuid()` | Primary key                                |
| `schema_id`         | `uuid`        | Yes      | —                   | FK → `credential_schemas.id`               |
| `issuer_id`         | `uuid`        | No       | —                   | Issuing user's ID                          |
| `holder_did`        | `text`        | No       | —                   | Holder's DID string                        |
| `holder_id`         | `uuid`        | Yes      | —                   | Holder's user ID (if registered)           |
| `credential_data`   | `jsonb`       | No       | `'{}'`              | Full W3C VC JSON (proof + blockchain)      |
| `credential_hash`   | `text`        | No       | —                   | SHA-256 hash of VC + prev_hash             |
| `prev_hash`         | `text`        | Yes      | —                   | Previous credential's hash (chain linking) |
| `blockchain_anchor` | `text`        | Yes      | —                   | Polygon blockchain reference               |
| `status`            | `text`        | No       | `'active'`          | `active`, `revoked`, `expired`             |
| `issuer_signature`  | `text`        | Yes      | —                   | Wallet signature (EcdsaSecp256k1)          |
| `signer_address`    | `text`        | Yes      | —                   | Signing wallet address                     |
| `status_list_id`    | `uuid`        | Yes      | —                   | FK → `status_lists.id`                     |
| `status_list_index` | `integer`     | Yes      | —                   | Index in StatusList2021 bitstring          |
| `issued_at`         | `timestamptz` | No       | `now()`             | —                                          |
| `expires_at`        | `timestamptz` | Yes      | —                   | Optional expiration                        |
| `revoked_at`        | `timestamptz` | Yes      | —                   | When revoked                               |

**`credential_data` structure** (W3C VC):

<div style="background: #1e1e24; border-radius: 6px; overflow: hidden; margin-bottom: 15px; border: 1px solid #333;">
  <div style="background: #2d2d3a; padding: 8px 12px; font-family: monospace; font-size: 12px; color: #a1a1aa; border-bottom: 1px solid #333;">
    json
  </div>
  <pre style="margin: 0; padding: 15px; overflow-x: auto; color: #e5e7eb; font-size: 13px;">
<code class="language-json">{
  "@context": ["https://www.w3.org/2018/credentials/v1", "https://w3id.org/security/suites/ed25519-2020/v1"],
  "type": ["VerifiableCredential", "certificate"],
  "issuer": "did:decentraid:issuer:&lt;userId&gt;",
  "issuanceDate": "2026-03-08T12:00:00Z",
  "credentialSubject": { "id": "did:decentraid:&lt;hash&gt;", "studentName": "John Doe" },
  "credentialSchema": { "id": "&lt;schemaId&gt;", "type": "certificate", "version": 1 },
  "proof": {
    "type": "EcdsaSecp256k1Signature2019",
    "created": "2026-03-08T12:00:00Z",
    "verificationMethod": "did:ethr:polygon:&lt;address&gt;#controller",
    "proofPurpose": "assertionMethod",
    "proofValue": "&lt;wallet_signature&gt;",
    "signedBy": "&lt;wallet_address&gt;"
  },
  "blockchain": {
    "network": "polygon",
    "chainId": 137,
    "txHash": "0x...",
    "blockNumber": 60123456,
    "contractAddress": "0x...",
    "explorerUrl": "https://polygonscan.com/tx/..."
  }
}
</code>
  </pre>
</div>

#### `credential_shares`

Time-limited sharing tokens with selective disclosure support.

| Column             | Type          | Nullable | Default                               | Description                                 |
| ------------------ | ------------- | -------- | ------------------------------------- | ------------------------------------------- |
| `id`               | `uuid`        | No       | `gen_random_uuid()`                   | Primary key                                 |
| `credential_id`    | `uuid`        | No       | —                                     | FK → `credentials.id`                       |
| `holder_id`        | `uuid`        | No       | —                                     | Share creator's user ID                     |
| `token`            | `text`        | No       | `encode(gen_random_bytes(32), 'hex')` | Unique share token                          |
| `disclosed_fields` | `jsonb`       | Yes      | `null`                                | Array of field names to reveal (null = all) |
| `expires_at`       | `timestamptz` | No       | —                                     | When the link expires                       |
| `created_at`       | `timestamptz` | No       | `now()`                               | —                                           |

#### `verification_requests`

Records verification attempts and AI analysis results.

| Column            | Type          | Nullable | Default             | Description                       |
| ----------------- | ------------- | -------- | ------------------- | --------------------------------- |
| `id`              | `uuid`        | No       | `gen_random_uuid()` | Primary key                       |
| `verifier_id`     | `uuid`        | No       | —                   | Verifying user's ID               |
| `credential_id`   | `uuid`        | Yes      | —                   | FK → `credentials.id`             |
| `holder_did`      | `text`        | Yes      | —                   | DID of credential holder          |
| `credential_type` | `text`        | Yes      | —                   | Type of credential verified       |
| `purpose`         | `text`        | Yes      | `''`                | Verification purpose              |
| `status`          | `text`        | No       | `'pending'`         | `pending`, `verified`, `rejected` |
| `ai_analysis`     | `jsonb`       | Yes      | —                   | AI risk assessment results        |
| `verified_at`     | `timestamptz` | Yes      | —                   | When verification completed       |
| `created_at`      | `timestamptz` | No       | `now()`             | —                                 |

#### `notifications`

In-app notification system for credential lifecycle events.

| Column          | Type          | Nullable | Default             | Description                                                     |
| --------------- | ------------- | -------- | ------------------- | --------------------------------------------------------------- |
| `id`            | `uuid`        | No       | `gen_random_uuid()` | Primary key                                                     |
| `user_id`       | `uuid`        | No       | —                   | Recipient user ID                                               |
| `title`         | `text`        | No       | —                   | Notification title                                              |
| `message`       | `text`        | No       | `''`                | Notification body                                               |
| `type`          | `text`        | No       | `'info'`            | `credential_issued`, `credential_revoked`, `credential_expired` |
| `credential_id` | `uuid`        | Yes      | —                   | FK → `credentials.id`                                           |
| `read`          | `boolean`     | No       | `false`             | Read status                                                     |
| `created_at`    | `timestamptz` | No       | `now()`             | —                                                               |

#### `audit_logs`

Comprehensive audit trail for all platform operations.

| Column        | Type          | Nullable | Default             | Description                            |
| ------------- | ------------- | -------- | ------------------- | -------------------------------------- |
| `id`          | `uuid`        | No       | `gen_random_uuid()` | Primary key                            |
| `user_id`     | `uuid`        | No       | —                   | Actor user ID                          |
| `action`      | `text`        | No       | —                   | Action type (see list below)           |
| `entity_type` | `text`        | No       | —                   | `credential`, `schema`, `verification` |
| `entity_id`   | `uuid`        | Yes      | —                   | Related entity ID                      |
| `metadata`    | `jsonb`       | Yes      | `'{}'`              | Action-specific details                |
| `ip_address`  | `text`        | Yes      | —                   | Client IP                              |
| `created_at`  | `timestamptz` | No       | `now()`             | —                                      |

**Audit actions**: `credential_issued`, `credential_revoked`, `credential_verified`, `schema_created`, `batch_issuance`, `oid4vci_credential_issued`, `oid4vp_presentation_received`

#### `trusted_issuers`

Registry of verified credential issuers.

| Column                | Type          | Nullable | Default             | Description                       |
| --------------------- | ------------- | -------- | ------------------- | --------------------------------- |
| `id`                  | `uuid`        | No       | `gen_random_uuid()` | Primary key                       |
| `issuer_did`          | `text`        | No       | —                   | Issuer's DID (unique)             |
| `issuer_user_id`      | `uuid`        | Yes      | —                   | Platform user ID                  |
| `organization_name`   | `text`        | No       | —                   | Organization display name         |
| `domain`              | `text`        | Yes      | —                   | Organization domain               |
| `verification_status` | `text`        | No       | `'pending'`         | `pending`, `verified`, `rejected` |
| `trust_level`         | `text`        | No       | `'standard'`        | `standard`, `elevated`, `high`    |
| `metadata`            | `jsonb`       | Yes      | `'{}'`              | Additional trust data             |
| `verified_by`         | `uuid`        | Yes      | —                   | Verifier who approved             |
| `verified_at`         | `timestamptz` | Yes      | —                   | When verified                     |

#### `status_lists`

StatusList2021 bitstring revocation lists.

| Column          | Type      | Nullable | Default             | Description          |
| --------------- | --------- | -------- | ------------------- | -------------------- |
| `id`            | `uuid`    | No       | `gen_random_uuid()` | Primary key          |
| `issuer_id`     | `uuid`    | No       | —                   | Owning issuer        |
| `encoded_list`  | `text`    | No       | `''`                | Encoded bitstring    |
| `purpose`       | `text`    | No       | `'revocation'`      | List purpose         |
| `status_size`   | `integer` | No       | `1`                 | Bits per entry       |
| `total_entries` | `integer` | No       | `131072`            | Max entries (128K)   |
| `next_index`    | `integer` | No       | `0`                 | Next available index |

#### `consent_records`

GDPR consent tracking.

| Column         | Type          | Nullable | Default             | Description                                         |
| -------------- | ------------- | -------- | ------------------- | --------------------------------------------------- |
| `id`           | `uuid`        | No       | `gen_random_uuid()` | Primary key                                         |
| `user_id`      | `uuid`        | No       | —                   | Consenting user                                     |
| `consent_type` | `text`        | No       | —                   | `data_storage`, `biometric_processing`, `analytics` |
| `purpose`      | `text`        | No       | `''`                | Description of purpose                              |
| `granted`      | `boolean`     | No       | `true`              | Whether consent granted                             |
| `revoked_at`   | `timestamptz` | Yes      | —                   | When consent revoked                                |
| `created_at`   | `timestamptz` | No       | `now()`             | —                                                   |

#### `data_deletion_requests`

GDPR right-to-erasure requests.

| Column         | Type          | Nullable | Default             | Description                          |
| -------------- | ------------- | -------- | ------------------- | ------------------------------------ |
| `id`           | `uuid`        | No       | `gen_random_uuid()` | Primary key                          |
| `user_id`      | `uuid`        | No       | —                   | Requesting user                      |
| `reason`       | `text`        | Yes      | —                   | Deletion reason                      |
| `status`       | `text`        | No       | `'pending'`         | `pending`, `processing`, `completed` |
| `requested_at` | `timestamptz` | No       | `now()`             | —                                    |
| `processed_at` | `timestamptz` | Yes      | —                   | When processed                       |

#### `oid4vc_sessions`

OpenID4VC session tracking for credential offers and presentation requests.

| Column                    | Type          | Nullable | Default             | Description                                  |
| ------------------------- | ------------- | -------- | ------------------- | -------------------------------------------- |
| `id`                      | `uuid`        | No       | `gen_random_uuid()` | Primary key                                  |
| `session_type`            | `text`        | No       | —                   | `credential_offer` or `presentation_request` |
| `user_id`                 | `uuid`        | No       | —                   | Creating user                                |
| `status`                  | `text`        | No       | `'pending'`         | `pending`, `claimed`, `completed`, `expired` |
| `schema_id`               | `uuid`        | Yes      | —                   | FK → `credential_schemas.id`                 |
| `credential_data`         | `jsonb`       | Yes      | `'{}'`              | Pre-filled credential data                   |
| `pre_authorized_code`     | `text`        | Yes      | —                   | Unique code for OID4VCI flow                 |
| `presentation_definition` | `jsonb`       | Yes      | —                   | OID4VP presentation definition               |
| `response_data`           | `jsonb`       | Yes      | —                   | VP response or credential ID                 |
| `metadata`                | `jsonb`       | Yes      | `'{}'`              | Additional session data                      |
| `expires_at`              | `timestamptz` | No       | —                   | Session expiration                           |
| `created_at`              | `timestamptz` | No       | `now()`             | —                                            |

### Enum Type

<div style="background: #1e1e24; border-radius: 6px; overflow: hidden; margin-bottom: 15px; border: 1px solid #333;">
  <div style="background: #2d2d3a; padding: 8px 12px; font-family: monospace; font-size: 12px; color: #a1a1aa; border-bottom: 1px solid #333;">
    sql
  </div>
  <pre style="margin: 0; padding: 15px; overflow-x: auto; color: #e5e7eb; font-size: 13px;">
<code class="language-sql">CREATE TYPE public.app_role AS ENUM ('issuer', 'holder', 'verifier');
</code>
  </pre>
</div>

---

## 7. Row-Level Security (RLS) Policies

All tables have RLS enabled.

### `profiles`

| Policy                          | Command | Rule                               |
| ------------------------------- | ------- | ---------------------------------- |
| Users can read own profile      | SELECT  | `user_id = auth.uid()`             |
| Users can update own profile    | UPDATE  | `user_id = auth.uid()`             |
| Issuers can read all profiles   | SELECT  | `has_role(auth.uid(), 'issuer')`   |
| Verifiers can read all profiles | SELECT  | `has_role(auth.uid(), 'verifier')` |

### `user_roles`

| Policy                    | Command | Rule                   |
| ------------------------- | ------- | ---------------------- |
| Users can read own roles  | SELECT  | `user_id = auth.uid()` |
| Users can insert own role | INSERT  | `user_id = auth.uid()` |

### `credentials`

| Policy                             | Command | Rule                                                                           |
| ---------------------------------- | ------- | ------------------------------------------------------------------------------ |
| Holders can read own credentials   | SELECT  | `holder_id = auth.uid()`                                                       |
| Issuers can read own issued        | SELECT  | `issuer_id = auth.uid()`                                                       |
| Issuers can create credentials     | INSERT  | `issuer_id = auth.uid()`                                                       |
| Issuers can update own credentials | UPDATE  | `issuer_id = auth.uid()`                                                       |
| Verifiers can read credentials     | SELECT  | `has_role(auth.uid(), 'verifier')`                                             |
| Read credentials via share token   | SELECT  | `id IN (SELECT credential_id FROM credential_shares WHERE expires_at > now())` |

### `credential_schemas`

| Policy                     | Command | Rule                     |
| -------------------------- | ------- | ------------------------ |
| Anyone can read schemas    | SELECT  | `true` (public)          |
| Issuers can manage schemas | ALL     | `issuer_id = auth.uid()` |

### `credential_shares`

| Policy                        | Command | Rule                     |
| ----------------------------- | ------- | ------------------------ |
| Holders can manage own shares | ALL     | `holder_id = auth.uid()` |
| Public can read by token      | SELECT  | `true` (public)          |

### `audit_logs`

| Policy                          | Command | Rule                             |
| ------------------------------- | ------- | -------------------------------- |
| Users can read own audit logs   | SELECT  | `user_id = auth.uid()`           |
| Issuers can read all audit logs | SELECT  | `has_role(auth.uid(), 'issuer')` |
| Service role inserts audit logs | INSERT  | `true` (edge functions only)     |

### `trusted_issuers`

| Policy                          | Command | Rule                             |
| ------------------------------- | ------- | -------------------------------- |
| Anyone can read trusted issuers | SELECT  | `true` (public)                  |
| Issuers can register themselves | INSERT  | `has_role(auth.uid(), 'issuer')` |
| Issuers can update own entry    | UPDATE  | `issuer_user_id = auth.uid()`    |

### `status_lists`

| Policy                          | Command | Rule                     |
| ------------------------------- | ------- | ------------------------ |
| Issuers manage own status lists | ALL     | `issuer_id = auth.uid()` |
| Anyone can read status lists    | SELECT  | `true` (public)          |

### `consent_records` / `data_deletion_requests`

| Policy                   | Command | Rule                   |
| ------------------------ | ------- | ---------------------- |
| Users manage own records | ALL     | `user_id = auth.uid()` |

### `oid4vc_sessions`

| Policy                    | Command | Rule                   |
| ------------------------- | ------- | ---------------------- |
| Users manage own sessions | ALL     | `user_id = auth.uid()` |
| Public read (for wallets) | SELECT  | `true`                 |

### `notifications` / `verification_requests`

Standard per-user read/write policies as before.

---

## 8. Database Functions & Triggers

### `handle_new_user()` — Trigger on `auth.users` INSERT

1. Creates `profiles` row with `user_id` and `full_name`
2. Inserts role into `user_roles` from metadata
3. If holder, calls `generate_did()` to assign a DID

### `generate_did(_user_id uuid)` — Returns DID

Generates `did:decentraid:<32_hex>` using `gen_random_bytes(16)`.

### `has_role(_user_id uuid, _role app_role)` — Returns Boolean

Security-definer function for RLS policies. Prevents recursive checks.

### `notify_credential_issued()` — Trigger on `credentials` INSERT

Creates notification for holder when credential issued.

### `notify_credential_status_change()` — Trigger on `credentials` UPDATE

Creates notifications for revocation/expiration events.

### `check_credential_expiration()` — Trigger on `credentials` UPDATE

Auto-sets status to `expired` when `expires_at < now()`.

---

## 9. Edge Functions (Backend API)

### `issue-credential`

**Endpoint**: `POST /functions/v1/issue-credential`
**Auth**: Bearer JWT

Supports single and batch issuance with optional wallet signing.

**Request Body**:

<div style="background: #1e1e24; border-radius: 6px; overflow: hidden; margin-bottom: 15px; border: 1px solid #333;">
  <div style="background: #2d2d3a; padding: 8px 12px; font-family: monospace; font-size: 12px; color: #a1a1aa; border-bottom: 1px solid #333;">
    json
  </div>
  <pre style="margin: 0; padding: 15px; overflow-x: auto; color: #e5e7eb; font-size: 13px;">
<code class="language-json">{
  "schema_id": "uuid",
  "holder_did": "did:decentraid:...",
  "credential_data": { "studentName": "John", "grade": "A" },
  "expires_at": "2027-01-01T00:00:00Z",
  "issuer_signature": "0x...",
  "signer_address": "0x..."
}
</code>
  </pre>
</div>

**Batch** — same but with `batch: [{ holder_did, credential_data, ... }]`

**Process**:

1. Authenticate issuer via JWT
2. Fetch schema; lookup holder by DID
3. Chain-link via `prev_hash`
4. Build W3C VC with proof (wallet-signed or simulated)
5. SHA-256 hash computation
6. Polygon blockchain anchor generation
7. Insert credential + audit log

### `verify-credential`

**Endpoint**: `POST /functions/v1/verify-credential`

**Checks**: Hash integrity → revocation → expiration → blockchain → wallet signature → AI analysis (Gemini)

**Response includes**: `valid`, `hash_integrity`, `not_revoked`, `not_expired`, `blockchain_info`, `signature`, `ai_analysis`

### `resolve-did`

**Endpoint**: `POST /functions/v1/resolve-did`

Resolves W3C DID Documents for three DID methods:

| Method                       | Format       | Resolution                               |
| ---------------------------- | ------------ | ---------------------------------------- |
| `did:decentraid:issuer:<id>` | Issuer DID   | Profile + wallet + trust registry status |
| `did:decentraid:<hex>`       | Holder DID   | Profile + biometric auth methods         |
| `did:ethr:polygon:<addr>`    | Ethereum DID | Wallet address + linked platform DID     |

Returns standard DID Document with `verificationMethod`, `authentication`, `assertionMethod`, and `service` arrays.

### `oid4vci`

**Endpoints**:
| Path | Method | Description |
|------|--------|-------------|
| `/offer` | POST | Create credential offer (issuer, authenticated) |
| `/.well-known` | GET | Issuer metadata (public) |
| `/token` | POST | Exchange pre-authorized code for access token |
| `/credential` | POST | Fetch issued credential (bearer token) |

**Flow**: Issuer creates offer → wallet scans QR → exchanges code for token → fetches VC in `ldp_vc` or `jwt_vc_json` format.

### `oid4vp`

**Endpoints**:
| Path | Method | Description |
|------|--------|-------------|
| `/request` | POST | Create presentation request (verifier, authenticated) |
| `/response` | POST | Receive VP from wallet (direct_post) |
| `/status` | GET | Poll session status |

**Flow**: Verifier creates request → wallet scans QR → wallet posts VP → verifier polls for result.

---

## 10. Portal 1: Issuer Dashboard

**Route**: `/issuer` | **File**: `src/pages/issuer/IssuerDashboard.tsx`

### Features

- **Statistics**: Schemas, Issued, On-Chain, Revoked, Expired counts
- **Analytics**: Issuance trend bar chart, type distribution pie chart
- **Create Schema**: Name, type, JSON fields, auto-versioning (v1, v2, ...)
- **Issue Credential**: Holder DID, schema selection, dynamic form, optional expiration, wallet signing toggle (MetaMask/Polygon)
- **Batch Issuance**: CSV upload with `holder_did` column, preview, progress tracking
- **OID4VCI Offer**: Generate QR code / URI for external wallet credential pickup
- **Revoke Credentials**: One-click revocation with audit logging
- **Trusted Issuer Registry**: Register organization, view trust status
- **Quick Links**: Audit trail, blockchain explorer

---

## 11. Portal 2: Holder Wallet

**Route**: `/holder` | **File**: `src/pages/holder/HolderWallet.tsx`

### Features

- **Security Score**: 0-100% based on DID + WebAuthn + Face enrollment
- **DID Management**: Generate, display, copy, QR code
- **Web3 Wallet**: MetaMask connection on Polygon network
- **Biometric Enrollment**: WebAuthn (fingerprint/Face ID), face capture via camera
- **Credential Cards**: View all credentials with status, share, QR, export actions
- **Selective Disclosure Sharing**: Choose specific fields to reveal when creating share links
- **Credential Export**: Download as JSON-LD (W3C) or JWT-VC format
- **Multi-Factor Verification**: 3-factor check (DID + WebAuthn + wallet signature)
- **Privacy Center (GDPR)**: Consent management, data export, deletion requests
- **Active Share Links**: Manage all active/expired share links
- **Real-Time Updates**: Live notifications for credential lifecycle events

---

## 12. Portal 3: Verifier Dashboard

**Route**: `/verifier` | **File**: `src/pages/verifier/VerifierDashboard.tsx`

### Features

- **Statistics**: Verified, Pending, Rejected counts, AI confidence average
- **Analytics**: Verification trend, results distribution charts
- **Verify Credential**: Paste VP JSON → hash check, revocation, expiration, blockchain, wallet signature, AI analysis
- **Request Presentation**: Send verification request to holder by DID
- **OID4VP Request**: Generate QR code for external wallet VP presentation with real-time polling
- **DID Resolver**: Resolve any `did:decentraid:` or `did:ethr:polygon:` to W3C DID Document
- **Trusted Issuer Registry**: View verified issuers with trust levels
- **Verification History**: Full list with AI analysis indicators

---

## 13. Credential Sharing & Selective Disclosure

### Standard Share Flow

1. Holder clicks share → selects expiry (1h / 24h / 7d / 30d)
2. **Selective disclosure mode**: Toggle to choose specific fields to reveal
3. Token generated (32 random bytes, hex-encoded)
4. Share record with `disclosed_fields` array inserted
5. QR code + copyable URL generated

### Shared View (`/shared/:token`)

- Publicly accessible (no auth)
- Checks expiration
- If `disclosed_fields` set: only reveals selected fields, shows "••• Redacted" for hidden fields
- If `disclosed_fields` null: reveals all fields
- Displays credential metadata, blockchain anchor, hash

---

## 14. Blockchain Explorer

**Route**: `/explorer` | **File**: `src/pages/BlockchainExplorer.tsx`

- **Stats**: Total blocks, active, chain integrity %, latest block date
- **Search**: Filter by hash, tx hash, DID, credential name
- **Visual Hash Chain**: Blocks with chain connectors showing `prev_hash` links
- **Expandable Details**: Full hash, previous hash, holder DID, blockchain info, proof details

---

## 15. Trust Infrastructure

### Trusted Issuer Registry (`TrustedIssuerRegistry.tsx`)

- Issuers register their organization with name, domain, DID
- Verification statuses: `pending`, `verified`, `rejected`
- Trust levels: `standard`, `elevated`, `high`
- Public read access for verifiers and holders

### DID Resolution (`DIDResolver.tsx` + `resolve-did` edge function)

- Input any DID → resolves to W3C DID Document
- Shows verification methods, authentication, services
- Includes trust metadata for issuer DIDs

### StatusList2021

- Bitstring-based revocation lists (128K entries per list)
- O(1) revocation status lookup
- W3C StatusList2021 compliant

---

## 16. OpenID4VC (OID4VCI / OID4VP)

### OID4VCI — Credential Issuance to External Wallets

**Component**: `OID4VCIOfferDialog.tsx`
**Edge Function**: `oid4vci`

**Protocol**: Pre-Authorized Code Flow

<div style="background: #1e1e24; border-radius: 6px; overflow: hidden; margin-bottom: 15px; border: 1px solid #333;">
  <div style="background: #2d2d3a; padding: 8px 12px; font-family: monospace; font-size: 12px; color: #a1a1aa; border-bottom: 1px solid #333;">
    code
  </div>
  <pre style="margin: 0; padding: 15px; overflow-x: auto; color: #e5e7eb; font-size: 13px;">
<code class="language-">Issuer creates offer → QR code displayed
     ↓
External wallet scans → reads credential_offer
     ↓
Wallet calls /token with pre-authorized_code
     ↓
Receives access_token + c_nonce
     ↓
Wallet calls /credential with Bearer token
     ↓
Receives VC in ldp_vc or jwt_vc_json format
</code>
  </pre>
</div>

**Credential Offer URI format**:

<div style="background: #1e1e24; border-radius: 6px; overflow: hidden; margin-bottom: 15px; border: 1px solid #333;">
  <div style="background: #2d2d3a; padding: 8px 12px; font-family: monospace; font-size: 12px; color: #a1a1aa; border-bottom: 1px solid #333;">
    code
  </div>
  <pre style="margin: 0; padding: 15px; overflow-x: auto; color: #e5e7eb; font-size: 13px;">
<code class="language-">openid-credential-offer://?credential_offer={"credential_issuer":"...","credentials":["certificate"],"grants":{"urn:ietf:params:oauth:grant-type:pre-authorized_code":{"pre-authorized_code":"..."}}}
</code>
  </pre>
</div>

**Compatible wallets**: Sphereon, Walt.id, MATTR, and other OID4VCI-compliant wallets.

### OID4VP — Verifiable Presentation from External Wallets

**Component**: `OID4VPRequestDialog.tsx`
**Edge Function**: `oid4vp`

**Protocol**: Authorization Request with direct_post response

<div style="background: #1e1e24; border-radius: 6px; overflow: hidden; margin-bottom: 15px; border: 1px solid #333;">
  <div style="background: #2d2d3a; padding: 8px 12px; font-family: monospace; font-size: 12px; color: #a1a1aa; border-bottom: 1px solid #333;">
    code
  </div>
  <pre style="margin: 0; padding: 15px; overflow-x: auto; color: #e5e7eb; font-size: 13px;">
<code class="language-">Verifier creates request → QR code displayed
     ↓
External wallet scans → reads presentation_definition
     ↓
Wallet selects matching credentials
     ↓
Wallet POSTs vp_token to /response (direct_post)
     ↓
Verifier polls /status → receives VP data
</code>
  </pre>
</div>

**Authorization Request URI format**:

<div style="background: #1e1e24; border-radius: 6px; overflow: hidden; margin-bottom: 15px; border: 1px solid #333;">
  <div style="background: #2d2d3a; padding: 8px 12px; font-family: monospace; font-size: 12px; color: #a1a1aa; border-bottom: 1px solid #333;">
    code
  </div>
  <pre style="margin: 0; padding: 15px; overflow-x: auto; color: #e5e7eb; font-size: 13px;">
<code class="language-">openid4vp://?client_id=...&amp;response_type=vp_token&amp;response_uri=...&amp;response_mode=direct_post&amp;presentation_definition={...}
</code>
  </pre>
</div>

**Session lifecycle**: `pending` → `claimed` (OID4VCI) / `completed` → tracked in `oid4vc_sessions` table.

---

## 17. Privacy & GDPR Compliance

### Privacy Center (`PrivacyCenter.tsx`)

Accessible from Holder Wallet.

#### Consent Management

- Track consent for: data storage, biometric processing, analytics
- Grant/revoke individual consent types
- Stored in `consent_records` table with timestamps

#### Data Export (Article 20)

- Export all personal data as JSON download
- Includes: profile, credentials, consent records, notifications

#### Right to Erasure (Article 17)

- Submit data deletion request with optional reason
- Tracked in `data_deletion_requests` table
- Status workflow: `pending` → `processing` → `completed`

---

## 18. Multi-Factor Verification

**Component**: `MultiFactorVerification.tsx`

Three-factor verification combining:

| Factor              | Method         | Description                                               |
| ------------------- | -------------- | --------------------------------------------------------- |
| 1. DID Ownership    | Platform check | Verifies user has a registered DID                        |
| 2. Biometric        | WebAuthn       | `navigator.credentials.get()` with platform authenticator |
| 3. Wallet Signature | MetaMask       | `personal_sign` of verification challenge on Polygon      |

All three factors must pass for full verification. Each factor shows individual pass/fail status.

---

## 19. Credential Export & Interoperability

**Component**: `CredentialExport.tsx`

### Export Formats

| Format      | Extension | Standard | Description                                                       |
| ----------- | --------- | -------- | ----------------------------------------------------------------- |
| **JSON-LD** | `.jsonld` | W3C VC   | Full verifiable credential with `@context`, StatusList2021 status |
| **JWT-VC**  | `.jwt`    | IETF     | Compact JWT token format (header.payload.signature)               |

Both formats include credential subject, schema reference, issuance date, and status information. JWT-VC exports are unsigned (marked `UNSIGNED_EXPORT`) for portability — real signing happens via wallet.

---

## 20. Notification System

### Architecture

1. **Database Triggers** → `notify_credential_issued()`, `notify_credential_status_change()`
2. **Realtime Subscription** → `NotificationBell` component subscribes to INSERT events
3. **Toast Notifications** → `useCredentialNotifications` hook shows instant toasts

### NotificationBell Component

- Bell icon with unread count badge
- Dropdown panel with up to 20 notifications
- Per-type icons (Shield for issued, AlertTriangle for revoked, Clock for expired)
- "Mark all read" button

---

## 21. AI Integration

### Provider

- **Lovable AI Gateway** → Google Gemini 3 Flash Preview
- **Auth**: `LOVABLE_API_KEY` (pre-configured)

### Usage in `verify-credential`

Analyzes credential data, hash validity, blockchain anchoring, expiration, and wallet signature to produce:

<div style="background: #1e1e24; border-radius: 6px; overflow: hidden; margin-bottom: 15px; border: 1px solid #333;">
  <div style="background: #2d2d3a; padding: 8px 12px; font-family: monospace; font-size: 12px; color: #a1a1aa; border-bottom: 1px solid #333;">
    json
  </div>
  <pre style="margin: 0; padding: 15px; overflow-x: auto; color: #e5e7eb; font-size: 13px;">
<code class="language-json">{
  "risk_level": "low|medium|high",
  "confidence": 0-100,
  "findings": ["Credential properly anchored on Polygon", "Wallet signature verified", ...]
}
</code>
  </pre>
</div>

---

## 22. Audit Trail

**Route**: `/audit` | **File**: `src/pages/AuditLog.tsx`

Comprehensive logging of all platform operations:

| Action                         | Logged By        | Metadata                                  |
| ------------------------------ | ---------------- | ----------------------------------------- |
| `credential_issued`            | Edge function    | holder_did, schema, wallet signing status |
| `credential_revoked`           | Issuer dashboard | credential_id                             |
| `credential_verified`          | Edge function    | result, AI confidence                     |
| `schema_created`               | Issuer dashboard | name, type, version                       |
| `batch_issuance`               | Edge function    | total, issued, failed counts              |
| `oid4vci_credential_issued`    | OID4VCI function | holder_did, format                        |
| `oid4vp_presentation_received` | OID4VP function  | holder, credentials count                 |

**Access**: Users see own logs; issuers see all logs.

---

## 23. PDF Certificate Generation

**File**: `src/lib/generateCertificatePdf.ts` | **Library**: jsPDF

Generates landscape A4 PDF with:

- Teal border with accent line
- "CERTIFICATE OF CREDENTIAL" title
- Credential name, type, holder name
- Dynamic data fields (up to 8, in 2 columns)
- Footer: DID, issue date, hash, blockchain anchor, verification badge

---

## 24. PWA & Offline Support

**Configuration**: `vite-plugin-pwa` in `vite.config.ts`

- **Service Worker**: Workbox with `GenerateSW` strategy
- **Caching**: Runtime caching for API calls, images, fonts
- **Manifest**: App name "DecentraID", theme color `#1a8a7a`, icons (192px, 512px)
- **Offline**: Holder wallet accessible offline with cached credentials
- **Install**: Native install prompt on supported browsers

---

## 25. Design System

### Color Palette (HSL tokens)

#### Portal-Specific Colors

| Portal   | Token        | HSL           | Usage  |
| -------- | ------------ | ------------- | ------ |
| Issuer   | `--issuer`   | `220 70% 55%` | Blue   |
| Holder   | `--holder`   | `175 60% 38%` | Teal   |
| Verifier | `--verifier` | `262 60% 55%` | Purple |

Each has `-foreground` and `-muted` variants. Full dark mode support.

### Typography

- **Display** (`font-display`): Space Grotesk
- **Body** (`font-body`): Inter

### Button Variants

- `variant="issuer"` — Blue
- `variant="holder"` — Teal
- `variant="verifier"` — Purple

### Animations

- `animate-fade-in`: Fade + translate (0.4s)
- `animate-slide-up`: Slide up (0.5s)
- `animate-pulse-subtle`: Gentle pulse (2s infinite)

---

## 26. Component Inventory

### Pages (10)

| File                     | Description                    |
| ------------------------ | ------------------------------ |
| `Landing.tsx`            | Homepage with portal cards     |
| `Auth.tsx`               | Login, signup, forgot password |
| `ResetPassword.tsx`      | Password reset                 |
| `IssuerDashboard.tsx`    | Issuer management portal       |
| `HolderWallet.tsx`       | Holder wallet portal           |
| `VerifierDashboard.tsx`  | Verifier portal                |
| `BlockchainExplorer.tsx` | Hash chain visualization       |
| `AuditLog.tsx`           | Audit trail viewer             |
| `SharedCredential.tsx`   | Public shared credential view  |
| `NotFound.tsx`           | 404 page                       |

### Custom Components (16)

| File                          | Description                           |
| ----------------------------- | ------------------------------------- |
| `ProtectedRoute.tsx`          | Auth + role guard                     |
| `PortalLayout.tsx`            | Shared portal layout                  |
| `SchemaForm.tsx`              | Dynamic form from schema fields       |
| `BatchIssuanceDialog.tsx`     | CSV batch issuance                    |
| `ShareCredentialDialog.tsx`   | Selective disclosure sharing          |
| `ActiveShareLinks.tsx`        | Share link management                 |
| `QRCodeDisplay.tsx`           | Generic QR code dialog                |
| `NotificationBell.tsx`        | Notification dropdown                 |
| `NavLink.tsx`                 | Navigation link helper                |
| `TrustedIssuerRegistry.tsx`   | Trust registry UI                     |
| `DIDResolver.tsx`             | DID document resolution               |
| `Web3WalletCard.tsx`          | MetaMask wallet connection            |
| `CredentialExport.tsx`        | JSON-LD / JWT-VC export               |
| `MultiFactorVerification.tsx` | 3-factor MFA check                    |
| `PrivacyCenter.tsx`           | GDPR consent & data rights            |
| `OID4VCIOfferDialog.tsx`      | OID4VCI credential offer generator    |
| `OID4VPRequestDialog.tsx`     | OID4VP presentation request generator |

### Hooks (5)

| Hook                         | Description                           |
| ---------------------------- | ------------------------------------- |
| `useAuth`                    | Auth context provider + consumer      |
| `useWeb3Wallet`              | MetaMask wallet management on Polygon |
| `useCredentialNotifications` | Realtime toast notifications          |
| `useToast`                   | Toast notification system             |
| `useMobile`                  | Mobile viewport detection             |

### Edge Functions (5)

| Function            | Description                                    |
| ------------------- | ---------------------------------------------- |
| `issue-credential`  | W3C VC issuance with wallet signing + batch    |
| `verify-credential` | Multi-check verification with AI analysis      |
| `resolve-did`       | W3C DID Document resolution                    |
| `oid4vci`           | OpenID4VCI credential offer + token + issuance |
| `oid4vp`            | OpenID4VP presentation request + response      |

---

## 27. Security Considerations

### Authentication & Authorization

- Email/password with email verification required
- Role-based access via separate `user_roles` table (prevents privilege escalation)
- `has_role()` security-definer function prevents RLS recursion
- Edge functions verify JWT server-side; use service role for privileged operations

### Cryptographic Security

- SHA-256 hash chain prevents credential tampering
- Wallet signatures (EcdsaSecp256k1) via MetaMask on Polygon
- WebAuthn biometric authentication (platform authenticators)
- Share tokens: 32 random bytes (256 bits entropy)
- Pre-authorized codes: SHA-256 hashed with user ID + timestamp + UUID

### Data Protection

- All 12 tables have RLS enabled (30+ policies)
- Users access only their own data (with specific cross-role exceptions)
- Credentials are never deleted (only revoked via StatusList2021)
- Audit trail records all operations permanently
- GDPR-compliant consent tracking and data export

### Known Limitations

- Blockchain anchoring is simulated (not connected to actual Polygon network)
- Wallet signatures are real (via MetaMask) but proof verification is simulated
- Face capture stores only a boolean flag, not actual biometric data
- WebAuthn credentials are created but not used for ongoing session auth
- JWT-VC exports are unsigned (portability-focused)
- OID4VCI/OID4VP are specification-aligned but simplified (no DPoP, no complex proof types)

---

## 28. Data Flow Diagrams

### Credential Issuance (with Wallet Signing)

<div style="background: #1e1e24; border-radius: 6px; overflow: hidden; margin-bottom: 15px; border: 1px solid #333;">
  <div style="background: #2d2d3a; padding: 8px 12px; font-family: monospace; font-size: 12px; color: #a1a1aa; border-bottom: 1px solid #333;">
    code
  </div>
  <pre style="margin: 0; padding: 15px; overflow-x: auto; color: #e5e7eb; font-size: 13px;">
<code class="language-">Issuer fills form + enables wallet signing
        ↓
MetaMask signs message (personal_sign)
        ↓
POST /issue-credential with signature + signer_address
        ↓
  1. Authenticate issuer (JWT)
  2. Fetch schema + lookup holder
  3. Build W3C VC with EcdsaSecp256k1Signature2019 proof
  4. SHA-256(VC + prev_hash) → credential_hash
  5. Generate Polygon anchor (simulated)
  6. INSERT credential + audit_log
  7. Trigger: notify_credential_issued()
        ↓
Response: credential with blockchain + signature info
</code>
  </pre>
</div>

### OID4VCI Cross-Wallet Issuance

<div style="background: #1e1e24; border-radius: 6px; overflow: hidden; margin-bottom: 15px; border: 1px solid #333;">
  <div style="background: #2d2d3a; padding: 8px 12px; font-family: monospace; font-size: 12px; color: #a1a1aa; border-bottom: 1px solid #333;">
    code
  </div>
  <pre style="margin: 0; padding: 15px; overflow-x: auto; color: #e5e7eb; font-size: 13px;">
<code class="language-">Issuer creates offer (schema + data)
        ↓
POST /oid4vci/offer → pre_authorized_code + QR
        ↓
External wallet scans QR
        ↓
Wallet POST /oid4vci/token { pre-authorized_code }
        ↓
Receives access_token
        ↓
Wallet POST /oid4vci/credential { format }
        ↓
Receives VC (ldp_vc or jwt_vc_json)
        ↓
Session marked 'completed' + audit logged
</code>
  </pre>
</div>

### OID4VP Cross-Wallet Verification

<div style="background: #1e1e24; border-radius: 6px; overflow: hidden; margin-bottom: 15px; border: 1px solid #333;">
  <div style="background: #2d2d3a; padding: 8px 12px; font-family: monospace; font-size: 12px; color: #a1a1aa; border-bottom: 1px solid #333;">
    code
  </div>
  <pre style="margin: 0; padding: 15px; overflow-x: auto; color: #e5e7eb; font-size: 13px;">
<code class="language-">Verifier creates request (credential_types, purpose)
        ↓
POST /oid4vp/request → presentation_definition + QR
        ↓
External wallet scans QR
        ↓
Wallet selects matching credentials
        ↓
Wallet POST /oid4vp/response { vp_token, state }
        ↓
Session marked 'completed' + verification_request created
        ↓
Verifier polls GET /oid4vp/status → receives VP data
</code>
  </pre>
</div>

### Selective Disclosure Sharing

<div style="background: #1e1e24; border-radius: 6px; overflow: hidden; margin-bottom: 15px; border: 1px solid #333;">
  <div style="background: #2d2d3a; padding: 8px 12px; font-family: monospace; font-size: 12px; color: #a1a1aa; border-bottom: 1px solid #333;">
    code
  </div>
  <pre style="margin: 0; padding: 15px; overflow-x: auto; color: #e5e7eb; font-size: 13px;">
<code class="language-">Holder selects credential → toggles selective mode
        ↓
Chooses fields to disclose (e.g., only "degree" and "university")
        ↓
INSERT credential_share with disclosed_fields: ["degree", "university"]
        ↓
Generate share URL + QR
        ↓
Recipient opens /shared/:token
        ↓
Only selected fields shown; others display "••• Redacted"
</code>
  </pre>
</div>

### Credential Verification (Full Pipeline)

<div style="background: #1e1e24; border-radius: 6px; overflow: hidden; margin-bottom: 15px; border: 1px solid #333;">
  <div style="background: #2d2d3a; padding: 8px 12px; font-family: monospace; font-size: 12px; color: #a1a1aa; border-bottom: 1px solid #333;">
    code
  </div>
  <pre style="margin: 0; padding: 15px; overflow-x: auto; color: #e5e7eb; font-size: 13px;">
<code class="language-">Verifier pastes VP JSON → POST /verify-credential
        ↓
  1. Extract credential_id from VP
  2. Fetch credential + schema
  3. Recompute SHA-256 hash → compare (hash_integrity)
  4. Check status !== 'revoked' (not_revoked)
  5. Check expires_at &gt; now() (not_expired)
  6. Verify blockchain anchor exists
  7. Check wallet signature (if EcdsaSecp256k1)
  8. Call Gemini AI → risk_level, confidence, findings
  9. INSERT verification_request + audit_log
        ↓
Response: { valid, hash_integrity, not_revoked, not_expired,
            blockchain_info, signature, ai_analysis }
</code>
  </pre>
</div>

---

_Generated: March 8, 2026_
_Platform: DecentraID — Decentralized Identity for Education_
_Built with: Lovable + React + Lovable Cloud_
_Standards: W3C VC, W3C DID, OpenID4VCI, OpenID4VP, StatusList2021_

---

## 29. Literature Survey & Theoretical Foundation

<div style="font-family: sans-serif; color: #e2e8f0; line-height: 1.6; background: #0f172a; padding: 25px; border-radius: 8px;">

<h3 style="color: #38bdf8; margin-top: 0;">Overview</h3>
<p>This project is built on the foundation of several cutting-edge academic papers and W3C standards regarding decentralized identity.</p>

<table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; background: #1e293b; color: #f8fafc; border-radius: 8px; overflow: hidden;">
  <thead>
    <tr style="background-color: #334155; border-bottom: 2px solid #475569;">
      <th style="padding: 15px; text-align: left; width: 25%;">Author(s) & Year</th>
      <th style="padding: 15px; text-align: left; width: 35%;">Title / Standard</th>
      <th style="padding: 15px; text-align: left; width: 40%;">Relevance to Project</th>
    </tr>
  </thead>
  <tbody>
    <tr style="border-bottom: 1px solid #334155;">
      <td style="padding: 15px;"><strong>Ferdous, M. S., et al. (2019)</strong></td>
      <td style="padding: 15px;"><em>A Survey of Technologies for Blockchain-Based Identity Management</em></td>
      <td style="padding: 15px;">Provides the academic foundation for why we use a decentralized ledger (Polygon) to prevent forgery and central points of failure.</td>
    </tr>
    <tr style="border-bottom: 1px solid #334155;">
      <td style="padding: 15px;"><strong>Sporny, M., et al. (W3C, 2022)</strong></td>
      <td style="padding: 15px;"><em>Verifiable Credentials Data Model & DIDs v1.0</em></td>
      <td style="padding: 15px;">These are the exact technical specifications the platform implements. Defines how we bind user keys and structure JSON-LD proofs.</td>
    </tr>
    <tr>
      <td style="padding: 15px;"><strong>Weyl, E., Ohlhaver, P., & Buterin, V. (2022)</strong></td>
      <td style="padding: 15px;"><em>Decentralized Society: Finding Web3's Soul</em></td>
      <td style="padding: 15px;">Theoretical blueprint for the Composite Identity Protocol, using non-transferable SBTs as a master digital passport.</td>
    </tr>
  </tbody>
</table>

<div style="display: flex; gap: 20px; align-items: stretch; flex-wrap: wrap;">
  <div style="flex: 1; min-width: 300px; background: #1e293b; padding: 20px; border-top: 4px solid #3b82f6; border-radius: 6px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
    <h4 style="margin-top: 0; color: #60a5fa;">W3C Verification Flow Diagram</h4>
    <p style="font-size: 14px; margin-bottom: 15px; color: #cbd5e1;">The platform implements a decentralized verification flow without "phoning home" to the issuer.</p>
    
    <div style="display: flex; flex-direction: column; gap: 10px;">
      <div style="background: #334155; padding: 10px; border-radius: 4px; text-align: center; color: #e2e8f0; font-family: monospace;">1. Holder -> shares VP -> Verifier</div>
      <div style="text-align: center; color: #94a3b8;">↓</div>
      <div style="background: #334155; padding: 10px; border-radius: 4px; text-align: center; color: #e2e8f0; font-family: monospace;">2. Verifier -> extracts DID -> fetches DID Doc</div>
      <div style="text-align: center; color: #94a3b8;">↓</div>
      <div style="background: #334155; padding: 10px; border-radius: 4px; text-align: center; color: #e2e8f0; font-family: monospace;">3. Verifier -> extracts PubKey -> validates EcdsaSecp256k1 Signature</div>
    </div>
  </div>
  
  <div style="flex: 1; min-width: 300px; background: #1e293b; padding: 20px; border-top: 4px solid #10b981; border-radius: 6px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
    <h4 style="margin-top: 0; color: #34d399;">HTML Code Snippet Example</h4>
    <p style="font-size: 14px; margin-bottom: 15px; color: #cbd5e1;">Example structure for rendering a credential directly to HTML.</p>
    <div style="background: #0f172a; border: 1px solid #334155; border-radius: 4px; overflow: hidden;">
      <div style="background: #1e293b; padding: 5px 10px; border-bottom: 1px solid #334155; font-family: monospace; font-size: 12px; color: #94a3b8;">credential.html</div>
      <pre style="margin: 0; padding: 15px; overflow-x: auto; font-family: 'Fira Code', monospace; font-size: 13px; color: #e2e8f0;">
<span style="color: #5eead4;">&lt;div</span> <span style="color: #93c5fd;">class</span>=<span style="color: #fca5a5;">"credential-card"</span><span style="color: #5eead4;">&gt;</span>
  <span style="color: #5eead4;">&lt;h1&gt;</span>University Degree<span style="color: #5eead4;">&lt;/h1&gt;</span>
  <span style="color: #5eead4;">&lt;p&gt;</span>Issued to: 
    <span style="color: #5eead4;">&lt;span</span> <span style="color: #93c5fd;">class</span>=<span style="color: #fca5a5;">"did"</span><span style="color: #5eead4;">&gt;</span>did:decentraid:123<span style="color: #5eead4;">&lt;/span&gt;</span>
  <span style="color: #5eead4;">&lt;/p&gt;</span>
<span style="color: #5eead4;">&lt;/div&gt;</span></pre>
    </div>
  </div>
</div>

</div>
