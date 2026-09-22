/**
 * BiometricActionPanel — register / encrypt / decrypt action panel.
 * Renders the status icon, status message, security badge, credential
 * selector, and CTA buttons for all non-manage biometric actions.
 * Extracted from BiometricLockModal.tsx.
 */
import React from "react";
import { Fingerprint, ShieldCheck, ShieldX, Eye, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BiometricCredential } from "@/services/webauthnService";
import { BiometricStatusIcon, type ModalStatus } from "./BiometricStatusIcon";
import type { BiometricAction } from "@/components/wallet/BiometricLockModal";

interface BiometricActionPanelProps {
  action: BiometricAction;
  status: ModalStatus;
  statusMessage: string;
  credentials: BiometricCredential[];
  hasKey: boolean;
  selectedCredId: string | null;
  onSelectCred: (id: string) => void;
  onRegister: () => void;
  onEncrypt: (credId: string) => void;
  onDecrypt: (credId: string) => void;
  onRetry: () => void;
  onCancel: () => void;
}

export const BiometricActionPanel: React.FC<BiometricActionPanelProps> = ({
  action, status, statusMessage,
  credentials, hasKey,
  selectedCredId, onSelectCred,
  onRegister, onEncrypt, onDecrypt,
  onRetry, onCancel,
}) => (
  <div className="flex flex-col items-center gap-6 py-4">
    {/* Animated status icon */}
    <BiometricStatusIcon status={status} />

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

    {/* Credential selector when multiple registered */}
    {status === "idle" && credentials.length > 1 && (action === "encrypt" || action === "decrypt") && (
      <div className="w-full space-y-1">
        <p className="text-xs text-muted-foreground text-center mb-2">Select credential to use:</p>
        {credentials.map((cred) => (
          <button
            key={cred.credentialId}
            onClick={() => onSelectCred(cred.credentialId)}
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

    {/* CTA buttons */}
    {status === "idle" && (
      <div className="w-full flex flex-col gap-2">
        {action === "register" && (
          <Button
            id="biometric-register-btn"
            variant="holder"
            className="w-full"
            onClick={onRegister}
          >
            <Fingerprint className="h-4 w-4 mr-2" /> Register Biometric
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
                  onClick={onRegister}
                >
                  <Plus className="h-4 w-4 mr-2" /> Register Biometric First
                </Button>
              </div>
            ) : (
              <Button
                id="biometric-encrypt-btn"
                variant="holder"
                className="w-full"
                onClick={() => selectedCredId && onEncrypt(selectedCredId)}
                disabled={!selectedCredId}
              >
                <ShieldCheck className="h-4 w-4 mr-2" /> Protect with Biometric
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
                onClick={() => selectedCredId && onDecrypt(selectedCredId)}
                disabled={!selectedCredId}
              >
                <Eye className="h-4 w-4 mr-2" /> Authenticate &amp; Reveal Key
              </Button>
            )}
          </>
        )}

        <Button
          id="biometric-modal-cancel-btn"
          variant="outline"
          className="w-full"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    )}

    {/* Retry after error */}
    {status === "error" && (
      <div className="w-full flex gap-2">
        <Button variant="holder" className="flex-1" onClick={onRetry}>Try Again</Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    )}
  </div>
);
