// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/FXRemitV3Router.sol";
import "../src/UniswapV3Adapter.sol";
import "../src/MentoAdapter.sol";
import "./mocks/MockToken.sol";
import "./mocks/MockGateway.sol";
import "./mocks/MockUniswapV3Router.sol";
import "./mocks/MockMentoBroker.sol";
import "./mocks/MockPermit2.sol";

contract FXRemitIntegrationTest is Test {
    FXRemitV3Router public router;
    MockToken public fromToken;
    MockToken public toToken;
    MockGateway public gateway;
    MockPermit2 public permit2;

    // Real Adapters
    UniswapV3Adapter public uniAdapter;
    MentoAdapter public mentoAdapter;

    // DEX Mocks
    MockUniswapV3Router public uniRouter;
    MockMentoBroker public mentoBroker;

    address public alice = address(0x1);
    address public exchangeId = address(0x123);

    function setUp() public {
        fromToken = new MockToken("From", "FROM");
        toToken = new MockToken("To", "TO");
        gateway = new MockGateway();
        permit2 = new MockPermit2();

        router = new FXRemitV3Router(address(gateway), address(permit2), address(0x4200000000000000000000000000000000000006));
        router.setFeeConfig(address(0xbeef), 50); // 0.5% fee

        // Setup Uniswap Integration
        uniRouter = new MockUniswapV3Router();
        uniAdapter = new UniswapV3Adapter(address(uniRouter));
        router.setAdapter(address(fromToken), address(uniAdapter));

        // Setup Mento Integration (for a different fromToken)
        mentoBroker = new MockMentoBroker();
        mentoAdapter = new MentoAdapter(address(mentoBroker), exchangeId);
        // We'll swap from a different token for Mento test
        
        fromToken.mint(alice, 1000 ether);
        toToken.mint(address(uniRouter), 1000 ether); // UNI mock has liquidity
        toToken.mint(address(mentoBroker), 1000 ether); // Mento mock has liquidity
    }

    function testFullFlowUniswap() public {
        uint256 amountIn = 100 ether;
        uint256 minAmountOut = 95 ether; // Mock UNI returns 99%

        vm.startPrank(alice);
        fromToken.approve(address(router), amountIn);

        router.swapAndRemit(
            address(fromToken),
            address(toToken),
            amountIn,
            minAmountOut,
            1600,
            alice,
            "hash",
            "NGN",
            "provider1"
        );
        vm.stopPrank();

        // 100 * 0.99 = 99 tokens remitted
        assertEq(toToken.balanceOf(address(gateway)), 99 ether);
        assertEq(fromToken.balanceOf(address(uniRouter)), 100 ether);
    }

    function testFullFlowMento() public {
        MockToken mentoFromToken = new MockToken("MentoFrom", "MFROM");
        mentoFromToken.mint(alice, 100 ether);
        router.setAdapter(address(mentoFromToken), address(mentoAdapter));

        uint256 amountIn = 100 ether;
        uint256 minAmountOut = 95 ether; // Mock Mento returns 98%

        vm.startPrank(alice);
        mentoFromToken.approve(address(router), amountIn);

        router.swapAndRemit(
            address(mentoFromToken),
            address(toToken),
            amountIn,
            minAmountOut,
            1600,
            alice,
            "hash",
            "NGN",
            "provider1"
        );
        vm.stopPrank();

        // 100 * 0.98 = 98 tokens remitted
        assertEq(toToken.balanceOf(address(gateway)), 98 ether);
        assertEq(mentoFromToken.balanceOf(address(mentoBroker)), 100 ether);
    }
}
