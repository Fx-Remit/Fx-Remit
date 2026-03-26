// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IFXRemitV3Router {
    event RemittanceInitiated(
        uint256 indexed remittanceId,
        address indexed sender,
        address fromToken,
        address toToken,
        uint256 amountIn,
        uint256 amountOutUSD,
        string targetCurrency,
        string providerId
    );

    function swapAndRemit(
        address fromToken,
        address toToken,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes32 messageHash,
        address refundAddress,
        string calldata targetCurrency,
        string calldata providerId
    ) external;
}
