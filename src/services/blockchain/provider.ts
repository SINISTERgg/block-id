import { ethers } from "ethers";
import { AMOY_CHAIN_ID, AMOY_RPC_ENDPOINTS, AMOY_NETWORK } from "./config";

// Shared static network object — declared once to avoid repeated Network.from() calls.
// Passing this to every provider prevents ethers v6 from attempting ENS resolution
// on Polygon Amoy (chainId 80002), which has no ENS registrar.
const AMOY_ETHERS_NETWORK = ethers.Network.from({
  name: "matic-amoy",
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
        const provider = new ethers.JsonRpcProvider(rpc, AMOY_ETHERS_NETWORK, {
          staticNetwork: AMOY_ETHERS_NETWORK, // skip per-request getNetwork() calls
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
  throw new Error("All Polygon Amoy RPC endpoints are unavailable. Check your network connection.");
}

/**
 * Get a BrowserProvider + Signer from the user's injected wallet (MetaMask).
 * Prompts for connection if not already connected.
 */
export async function getBrowserSigner(): Promise<ethers.Signer> {
  if (!window.ethereum) {
    throw new Error("MetaMask or compatible wallet not found");
  }

  const provider = new ethers.BrowserProvider(window.ethereum, AMOY_ETHERS_NETWORK);

  // Ensure we're on Polygon Amoy
  const network = await provider.getNetwork();
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
    // Re-create provider after chain switch
    return new ethers.BrowserProvider(window.ethereum, AMOY_ETHERS_NETWORK).getSigner();
  }

  return provider.getSigner();
}

/**
 * Get a read-only BrowserProvider (no signer, no wallet prompt).
 */
export function getReadOnlyBrowserProvider(): ethers.BrowserProvider | null {
  if (!window.ethereum) return null;
  return new ethers.BrowserProvider(window.ethereum, AMOY_ETHERS_NETWORK);
}
