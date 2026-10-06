// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PayoutForwarderV2.sol";
import "../src/FXRemitConstants.sol";

/**
 * Sets PayoutForwarderV2's token allowlist for the current chain. Run with the OWNER key.
 *   Base:  USDC → EIP3009, USDT → APPROVAL (Base USDT has neither EIP-3009 nor permit)
 *   Celo:  USDC → EIP3009, USDT → EIP3009
 *
 * Env:
 *   OWNER_PRIVATE_KEY   the forwarder owner
 *   FORWARDER_V2        the deployed PayoutForwarderV2 address
 *
 * forge script script/ConfigurePayoutForwarderV2.s.sol --rpc-url $BASE_RPC_URL --broadcast
 */
contract ConfigurePayoutForwarderV2 is Script {
    address constant BASE_USDT = 0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2;
    address constant CELO_USDT = 0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e;

    function run() external {
        PayoutForwarderV2 forwarder = PayoutForwarderV2(vm.envAddress("FORWARDER_V2"));
        address[] memory tokens = new address[](2);
        PayoutForwarderV2.Mode[] memory modes = new PayoutForwarderV2.Mode[](2);
        if (block.chainid == 8453) {
            (tokens[0], modes[0]) = (FXRemitConstants.BASE_USDC, PayoutForwarderV2.Mode.EIP3009);
            (tokens[1], modes[1]) = (BASE_USDT, PayoutForwarderV2.Mode.APPROVAL);
        } else if (block.chainid == 42220) {
            (tokens[0], modes[0]) = (FXRemitConstants.CELO_USDC, PayoutForwarderV2.Mode.EIP3009);
            (tokens[1], modes[1]) = (CELO_USDT, PayoutForwarderV2.Mode.EIP3009);
        } else {
            revert("unsupported chain");
        }

        vm.startBroadcast(vm.envUint("OWNER_PRIVATE_KEY"));
        for (uint256 i; i < tokens.length; i++) {
            if (forwarder.tokenMode(tokens[i]) != modes[i]) forwarder.setToken(tokens[i], modes[i]);
            console.log("token", tokens[i], "mode", uint256(modes[i]));
        }
        vm.stopBroadcast();
    }
}
