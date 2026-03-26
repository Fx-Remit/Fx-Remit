// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./IFXRemitV3Router.sol";
import "./ISwapAdapter.sol";
import "./IPaycrestGateway.sol";

/**
 * @title FXRemitV3Router
 * @dev Stateless router for cross-chain stablecoin-to-fiat transfers via Paycrest.
 */
contract FXRemitV3Router is IFXRemitV3Router, Ownable {
    using SafeERC20 for IERC20;

    IPaycrestGateway public immutable gateway;
    mapping(address => address) public adapters; // fromToken => adapterAddress

    constructor(address _gateway) Ownable(msg.sender) {
        gateway = IPaycrestGateway(_gateway);
    }

    /**
     * @dev Set or update an adapter for a specific input token.
     * @param fromToken The token to swap from.
     * @param adapter The adapter contract address.
     */
    function setAdapter(address fromToken, address adapter) external onlyOwner {
        adapters[fromToken] = adapter;
    }

    /**
     * @dev Main entry point for swapping and remitting.
     */
    function swapAndRemit(
        address fromToken,
        address toToken,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes32 messageHash,
        address refundAddress,
        string calldata targetCurrency,
        string calldata providerId
    ) external override {
        uint256 amountToRemit;

        if (fromToken == toToken) {
            // No swap needed
            IERC20(fromToken).safeTransferFrom(msg.sender, address(this), amountIn);
            amountToRemit = amountIn;
        } else {
            address adapter = adapters[fromToken];
            require(adapter != address(0), "No adapter for token");

            IERC20(fromToken).safeTransferFrom(msg.sender, adapter, amountIn);
            
            amountToRemit = ISwapAdapter(adapter).swap(
                fromToken,
                toToken,
                amountIn,
                minAmountOut,
                address(this)
            );
        }

        // Give gateway allowance
        IERC20(toToken).safeIncreaseAllowance(address(gateway), amountToRemit);

        // Call Paycrest Gateway
        gateway.createOrder(toToken, amountToRemit, messageHash);

        emit RemittanceInitiated(
            0, // Order ID would ideally come from the gateway return if stored, but spec says stateless
            msg.sender,
            fromToken,
            toToken,
            amountIn,
            amountToRemit, // Simplified amountOutUSD placeholder
            targetCurrency,
            providerId
        );
    }
}
