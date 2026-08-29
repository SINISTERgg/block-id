// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @dev Minimal surface used for ERC-165 introspection by wallets/explorers.
interface IERC721Soulbound {
    function balanceOf(address owner) external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
    function transferFrom(address from, address to, uint256 tokenId) external;
}

/**
 * @title SoulboundCredential
 * @notice Phase 7 — non-transferable credential tokens (SBTs) for BlockID.
 *
 * Each minted token represents one verifiable credential anchored through
 * CredentialRegistry: `credentialHash` is the same keccak256(bytes32) value,
 * so an SBT is a portable, wallet-visible proof that a credential was issued
 * to the holder without storing any credential payload on-chain.
 *
 * Soulbound guarantees:
 *  - transfers/approvals always revert (`NonTransferable`)
 *  - exactly one SBT per credential hash (`DuplicateCredential`)
 *  - revocation and burn are issuer-controlled; holders cannot dump or move them
 */
contract SoulboundCredential {
    // ─── Storage ─────────────────────────────────────────────────────────────

    string public name;
    string public symbol;
    string public baseURI;

    /// @dev Admin (deployer) — manages the issuer allow-list and base URI.
    address public admin;

    /// @dev Addresses allowed to mint/revoke/burn credentials SBTs.
    mapping(address => bool) public isIssuer;

    uint256 private _nextTokenId = 1;
    uint256 public totalSupply;

    struct Credential {
        bytes32 credentialHash;
        address holder;
        uint64 issuedAt;
        bool revoked;
    }

    /// @dev tokenId → credential record
    mapping(uint256 => Credential) private _credentials;

    /// @dev tokenId → owner
    mapping(uint256 => address) private _owners;

    /// @dev holder → owned token ids
    mapping(address => uint256[]) private _heldTokens;

    /// @dev position of tokenId inside _heldTokens[holder] for O(1) removal
    mapping(uint256 => uint256) private _heldIndex;

    /// @dev credentialHash → tokenId (one SBT per credential)
    mapping(bytes32 => uint256) public tokenByCredentialHash;

    // ─── Events ──────────────────────────────────────────────────────────────

    event Minted(uint256 indexed tokenId, address indexed holder, bytes32 indexed credentialHash, uint64 issuedAt);
    event Revoked(uint256 indexed tokenId, address indexed issuer);
    event Burned(uint256 indexed tokenId, address indexed burnedBy);
    event IssuerUpdated(address indexed issuer, bool allowed);
    event BaseURIUpdated(string newBaseURI);

    // ─── Errors ──────────────────────────────────────────────────────────────

    error NotAdmin();
    error NotIssuer();
    error ZeroAddress();
    error ZeroCredentialHash();
    error NonTransferable();
    error DuplicateCredential();
    error TokenNotFound();
    error AlreadyRevoked();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyIssuer() {
        if (!isIssuer[msg.sender] && msg.sender != admin) revert NotIssuer();
        _;
    }

    constructor(string memory name_, string memory symbol_, string memory baseURI_) {
        name = name_;
        symbol = symbol_;
        baseURI = baseURI_;
        admin = msg.sender;
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    function setIssuer(address issuer, bool allowed) external onlyAdmin {
        if (issuer == address(0)) revert ZeroAddress();
        isIssuer[issuer] = allowed;
        emit IssuerUpdated(issuer, allowed);
    }

    function setBaseURI(string calldata newBaseURI) external onlyAdmin {
        baseURI = newBaseURI;
        emit BaseURIUpdated(newBaseURI);
    }

    // ─── Mint / revoke / burn ────────────────────────────────────────────────

    /**
     * @notice Mint a soulbound credential token for `to`.
     * @param to Holder address receiving the SBT (their EOA or smart account).
     * @param credentialHash keccak256 of the canonical credential (matches CredentialRegistry).
     * @return tokenId The newly minted token id.
     */
    function mint(address to, bytes32 credentialHash) external onlyIssuer returns (uint256 tokenId) {
        if (to == address(0)) revert ZeroAddress();
        if (credentialHash == bytes32(0)) revert ZeroCredentialHash();
        if (tokenByCredentialHash[credentialHash] != 0) revert DuplicateCredential();

        tokenId = _nextTokenId++;
        _owners[tokenId] = to;
        _heldIndex[tokenId] = _heldTokens[to].length;
        _heldTokens[to].push(tokenId);
        _credentials[tokenId] = Credential({
            credentialHash: credentialHash,
            holder: to,
            issuedAt: uint64(block.timestamp),
            revoked: false
        });
        totalSupply += 1;
        tokenByCredentialHash[credentialHash] = tokenId;

        emit Transfer(address(0), to, tokenId);
        emit Minted(tokenId, to, credentialHash, uint64(block.timestamp));
    }

    /** @notice Mark a credential SBT as revoked (e.g. credential revoked in registry). */
    function revoke(uint256 tokenId) external onlyIssuer {
        if (_owners[tokenId] == address(0)) revert TokenNotFound();
        if (_credentials[tokenId].revoked) revert AlreadyRevoked();
        _credentials[tokenId].revoked = true;
        emit Revoked(tokenId, msg.sender);
    }

    /**
     * @notice Permanently remove an SBT (privacy erasure). Issuer-only.
     * Frees the credentialHash so a replacement credential can be re-minted.
     */
    function burn(uint256 tokenId) external onlyIssuer {
        address holder = _owners[tokenId];
        if (holder == address(0)) revert TokenNotFound();

        bytes32 hash = _credentials[tokenId].credentialHash;
        delete _credentials[tokenId];
        delete tokenByCredentialHash[hash];
        delete _owners[tokenId];

        uint256[] storage held = _heldTokens[holder];
        uint256 idx = _heldIndex[tokenId];
        uint256 lastId = held[held.length - 1];
        if (lastId != tokenId) {
            held[idx] = lastId;
            _heldIndex[lastId] = idx;
        }
        held.pop();
        delete _heldIndex[tokenId];

        totalSupply -= 1;
        emit Transfer(holder, address(0), tokenId);
        emit Burned(tokenId, msg.sender);
    }

    // ─── Views (ERC-721-compatible surface) ─────────────────────────────────

    function balanceOf(address ownerAddr) external view returns (uint256) {
        if (ownerAddr == address(0)) revert ZeroAddress();
        return _heldTokens[ownerAddr].length;
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        address ownerAddr = _owners[tokenId];
        if (ownerAddr == address(0)) revert TokenNotFound();
        return ownerAddr;
    }

    function tokenIdsOf(address holder) external view returns (uint256[] memory) {
        return _heldTokens[holder];
    }

    function getCredential(uint256 tokenId)
        external
        view
        returns (bytes32 credentialHash, address holder, uint64 issuedAt, bool revoked)
    {
        if (_owners[tokenId] == address(0)) revert TokenNotFound();
        Credential storage c = _credentials[tokenId];
        return (c.credentialHash, c.holder, c.issuedAt, c.revoked);
    }

    function isRevoked(uint256 tokenId) external view returns (bool) {
        return _credentials[tokenId].revoked;
    }

    function isValid(uint256 tokenId) external view returns (bool) {
        return _owners[tokenId] != address(0) && !_credentials[tokenId].revoked;
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        if (_owners[tokenId] == address(0)) revert TokenNotFound();
        return string(abi.encodePacked(baseURI, _toString(tokenId)));
    }

    // ─── Soulbound enforcement ──────────────────────────────────────────────

    function transferFrom(address, address, uint256) external pure {
        revert NonTransferable();
    }

    function safeTransferFrom(address, address, uint256) external pure {
        revert NonTransferable();
    }

    function safeTransferFrom(address, address, uint256, bytes calldata) external pure {
        revert NonTransferable();
    }

    function approve(address, uint256) external pure {
        revert NonTransferable();
    }

    function setApprovalForAll(address, bool) external pure {
        revert NonTransferable();
    }

    // ERC-165
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC721Soulbound).interfaceId || interfaceId == 0x01ffc9a7;
    }

    // ─── Internals ───────────────────────────────────────────────────────────

    /// @dev Minimal indexer-facing transfer event (mint = from 0, burn = to 0).
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}

