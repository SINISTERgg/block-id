/**
 * BiometricStatusIcon — Animated status icon for the BiometricLockModal.
 * Extracted from BiometricLockModal.tsx.
 */
import { Fingerprint, ShieldCheck, ShieldX } from "lucide-react";

export type ModalStatus = "idle" | "scanning" | "success" | "error";

export function BiometricStatusIcon({ status }: { status: ModalStatus }) {
  if (status === "scanning") {
    return (
      <div className="relative flex items-center justify-center">
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
