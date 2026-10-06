// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IERC3009} from "./PayoutForwarder.sol";

/// @dev The V1 forwarder's funded() view, to refuse orders it already paid.
interface ILegacyForwarder {
    function funded(uint256 orderId) external view returns (bool);
}

/**
 * @title PayoutForwarderV2
 * @notice Moves the stablecoin for one payout (bank or crypto cash-out) from the user's wallet to
 * its destination in a single transaction, and records it. Same guarantees as PayoutForwarder,
 * for any allowlisted token:
 * - Only an allowed relayer can call; the relayer pays the gas.
 * - Each orderId is funded once, here or in the V1 forwarder.
 * - The contract never keeps tokens: payer → this → sink in one call, balance checked.
 * - Every payout emits PayoutFunded(orderId, payer, sink, token, amount).
 *
 * Two pull modes, set per token by the owner:
 * - EIP3009: the payer signs the token's ReceiveWithAuthorization to this contract with
 *   nonce = keccak256(orderId, sink). Only this contract can redeem it. No allowance exists.
 * - APPROVAL: for tokens without EIP-3009 (e.g. USDT on Base). The payer approves this contract
 *   once, and every payout still needs the payer's EIP-712 signature over
 *   Payout(orderId, payer, token, sink, amount, deadline), at most an hour ahead. The relayer
 *   alone can never pull funds, nor pick which of a signer's wallets pays.
 *
 * EIP-3009 mode takes (v, r, s), so it serves EOA payers (including EIP-7702 accounts); smart
 * contract wallets use APPROVAL-mode tokens only.
 *
 * V2 refuses orders V1 funded, but V1 cannot see V2: retire V1 (remove its relayer or pause it)
 * once its in-flight orders have settled, before V2 takes new orders.
 *
 * Constructor args are identical on every chain (tokens are configured after deploy), so a
 * CREATE2 deploy gives one address everywhere.
 */
