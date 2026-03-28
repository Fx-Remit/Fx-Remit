// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/FXRemitV3Router.sol";
import "../src/IFXRemitV3Router.sol";
import "./mocks/MockToken.sol";
import "./mocks/MockGateway.sol";
import "./mocks/MockAdapter.sol";
import "./mocks/MockPermit2.sol";
import "./mocks/MockWETH.sol";

contract FXRemitV3RouterTest is Test {
    FXRemitV3Router public router;
    MockToken public fromToken;
    MockToken public toToken;
    MockGateway public gateway;
    MockAdapter public adapter;
    MockPermit2 public permit2;
    MockWETH public weth;

    address public alice = address(0x1);
    address public bob = address(0x2);

    function setUp() public {
        fromToken = new MockToken("From", "FROM");
        toToken = new MockToken("To", "TO");
        gateway = new MockGateway();
        adapter = new MockAdapter();
        permit2 = new MockPermit2();
        weth = new MockWETH();

        router = new FXRemitV3Router(address(gateway), address(permit2), address(weth));
        router.setAdapter(address(fromToken), address(adapter));
        router.setFeeConfig(address(0xdead), 50); // 0.5% fee

        fromToken.mint(alice, 1000 ether);
        toToken.mint(address(adapter), 1000 ether); // liquidity for swap
    }

    function testSetFeeConfig() public {
        router.setFeeConfig(bob, 100);
        assertEq(router.feeCollector(), bob);
        assertEq(router.feeBps(), 100);
    }

    function testSetFeeConfigFail() public {
        vm.expectRevert("Fee too high: max 2%");
        router.setFeeConfig(bob, 201);
    }

    function testSwapAndRemit() public {
        vm.startPrank(alice);
        fromToken.approve(address(router), 100 ether);

        string memory messageHash = "encrypted-data-string";
        router.swapAndRemit(
            address(fromToken),
            address(toToken),
            100 ether,
            90 ether,
            1600,
            alice,
            messageHash,
            "NGN",
            "provider1"
        );
        vm.stopPrank();

        assertEq(toToken.balanceOf(address(gateway)), 95 ether);
        assertEq(fromToken.balanceOf(address(adapter)), 100 ether);
    }

    function testSwapAndRemitSameToken() public {
        vm.startPrank(alice);
        fromToken.approve(address(router), 100 ether);

        router.swapAndRemit(
            address(fromToken),
            address(fromToken),
            100 ether,
            100 ether,
            1600,
            alice,
            "hash",
            "NGN",
            "provider1"
        );
        vm.stopPrank();

        assertEq(fromToken.balanceOf(address(gateway)), 100 ether);
    }

    function testSwapAndRemitWithPermit() public {
        vm.startPrank(alice);
        // In reality, user must approve Permit2. Here MockPermit2 acts as the router for mock transfer.
        fromToken.approve(address(permit2), 100 ether);

        bytes memory signature = "dummy-sig";
        router.swapAndRemitWithPermit(
            address(fromToken),
            address(toToken),
            100 ether,
            90 ether,
            1600,
            alice,
            "hash",
            "NGN",
            "provider1",
            0, // nonce
            block.timestamp + 1000,
            signature
        );
        vm.stopPrank();

        assertEq(toToken.balanceOf(address(gateway)), 95 ether);
    }

    function testSetGateway() public {
        address newGateway = address(0x123);
        router.setGateway(newGateway);
        assertEq(router.gateway(), newGateway);
    }

    function testSetGatewayOnlyOwner() public {
        vm.startPrank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                bytes4(keccak256("OwnableUnauthorizedAccount(address)")),
                alice
            )
        );
        router.setGateway(address(0x123));
        vm.stopPrank();
    }

    function testNoAdapterForToken() public {
        MockToken otherToken = new MockToken("Other", "OT");
        otherToken.mint(alice, 100 ether);

        vm.startPrank(alice);
        otherToken.approve(address(router), 100 ether);
        vm.expectRevert(abi.encodeWithSelector(FXRemitV3Router.NoAdapterForToken.selector, address(otherToken)));
        router.swapAndRemit(
            address(otherToken),
            address(toToken),
            100 ether,
            90 ether,
            1600,
            alice,
            "hash",
            "NGN",
            "provider1"
        );
        vm.stopPrank();
    }

    function testInsufficientOutput() public {
        vm.startPrank(alice);
        fromToken.approve(address(router), 100 ether);
        
        // MockAdapter returns 95%, so 100 * 0.95 = 95. Asking for 96 should revert.
        vm.expectRevert(abi.encodeWithSelector(FXRemitV3Router.InsufficientOutput.selector, 95 ether, 96 ether));
        router.swapAndRemit(
            address(fromToken),
            address(toToken),
            100 ether,
            96 ether,
            1600,
            alice,
            "hash",
            "NGN",
            "provider1"
        );
        vm.stopPrank();
    }

    function testRescueTokens() public {
        fromToken.mint(address(router), 50 ether);
        assertEq(fromToken.balanceOf(address(router)), 50 ether);

        router.rescueTokens(address(fromToken), bob, 50 ether);
        assertEq(fromToken.balanceOf(address(router)), 0);
        assertEq(fromToken.balanceOf(bob), 50 ether);
    }

    function testNativeRemit() public {
        // Setting adapter for WETH as owner
        router.setAdapter(address(weth), address(adapter));

        vm.startPrank(alice);
        vm.deal(alice, 100 ether);
        
        router.swapAndRemit{value: 10 ether}(
            address(0), // native token
            address(toToken),
            10 ether,
            9 ether,
            1600,
            alice,
            "hash",
            "NGN",
            "provider1"
        );
        vm.stopPrank();

        // Check if gateway received toToken
        // MockAdapter returns 95% of 10 ether = 9.5 ether
        assertEq(toToken.balanceOf(address(gateway)), 9.5 ether);
    }
}
