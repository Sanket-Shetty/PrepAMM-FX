export const tokenSymbols = [
  "EURe",
  "EURC",
  "EURS",
  "EURT",
  "GBPe",
  "GBPT",
  "USDC",
  "USDT",
  "USDP",
  "PYUSD",
  "USDY",
  "CADC",
  "QCAD",
  "AUDD",
  "A$DC",
  "NZDS",
  "CHFX",
  "XSGD",
  "JPYC",
  "TRYB",
  "BRZ",
  "MXNT",
  "DAI",
  "WETH",
  "WBTC",
  "VIRTUAL",
  "SOL"
] as const;
export type TokenSymbol = (typeof tokenSymbols)[number];

export const stableToUsdcSymbols = [
  "EURS",
  "EURT",
  "GBPe",
  "GBPT",
  "USDC",
  "USDT",
  "USDP",
  "PYUSD",
  "USDY",
  "CADC",
  "QCAD",
  "AUDD",
  "A$DC",
  "NZDS",
  "CHFX",
  "XSGD",
  "JPYC",
  "TRYB",
  "BRZ",
  "MXNT",
  "EURe",
  "EURC"
] as const;

export const settlementAddresses: Record<number, `0x${string}`> = {
  1: (import.meta.env.VITE_SETTLEMENT_ADDRESS_1 || "0x0000000000000000000000000000000000000000") as `0x${string}`,
  42161: (import.meta.env.VITE_SETTLEMENT_ADDRESS_42161 || "0x0000000000000000000000000000000000000000") as `0x${string}`,
  8453: (import.meta.env.VITE_SETTLEMENT_ADDRESS_8453 || "0x0000000000000000000000000000000000000000") as `0x${string}`,
  84532: (import.meta.env.VITE_SETTLEMENT_ADDRESS_84532 || "0x0000000000000000000000000000000000000000") as `0x${string}`,
  137: (import.meta.env.VITE_SETTLEMENT_ADDRESS_137 || "0x0000000000000000000000000000000000000000") as `0x${string}`,
  10: (import.meta.env.VITE_SETTLEMENT_ADDRESS_10 || "0x0000000000000000000000000000000000000000") as `0x${string}`
};
