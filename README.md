<div align="center">
  <img src="public/pwa-192.png" alt="BLOCKID Logo" width="140" />
  
  # 🌐 BLOCKID

  **Blockchain-Based Self-Sovereign Identity (SSI) & Verifiable Credentials Platform**
  
  <p align="center">
    <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-18-blue?style=for-the-badge&logo=react" alt="React 18" /></a>
    <a href="https://vitejs.dev/"><img src="https://img.shields.io/badge/Vite-6-purple?style=for-the-badge&logo=vite" alt="Vite 6" /></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.8-blue?style=for-the-badge&logo=typescript" alt="TypeScript" /></a>
    <a href="https://ethereum.org/"><img src="https://img.shields.io/badge/Ethereum-Sepolia-627EEA?style=for-the-badge&logo=ethereum" alt="Ethereum Sepolia" /></a>
    <a href="https://polygon.technology/"><img src="https://img.shields.io/badge/Polygon-Amoy-8247E5?style=for-the-badge&logo=polygon" alt="Polygon Amoy" /></a>
    <a href="https://supabase.com/"><img src="https://img.shields.io/badge/Supabase-Backend-3ECF8E?style=for-the-badge&logo=supabase" alt="Supabase" /></a>
    <a href="https://vitest.dev/"><img src="https://img.shields.io/badge/Vitest-101_Passed-6E9F18?style=for-the-badge&logo=vitest" alt="Vitest" /></a>
  </p>

> _A enterprise-grade Web3 Self-Sovereign Identity platform anchored on Ethereum Sepolia and Polygon Amoy. Issue, hold, verify, and selectively share tamper-proof W3C Verifiable Credentials with a responsive, high-performance web interface._

</div>

---

## 🚀 Overview

**BLOCKID** is an end-to-end **Self-Sovereign Identity (SSI) ecosystem** designed to restore complete ownership and cryptographic trust to digital identity and academic/professional credentials. Built on **W3C Verifiable Credentials (VC)**, **W3C Decentralized Identifiers (DIDs)**, **OpenID4VC protocols**, and **EVM Smart Contracts**, BLOCKID provides a seamless bridge between issuers, credential holders, and third-party verifiers.

By combining on-chain SHA-256 hash anchoring with **Supabase Row-Level Security (RLS)**, **9 Deno Edge Functions**, **WebAuthn biometrics**, **Google Gemini AI verification**, and **visual certificate rendering**, BLOCKID ensures immutability without sacrificing data privacy or GDPR compliance.

---

## ✨ Key Capabilities & Portal Features

### 🏢 Issuer Portal (`/issuer`)
| Feature | Description |
|---|---|
| 🖨️ **Credential Issuance** | Issue W3C-compliant Verifiable Credentials to holder DIDs (`did:ethr` / `did:key`) |
| 🎛️ **Visual Schema Builder** | Form builder to define custom credential schemas, field types, and validation rules |
| 📦 **Batch Issuance** | Mass-issue credentials via CSV file parsing and batch pipeline |
| ⛓️ **Blockchain Anchoring** | On-chain SHA-256 hash anchoring on Ethereum Sepolia / Polygon Amoy |
| 🔏 **Cryptographic Signing** | Sign credential payloads with MetaMask / EcdsaSecp256k1 keys |
| 🛑 **On-Chain Revocation** | Revoke credentials permanently via the `CredentialRegistry.sol` contract |
| 🖼️ **Dynamic Visual Certificates** | SVG renderer with embedded anti-counterfeit QR codes |
| 📄 **PDF Export** | Export dark-mode PDF certificates with blockchain verification badges |
| 🔗 **OID4VCI Offers** | Issue credentials via OpenID for VC Issuance QR offers |

### 👤 Holder Wallet (`/holder`)
| Feature | Description |
|---|---|
| 💼 **Non-Custodial Wallet** | Secure local storage of credentials tied to the user's DID |
| 🔑 **DID Management** | Generate and manage `did:ethr` and `did:key` identifiers |
| 📲 **QR Code Presentation** | Generate instant verification QR codes linking to public verification links |
| 🔗 **Time-Limited Links** | Share credentials with configurable expiry (1h / 24h / 7d / 30d) |
| 👁️ **Selective Disclosure** | Disclose only selected credential fields while masking sensitive data |
| 🖼️ **Visual Certificate Viewer** | View credential certificates rendered in full SVG/PDF visual layout |
| ⛓️ **On-Chain Status Sync** | Live status badges showing block anchor number and timestamp |
| ⚠️ **Expiration Alerts** | Automated alerts for credentials approaching expiration |
| 🔐 **Biometric Security** | WebAuthn passkey (TouchID / FaceID) wallet protection |

