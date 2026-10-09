/**
 * HolderEvidenceStrip — on-chain holder identity signals, fetched lazily.
 *
 * A verifier usually cares about three independent questions:
 *   • Is this person who they claim to be?  → biometric anchor (liveness proof)
 *   • Do they control a key, or a contract account? → ERC-4337 smart wallet
 *   • Does the credential carry a non-transferable on-chain badge? → SBT
 *
 * Each is read independently and reported separately. A missing signal is
 * rendered as "not established" rather than as a pass, because "we did not
 * check" and "we checked and it held" must never look the same in an audit.
 *
 * Every lookup is skipped when its contract is unconfigured, so a deployment
 * that only has Supabase wired up still renders cleanly.
 */
import { useEffect, useState } from "react";
import { Fingerprint, Wallet, Award, Loader2, CircleHelp, CircleCheck, CircleX } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import {
  getBiometricAnchorRecord,
  isBiometricAnchorConfigured,
  normalizeProofHash,
} from "@/services/blockchain/biometricAnchor.service";
import {
  getSmartWalletProfile,
  isSmartWalletConfigured,
} from "@/services/blockchain/smartWallet.service";
import {
  getSbtForCredential,
  getSbtAddress,
  isSbtConfigured,
  normalizeCredentialHash,
} from "@/services/blockchain/sbt.service";
import { addressFromDid } from "@/lib/verifier/intelligence";

type SignalState = "pass" | "fail" | "unknown" | "loading" | "unavailable";

interface Signal {
  key: string;
  label: string;
  icon: LucideIcon;
  state: SignalState;
  detail: string;
  href?: string | null;
}

const STATE_DOT: Record<SignalState, string> = {
  pass: "bg-emerald-500",
  fail: "bg-destructive",
  unknown: "bg-muted-foreground/50",
  loading: "bg-muted-foreground/30",
  unavailable: "bg-border",
};

const STATE_LABEL: Record<SignalState, string> = {
  pass: "established",
  fail: "not established",
  unknown: "not established",
  loading: "checking",
  unavailable: "not configured",
};

interface HolderEvidenceStripProps {
  holderDid: string | null;
  /** SHA-256 credential hash, needed for the SBT lookup. */
  credentialHash?: string | null;
  /** Biometric proof hash, when the presentation included one. */
  biometricProofHash?: string | null;
}

