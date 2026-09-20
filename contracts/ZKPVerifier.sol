// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @dev Minimal interface for CredentialRegistry — used to validate that a
 * vcFingerprint public signal corresponds to a live (not revoked) credential.
 * Import the full contract or use this interface for cross-contract calls.
 */
interface ICredentialRegistry {
    function isValid(bytes32 hash) external view returns (bool);
    function holderCommitments(bytes32 hash) external view returns (uint256);
}

/**
 * @title ZKPVerifier
 * @notice Generic Groth16 (BN254) zero-knowledge proof verifier for BlockID.
 *
 * Circuits are identified by a bytes32 id (e.g. keccak256("age-verify")). After
 * the trusted setup, the owner registers each circuit's verifying key once via
 * `registerVerificationKey`. Holders then submit Groth16 proofs that are
 * verified fully on-chain against the registered keys using the EIP-196/197
 * pairing precompiles.
 *
 * SHA-256 ‖ Poseidon Binding (Split-Field + Holder Binding)
 * ─────────────────────────────────────────────────────────
 * Each circuit exposes public signals covering:
 *   • vcFingerprintHi/Lo — SHA-256(canonicalVC) split into two 128-bit field elements (no mod-r loss)
 *   • holderCommitment   — Poseidon(secret), registered at issuance
 *   • vcCommitment       — Poseidon(vcFingerprintHi, vcFingerprintLo, secret) (circuit output)
 *   • nullifier          — Poseidon(secret, scope, challenge) (circuit output)
 *
 * The convenience wrappers (`verifyAgeProof`, `verifyAttributeProof`,
 * `verifyIssuerMembership`) reconstruct the full bytes32 SHA-256 fingerprint:
 *   bytes32 fp = bytes32((uint256(vcFingerprintHi) << 128) | uint256(vcFingerprintLo));
 * and validate `CredentialRegistry.isValid(fp)`.
 *
 * Signal layouts — circom emits OUTPUTS FIRST, then public inputs, so the
 * raw snarkjs publicSignals array (already in this order) is:
 *   age-verify        : [vcCommitment(0), nullifier(1), referenceTimestamp(2), minAgeSeconds(3), scope(4), challenge(5), vcFingerprintHi(6), vcFingerprintLo(7), holderCommitment(8)] (9)
 *   attribute-range   : [vcCommitment(0), nullifier(1), minValue(2), maxValue(3), scope(4), challenge(5), vcFingerprintHi(6), vcFingerprintLo(7), holderCommitment(8)] (9)
 *   issuer-membership : [vcCommitment(0), nullifier(1), root(2), scope(3), challenge(4), vcFingerprintHi(5), vcFingerprintLo(6), holderCommitment(7)] (8)
 *
 * Replay protection: the nullifier ALWAYS occupies public-signal index 1
 * (see NULLIFIER_IDX). verifyProof burns it — replaying with identical
 * challenge/scope is blocked.
 */