### ✅ Verifier Portal (`/verifier`)
| Feature | Description |
|---|---|
| 🔍 **Cryptographic Verification** | Instant on-chain hash lookup and status validation |
| 📊 **Verifier Analytics** | Analytics dashboard for verification history and trends |
| 🔒 **Tamper Detection** | Detect modified payloads against on-chain anchor hashes |
| 📜 **Verification Requests** | Send structured presentation requests (OID4VP) directly to holder DIDs |
| 📜 **Consent Records** | Immutable consent log tracking holder data access grants |
| 🤖 **AI Verification Risk Engine** | Google Gemini AI evaluating 8 risk dimensions and anomaly scores |

### 👑 Admin & Governance Portal (`/admin`)
| Feature | Description |
|---|---|
| 👥 **Organization & User Management**| Review, approve, or reject new user registrations |
| 📜 **Trusted Issuer Registry** | Manage accredited issuer status and public DID listings |
| 📜 **System-Wide Audit Trail** | Searchable audit log tracking all platform events |
| 🛡️ **Privacy & Data Governance** | Handle GDPR Article 17 (Right to Erasure) & Article 20 (Data Export) requests |

---

## 🛠️ Technology Stack

<div align="center">
  <table>
    <tr>
      <td align="center" width="50%">
        <h3>🎨 Frontend & Client Layer</h3>
        <b>Framework:</b> React 18 + Vite 6<br>
        <b>Language:</b> TypeScript 5.8<br>
        <b>Styling:</b> Tailwind CSS, shadcn/ui, Radix UI<br>
        <b>Animations:</b> Framer Motion<br>
        <b>State Management:</b> TanStack React Query v5<br>
        <b>PDF & Rendering:</b> jsPDF, SVG Canvas<br>
        <b>QR Generation:</b> qrcode.react<br>
        <b>PWA:</b> vite-plugin-pwa (Offline Service Worker)
      </td>
      <td align="center" width="50%">
        <h3>⚙️ Backend & Blockchain Layer</h3>
        <b>BaaS:</b> Supabase (PostgreSQL, Auth, Realtime, RLS)<br>
        <b>Serverless:</b> 9 Deno Edge Functions<br>
        <b>Blockchain Networks:</b> Ethereum Sepolia (Primary), Polygon Amoy (Secondary), Localhost<br>
        <b>Smart Contracts:</b> Hardhat 3.x, Solidity 0.8.19<br>
        <b>Web3:</b> ethers.js v6, MetaMask Extension<br>
        <b>Standards:</b> W3C VC v1, did:ethr, did:key, OID4VCI, OID4VP<br>
        <b>AI Intelligence:</b> Google Gemini AI Gateway
      </td>
    </tr>
  </table>
</div>

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             BLOCKID UI Layer                                │
├───────────────┬────────────────┬───────────────────┬────────────────────────┤
│ Issuer Portal │ Holder Wallet  │ Verifier Portal   │ Admin & Audit Portal   │
│ (`/issuer`)   │ (`/holder`)    │ (`/verifier`)     │ (`/admin`, `/audit`)   │
└───────┬───────┴───────┬────────┴──────────┬────────┴──────────┬─────────────┘
        │               │                   │                   │
        ▼               ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Supabase Cloud / BaaS Layer                           │
│  ├── Auth (Email / Password + Role Approvals)                               │
│  ├── PostgreSQL (13 Tables + Row-Level Security Policies)                   │
│  ├── Realtime WebSockets (Instant Notifications & Status Updates)           │
│  └── Deno Edge Functions (9 Microservices)                                  │
│      ├── issue-credential      ├── anchor-credential                        │
│      ├── verify-credential     ├── anchor-credential-server                 │
│      ├── manage-schemas        ├── resolve-did                              │
│      ├── oid4vci               ├── oid4vp                                   │
│      └── admin-users                                                        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EVM Blockchain Layer (Smart Contracts)                   │
│  Ethereum Sepolia / Polygon Amoy / Hardhat Localhost                        │
│  ├── CredentialRegistry.sol (Solidity 0.8.19)                               │
│      ├── anchorCredential(bytes32 hash)                                     │
│      ├── anchorCredentialBatch(bytes32[] hashes)                            │
│      ├── revokeCredential(bytes32 hash)                                     │
│      ├── getCredentialStatus(bytes32 hash) → (anchored, revoked, issuer...) │
│      ├── getCredentialBatch(bytes32[] hashes)                               │
│      └── isValid(bytes32 hash)                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📦 Getting Started

