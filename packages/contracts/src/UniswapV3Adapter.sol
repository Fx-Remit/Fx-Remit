// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./ISwapAdapter.sol";

interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

contract UniswapV3Adapter is ISwapAdapter, Ownable {
    using SafeERC20 for IERC20;

    ISwapRouter02 public immutable swapRouter;
    uint24 public poolFee = 3000; // Default: 0.3%

    constructor(address _swapRouter) Ownable(msg.sender) {
        swapRouter = ISwapRouter02(_swapRouter);
    }

    /**
     * @dev Update the pool fee for subsequent swaps.
     */
    function setPoolFee(uint24 _newFee) external onlyOwner {
        poolFee = _newFee;
    }

    function swap(
        address fromToken,
        address toToken,
        uint256 amountIn,
        uint256 minAmountOut,
        address receiver
    ) external override returns (uint256 amountOut) {
        IERC20(fromToken).safeIncreaseAllowance(address(swapRouter), amountIn);

        ISwapRouter02.ExactInputSingleParams memory params = ISwapRouter02.ExactInputSingleParams({
            tokenIn: fromToken,
            tokenOut: toToken,
            fee: poolFee,
            recipient: receiver,
            amountIn: amountIn,
            amountOutMinimum: minAmountOut,
            sqrtPriceLimitX96: 0
        });

        amountOut = swapRouter.exactInputSingle(params);
    }
}
