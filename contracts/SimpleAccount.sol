// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title SimpleAccount
 * @notice Minimal ERC-4337 smart account for BlockID (Phase 2).
 *
 * Credential operations (anchor / revoke) can be submitted gasless via a
 * bundler + paymaster: the account validates the UserOperation signature in
 * `validateUserOp` and the entrypoint pays gas, optionally sponsored.
 *
 * Demo-grade by design — production deployments should use audited
 * implementations (e.g. Safe{Core} / eth-infinitism Account v0.7).
 */
contract SimpleAccount {
    struct UserOperation {
        address sender;
        uint256 nonce;
        bytes initCode;
        bytes callData;
        uint256 callGasLimit;
        uint256 verificationGasLimit;
        uint256 preVerificationGas;
        uint256 maxFeePerGas;
        uint256 maxPriorityFeePerGas;
        bytes paymasterAndData;
        bytes signature;
    }

    address public owner;
    address public entryPoint;
    address public factory; // SmartWalletRegistry that deployed this account

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Executed(address indexed dest, uint256 value);

    error OnlyOwnerOrEntrypoint();
    error BadSignatureLength();

    modifier onlyOwnerOrEntryPoint() {
        if (msg.sender != owner && msg.sender != entryPoint) revert OnlyOwnerOrEntrypoint();
        _;
    }

    constructor(address _owner, address _entryPoint, address _factory) {
        owner = _owner;
        entryPoint = _entryPoint;
        factory = _factory;
    }

    /// @notice Execute an arbitrary call from this account.
    function execute(address dest, uint256 value, bytes calldata data)
        external
        onlyOwnerOrEntryPoint
    {
        (bool ok, ) = dest.call{value: value}(data);
        require(ok, "SimpleAccount: call failed");
        emit Executed(dest, value);
    }

    /**
     * @notice ERC-4337 validation hook. Verifies the userOpHash is signed by
     * the current owner (EIP-191 personal_sign semantics over the hash).
     * Returns packed validity per spec: 0 = valid forever, 1 = signature failure.
     */
    function validateUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external returns (uint256 validationData) {
        bytes32 digest = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", userOpHash)
        );
        address signer = _recover(digest, userOp.signature);
        validationData = signer == owner ? 0 : 1;

        // Compensate the bundler for prefund when called by the entrypoint
        if (missingAccountFunds > 0 && msg.sender == entryPoint) {
            (bool ok, ) = msg.sender.call{value: missingAccountFunds}("");
            require(ok, "SimpleAccount: prefund failed");
        }
    }

    /**
     * @dev Standard secp256k1 ECDSA recovery of a 65-byte [r, s, v] signature.
     */
    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) revert BadSignatureLength();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly ("memory-safe") {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;

        // EIP-2 malleability guard
        unchecked {
            if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
                return address(0);
            }
        }
        return ecrecover(digest, v, r, s);
    }

    /**
     * @notice Transfer ownership. Callable by the current owner, the
     * entrypoint, or the deploying registry (guardian-approved social recovery).
     */
    function transferOwnership(address newOwner) external {
        require(
            msg.sender == owner || msg.sender == entryPoint || msg.sender == factory,
            "SimpleAccount: not authorized"
        );
        require(newOwner != address(0), "SimpleAccount: zero owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    receive() external payable {}
}
