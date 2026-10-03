// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PayoutForwarder.sol";

/**
 * Deploys PayoutForwarder through the CREATE2 deployer with a fixed salt.
 * Same salt + same constructor args => same address on Base, Celo and Arbitrum.
 *
 * Env:
 *   PRIVATE_KEY        any funded wallet (only pays gas; gets no role)
 *   FORWARDER_OWNER    same address on every target chain (a Safe, or a wallet that later
 *                      hands ownership to a Safe; the forwarder address does not change)
 *   FORWARDER_RELAYER  first relayer wallet (same address on every chain)
 *
 * forge script script/DeployPayoutForwarder.s.sol --rpc-url $BASE_RPC_URL --broadcast --verify
 */
contract DeployPayoutForwarder is Script {
    bytes32 constant SALT = keccak256("fx-remit.payout-forwarder.v1");

    function run() external returns (PayoutForwarder forwarder) {
        address owner = vm.envAddress("FORWARDER_OWNER");
        address relayer = vm.envAddress("FORWARDER_RELAYER");
        require(owner != address(0) && relayer != address(0), "FORWARDER_OWNER and FORWARDER_RELAYER are required");
        require(owner != relayer, "owner and relayer must be different wallets");
        // A wallet owner is allowed; ownership can move to a Safe later without changing the address.
        console.log("Owner", owner, owner.code.length > 0 ? "(contract)" : "(wallet)");

        bytes32 initCodeHash =
            keccak256(abi.encodePacked(type(PayoutForwarder).creationCode, abi.encode(owner, relayer)));
        address expected = vm.computeCreate2Address(SALT, initCodeHash);
        console.log("Chain", block.chainid, "expected PayoutForwarder at", expected);
        if (expected.code.length > 0) {
            console.log("Already deployed here; nothing to do.");
            return PayoutForwarder(expected);
        }

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        forwarder = new PayoutForwarder{salt: SALT}(owner, relayer);
        vm.stopBroadcast();

        require(address(forwarder) == expected, "unexpected address");
        console.log("Deployed. USDC:", address(forwarder.usdc()));
    }
}
