import { useState, useEffect, useCallback } from "react";
import { Fingerprint, ShieldCheck, ShieldX, Loader2, KeyRound, Eye, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  isWebAuthnSupported,
  isPlatformAuthenticatorAvailable,
  registerBiometric,
  encryptPrivateKeyWithBiometric,
  decryptPrivateKeyWithBiometric,
  listBiometricCredentials,
  deleteBiometricCredential,
  hasEncryptedKey,
  type BiometricCredential,
} from "@/services/webauthnService";

// ─── Types ────────────────────────────────────────────────────────────────────

/** What action is this modal being invoked for? */
export type BiometricAction =
  | "register"          // set up biometrics for the first time
  | "encrypt"           // protect a private key with biometrics
  | "decrypt"           // reveal a protected private key
  | "manage";           // view / delete registered credentials

interface BiometricLockModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  /** Current application user ID (Supabase UID) */
  userId: string;

  /** Human-readable name shown in the OS authenticator dialog */
  displayName?: string;

  /** Which action to perform when the modal opens */
  action: BiometricAction;

  /**
   * For "encrypt" action: the private key to protect.
   * For "decrypt" action: the label of the key to retrieve.
   */
  keyLabel?: string;
  privateKeyToEncrypt?: string;

  /** Called after successful decryption with the plaintext private key */
  onDecryptSuccess?: (privateKey: string) => void;

  /** Called after any successful biometric action */
  onSuccess?: () => void;
}

// ─── Status icons ─────────────────────────────────────────────────────────────

type ModalStatus = "idle" | "scanning" | "success" | "error";

