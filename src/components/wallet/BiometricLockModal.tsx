import { useState, useEffect, useCallback } from "react";
import { KeyRound, ShieldX } from "lucide-react";
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

// ── Extracted sub-components ─────────────────────────────────────────────────
import { BiometricStatusIcon, type ModalStatus } from "./biometric/BiometricStatusIcon";
import { CredentialManager } from "./biometric/CredentialManager";
import { BiometricActionPanel } from "./biometric/BiometricActionPanel";

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
    if (action === "manage") loadCredentials();
  }, [open, action, loadCredentials]);

  // Load credentials for encrypt/decrypt actions
  useEffect(() => {
    if (open && (action === "encrypt" || action === "decrypt")) {
      loadCredentials();
    }
  }, [open, action, loadCredentials]);

  // ── Credential selector ───────────────────────────────────────────────────
  const [selectedCredId, setSelectedCredId] = useState<string | null>(null);

  useEffect(() => {
    if (credentials.length === 1) setSelectedCredId(credentials[0].credentialId);
    else setSelectedCredId(null);
  }, [credentials]);

  // ── Actions ───────────────────────────────────────────────────────────────

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

  const handleDelete = useCallback(async (credentialId: string) => {
    setDeletingId(credentialId);
    await deleteBiometricCredential(credentialId);
    toast({ title: "Credential Removed", description: "The biometric credential has been deleted." });
    await loadCredentials();
    setDeletingId(null);
  }, [loadCredentials, toast]);

  const handleRetry = () => { setStatus("idle"); setStatusMessage(""); };

  // ── Title / Description helpers ───────────────────────────────────────────

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
      case "register": return "Link your device biometric (TouchID, FaceID, or Windows Hello) to BlockID. Your private keys will be encrypted using your biometric.";
      case "encrypt":  return "Your private key will be AES-256-GCM encrypted and stored securely in your device. Only your biometric can unlock it.";
      case "decrypt":  return "Authenticate with your biometric to reveal your private key. This key will only be visible for this session.";
      case "manage":   return "View and manage your registered biometric credentials.";
    }
  }

  const notSupported = !isWebAuthnSupported() || supported === false;

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
        {/* Gradient accent bar */}
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
          <CredentialManager
            credentials={credentials}
            loadingCredentials={loadingCredentials}
            deletingId={deletingId}
            status={status}
            onDelete={handleDelete}
            onRegister={handleRegister}
            onDone={() => onOpenChange(false)}
          />
        )}

        {/* ── Register / Encrypt / Decrypt ──────────────────────────────── */}
        {action !== "manage" && !notSupported && (
          <BiometricActionPanel
            action={action}
            status={status}
            statusMessage={statusMessage}
            credentials={credentials}
            hasKey={hasKey}
            selectedCredId={selectedCredId}
            onSelectCred={setSelectedCredId}
            onRegister={handleRegister}
            onEncrypt={handleEncrypt}
            onDecrypt={handleDecrypt}
            onRetry={handleRetry}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export default BiometricLockModal;
