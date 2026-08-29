/**
 * BlockID mobile — Supabase client + shared auth/wallet flows.
 * Mirrors web flows from src/services/auth/* and src/services/api/holder.service.ts.
 */
import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import type { HolderCredential, SessionInfo } from "./types";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export function isConfigured(): boolean {
  return SUPABASE_URL !== "" && SUPABASE_ANON_KEY !== "";
}

/** Email + password sign-in (same credentials as the web portal). */
export async function signInWithPassword(
  email: string,
  password: string
): Promise<SessionInfo> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { userId: data.user.id, email: data.user.email ?? email };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/**
 * Fetch the signed-in holder's credentials.
 * Same view/columns as the web app's fetchHolderCredentials.
 */
export async function fetchHolderCredentials(userId: string): Promise<HolderCredential[]> {
  // Resolve DID first — RLS policies key off holder_did.
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("did")
    .eq("id", userId)
    .single();
  if (profileErr) throw profileErr;
  if (!profile?.did) return [];

  const { data, error } = await supabase
    .from("credentials")
    .select(
      "id, credential_data, credential_hash, blockchain_anchor, status, issued_at, expires_at, credential_schemas(name, credential_type)"
    )
    .eq("holder_did", profile.did);
  if (error) throw error;

  const now = Date.now();
  return (data ?? []).map((cred: any) =>
    cred.status === "active" &&
    cred.expires_at &&
    new Date(cred.expires_at).getTime() < now
      ? { ...cred, status: "expired" }
      : cred
  );
}
