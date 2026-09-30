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

// ── SoulboundCredential (SBT badges) ─────────────────────────────────────────

const SBT_ADDRESS_RAW = import.meta.env.VITE_SOULBOUND_CREDENTIAL_ADDRESS;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const SBT_ADDRESS_ENV_KEY = "VITE_SOULBOUND_CREDENTIAL_ADDRESS";

export const SBT_ADDRESS =
  SBT_ADDRESS_RAW && SBT_ADDRESS_RAW !== ZERO_ADDRESS ? (SBT_ADDRESS_RAW as `0x${string}`) : null;

export const IS_SBT_DEPLOYED = SBT_ADDRESS !== null;

// Human-readable error for the "contract not deployed" UI state.
export const SBT_NOT_DEPLOYED_HINT =
  `Run \`node scripts/deploy-sbt.js --network sepolia\` to deploy SoulboundCredential, ` +
  `then set ${SBT_ADDRESS_ENV_KEY} in .env and restart the dev server.`;

export const SOULBOUND_ABI = [
  // Write
  "function mint(address to, bytes32 credentialHash) external returns (uint256)",
  "function revoke(uint256 tokenId) external",
  "function burn(uint256 tokenId) external",
  "function setIssuer(address issuer, bool allowed) external",
  // Read — ERC-721
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function balanceOf(address holder) external view returns (uint256)",
  "function totalSupply() external view returns (uint256)",
  "function tokenIdsOf(address holder) external view returns (uint256[])",
  "function tokenByCredentialHash(bytes32 credentialHash) external view returns (uint256)",
  "function getCredential(uint256 tokenId) external view returns (bytes32 credentialHash, address holder, uint64 issuedAt, bool revoked)",
  "function isRevoked(uint256 tokenId) external view returns (bool)",
  "function isValid(uint256 tokenId) external view returns (bool)",
  "function tokenURI(uint256 tokenId) external view returns (string)",
  // Read — EIP-5192 soulbound introspection
  "function locked(uint256 tokenId) external view returns (bool)",
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
  // Read — authorization (needed to tell "not allowlisted" apart from other reverts)
  "function admin() external view returns (address)",
  "function isIssuer(address account) external view returns (bool)",
  // Custom errors. Without these in the ABI, ethers reports every revert as
  // "unknown custom error" and the user is left guessing.
  "error NotAdmin()",
  "error NotIssuer()",
  "error ZeroAddress()",
  "error ZeroCredentialHash()",
  "error NonTransferable()",
  "error DuplicateCredential()",
  "error TokenNotFound()",
  "error AlreadyRevoked()",
  "error MaxSupplyReached()",
  // Events
  "event Minted(uint256 indexed tokenId, address indexed holder, bytes32 indexed credentialHash, uint64 issuedAt)",
  "event Revoked(uint256 indexed tokenId, address indexed issuer)",
  "event Burned(uint256 indexed tokenId, address indexed burnedBy)",
  // Standard ERC-721 Transfer. The indexed types must be `address`, not
  // `uint256` — they determine topic0, and a wrong type yields
  // 0xaf6151f5… instead of 0xddf252ad…, so real logs would never decode.
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "event IssuerUpdated(address indexed issuer, bool allowed)",
  "event Locked(uint256 indexed tokenId)",
  "event Unlocked(uint256 indexed tokenId)",
] as const;

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
