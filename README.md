<div align="center">
  <img src="public/pwa-192.png" alt="BLOCKID Logo" width="130" />
  
  # 🌐 BLOCKID

  **Enterprise Self-Sovereign Identity (SSI), Verifiable Credentials & Zero-Knowledge Privacy Platform**
  
  <p align="center">
    <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-18.3-blue?style=for-the-badge&logo=react" alt="React 18" /></a>
    <a href="https://vitejs.dev/"><img src="https://img.shields.io/badge/Vite-6.0-purple?style=for-the-badge&logo=vite" alt="Vite 6" /></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.8-blue?style=for-the-badge&logo=typescript" alt="TypeScript" /></a>
    <a href="https://ethereum.org/"><img src="https://img.shields.io/badge/Ethereum-Sepolia_Live-627EEA?style=for-the-badge&logo=ethereum" alt="Ethereum Sepolia" /></a>
    <a href="https://polygon.technology/"><img src="https://img.shields.io/badge/Polygon-Amoy-8247E5?style=for-the-badge&logo=polygon" alt="Polygon Amoy" /></a>
    <a href="https://github.com/iden3/circom"><img src="https://img.shields.io/badge/ZK--SNARKs-Circom_2.0-F5841F?style=for-the-badge" alt="Circom ZK" /></a>
    <a href="https://eips.ethereum.org/EIPS/eip-4337"><img src="https://img.shields.io/badge/ERC--4337-Account_Abstraction-yellow?style=for-the-badge" alt="ERC-4337" /></a>
    <a href="https://eips.ethereum.org/EIPS/eip-5192"><img src="https://img.shields.io/badge/EIP--5192-Soulbound_Tokens-teal?style=for-the-badge" alt="EIP-5192" /></a>
    <a href="https://supabase.com/"><img src="https://img.shields.io/badge/Supabase-BaaS-3ECF8E?style=for-the-badge&logo=supabase" alt="Supabase" /></a>
    <a href="https://vitest.dev/"><img src="https://img.shields.io/badge/Vitest-367_Passed_(16_Suites)-6E9F18?style=for-the-badge&logo=vitest" alt="Vitest" /></a>
  </p>

> _An enterprise-grade Web3 Self-Sovereign Identity platform anchored on Ethereum Sepolia and Polygon. Issue, hold, verify, and selectively disclose tamper-proof W3C Verifiable Credentials with client-side Zero-Knowledge Proofs (Groth16 zk-SNARKs), EIP-5192 Soulbound Tokens, ERC-4337 Account Abstraction, and a multi-detector AI anomaly engine._

</div>

---

## 🚀 Overview

**BLOCKID** is a production-ready, decentralized **Self-Sovereign Identity (SSI)** platform designed to give individuals sovereign control over their digital credentials while providing issuers and verifiers with cryptographic trust and privacy guarantees.

Built strictly on open Web3 standards—including **W3C Verifiable Credentials (VC v1.0)**, **W3C Decentralized Identifiers (DIDs: `did:ethr` and `did:key`)**, **OpenID4VC (OID4VCI / OID4VP)**, **EIP-712 typed data signing**, and **EVM Smart Contracts**—BLOCKID removes custodial intermediaries and prevents credential forgery without violating data privacy or GDPR regulations.

### 🌟 Core Architectural Innovations