function StatusIcon({ status }: { status: ModalStatus }) {
  if (status === "scanning") {
    return (
      <div className="relative flex items-center justify-center">
        {/* Pulsing rings */}
        <span className="absolute inline-flex h-20 w-20 rounded-full bg-primary/20 animate-ping" />
        <span className="absolute inline-flex h-14 w-14 rounded-full bg-primary/30 animate-ping [animation-delay:150ms]" />
        <div className="relative flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 border-2 border-primary">
          <Fingerprint className="h-8 w-8 text-primary animate-pulse" />
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 border-2 border-green-500 animate-in zoom-in-50 duration-300">
        <ShieldCheck className="h-8 w-8 text-green-500" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10 border-2 border-destructive animate-in zoom-in-50 duration-300">
        <ShieldX className="h-8 w-8 text-destructive" />
      </div>
    );
  }

  // idle
  return (
    <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/40">
      <Fingerprint className="h-8 w-8 text-primary" />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BiometricLockModal({
  open,
  onOpenChange,
  userId,
  displayName = "BlockID User",
  action,
  keyLabel = "wallet-private-key",
  privateKeyToEncrypt,
  onDecryptSuccess,
  onSuccess,
}: BiometricLockModalProps) {
  const { toast } = useToast();

  const [status, setStatus] = useState<ModalStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [supported, setSupported] = useState<boolean | null>(null);
  const [credentials, setCredentials] = useState<BiometricCredential[]>([]);
  const [hasKey, setHasKey] = useState(false);
  const [loadingCredentials, setLoadingCredentials] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Detect support on mount ──────────────────────────────────────────────
  useEffect(() => {
    isPlatformAuthenticatorAvailable().then(setSupported);
  }, []);

  const loadCredentials = useCallback(async () => {
    setLoadingCredentials(true);
    const list = await listBiometricCredentials(userId);
    setCredentials(list);

    // Check if a key already exists for the default label on first credential
    if (list.length > 0) {
      const keyExists = await hasEncryptedKey(list[0].credentialId, keyLabel);
      setHasKey(keyExists);
    }
    setLoadingCredentials(false);
  }, [userId, keyLabel]);

  // ── Load credentials when "manage" mode opens ─────────────────────────────
  useEffect(() => {
    if (!open) {
      setStatus("idle");
      setStatusMessage("");
      return;
    }

    if (action === "manage") {
      loadCredentials();
    }
  }, [open, action, loadCredentials]);

  // ── Action: register ─────────────────────────────────────────────────────
  const handleRegister = useCallback(async () => {
    setStatus("scanning");
    setStatusMessage("Touch your fingerprint sensor or use Face ID…");

    const result = await registerBiometric(userId, displayName);

    if (result.ok) {
      setStatus("success");
      setStatusMessage("Biometric registered successfully!");
      toast({ title: "Biometric Registered", description: "Your device biometric is now linked to BlockID." });
      onSuccess?.();
      setTimeout(() => onOpenChange(false), 1500);
    } else {
      setStatus("error");
      setStatusMessage(result.message ?? "Registration failed.");
      toast({ title: "Registration Failed", description: result.message, variant: "destructive" });
    }
  }, [userId, displayName, toast, onSuccess, onOpenChange]);

  // ── Action: encrypt ──────────────────────────────────────────────────────
  const handleEncrypt = useCallback(async (credentialId: string) => {
    if (!privateKeyToEncrypt) {
      toast({ title: "No private key provided", variant: "destructive" });
      return;
    }

    setStatus("scanning");
    setStatusMessage("Confirm your biometric to protect this key…");

    const result = await encryptPrivateKeyWithBiometric(credentialId, keyLabel, privateKeyToEncrypt);

    if (result.ok) {
      setStatus("success");
      setStatusMessage("Private key secured with biometrics!");
      toast({ title: "Key Protected", description: "Your private key is now secured by your biometric." });
      onSuccess?.();
      setTimeout(() => onOpenChange(false), 1500);
    } else {
      setStatus("error");
      setStatusMessage(result.message ?? "Encryption failed.");
      toast({ title: "Protection Failed", description: result.message, variant: "destructive" });
    }
  }, [privateKeyToEncrypt, keyLabel, toast, onSuccess, onOpenChange]);

  // ── Action: decrypt ──────────────────────────────────────────────────────
  const handleDecrypt = useCallback(async (credentialId: string) => {
    setStatus("scanning");
    setStatusMessage("Confirm your biometric to reveal this key…");

    const result = await decryptPrivateKeyWithBiometric(credentialId, keyLabel);

    if (result.ok && result.data) {
      setStatus("success");
      setStatusMessage("Identity verified — key revealed.");
      onDecryptSuccess?.(result.data);
      onSuccess?.();
      setTimeout(() => onOpenChange(false), 1200);
    } else {
      setStatus("error");
      setStatusMessage(result.message ?? "Decryption failed.");
      toast({ title: "Authentication Failed", description: result.message, variant: "destructive" });
    }
  }, [keyLabel, onDecryptSuccess, onSuccess, toast, onOpenChange]);

  // ── Action: delete credential ────────────────────────────────────────────
  const handleDelete = useCallback(async (credentialId: string) => {
    setDeletingId(credentialId);
    await deleteBiometricCredential(credentialId);
    toast({ title: "Credential Removed", description: "The biometric credential has been deleted." });
    await loadCredentials();
    setDeletingId(null);
  }, [loadCredentials, toast]);

  // ── Retry after error ────────────────────────────────────────────────────
  const handleRetry = () => {
    setStatus("idle");
    setStatusMessage("");
  };

  // ─── Render helpers ────────────────────────────────────────────────────────

  function renderTitle() {
    switch (action) {
      case "register": return "Set Up Biometric Security";
      case "encrypt":  return "Protect Private Key";
      case "decrypt":  return "Biometric Verification Required";
      case "manage":   return "Manage Biometrics";
    }
  }

  function renderDescription() {
    if (!isWebAuthnSupported()) {
      return "WebAuthn is not supported in this browser. Please use Chrome, Safari, or Firefox on a device with biometric hardware.";
    }
    if (supported === false) {
      return "No platform authenticator (TouchID / FaceID / Windows Hello) was detected on this device.";
    }
    switch (action) {
      case "register":
        return "Link your device biometric (TouchID, FaceID, or Windows Hello) to BlockID. Your private keys will be encrypted using your biometric.";
      case "encrypt":
        return "Your private key will be AES-256-GCM encrypted and stored securely in your device. Only your biometric can unlock it.";
      case "decrypt":
        return "Authenticate with your biometric to reveal your private key. This key will only be visible for this session.";
      case "manage":
        return "View and manage your registered biometric credentials.";
    }
  }

  // ─── Unsupported state ─────────────────────────────────────────────────────
  const notSupported = !isWebAuthnSupported() || supported === false;

  // ─── Credential picker (for encrypt/decrypt when multiple creds exist) ─────
  const [selectedCredId, setSelectedCredId] = useState<string | null>(null);

  useEffect(() => {
    if (credentials.length === 1) setSelectedCredId(credentials[0].credentialId);
    else setSelectedCredId(null);
  }, [credentials]);

  // Load credentials when action is encrypt/decrypt
  useEffect(() => {
    if (open && (action === "encrypt" || action === "decrypt")) {
      loadCredentials();
    }
  }, [open, action, loadCredentials]);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        id="biometric-lock-modal"
        className="max-w-md w-full overflow-hidden"
        style={{
          background: "hsl(var(--background))",
          border: "1px solid hsl(var(--border))",
        }}
      >
        {/* Gradient accent bar at top */}
        <div
          className="absolute top-0 left-0 right-0 h-1 rounded-t-lg"
          style={{
            background: "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--holder)), hsl(var(--accent)))",
          }}
        />

        <DialogHeader className="pt-4 pb-2">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            <DialogTitle className="font-display text-lg text-foreground">
              {renderTitle()}
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm text-muted-foreground mt-1">
            {renderDescription()}
          </DialogDescription>
        </DialogHeader>

        {/* ── Not Supported ─────────────────────────────────────────────── */}
        {notSupported && action !== "manage" && (
          <div className="flex flex-col items-center gap-4 py-6 px-2">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-muted border-2 border-border">
              <ShieldX className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              {!isWebAuthnSupported()
                ? "WebAuthn is not available in this browser."
                : "No biometric authenticator detected on this device."}
            </p>
            <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        )}

        {/* ── Manage credentials ─────────────────────────────────────────── */}
        {action === "manage" && (
          <div className="space-y-3 py-2">
            {loadingCredentials ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : credentials.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <Fingerprint className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground text-center">
                  No biometric credentials registered yet.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {credentials.map((cred) => (
                  <div
                    key={cred.credentialId}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-muted/30"
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Fingerprint className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        Credential
                      </p>
                      <p className="text-[10px] font-mono text-muted-foreground truncate">
                        {cred.credentialId.slice(0, 24)}…
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Registered {new Date(cred.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                      onClick={() => handleDelete(cred.credentialId)}
                      disabled={deletingId === cred.credentialId}
                      id={`delete-credential-${cred.credentialId.slice(0, 8)}`}
                    >
                      {deletingId === cred.credentialId ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                id="register-new-biometric-btn"
                variant="holder"
                className="flex-1"
                onClick={handleRegister}
                disabled={status === "scanning"}
              >
                {status === "scanning" ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Registering…</>
                ) : (
                  <><Plus className="h-4 w-4 mr-2" /> Add Biometric</>
                )}
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          </div>
        )}

        {/* ── Register / Encrypt / Decrypt ──────────────────────────────── */}
        {action !== "manage" && !notSupported && (
          <div className="flex flex-col items-center gap-6 py-4">
            {/* Status icon */}
            <StatusIcon status={status} />

            {/* Status label */}
            <div className="text-center space-y-1">
              {status === "idle" && (
                <p className="text-sm text-muted-foreground">
                  {action === "register"
                    ? "Click below to begin biometric enrollment."
                    : action === "encrypt"
                    ? "Click below to secure your private key."
                    : "Click below to authenticate and reveal your key."}
                </p>
              )}
              {status === "scanning" && (
                <p className="text-sm text-primary font-medium animate-pulse">{statusMessage}</p>
              )}
              {status === "success" && (
                <p className="text-sm text-green-600 dark:text-green-400 font-medium">{statusMessage}</p>
              )}
              {status === "error" && (
                <p className="text-sm text-destructive font-medium">{statusMessage}</p>
              )}
            </div>

            {/* Security badge */}
            {status === "idle" && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-muted/60 border border-border/40 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                <span>AES-256-GCM · IndexedDB · Zero server contact</span>
              </div>
            )}

            {/* Credential selector (when multiple registered) */}
            {status === "idle" && credentials.length > 1 && (action === "encrypt" || action === "decrypt") && (
              <div className="w-full space-y-1">
                <p className="text-xs text-muted-foreground text-center mb-2">Select credential to use:</p>
                {credentials.map((cred) => (
                  <button
                    key={cred.credentialId}
                    onClick={() => setSelectedCredId(cred.credentialId)}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-colors ${
                      selectedCredId === cred.credentialId
                        ? "border-primary bg-primary/5"
                        : "border-border/60 hover:border-border"
                    }`}
                  >
                    <Fingerprint className="h-4 w-4 text-primary shrink-0" />
                    <span className="font-mono text-xs text-muted-foreground truncate">
                      {cred.credentialId.slice(0, 20)}…
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Action buttons */}
            {status === "idle" && (
              <div className="w-full flex flex-col gap-2">
                {action === "register" && (
                  <Button
                    id="biometric-register-btn"
                    variant="holder"
                    className="w-full"
                    onClick={handleRegister}
                  >
                    <Fingerprint className="h-4 w-4 mr-2" />
                    Register Biometric
                  </Button>
                )}

                {action === "encrypt" && (
                  <>
                    {credentials.length === 0 ? (
                      <div className="text-center space-y-3">
                        <p className="text-xs text-muted-foreground">
                          No biometric credentials registered. Register one first.
                        </p>
                        <Button
                          id="biometric-register-first-btn"
                          variant="holder"
                          className="w-full"
                          onClick={handleRegister}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Register Biometric First
                        </Button>
                      </div>
                    ) : (
                      <Button
                        id="biometric-encrypt-btn"
                        variant="holder"
                        className="w-full"
                        onClick={() => selectedCredId && handleEncrypt(selectedCredId)}
                        disabled={!selectedCredId}
                      >
                        <ShieldCheck className="h-4 w-4 mr-2" />
                        Protect with Biometric
                      </Button>
                    )}
                  </>
                )}

                {action === "decrypt" && (
                  <>
                    {credentials.length === 0 || !hasKey ? (
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">
                          {credentials.length === 0
                            ? "No biometric credential found. Register one first."
                            : "No protected key found for this credential."}
                        </p>
                      </div>
                    ) : (
                      <Button
                        id="biometric-decrypt-btn"
                        variant="holder"
                        className="w-full"
                        onClick={() => selectedCredId && handleDecrypt(selectedCredId)}
                        disabled={!selectedCredId}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Authenticate &amp; Reveal Key
                      </Button>
                    )}
                  </>
                )}

                <Button
                  id="biometric-modal-cancel-btn"
                  variant="outline"
                  className="w-full"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
              </div>
            )}

            {/* Retry after error */}
            {status === "error" && (
              <div className="w-full flex gap-2">
                <Button variant="holder" className="flex-1" onClick={handleRetry}>
                  Try Again
                </Button>
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default BiometricLockModal;
