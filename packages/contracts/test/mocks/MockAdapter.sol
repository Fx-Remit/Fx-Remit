// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../src/ISwapAdapter.sol";
import "./MockToken.sol";

contract MockAdapter is ISwapAdapter {
    function swap(
        address fromToken,
        address toToken,
        uint256 amountIn,
        uint256 minAmountOut,
        address receiver
    ) external override returns (uint256 amountOut) {
        IERC20(fromToken).transferFrom(msg.sender, address(this), amountIn);
        
        // Mock a 95% return for simplicity
        amountOut = (amountIn * 95) / 100;
        MockToken(toToken).mint(receiver, amountOut);
    }
}
