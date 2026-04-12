import { ethers } from "ethers";
import { AMOY_CHAIN_ID, AMOY_RPC_ENDPOINTS, AMOY_NETWORK } from "./config";

// Shared static network object — declared once to avoid repeated Network.from() calls.
// Passing this to every provider prevents ethers v6 from attempting ENS resolution
// on Sepolia (chainId 11155111), which uses a different ENS registrar than mainnet.
const SEPOLIA_ETHERS_NETWORK = ethers.Network.from({
  name: "sepolia",
  chainId: AMOY_CHAIN_ID,
});

/**
 * Get a read-only JSON-RPC provider with automatic RPC fallback
 * and exponential backoff retry per endpoint.
 * No wallet needed — used for contract reads and tx lookups.
 */
export async function getReadProvider(): Promise<ethers.JsonRpcProvider> {
  const maxRetries = 2;
  const baseDelayMs = 300;

  for (const rpc of AMOY_RPC_ENDPOINTS) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const provider = new ethers.JsonRpcProvider(rpc, SEPOLIA_ETHERS_NETWORK, {
          staticNetwork: SEPOLIA_ETHERS_NETWORK, // skip per-request getNetwork() calls
        });
        await provider.getBlockNumber(); // health check
        return provider;
      } catch {
        if (attempt < maxRetries) {
          // Exponential backoff: 300ms, 600ms
          await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** attempt));
        } else {
          console.warn(`[BlockID] RPC unavailable after ${maxRetries + 1} attempts: ${rpc}`);
        }
      }
    }
  }
  throw new Error("All Ethereum Sepolia RPC endpoints are unavailable. Check your network connection.");
}

/**
 * Get a BrowserProvider + Signer from the user's injected wallet (MetaMask).
 * Prompts for connection if not already connected.
 *
 * We intentionally create the initial BrowserProvider WITHOUT specifying the
 * expected network.  Ethers v6 throws NETWORK_ERROR ("network changed") when
 * the wallet is on a different chain than the one declared in the constructor,
 * which prevents us from detecting & switching chains gracefully.
 */
export async function getBrowserSigner(): Promise<ethers.Signer> {
  if (!window.ethereum) {
    throw new Error("MetaMask or compatible wallet not found");
  }

  // ---- Step 1: detect current chain WITHOUT network constraint ----
  const probe = new ethers.BrowserProvider(window.ethereum);
  const network = await probe.getNetwork();

  // ---- Step 2: if wrong chain, ask MetaMask to switch / add Amoy ----
  if (Number(network.chainId) !== AMOY_CHAIN_ID) {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: AMOY_NETWORK.chainId }],
      });
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [AMOY_NETWORK],
        });
      } else {
        throw switchError;
      }
    }
  }

  // ---- Step 3: create the final provider locked to Amoy ----
  return new ethers.BrowserProvider(window.ethereum, SEPOLIA_ETHERS_NETWORK).getSigner();
}

/**
 * Get a read-only BrowserProvider (no signer, no wallet prompt).
 * Returns null when no injected wallet is available.
 * NOTE: We do NOT enforce a network here — let the caller handle chain checks
 * if needed, to avoid NETWORK_ERROR when the user is on the wrong chain.
 */
export function getReadOnlyBrowserProvider(): ethers.BrowserProvider | null {
  if (!window.ethereum) return null;
  return new ethers.BrowserProvider(window.ethereum);
}
