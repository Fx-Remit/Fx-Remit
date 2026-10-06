// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PayoutForwarder.sol";
import "../src/FXRemitConstants.sol";

/**
 * Cutover to PayoutForwarderV2: V2 refuses orders V1 funded, but V1 can't see V2. Once V1's
 * in-flight orders have settled (no forwarder claims stuck in broadcasting-* with a V1 tx),
 * remove the relayer from V1 so it can never fund an order V2 also funds. Run with the OWNER key
 * on each chain. V1 stays deployed, so its past payouts stay visible on-chain.
 *
 * Env:
 *   OWNER_PRIVATE_KEY   the V1 owner
 *   FORWARDER_RELAYER   the relayer to remove
 *
 * forge script script/RetirePayoutForwarderV1.s.sol --rpc-url $BASE_RPC_URL --broadcast
 */
contract RetirePayoutForwarderV1 is Script {
    function run() external {
        PayoutForwarder v1 = PayoutForwarder(FXRemitConstants.PAYOUT_FORWARDER_V1);
        address relayer = vm.envAddress("FORWARDER_RELAYER");
        vm.startBroadcast(vm.envUint("OWNER_PRIVATE_KEY"));
        if (v1.isRelayer(relayer)) v1.setRelayer(relayer, false);
        vm.stopBroadcast();
        require(!v1.isRelayer(relayer), "relayer still allowed on V1");
        console.log("V1 relayer removed on chain", block.chainid);
    }
}
