// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./SimpleAccount.sol";

/**
 * @title SmartWalletRegistry
 * @notice Phase 2 — ERC-4337 account factory + guardian social recovery for BlockID.
 *
 * Deploys deterministic (CREATE2) SimpleAccount instances keyed by
 * (owner, salt), tracks owner→account mappings, and implements a guardian
 * voting flow to recover an account after key loss:
 *
 *   1. Owner registers guardians and a threshold via `setGuardians`.
 *   2. Each guardian votes for a new owner with `voteRecovery`.
 *   3. Once `threshold` distinct guardians have voted, anyone can call
 *      `finalizeRecovery`, which rotates the account's ownership.
 */
contract SmartWalletRegistry {
    // ─── Storage ─────────────────────────────────────────────────────────────

    address public immutable entryPoint;

    /// @dev owner → deployed account
    mapping(address => address) public accountOf;

    /// @dev account → guardians list
    mapping(address => address[]) private _guardians;

    /// @dev account → guardian → isGuardian
    mapping(address => mapping(address => bool)) public isGuardian;

    /// @dev account → recovery threshold
    mapping(address => uint256) public recoveryThreshold;

    /// @dev account → newOwner → votes cast so far
    mapping(address => mapping(address => uint256)) public recoveryVotes;

    /// @dev account → newOwner → guardian → has voted
    mapping(address => mapping(address => mapping(address => bool))) private _hasVoted;

    // ─── Events ──────────────────────────────────────────────────────────────

    event AccountCreated(address indexed account, address indexed owner, bytes32 salt);
    event GuardiansUpdated(address indexed account, uint256 count, uint256 threshold);
    event RecoveryVote(address indexed account, address indexed newOwner, address indexed guardian);
    event Recovered(address indexed account, address indexed previousOwner, address indexed newOwner);

    error NotAccountOwner();
    error BadThreshold();
    error DuplicateGuardian();
    error NotGuardian();
    error AlreadyVoted();
    error ThresholdNotReached();
    error NotThisRegistry();

    constructor(address _entryPoint) {
        require(_entryPoint != address(0), "Registry: zero entrypoint");
        entryPoint = _entryPoint;
    }

    // ─── Factory ─────────────────────────────────────────────────────────────

    /**
     * @notice Deterministically compute the account address for (owner, salt)
     * without deploying it.
     */
    function getAccountAddress(address ownerAddr, bytes32 salt) public view returns (address) {
        bytes32 codeHash = keccak256(
            abi.encodePacked(
                type(SimpleAccount).creationCode,
                abi.encode(ownerAddr, entryPoint, address(this))
            )
        );
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, codeHash)))));
    }

    /**
     * @notice Deploy (or return the existing) SimpleAccount for msg.sender.
     * @param salt User-chosen salt for address derivation.
     */
    function createAccount(bytes32 salt) external returns (address account) {
        account = accountOf[msg.sender];
        if (account != address(0)) return account; // idempotent

        account = address(new SimpleAccount{salt: salt}(msg.sender, entryPoint, address(this)));
        accountOf[msg.sender] = account;
        emit AccountCreated(account, msg.sender, salt);
    }

    /** @notice Reverse lookup — which owner controls this account? */
    function ownerOf(address account) external view returns (address) {
        return SimpleAccount(payable(account)).owner();
    }

    // ─── Guardian management ─────────────────────────────────────────────────

    /**
     * @notice Replace the guardian set for caller's account.
     * @param guardians New guardian addresses (no duplicates, none zero).
     * @param threshold Distinct guardian votes required for recovery.
     */
    function setGuardians(address[] calldata guardians, uint256 threshold) external {
        address account = accountOf[msg.sender];
        if (account == address(0)) revert NotAccountOwner();

        // Clear old set
        address[] storage old = _guardians[account];
        for (uint256 i = 0; i < old.length; ) {
            isGuardian[account][old[i]] = false;
            ++i;
        }
        delete _guardians[account];

        require(threshold >= 1 && threshold <= guardians.length, "Registry: bad threshold");
        for (uint256 i = 0; i < guardians.length; ) {
            address g = guardians[i];
            require(g != address(0) && g != msg.sender, "Registry: bad guardian");
            if (isGuardian[account][g]) revert DuplicateGuardian();
            isGuardian[account][g] = true;
            _guardians[account].push(g);
            ++i;
        }
        recoveryThreshold[account] = threshold;
        emit GuardiansUpdated(account, guardians.length, threshold);
    }

    function getGuardians(address account) external view returns (address[] memory) {
        return _guardians[account];
    }

    // ─── Social recovery flow ────────────────────────────────────────────────

    /// A guardian casts a vote to hand `account` over to `newOwner`.
    function voteRecovery(address account, address newOwner) external {
        if (!isGuardian[account][msg.sender]) revert NotGuardian();
        if (_hasVoted[account][newOwner][msg.sender]) revert AlreadyVoted();
        _hasVoted[account][newOwner][msg.sender] = true;
        recoveryVotes[account][newOwner] += 1;
        emit RecoveryVote(account, newOwner, msg.sender);
    }

    /// Execute the rotation once the threshold has been reached.
    function finalizeRecovery(address account, address newOwner) external {
        if (recoveryVotes[account][newOwner] < recoveryThreshold[account]) {
            revert ThresholdNotReached();
        }
        address previousOwner = SimpleAccount(payable(account)).owner();
        SimpleAccount(payable(account)).transferOwnership(newOwner);

        // Reset bookkeeping
        recoveryVotes[account][newOwner] = 0;
        _resetVotes(account, newOwner);

        // Re-point the registry index: newOwner → same account
        accountOf[newOwner] = account;
        if (accountOf[previousOwner] == account) {
            delete accountOf[previousOwner];
        }
        emit Recovered(account, previousOwner, newOwner);
    }

    /** @dev Clear every guardian's vote for (account → newOwner). */
    function _resetVotes(address account, address newOwner) internal {
        address[] storage guardians = _guardians[account];
        for (uint256 i = 0; i < guardians.length; ) {
            _hasVoted[account][newOwner][guardians[i]] = false;
            ++i;
        }
    }
}
