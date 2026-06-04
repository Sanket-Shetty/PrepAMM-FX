import { ethers, network } from "hardhat";
import "dotenv/config";

async function main() {
  const [deployer] = await ethers.getSigners();
  const mintTo = process.env.PURE_MINT_TO || deployer.address;
  const mintAmount = ethers.parseUnits(process.env.PURE_MINT_AMOUNT || "100", 18);
  const maxSupply = ethers.parseUnits(process.env.PURE_MAX_SUPPLY || "1000000000", 18);

  const PUReToken = await ethers.getContractFactory("PUReToken");
  const pure = await PUReToken.deploy(deployer.address, maxSupply);
  await pure.waitForDeployment();

  const pureAddress = await pure.getAddress();
  await (await pure.mint(mintTo, mintAmount)).wait();

  console.log(`Network: ${network.name}`);
  console.log(`PURe: ${pureAddress}`);
  console.log(`Minted: ${ethers.formatUnits(mintAmount, 18)} PURe`);
  console.log(`Mint recipient: ${mintTo}`);
  console.log(`Owner: ${deployer.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
