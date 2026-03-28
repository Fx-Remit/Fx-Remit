// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockMentoBroker {
    function swapIn(
        address /* exchangeId */,
        address fromToken,
        address toToken,
        uint256 amountIn,
        uint256 minAmountOut
    ) external returns (uint256 amountOut) {
        // Mock swap logic: return 98% of amountIn
        amountOut = (amountIn * 98) / 100;
        require(amountOut >= minAmountOut, "MockMento: Insufficient output");
        
        IERC20(fromToken).transferFrom(msg.sender, address(this), amountIn);
        // Minting/Transferring toToken is handled by the test or assumed to be in this contract
        IERC20(toToken).transfer(msg.sender, amountOut);
        
        return amountOut;
    }
}