contract ZKPVerifier {
    // ─── Types ───────────────────────────────────────────────────────────────

    struct G1Point { uint256 x; uint256 y; }
    // Encoding of G2 field elements is: X[0] * i + X[1]
    struct G2Point { uint256[2] x; uint256[2] y; }

    struct VerifyingKey {
        G1Point alfa1;
        G2Point beta2;
        G2Point gamma2;
        G2Point delta2;
        uint256[] IC; // flat [x0,y0,x1,y1,…], length = 2 · (#publicInputs + 1)
    }

    struct Proof {
        uint256[2] a;      // G1
        uint256[2][2] b;   // G2 (imaginary-first per snarkjs convention)
        uint256[2] c;      // G1
    }

    // ─── Constants ───────────────────────────────────────────────────────────

    uint256 constant SNARK_SCALAR_FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    bytes32 public constant AGE_CIRCUIT = keccak256("age-verify");
    bytes32 public constant ATTRIBUTE_RANGE_CIRCUIT = keccak256("attribute-range");
    bytes32 public constant ISSUER_MEMBERSHIP_CIRCUIT = keccak256("issuer-membership");

    // ─── Signal layout constants ─────────────────────────────────────────────
    // Circom emits the main component's OUTPUTS first, then its public inputs.
    // Every BlockID circuit declares outputs in the same order
    // (vcCommitment, nullifier), so the nullifier is always at index 1.
    uint256 constant NULLIFIER_IDX = 1;

    // age-verify & attribute-range (9 signals):
    uint256 constant VC_FINGERPRINT_HI_IDX_9 = 6;
    uint256 constant VC_FINGERPRINT_LO_IDX_9 = 7;
    uint256 constant HOLDER_COMMITMENT_IDX_9 = 8;

    // issuer-membership (8 signals):
    uint256 constant VC_FINGERPRINT_HI_IDX_8 = 5;
    uint256 constant VC_FINGERPRINT_LO_IDX_8 = 6;
    uint256 constant HOLDER_COMMITMENT_IDX_8 = 7;

    // ─── Storage ─────────────────────────────────────────────────────────────

    address public owner;

    /// @dev circuitId → verifying key (flat encoding)
    mapping(bytes32 => VerifyingKey) private vks;
    /// @dev circuitId → registered?
    mapping(bytes32 => bool) public circuitRegistered;
    /// @dev nullifier → burned? (replay protection)
    mapping(uint256 => bool) public usedNullifiers;

    // ─── Events / Errors ─────────────────────────────────────────────────────

    event VerificationKeyRegistered(bytes32 indexed circuitId, uint256 icLength);
    event ProofVerified(bytes32 indexed circuitId, uint256 nullifierHash, address indexed submitter);
    event NullifierBurned(uint256 indexed nullifierHash);

    error NotOwner();
    error CircuitNotRegistered();
    error InvalidProof();
    error BadSignalLength();
    error SignalOutOfRange();
    error NullifierAlreadyUsed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ZKPVerifier: zero owner");
        owner = newOwner;
    }

    // ─── Key registration ────────────────────────────────────────────────────

    /**
     * @notice Register (or replace) the verifying key for a circuit.
     * @param circuitId Unique circuit identifier, e.g. keccak256("age-verify").
     * @param alfa1 Beta1 point of the key.
     * @param beta2  G2 beta2 point, encoded as [x_im, x_re, y_im, y_re].
     * @param gamma2 G2 gamma2 point, same encoding.
     * @param delta2 G2 delta2 point, same encoding.
     * @param icFlat Flat G1 points of the IC array: [x0, y0, x1, y1, …].
     */
    function registerVerificationKey(
        bytes32 circuitId,
        uint256[2] calldata alfa1,
        uint256[4] calldata beta2,
        uint256[4] calldata gamma2,
        uint256[4] calldata delta2,
        uint256[] calldata icFlat
    ) external onlyOwner {
        require(icFlat.length >= 2 && icFlat.length % 2 == 0, "ZKPVerifier: bad IC length");

        VerifyingKey storage vk = vks[circuitId];
        vk.alfa1 = G1Point(alfa1[0], alfa1[1]);
        vk.beta2 = G2Point([beta2[0], beta2[1]], [beta2[2], beta2[3]]);
        vk.gamma2 = G2Point([gamma2[0], gamma2[1]], [gamma2[2], gamma2[3]]);
        vk.delta2 = G2Point([delta2[0], delta2[1]], [delta2[2], delta2[3]]);

        delete vk.IC;
        for (uint256 i = 0; i < icFlat.length; ) {
            vk.IC.push(icFlat[i]);
            ++i;
        }

        circuitRegistered[circuitId] = true;
        emit VerificationKeyRegistered(circuitId, icFlat.length / 2);
    }

    // ─── Core verification ───────────────────────────────────────────────────

    /**
     * @notice Verify a Groth16 proof and burn its nullifier (replay protection).
     * The nullifier MUST be at public-signal index 1 (see NULLIFIER_IDX) —
     * circom emits outputs before public inputs and every BlockID circuit
     * declares (vcCommitment, nullifier) as its outputs.
     *
     * Signal layouts (see header for the authoritative order):
     *   age-verify        : 9 signals, nullifier at [1], vcFingerprintHi/Lo at [6]/[7], holderCommitment at [8]
     *   attribute-range   : 9 signals, nullifier at [1], vcFingerprintHi/Lo at [6]/[7], holderCommitment at [8]
     *   issuer-membership : 8 signals, nullifier at [1], vcFingerprintHi/Lo at [5]/[6], holderCommitment at [7]
     */
    function verifyProof(
        bytes32 circuitId,
        Proof calldata proof,
        uint256[] calldata pubSignals
    ) external returns (bool) {
        if (!circuitRegistered[circuitId]) revert CircuitNotRegistered();
        if (pubSignals.length < NULLIFIER_IDX + 1) revert BadSignalLength();

        uint256 nullifier = pubSignals[NULLIFIER_IDX];
        if (usedNullifiers[nullifier]) revert NullifierAlreadyUsed();

        if (!_verify(circuitId, proof, pubSignals)) revert InvalidProof();

        usedNullifiers[nullifier] = true;
        emit NullifierBurned(nullifier);
        emit ProofVerified(circuitId, nullifier, msg.sender);
        return true;
    }

    /** @notice View-only pairing check without burning any nullifier. */
    function checkProof(
        bytes32 circuitId,
        Proof calldata proof,
        uint256[] calldata pubSignals
    ) external view returns (bool) {
        if (!circuitRegistered[circuitId]) return false;
        return _verify(circuitId, proof, pubSignals);
    }

    function _verify(
        bytes32 circuitId,
        Proof calldata proof,
        uint256[] calldata pubSignals
    ) internal view returns (bool) {
        VerifyingKey storage vk = vks[circuitId];
        require(pubSignals.length + 1 == vk.IC.length / 2, "ZKPVerifier: bad signals");

        // vk_x = IC[0] + Σ IC[i+1] · sig[i]
        uint256 x = vk.IC[0];
        uint256 y = vk.IC[1];

        for (uint256 i = 0; i < pubSignals.length; ) {
            if (pubSignals[i] >= SNARK_SCALAR_FIELD) revert SignalOutOfRange();
            (uint256 mx, uint256 my) = _g1Mul(vk.IC[(i + 1) * 2], vk.IC[(i + 1) * 2 + 1], pubSignals[i]);
            (x, y) = _g1Add(x, y, mx, my);
            ++i;
        }

        // e(-A, B) · e(α1, β2) · e(vk_x, γ2) · e(C, δ2) == 1 ?
        uint256[24] memory pairInput;
        pairInput[0] = proof.a[0];                    // -A.x set below
        pairInput[1] = _negateY(proof.a[1]);          // -A.y (y=0 → 0)
        pairInput[2] = proof.b[0][0];                 // B.x.im
        pairInput[3] = proof.b[0][1];                 // B.x.re
        pairInput[4] = proof.b[1][0];                 // B.y.im
        pairInput[5] = proof.b[1][1];                 // B.y.re

        pairInput[6] = vk.alfa1.x;                    // α1
        pairInput[7] = vk.alfa1.y;
        pairInput[8] = vk.beta2.x[0];                 // β2
        pairInput[9] = vk.beta2.x[1];
        pairInput[10] = vk.beta2.y[0];
        pairInput[11] = vk.beta2.y[1];

        pairInput[12] = x;                            // vk_x
        pairInput[13] = y;
        pairInput[14] = vk.gamma2.x[0];               // γ2
        pairInput[15] = vk.gamma2.x[1];
        pairInput[16] = vk.gamma2.y[0];
        pairInput[17] = vk.gamma2.y[1];

        pairInput[18] = proof.c[0];                   // C
        pairInput[19] = proof.c[1];
        pairInput[20] = vk.delta2.x[0];               // δ2
        pairInput[21] = vk.delta2.x[1];
        pairInput[22] = vk.delta2.y[0];
        pairInput[23] = vk.delta2.y[1];

        uint256 result;
        bool ok;
        assembly ("memory-safe") {
            ok := staticcall(gas(), 8, pairInput, 768, result, 32)
        }
        require(ok, "ZKPVerifier: pairing failed");
        return result != 0;
    }

    /// Base field prime p of BN254 (distinct from the scalar field r).
    function BASE_FIELD_P() internal pure returns (uint256) {
        return 21888242871839275222246405745257275088696311157297823662689037894645226208583;
    }

    /// Negate a G1 point's Y coordinate over the base field.
    function _negateY(uint256 y) internal pure returns (uint256) {
        if (y == 0) return 0;
        unchecked { return BASE_FIELD_P() - y; }
    }

    // ─── Convenience wrappers ────────────────────────────────────────────────

    /**
     * @notice Verify an age proof.
     * Supply the raw snarkjs publicSignals in proof order (OUTPUTS first):
     *   [vcCommitment, nullifier, referenceTimestamp, minAgeSeconds,
     *    scope, challenge, vcFingerprintHi, vcFingerprintLo, holderCommitment]
     * @param proof         Groth16 proof (A, B, C points).
     * @param signals       9-element public signal array in the layout above.
     * @param registry      Address of CredentialRegistry for live-VC check.
     *                      Pass address(0) to skip the registry validation.
     */
    function verifyAgeProof(
        Proof calldata proof,
        uint256[9] calldata signals,
        address registry
    ) external returns (bool) {
        if (registry != address(0)) {
            // Reconstruct full 256-bit SHA-256 fingerprint from [Hi, Lo]
            bytes32 fp = bytes32(
                (uint256(signals[VC_FINGERPRINT_HI_IDX_9]) << 128) |
                    uint256(signals[VC_FINGERPRINT_LO_IDX_9])
            );
            require(
                ICredentialRegistry(registry).isValid(fp),
                "ZKPVerifier: credential not valid in registry"
            );
            uint256 registeredHolder = ICredentialRegistry(registry).holderCommitments(fp);
            if (registeredHolder != 0) {
                require(
                    registeredHolder == signals[HOLDER_COMMITMENT_IDX_9],
                    "ZKPVerifier: holder commitment mismatch"
                );
            }
        }
        uint256[] memory sigs = new uint256[](9);
        for (uint256 i = 0; i < 9; ) { sigs[i] = signals[i]; unchecked { ++i; } }
        return this.verifyProof(AGE_CIRCUIT, proof, sigs);
    }

    /**
     * @notice Verify an attribute-range proof.
     * Supply the raw snarkjs publicSignals in proof order (OUTPUTS first):
     *   [vcCommitment, nullifier, minValue, maxValue,
     *    scope, challenge, vcFingerprintHi, vcFingerprintLo, holderCommitment]
     * @param proof         Groth16 proof (A, B, C points).
     * @param signals       9-element public signal array in the layout above.
     * @param registry      Address of CredentialRegistry for live-VC check.
     *                      Pass address(0) to skip the registry validation.
     */
    function verifyAttributeProof(
        Proof calldata proof,
        uint256[9] calldata signals,
        address registry
    ) external returns (bool) {
        if (registry != address(0)) {
            bytes32 fp = bytes32(
                (uint256(signals[VC_FINGERPRINT_HI_IDX_9]) << 128) |
                    uint256(signals[VC_FINGERPRINT_LO_IDX_9])
            );
            require(
                ICredentialRegistry(registry).isValid(fp),
                "ZKPVerifier: credential not valid in registry"
            );
            uint256 registeredHolder = ICredentialRegistry(registry).holderCommitments(fp);
            if (registeredHolder != 0) {
                require(
                    registeredHolder == signals[HOLDER_COMMITMENT_IDX_9],
                    "ZKPVerifier: holder commitment mismatch"
                );
            }
        }
        uint256[] memory sigs = new uint256[](9);
        for (uint256 i = 0; i < 9; ) { sigs[i] = signals[i]; unchecked { ++i; } }
        return this.verifyProof(ATTRIBUTE_RANGE_CIRCUIT, proof, sigs);
    }

    /**
     * @notice Verify an issuer-membership proof.
     * Supply the raw snarkjs publicSignals in proof order (OUTPUTS first):
     *   [vcCommitment, nullifier, root, scope, challenge,
     *    vcFingerprintHi, vcFingerprintLo, holderCommitment]
     * @param proof         Groth16 proof (A, B, C points).
     * @param signals       8-element public signal array in the layout above.
     * @param registry      Address of CredentialRegistry for live-VC check.
     *                      Pass address(0) to skip the registry validation.
     */
    function verifyIssuerMembership(
        Proof calldata proof,
        uint256[8] calldata signals,
        address registry
    ) external returns (bool) {
        if (registry != address(0)) {
            bytes32 fp = bytes32(
                (uint256(signals[VC_FINGERPRINT_HI_IDX_8]) << 128) |
                    uint256(signals[VC_FINGERPRINT_LO_IDX_8])
            );
            require(
                ICredentialRegistry(registry).isValid(fp),
                "ZKPVerifier: credential not valid in registry"
            );
            uint256 registeredHolder = ICredentialRegistry(registry).holderCommitments(fp);
            if (registeredHolder != 0) {
                require(
                    registeredHolder == signals[HOLDER_COMMITMENT_IDX_8],
                    "ZKPVerifier: holder commitment mismatch"
                );
            }
        }
        uint256[] memory sigs = new uint256[](8);
        for (uint256 i = 0; i < 8; ) { sigs[i] = signals[i]; unchecked { ++i; } }
        return this.verifyProof(ISSUER_MEMBERSHIP_CIRCUIT, proof, sigs);
    }

    /** @notice Has a nullifier already been consumed? */
    function isNullifierUsed(uint256 nullifierHash) external view returns (bool) {
        return usedNullifiers[nullifierHash];
    }

    // ─── BN254 arithmetic (EIP-196 precompiles) ─────────────────────────────

    /// Add two G1 points via the EIP-196 add precompile.
    function _g1Add(uint256 ax, uint256 ay, uint256 bx, uint256 by)
        internal view returns (uint256 rx, uint256 ry)
    {
        assembly ("memory-safe") {
            let ptr := mload(0x40)
            mstore(ptr, ax)
            mstore(add(ptr, 32), ay)
            mstore(add(ptr, 64), bx)
            mstore(add(ptr, 96), by)
            let ok := staticcall(gas(), 6, ptr, 128, ptr, 64)
            if iszero(ok) { revert(0, 0) }
            rx := mload(ptr)
            ry := mload(add(ptr, 32))
        }
    }

    /// Scalar-multiply a G1 point via the EIP-196 mul precompile.
    function _g1Mul(uint256 px, uint256 py, uint256 s)
        internal view returns (uint256 rx, uint256 ry)
    {
        assembly ("memory-safe") {
            let ptr := mload(0x40)
            mstore(ptr, px)
            mstore(add(ptr, 32), py)
            mstore(add(ptr, 64), s)
            let ok := staticcall(gas(), 7, ptr, 96, ptr, 64)
            if iszero(ok) { revert(0, 0) }
            rx := mload(ptr)
            ry := mload(add(ptr, 32))
        }
    }
}
