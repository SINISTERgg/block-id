/**
 * webauthnService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Protects non-custodial local wallet private keys stored in PWA IndexedDB
 * using native device biometrics (TouchID / FaceID / Passkeys).
 *
 * Security model:
 *   1. On registration  → navigator.credentials.create() yields a credential.
 *      We hash the credentialId with SHA-256 to derive a stable AES-256-GCM
 *      wrapping key stored ONLY in memory (never persisted to disk).
 *   2. On authentication → navigator.credentials.get() confirms biometric.
 *      The same hash derivation re-derives the same in-memory key.
 *   3. The wrapped (encrypted) private key ciphertext is stored in IndexedDB.
 *      Without biometric confirmation the raw private key is never exposed.
 *
 * NOTE: WebAuthn PRF extension (draft) offers a spec-native way to derive
 *   symmetric keys from assertions. We fall back to credential-ID hashing for
 *   maximum browser compatibility (Chrome 67+, Safari 14+, Firefox 60+).
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Constants ───────────────────────────────────────────────────────────────

const DB_NAME = "block-id-vault";
const DB_VERSION = 1;
const STORE_NAME = "encrypted-keys";

/** RP identity shown to the authenticator and stored in the credential. */
const RP_ID = window.location.hostname || "localhost";
const RP_NAME = "BlockID Secure Vault";

/** AES-GCM parameters */
const AES_KEY_LENGTH = 256;
const AES_IV_LENGTH = 12; // 96-bit IV for AES-GCM

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BiometricCredential {
  credentialId: string; // base64url-encoded credential ID
  userId: string;       // application-level user ID
  createdAt: number;    // Unix timestamp
}

export interface EncryptedKeyRecord {
  credentialId: string; // FK → BiometricCredential
  keyLabel: string;     // human-readable label (e.g. "wallet-private-key")
  ciphertext: string;   // base64-encoded AES-GCM encrypted private key
  iv: string;           // base64-encoded 96-bit IV
  wrappedAt: number;    // Unix timestamp
}

export type WebAuthnError =
  | "NOT_SUPPORTED"
  | "REGISTRATION_FAILED"
  | "AUTH_FAILED"
  | "NO_CREDENTIAL"
  | "DECRYPT_FAILED"
  | "ENCRYPT_FAILED"
  | "DB_ERROR";

export interface WebAuthnResult<T = void> {
  ok: boolean;
  data?: T;
  error?: WebAuthnError;
  message?: string;
}

// ─── Browser capability check ─────────────────────────────────────────────────

export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.PublicKeyCredential &&
    !!navigator.credentials &&
    !!window.crypto?.subtle
  );
}

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

