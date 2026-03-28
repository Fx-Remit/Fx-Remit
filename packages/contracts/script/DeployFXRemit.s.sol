// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/FXRemitV3Router.sol";
import "../src/UniswapV3Adapter.sol";
import "../src/MentoAdapter.sol";
import "../src/FXRemitConstants.sol";

contract DeployFXRemit is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        address gateway;
        address dexRouter;
        address gasToken;
        address stableToken;
        
        if (block.chainid == 8453) { // Base
            gateway = FXRemitConstants.BASE_GATEWAY;
            dexRouter = FXRemitConstants.BASE_UNISWAP_V3_ROUTER;
            gasToken = FXRemitConstants.BASE_WETH;
            stableToken = FXRemitConstants.BASE_USDC;
            
            deployStandard(gateway, dexRouter, gasToken, stableToken, "Base");
        } else if (block.chainid == 42161) { // Arbitrum
            gateway = FXRemitConstants.ARB_GATEWAY;
            dexRouter = FXRemitConstants.ARB_UNISWAP_V3_ROUTER;
            gasToken = FXRemitConstants.ARB_WETH;
            stableToken = FXRemitConstants.ARB_USDC;
            
            deployStandard(gateway, dexRouter, gasToken, stableToken, "Arbitrum");
        } else if (block.chainid == 42220) { // Celo
            gateway = FXRemitConstants.CELO_GATEWAY;
            dexRouter = FXRemitConstants.CELO_MENTO_BROKER;
            gasToken = FXRemitConstants.CELO_CELO_TOKEN;

            FXRemitV3Router router = new FXRemitV3Router(gateway, FXRemitConstants.PERMIT2, gasToken);
            MentoAdapter adapter = new MentoAdapter(dexRouter, FXRemitConstants.CELO_MENTO_EXCHANGE_ID);
            
            router.setAdapter(gasToken, address(adapter));
            router.setAdapter(FXRemitConstants.CELO_CUSD, address(adapter));

            console.log("Deployed Celo Router:", address(router));
        }

        vm.stopBroadcast();
    }

    function deployStandard(address gateway, address dexRouter, address gasToken, address stableToken, string memory network) internal {
        FXRemitV3Router router = new FXRemitV3Router(gateway, FXRemitConstants.PERMIT2, gasToken);
        UniswapV3Adapter adapter = new UniswapV3Adapter(dexRouter);
        
        router.setAdapter(gasToken, address(adapter));
        router.setAdapter(stableToken, address(adapter));
        
        console.log("Deployed", network, "Router at:", address(router));
        console.log("Deployed", network, "Adapter at:", address(adapter));
    }
}
