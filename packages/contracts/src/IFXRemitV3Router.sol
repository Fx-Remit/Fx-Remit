// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IFXRemitV3Router {
    event GatewayUpdated(address indexed oldGateway, address indexed newGateway);

    event RemittanceInitiated(
        uint256 indexed orderId,
        address indexed sender,
        address fromToken,
        address toToken,
        uint256 amountIn,
        uint256 amountToRemit,
        uint256 chainId,
        string targetCurrency,
        string providerId,
        address indexed feeCollector,
        uint256 feeBps
    );

    function swapAndRemit(
        address fromToken,
        address toToken,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 rate,
        address refundAddress,
        string calldata messageHash,
        string calldata targetCurrency,
        string calldata providerId
    ) external payable;

    function setGateway(address _gateway) external;
}
