// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockGateway {
    function createOrder(
        address token,
        uint256 amount,
        uint256 rate,
        address partner,
        uint256 partnerPercent,
        address refundAddress,
        string calldata messageHash
    ) external returns (uint256 orderId) {
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        return 123;
    }
}
