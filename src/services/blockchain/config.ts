// Polygon Amoy Testnet Configuration
export const AMOY_CHAIN_ID = 80002;
export const AMOY_CHAIN_ID_HEX = "0x13882";
export const AMOY_EXPLORER = "https://amoy.polygonscan.com";

// Free public RPC endpoints for Polygon Amoy — tried in order with automatic fallback.
export const AMOY_RPC_ENDPOINTS = [
  "https://rpc-amoy.polygon.technology",        // Polygon official
  "https://polygon-amoy.drpc.org",              // dRPC public
  "https://polygon-amoy-bor-rpc.publicnode.com",// PublicNode
  "https://rpc.ankr.com/polygon_amoy",          // Ankr public
  "https://polygon-amoy.blockpi.network/v1/rpc/public", // BlockPI public
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

// v2 ABI — includes batch functions and timestamps
export const CREDENTIAL_REGISTRY_ABI = [
  // Write
  "function anchorCredential(bytes32 hash) external",
  "function anchorCredentialBatch(bytes32[] calldata hashes) external",
  "function revokeCredential(bytes32 hash) external",
  // Read — single
  "function getCredentialStatus(bytes32 hash) external view returns (bool anchored, bool revoked, address issuer, uint256 blockAnchored, uint256 anchoredAt, uint256 revokedAt)",
  "function isValid(bytes32 hash) external view returns (bool)",
  // Read — batch
  "function getCredentialBatch(bytes32[] calldata hashes) external view returns (bool[] anchored, bool[] revoked, address[] issuers, uint256[] blockNumbers, uint256[] timestamps)",
  // Events
  "event CredentialAnchored(bytes32 indexed hash, address indexed issuer, uint256 blockNumber, uint256 timestamp)",
  "event CredentialRevoked(bytes32 indexed hash, address indexed issuer, uint256 blockNumber, uint256 timestamp)",
] as const;
