import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AMOY_CHAIN_ID_HEX, AMOY_NETWORK } from "@/services/blockchain/config";

interface EthereumProvider {
  isMetaMask?: boolean;
  request: (args: { method: string; params?: any[] }) => Promise<any>;
  on: (event: string, handler: (...args: any[]) => void) => void;
  removeListener: (event: string, handler: (...args: any[]) => void) => void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

const SEPOLIA_CHAIN_ID = AMOY_CHAIN_ID_HEX; // 0xaa36a7 — Ethereum Sepolia Testnet

const SEPOLIA_NETWORK = AMOY_NETWORK;

export function useWeb3Wallet(userId: string | undefined) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [chainId, setChainId] = useState<string | null>(null);
  const { toast } = useToast();

  const isMetaMaskInstalled = typeof window !== "undefined" && !!window.ethereum?.isMetaMask;
  const isSepoliaNetwork = chainId === SEPOLIA_CHAIN_ID;

  // Legacy alias for backward compat
  const isPolygonNetwork = isSepoliaNetwork;

  // Load saved wallet from profile
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("profiles")
      .select("wallet_address")
      .eq("user_id", userId)
      .single()
      .then(({ data }) => {
        if (data?.wallet_address) setWalletAddress(data.wallet_address);
      });
  }, [userId]);

  // Listen to account/chain changes
  useEffect(() => {
    if (!window.ethereum) return;
    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) setWalletAddress(null);
    };
    const handleChainChanged = (id: string) => setChainId(id);
    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);
    // Get current chain
    window.ethereum.request({ method: "eth_chainId" }).then(setChainId).catch(() => {});
    return () => {
      window.ethereum?.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener("chainChanged", handleChainChanged);
    };
  }, []);

  const switchToSepolia = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: SEPOLIA_CHAIN_ID }] });
    } catch (err: any) {
      if (err.code === 4902) {
        await window.ethereum.request({ method: "wallet_addEthereumChain", params: [SEPOLIA_NETWORK] });
      }
    }
  }, []);

  // Legacy alias
  const switchToPolygon = switchToSepolia;

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      toast({ title: "MetaMask not found", description: "Please install MetaMask browser extension.", variant: "destructive" });
      return;
    }
    setIsConnecting(true);
    try {
      const accounts: string[] = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (!accounts.length) throw new Error("No accounts returned");

      const address = accounts[0];

      // Switch to Sepolia
      await switchToSepolia();

      // Save to profile
      if (userId) {
        const { error } = await supabase
          .from("profiles")
          .update({ wallet_address: address } as any)
          .eq("user_id", userId);
        if (error) throw error;
      }

      setWalletAddress(address);
      toast({ title: "Wallet Connected", description: `Linked ${address.substring(0, 6)}...${address.substring(38)} on Ethereum Sepolia` });
    } catch (err: any) {
      toast({ title: "Connection failed", description: err.message || "Could not connect wallet", variant: "destructive" });
    } finally {
      setIsConnecting(false);
    }
  }, [userId, switchToSepolia, toast]);

  const disconnectWallet = useCallback(async () => {
    if (userId) {
      await supabase
        .from("profiles")
        .update({ wallet_address: null } as any)
        .eq("user_id", userId);
    }
    setWalletAddress(null);
    toast({ title: "Wallet disconnected" });
  }, [userId, toast]);

  const signMessage = useCallback(async (message: string): Promise<string | null> => {
    if (!window.ethereum || !walletAddress) return null;
    try {
      const signature = await window.ethereum.request({
        method: "personal_sign",
        params: [message, walletAddress],
      });
      return signature;
    } catch {
      toast({ title: "Signing rejected", variant: "destructive" });
      return null;
    }
  }, [walletAddress, toast]);

  return {
    walletAddress,
    isConnecting,
    isMetaMaskInstalled,
    isPolygonNetwork,
    connectWallet,
    disconnectWallet,
    signMessage,
    switchToPolygon,
  };
}
