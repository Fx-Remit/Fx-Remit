// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {FXRemitConstants} from "./FXRemitConstants.sol";

/// @dev EIP-3009 subset implemented by Circle's USDC (FiatToken v2+).
interface IERC3009 {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

/**
 * @title PayoutForwarder
 * @notice Moves the USDC for one bank payout from the user's wallet to the
 * Paycrest receive address in a single transaction, and records it.
 * @dev
 * - Only an allowed relayer can call `payout`; the relayer pays the gas.
 * - The user's wallet signs a USDC `ReceiveWithAuthorization` for exactly
 *   `amount`, to this contract, with nonce = keccak256(orderId, sink). A
 *   relayer that changes the order, destination or amount invalidates the
 *   signature, and only this contract can redeem it (EIP-3009 requires
 *   msg.sender == to). No allowance ever exists.
 * - Each orderId is funded once. The contract never keeps USDC.
 * - USDC is picked per chain from FXRemitConstants, so constructor args are
 *   identical on every chain and a CREATE2 deploy gives one address everywhere.
 */
contract PayoutForwarder is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Largest single payout: $10,000 (6 decimals).
    uint256 public constant MAX_AMOUNT = 10_000e6;

    IERC20 public immutable usdc;

    mapping(address => bool) public isRelayer;
    mapping(uint256 => bool) public funded;

    event PayoutFunded(
        uint256 indexed orderId,
        address indexed payer,
        address indexed sink,
        address token,
        uint256 amount
    );
    event RelayerSet(address indexed relayer, bool allowed);
    event TokensRescued(address indexed token, address indexed to, uint256 amount);

    error UnsupportedChain(uint256 chainId);
    error NotRelayer();
    error InvalidAmount();
    error InvalidSink();
    error AlreadyFunded(uint256 orderId);
    error BalanceChanged();
    error RenounceDisabled();

    modifier onlyRelayer() {
        if (!isRelayer[msg.sender]) revert NotRelayer();
        _;
    }

    constructor(address initialOwner, address initialRelayer) Ownable(initialOwner) {
        usdc = IERC20(_usdcFor(block.chainid));
        if (initialRelayer != address(0)) {
            isRelayer[initialRelayer] = true;
            emit RelayerSet(initialRelayer, true);
        }
    }

    /// @notice The EIP-3009 nonce the payer signs for this order and destination.
    function authorizationNonce(uint256 orderId, address sink) public pure returns (bytes32) {
        return keccak256(abi.encode(orderId, sink));
    }

    /**
     * @notice Fund one Paycrest order from the payer's wallet.
     * @param orderId     App order id; can be funded once.
     * @param payer       User wallet that signed the authorization.
     * @param sink        Paycrest receive address for this order.
     * @param amount      Exact USDC amount (6 decimals).
     * @param validBefore Authorization expiry (unix seconds).
     */
    function payout(
        uint256 orderId,
        address payer,
        address sink,
        uint256 amount,
        uint256 validBefore,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external onlyRelayer whenNotPaused nonReentrant {
        if (amount == 0 || amount > MAX_AMOUNT) revert InvalidAmount();
        if (sink == address(0) || sink == payer || sink == address(this) || sink == address(usdc)) {
            revert InvalidSink();
        }
        if (funded[orderId]) revert AlreadyFunded(orderId);
        funded[orderId] = true;

        uint256 balanceBefore = usdc.balanceOf(address(this));

        IERC3009(address(usdc)).receiveWithAuthorization(
            payer,
            address(this),
            amount,
            0,
            validBefore,
            authorizationNonce(orderId, sink),
            v,
            r,
            s
        );
        usdc.safeTransfer(sink, amount);

        if (usdc.balanceOf(address(this)) != balanceBefore) revert BalanceChanged();

        emit PayoutFunded(orderId, payer, sink, address(usdc), amount);
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

    function _usdcFor(uint256 chainId) internal pure returns (address) {
        if (chainId == 8453) return FXRemitConstants.BASE_USDC;
        if (chainId == 42220) return FXRemitConstants.CELO_USDC;
        if (chainId == 42161) return FXRemitConstants.ARB_USDC;
        revert UnsupportedChain(chainId);
    }
}
