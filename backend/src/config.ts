import "dotenv/config";

const allowDevDefaults = process.env.NODE_ENV !== "production";
const devPrivateKey = "0x59c6995e998f97a5a0044966f09453835e6dae388cd81b6e0e9394f5af0b8f44";
const devSettlement = "0x1111111111111111111111111111111111111111";

export const config = {
  port: Number(process.env.PORT || 4000),
  allowDevDefaults,
  mmPrivateKey: process.env.MM_PRIVATE_KEY || (allowDevDefaults ? devPrivateKey : ""),
  makerAddress: process.env.MAKER_ADDRESS || "",
  coingeckoApiKey: process.env.COINGECKO_API_KEY || "",
  coinmarketcapApiKey: process.env.COINMARKETCAP_API_KEY || "",
  redisUrl: process.env.REDIS_URL || "",
  settlements: {
    1: process.env.SETTLEMENT_ADDRESS_1 || (allowDevDefaults ? devSettlement : ""),
    42161: process.env.SETTLEMENT_ADDRESS_42161 || (allowDevDefaults ? devSettlement : ""),
    8453: process.env.SETTLEMENT_ADDRESS_8453 || (allowDevDefaults ? devSettlement : ""),
    137: process.env.SETTLEMENT_ADDRESS_137 || (allowDevDefaults ? devSettlement : ""),
    10: process.env.SETTLEMENT_ADDRESS_10 || (allowDevDefaults ? devSettlement : "")
  } as Record<number, string>,
  rpcUrls: {
    1: process.env.ETHEREUM_RPC_URL || "",
    42161: process.env.ARBITRUM_RPC_URL || "",
    8453: process.env.BASE_RPC_URL || "",
    137: process.env.POLYGON_RPC_URL || "",
    10: process.env.OPTIMISM_RPC_URL || ""
  } as Record<number, string>,
  ammQuoters: {
    1: process.env.UNISWAP_V3_QUOTER_1 || "",
    42161: process.env.UNISWAP_V3_QUOTER_42161 || "",
    8453: process.env.UNISWAP_V3_QUOTER_8453 || "",
    137: process.env.UNISWAP_V3_QUOTER_137 || "",
    10: process.env.UNISWAP_V3_QUOTER_10 || ""
  } as Record<number, string>
};

export const SUPPORTED_CHAIN_IDS = [1, 42161, 8453, 137, 10] as const;
export const PROTOCOL_FEE_BPS = 10;
export const DEFAULT_SPREAD_BPS = 20;
export const QUOTE_TTL_SECONDS = 90;
export const DEFAULT_UNISWAP_V3_FEE_TIERS = [100, 500, 3000, 10000] as const;