export default function HolderEvidenceStrip({
  holderDid,
  credentialHash,
  biometricProofHash,
}: HolderEvidenceStripProps) {
  const [signals, setSignals] = useState<Signal[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    const set = (key: string, patch: Partial<Signal>) =>
      setSignals((prev) => {
        const base: Signal[] = prev ?? [];
        const existing = base.find((s) => s.key === key);
        const next: Signal = existing
          ? { ...existing, ...patch }
          : {
              key,
              label: "",
              icon: CircleHelp,
              state: "loading",
              detail: "",
              ...patch,
            };
        return existing ? base.map((s) => (s.key === key ? next : s)) : [...base, next];
      });

    // Seed with the not-configured baseline so the strip has a stable shape
    // before any RPC round trip resolves.
    const address = addressFromDid(holderDid);
    const biometricConfigured = isBiometricAnchorConfigured();
    const walletConfigured = isSmartWalletConfigured();
    const sbtConfigured = isSbtConfigured();

    setSignals([
      {
        key: "biometric",
        label: "Biometric proof",
        icon: Fingerprint,
        state: biometricConfigured ? "loading" : "unavailable",
        detail: biometricConfigured
          ? "Reading the biometric anchor contract…"
          : "Set VITE_BIOMETRIC_ANCHOR_ADDRESS to enable.",
      },
      {
        key: "smart-wallet",
        label: "Smart wallet",
        icon: Wallet,
        state: walletConfigured ? "loading" : "unavailable",
        detail: walletConfigured
          ? "Resolving the ERC-4337 account…"
          : "Set VITE_SMART_WALLET_REGISTRY_ADDRESS to enable.",
      },
      {
        key: "sbt",
        label: "SBT badge",
        icon: Award,
        state: sbtConfigured ? "loading" : "unavailable",
        detail: sbtConfigured
          ? "Looking up the soulbound token…"
          : "Set VITE_SOULBOUND_CREDENTIAL_ADDRESS to enable.",
      },
    ]);

    // ── Biometric anchor ──
    if (biometricConfigured && biometricProofHash) {
      getBiometricAnchorRecord(normalizeProofHash(biometricProofHash))
        .then((rec) => {
          if (cancelled) return;
          if (!rec) {
            set("biometric", {
              state: "fail",
              detail: "No anchored liveness proof for this presentation.",
            });
            return;
          }
          set("biometric", {
            state: rec.active ? "pass" : "fail",
            detail: rec.active
              ? `Liveness proof anchored, valid until ${new Date(rec.expiresAt * 1000).toISOString().slice(0, 10)}.`
              : `Liveness proof anchored but expired on ${new Date(rec.expiresAt * 1000).toISOString().slice(0, 10)}.`,
            href: rec.verifier ? `https://sepolia.etherscan.io/address/${rec.verifier}` : null,
          });
        })
        .catch(() => {
          if (!cancelled) {
            set("biometric", { state: "unknown", detail: "Anchor read failed — could not confirm." });
          }
        });
    } else if (biometricConfigured) {
      set("biometric", {
        state: "unknown",
        detail: "Presentation carried no biometric proof hash.",
      });
    }

    // ── Smart wallet (ERC-4337) ──
    if (walletConfigured && address) {
      getSmartWalletProfile(address)
        .then((profile) => {
          if (cancelled) return;
          if (!profile.hasSmartWallet) {
            set("smart-wallet", {
              state: "unknown",
              detail: "Holder has no deployed smart account in the registry.",
            });
            return;
          }
          set("smart-wallet", {
            state: "pass",
            detail:
              profile.guardians.length > 0
                ? `Smart account ${profile.account.slice(0, 8)}…${profile.account.slice(-6)} · ${profile.guardians.length} guardian${profile.guardians.length === 1 ? "" : "s"} (${profile.recoveryThreshold} to recover).`
                : `Smart account ${profile.account.slice(0, 8)}…${profile.account.slice(-6)} · no guardians registered.`,
            href: `https://sepolia.etherscan.io/address/${profile.account}`,
          });
        })
        .catch(() => {
          if (!cancelled) {
            set("smart-wallet", { state: "unknown", detail: "Registry read failed — could not confirm." });
          }
        });
    } else if (walletConfigured) {
      set("smart-wallet", { state: "unknown", detail: "Holder DID carries no 0x address." });
    }

    // ── SBT badge ──
    if (sbtConfigured && credentialHash) {
      getSbtForCredential(normalizeCredentialHash(credentialHash))
        .then((sbt) => {
          if (cancelled) return;
          if (!sbt) {
            set("sbt", { state: "unknown", detail: "No soulbound token minted for this credential." });
            return;
          }
          // Etherscan's `/token/` route expects a *contract address*. Passing
          // the bare token id resolves the address 0x…0001 and renders the
          // "N/A (NFT)" page with zero records. The NFT route needs both the
          // contract and the token id.
          const sbtContract = getSbtAddress();
          const explorerHref = sbtContract
            ? sbt.tokenId !== null && sbt.tokenId !== undefined
              ? `https://sepolia.etherscan.io/nft/${sbtContract}/${sbt.tokenId}`
              : `https://sepolia.etherscan.io/address/${sbtContract}`
            : null;
          set("sbt", {
            state: sbt.revoked ? "fail" : "pass",
            detail: sbt.revoked
              ? `Token #${sbt.tokenId} was revoked.`
              : `Token #${sbt.tokenId} active, non-transferable.`,
            href: explorerHref,
          });
        })
        .catch(() => {
          if (!cancelled) {
            set("sbt", { state: "unknown", detail: "SBT read failed — could not confirm." });
          }
        });
    } else if (sbtConfigured) {
      set("sbt", { state: "unknown", detail: "No credential hash to look up a badge for." });
    }

    return () => {
      cancelled = true;
    };
  }, [holderDid, credentialHash, biometricProofHash]);

  if (!signals) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {signals.map((s) => {
        const Icon = s.icon;
        const settled = s.state !== "loading";
        return (
          <motion.div
            key={s.key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg border border-border p-2.5"
          >
            <div className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${STATE_DOT[s.state]}`} />
              <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-[11px] font-semibold text-foreground truncate">{s.label}</span>
              {s.state === "loading" ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-auto" /> : null}
              {s.state === "pass" ? <CircleCheck className="h-3 w-3 text-emerald-500 ml-auto" /> : null}
              {s.state === "fail" ? <CircleX className="h-3 w-3 text-destructive ml-auto" /> : null}
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
              {s.detail}
            </p>
            <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70">
              {STATE_LABEL[s.state]}
              {settled && s.href ? (
                <a href={s.href} target="_blank" rel="noreferrer" className="ml-1.5 text-verifier hover:underline">
                  chain
                </a>
              ) : null}
            </p>
          </motion.div>
        );
      })}
    </div>
  );
}
