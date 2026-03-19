# DecentraID — Self-Hosting Guide

Complete guide to run DecentraID independently on your own Supabase project + any static hosting provider.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Create a Supabase Project](#2-create-a-supabase-project)
3. [Run Database Migrations](#3-run-database-migrations)
4. [Deploy Edge Functions](#4-deploy-edge-functions)
5. [Configure Authentication](#5-configure-authentication)
6. [Configure Frontend Environment](#6-configure-frontend-environment)
7. [Build & Deploy Frontend](#7-build--deploy-frontend)
8. [AI-Powered Verification (Optional)](#8-ai-powered-verification-optional)
9. [Verify Everything Works](#9-verify-everything-works)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | 18+ | [nvm](https://github.com/nvm-sh/nvm) |
| **Supabase CLI** | Latest | `npm install -g supabase` |
| **Git** | Any | [git-scm.com](https://git-scm.com) |

---

## 2. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Click **New Project** → choose a name, set a **database password** (save this!), select a region
3. Once created, go to **Settings → API** and note down:

| Value | Where to Find | Used For |
|-------|---------------|----------|
| **Project URL** | Settings → API → Project URL | `VITE_SUPABASE_URL` |
| **Anon/Public Key** | Settings → API → `anon` `public` | `VITE_SUPABASE_PUBLISHABLE_KEY` |
| **Service Role Key** | Settings → API → `service_role` | Edge Functions (server-side only) |
| **Project Ref** | Settings → General → Reference ID | `VITE_SUPABASE_PROJECT_ID` |

---

## 3. Run Database Migrations

### Option A: Using Supabase CLI (Recommended)

```bash
# Clone the repo
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>

# Link to your Supabase project
supabase login
supabase link --project-ref <YOUR_PROJECT_REF>

# Push all migrations
supabase db push
```

This will run all 14 migration files in order, creating:

### Tables Created
| Table | Purpose |
|-------|---------|
| `profiles` | User profiles with DID, wallet address |
| `user_roles` | Role-based access (issuer/holder/verifier) |
| `credentials` | Issued verifiable credentials |
| `credential_schemas` | Schema definitions for credential types |
| `credential_shares` | Shared credential links with expiration |
| `verification_requests` | Verification history & AI analysis |
| `audit_logs` | Full activity trail |
| `notifications` | Real-time notification system |
| `trusted_issuers` | Trusted issuer registry |
| `status_lists` | W3C Status List 2021 support |
| `consent_records` | GDPR consent management |
| `data_deletion_requests` | Data deletion request tracking |
| `oid4vc_sessions` | OpenID4VCI/VP session management |

### Database Functions Created
| Function | Purpose |
|----------|---------|
| `generate_did(_user_id)` | Generates a `did:decentraid:` identifier |
| `has_role(_user_id, _role)` | Security-definer role check for RLS |
| `handle_new_user()` | Trigger: auto-creates profile & role on signup |
| `notify_credential_issued()` | Trigger: notifies holder on new credential |
| `notify_credential_status_change()` | Trigger: notifies on revocation/expiration |
| `check_credential_expiration()` | Trigger: auto-expires credentials |

### Enum Created
```sql
app_role: 'issuer' | 'holder' | 'verifier'
```

### Option B: Manual SQL (If CLI doesn't work)

1. Go to **Supabase Dashboard → SQL Editor**
2. Run each migration file in `supabase/migrations/` **in chronological order** (sorted by filename)
3. Files are named `YYYYMMDDHHMMSS_<uuid>.sql` — run them oldest first

### Verify Triggers Are Active

After migrations, confirm these triggers exist in the Supabase Dashboard → Database → Triggers:

| Trigger | Table | Event |
|---------|-------|-------|
| `on_auth_user_created` | `auth.users` | AFTER INSERT |
| `on_credential_issued` | `credentials` | AFTER INSERT |
| `on_credential_status_change` | `credentials` | AFTER UPDATE |
| `on_credential_update` | `credentials` | BEFORE UPDATE |

> ⚠️ If the `on_auth_user_created` trigger is missing, user signup will fail silently. Create it manually:
> ```sql
> CREATE TRIGGER on_auth_user_created
>   AFTER INSERT ON auth.users
>   FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
> ```

---

## 4. Deploy Edge Functions

### Deploy All Functions

```bash
# Make sure you're linked (from step 3)
supabase functions deploy issue-credential --no-verify-jwt
supabase functions deploy verify-credential --no-verify-jwt
supabase functions deploy resolve-did --no-verify-jwt
supabase functions deploy oid4vci --no-verify-jwt
supabase functions deploy oid4vp --no-verify-jwt
```

> The `--no-verify-jwt` flag is required because JWT verification is handled in the function code itself.

### Edge Functions Overview

| Function | Purpose | Auth |
|----------|---------|------|
| `issue-credential` | Issues W3C VCs with SHA-256 hashing & blockchain anchoring | Bearer token required |
| `verify-credential` | Verifies credentials with hash integrity + AI analysis | Bearer token required |
| `resolve-did` | Resolves `did:decentraid:` and `did:ethr:polygon:` DIDs | Public (no auth) |
| `oid4vci` | OpenID for Verifiable Credential Issuance flow | Mixed (per endpoint) |
| `oid4vp` | OpenID for Verifiable Presentations flow | Mixed (per endpoint) |

### Set Edge Function Secrets

The following secrets are **auto-available** in Supabase Edge Functions:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`  
- `SUPABASE_SERVICE_ROLE_KEY`

#### Required Secret for Blockchain Anchoring

The `issue-credential` function anchors credential hashes on the **Polygon Amoy Testnet**. This requires a server-side wallet to pay gas fees.

```bash
# Set the server wallet private key
supabase secrets set SERVER_WALLET_PRIVATE_KEY=<your-wallet-private-key>
```

**How to get a wallet private key:**

1. Install [MetaMask](https://metamask.io) or any Ethereum-compatible wallet
2. Create a new wallet (or use an existing one dedicated to this server)
3. Export the private key:
   - MetaMask: Account menu → Account details → Show private key
4. Fund the wallet with Amoy testnet MATIC:
   - Visit [Polygon Amoy Faucet](https://faucet.polygon.technology/) 
   - Enter your wallet address and request test MATIC
5. Set the secret using the command above

> ⚠️ **Security**: Never reuse a wallet that holds real funds. Create a dedicated wallet for testnet operations.
> 
> 💡 **Without this secret**, credential issuance will fail with "SERVER_WALLET_PRIVATE_KEY not configured".

#### For Local Development (Supabase CLI)

When running locally with `supabase start`, create a `.env.local` file in your project root:

```env
SERVER_WALLET_PRIVATE_KEY=your-private-key-here
```

Then reference it when serving functions:

```bash
supabase functions serve --env-file .env.local
```

> ⚠️ **Never commit `.env.local` to Git.** Add it to `.gitignore`.

---

## 5. Configure Authentication

### Enable Email Auth

1. Go to **Supabase Dashboard → Authentication → Providers**
2. Ensure **Email** provider is enabled
3. Configure email settings:
   - **Enable email confirmations**: Recommended for production
   - **Site URL**: Set to your deployed frontend URL (e.g., `https://your-domain.com`)
   - **Redirect URLs**: Add your frontend URL

### Configure Auth Email Templates (Optional)

Go to **Authentication → Email Templates** and customize:
- **Confirm signup** template
- **Reset password** template

### Important Auth Settings

| Setting | Recommended Value | Location |
|---------|-------------------|----------|
| Site URL | Your frontend URL | Auth → URL Configuration |
| Redirect URLs | Your frontend URL | Auth → URL Configuration |
| Email confirmations | Enabled | Auth → Providers → Email |
| Double confirm changes | Enabled | Auth → Providers → Email |

---

## 6. Configure Frontend Environment

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-public-key
VITE_SUPABASE_PROJECT_ID=YOUR_PROJECT_REF
```

> ⚠️ **Never commit `.env` to Git.** The `.gitignore` already excludes it.

### Where to Find These Values

| Variable | Dashboard Location |
|----------|--------------------|
| `VITE_SUPABASE_URL` | Settings → API → Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Settings → API → Project API keys → `anon` `public` |
| `VITE_SUPABASE_PROJECT_ID` | Settings → General → Reference ID |

---

## 7. Build & Deploy Frontend

### Local Development

```bash
npm install
npm run dev
# → http://localhost:5173
```

### Production Build

```bash
npm run build
# Output → dist/
```

### Deploy Options

#### Vercel (Recommended)
```bash
npm i -g vercel
vercel
# Follow prompts, set env vars in Vercel dashboard
```

#### Netlify
```bash
npm i -g netlify-cli
netlify deploy --prod --dir=dist
# Set env vars in Netlify dashboard
```

#### Cloudflare Pages
1. Connect your Git repo in Cloudflare Pages
2. Build command: `npm run build`
3. Output directory: `dist`
4. Set env vars in Cloudflare dashboard

#### Docker
```dockerfile
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

Create `nginx.conf` for SPA routing:
```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 8. AI-Powered Verification (Optional)

The `verify-credential` edge function uses AI for risk analysis. In Lovable Cloud, this is powered by the `LOVABLE_API_KEY`. For self-hosting, you have two options:

### Option A: Skip AI Analysis
The function works without AI — it just skips the AI analysis step. Hash integrity, revocation, and expiration checks still work.

### Option B: Use Your Own AI Provider
Replace the AI call in `supabase/functions/verify-credential/index.ts` (lines 111-148) with your preferred provider:

```typescript
// Example: OpenAI
const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "gpt-4o-mini",
    messages: [/* same messages as current code */],
  }),
});
```

Then set the secret:
```bash
supabase secrets set OPENAI_API_KEY=sk-your-key-here
```

---

## 9. Verify Everything Works

### Checklist

- [ ] **Signup**: Create accounts with issuer, holder, and verifier roles
- [ ] **Profile created**: Check `profiles` table has entries after signup
- [ ] **Role assigned**: Check `user_roles` table has correct roles
- [ ] **DID generated**: Holder accounts should auto-get a `did:decentraid:` identifier
- [ ] **Schema creation**: Issuer can create credential schemas
- [ ] **Credential issuance**: Issuer can issue credentials to a holder DID
- [ ] **Wallet display**: Holder sees issued credentials in their wallet
- [ ] **Verification**: Verifier can verify credentials with hash integrity check
- [ ] **Notifications**: Holder receives notification when credential is issued
- [ ] **Revocation**: Issuer can revoke credentials (with confirmation dialog)
- [ ] **Audit logs**: Actions are recorded in audit_logs table

### Quick Test Flow

1. Sign up as **Issuer** → create a schema → issue a credential
2. Sign up as **Holder** → check wallet for the credential
3. Sign up as **Verifier** → verify the credential by ID

---

## 10. Troubleshooting

### "User already registered" on signup
- Email confirmation might be enabled — check the inbox for confirmation email

### Credentials not appearing in holder wallet
- Verify the `holder_id` is set on the credential (requires the holder DID to match a profile)
- Check RLS policies are correctly applied

### Edge function returns 500
- Check function logs: `supabase functions logs <function-name>`
- Verify `SUPABASE_SERVICE_ROLE_KEY` is available (it's auto-set)

### Trigger not firing on signup
- Verify the `on_auth_user_created` trigger exists on `auth.users`
- Check the Supabase logs for trigger errors

### CORS errors
- All edge functions include CORS headers — ensure your frontend URL is making requests correctly
- For custom domains, you may need to update the `Access-Control-Allow-Origin` header

### Build fails
```bash
# Clear cache and rebuild
rm -rf node_modules dist
npm install
npm run build
```

---

## Architecture Summary

```
┌─────────────────────────────────────────────┐
│                  Frontend                    │
│         React + Vite + Tailwind             │
│    (Vercel / Netlify / Cloudflare / etc)    │
└──────────────────┬──────────────────────────┘
                   │ HTTPS
┌──────────────────▼──────────────────────────┐
│              Supabase Project                │
│                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐│
│  │   Auth   │ │ Database │ │Edge Functions ││
│  │  (Email) │ │(Postgres)│ │  (Deno)       ││
│  └──────────┘ └──────────┘ └──────────────┘│
│                                              │
│  ┌──────────────────────────────────────────┐│
│  │         Row Level Security (RLS)         ││
│  │   has_role() security-definer function   ││
│  └──────────────────────────────────────────┘│
└──────────────────────────────────────────────┘
```

---

## Cost Estimate (Monthly)

| Service | Free Tier | Paid |
|---------|-----------|------|
| **Supabase** | 500MB DB, 50K auth users, 500K edge invocations | From $25/mo |
| **Vercel** | 100GB bandwidth | From $20/mo |
| **Netlify** | 100GB bandwidth | From $19/mo |
| **Cloudflare Pages** | Unlimited bandwidth | Free |

**For most use cases, the free tiers are sufficient.**

---

## Security Notes

- **Never expose** `SUPABASE_SERVICE_ROLE_KEY` in frontend code
- The `anon` key is safe for frontend — it's restricted by RLS policies
- All database access is protected by Row Level Security
- Role checks use a `SECURITY DEFINER` function to prevent recursive RLS issues
- Edge functions validate JWT tokens before processing requests
