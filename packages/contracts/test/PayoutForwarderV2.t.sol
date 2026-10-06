// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import "../src/PayoutForwarderV2.sol";
import "./mocks/MockUSDC3009.sol";
import "./mocks/MockToken.sol";

contract MockLegacyForwarder {
    mapping(uint256 => bool) public funded;

    function setFunded(uint256 orderId) external {
        funded[orderId] = true;
    }
}

/// @dev Smart-contract wallet that accepts signatures from one owner key (ERC-1271).
contract MockSmartWallet {
    address public immutable signer;

    constructor(address signer_) {
        signer = signer_;
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        return ECDSA.recover(hash, signature) == signer ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }

    function approve(address token, address spender, uint256 amount) external {
        IERC20(token).approve(spender, amount);
    }
}

contract PayoutForwarderV2Test is Test {
    PayoutForwarderV2 forwarder;
    MockLegacyForwarder legacy;
    MockUSDC3009 usdc; // EIP-3009 token (USDC; USDT on Celo behaves the same)
    MockToken usdt; // approval token (USDT on Base)

    address owner = makeAddr("safe");
    address relayer = makeAddr("relayer");
    address sink = makeAddr("destination");
    uint256 payerKey = uint256(keccak256("fx-remit.forwarder-v2.payer"));
    address payer;

    uint256 constant ORDER = 1_790_000_000_002;
    uint256 constant AMOUNT = 50e6;

    event PayoutFunded(uint256 indexed orderId, address indexed payer, address indexed sink, address token, uint256 amount);

    function setUp() public {
        vm.chainId(8453);
        payer = vm.addr(payerKey);
        usdc = new MockUSDC3009();
        usdt = new MockToken("Tether USD", "USDT");
        usdc.mint(payer, 1_000e6);
        usdt.mint(payer, 1_000e6);
        legacy = new MockLegacyForwarder();
        forwarder = new PayoutForwarderV2(owner, relayer, address(legacy));
        vm.startPrank(owner);
        forwarder.setToken(address(usdc), PayoutForwarderV2.Mode.EIP3009);
        forwarder.setToken(address(usdt), PayoutForwarderV2.Mode.APPROVAL);
        vm.stopPrank();
    }

    // --- helpers -----------------------------------------------------------

    function _sign3009(uint256 orderId, address to, uint256 amount, uint256 validBefore)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                payer,
                address(forwarder),
                amount,
                uint256(0),
                validBefore,
                forwarder.authorizationNonce(orderId, to)
            )
        );
        (v, r, s) = vm.sign(payerKey, keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash)));
    }

    function _signPayout(uint256 key, uint256 orderId, address token, address to, uint256 amount, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, forwarder.payoutDigest(orderId, token, to, amount, deadline));
        return abi.encodePacked(r, s, v);
    }

    function _pay3009(uint256 orderId, address to, uint256 amount) internal {
        uint256 validBefore = block.timestamp + 600;
        (uint8 v, bytes32 r, bytes32 s) = _sign3009(orderId, to, amount, validBefore);
        vm.prank(relayer);
        forwarder.payoutWithAuthorization(orderId, payer, to, address(usdc), amount, validBefore, v, r, s);
    }

    function _payApproved(uint256 orderId, address from, address to, uint256 amount, bytes memory sig, uint256 deadline)
        internal
    {
        vm.prank(relayer);
        forwarder.payoutWithApproval(orderId, from, to, address(usdt), amount, deadline, sig);
    }

    // --- EIP-3009 mode -----------------------------------------------------

    function test_3009_movesExactAmountPayerToSink_andEmits() public {
        vm.expectEmit(true, true, true, true, address(forwarder));
        emit PayoutFunded(ORDER, payer, sink, address(usdc), AMOUNT);
        _pay3009(ORDER, sink, AMOUNT);

        assertEq(usdc.balanceOf(sink), AMOUNT);
        assertEq(usdc.balanceOf(payer), 1_000e6 - AMOUNT);
        assertEq(usdc.balanceOf(address(forwarder)), 0);
        assertTrue(forwarder.funded(ORDER));
    }

    function test_3009_redirectedSinkInvalidatesTheSignature() public {
        uint256 validBefore = block.timestamp + 600;
        (uint8 v, bytes32 r, bytes32 s) = _sign3009(ORDER, sink, AMOUNT, validBefore);
        vm.prank(relayer);
        vm.expectRevert(bytes("FiatTokenV2: invalid signature"));
        forwarder.payoutWithAuthorization(ORDER, payer, makeAddr("attacker"), address(usdc), AMOUNT, validBefore, v, r, s);
    }

    // --- APPROVAL mode -----------------------------------------------------

    function test_approval_movesExactAmountWithAllowanceAndSignature() public {
        vm.prank(payer);
        usdt.approve(address(forwarder), type(uint256).max);
        uint256 deadline = block.timestamp + 600;
        bytes memory sig = _signPayout(payerKey, ORDER, address(usdt), sink, AMOUNT, deadline);

        vm.expectEmit(true, true, true, true, address(forwarder));
        emit PayoutFunded(ORDER, payer, sink, address(usdt), AMOUNT);
        _payApproved(ORDER, payer, sink, AMOUNT, sig, deadline);

        assertEq(usdt.balanceOf(sink), AMOUNT);
        assertEq(usdt.balanceOf(address(forwarder)), 0);
        assertTrue(forwarder.funded(ORDER));
    }

    function test_approval_relayerCannotPullWithoutThePayersSignature() public {
        vm.prank(payer);
        usdt.approve(address(forwarder), type(uint256).max);
        uint256 deadline = block.timestamp + 600;
        uint256 otherKey = uint256(keccak256("someone-else"));

        // Signed by someone else.
        bytes memory wrongSigner = _signPayout(otherKey, ORDER, address(usdt), sink, AMOUNT, deadline);
        vm.expectRevert(PayoutForwarderV2.InvalidSignature.selector);
        _payApproved(ORDER, payer, sink, AMOUNT, wrongSigner, deadline);

        // Payer's signature, but for a different destination, amount or order.
        bytes memory sig = _signPayout(payerKey, ORDER, address(usdt), sink, AMOUNT, deadline);
        vm.expectRevert(PayoutForwarderV2.InvalidSignature.selector);
        _payApproved(ORDER, payer, makeAddr("attacker"), AMOUNT, sig, deadline);
        vm.expectRevert(PayoutForwarderV2.InvalidSignature.selector);
        _payApproved(ORDER, payer, sink, AMOUNT + 1, sig, deadline);
        vm.expectRevert(PayoutForwarderV2.InvalidSignature.selector);
        _payApproved(ORDER + 1, payer, sink, AMOUNT, sig, deadline);

        assertEq(usdt.balanceOf(payer), 1_000e6);
        assertFalse(forwarder.funded(ORDER));
    }

    function test_approval_expiredDeadlineIsRefused() public {
        vm.prank(payer);
        usdt.approve(address(forwarder), type(uint256).max);
        uint256 deadline = block.timestamp + 600;
        bytes memory sig = _signPayout(payerKey, ORDER, address(usdt), sink, AMOUNT, deadline);
        vm.warp(deadline + 1);
        vm.expectRevert(PayoutForwarderV2.Expired.selector);
        _payApproved(ORDER, payer, sink, AMOUNT, sig, deadline);
    }

    function test_approval_withoutAllowanceRevertsAndLeavesOrderUnfunded() public {
        uint256 deadline = block.timestamp + 600;
        bytes memory sig = _signPayout(payerKey, ORDER, address(usdt), sink, AMOUNT, deadline);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(forwarder), 0, AMOUNT)
        );
        _payApproved(ORDER, payer, sink, AMOUNT, sig, deadline);
        assertFalse(forwarder.funded(ORDER));
    }

    function test_approval_acceptsAnERC1271SmartWallet() public {
        uint256 walletOwnerKey = uint256(keccak256("smart-wallet-owner"));
        MockSmartWallet wallet = new MockSmartWallet(vm.addr(walletOwnerKey));
        usdt.mint(address(wallet), 100e6);
        wallet.approve(address(usdt), address(forwarder), type(uint256).max);
        uint256 deadline = block.timestamp + 600;
        bytes memory sig = _signPayout(walletOwnerKey, ORDER, address(usdt), sink, AMOUNT, deadline);

        _payApproved(ORDER, address(wallet), sink, AMOUNT, sig, deadline);
        assertEq(usdt.balanceOf(sink), AMOUNT);
    }

    function test_approval_acceptsTheKeyOfAnAccountWithCode() public {
        // An EIP-7702-delegated EOA has code, but its key still signs.
        vm.etch(payer, hex"ef0100aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
        vm.prank(payer);
        usdt.approve(address(forwarder), type(uint256).max);
        uint256 deadline = block.timestamp + 600;
        bytes memory sig = _signPayout(payerKey, ORDER, address(usdt), sink, AMOUNT, deadline);
        _payApproved(ORDER, payer, sink, AMOUNT, sig, deadline);
        assertEq(usdt.balanceOf(sink), AMOUNT);
    }

    // --- one funding per order ---------------------------------------------

    function test_anOrderIsFundedOnce_acrossModes() public {
        _pay3009(ORDER, sink, AMOUNT);

        vm.prank(payer);
        usdt.approve(address(forwarder), type(uint256).max);
        uint256 deadline = block.timestamp + 600;
        bytes memory sig = _signPayout(payerKey, ORDER, address(usdt), sink, AMOUNT, deadline);
        vm.expectRevert(abi.encodeWithSelector(PayoutForwarderV2.AlreadyFunded.selector, ORDER));
        _payApproved(ORDER, payer, sink, AMOUNT, sig, deadline);
    }

    function test_refusesAnOrderTheV1ForwarderAlreadyFunded() public {
        legacy.setFunded(ORDER);
        uint256 validBefore = block.timestamp + 600;
        (uint8 v, bytes32 r, bytes32 s) = _sign3009(ORDER, sink, AMOUNT, validBefore);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(PayoutForwarderV2.AlreadyFunded.selector, ORDER));
        forwarder.payoutWithAuthorization(ORDER, payer, sink, address(usdc), AMOUNT, validBefore, v, r, s);
    }

    function test_worksWhereThereIsNoV1Forwarder() public {
        PayoutForwarderV2 fresh = new PayoutForwarderV2(owner, relayer, address(0));
        vm.prank(owner);
        fresh.setToken(address(usdt), PayoutForwarderV2.Mode.APPROVAL);
        vm.prank(payer);
        usdt.approve(address(fresh), type(uint256).max);
        uint256 deadline = block.timestamp + 600;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerKey, fresh.payoutDigest(ORDER, address(usdt), sink, AMOUNT, deadline));
        vm.prank(relayer);
        fresh.payoutWithApproval(ORDER, payer, sink, address(usdt), AMOUNT, deadline, abi.encodePacked(r, s, v));
        assertEq(usdt.balanceOf(sink), AMOUNT);
    }

    // --- guards -------------------------------------------------------------

    function test_eachTokenOnlyWorksInItsOwnMode() public {
        uint256 deadline = block.timestamp + 600;
        vm.startPrank(relayer);
        vm.expectRevert(abi.encodeWithSelector(PayoutForwarderV2.WrongMode.selector, address(usdt)));
        forwarder.payoutWithAuthorization(ORDER, payer, sink, address(usdt), AMOUNT, deadline, 27, bytes32(0), bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(PayoutForwarderV2.WrongMode.selector, address(usdc)));
        forwarder.payoutWithApproval(ORDER, payer, sink, address(usdc), AMOUNT, deadline, "");
        address unlisted = makeAddr("unlisted");
        vm.expectRevert(abi.encodeWithSelector(PayoutForwarderV2.WrongMode.selector, unlisted));
        forwarder.payoutWithApproval(ORDER, payer, sink, unlisted, AMOUNT, deadline, "");
        vm.stopPrank();
    }

    function test_rejectsBadSinksAndAmounts() public {
        uint256 validBefore = block.timestamp + 600;
        address[4] memory badSinks = [address(0), payer, address(forwarder), address(usdc)];
        for (uint256 i; i < badSinks.length; i++) {
            (uint8 v, bytes32 r, bytes32 s) = _sign3009(ORDER, badSinks[i], AMOUNT, validBefore);
            vm.prank(relayer);
            vm.expectRevert(PayoutForwarderV2.InvalidSink.selector);
            forwarder.payoutWithAuthorization(ORDER, payer, badSinks[i], address(usdc), AMOUNT, validBefore, v, r, s);
        }
        uint256[2] memory badAmounts = [uint256(0), forwarder.MAX_AMOUNT() + 1];
        for (uint256 i; i < badAmounts.length; i++) {
            (uint8 v, bytes32 r, bytes32 s) = _sign3009(ORDER, sink, badAmounts[i], validBefore);
            vm.prank(relayer);
            vm.expectRevert(PayoutForwarderV2.InvalidAmount.selector);
            forwarder.payoutWithAuthorization(ORDER, payer, sink, address(usdc), badAmounts[i], validBefore, v, r, s);
        }
    }

    function test_onlyTheRelayer_andNotWhilePaused() public {
        uint256 validBefore = block.timestamp + 600;
        (uint8 v, bytes32 r, bytes32 s) = _sign3009(ORDER, sink, AMOUNT, validBefore);
        vm.expectRevert(PayoutForwarderV2.NotRelayer.selector);
        forwarder.payoutWithAuthorization(ORDER, payer, sink, address(usdc), AMOUNT, validBefore, v, r, s);

        vm.prank(owner);
        forwarder.pause();
        vm.prank(relayer);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        forwarder.payoutWithAuthorization(ORDER, payer, sink, address(usdc), AMOUNT, validBefore, v, r, s);
    }

    function test_ownerControls() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        forwarder.setToken(address(usdc), PayoutForwarderV2.Mode.NONE);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        forwarder.setRelayer(address(this), true);

        vm.prank(owner);
        vm.expectRevert(PayoutForwarderV2.RenounceDisabled.selector);
        forwarder.renounceOwnership();

        usdt.mint(address(forwarder), 5e6);
        vm.prank(owner);
        forwarder.rescueTokens(address(usdt), owner, 5e6);
        assertEq(usdt.balanceOf(owner), 5e6);
    }

    function test_delistingATokenStopsItsPayouts() public {
        vm.prank(owner);
        forwarder.setToken(address(usdc), PayoutForwarderV2.Mode.NONE);
        uint256 validBefore = block.timestamp + 600;
        (uint8 v, bytes32 r, bytes32 s) = _sign3009(ORDER, sink, AMOUNT, validBefore);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(PayoutForwarderV2.WrongMode.selector, address(usdc)));
        forwarder.payoutWithAuthorization(ORDER, payer, sink, address(usdc), AMOUNT, validBefore, v, r, s);
    }
}
