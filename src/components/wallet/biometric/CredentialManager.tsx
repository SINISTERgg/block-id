/**
 * CredentialManager — manage-mode panel for BiometricLockModal.
 * Shows a list of registered biometric credentials with delete controls,
 * and a button to add a new one.
 * Extracted from BiometricLockModal.tsx.
 */
import React from "react";
import { Fingerprint, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BiometricCredential } from "@/services/webauthnService";
import type { ModalStatus } from "./BiometricStatusIcon";

interface CredentialManagerProps {
  credentials: BiometricCredential[];
  loadingCredentials: boolean;
  deletingId: string | null;
  status: ModalStatus;
  onDelete: (credentialId: string) => void;
  onRegister: () => void;
  onDone: () => void;
}

export const CredentialManager: React.FC<CredentialManagerProps> = ({
  credentials,
  loadingCredentials,
  deletingId,
  status,
  onDelete,
  onRegister,
  onDone,
}) => (
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
              <p className="text-xs font-medium text-foreground truncate">Credential</p>
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
              onClick={() => onDelete(cred.credentialId)}
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
        onClick={onRegister}
        disabled={status === "scanning"}
      >
        {status === "scanning" ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Registering…</>
        ) : (
          <><Plus className="h-4 w-4 mr-2" /> Add Biometric</>
        )}
      </Button>
      <Button variant="outline" onClick={onDone}>Done</Button>
    </div>
  </div>
);
