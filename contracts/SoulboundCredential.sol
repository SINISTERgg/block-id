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

    /**
     * @notice ERC-721 metadata URI.
     * @dev When `baseURI` is set, returns `baseURI + tokenId`.
     *      Otherwise builds a fully on-chain `data:application/json;base64,...`
     *      with an embedded SVG badge image so Etherscan/OpenSea render a visual
     *      instead of "N/A".
     */
    function tokenURI(uint256 tokenId) external view returns (string memory) {
        if (_owners[tokenId] == address(0)) revert TokenNotFound();
        if (bytes(baseURI).length != 0) {
            return string(abi.encodePacked(baseURI, _toString(tokenId)));
        }
        return _inlineMetadata(tokenId);
    }

    /// @dev EIP-5192: every minted token is permanently locked (soulbound).
    function locked(uint256 tokenId) external view returns (bool) {
        return _owners[tokenId] != address(0);
    }

    /// @dev On-chain JSON metadata with an embedded SVG badge image.
    function _inlineMetadata(uint256 tokenId) internal view returns (string memory) {
        bytes memory hashBytes = abi.encodePacked(_credentials[tokenId].credentialHash);
        bytes memory svgImage = _buildBadgeSvg(tokenId);
        bytes memory imageDataUri = abi.encodePacked(
            "data:image/svg+xml;base64,",
            _base64(svgImage)
        );
        bytes memory json = abi.encodePacked(
            '{"name":"BlockID Credential #',
            _toString(tokenId),
            '","description":"Soulbound verifiable credential issued by BlockID. Non-transferable (EIP-5192).","image":"',
            imageDataUri,
            '","attributes":[{"trait_type":"Credential Hash","value":"0x',
            _toHex(hashBytes),
            '"},{"trait_type":"Soulbound","value":"true"},{"trait_type":"Issued At","value":',
            _toString(uint256(_credentials[tokenId].issuedAt)),
            '},{"trait_type":"Revoked","value":"',
            _credentials[tokenId].revoked ? "true" : "false",
            '"}]}'
        );
        return string(abi.encodePacked("data:application/json;base64,", _base64(json)));
    }

    /// @dev Compact colour-palette-cycled SVG badge (6 palettes, chosen by tokenId % 6).
    function _buildBadgeSvg(uint256 tokenId) internal view returns (bytes memory) {
        bytes[6] memory fromC = [bytes("#1e3a5f"),bytes("#3b1a6b"),bytes("#0d4040"),bytes("#78350f"),bytes("#1e1b4b"),bytes("#14532d")];
        bytes[6] memory toC   = [bytes("#2563eb"),bytes("#7c3aed"),bytes("#0f766e"),bytes("#d97706"),bytes("#4f46e5"),bytes("#16a34a")];
        bytes[6] memory accC  = [bytes("#93c5fd"),bytes("#c4b5fd"),bytes("#5eead4"),bytes("#fde68a"),bytes("#a5b4fc"),bytes("#86efac")];
        uint256 p = tokenId % 6;
        string memory tid = _toString(tokenId);
        return abi.encodePacked(
            '<svg width="500" height="500" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">',
            '<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">',
            '<stop offset="0%" stop-color="',fromC[p],'" /><stop offset="100%" stop-color="',toC[p],'" /></linearGradient></defs>',
            '<rect width="100" height="100" fill="#0f0f1a" />',
            '<circle cx="50" cy="50" r="48" fill="',fromC[p],'" opacity="0.3" />',
            '<circle cx="50" cy="50" r="44" fill="url(#bg)" />',
            '<circle cx="50" cy="50" r="44" stroke="',accC[p],'" stroke-width="1.5" stroke-opacity="0.35" fill="none" />',
            '<g transform="translate(29,24) scale(1.75)"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" fill="',accC[p],'" /></g>',
            '<text x="50" y="73" text-anchor="middle" fill="',accC[p],'" font-size="7.5" font-weight="600" font-family="system-ui,sans-serif" letter-spacing="0.3">BLOCKID SBT</text>',
            '<rect x="33" y="79" width="34" height="11" rx="5.5" fill="',accC[p],'" fill-opacity="0.18" />',
            '<text x="50" y="87.5" text-anchor="middle" fill="',accC[p],'" font-size="7" font-family="monospace" font-weight="700">#',tid,'</text>',
            '<g transform="translate(72,72)"><circle r="10" fill="#22c55e" /><path d="M-4 0 L-1.5 2.5 L4 -3" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" /></g>',
            '</svg>'
        );
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
    // 0x80ac58cd = ERC-721 core
    // 0x5b5e139f = ERC-721 Metadata (name/symbol/tokenURI)
    // 0xb45a3c0e = EIP-5192 (locked)
    // 0x01ffc9a7 = ERC-165
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == type(IERC721Soulbound).interfaceId ||
            interfaceId == 0x01ffc9a7 ||
            interfaceId == 0x80ac58cd ||
            interfaceId == 0x5b5e139f ||
            interfaceId == 0xb45a3c0e;
    }

    // ─── Internals ───────────────────────────────────────────────────────────

    /// @dev Minimal indexer-facing transfer event (mint = from 0, burn = to 0).
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    function _toHex(bytes memory data) internal pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory out = new bytes(data.length * 2);
        for (uint256 i = 0; i < data.length; i++) {
            out[i * 2]     = alphabet[uint8(data[i]) >> 4];
            out[i * 2 + 1] = alphabet[uint8(data[i]) & 0x0f];
        }
        return string(out);
    }

    function _base64(bytes memory data) internal pure returns (string memory) {
        bytes memory table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        uint256 len = data.length;
        if (len == 0) return "";
        bytes memory out = new bytes(4 * ((len + 2) / 3));
        uint256 i = 0;
        uint256 o = 0;
        while (i < len) {
            uint256 rem = len - i;
            uint256 b0 = uint8(data[i]);
            uint256 b1 = rem > 1 ? uint8(data[i + 1]) : 0;
            uint256 b2 = rem > 2 ? uint8(data[i + 2]) : 0;
            out[o++] = table[b0 >> 2];
            out[o++] = table[((b0 & 0x03) << 4) | (b1 >> 4)];
            if (rem > 1) { out[o++] = table[((b1 & 0x0f) << 2) | (b2 >> 6)]; } else { out[o++] = bytes1("="); }
            if (rem > 2) { out[o++] = table[b2 & 0x3f]; } else { out[o++] = bytes1("="); }
            i += 3;
        }
        return string(out);
    }

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

