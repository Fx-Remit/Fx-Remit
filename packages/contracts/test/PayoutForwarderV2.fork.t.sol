// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/PayoutForwarderV2.sol";
import "../src/FXRemitConstants.sol";

interface ITokenDomain {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}

/// @notice PayoutForwarderV2 against the real tokens and the live V1 forwarder on Base and Celo.
/// Opt-in: set BASE_RPC_URL / CELO_RPC_URL, otherwise the tests are skipped.
contract PayoutForwarderV2ForkTest is Test {
    bytes32 constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    address constant V1 = FXRemitConstants.PAYOUT_FORWARDER_V1;
    address constant BASE_USDT = FXRemitConstants.BASE_USDT;
    address constant CELO_USDT = FXRemitConstants.CELO_USDT;
    /// @dev A real Base bank payout V1 funded on 2026-10-04.
    uint256 constant V1_FUNDED_ORDER = 1791123170007264;

    address relayer = makeAddr("relayer");
    address sink = makeAddr("destination");
    uint256 payerKey = uint256(keccak256("fx-remit.forwarder-v2.fork-payer"));
    address payer;
    PayoutForwarderV2 forwarder;

    function _fork(string memory rpcEnv) internal returns (bool) {
        string memory rpc = vm.envOr(rpcEnv, string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return false;
        }
        vm.createSelectFork(rpc);
        payer = vm.addr(payerKey);
        forwarder = new PayoutForwarderV2(makeAddr("safe"), relayer, V1);
        return true;
    }

    function _pay3009(address token, uint256 orderId) internal {
        vm.prank(forwarder.owner());
        forwarder.setToken(token, PayoutForwarderV2.Mode.EIP3009);
        deal(token, payer, 100e6);
        uint256 amount = 50e6;
        uint256 validBefore = block.timestamp + 600;
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                ITokenDomain(token).DOMAIN_SEPARATOR(),
                keccak256(
                    abi.encode(
                        RECEIVE_TYPEHASH,
                        payer,
                        address(forwarder),
                        amount,
                        uint256(0),
                        validBefore,
                        forwarder.authorizationNonce(orderId, sink)
                    )
                )
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerKey, digest);
        vm.prank(relayer);
        forwarder.payoutWithAuthorization(orderId, payer, sink, token, amount, validBefore, v, r, s);
        _assertMoved(token, amount);
    }

    function _assertMoved(address token, uint256 amount) internal view {
        assertEq(IERC20(token).balanceOf(sink), amount);
        assertEq(IERC20(token).balanceOf(payer), 100e6 - amount);
        assertEq(IERC20(token).balanceOf(address(forwarder)), 0);
    }

    function test_Fork_Base_USDC_EIP3009() public {
        if (!_fork("BASE_RPC_URL")) return;
        _pay3009(FXRemitConstants.BASE_USDC, 1_790_000_000_101);
    }

    function test_Fork_Base_USDT_Approval() public {
        if (!_fork("BASE_RPC_URL")) return;
        vm.prank(forwarder.owner());
        forwarder.setToken(BASE_USDT, PayoutForwarderV2.Mode.APPROVAL);
        deal(BASE_USDT, payer, 100e6);
        vm.prank(payer);
        IERC20(BASE_USDT).approve(address(forwarder), type(uint256).max);

        uint256 orderId = 1_790_000_000_102;
        uint256 amount = 50e6;
        uint256 validAfter = block.timestamp;
        uint256 deadline = validAfter + 600;
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(payerKey, forwarder.payoutDigest(orderId, payer, BASE_USDT, sink, amount, validAfter, deadline));
        vm.prank(relayer);
        forwarder.payoutWithApproval(
            orderId, payer, sink, BASE_USDT, amount, validAfter, deadline, abi.encodePacked(r, s, v)
        );
        _assertMoved(BASE_USDT, amount);
    }

    function test_Fork_Base_RefusesAnOrderV1AlreadyFunded() public {
        if (!_fork("BASE_RPC_URL")) return;
        assertTrue(ILegacyForwarder(V1).funded(V1_FUNDED_ORDER));
        vm.prank(forwarder.owner());
        forwarder.setToken(FXRemitConstants.BASE_USDC, PayoutForwarderV2.Mode.EIP3009);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(PayoutForwarderV2.AlreadyFunded.selector, V1_FUNDED_ORDER));
        forwarder.payoutWithAuthorization(
            V1_FUNDED_ORDER, payer, sink, FXRemitConstants.BASE_USDC, 1e6, block.timestamp + 600, 27, bytes32(0), bytes32(0)
        );
    }

    function test_Fork_Celo_USDC_EIP3009() public {
        if (!_fork("CELO_RPC_URL")) return;
        _pay3009(FXRemitConstants.CELO_USDC, 1_790_000_000_201);
    }

    function test_Fork_Celo_USDT_EIP3009() public {
        if (!_fork("CELO_RPC_URL")) return;
        _pay3009(CELO_USDT, 1_790_000_000_202);
    }
}
