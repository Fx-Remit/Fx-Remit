pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./ISwapAdapter.sol";

interface IMentoBroker {
    function swapIn(
        address exchangeId,
        address fromToken,
        address toToken,
        uint256 amountIn,
        uint256 minAmountOut
    ) external returns (uint256 amountOut);
}

contract MentoAdapter is ISwapAdapter {
    using SafeERC20 for IERC20;

    IMentoBroker public immutable broker;
    address public immutable exchangeId; // Exchange ID for the pair

    constructor(address _broker, address _exchangeId) {
        broker = IMentoBroker(_broker);
        exchangeId = _exchangeId;
    }

    function swap(
        address fromToken,
        address toToken,
        uint256 amountIn,
        uint256 minAmountOut,
        address receiver
    ) external override returns (uint256 amountOut) {
        IERC20(fromToken).safeIncreaseAllowance(address(broker), amountIn);

        amountOut = broker.swapIn(
            exchangeId,
            fromToken,
            toToken,
            amountIn,
            minAmountOut
        );

        // Transfer resulting tokens to receiver
        IERC20(toToken).safeTransfer(receiver, amountOut);
    }
}
