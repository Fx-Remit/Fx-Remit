// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/FXRemitV3Router.sol";
import "../src/IFXRemitV3Router.sol";
import "./mocks/MockToken.sol";
import "./mocks/MockGateway.sol";
import "./mocks/MockAdapter.sol";

contract FXRemitV3RouterTest is Test {
    FXRemitV3Router public router;
    MockToken public fromToken;
    MockToken public toToken;
    MockGateway public gateway;
    MockAdapter public adapter;

    address public alice = address(0x1);

    function setUp() public {
        fromToken = new MockToken("From", "FROM");
        toToken = new MockToken("To", "TO");
        gateway = new MockGateway();
        adapter = new MockAdapter();

        router = new FXRemitV3Router(address(gateway));
        router.setAdapter(address(fromToken), address(adapter));

        fromToken.mint(alice, 1000 ether);
    }

    function testSwapAndRemit() public {
        vm.startPrank(alice);
        fromToken.approve(address(router), 100 ether);

        bytes32 messageHash = keccak256("test");
        router.swapAndRemit(
            address(fromToken),
            address(toToken),
            100 ether,
            90 ether,
            messageHash,
            alice,
            "NGN",
            "provider1"
        );
        vm.stopPrank();

        assertEq(toToken.balanceOf(address(gateway)), 95 ether); // MockAdapter returns 95%
    }
}
