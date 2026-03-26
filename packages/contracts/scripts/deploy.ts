import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // Mock Gateway address (Replace with real address for testnets/mainnet)
  const gatewayAddress = process.env.PAYCREST_GATEWAY_ADDRESS || "0x0000000000000000000000000000000000000000";

  const FXRemitV3Router = await ethers.getContractFactory("FXRemitV3Router");
  const router = await FXRemitV3Router.deploy(gatewayAddress);

  await router.waitForDeployment();

  console.log("FXRemitV3Router deployed to:", await router.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
