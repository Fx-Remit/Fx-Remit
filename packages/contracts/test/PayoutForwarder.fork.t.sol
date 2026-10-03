// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/PayoutForwarder.sol";
import "../src/FXRemitConstants.sol";

interface IUSDCDomain {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}

/// @notice End-to-end payout against the real USDC on Base and Celo.
/// Opt-in: set BASE_RPC_URL / CELO_RPC_URL, otherwise the test is skipped.
contract PayoutForwarderForkTest is Test {
    bytes32 constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    function test_Fork_Base() public {
        _run("BASE_RPC_URL", FXRemitConstants.BASE_USDC);
    }

    function test_Fork_Celo() public {
        _run("CELO_RPC_URL", FXRemitConstants.CELO_USDC);
    }

    function _run(string memory rpcEnv, address usdcAddr) internal {
        string memory rpc = vm.envOr(rpcEnv, string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);

        address relayer = makeAddr("relayer");
        address sink = makeAddr("paycrestReceive");
        // Random key: short keys like 0xB0B are used by real wallets, some with EIP-7702 code.
        uint256 payerKey = uint256(keccak256("fx-remit.payout-forwarder.fork-payer"));
        address payer = vm.addr(payerKey);
        PayoutForwarder forwarder = new PayoutForwarder(makeAddr("safe"), relayer);
        assertEq(address(forwarder.usdc()), usdcAddr);

        IERC20 usdc = IERC20(usdcAddr);
        deal(usdcAddr, payer, 100e6);

        uint256 orderId = 1_790_000_000_042;
        uint256 amount = 50e6;
        uint256 validBefore = block.timestamp + 600;
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                IUSDCDomain(usdcAddr).DOMAIN_SEPARATOR(),
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
        forwarder.payout(orderId, payer, sink, amount, validBefore, v, r, s);

        assertEq(usdc.balanceOf(sink), amount);
        assertEq(usdc.balanceOf(payer), 50e6);
        assertEq(usdc.balanceOf(address(forwarder)), 0);
    }
}
