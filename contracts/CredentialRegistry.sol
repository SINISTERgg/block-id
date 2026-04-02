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
 */
contract CredentialRegistry {
    struct Credential {
        address issuer;
        uint256 blockAnchored;
        bool revoked;
    }

    /// @dev hash → Credential storage
    mapping(bytes32 => Credential) public credentials;

    // ─── Events ──────────────────────────────────────────────────────────────

    event CredentialAnchored(
        bytes32 indexed hash,
        address indexed issuer,
        uint256 blockNumber
    );

    event CredentialRevoked(
        bytes32 indexed hash,
        address indexed issuer,
        uint256 blockNumber
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
            revoked: false
        });
        emit CredentialAnchored(hash, msg.sender, block.number);
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
        emit CredentialRevoked(hash, msg.sender, block.number);
    }

    // ─── Read functions ───────────────────────────────────────────────────────

    /**
     * @notice Read the full status of a credential.
     * @param hash The bytes32 hash to query.
     * @return anchored  Whether the hash has been anchored.
     * @return revoked   Whether the credential has been revoked.
     * @return issuer    The address that anchored the credential.
     * @return blockAnchored The block number at which it was anchored (0 if not anchored).
     */
    function getCredentialStatus(bytes32 hash)
        external
        view
        returns (
            bool anchored,
            bool revoked,
            address issuer,
            uint256 blockAnchored
        )
    {
        Credential memory c = credentials[hash];
        return (c.blockAnchored > 0, c.revoked, c.issuer, c.blockAnchored);
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
