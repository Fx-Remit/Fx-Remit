// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PayoutForwarderV2.sol";

/**
 * Deploys PayoutForwarderV2 through the CREATE2 deployer with a fixed salt.
 * Same salt + same constructor args => same address on Base and Celo.
 * Tokens are configured afterwards by the owner (ConfigurePayoutForwarderV2.s.sol).
 *
 * Env:
 *   PRIVATE_KEY        any funded wallet (only pays gas; gets no role)
 *   FORWARDER_OWNER    same address on every target chain
 *   FORWARDER_RELAYER  relayer wallet (same address on every chain)
 *
 * forge script script/DeployPayoutForwarderV2.s.sol --rpc-url $BASE_RPC_URL --broadcast --verify
 */
contract DeployPayoutForwarderV2 is Script {
    bytes32 constant SALT = keccak256("fx-remit.payout-forwarder.v2");
    /// @dev V1, same address on Base and Celo; V2 refuses orders it already funded.
    address constant V1 = 0x05FAA8d97e5eB76778F4e1ae8327DE63692c8F83;

    function run() external returns (PayoutForwarderV2 forwarder) {
        address owner = vm.envAddress("FORWARDER_OWNER");
        address relayer = vm.envAddress("FORWARDER_RELAYER");
        require(owner != address(0) && relayer != address(0), "FORWARDER_OWNER and FORWARDER_RELAYER are required");
        require(owner != relayer, "owner and relayer must be different wallets");
        console.log("Owner", owner, owner.code.length > 0 ? "(contract)" : "(wallet)");

        bytes32 initCodeHash =
            keccak256(abi.encodePacked(type(PayoutForwarderV2).creationCode, abi.encode(owner, relayer, V1)));
        address expected = vm.computeCreate2Address(SALT, initCodeHash);
        console.log("Chain", block.chainid, "expected PayoutForwarderV2 at", expected);
        if (expected.code.length > 0) {
            console.log("Already deployed here; nothing to do.");
            return PayoutForwarderV2(expected);
        }

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        forwarder = new PayoutForwarderV2{salt: SALT}(owner, relayer, V1);
        vm.stopBroadcast();

        require(address(forwarder) == expected, "unexpected address");
        console.log("Deployed. Next: run ConfigurePayoutForwarderV2 with the owner key on this chain.");
    }
}
