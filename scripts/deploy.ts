import { ethers, network } from "hardhat";
import "dotenv/config";

const chainTokenSeeds: Record<string, string[]> = {
  mainnet: ["EURe", "USDC", "USDT", "DAI", "WETH", "WBTC"],
  arbitrum: ["USDC", "USDT", "DAI", "WETH", "WBTC"],
  base: ["USDC", "DAI", "WETH", "cbBTC"],
  polygon: ["EURe", "USDC", "USDT", "DAI", "WETH", "WBTC"],
  optimism: ["USDC", "USDT", "DAI", "WETH", "WBTC"]
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = process.env.ADMIN_ADDRESS || deployer.address;
  const treasury = process.env.TREASURY_ADDRESS || deployer.address;
  const mmSigner = process.env.MM_SIGNER_ADDRESS || deployer.address;

  const Registry = await ethers.getContractFactory("RFXRegistry");
  const registry = await Registry.deploy(admin, treasury, mmSigner);
  await registry.waitForDeployment();

  const Settlement = await ethers.getContractFactory("RFXSettlement");
  const settlement = await Settlement.deploy(admin, await registry.getAddress());
  await settlement.waitForDeployment();

  console.log(`Network: ${network.name}`);
  console.log(`Registry: ${await registry.getAddress()}`);
  console.log(`Settlement: ${await settlement.getAddress()}`);
  console.log(`Seed token symbols for ${network.name}: ${(chainTokenSeeds[network.name] || []).join(", ")}`);
  console.log("Whitelist concrete token addresses with registry.setTokenWhitelisted after verification.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
