// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title BiometricProofAnchor
 * @notice Phase 8 — on-chain anchoring of biometric verification outcomes.
 *
 * Privacy model:
 *  - NO raw images, templates, or embeddings ever touch this contract.
 *  - `subjectHash`  = keccak256/SHA-256 commitment binding a holder identity
 *    (e.g. DID) to their biometric template digest — computed off-chain.
 *  - `proofHash`    = keccak256/SHA-256 over the full verification result
 *    bundle (challenge nonce + subject hash + match score + timestamp).
 *
 * Guarantees:
 *  - replay prevention: each `proofHash` can be anchored exactly once
 *  - verifier allow-list: only the trusted biometric-verify relayer anchors
 *  - freshness: records expire; verifiers can require an unexpired record
 */
contract BiometricProofAnchor {
    // ─── Storage ─────────────────────────────────────────────────────────────

    /// @dev Admin (deployer) — manages the verifier allow-list.
    address public admin;

    /// @dev Addresses allowed to anchor/invalidate proofs (biometric service wallets).
    mapping(address => bool) public isVerifier;

    struct ProofRecord {
        bytes32 subjectHash;
        bytes32 proofHash;
        address verifier;
        uint64 anchoredAt;
        uint64 expiresAt;
    }

    /// @dev proofHash → record (replay-proof registry)
    mapping(bytes32 => ProofRecord) private _records;

    /// @dev subjectHash → latest proofHash (one active verification per subject)
    mapping(bytes32 => bytes32) public latestProofBySubject;

    uint256 public totalAnchored;

    // ─── Events ──────────────────────────────────────────────────────────────

    event ProofAnchored(
        bytes32 indexed subjectHash,
        bytes32 indexed proofHash,
        address indexed verifier,
        uint64 anchoredAt,
        uint64 expiresAt
    );
    event RecordInvalidated(bytes32 indexed subjectHash, bytes32 indexed proofHash);
    event VerifierUpdated(address indexed verifier, bool allowed);

    // ─── Errors ──────────────────────────────────────────────────────────────

    error NotAdmin();
    error NotVerifier();
    error ZeroAddress();
    error ZeroSubjectHash();
    error ZeroProofHash();
    error InvalidDuration();
    error ReplayDetected();
    error RecordNotFound();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyVerifier() {
        if (!isVerifier[msg.sender] && msg.sender != admin) revert NotVerifier();
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    function setVerifier(address verifier, bool allowed) external onlyAdmin {
        if (verifier == address(0)) revert ZeroAddress();
        isVerifier[verifier] = allowed;
        emit VerifierUpdated(verifier, allowed);
    }

    // ─── Anchor / invalidate ─────────────────────────────────────────────────

    /**
     * @notice Anchor a successful biometric verification.
     * @param subjectHash Commitment binding holder identity to template digest.
     * @param proofHash   Hash of the full verification result bundle.
     * @param validFor    How long the verification stays fresh (seconds).
     */
    function anchorProof(
        bytes32 subjectHash,
        bytes32 proofHash,
        uint64 validFor
    ) external onlyVerifier returns (bool anchored) {
        if (subjectHash == bytes32(0)) revert ZeroSubjectHash();
        if (proofHash == bytes32(0)) revert ZeroProofHash();
        if (validFor == 0 || validFor > 365 days) revert InvalidDuration();
        if (_records[proofHash].anchoredAt != 0) revert ReplayDetected();

        _records[proofHash] = ProofRecord({
            subjectHash: subjectHash,
            proofHash: proofHash,
            verifier: msg.sender,
            anchoredAt: uint64(block.timestamp),
            expiresAt: uint64(block.timestamp) + validFor
        });
        latestProofBySubject[subjectHash] = proofHash;
        totalAnchored += 1;

        emit ProofAnchored(subjectHash, proofHash, msg.sender, uint64(block.timestamp), uint64(block.timestamp) + validFor);
        return true;
    }

    /**
     * @notice Invalidate a subject's current proof (e.g. re-verification failed,
     * fraud report). Only affects freshness checks via `latestProofBySubject`.
     */
    function invalidateSubject(bytes32 subjectHash) external onlyVerifier {
        bytes32 proofHash = latestProofBySubject[subjectHash];
        if (proofHash == bytes32(0)) revert RecordNotFound();

        delete latestProofBySubject[subjectHash];
        emit RecordInvalidated(subjectHash, proofHash);
    }

    // ─── Views ───────────────────────────────────────────────────────────────

    function isProofUsed(bytes32 proofHash) external view returns (bool) {
        return _records[proofHash].anchoredAt != 0;
    }

    function getRecord(bytes32 proofHash)
        external
        view
        returns (
            bytes32 subjectHash,
            address verifier,
            uint64 anchoredAt,
            uint64 expiresAt
        )
    {
        ProofRecord storage r = _records[proofHash];
        if (r.anchoredAt == 0) revert RecordNotFound();
        return (r.subjectHash, r.verifier, r.anchoredAt, r.expiresAt);
    }

    /** @notice True when the subject has an unexpired anchored verification. */
    function isBiometricallyVerified(bytes32 subjectHash) external view returns (bool) {
        bytes32 proofHash = latestProofBySubject[subjectHash];
        if (proofHash == bytes32(0)) return false;
        return _records[proofHash].expiresAt >= block.timestamp;
    }
}
