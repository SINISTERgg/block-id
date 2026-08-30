import { useState, useCallback, useEffect, useRef } from "react";
import { BrowserProvider } from "ethers";
import { useToast } from "@/hooks/use-toast";
import {
  ensureSmartAccount,
  isSmartWalletConfigured,
  predictAccountAddress,
  getGuardianInfo,
} from "@/services/blockchain/smartWallet.service";

const SALT_KEY = "blockid-smart-wallet-salt";

function loadSalt(): bigint | null {
  try {
    const stored = localStorage.getItem(SALT_KEY);
    return stored ? BigInt(stored) : null;
  } catch {
    return null;
  }
}

interface SmartWalletState {
  salt: bigint | null;
  predictedAddress: string | null;
  accountAddress: string | null;
  guardians: string[];
  threshold: number;
}

/**
 * Manages the deterministic smart-account lifecycle for the connected EOA:
 * salt persistence → address prediction → deployment → guardian config.
 */
export function useSmartWallet(eoaAddress: string | undefined) {
  const [state, setState] = useState<SmartWalletState>({
    salt: loadSalt(),
    predictedAddress: null,
    accountAddress: null,
    guardians: [],
    threshold: 0,
  });
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  // Re-predict address whenever EOA or salt changes
  useEffect(() => {
    if (!eoaAddress || !isSmartWalletConfigured()) return;
    let cancelled = false;
    (async () => {
      try {
        const salt = state.salt ?? BigInt(Date.now());
        const predicted = await predictAccountAddress(eoaAddress, salt);
        if (!cancelled) {
          setState((s) => ({ ...s, salt, predictedAddress: predicted }));
        }
      } catch {
        // registry unreachable — non-fatal
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eoaAddress]);

  /** Persist a fresh salt and recompute the predicted address. */
  const rotateSalt = useCallback(async () => {
    if (!eoaAddress) return;
    const newSalt = BigInt(Date.now());
    localStorage.setItem(SALT_KEY, newSalt.toString());
    const predicted = await predictAccountAddress(eoaAddress, newSalt);
    setState((s) => ({ ...s, salt: newSalt, predictedAddress: predicted }));
  }, [eoaAddress]);

  /** Deploy the account (no-ops when it already exists). */
  const createOrGetAccount = useCallback(async (): Promise<string | null> => {
    if (!eoaAddress || !window.ethereum) {
      toast({ title: "Connect MetaMask first", variant: "destructive" });
      return null;
    }
    setIsCreating(true);
    try {
      const provider = new BrowserProvider(window.ethereum as any);
      const salt = state.salt ?? BigInt(Date.now());
      localStorage.setItem(SALT_KEY, salt.toString());

      const { account, created } = await ensureSmartAccount(provider, salt);
      setState((s) => ({ ...s, salt, accountAddress: account }));

      if (created) {
        toast({ title: "Smart wallet deployed", description: account.slice(0, 10) + "…" + account.slice(-6) });
      } else {
        toast({ title: "Smart wallet ready", description: "Account already exists on-chain" });
      }
      return account;
    } catch (err: any) {
      const message =
        err?.code === "ACTION_REJECTED" || err?.info?.error?.code === 4001
          ? "Transaction rejected in wallet."
          : err?.shortMessage ?? err?.message ?? "Unknown error";
      toast({
        title: "Deployment failed",
        description: message,
        variant: "destructive",
      });
      return null;
    } finally {
      if (mountedRef.current) setIsCreating(false);
    }
  }, [eoaAddress, state.salt, toast]);

  /** Load guardian configuration for an account. */
  const refreshGuardians = useCallback(async (account?: string) => {
    const target = account ?? state.accountAddress;
    if (!target || !isSmartWalletConfigured()) return;
    try {
      const info = await getGuardianInfo(target);
      if (!mountedRef.current) return;
      setState((s) => ({ ...s, guardians: info.guardians, threshold: info.threshold }));
    } catch {
      // not configured yet — fine
    }
  }, [state.accountAddress]);

  useEffect(() => {
    refreshGuardians();
  }, [refreshGuardians]);

  return {
    ...state,
    isCreating,
    isConfigured: isSmartWalletConfigured(),
    rotateSalt,
    createOrGetAccount,
    refreshGuardians,
  };
}
