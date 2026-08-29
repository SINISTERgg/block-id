/**
 * Secure key storage — wraps expo-secure-store (Keychain / Keystore).
 * Only non-derived secrets (refresh tokens, wallet private keys) belong here.
 */
import * as SecureStore from "expo-secure-store";

const KEYS = {
  session: "blockid.session",
  walletPriv: "blockid.wallet.priv",
} as const;

export async function saveSession(sessionJson: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.session, sessionJson, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function loadSession(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.session);
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.session);
}

export async function saveWalletKey(pk: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.walletPriv, pk, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function loadWalletKey(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.walletPriv);
}