- 🔒 **Zero-Knowledge Privacy Layer**: Client-side witness generation and Groth16 zero-knowledge proof generation via `snarkjs` and Circom 2.0 circuits. Prove age thresholds, attribute ranges, or issuer authorization with zero attribute leakage.
- 🎖️ **EIP-5192 Soulbound Credential Tokens (SBT)**: On-chain non-transferable digital credential badges minted directly to holder addresses on Ethereum Sepolia with cryptographic lock verification and instant revocation synchronization.
- ⚡ **ERC-4337 Account Abstraction**: Smart Contract Wallets with non-custodial session keys, scoped operational limits, and gasless transaction sponsorship readiness via Paymasters.
- 🤖 **Multi-Detector AI Anomaly & Fraud Engine**: Real-time evaluation of verification requests using 5 statistical behavioral anomaly detectors (Burst Velocity, Failure Streaks, Geo-Velocity Hops, Temporal Off-Hours, and Latency Spikes) paired with an 8-factor Trust Radar.
- 🔏 **On-Chain Cryptographic Anchoring**: SHA-256 and Poseidon/MiMC-compatible cryptographic roots anchored via gas-optimized smart contracts on Ethereum Sepolia and Polygon Amoy.
- 🔐 **WebAuthn Biometric Anchoring**: Hardware-backed passkey authentication (FaceID, TouchID, Windows Hello) and on-chain biometric commitment anchoring via `BiometricProofAnchor.sol`.
- 📦 **IPFS Decentralized Storage**: Tamper-proof off-chain credential and schema persistence via Pinata IPFS gateways with automatic CID pinning.

---

## ⛓️ Verified Smart Contract Deployments (Sepolia)

BLOCKID smart contracts are deployed, verified, and active on the **Ethereum Sepolia Testnet (Chain ID: 11155111)**:

