<div align="center">
  <img src="public/pwa-192.png" alt="BLOCKID Logo" width="150" />
  
  # 🌐 BLOCKID
  
  **Blockchain-Based Self-Sovereign Identity Platform**
  
  <p align="center">
    <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-18-blue?style=for-the-badge&logo=react" alt="React" /></a>
    <a href="https://vitejs.dev/"><img src="https://img.shields.io/badge/Vite-5-purple?style=for-the-badge&logo=vite" alt="Vite" /></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript" alt="TypeScript" /></a>
    <a href="https://ethereum.org/"><img src="https://img.shields.io/badge/Ethereum-Sepolia-627EEA?style=for-the-badge&logo=ethereum" alt="Ethereum" /></a>
    <a href="https://supabase.com/"><img src="https://img.shields.io/badge/Supabase-Backend-3ECF8E?style=for-the-badge&logo=supabase" alt="Supabase" /></a>
  </p>

> _A full-stack W3C Verifiable Credentials and Blockchain Identity platform anchored on Ethereum Sepolia. Issue, hold, verify, and share tamper-proof credentials with a beautiful, premium UI._

</div>

---

## 🚀 Overview

**BLOCKID** is a comprehensive **Web3 Self-Sovereign Identity (SSI) platform** that brings transparency, security, and true ownership to digital credentials. By combining **W3C Verifiable Credentials**, **Ethereum blockchain anchoring**, and a **Supabase** backend, BLOCKID creates a trustless ecosystem where Issuers, Holders, and Verifiers can seamlessly interact with immutable, cryptographically verifiable records.

Whether for university degrees, professional certifications, employment records, or event attendance, BLOCKID provides the decentralized foundation to issue, manage, and prove digital identity. 🛡️

---

## ✨ Feature Set

### 🏢 Issuer Portal

| Feature | Description |
|---|---|
| 🖨️ **Credential Issuance** | Issue W3C-compliant Verifiable Credentials to any holder DID |
| 🎛️ **Schema Builder** | Visual form builder for defining credential schemas with custom fields |
| 📦 **Batch Issuance** | Issue credentials to multiple holders at once via CSV |
| ⛓️ **Blockchain Anchoring** | SHA-256 hash of every credential anchored on Ethereum Sepolia |
| 🔏 **Wallet Signing** | Optionally sign credentials with MetaMask for cryptographic proof |
| 🛑 **On-Chain Revocation** | Revoke credentials permanently via the `CredentialRegistry` smart contract |
| 🖼️ **Visual Certificate** | Generate premium SVG certificates with embedded anti-counterfeit QR codes |
| 📄 **PDF Export** | Export dark-mode PDF certificates with blockchain verification QR |
| 🔗 **OID4VCI Offers** | Create QR-based credential offer flows (OpenID for VC Issuance) |

### 👤 Holder Wallet

| Feature | Description |
|---|---|
| 💼 **Non-Custodial Wallet** | Securely store credentials tied to your decentralized identifier |
| 🔑 **DID Generation** | Auto-generate `did:ethr:sepolia` identifiers from your MetaMask wallet |
| 📲 **QR Code Sharing** | Generate verification QR codes that link to `/verify?hash=...` |
| 🔗 **Secure Share Links** | Time-limited share links (1h / 24h / 7d / 30d expiry) |
| 👁️ **Selective Disclosure** | Choose exactly which credential fields to reveal when sharing |
| 🖼️ **Visual Certificate** | View credentials as premium SVG certificates with all fields prefilled |
| ⛓️ **On-Chain Status** | Live blockchain status badge per credential |
| ⚠️ **Expiry Alerts** | Proactive banner for credentials expiring within 30 days |

### ✅ Verifier Portal

| Feature | Description |
|---|---|
| 🔍 **Credential Verification** | Instant cryptographic verification via hash lookup |
| 📊 **Verifier Dashboard** | Send verification requests to holders by DID |
| 🔒 **Tamper Detection** | On-chain hash comparison guarantees data integrity |
| ⏱️ **Time-Limited Access** | Shared credential data expires automatically |
| 📜 **Consent Management** | Holders explicitly grant or deny permanent storage of shared data |

### 🔗 Platform-Wide Capabilities

| Feature | Description |
|---|---|
| 🌐 **Blockchain Explorer** | In-app explorer for on-chain credential and transaction history |
| 📜 **Audit Log** | Immutable history of all credential actions for compliance |
| 👥 **RBAC** | Role-based access control: Issuer / Holder / Verifier / Admin |
| 🔔 **Real-Time Updates** | Live credential events via Supabase Realtime subscriptions |
| 📱 **PWA Support** | Installable as a Progressive Web App on desktop and mobile |
| 🤖 **AI Assistant** | Gemini-powered AI for schema suggestions and anomaly detection |
| 🔍 **DID Resolver** | Resolve and inspect any `did:ethr` identifier on-chain |
| 🛡️ **Privacy Center** | Manage data sharing preferences and consent history |

---

## 🛠️ Technology Stack

