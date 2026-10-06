// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import "../src/PayoutForwarderV2.sol";
import "./mocks/MockUSDC3009.sol";
import "./mocks/MockToken.sol";

/// @dev Plain 6-decimal ERC-20 like USDT on Base (no EIP-3009, no permit).
contract MockUSDT6 is MockToken {
    constructor() MockToken("Tether USD", "USDT") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

/// @dev 6-decimal token that skims 1% on every transfer.
contract MockFeeToken is MockUSDT6 {
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = value / 100;
            super._update(from, address(0xdead), fee);
            value -= fee;
        }
        super._update(from, to, value);
    }
}

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
    MockUSDT6 usdt; // approval token (USDT on Base)

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
        usdt = new MockUSDT6();
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

    /// @dev A signature valid from now for 10 minutes, as the app signs it. Reads the time through
    /// the cheatcode: under via-IR a local copy of block.timestamp can be re-read after vm.warp.
    function _window() internal view returns (uint256 validAfter, uint256 deadline) {
        uint256 nowTs = vm.getBlockTimestamp();
        return (nowTs, nowTs + 600);
    }

    function _signPayout(
        uint256 key,
        uint256 orderId,
        address token,
        address to,
        uint256 amount,
        uint256 validAfter,
        uint256 deadline
    ) internal view returns (bytes memory) {
        return _signPayoutFor(key, orderId, vm.addr(key), token, to, amount, validAfter, deadline);
    }

    function _signPayoutFor(
        uint256 key,
        uint256 orderId,
        address from,
        address token,
        address to,
        uint256 amount,
        uint256 validAfter,
        uint256 deadline
    ) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(key, forwarder.payoutDigest(orderId, from, token, to, amount, validAfter, deadline));
        return abi.encodePacked(r, s, v);
    }

    function _pay3009(uint256 orderId, address to, uint256 amount) internal {
        uint256 validBefore = block.timestamp + 600;
        (uint8 v, bytes32 r, bytes32 s) = _sign3009(orderId, to, amount, validBefore);
        vm.prank(relayer);
        forwarder.payoutWithAuthorization(orderId, payer, to, address(usdc), amount, validBefore, v, r, s);
    }

    function _payApproved(
        uint256 orderId,
        address from,
        address to,
        uint256 amount,
        bytes memory sig,
        uint256 validAfter,
        uint256 deadline
    ) internal {
        vm.prank(relayer);
        forwarder.payoutWithApproval(orderId, from, to, address(usdt), amount, validAfter, deadline, sig);
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
        (uint256 validAfter, uint256 deadline) = _window();
        bytes memory sig = _signPayout(payerKey, ORDER, address(usdt), sink, AMOUNT, validAfter, deadline);

        vm.expectEmit(true, true, true, true, address(forwarder));
        emit PayoutFunded(ORDER, payer, sink, address(usdt), AMOUNT);
        _payApproved(ORDER, payer, sink, AMOUNT, sig, validAfter, deadline);

        assertEq(usdt.balanceOf(sink), AMOUNT);
        assertEq(usdt.balanceOf(address(forwarder)), 0);
        assertTrue(forwarder.funded(ORDER));
    }

    function test_approval_relayerCannotPullWithoutThePayersSignature() public {
        vm.prank(payer);
        usdt.approve(address(forwarder), type(uint256).max);
        (uint256 validAfter, uint256 deadline) = _window();
        uint256 otherKey = uint256(keccak256("someone-else"));

        // Signed by someone else.
        bytes memory wrongSigner = _signPayout(otherKey, ORDER, address(usdt), sink, AMOUNT, validAfter, deadline);
        vm.expectRevert(PayoutForwarderV2.InvalidSignature.selector);
        _payApproved(ORDER, payer, sink, AMOUNT, wrongSigner, validAfter, deadline);

        // Payer's signature, but for a different destination, amount or order.
        bytes memory sig = _signPayout(payerKey, ORDER, address(usdt), sink, AMOUNT, validAfter, deadline);
        vm.expectRevert(PayoutForwarderV2.InvalidSignature.selector);
        _payApproved(ORDER, payer, makeAddr("attacker"), AMOUNT, sig, validAfter, deadline);
        vm.expectRevert(PayoutForwarderV2.InvalidSignature.selector);
        _payApproved(ORDER, payer, sink, AMOUNT + 1, sig, validAfter, deadline);
        vm.expectRevert(PayoutForwarderV2.InvalidSignature.selector);
        _payApproved(ORDER + 1, payer, sink, AMOUNT, sig, validAfter, deadline);

        assertEq(usdt.balanceOf(payer), 1_000e6);
        assertFalse(forwarder.funded(ORDER));
    }

    function test_approval_expiredDeadlineIsRefused() public {
        vm.prank(payer);
        usdt.approve(address(forwarder), type(uint256).max);
        (uint256 validAfter, uint256 deadline) = _window();
        bytes memory sig = _signPayout(payerKey, ORDER, address(usdt), sink, AMOUNT, validAfter, deadline);
        vm.warp(deadline + 1);
        vm.expectRevert(PayoutForwarderV2.Expired.selector);
        _payApproved(ORDER, payer, sink, AMOUNT, sig, validAfter, deadline);
    }

    function test_approval_withoutAllowanceRevertsAndLeavesOrderUnfunded() public {
        (uint256 validAfter, uint256 deadline) = _window();
        bytes memory sig = _signPayout(payerKey, ORDER, address(usdt), sink, AMOUNT, validAfter, deadline);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(forwarder), 0, AMOUNT)
        );
        _payApproved(ORDER, payer, sink, AMOUNT, sig, validAfter, deadline);
        assertFalse(forwarder.funded(ORDER));
    }

    function test_approval_acceptsAnERC1271SmartWallet() public {
        uint256 walletOwnerKey = uint256(keccak256("smart-wallet-owner"));
        MockSmartWallet wallet = new MockSmartWallet(vm.addr(walletOwnerKey));
        usdt.mint(address(wallet), 100e6);
        wallet.approve(address(usdt), address(forwarder), type(uint256).max);
        (uint256 validAfter, uint256 deadline) = _window();
        bytes memory sig = _signPayoutFor(walletOwnerKey, ORDER, address(wallet), address(usdt), sink, AMOUNT, validAfter, deadline);

        _payApproved(ORDER, address(wallet), sink, AMOUNT, sig, validAfter, deadline);
        assertEq(usdt.balanceOf(sink), AMOUNT);
    }

    function test_approval_acceptsTheKeyOfAnAccountWithCode() public {
        // An EIP-7702-delegated EOA has code, but its key still signs.
        vm.etch(payer, hex"ef0100aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
        vm.prank(payer);
        usdt.approve(address(forwarder), type(uint256).max);
        (uint256 validAfter, uint256 deadline) = _window();
        bytes memory sig = _signPayout(payerKey, ORDER, address(usdt), sink, AMOUNT, validAfter, deadline);
        _payApproved(ORDER, payer, sink, AMOUNT, sig, validAfter, deadline);
        assertEq(usdt.balanceOf(sink), AMOUNT);
    }

    // --- one funding per order ---------------------------------------------

    function test_anOrderIsFundedOnce_acrossModes() public {
        _pay3009(ORDER, sink, AMOUNT);

        vm.prank(payer);
        usdt.approve(address(forwarder), type(uint256).max);
        (uint256 validAfter, uint256 deadline) = _window();
        bytes memory sig = _signPayout(payerKey, ORDER, address(usdt), sink, AMOUNT, validAfter, deadline);
        vm.expectRevert(abi.encodeWithSelector(PayoutForwarderV2.AlreadyFunded.selector, ORDER));
        _payApproved(ORDER, payer, sink, AMOUNT, sig, validAfter, deadline);
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
        (uint256 validAfter, uint256 deadline) = _window();
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(payerKey, fresh.payoutDigest(ORDER, payer, address(usdt), sink, AMOUNT, validAfter, deadline));
        vm.prank(relayer);
        fresh.payoutWithApproval(
            ORDER, payer, sink, address(usdt), AMOUNT, validAfter, deadline, abi.encodePacked(r, s, v)
        );
        assertEq(usdt.balanceOf(sink), AMOUNT);
    }

    // --- guards -------------------------------------------------------------

    function test_eachTokenOnlyWorksInItsOwnMode() public {
        (uint256 validAfter, uint256 deadline) = _window();
        vm.startPrank(relayer);
        vm.expectRevert(abi.encodeWithSelector(PayoutForwarderV2.WrongMode.selector, address(usdt)));
        forwarder.payoutWithAuthorization(ORDER, payer, sink, address(usdt), AMOUNT, deadline, 27, bytes32(0), bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(PayoutForwarderV2.WrongMode.selector, address(usdc)));
        forwarder.payoutWithApproval(ORDER, payer, sink, address(usdc), AMOUNT, validAfter, deadline, "");
        address unlisted = makeAddr("unlisted");
        vm.expectRevert(abi.encodeWithSelector(PayoutForwarderV2.WrongMode.selector, unlisted));
        forwarder.payoutWithApproval(ORDER, payer, sink, unlisted, AMOUNT, validAfter, deadline, "");
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

    // --- review hardening --------------------------------------------------

    function test_approval_signatureIsBoundToThePayingWallet() public {
        // One key controls an EOA and a smart wallet; both approved V2. A signature for the EOA
        // must not let the relayer charge the smart wallet instead.
        MockSmartWallet wallet = new MockSmartWallet(payer);
        usdt.mint(address(wallet), 100e6);
        wallet.approve(address(usdt), address(forwarder), type(uint256).max);
        vm.prank(payer);
        usdt.approve(address(forwarder), type(uint256).max);
        (uint256 validAfter, uint256 deadline) = _window();
        bytes memory forEoa = _signPayout(payerKey, ORDER, address(usdt), sink, AMOUNT, validAfter, deadline);

        vm.expectRevert(PayoutForwarderV2.InvalidSignature.selector);
        _payApproved(ORDER, address(wallet), sink, AMOUNT, forEoa, validAfter, deadline);
        assertEq(usdt.balanceOf(address(wallet)), 100e6);
    }

    function test_approval_signatureDoesNotReplayAcrossChainsOrForwarders() public {
        vm.prank(payer);
        usdt.approve(address(forwarder), type(uint256).max);
        (uint256 validAfter, uint256 deadline) = _window();
        bytes memory sig = _signPayout(payerKey, ORDER, address(usdt), sink, AMOUNT, validAfter, deadline);

        PayoutForwarderV2 other = new PayoutForwarderV2(owner, relayer, address(legacy));
        vm.prank(owner);
        other.setToken(address(usdt), PayoutForwarderV2.Mode.APPROVAL);
        vm.prank(payer);
        usdt.approve(address(other), type(uint256).max);
        vm.prank(relayer);
        vm.expectRevert(PayoutForwarderV2.InvalidSignature.selector);
        other.payoutWithApproval(ORDER, payer, sink, address(usdt), AMOUNT, validAfter, deadline, sig);

        vm.chainId(42220);
        vm.expectRevert(PayoutForwarderV2.InvalidSignature.selector);
        _payApproved(ORDER, payer, sink, AMOUNT, sig, validAfter, deadline);
    }

    function test_approval_aUsedSignatureCannotBeSubmittedAgain() public {
        vm.prank(payer);
        usdt.approve(address(forwarder), type(uint256).max);
        (uint256 validAfter, uint256 deadline) = _window();
        bytes memory sig = _signPayout(payerKey, ORDER, address(usdt), sink, AMOUNT, validAfter, deadline);
        _payApproved(ORDER, payer, sink, AMOUNT, sig, validAfter, deadline);
        vm.expectRevert(abi.encodeWithSelector(PayoutForwarderV2.AlreadyFunded.selector, ORDER));
        _payApproved(ORDER, payer, sink, AMOUNT, sig, validAfter, deadline);
        assertEq(usdt.balanceOf(sink), AMOUNT);
    }

    function test_approval_signatureLivesAtMostAnHour() public {
        vm.prank(payer);
        usdt.approve(address(forwarder), type(uint256).max);
        uint256 validAfter = vm.getBlockTimestamp();
        uint256 deadline = validAfter + 1 hours + 1;
        bytes memory sig = _signPayout(payerKey, ORDER, address(usdt), sink, AMOUNT, validAfter, deadline);
        vm.expectRevert(PayoutForwarderV2.SignatureWindowTooLong.selector);
        _payApproved(ORDER, payer, sink, AMOUNT, sig, validAfter, deadline);

        // A long-dated signature stays refused in its last hour too: the deadline alone can't bound it.
        deadline = validAfter + 10 days;
        sig = _signPayout(payerKey, ORDER, address(usdt), sink, AMOUNT, validAfter, deadline);
        vm.warp(deadline - 30 minutes);
        vm.expectRevert(PayoutForwarderV2.SignatureWindowTooLong.selector);
        _payApproved(ORDER, payer, sink, AMOUNT, sig, validAfter, deadline);

        // Exactly an hour is allowed.
        validAfter = vm.getBlockTimestamp();
        deadline = validAfter + 1 hours;
        sig = _signPayout(payerKey, ORDER, address(usdt), sink, AMOUNT, validAfter, deadline);
        _payApproved(ORDER, payer, sink, AMOUNT, sig, validAfter, deadline);
        assertEq(usdt.balanceOf(sink), AMOUNT);
    }

    function test_approval_signatureIsRefusedBeforeValidAfter() public {
        vm.prank(payer);
        usdt.approve(address(forwarder), type(uint256).max);
        uint256 validAfter = vm.getBlockTimestamp() + 60;
        uint256 deadline = validAfter + 600;
        bytes memory sig = _signPayout(payerKey, ORDER, address(usdt), sink, AMOUNT, validAfter, deadline);
        vm.expectRevert(PayoutForwarderV2.NotYetValid.selector);
        _payApproved(ORDER, payer, sink, AMOUNT, sig, validAfter, deadline);

        // The relayer can't move the window: validAfter is signed.
        vm.warp(validAfter);
        vm.expectRevert(PayoutForwarderV2.InvalidSignature.selector);
        _payApproved(ORDER, payer, sink, AMOUNT, sig, validAfter - 1, deadline);

        _payApproved(ORDER, payer, sink, AMOUNT, sig, validAfter, deadline);
        assertEq(usdt.balanceOf(sink), AMOUNT);
    }

    function test_voidOrder_closesAnAbandonedOrderForGood_withoutReadingAsPaid() public {
        vm.prank(payer);
        usdt.approve(address(forwarder), type(uint256).max);
        (uint256 validAfter, uint256 deadline) = _window();
        bytes memory sig = _signPayout(payerKey, ORDER, address(usdt), sink, AMOUNT, validAfter, deadline);
        uint256 validBefore = block.timestamp + 600;
        (uint8 v, bytes32 r, bytes32 s) = _sign3009(ORDER, sink, AMOUNT, validBefore);

        vm.expectRevert(PayoutForwarderV2.NotRelayerOrOwner.selector);
        forwarder.voidOrder(ORDER);
        vm.prank(relayer);
        forwarder.voidOrder(ORDER);

        // The backend reads funded() as "tokens moved": a voided order must not say so.
        assertTrue(forwarder.voided(ORDER));
        assertFalse(forwarder.funded(ORDER));

        vm.expectRevert(abi.encodeWithSelector(PayoutForwarderV2.AlreadyVoided.selector, ORDER));
        _payApproved(ORDER, payer, sink, AMOUNT, sig, validAfter, deadline);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(PayoutForwarderV2.AlreadyVoided.selector, ORDER));
        forwarder.payoutWithAuthorization(ORDER, payer, sink, address(usdc), AMOUNT, validBefore, v, r, s);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(PayoutForwarderV2.AlreadyVoided.selector, ORDER));
        forwarder.voidOrder(ORDER);

        assertEq(usdt.balanceOf(payer), 1_000e6);
        assertEq(usdc.balanceOf(payer), 1_000e6);
    }

    function test_voidOrder_cannotVoidAPaidOrder() public {
        _pay3009(ORDER, sink, AMOUNT);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(PayoutForwarderV2.AlreadyFunded.selector, ORDER));
        forwarder.voidOrder(ORDER);
        assertTrue(forwarder.funded(ORDER));
        assertFalse(forwarder.voided(ORDER));
    }

    function test_onlySixDecimalTokensCanBeListed() public {
        MockToken eighteen = new MockToken("Celo Dollar", "cUSD");
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(PayoutForwarderV2.UnsupportedDecimals.selector, address(eighteen)));
        forwarder.setToken(address(eighteen), PayoutForwarderV2.Mode.APPROVAL);
        vm.prank(owner);
        forwarder.setToken(address(eighteen), PayoutForwarderV2.Mode.NONE); // delisting is always allowed
    }

    function test_feeOnTransferTokenIsRefused() public {
        MockFeeToken fee = new MockFeeToken();
        fee.mint(payer, 100e6);
        vm.prank(owner);
        forwarder.setToken(address(fee), PayoutForwarderV2.Mode.APPROVAL);
        vm.prank(payer);
        fee.approve(address(forwarder), type(uint256).max);
        (uint256 validAfter, uint256 deadline) = _window();
        bytes memory sig = _signPayout(payerKey, ORDER, address(fee), sink, AMOUNT, validAfter, deadline);
        vm.prank(relayer);
        vm.expectRevert();
        forwarder.payoutWithApproval(ORDER, payer, sink, address(fee), AMOUNT, validAfter, deadline, sig);
        assertEq(fee.balanceOf(sink), 0);
    }

    function test_refusesALegacyAddressWithNoCode() public {
        vm.expectRevert(PayoutForwarderV2.LegacyNotDeployed.selector);
        new PayoutForwarderV2(owner, relayer, makeAddr("no-code"));
    }

    function test_rescueCannotTouchPayerAllowances() public {
        vm.prank(payer);
        usdt.approve(address(forwarder), type(uint256).max);
        vm.prank(owner);
        vm.expectRevert();
        forwarder.rescueTokens(address(usdt), owner, 1e6);
        assertEq(usdt.balanceOf(payer), 1_000e6);
    }
}