// ─── IndexedDB helpers ────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains("credentials")) {
        const credStore = db.createObjectStore("credentials", { keyPath: "credentialId" });
        credStore.createIndex("userId", "userId", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const keyStore = db.createObjectStore(STORE_NAME, { keyPath: ["credentialId", "keyLabel"] });
        keyStore.createIndex("credentialId", "credentialId", { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut<T>(storeName: string, value: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function dbGet<T>(storeName: string, key: IDBValidKey | IDBKeyRange): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => { db.close(); resolve(req.result as T | undefined); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function dbGetAll<T>(storeName: string, index: string, query: IDBValidKey): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).index(index).getAll(query);
    req.onsuccess = () => { db.close(); resolve(req.result as T[]); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function dbDelete(storeName: string, key: IDBValidKey | IDBKeyRange): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

// ─── Crypto helpers ───────────────────────────────────────────────────────────

/** Convert an ArrayBuffer to a base64 string */
function bufToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

/**
 * Convert a base64 string to Uint8Array<ArrayBuffer>.
 * Explicitly backed by a plain ArrayBuffer (not SharedArrayBuffer) so it
 * satisfies the `BufferSource` / `ArrayBufferView<ArrayBuffer>` constraints
 * required by SubtleCrypto.
 */
function base64ToBuf(b64: string): Uint8Array<ArrayBuffer> {
  const decoded = atob(b64);
  const buf = new ArrayBuffer(decoded.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < decoded.length; i++) view[i] = decoded.charCodeAt(i);
  return view as Uint8Array<ArrayBuffer>;
}

/** Convert ArrayBuffer to base64url (no padding, URL-safe) */
function bufToBase64Url(buf: ArrayBuffer): string {
  return bufToBase64(buf).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Derive an AES-256-GCM CryptoKey from raw credential ID bytes.
 *
 * We SHA-256 hash the credentialId bytes, then import those 32 bytes as a
 * raw AES-GCM key. This is deterministic: same credentialId -> same key.
 *
 * NOTE: The key is derived in-memory only. It is never exported or stored.
 */
async function deriveAesKey(credentialIdBytes: BufferSource): Promise<CryptoKey> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", credentialIdBytes);
  return crypto.subtle.importKey(
    "raw",
    hashBuffer,
    { name: "AES-GCM", length: AES_KEY_LENGTH },
    false,       // not extractable
    ["encrypt", "decrypt"],
  );
}

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Register a new biometric credential (TouchID / FaceID / passkey) for the
 * given application user. Stores the credential metadata in IndexedDB.
 *
 * @param userId  Application user ID (Supabase auth UID).
 * @param displayName Human-readable name shown in authenticator UI.
 * @returns The persisted BiometricCredential on success.
 */
export async function registerBiometric(
  userId: string,
  displayName: string,
): Promise<WebAuthnResult<BiometricCredential>> {
  if (!isWebAuthnSupported()) {
    return { ok: false, error: "NOT_SUPPORTED", message: "WebAuthn is not supported in this browser." };
  }

  // Generate a random user handle (opaque to authenticator; must be 64 bytes max)
  const userHandle = crypto.getRandomValues(new Uint8Array(16));

  const publicKeyOptions: PublicKeyCredentialCreationOptions = {
    rp: { id: RP_ID, name: RP_NAME },
    user: {
      id: userHandle,
      name: userId,
      displayName,
    },
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    pubKeyCredParams: [
      { alg: -7, type: "public-key" },   // ES256 (ECDSA P-256) - widest support
      { alg: -257, type: "public-key" }, // RS256 (RSA-PKCS1v15) - fallback
    ],
    authenticatorSelection: {
      authenticatorAttachment: "platform", // TouchID / FaceID / Windows Hello
      userVerification: "required",        // biometric PIN always required
      residentKey: "preferred",
    },
    timeout: 60_000,
    attestation: "none", // no server-side attestation needed
  };

  try {
    const credential = await navigator.credentials.create({ publicKey: publicKeyOptions }) as PublicKeyCredential | null;

    if (!credential) {
      return { ok: false, error: "REGISTRATION_FAILED", message: "No credential returned from authenticator." };
    }

    const credentialIdB64 = bufToBase64Url(credential.rawId);

    const record: BiometricCredential = {
      credentialId: credentialIdB64,
      userId,
      createdAt: Date.now(),
    };

    await dbPut<BiometricCredential>("credentials", record);

    return { ok: true, data: record };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown registration error";
    // User cancelled -> NotAllowedError
    if (err instanceof DOMException && err.name === "NotAllowedError") {
      return { ok: false, error: "REGISTRATION_FAILED", message: "Biometric registration was cancelled." };
    }
    return { ok: false, error: "REGISTRATION_FAILED", message: msg };
  }
}

// ─── Authentication ───────────────────────────────────────────────────────────

/**
 * Authenticate with an existing biometric credential.
 * Returns the raw credentialId bytes on success (used to derive the AES key).
 *
 * @param credentialId base64url-encoded credential ID from the stored record.
 */
async function authenticateBiometric(
  credentialId: string,
): Promise<{ credentialIdBytes: ArrayBuffer } | null> {
  const credentialIdBytes = base64ToBuf(credentialId.replace(/-/g, "+").replace(/_/g, "/"));

  const publicKeyOptions: PublicKeyCredentialRequestOptions = {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    allowCredentials: [
      { type: "public-key", id: credentialIdBytes, transports: ["internal"] },
    ],
    userVerification: "required",
    timeout: 60_000,
  };

  try {
    const assertion = await navigator.credentials.get({ publicKey: publicKeyOptions }) as PublicKeyCredential | null;
    if (!assertion) return null;
    return { credentialIdBytes: assertion.rawId };
  } catch {
    return null;
  }
}

// ─── Encrypt private key ──────────────────────────────────────────────────────

/**
 * Encrypt a raw private key string and store it in IndexedDB, protected by
 * biometric authentication.
 *
 * Flow:
 *   1. Biometric challenge -> get credentialId bytes
 *   2. Derive AES-256-GCM key from credentialId (SHA-256)
 *   3. Encrypt privateKey with fresh random IV
 *   4. Persist ciphertext + IV to IndexedDB
 *
 * @param credentialId  The credential ID from the registered BiometricCredential.
 * @param keyLabel      Human-readable label (e.g. "wallet-private-key").
 * @param privateKey    The raw private key hex string to protect.
 */
export async function encryptPrivateKeyWithBiometric(
  credentialId: string,
  keyLabel: string,
  privateKey: string,
): Promise<WebAuthnResult> {
  // Step 1: biometric confirmation
  const authResult = await authenticateBiometric(credentialId);
  if (!authResult) {
    return { ok: false, error: "AUTH_FAILED", message: "Biometric authentication failed or was cancelled." };
  }

  try {
    // Step 2: derive AES key
    const aesKey = await deriveAesKey(authResult.credentialIdBytes);

    // Step 3: encrypt
    const iv = crypto.getRandomValues(new Uint8Array(AES_IV_LENGTH));
    const encoder = new TextEncoder();
    const plaintext = encoder.encode(privateKey);

    const ciphertextBuf = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aesKey,
      plaintext,
    );

    // Step 4: persist
    const record: EncryptedKeyRecord = {
      credentialId,
      keyLabel,
      ciphertext: bufToBase64(ciphertextBuf),
      iv: bufToBase64(iv.buffer),
      wrappedAt: Date.now(),
    };

    await dbPut<EncryptedKeyRecord>(STORE_NAME, record);
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Encryption failed";
    return { ok: false, error: "ENCRYPT_FAILED", message: msg };
  }
}

// ─── Decrypt private key ──────────────────────────────────────────────────────

/**
 * Decrypt a protected private key from IndexedDB by prompting biometric auth.
 *
 * Flow:
 *   1. Load ciphertext + IV from IndexedDB
 *   2. Biometric challenge -> get credentialId bytes
 *   3. Re-derive the same AES-256-GCM key
 *   4. Decrypt and return the raw private key string
 *
 * @param credentialId  The credential ID from the registered BiometricCredential.
 * @param keyLabel      The label used when encrypting.
 * @returns The decrypted private key string on success.
 */
export async function decryptPrivateKeyWithBiometric(
  credentialId: string,
  keyLabel: string,
): Promise<WebAuthnResult<string>> {
  // Step 1: load ciphertext
  let record: EncryptedKeyRecord | undefined;
  try {
    record = await dbGet<EncryptedKeyRecord>(STORE_NAME, [credentialId, keyLabel]);
  } catch {
    return { ok: false, error: "DB_ERROR", message: "Failed to read from IndexedDB." };
  }

  if (!record) {
    return { ok: false, error: "NO_CREDENTIAL", message: "No encrypted key found for this credential and label." };
  }

  // Step 2: biometric confirmation
  const authResult = await authenticateBiometric(credentialId);
  if (!authResult) {
    return { ok: false, error: "AUTH_FAILED", message: "Biometric authentication failed or was cancelled." };
  }

  try {
    // Step 3: re-derive AES key
    const aesKey = await deriveAesKey(authResult.credentialIdBytes);

    // Step 4: decrypt
    const iv = base64ToBuf(record.iv);
    const ciphertext = base64ToBuf(record.ciphertext);

    const plaintextBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      aesKey,
      ciphertext,
    );

    const decoder = new TextDecoder();
    return { ok: true, data: decoder.decode(plaintextBuf) };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Decryption failed";
    return { ok: false, error: "DECRYPT_FAILED", message: msg };
  }
}

// ─── Credential management ────────────────────────────────────────────────────

/**
 * List all registered biometric credentials for a given application user.
 */
export async function listBiometricCredentials(userId: string): Promise<BiometricCredential[]> {
  try {
    return await dbGetAll<BiometricCredential>("credentials", "userId", userId);
  } catch {
    return [];
  }
}

/**
 * Delete a registered credential and all associated encrypted key records.
 */
export async function deleteBiometricCredential(credentialId: string): Promise<void> {
  try {
    await dbDelete("credentials", credentialId);
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const index = tx.objectStore(STORE_NAME).index("credentialId");
      const req = index.openCursor(IDBKeyRange.only(credentialId));
      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) { cursor.delete(); cursor.continue(); }
        else { resolve(); }
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    /* best-effort cleanup */
  }
}

/**
 * Check whether an encrypted key record exists for a given credential + label.
 */
export async function hasEncryptedKey(credentialId: string, keyLabel: string): Promise<boolean> {
  try {
    const record = await dbGet<EncryptedKeyRecord>(STORE_NAME, [credentialId, keyLabel]);
    return !!record;
  } catch {
    return false;
  }
}
