// Ethereum Sepolia Testnet Configuration
export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";
export const SEPOLIA_EXPLORER = "https://sepolia.etherscan.io";

// Legacy exports for backward compatibility (used throughout codebase)
export const AMOY_CHAIN_ID = SEPOLIA_CHAIN_ID;
export const AMOY_CHAIN_ID_HEX = SEPOLIA_CHAIN_ID_HEX;
export const AMOY_EXPLORER = SEPOLIA_EXPLORER;

// Free public RPC endpoints for Ethereum Sepolia — tried in order with automatic fallback.
export const SEPOLIA_RPC_ENDPOINTS = [
  "https://ethereum-sepolia-rpc.publicnode.com",  // PublicNode (reliable)
  "https://rpc.sepolia.org",                       // Community standard
  "https://sepolia.gateway.tenderly.co",           // Tenderly
  "https://rpc-sepolia.rockx.com",                 // RockX
  "https://rpc.ankr.com/eth_sepolia",              // Ankr public
];

// Legacy export alias
export const AMOY_RPC_ENDPOINTS = SEPOLIA_RPC_ENDPOINTS;

export const SEPOLIA_NETWORK = {
  chainId: SEPOLIA_CHAIN_ID_HEX,
  chainName: "Ethereum Sepolia Testnet",
  nativeCurrency: { name: "SepoliaETH", symbol: "ETH", decimals: 18 },
  rpcUrls: [SEPOLIA_RPC_ENDPOINTS[0]],
  blockExplorerUrls: [SEPOLIA_EXPLORER],
};

// Legacy export alias
export const AMOY_NETWORK = SEPOLIA_NETWORK;

const CONTRACT_ADDRESS = import.meta.env.VITE_CREDENTIAL_REGISTRY_ADDRESS;

export const CREDENTIAL_REGISTRY_ADDRESS = CONTRACT_ADDRESS && CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000"
  ? CONTRACT_ADDRESS as `0x${string}`
  : null;

export const IS_CONTRACT_DEPLOYED = CREDENTIAL_REGISTRY_ADDRESS !== null;

// Contract deployment block on Sepolia — query events from here instead of block 0
export const CONTRACT_DEPLOYMENT_BLOCK = 6500000;

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
