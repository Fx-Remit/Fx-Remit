// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/MentoAdapter.sol";
import "./mocks/MockToken.sol";
import "./mocks/MockMentoBroker.sol";

contract MentoAdapterTest is Test {
    MentoAdapter public adapter;
    MockMentoBroker public broker;
    MockToken public fromToken;
    MockToken public toToken;
    address public exchangeId = address(0x123);
    address public alice = address(0x1);
    address public receiver = address(0x2);

    function setUp() public {
        broker = new MockMentoBroker();
        fromToken = new MockToken("From", "FROM");
        toToken = new MockToken("To", "TO");
        adapter = new MentoAdapter(address(broker), exchangeId);

        fromToken.mint(alice, 1000 ether);
        toToken.mint(address(broker), 1000 ether);
    }

    function testSwap() public {
        uint256 amountIn = 100 ether;
        uint256 minAmountOut = 90 ether;

        vm.startPrank(alice);
        fromToken.transfer(address(adapter), amountIn);
        vm.stopPrank();

        vm.startPrank(address(0xdead)); // Router would call this
        uint256 amountOut = adapter.swap(
            address(fromToken),
            address(toToken),
            amountIn,
            minAmountOut,
            receiver
        );
        vm.stopPrank();

        assertEq(amountOut, (amountIn * 98) / 100);
        assertEq(toToken.balanceOf(receiver), amountOut);
        assertEq(fromToken.balanceOf(address(broker)), amountIn);
    }

    function testSwapInsufficientOutput() public {
        uint256 amountIn = 100 ether;
        uint256 minAmountOut = 99 ether; // Mento mock returns 98%

        vm.startPrank(alice);
        fromToken.transfer(address(adapter), amountIn);
        vm.stopPrank();

        vm.startPrank(address(0xdead));
        vm.expectRevert("MockMento: Insufficient output");
        adapter.swap(
            address(fromToken),
            address(toToken),
            amountIn,
            minAmountOut,
            receiver
        );
        vm.stopPrank();
    }
}
