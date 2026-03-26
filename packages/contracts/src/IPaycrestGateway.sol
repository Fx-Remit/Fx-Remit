// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPaycrestGateway {
    function createOrder(
        address token,
        uint256 amount,
        bytes32 messageHash
    ) external returns (uint256 orderId);
}
