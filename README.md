# DecentraID — Decentralized Identity for Education

A W3C-compliant Verifiable Credentials platform for issuing, holding, and verifying academic credentials on a decentralized trust framework.

![Built with React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?logo=tailwindcss&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)

---

## Overview

DecentraID implements the **W3C Verifiable Credentials** and **Decentralized Identifiers (DIDs)** standards to enable a complete credential lifecycle for educational institutions, students, and employers.

### The Trust Triangle

| Role         | Description                                                          |
| ------------ | -------------------------------------------------------------------- |
| **Issuer**   | Educational institutions that create and sign verifiable credentials |
| **Holder**   | Students/graduates who store credentials in a digital wallet         |
| **Verifier** | Employers/institutions that verify credential authenticity           |

## Features

### Core

- **Credential Issuance** — Dynamic schema builder, single & batch (CSV) issuance
- **Holder Wallet** — Store, manage, and selectively disclose credentials
- **Verification Engine** — AI-powered analysis with confidence scoring and hash integrity checks
- **Credential Revocation** — Issuer-controlled revocation with confirmation safeguards

### Security & Standards

- **W3C VC Data Model** — Standards-compliant credential format
- **DID Resolution** — `did:key` method support with DID document generation
- **SHA-256 Hashing** — Canonical JSON serialization for tamper-proof integrity
- **Blockchain Anchoring** — Optional on-chain anchoring (Polygon) for immutable proof
- **Selective Disclosure** — Share only chosen fields while proving qualifications
- **Biometric Authentication** — WebAuthn fingerprint/face authentication support

### Platform

- **OID4VCI / OID4VP** — OpenID for Verifiable Credential Issuance & Presentation
- **QR Code Sharing** — Generate shareable links with expiration and field selection
- **Trusted Issuer Registry** — Manage and verify trusted credential issuers
- **Audit Logging** — Full activity trail for compliance and transparency
- **Privacy Center** — GDPR-aligned consent management and data deletion requests
- **Real-time Notifications** — Credential status updates via database subscriptions
- **Dark/Light Mode** — Full theme support with semantic design tokens
- **PWA Ready** — Installable progressive web app with offline capability

## Tech Stack

| Layer          | Technology                                     |
| -------------- | ---------------------------------------------- |
| **Frontend**   | React 18, TypeScript, Vite                     |
| **Styling**    | Tailwind CSS, shadcn/ui, Framer Motion         |
| **Backend**    | Lovable Cloud (Edge Functions, Auth, Database) |
| **Charts**     | Recharts                                       |
| **PDF Export** | jsPDF                                          |
| **QR Codes**   | qrcode.react                                   |
| **Forms**      | React Hook Form + Zod validation               |

## Getting Started

### Prerequisites

- Node.js 18+ ([install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating))

### Local Development

```sh
# Clone the repository
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>

# Install dependencies
npm install

# Start the dev server
npm run dev
```

The app will be available at `http://localhost:5173`.

### Running Tests

```sh
npm run test
```

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── layout/          # Portal layout wrapper
│   └── ui/              # shadcn/ui primitives
├── hooks/               # Custom React hooks (auth, web3, notifications)
├── integrations/        # Supabase client & types (auto-generated)
├── lib/                 # Utilities (PDF generation, helpers)
├── pages/
│   ├── issuer/          # Issuer dashboard & credential management
│   ├── holder/          # Holder wallet & credential presentation
│   ├── verifier/        # Verification dashboard & request management
│   ├── Landing.tsx       # Animated landing page
│   ├── Auth.tsx          # Authentication (sign up / sign in)
│   └── SharedCredential.tsx  # Public credential viewer
└── test/                # Test setup & examples

supabase/
└── functions/           # Edge functions (issue, verify, DID resolve, OID4VC)
```

## Database Schema

Key tables: `credentials`, `credential_schemas`, `profiles`, `user_roles`, `verification_requests`, `credential_shares`, `audit_logs`, `notifications`, `trusted_issuers`, `status_lists`, `consent_records`, `oid4vc_sessions`.

Role-based access is enforced via RLS policies and a `has_role()` security-definer function.

## License

Private — All rights reserved.
