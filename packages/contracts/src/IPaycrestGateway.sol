// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IPaycrestGateway {
    /**
     * @dev Create an off-ramp order on Paycrest.
     * @param token The address of the stablecoin (USDC/USDT/CUSD/CNGN).
     * @param amount The amount in stablecoins (with decimals).
     * @param rate The exchange rate fetched from the Paycrest API.
     * @param partner The address for fee sharing (can be address(0)).
     * @param partnerPercent The percentage for the partner (basis points).
     * @param refundAddress The address where funds are returned if the order fails.
     * @param messageHash The encrypted recipient data (RSA encrypted JSON string).
     */
    function createOrder(
        address token,
        uint256 amount,
        uint256 rate,
        address partner,
        uint256 partnerPercent,
        address refundAddress,
        string calldata messageHash
    ) external returns (uint256 orderId);
}
