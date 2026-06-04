import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const accounts = process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {
      chainId: 31337
    },
    mainnet: {
      url: process.env.ETHEREUM_RPC_URL || "",
      accounts
    },
    arbitrum: {
      url: process.env.ARBITRUM_RPC_URL || "",
      accounts
    },
    base: {
      url: process.env.BASE_RPC_URL || "",
      accounts
    },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "",
      accounts
    },
    polygon: {
      url: process.env.POLYGON_RPC_URL || "",
      accounts
    },
    optimism: {
      url: process.env.OPTIMISM_RPC_URL || "",
      accounts
    }
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY || "",
      arbitrumOne: process.env.ARBISCAN_API_KEY || "",
      base: process.env.BASESCAN_API_KEY || "",
      polygon: process.env.POLYGONSCAN_API_KEY || "",
      optimisticEthereum: process.env.OPTIMISTIC_ETHERSCAN_API_KEY || ""
    }
  }
};

export default config;