### 📋 Prerequisites

- 🟢 **Node.js** v18.0.0 or higher
- 🦊 **MetaMask** browser extension (connected to Sepolia or Amoy testnet)
- ☁️ **Supabase** project instance (or local Supabase CLI setup)

### 🛠️ Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/SINISTERgg/block-id.git
   cd block-id
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the project root:
   ```env
   # Supabase Configuration
   VITE_SUPABASE_URL=https://your-supabase-project.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

   # Smart Contract Anchoring Address
   VITE_CREDENTIAL_REGISTRY_ADDRESS=0xYourDeployedContractAddress

   # Network RPC Endpoints
   SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
   AMOY_RPC_URL=https://rpc-amoy.polygon.technology

   # Deployer Private Key (For Hardhat scripts)
   DEPLOYER_PRIVATE_KEY=0xYourPrivateKey
   ETHERSCAN_API_KEY=your_etherscan_api_key
   ```

4. **Apply Database Migrations:**
   Execute all SQL migration scripts located in `supabase/migrations/` sequentially inside your Supabase SQL Editor.

5. **Deploy Smart Contract (Optional):**
   ```bash
   # Deploy to Sepolia
   npm run deploy:sepolia

   # Deploy to Polygon Amoy
   npm run deploy:amoy
   ```

6. **Start Development Server:**
   ```bash
   npm run dev
   ```
   Navigate to `http://localhost:8080` in your web browser.

---

## 📁 Project Structure

```text
block-id/
├── contracts/                  # ⛓️ Solidity Smart Contracts
│   └── CredentialRegistry.sol  #    On-chain SHA-256 anchor & revocation registry
├── scripts/                    # 🔧 Hardhat deployment & test scripts
│   ├── compile.mjs
│   ├── deploy.js
│   └── test-contract.js
├── supabase/
│   ├── functions/              # ⚡ 9 Deno Edge Functions
│   │   ├── admin-users/
│   │   ├── anchor-credential/
│   │   ├── anchor-credential-server/
│   │   ├── issue-credential/
│   │   ├── manage-schemas/
│   │   ├── oid4vci/
│   │   ├── oid4vp/
│   │   ├── resolve-did/
│   │   └── verify-credential/
│   └── migrations/             # 🗄️ Database Schemas, Triggers & RLS Policies
├── src/
│   ├── components/             # 🧩 UI Components & Feature Modals
│   │   ├── issuer/             #    CertificateRenderer, SchemaBuilder, CredentialDataGrid
│   │   ├── wallet/             #    BiometricLockModal
│   │   ├── verifier/           #    AnchorChecker, BulkVerifyDialog, LiveActivityFeed
│   │   ├── admin/              #    Admin management UI
│   │   ├── layout/             #    PortalLayout & Navigation
│   │   ├── ui/                 #    shadcn/ui Primitives
│   │   └── ProtectedRoute.tsx  #    RBAC Route Guard
│   ├── hooks/                  # 🪝 Custom Hooks (useAuth, useWeb3Wallet, useAnchorCredential)
│   ├── lib/                    # 🛠️ Utilities (crypto, generateCertificatePdf, permissions)
│   ├── pages/                  # 📄 Application Route Views
│   │   ├── issuer/             #    IssuerDashboard (DashboardView, IssueView, SchemasView)
│   │   ├── holder/             #    HolderWallet (WalletView, PresentView)
│   │   ├── verifier/           #    VerifierDashboard (VerifyView, HistoryView, AnalyticsView)
│   │   ├── admin/              #    AdminDashboard & OrgManagement
│   │   ├── Landing.tsx         #    Public Landing Page
│   │   ├── Auth.tsx            #    Authentication Portal
│   │   ├── BlockchainExplorer.tsx # In-app Blockchain Anchor Explorer
│   │   ├── AuditLog.tsx        #    Platform Audit Log Viewer
│   │   └── SharedCredential.tsx#    Public Verification Share Page
│   ├── services/               # 📡 Services Layer
│   │   ├── ai/                 #    Google Gemini AI Risk Engine
│   │   ├── api/                #    Supabase API clients (issuer, holder, verifier)
│   │   ├── blockchain/         #    Ethers provider, registry & anchoring services
│   │   └── webauthnService.ts  #    Passkey biometric service
│   ├── App.tsx                 # 🔀 Application Router & Providers
│   └── main.tsx                # 🚀 Entrypoint
├── hardhat.config.js           # ⚙️ Hardhat Multi-Network Configuration
├── vitest.config.ts            # 🧪 Vitest Test Runner Configuration
├── vite.config.ts              # ⚡ Vite & PWA Configuration
└── README.md                   # 📖 Project README
```

