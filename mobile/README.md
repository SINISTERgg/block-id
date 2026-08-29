# BlockID Mobile (Expo skeleton)

Minimal React Native / Expo client sharing the same Supabase backend and auth
flows as the web portal. Phase 5 of the master implementation plan.

## Setup

```bash
cd mobile
npm install          # or: npx expo install to align native versions
npx expo prebuild    # optional — for dev clients
npx expo start       # launch Metro bundler
```

## Environment

Create `mobile/.env`:

```
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

## Shared flows with web app

| Flow            | Web source                              | Mobile source                    |
| --------------- | --------------------------------------- | -------------------------------- |
| Email sign-in   | `src/pages/*Auth*`                      | `src/screens/LoginScreen.tsx`    |
| Wallet list     | `src/services/api/holder.service.ts`    | `src/lib/api.ts`                 |
| Session storage | browser localStorage (supabase-js)      | AsyncStorage + expo-secure-store |

## Structure

```
App.tsx                      — session bootstrap + screen switch
index.js                     — Expo root registration
src/lib/api.ts               — Supabase client, auth, credential fetches
src/lib/secureStore.ts       — Keychain/Keystore wrapper for secrets
src/lib/types.ts             — shared types (mirror of web service types)
src/components/CredentialCard.tsx
src/screens/LoginScreen.tsx
src/screens/WalletScreen.tsx
```

SIWE wallet sign-in reuses the same `siwe-auth` edge function contract; wire it
to a deep link (`blockid://siwe/callback`) in a follow-up iteration.
