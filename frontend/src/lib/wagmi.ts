import { http, createConfig } from "wagmi";
import { arbitrum, base, baseSepolia, mainnet, optimism, polygon } from "wagmi/chains";

export const chains = [base, baseSepolia, mainnet, arbitrum, polygon, optimism] as const;

export const wagmiConfig = createConfig({
  chains,
  transports: {
    [mainnet.id]: http(),
    [arbitrum.id]: http(),
    [base.id]: http(),
    [baseSepolia.id]: http(),
    [polygon.id]: http(),
    [optimism.id]: http()
  }
});
