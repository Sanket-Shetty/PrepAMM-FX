import { http, createConfig } from "wagmi";
import { arbitrum, base, mainnet, optimism, polygon } from "wagmi/chains";

export const chains = [mainnet, arbitrum, base, polygon, optimism] as const;

export const wagmiConfig = createConfig({
  chains,
  transports: {
    [mainnet.id]: http(),
    [arbitrum.id]: http(),
    [base.id]: http(),
    [polygon.id]: http(),
    [optimism.id]: http()
  }
});