---

## 💻 Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start local Vite development server |
| `npm run build` | Build production bundle |
| `npm run preview` | Preview production build locally |
| `npm test` | Run Vitest unit & integration test suite |
| `npm run test:watch` | Run Vitest in interactive watch mode |
| `npm run lint` | Run ESLint across code base |
| `npm run compile` | Compile Solidity smart contracts |
| `npm run test:contract` | Run `CredentialRegistry.sol` smart contract test suite |
| `npm run deploy:sepolia` | Deploy `CredentialRegistry.sol` to Ethereum Sepolia |
| `npm run deploy:amoy` | Deploy `CredentialRegistry.sol` to Polygon Amoy |
| `npm run verify:amoy` | Verify deployed contract on Polygonscan |

---

## 🧪 Testing & Quality Assurance

BLOCKID maintains robust test coverage across frontend utilities, AI engines, permissions, PDF generators, and Solidity smart contracts.

- **Unit & Component Tests**: 101 tests powered by **Vitest**
  - `src/services/ai/credential-ai.service.test.ts` (39 tests for AI risk scores & fallback engine)
  - `src/lib/crypto.test.ts` (23 tests for canonical JSON hashing & SHA-256 calculations)
  - `src/lib/permissions.test.ts` (20 tests for 5 RBAC user roles & permission checks)
  - `src/lib/generateCertificatePdf.test.ts` (12 tests for PDF generator layout & styling)
  - `src/components/ProtectedRoute.test.tsx` (7 tests for route authentication guards)
- **Smart Contract Tests**: Integrated test runner verifying single & batch hash anchoring, duplicate prevention, non-issuer revocation checks, and validity views.
- **CI/CD Pipeline**: GitHub Actions workflow (`.github/workflows/ci.yml`) enforcing automated linting, TypeScript type checking, unit tests, contract tests, and Vite build validation on every push/PR.

```bash
# Run unit & component test suite
npm test

# Run smart contract verification suite
npm run test:contract
```

---

## 🗺️ Roadmap & Phase II Extensions

BLOCKID is systematically evolving according to the **Master Architecture Implementation Index**:

- [x] **Phase 0: Testing & CI/CD Infrastructure** *(Completed)* — 101 Vitest tests, Hardhat test task, GitHub Actions CI pipeline.
- [x] **Phase 3: Decentralized Storage & IPFS** *(Completed)* — Pinata-powered `pin-to-ipfs`/`fetch-from-ipfs` edge functions, schema CID persistence, auto-pinning on first issuance, and issuer portal pin management.
- [ ] **Phase 1: Zero-Knowledge Proofs (ZK-SNARKs)** — Circom age-verification and range circuits, snarkjs client proving, on-chain Groth16 `ZKPVerifier.sol`.
- [ ] **Phase 2: Account Abstraction (ERC-4337)** — Smart accounts, gasless transactions via Paymaster sponsorship.
- [ ] **Phase 4: Universal Interoperability & SIWE** — Sign-In With Ethereum (EIP-4361), OIDC enterprise identity bridge.
- [ ] **Phase 7: Soulbound Tokens (EIP-5192)** — Non-transferable SBT credential badges minted directly on-chain.
- [ ] **Phase 6: Advanced AI & On-Device ML** — TensorFlow.js visual document OCR & anti-forgery RAG pipeline.
- [ ] **Phase 5: Native Mobile App** — Expo React Native mobile wallet with Secure Enclave key storage and NFC sharing.
- [ ] **Phase 8: Biometric Proof Pipeline** — Liveness detection with on-chain biometric hash proof anchoring.

---

## 🛡️ License

Distributed under the **MIT License**. See `LICENSE` for more information.

---

<div align="center">
  <i>Designed and developed with ❤️ for open, trustless digital identity.</i>
</div>
