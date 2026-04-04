// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title CredentialRegistry
 * @notice On-chain registry for BlockID Verifiable Credentials anchored on Polygon Amoy.
 *
 * Each credential is identified by a bytes32 SHA-256 hash of its canonical JSON.
 * The issuer anchors a credential by calling `anchorCredential`, and can later
 * revoke it by calling `revokeCredential`. Anyone can read the status via
 * `getCredentialStatus` — a free view call that requires no wallet or gas.
 *
 * v2 additions:
 *   - anchoredAt / revokedAt timestamps stored on-chain via block.timestamp
 *   - anchorCredentialBatch() — anchor N credentials in a single transaction
 *   - getCredentialBatch()    — read N statuses in a single free view call
 */
contract CredentialRegistry {
    struct Credential {
        address issuer;
        uint256 blockAnchored;
        uint256 anchoredAt;   // block.timestamp at anchor time
        uint256 revokedAt;    // block.timestamp at revocation (0 if not revoked)
        bool revoked;
    }

    /// @dev hash → Credential storage
    mapping(bytes32 => Credential) public credentials;

    // ─── Events ──────────────────────────────────────────────────────────────

    event CredentialAnchored(
        bytes32 indexed hash,
        address indexed issuer,
        uint256 blockNumber,
        uint256 timestamp
    );

    event CredentialRevoked(
        bytes32 indexed hash,
        address indexed issuer,
        uint256 blockNumber,
        uint256 timestamp
    );

    // ─── Write functions ──────────────────────────────────────────────────────

    /**
     * @notice Anchor a credential hash on-chain.
     * @param hash The bytes32 SHA-256 hash of the canonical credential JSON.
     *
     * Requirements:
     * - `hash` must not already be anchored.
     */
    function anchorCredential(bytes32 hash) external {
        require(
            credentials[hash].blockAnchored == 0,
            "CredentialRegistry: already anchored"
        );
        credentials[hash] = Credential({
            issuer: msg.sender,
            blockAnchored: block.number,
            anchoredAt: block.timestamp,
            revokedAt: 0,
            revoked: false
        });
        emit CredentialAnchored(hash, msg.sender, block.number, block.timestamp);
    }

    /**
     * @notice Anchor multiple credential hashes in a single transaction.
     * @param hashes Array of bytes32 SHA-256 hashes to anchor.
     *
     * Each hash must not already be anchored. If any hash is already anchored
     * the entire transaction reverts — validate off-chain before calling.
     */
    function anchorCredentialBatch(bytes32[] calldata hashes) external {
        uint256 len = hashes.length;
        require(len > 0, "CredentialRegistry: empty batch");
        require(len <= 100, "CredentialRegistry: batch too large");
        for (uint256 i = 0; i < len; ) {
            bytes32 h = hashes[i];
            require(
                credentials[h].blockAnchored == 0,
                "CredentialRegistry: hash already anchored"
            );
            credentials[h] = Credential({
                issuer: msg.sender,
                blockAnchored: block.number,
                anchoredAt: block.timestamp,
                revokedAt: 0,
                revoked: false
            });
            emit CredentialAnchored(h, msg.sender, block.number, block.timestamp);
            unchecked { ++i; }
        }
    }

    /**
     * @notice Revoke a credential. Only the original issuer can revoke.
     * @param hash The bytes32 hash of the credential to revoke.
     *
     * Requirements:
     * - `hash` must be anchored.
     * - `msg.sender` must be the original issuer.
     * - `hash` must not already be revoked.
     */
    function revokeCredential(bytes32 hash) external {
        Credential storage cred = credentials[hash];
        require(
            cred.blockAnchored != 0,
            "CredentialRegistry: not anchored"
        );
        require(
            cred.issuer == msg.sender,
            "CredentialRegistry: caller is not issuer"
        );
        require(
            !cred.revoked,
            "CredentialRegistry: already revoked"
        );
        cred.revoked = true;
        cred.revokedAt = block.timestamp;
        emit CredentialRevoked(hash, msg.sender, block.number, block.timestamp);
    }

    // ─── Read functions ───────────────────────────────────────────────────────

    /**
     * @notice Read the full status of a credential.
     * @param hash The bytes32 hash to query.
     * @return anchored       Whether the hash has been anchored.
     * @return revoked        Whether the credential has been revoked.
     * @return issuer         The address that anchored the credential.
     * @return blockAnchored  The block number at which it was anchored (0 if not anchored).
     * @return anchoredAt     Unix timestamp of anchoring (0 if not anchored).
     * @return revokedAt      Unix timestamp of revocation (0 if not revoked).
     */
    function getCredentialStatus(bytes32 hash)
        external
        view
        returns (
            bool anchored,
            bool revoked,
            address issuer,
            uint256 blockAnchored,
            uint256 anchoredAt,
            uint256 revokedAt
        )
    {
        Credential memory c = credentials[hash];
        return (c.blockAnchored > 0, c.revoked, c.issuer, c.blockAnchored, c.anchoredAt, c.revokedAt);
    }

    /**
     * @notice Batch-read status for multiple hashes in a single free call.
     * @param hashes Array of bytes32 hashes to query (max 100).
     * @return anchored      Array — true if each hash is anchored.
     * @return revoked       Array — true if each hash is revoked.
     * @return issuers       Array — issuer addresses.
     * @return blockNumbers  Array — block numbers at anchor (0 if not anchored).
     * @return timestamps    Array — anchor timestamps (0 if not anchored).
     */
    function getCredentialBatch(bytes32[] calldata hashes)
        external
        view
        returns (
            bool[] memory anchored,
            bool[] memory revoked,
            address[] memory issuers,
            uint256[] memory blockNumbers,
            uint256[] memory timestamps
        )
    {
        uint256 len = hashes.length;
        require(len <= 100, "CredentialRegistry: batch too large");
        anchored     = new bool[](len);
        revoked      = new bool[](len);
        issuers      = new address[](len);
        blockNumbers = new uint256[](len);
        timestamps   = new uint256[](len);
        for (uint256 i = 0; i < len; ) {
            Credential memory c = credentials[hashes[i]];
            anchored[i]     = c.blockAnchored > 0;
            revoked[i]      = c.revoked;
            issuers[i]      = c.issuer;
            blockNumbers[i] = c.blockAnchored;
            timestamps[i]   = c.anchoredAt;
            unchecked { ++i; }
        }
    }

    /**
     * @notice Check if a credential is anchored and not revoked.
     * @param hash The bytes32 hash to query.
     * @return True if anchored and active.
     */
    function isValid(bytes32 hash) external view returns (bool) {
        Credential memory c = credentials[hash];
        return c.blockAnchored > 0 && !c.revoked;
    }
}