contract PayoutForwarderV2 is Ownable2Step, Pausable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    enum Mode {
        NONE,
        EIP3009,
        APPROVAL
    }

    /// @notice Largest single payout: $10,000. Only 6-decimal tokens can be listed.
    uint256 public constant MAX_AMOUNT = 10_000e6;

    /// @notice An APPROVAL-mode signature may be valid for at most this long.
    uint256 public constant MAX_SIGNATURE_WINDOW = 1 hours;

    bytes32 public constant PAYOUT_TYPEHASH = keccak256(
        "Payout(uint256 orderId,address payer,address token,address sink,uint256 amount,uint256 deadline)"
    );

    /// @notice The V1 forwarder; orders it funded are refused here. Zero or no code: skipped.
    address public immutable legacyForwarder;

    mapping(address => bool) public isRelayer;
    mapping(uint256 => bool) public funded;
    mapping(address => Mode) public tokenMode;

    event PayoutFunded(
        uint256 indexed orderId,
        address indexed payer,
        address indexed sink,
        address token,
        uint256 amount
    );
    event RelayerSet(address indexed relayer, bool allowed);
    event TokenSet(address indexed token, Mode mode);
    event OrderVoided(uint256 indexed orderId);
    event TokensRescued(address indexed token, address indexed to, uint256 amount);

    error NotRelayer();
    error InvalidAmount();
    error InvalidSink();
    error AlreadyFunded(uint256 orderId);
    error WrongMode(address token);
    error InvalidSignature();
    error Expired();
    error BalanceChanged();
    error SinkNotPaidInFull();
    error UnsupportedDecimals(address token);
    error LegacyNotDeployed();
    error RenounceDisabled();
    error NotRelayerOrOwner();

    modifier onlyRelayer() {
        if (!isRelayer[msg.sender]) revert NotRelayer();
        _;
    }

    constructor(address initialOwner, address initialRelayer, address legacy)
        Ownable(initialOwner)
        EIP712("FX Remit PayoutForwarder", "2")
    {
        // A legacy address with no code would silently skip the V1 check: refuse it.
        if (legacy != address(0) && legacy.code.length == 0) revert LegacyNotDeployed();
        legacyForwarder = legacy;
        if (initialRelayer != address(0)) {
            isRelayer[initialRelayer] = true;
            emit RelayerSet(initialRelayer, true);
        }
    }

    /// @notice The EIP-3009 nonce the payer signs for this order and destination (same as V1).
    function authorizationNonce(uint256 orderId, address sink) public pure returns (bytes32) {
        return keccak256(abi.encode(orderId, sink));
    }

    /// @notice EIP-712 digest the payer signs for an APPROVAL-mode payout.
    function payoutDigest(uint256 orderId, address payer, address token, address sink, uint256 amount, uint256 deadline)
        public
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(keccak256(abi.encode(PAYOUT_TYPEHASH, orderId, payer, token, sink, amount, deadline)));
    }

    /// @notice Fund one order with an EIP-3009 token (the payer signed ReceiveWithAuthorization).
    function payoutWithAuthorization(
        uint256 orderId,
        address payer,
        address sink,
        address token,
        uint256 amount,
        uint256 validBefore,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external onlyRelayer whenNotPaused nonReentrant {
        if (tokenMode[token] != Mode.EIP3009) revert WrongMode(token);
        _claim(orderId, payer, sink, token, amount);
        uint256 balanceBefore = IERC20(token).balanceOf(address(this));

        IERC3009(token).receiveWithAuthorization(
            payer, address(this), amount, 0, validBefore, authorizationNonce(orderId, sink), v, r, s
        );
        _forward(orderId, payer, sink, token, amount, balanceBefore);
    }

    /// @notice Fund one order with an APPROVAL token: needs the payer's allowance and Payout signature.
    function payoutWithApproval(
        uint256 orderId,
        address payer,
        address sink,
        address token,
        uint256 amount,
        uint256 deadline,
        bytes calldata signature
    ) external onlyRelayer whenNotPaused nonReentrant {
        if (tokenMode[token] != Mode.APPROVAL) revert WrongMode(token);
        if (block.timestamp > deadline || deadline > block.timestamp + MAX_SIGNATURE_WINDOW) revert Expired();
        if (!_isPayerSignature(payer, payoutDigest(orderId, payer, token, sink, amount, deadline), signature)) {
            revert InvalidSignature();
        }
        _claim(orderId, payer, sink, token, amount);
        uint256 balanceBefore = IERC20(token).balanceOf(address(this));

        IERC20(token).safeTransferFrom(payer, address(this), amount);
        _forward(orderId, payer, sink, token, amount, balanceBefore);
    }

    /**
     * @notice Close an order for good without moving funds (e.g. an abandoned APPROVAL-mode order
     * whose signature is still within its deadline). Relayer or owner.
     */
    function voidOrder(uint256 orderId) external {
        if (!isRelayer[msg.sender] && msg.sender != owner()) revert NotRelayerOrOwner();
        if (funded[orderId]) revert AlreadyFunded(orderId);
        funded[orderId] = true;
        emit OrderVoided(orderId);
    }

    function setToken(address token, Mode mode) external onlyOwner {
        if (mode != Mode.NONE && IERC20Metadata(token).decimals() != 6) revert UnsupportedDecimals(token);
        tokenMode[token] = mode;
        emit TokenSet(token, mode);
    }

    function setRelayer(address relayer, bool allowed) external onlyOwner {
        isRelayer[relayer] = allowed;
        emit RelayerSet(relayer, allowed);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Return tokens sent to this contract by mistake.
    function rescueTokens(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
        emit TokensRescued(token, to, amount);
    }

    /// @dev Never leave the contract without an owner.
    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }

    /// @dev Checks shared by both modes, then marks the order funded before any external call.
    function _claim(uint256 orderId, address payer, address sink, address token, uint256 amount) internal {
        if (amount == 0 || amount > MAX_AMOUNT) revert InvalidAmount();
        if (sink == address(0) || sink == payer || sink == address(this) || sink == token) revert InvalidSink();
        if (funded[orderId]) revert AlreadyFunded(orderId);
        if (legacyForwarder.code.length > 0 && ILegacyForwarder(legacyForwarder).funded(orderId)) {
            revert AlreadyFunded(orderId);
        }
        funded[orderId] = true;
    }

    function _forward(uint256 orderId, address payer, address sink, address token, uint256 amount, uint256 balanceBefore)
        internal
    {
        uint256 sinkBefore = IERC20(token).balanceOf(sink);
        IERC20(token).safeTransfer(sink, amount);
        if (IERC20(token).balanceOf(address(this)) != balanceBefore) revert BalanceChanged();
        // The destination must get exactly what the event reports (no fee-on-transfer).
        if (IERC20(token).balanceOf(sink) - sinkBefore != amount) revert SinkNotPaidInFull();
        emit PayoutFunded(orderId, payer, sink, token, amount);
    }

    /// @dev The payer's key (also for EIP-7702 accounts, whose key still signs), or ERC-1271.
    function _isPayerSignature(address payer, bytes32 digest, bytes calldata signature) internal view returns (bool) {
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecoverCalldata(digest, signature);
        if (err == ECDSA.RecoverError.NoError && recovered == payer) return true;
        return payer.code.length > 0 && SignatureChecker.isValidERC1271SignatureNow(payer, digest, signature);
    }
}
