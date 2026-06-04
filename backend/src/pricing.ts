import axios from "axios";
import { config } from "./config";
import { TOKENS, TokenSymbol } from "./tokens";

const memoryCache = new Map<string, { price: number; expiresAt: number }>();
const staticUsdPrices: Record<TokenSymbol, number> = {
  EURe: 1.08,
  EURC: 1.08,
  EURS: 1.08,
  EURT: 1.08,
  GBPe: 1.27,
  GBPT: 1.27,
  USDC: 1,
  USDT: 1,
  USDP: 1,
  PYUSD: 1,
  USDY: 1,
  CADC: 0.73,
  QCAD: 0.73,
  AUDD: 0.66,
  "A$DC": 0.66,
  NZDS: 0.61,
  CHFX: 1.12,
  XSGD: 0.74,
  JPYC: 0.0068,
  TRYB: 0.031,
  BRZ: 0.19,
  MXNT: 0.056,
  DAI: 1,
  WETH: 3800,
  WBTC: 69000,
  VIRTUAL: 0.72,
  SOL: 90,
  PURe: 1
};

async function getCoingeckoUsd(symbol: TokenSymbol): Promise<number> {
  const token = TOKENS[symbol];
  const cached = memoryCache.get(`cg:${symbol}`);
  if (cached && cached.expiresAt > Date.now()) return cached.price;

  const response = await axios.get("https://api.coingecko.com/api/v3/simple/price", {
    params: { ids: token.coingeckoId, vs_currencies: "usd" },
    headers: config.coingeckoApiKey ? { "x-cg-demo-api-key": config.coingeckoApiKey } : undefined,
    timeout: 5000
  });
  const price = Number(response.data[token.coingeckoId]?.usd);
  if (!price) throw new Error(`CoinGecko missing price for ${symbol}`);
  memoryCache.set(`cg:${symbol}`, { price, expiresAt: Date.now() + 20_000 });
  return price;
}

async function getCmcUsd(symbol: TokenSymbol): Promise<number> {
  if (!config.coinmarketcapApiKey) throw new Error("CoinMarketCap API key not configured");
  const response = await axios.get("https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest", {
    params: { symbol: TOKENS[symbol].cmcSymbol },
    headers: { "X-CMC_PRO_API_KEY": config.coinmarketcapApiKey },
    timeout: 5000
  });
  const rows = response.data.data[TOKENS[symbol].cmcSymbol];
  const price = Number(Array.isArray(rows) ? rows[0]?.quote?.USD?.price : rows?.quote?.USD?.price);
  if (!price) throw new Error(`CoinMarketCap missing price for ${symbol}`);
  return price;
}

async function getBinanceUsd(symbol: TokenSymbol): Promise<number> {
  const pair = TOKENS[symbol].binanceSymbol;
  if (!pair) throw new Error(`No Binance pair for ${symbol}`);
  const response = await axios.get("https://api.binance.com/api/v3/ticker/price", {
    params: { symbol: pair },
    timeout: 5000
  });
  return Number(response.data.price);
}

export async function getUsdPrice(symbol: TokenSymbol): Promise<number> {
  const errors: string[] = [];
  for (const source of [getCoingeckoUsd, getCmcUsd, getBinanceUsd]) {
    try {
      return await source(symbol);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (config.allowDevDefaults) return staticUsdPrices[symbol];
  throw new Error(`No price source available for ${symbol}: ${errors.join("; ")}`);
}
