// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import "../src/PayoutForwarder.sol";
import "../src/FXRemitConstants.sol";
import "./mocks/MockUSDC3009.sol";
import "./mocks/MockToken.sol";

contract PayoutForwarderTest is Test {
    PayoutForwarder forwarder;
    MockUSDC3009 usdc;

    address owner = makeAddr("safe");
    address relayer = makeAddr("relayer");
    address sink = makeAddr("paycrestReceive");
    uint256 payerKey = uint256(keccak256("fx-remit.payout-forwarder.payer"));
    address payer;

    uint256 constant ORDER = 1_790_000_000_001;
    uint256 constant AMOUNT = 50e6;

    event PayoutFunded(uint256 indexed orderId, address indexed payer, address indexed sink, address token, uint256 amount);

    function setUp() public {
        vm.chainId(8453);
        MockUSDC3009 impl = new MockUSDC3009();
        vm.etch(FXRemitConstants.BASE_USDC, address(impl).code);
        usdc = MockUSDC3009(FXRemitConstants.BASE_USDC);

        payer = vm.addr(payerKey);
        usdc.mint(payer, 1_000e6);
        forwarder = new PayoutForwarder(owner, relayer);
    }

    function _sign(uint256 key, address from, address to, uint256 value, uint256 validBefore, bytes32 nonce)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        bytes32 structHash = keccak256(
            abi.encode(usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(), from, to, value, uint256(0), validBefore, nonce)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash));
        (v, r, s) = vm.sign(key, digest);
    }

    function _signFor(uint256 orderId, address to, uint256 amount, uint256 validBefore)
        internal
        view
        returns (uint8, bytes32, bytes32)
    {
        return _sign(payerKey, payer, address(forwarder), amount, validBefore, forwarder.authorizationNonce(orderId, to));
    }

    function _payout(uint256 orderId, address to, uint256 amount) internal {
        uint256 validBefore = block.timestamp + 600;
        (uint8 v, bytes32 r, bytes32 s) = _signFor(orderId, to, amount, validBefore);
        vm.prank(relayer);
        forwarder.payout(orderId, payer, to, amount, validBefore, v, r, s);
    }

    // --- happy path ---

    function test_PayoutMovesExactAmountAndKeepsNothing() public {
        vm.expectEmit(true, true, true, true, address(forwarder));
        emit PayoutFunded(ORDER, payer, sink, address(usdc), AMOUNT);
        _payout(ORDER, sink, AMOUNT);

        assertEq(usdc.balanceOf(payer), 1_000e6 - AMOUNT);
        assertEq(usdc.balanceOf(sink), AMOUNT);
        assertEq(usdc.balanceOf(address(forwarder)), 0);
        assertTrue(forwarder.funded(ORDER));
        assertEq(usdc.allowance(payer, address(forwarder)), 0);
    }

    function test_PicksUsdcPerChain() public {
        assertEq(address(forwarder.usdc()), FXRemitConstants.BASE_USDC);
        vm.chainId(42220);
        assertEq(address(new PayoutForwarder(owner, relayer).usdc()), FXRemitConstants.CELO_USDC);
        vm.chainId(42161);
        assertEq(address(new PayoutForwarder(owner, relayer).usdc()), FXRemitConstants.ARB_USDC);
    }

    function test_RevertWhen_UnsupportedChain() public {
        vm.chainId(1);
        vm.expectRevert(abi.encodeWithSelector(PayoutForwarder.UnsupportedChain.selector, 1));
        new PayoutForwarder(owner, relayer);
    }

    // --- who can call ---

    function test_RevertWhen_CallerIsNotRelayer() public {
        uint256 validBefore = block.timestamp + 600;
        (uint8 v, bytes32 r, bytes32 s) = _signFor(ORDER, sink, AMOUNT, validBefore);
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(PayoutForwarder.NotRelayer.selector);
        forwarder.payout(ORDER, payer, sink, AMOUNT, validBefore, v, r, s);
    }

    function test_RevertWhen_RelayerRemoved() public {
        vm.prank(owner);
        forwarder.setRelayer(relayer, false);
        uint256 validBefore = block.timestamp + 600;
        (uint8 v, bytes32 r, bytes32 s) = _signFor(ORDER, sink, AMOUNT, validBefore);
        vm.prank(relayer);
        vm.expectRevert(PayoutForwarder.NotRelayer.selector);
        forwarder.payout(ORDER, payer, sink, AMOUNT, validBefore, v, r, s);
    }

    function test_RevertWhen_Paused() public {
        vm.prank(owner);
        forwarder.pause();
        uint256 validBefore = block.timestamp + 600;
        (uint8 v, bytes32 r, bytes32 s) = _signFor(ORDER, sink, AMOUNT, validBefore);
        vm.prank(relayer);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        forwarder.payout(ORDER, payer, sink, AMOUNT, validBefore, v, r, s);

        vm.prank(owner);
        forwarder.unpause();
        vm.prank(relayer);
        forwarder.payout(ORDER, payer, sink, AMOUNT, validBefore, v, r, s);
        assertEq(usdc.balanceOf(sink), AMOUNT);
    }

    // --- the signature binds order, destination and amount ---

    function test_RevertWhen_RelayerChangesSink() public {
        uint256 validBefore = block.timestamp + 600;
        (uint8 v, bytes32 r, bytes32 s) = _signFor(ORDER, sink, AMOUNT, validBefore);
        vm.prank(relayer);
        vm.expectRevert("FiatTokenV2: invalid signature");
        forwarder.payout(ORDER, payer, makeAddr("attacker"), AMOUNT, validBefore, v, r, s);
        assertEq(usdc.balanceOf(payer), 1_000e6);
    }

    function test_RevertWhen_RelayerChangesAmount() public {
        uint256 validBefore = block.timestamp + 600;
        (uint8 v, bytes32 r, bytes32 s) = _signFor(ORDER, sink, AMOUNT, validBefore);
        vm.prank(relayer);
        vm.expectRevert("FiatTokenV2: invalid signature");
        forwarder.payout(ORDER, payer, sink, AMOUNT + 1, validBefore, v, r, s);
    }

    function test_RevertWhen_RelayerChangesOrder() public {
        uint256 validBefore = block.timestamp + 600;
        (uint8 v, bytes32 r, bytes32 s) = _signFor(ORDER, sink, AMOUNT, validBefore);
        vm.prank(relayer);
        vm.expectRevert("FiatTokenV2: invalid signature");
        forwarder.payout(ORDER + 1, payer, sink, AMOUNT, validBefore, v, r, s);
    }

    function test_RevertWhen_Expired() public {
        uint256 validBefore = block.timestamp + 600;
        (uint8 v, bytes32 r, bytes32 s) = _signFor(ORDER, sink, AMOUNT, validBefore);
        vm.warp(validBefore);
        vm.prank(relayer);
        vm.expectRevert("FiatTokenV2: authorization is expired");
        forwarder.payout(ORDER, payer, sink, AMOUNT, validBefore, v, r, s);
    }

    function test_RevertWhen_SignatureRedeemedDirectlyByStranger() public {
        uint256 validBefore = block.timestamp + 600;
        (uint8 v, bytes32 r, bytes32 s) = _signFor(ORDER, sink, AMOUNT, validBefore);
        bytes32 nonce = forwarder.authorizationNonce(ORDER, sink);
        vm.prank(makeAddr("stranger"));
        vm.expectRevert("FiatTokenV2: caller must be the payee");
        usdc.receiveWithAuthorization(payer, address(forwarder), AMOUNT, 0, validBefore, nonce, v, r, s);
    }

    // --- each order once ---

    function test_RevertWhen_OrderFundedTwice() public {
        _payout(ORDER, sink, AMOUNT);
        uint256 validBefore = block.timestamp + 600;
        (uint8 v, bytes32 r, bytes32 s) = _signFor(ORDER, makeAddr("otherSink"), AMOUNT, validBefore);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(PayoutForwarder.AlreadyFunded.selector, ORDER));
        forwarder.payout(ORDER, payer, makeAddr("otherSink"), AMOUNT, validBefore, v, r, s);
    }

    function test_FailedPayoutDoesNotBurnTheOrder() public {
        uint256 validBefore = block.timestamp + 600;
        (uint8 v, bytes32 r, bytes32 s) = _signFor(ORDER, sink, AMOUNT, validBefore);
        vm.prank(relayer);
        vm.expectRevert("FiatTokenV2: invalid signature");
        forwarder.payout(ORDER, payer, sink, AMOUNT + 1, validBefore, v, r, s);
        assertFalse(forwarder.funded(ORDER));

        _payout(ORDER, sink, AMOUNT);
        assertTrue(forwarder.funded(ORDER));
    }

    // --- input rules ---

    function test_RevertWhen_AmountZeroOrOverCap() public {
        uint256 validBefore = block.timestamp + 600;
        vm.startPrank(relayer);
        vm.expectRevert(PayoutForwarder.InvalidAmount.selector);
        forwarder.payout(ORDER, payer, sink, 0, validBefore, 27, bytes32(0), bytes32(0));
        vm.expectRevert(PayoutForwarder.InvalidAmount.selector);
        forwarder.payout(ORDER, payer, sink, 10_000e6 + 1, validBefore, 27, bytes32(0), bytes32(0));
        vm.stopPrank();
    }

    function test_PayoutAtExactCap() public {
        usdc.mint(payer, 10_000e6);
        _payout(ORDER, sink, 10_000e6);
        assertEq(usdc.balanceOf(sink), 10_000e6);
    }

    function test_RevertWhen_ForbiddenSink() public {
        address[4] memory bad = [address(0), payer, address(forwarder), address(usdc)];
        uint256 validBefore = block.timestamp + 600;
        for (uint256 i; i < bad.length; ++i) {
            vm.prank(relayer);
            vm.expectRevert(PayoutForwarder.InvalidSink.selector);
            forwarder.payout(ORDER, payer, bad[i], AMOUNT, validBefore, 27, bytes32(0), bytes32(0));
        }
    }

    function test_StrayBalanceIsUntouched() public {
        usdc.mint(address(forwarder), 7e6);
        _payout(ORDER, sink, AMOUNT);
        assertEq(usdc.balanceOf(address(forwarder)), 7e6);
        assertEq(usdc.balanceOf(sink), AMOUNT);
    }

    // --- owner ---

    function test_OnlyOwnerAdmin() public {
        address stranger = makeAddr("stranger");
        vm.startPrank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        forwarder.setRelayer(stranger, true);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        forwarder.pause();
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        forwarder.rescueTokens(address(usdc), stranger, 1);
        vm.stopPrank();
    }

    function test_SetRelayerAddsNewRelayer() public {
        address next = makeAddr("nextRelayer");
        vm.prank(owner);
        forwarder.setRelayer(next, true);
        assertTrue(forwarder.isRelayer(next));
    }

    function test_RescueReturnsMistakenTokens() public {
        MockToken other = new MockToken("Other", "OTH");
        other.mint(address(forwarder), 5e18);
        vm.prank(owner);
        forwarder.rescueTokens(address(other), owner, 5e18);
        assertEq(other.balanceOf(owner), 5e18);
    }

    function test_RenounceDisabled() public {
        vm.prank(owner);
        vm.expectRevert(PayoutForwarder.RenounceDisabled.selector);
        forwarder.renounceOwnership();
        assertEq(forwarder.owner(), owner);
    }

    function test_OwnershipIsTwoStep() public {
        address next = makeAddr("nextSafe");
        vm.prank(owner);
        forwarder.transferOwnership(next);
        assertEq(forwarder.owner(), owner);
        vm.prank(next);
        forwarder.acceptOwnership();
        assertEq(forwarder.owner(), next);
    }

    function test_NoInitialRelayer() public {
        PayoutForwarder f = new PayoutForwarder(owner, address(0));
        assertFalse(f.isRelayer(address(0)));
    }
}