| Smart Contract | Deployed Address | Standard / Purpose | Explorer Link |
|---|---|---|---|
| **`CredentialRegistry`** | [`0x1FE3Dce86E02C28b7B5c1CaCf83127874fb5D778`](https://sepolia.etherscan.io/address/0x1FE3Dce86E02C28b7B5c1CaCf83127874fb5D778) | Core SHA-256 Anchor & Revocation Registry (v2) | [View on Etherscan](https://sepolia.etherscan.io/address/0x1FE3Dce86E02C28b7B5c1CaCf83127874fb5D778) |
| **`SoulboundCredential`** | [`0xC5B743959e651C2cbb60422B3bC44fFD465B46d8`](https://sepolia.etherscan.io/address/0xC5B743959e651C2cbb60422B3bC44fFD465B46d8) | EIP-5192 Non-Transferable Soulbound Token Badges | [View on Etherscan](https://sepolia.etherscan.io/address/0xC5B743959e651C2cbb60422B3bC44fFD465B46d8) |
| **`SmartWalletRegistry`** | [`0xD7a4375C9bA97B6b5E767AfDbCa48c5d99B68196`](https://sepolia.etherscan.io/address/0xD7a4375C9bA97B6b5E767AfDbCa48c5d99B68196) | ERC-4337 Account Abstraction Smart Account Registry | [View on Etherscan](https://sepolia.etherscan.io/address/0xD7a4375C9bA97B6b5E767AfDbCa48c5d99B68196) |
| **`ERC-4337 EntryPoint`** | `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` | Standard Canonical ERC-4337 EntryPoint v0.6 | [View on Etherscan](https://sepolia.etherscan.io/address/0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789) |
| **Deployer Address** | `0x2887Cc5D846ED52314ed7344fa97Dfd358c86238` | Contract Owner & Platform Administrator | [View on Etherscan](https://sepolia.etherscan.io/address/0x2887Cc5D846ED52314ed7344fa97Dfd358c86238) |

### Additional Smart Contracts (`contracts/`)
- **`ZKPVerifier.sol`**: Universal Groth16 zk-SNARK verification contract executing BN254 elliptic curve pairings via EVM pairing precompile `0x08`.
- **`AgeVerifier.sol`**: Optimized standalone pairing verifier for zero-knowledge age verification.
- **`AttributeRangeVerifier.sol`**: Dedicated verifier for numeric credential range assertions.
- **`IssuerMembershipVerifier.sol`**: Verifier proving membership in an authorized issuer Merkle tree root.
- **`SimpleAccount.sol`**: ERC-4337 compliant smart account implementation with session key validation and paymaster compatibility.
- **`BiometricProofAnchor.sol`**: On-chain anchor for cryptographic biometric commitments and liveness assertions.

---

## 🔮 Zero-Knowledge Proofs (Circom 2.0 & Groth16)

BLOCKID integrates client-side zero-knowledge proofs, allowing holders to satisfy verifier criteria without disclosing raw personal data. Proving is executed directly inside the user's browser using WebAssembly and `snarkjs` in **<250ms**, while verification can happen off-chain or on-chain via EVM pairing precompiles (~215,000 gas).

```
Holder Browser (WASM Witness + Groth16) ────────► zk-SNARK Proof (π_A, π_B, π_C, publicInputs)
                                                            │
                                  ┌─────────────────────────┴─────────────────────────┐
                                  ▼                                                   ▼
                     Client / In-Browser Verifier                       On-Chain EVM Precompiles
                      (snarkjs verification_key)                       (ZKPVerifier.sol - 0x08 pairing)
```

| Circuit (`circuits/`) | Public Signals | Private Signals | Proving Time | Constraint Count |
|---|---|---|---|---|
| **`age-verify.circom`** | `currentYear`, `currentMonth`, `currentDay`, `ageThreshold` | `birthYear`, `birthMonth`, `birthDay`, `nullifier` | ~120 ms | 128 constraints |
| **`attribute-range.circom`** | `minValue`, `maxValue` | `actualValue`, `nullifier` | ~145 ms | 134 constraints |
| **`issuer-membership.circom`** | `expectedRoot`, `nullifierHash` | `issuerId`, `merklePath[]`, `pathIndices[]`, `secret` | ~210 ms | 286 constraints |

Precompiled circuit artifacts (`.wasm`, `_final.zkey`, and `verification_key.json`) are distributed in `public/zkp/` for instant zero-setup browser proving.

---

## 🤖 Multi-Detector Anomaly & Trust Radar Engine

BLOCKID features an integrated AI and statistical fraud detection pipeline (`src/lib/ml/` and `src/services/ai/`) that analyzes every verification event in real time.

```
Incoming Verification Event
             │
   ┌─────────┼───────────────────────┬───────────────────────┬────────────────────────┐
   ▼         ▼                       ▼                       ▼                        ▼
[Burst]  [Failure Streak]     [Geo Velocity Jump]      [Off-Hours]           [Latency Spike]
(Sliding  (Brute-force /      (Haversine distance vs   (Circadian cycle      (Infrastructure /
 Window)   enumeration)        elapsed time >800km/h)   distribution)         replay anomaly)
   │         │                       │                       │                        │
   └─────────┴───────────────────────┼───────────────────────┴────────────────────────┘
                                     ▼
                   [5-Factor Anomaly Risk Score (0-1)]
                                     │
                                     ▼
                   [8-Factor Trust Score Radar (0-100)]
   (Crypto Validity • Issuer Status • Revocation • Schema Conformity •
    Anomaly Penalty • Biometric Assurance • Freshness • Consent Valid)
```

### 5 Real-Time Statistical Detectors
1. **Burst / Velocity Detector**: Detects automated scraping or presentation flooding using a dynamic sliding time-window.
2. **Failure Streak Detector**: Flags credential enumeration attacks or consecutive failed signature checks from an origin.
3. **Geographic Velocity Jump**: Evaluates physical travel feasibility via the Haversine formula; flags presentations occurring faster than supersonic travel velocities (>800 km/h).
4. **Off-Hours Anomaly Detector**: Scores verifications occurring outside normal operational timezone distributions.
5. **Latency Spike Detector**: Flags anomalous network or proving latency that signals man-in-the-middle tampering or replay attacks.

---

## ✨ Portal Capabilities

### 🏢 Issuer Portal (`/issuer`)
- **Credential Issuance**: Issue W3C-compliant Verifiable Credentials to holder DIDs (`did:ethr` / `did:key`).
- **Visual Schema Builder**: Define custom JSON-LD schemas, typed fields, and strict validation criteria.
- **Batch Issuance**: Mass-issue hundreds of credentials via CSV upload and automated background anchoring.
- **EIP-5192 SBT Minting**: Mint non-transferable Soulbound tokens directly to the holder's Ethereum address.
- **IPFS Pinning**: Automatically pin schemas and credential metadata to IPFS via Pinata.
- **Cryptographic Signing**: MetaMask / EcdsaSecp256k1 signature generation with EIP-712 support.
- **On-Chain Revocation**: Revoke credentials irreversibly via `CredentialRegistry.sol`.
- **Dynamic Visual Rendering**: Real-time SVG rendering with embedded anti-counterfeit QR codes and export to dark-mode PDF certificates.

### 👤 Holder Wallet (`/holder`)
- **Non-Custodial Vault**: Secure IndexedDB/local credential vault encrypted to the holder's DID.
- **DID Identity Manager**: Generate and switch between `did:ethr` and `did:key` identifiers.
- **Zero-Knowledge Prover**: Generate Groth16 zk-SNARK proofs locally without exposing raw personal data.
- **Soulbound Badges Gallery**: View and verify on-chain EIP-5192 Soulbound Tokens minted to your address.
- **Selective Disclosure**: Reveal only verifier-requested attributes while cryptographically masking remaining fields.
- **Biometric Security**: Protect wallet unlocking with WebAuthn passkeys (TouchID, FaceID, Windows Hello).
- **Time-Limited Presentations**: Generate QR codes and time-decayed sharing links (1 hour to 30 days).

### ✅ Verifier Portal (`/verifier`)
- **Cryptographic Registry Verification**: Instant on-chain state queries against `CredentialRegistry.sol` on Sepolia.
- **In-Browser & On-Chain ZKP Verifier**: Validate zero-knowledge proofs both locally and via smart contract precompiles.
- **Multi-Detector Threat Scoring**: Real-time evaluation with 5 anomaly detectors and 8-factor Trust Radar.
- **Tamper Detection Engine**: Detect single-bit payload alterations against on-chain SHA-256 anchor hashes.
- **Verification Audit Trail**: Comprehensive history of all verifications, proofs submitted, and consent records.
- **OID4VP Presentations**: Request and receive structured presentation exchanges adhering to OpenID4VP.

### 👑 Admin & Governance Portal (`/admin`)
- **Accredited Issuer Registry**: Verify, onboard, or revoke trusted institutional issuers.
- **User Role Management**: Role-based access control (RBAC) governing Issuers, Holders, Verifiers, and Admins.
- **Platform Audit Trail**: Searchable event stream tracking all issuances, anchors, revokes, and verifications.
- **GDPR Privacy Compliance**: Self-service tools implementing GDPR Article 17 (Right to Erasure) and Article 20 (Data Portability).

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                 PRESENTATION LAYER                                      │
├───────────────────┬───────────────────┬──────────────────────┬──────────────────────────┤
│   Issuer Portal   │   Holder Wallet   │   Verifier Portal    │   Admin & Audit Portal   │
│    (`/issuer`)    │    (`/holder`)    │    (`/verifier`)     │  (`/admin`, `/audit`)    │
└─────────┬─────────┴─────────┬─────────┴──────────┬───────────┴────────────┬─────────────┘
          │                   │                    │                        │
          ▼                   ▼                    ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           CRYPTOGRAPHY & CLIENT AI LAYER                                │
│  ├── snarkjs + Circom 2.0 (Groth16 ZK-SNARK Prover & Verifier)                          │
│  ├── Multi-Detector Anomaly Engine (5 Detectors + 8-Factor Trust Radar)                 │
│  ├── WebAuthn / Passkeys (Hardware Biometric Cryptography)                              │
│  ├── Ethers.js v6 (EIP-712 Signing, EVM Provider, ABI Interfaces)                      │
│  └── Pinata IPFS Gateway (Decentralized Storage & CID Resolution)                       │
└─────────────────────────────────────────┬───────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                               SUPABASE CLOUD / BaaS LAYER                               │
│  ├── Auth & RBAC (Role-Based Session Guards & Registration Approvals)                   │
│  ├── PostgreSQL Database (13 Tables, Row-Level Security Policies)                       │
│  ├── Realtime WebSockets (Live Anchoring Notifications & Status Feeds)                  │
│  └── 9 Deno Edge Functions (Serverless Microservices)                                   │
│      ├── issue-credential          ├── anchor-credential         ├── verify-credential  │
│      ├── anchor-credential-server   ├── manage-schemas            ├── resolve-did        │
│      ├── oid4vci                   ├── oid4vp                    ├── admin-users        │
└─────────────────────────────────────────┬───────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                        EVM BLOCKCHAIN LAYER (SMART CONTRACTS)                           │
│  Ethereum Sepolia (Chain 11155111) / Polygon Amoy / Local Hardhat                       │
│  ├── CredentialRegistry.sol     ── SHA-256 batch anchor, status lookup, revocation     │
│  ├── SoulboundCredential.sol    ── EIP-5192 non-transferable credential tokens (SBT)    │
│  ├── SmartWalletRegistry.sol    ── ERC-4337 Account Abstraction smart account registry  │
│  ├── SimpleAccount.sol          ── ERC-4337 smart wallet with session keys             │
│  ├── ZKPVerifier.sol            ── BN254 pairing precompile verifier (Groth16)          │
│  └── BiometricProofAnchor.sol   ── Cryptographic biometric commitment anchor            │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Technology Stack

<div align="center">
  <table>
    <tr>
      <td width="50%" valign="top">
        <h3>🎨 Frontend & Client Layer</h3>
        <ul>
          <li><b>Framework:</b> React 18.3 + Vite 6.0</li>
          <li><b>Language:</b> TypeScript 5.8 (Strict Mode)</li>
          <li><b>Styling:</b> Tailwind CSS, shadcn/ui, Radix UI Primitives</li>
          <li><b>Animations:</b> Framer Motion 12</li>
          <li><b>State Management:</b> TanStack React Query v5</li>
          <li><b>ZKP Proving:</b> snarkjs 0.7.6 + Circom WASM</li>
          <li><b>Data Visualization:</b> Recharts (Trust Radar & Analytics)</li>
          <li><b>PDF & Certificates:</b> jsPDF + SVG Vector Rendering</li>
          <li><b>PWA:</b> vite-plugin-pwa (Offline Service Worker)</li>
        </ul>
      </td>
      <td width="50%" valign="top">
        <h3>⛓️ Web3, Backend & Cryptography</h3>
        <ul>
          <li><b>Smart Contracts:</b> Solidity 0.8.19 + Hardhat 2.22</li>
          <li><b>Web3 Library:</b> ethers.js v6.16</li>
          <li><b>ZK Circuits:</b> Circom 2.0 (Age, Range, Merkle Membership)</li>
          <li><b>BaaS / DB:</b> Supabase (PostgreSQL 15, Auth, RLS)</li>
          <li><b>Serverless:</b> 9 Deno Edge Functions</li>
          <li><b>Decentralized Storage:</b> Pinata IPFS API</li>
          <li><b>Standards:</b> W3C VC, W3C DID, OID4VCI, OID4VP, EIP-712, EIP-4337, EIP-5192</li>
          <li><b>Biometrics:</b> WebAuthn API (FIDO2 / Passkeys)</li>
        </ul>
      </td>
    </tr>
  </table>
</div>

---

## 📁 Project Structure

```text
block-id/
├── circuits/                       # 🔮 Circom 2.0 Zero-Knowledge Circuits
│   ├── age-verify.circom           #    Zero-knowledge age threshold verification
│   ├── attribute-range.circom      #    Zero-knowledge numerical range assertion
│   └── issuer-membership.circom    #    Merkle proof of issuer accreditation
├── contracts/                      # ⛓️ Solidity Smart Contracts (0.8.19)
│   ├── CredentialRegistry.sol      #    On-chain SHA-256 anchor & revocation registry
│   ├── SoulboundCredential.sol     #    EIP-5192 Non-Transferable Soulbound Token
│   ├── SmartWalletRegistry.sol     #    ERC-4337 Account Abstraction smart account registry
│   ├── SimpleAccount.sol           #    ERC-4337 Smart Account with session key support
│   ├── ZKPVerifier.sol             #    Universal BN254 Groth16 pairing verifier
│   ├── AgeVerifier.sol             #    Precompiled age circuit verifier
│   ├── AttributeRangeVerifier.sol  #    Precompiled range circuit verifier
│   ├── IssuerMembershipVerifier.sol#    Precompiled membership circuit verifier
│   └── BiometricProofAnchor.sol    #    Biometric commitment anchor
├── deployments/                    # 📜 Deployment Records & Verified Contract Addresses
│   ├── sepolia.json                #    Sepolia deployments (Registry & SmartWalletRegistry)
│   └── sbt-sepolia.json            #    Sepolia deployment (SoulboundCredential SBT)
├── public/
│   └── zkp/                        # ⚡ Precompiled ZK Proving & Verification Artifacts
│       ├── age-verify/             #    .wasm, _final.zkey, verification_key.json
│       ├── attribute-range/        #    .wasm, _final.zkey, verification_key.json
│       └── issuer-membership/      #    .wasm, _final.zkey, verification_key.json
├── scripts/                        # 🔧 Compilation, Circuit & Deployment Automation
│   ├── build-circuits.mjs          #    Compiles Circom circuits & generates snarkjs keys
│   ├── compile.mjs                 #    Compiles Solidity contracts via Hardhat
│   ├── deploy.js                   #    Multi-network deployment script (Sepolia/Amoy/Local)
│   └── test-contract.js            #    Ethers-based smart contract test runner
├── src/
│   ├── components/                 # 🧩 React UI Components
│   │   ├── issuer/                 #    CertificateRenderer, SchemaBuilder, IssueForm
│   │   ├── wallet/                 #    BiometricLockModal, SBTBadgeCard
│   │   ├── verifier/               #    AnchorChecker, TrustScoreRadar, AnomalyBanner
│   │   ├── admin/                  #    AuditTable, OrgApprovalList
│   │   └── ProtectedRoute.tsx      #    Role-Based Route Guard
│   ├── hooks/                      # 🪝 Custom Hooks (useAuth, useWeb3Wallet, useZKP)
│   ├── lib/                        # 🛠️ Core Libraries & Engines
│   │   ├── zkp.ts                  #    Browser snarkjs Groth16 proving engine
│   │   ├── ml/
│   │   │   ├── anomaly.ts          #    5-detector statistical anomaly engine
│   │   │   └── trustScore.ts       #    8-factor Trust Score calculation engine
│   │   ├── accountAbstraction.ts   #    ERC-4337 user-op & session key helpers
│   │   ├── crypto.ts               #    Canonical JSON hashing & SHA-256 calculation
│   │   ├── ipfs.ts                 #    Pinata IPFS pinning and CID resolution
│   │   ├── permissions.ts          #    RBAC permission definitions
│   │   └── generateCertificatePdf.ts # PDF certificate vector renderer
│   ├── pages/                      # 📄 Route Pages
│   │   ├── issuer/                 #    IssuerDashboard (Dashboard, Issue, Schemas)
│   │   ├── holder/                 #    HolderWallet (Wallet, Badges, Present, Security)
│   │   ├── verifier/               #    VerifierDashboard (Verify, History, Analytics)
│   │   ├── admin/                  #    AdminDashboard & OrgManagement
│   │   ├── Landing.tsx             #    Public Landing Page
│   │   ├── Auth.tsx                #    Authentication & Role Selection
│   │   ├── BlockchainExplorer.tsx  #    On-Chain Anchor Explorer
│   │   ├── AuditLog.tsx            #    Searchable System Audit Log
│   │   └── SharedCredential.tsx    #    Public One-Click Verification Share Link
│   ├── services/                   # 📡 API, Blockchain & AI Services
│   │   ├── zkp/                    #    ZKP Proving and Verification Service
│   │   ├── blockchain/             #    Ethers provider, Registry & SBT services
│   │   ├── ai/                     #    Gemini AI verification service
│   │   └── biometrics/             #    WebAuthn passkey registration & authentication
│   ├── App.tsx                     # 🔀 Application Router & Query Client
│   └── main.tsx                    # 🚀 Vite Entrypoint
├── supabase/
│   ├── functions/                  # ⚡ 9 Deno Serverless Edge Functions
│   │   ├── admin-users/            #    User approval & administrative management
│   │   ├── anchor-credential/      #    Client transaction anchor verification
│   │   ├── anchor-credential-server/#   Automated server-side gasless anchoring
│   │   ├── issue-credential/       #    W3C VC schema validation & issuance
│   │   ├── manage-schemas/         #    JSON-LD Schema CRUD operations
│   │   ├── oid4vci/                #    OpenID for Verifiable Credential Issuance
│   │   ├── oid4vp/                 #    OpenID for Verifiable Presentations
│   │   ├── resolve-did/            #    DID resolution service (did:ethr & did:key)
│   │   └── verify-credential/      #    Multi-step verification & anomaly evaluation
│   └── migrations/                 # 🗄️ PostgreSQL Database Schemas, RLS & Triggers
├── implementation plans phase2/    # 📄 Academic Publications, Benchmarks & Review Artifacts
│   ├── BLOCKID_IEEE_MASTER_ARTIFACTS.md # Comprehensive IEEE research paper & benchmark data
│   ├── BLOCKID_Figures_Viewer.html      # Interactive publication figures & charts viewer
│   └── evaluation-viewer.html           # Empirical dataset & evaluation dashboard
├── hardhat.config.js               # ⚙️ Hardhat Multi-Network Configuration
├── vitest.config.ts                # 🧪 Vitest Test Runner Configuration
├── vite.config.ts                  # ⚡ Vite Configuration & Plugins
└── README.md                       # 📖 Platform Documentation
```

---

## 📦 Getting Started

### 📋 Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm** or **bun** package manager
- **MetaMask** browser extension (configured with Sepolia or Polygon Amoy)
- **Supabase Account**: Project URL and API keys

### 🛠️ Installation & Setup

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/SINISTERgg/block-id.git
   cd block-id
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory:
   ```env
   # Supabase Configuration
   VITE_SUPABASE_URL=https://your-supabase-project.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

   # Deployed Contract Addresses (Ethereum Sepolia)
   VITE_CREDENTIAL_REGISTRY_ADDRESS=0x1FE3Dce86E02C28b7B5c1CaCf83127874fb5D778
   VITE_SBT_CONTRACT_ADDRESS=0xC5B743959e651C2cbb60422B3bC44fFD465B46d8
   VITE_SMART_WALLET_REGISTRY_ADDRESS=0xD7a4375C9bA97B6b5E767AfDbCa48c5d99B68196

   # Network RPC Endpoints
   SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
   AMOY_RPC_URL=https://rpc-amoy.polygon.technology

   # Deployer Private Key (For Hardhat scripts)
   DEPLOYER_PRIVATE_KEY=your_private_key_here
   ETHERSCAN_API_KEY=your_etherscan_api_key
   PINATA_JWT=your_pinata_jwt_here
   ```

4. **Compile Smart Contracts:**
   ```bash
   npm run compile
   ```

5. **Build Zero-Knowledge Circuits (Optional - Precompiled Artifacts Included):**
   ```bash
   npm run build:circuits
   ```

6. **Start Local Development Server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:8080` in your browser.

---

## 💻 Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Launch local Vite development server with HMR |
| `npm run build` | Compile and bundle production application |
| `npm run preview` | Preview production build locally |
| `npm test` | Run complete Vitest unit & integration test suite (16 test files) |
| `npm run test:watch` | Run Vitest in interactive watch mode |
| `npm run lint` | Run ESLint syntax and style analysis |
| `npm run compile` | Compile all Solidity smart contracts using Hardhat |
| `npm run build:circuits` | Compile Circom circuits and generate snarkjs proving keys |
| `npm run test:contract` | Run Hardhat contract test suite for `CredentialRegistry.sol` |
| `npm run deploy:sepolia` | Deploy smart contracts to Ethereum Sepolia |
| `npm run deploy:amoy` | Deploy smart contracts to Polygon Amoy |
| `npm run verify:amoy` | Verify deployed contracts on Polygonscan |

---

## 🧪 Testing & Validation

BLOCKID maintains extensive unit, integration, and smart contract test coverage.

### 📊 Test Suite Summary: **367 Tests Passing Across 16 Suites**

```
✓ src/lib/crypto.test.ts                        (23 tests)  Canonical JSON hashing, SHA-256 calculation
✓ src/lib/permissions.test.ts                   (20 tests)  5 RBAC user roles, permissions, route guards
✓ src/services/ai/credential-ai.service.test.ts (39 tests)  AI risk analysis, anomaly scoring, fallback
✓ src/lib/ml/anomaly.test.ts                    (28 tests)  5-detector statistical anomaly engine
✓ src/lib/ml/trustScore.test.ts                 (25 tests)  8-factor Trust Radar calculation & weighting
✓ src/lib/zkp.test.ts                           (22 tests)  Client snarkjs Groth16 witness & proof flow
✓ src/services/blockchain/sbt.service.test.ts   (24 tests)  EIP-5192 Soulbound Token mint & lock views
✓ src/lib/accountAbstraction.test.ts            (26 tests)  ERC-4337 smart accounts & session keys
✓ src/services/auth/siwe.service.test.ts        (21 tests)  Sign-In With Ethereum (EIP-4361) flow
✓ src/lib/siwe.test.ts                          (18 tests)  SIWE message formatting & signature validation
✓ src/services/biometrics/biometric.service.test.ts (19 tests) WebAuthn registration & verification
✓ src/lib/biometrics/liveness.test.ts           (17 tests)  Biometric liveness assurance & challenge response
✓ src/services/blockchain/biometricAnchor.service.test.ts (16 tests) Biometric commitment anchoring
✓ src/lib/ipfs.test.ts                          (22 tests)  Pinata IPFS upload, CID formatting, fetch
✓ src/lib/generateCertificatePdf.test.ts        (15 tests)  PDF vector rendering, badges & layout
✓ src/components/ProtectedRoute.test.tsx        (32 tests)  Authentication guards, role approvals, redirects
```

### Running Tests
```bash
# Run all unit and integration tests
npm test

# Run smart contract verification tests
npm run test:contract
```

---

## 📚 Academic & Research Publications

BLOCKID includes comprehensive research papers, empirical benchmarks, and interactive evaluation viewers in the `implementation plans phase2/` directory:

- **IEEE Format Research Paper**: `BLOCKID_IEEE_MASTER_ARTIFACTS.md` — Formal technical paper detailing the 4-layer architecture, gas benchmarking (Sepolia vs. Amoy), latency comparisons, and security threat models.
- **Interactive Figures & Charts Viewer**: `BLOCKID_Figures_Viewer.html` — Interactive HTML visualization of system sequence flows, architecture diagrams, and benchmark charts.
- **Empirical Evaluation Dashboard**: `evaluation-viewer.html` — Live interactive dashboard rendering the 500-event anomaly evaluation dataset, ROC curves, and detector precision/recall metrics.

---

## 🛡️ License

This project is open-source and distributed under the **MIT License**. See the `LICENSE` file for more details.

---

<div align="center">
  <i>Engineered for sovereign, privacy-preserving, and trustless digital identity.</i>
</div>
