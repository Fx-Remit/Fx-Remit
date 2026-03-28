// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/UniswapV3Adapter.sol";
import "./mocks/MockToken.sol";
import "./mocks/MockUniswapV3Router.sol";

contract UniswapV3AdapterTest is Test {
    UniswapV3Adapter public adapter;
    MockUniswapV3Router public router;
    MockToken public fromToken;
    MockToken public toToken;
    address public alice = address(0x1);
    address public receiver = address(0x2);

    function setUp() public {
        router = new MockUniswapV3Router();
        fromToken = new MockToken("From", "FROM");
        toToken = new MockToken("To", "TO");
        adapter = new UniswapV3Adapter(address(router));

        fromToken.mint(alice, 1000 ether);
        toToken.mint(address(router), 1000 ether);
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

        assertEq(amountOut, (amountIn * 99) / 100);
        assertEq(toToken.balanceOf(receiver), amountOut);
        assertEq(fromToken.balanceOf(address(router)), amountIn);
    }

    function testSetPoolFee() public {
        assertEq(adapter.poolFee(), 3000);
        adapter.setPoolFee(500);
        assertEq(adapter.poolFee(), 500);
    }

    function testSetPoolFeeOnlyOwner() public {
        vm.startPrank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                bytes4(keccak256("OwnableUnauthorizedAccount(address)")),
                alice
            )
        );
        adapter.setPoolFee(500);
        vm.stopPrank();
    }

    function testSwapInsufficientOutput() public {
        uint256 amountIn = 100 ether;
        uint256 minAmountOut = 100 ether; // Uniswap mock returns 99%

        vm.startPrank(alice);
        fromToken.transfer(address(adapter), amountIn);
        vm.stopPrank();

        vm.startPrank(address(0xdead));
        vm.expectRevert("MockUniswap: Insufficient output");
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