<div align="center">
  <table>
    <tr>
      <td align="center" width="50%">
        <h3>🎨 Frontend</h3>
        <b>Framework:</b> <a href="https://react.dev/">React 18</a> + <a href="https://vitejs.dev/">Vite 5</a><br>
        <b>Language:</b> <a href="https://www.typescriptlang.org/">TypeScript 5</a><br>
        <b>Styling:</b> <a href="https://tailwindcss.com/">Tailwind CSS</a><br>
        <b>UI:</b> <a href="https://ui.shadcn.com/">shadcn/ui</a>, <a href="https://www.radix-ui.com/">Radix UI</a>, <a href="https://www.framer.com/motion/">Framer Motion</a><br>
        <b>Charts:</b> <a href="https://recharts.org/">Recharts</a><br>
        <b>QR Codes:</b> qrcode.react<br>
        <b>PDF:</b> jsPDF
      </td>
      <td align="center" width="50%">
        <h3>⚙️ Backend & Blockchain</h3>
        <b>BaaS:</b> <a href="https://supabase.com/">Supabase</a> (Auth, Postgres, Realtime, RLS)<br>
        <b>Blockchain:</b> Ethereum Sepolia (EVM)<br>
        <b>Smart Contracts:</b> <a href="https://hardhat.org/">Hardhat</a> + Solidity<br>
        <b>Wallet:</b> MetaMask + ethers.js<br>
        <b>Standards:</b> W3C Verifiable Credentials v1, did:ethr<br>
        <b>Protocols:</b> OID4VCI, OID4VP
      </td>
    </tr>
  </table>
</div>

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                   BLOCKID Platform                   │
├───────────────┬────────────────┬────────────────────┤
│  Issuer Portal│  Holder Wallet │  Verifier Portal   │
│  (Issue, Sign │  (Store, Share,│  (Verify, Request, │
│   Revoke, PDF)│   Present, QR) │   Audit, Inspect)  │
└───────┬───────┴───────┬────────┴──────────┬─────────┘
        │               │                   │
        ▼               ▼                   ▼
┌─────────────────────────────────────────────────────┐
│              Supabase (Backend Layer)                │
│   Auth · PostgreSQL · Row-Level Security · Realtime  │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│          Ethereum Sepolia (Blockchain Layer)          │
│    CredentialRegistry.sol · SHA-256 Hash Anchoring   │
│    On-Chain Revocation · Block Explorer Integration  │
└─────────────────────────────────────────────────────┘
```

---

## 📦 Getting Started

### 📋 Prerequisites

- 🟢 [Node.js](https://nodejs.org/) v18+
- 🦊 [MetaMask](https://metamask.io/) browser extension (for blockchain features)
- ☁️ [Supabase](https://supabase.com/) account (free tier works)

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

3. **Set up environment variables** — create a `.env` file in the root:

   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
   VITE_CREDENTIAL_REGISTRY_ADDRESS=your_deployed_contract_address
   SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
   ```

4. **Apply database migrations** — run each file in `supabase/migrations/` in order via your Supabase SQL Editor.

5. **Start the development server:**

   ```bash
   npm run dev
   ```

6. **Deploy smart contracts** (optional — for on-chain anchoring):

   ```bash
   npx hardhat run scripts/deploy.js --network sepolia
   ```

---

## 📁 Project Structure

```text
block-id/
├── contracts/               # ⛓️ Solidity smart contracts
│   └── CredentialRegistry.sol
├── scripts/                 # 🔧 Hardhat deployment scripts
├── supabase/
│   └── migrations/          # 🗄️ Database schema & RLS policies
├── src/
│   ├── components/          # 🧩 Reusable UI components
│   │   ├── issuer/          #    CertificateRenderer, SchemaBuilder, CredentialDataGrid
│   │   ├── layout/          #    Portal layouts, navigation
│   │   └── ui/              #    shadcn/ui primitives
│   ├── hooks/               # 🪝 Custom React hooks (useAuth, useWeb3Wallet, etc.)
│   ├── lib/                 # 🛠️ Utilities (crypto, PDF generator, permissions)
│   ├── pages/
│   │   ├── holder/          # 💼 Holder wallet & credential management
│   │   ├── issuer/          # 🏢 Issue, Schemas, Issuer Dashboard
│   │   ├── verifier/        # ✅ Verify, Request credentials
│   │   ├── admin/           # 👑 Organization & admin management
│   │   ├── SharedCredential.tsx  # 🔗 Public share link viewer
│   │   ├── BlockchainExplorer.tsx
│   │   └── AuditLog.tsx
│   ├── services/            # 📡 API services & blockchain integration
│   ├── App.tsx              # 🔀 Routing
│   └── main.tsx             # 🚀 Application entry point
├── public/                  # 🌐 Static assets & PWA manifest
├── hardhat.config.js        # ⚙️ Hardhat configuration
├── vite.config.ts           # ⚡ Vite bundler configuration
└── README.md                # 📖 This file
```

---

## 🔑 Key User Flows

### Issuing a Credential
1. Issuer logs in → **Issue Credentials** tab
2. Selects a schema, enters holder DID and fills in credential fields
3. Optionally signs with MetaMask wallet
4. Credential is stored in Supabase + SHA-256 hash anchored on Ethereum Sepolia
5. Holder receives the credential in their wallet in real-time

### Sharing a Credential
1. Holder opens wallet → clicks **Share** on any active credential
2. Selects expiry duration and optionally enables Selective Disclosure
3. A time-limited unique URL + QR code is generated
4. Verifier scans QR or opens the link to view credential details

### Verifying a Credential
1. Verifier navigates to `/shared/:token` or scans the holder's QR code
2. Credential fields are displayed with selective disclosure applied
3. The blockchain anchor hash is shown for independent on-chain verification

---

## 🛡️ Security & Privacy

- **Non-custodial** — private keys never leave the user's browser or MetaMask
- **Row-Level Security** — Supabase RLS enforces per-user data isolation at the database level
- **Selective Disclosure** — holders control exactly which fields are revealed in each share
- **Time-limited sharing** — share links expire automatically; no persistent access without consent
- **On-chain immutability** — credential hashes on Ethereum cannot be altered or deleted

---

## 🛡️ License

This project is licensed under the **MIT License** — see the LICENSE file for details.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the issues page.

---

<p align="center">
  <i>Built by Hoysala Sathyanarayana · Powered by Ethereum, Supabase & React</i>
</p>
