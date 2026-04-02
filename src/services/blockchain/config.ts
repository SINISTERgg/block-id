// Polygon Amoy Testnet Configuration
export const AMOY_CHAIN_ID = 80002;
export const AMOY_CHAIN_ID_HEX = "0x13882";
export const AMOY_EXPLORER = "https://amoy.polygonscan.com";

export const AMOY_RPC_ENDPOINTS = [
  "https://rpc-amoy.polygon.technology",
  "https://polygon-amoy.drpc.org",
  "https://polygon-amoy-bor-rpc.publicnode.com",
];

export const AMOY_NETWORK = {
  chainId: AMOY_CHAIN_ID_HEX,
  chainName: "Polygon Amoy Testnet",
  nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
  rpcUrls: [AMOY_RPC_ENDPOINTS[0]],
  blockExplorerUrls: [AMOY_EXPLORER],
};

const CONTRACT_ADDRESS = import.meta.env.VITE_CREDENTIAL_REGISTRY_ADDRESS;

export const CREDENTIAL_REGISTRY_ADDRESS = CONTRACT_ADDRESS && CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000"
  ? CONTRACT_ADDRESS as `0x${string}`
  : null;

export const IS_CONTRACT_DEPLOYED = CREDENTIAL_REGISTRY_ADDRESS !== null;

export const CREDENTIAL_REGISTRY_ABI = [
  "function anchorCredential(bytes32 hash) external",
  "function revokeCredential(bytes32 hash) external",
  "function getCredentialStatus(bytes32 hash) external view returns (bool anchored, bool revoked, address issuer, uint256 blockAnchored)",
  "function isValid(bytes32 hash) external view returns (bool)",
  "event CredentialAnchored(bytes32 indexed hash, address indexed issuer, uint256 blockNumber)",
  "event CredentialRevoked(bytes32 indexed hash, address indexed issuer, uint256 blockNumber)",
] as const;
