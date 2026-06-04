import axios from "axios";
import { ethers } from "ethers";
import { config, DEFAULT_UNISWAP_V3_FEE_TIERS } from "./config";
import { TOKENS, TokenSymbol } from "./tokens";

const v3QuoterAbi = [
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)"
];

const routerV2Abi = [
  "function getAmountsOut(uint256 amountIn,address[] calldata path) view returns (uint256[] memory amounts)"
];

const aerodromeRouterAbi = [
  "function getAmountsOut(uint256 amountIn,(address from,address to,bool stable,address factory)[] calldata routes) view returns (uint256[] memory amounts)"
];

export type AmmAdapter = "uniswap-v3" | "pancakeswap-v3" | "aerodrome" | "alienbase" | "openocean";

export interface AmmRouteQuote {
  adapter: AmmAdapter;
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  inputSymbol: TokenSymbol;
  outputSymbol: TokenSymbol;
  feeTier: number;
  amountIn: string;
  amountOut: string;
  gasEstimate?: string;
}

export interface AmmQuoteResult {
  bestRoute?: AmmRouteQuote;
  attemptedRoutes: Array<Pick<AmmRouteQuote, "adapter" | "chainId" | "feeTier"> & { ok: boolean; reason?: string }>;
}

interface QuoteParams {
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  inputSymbol: TokenSymbol;
  outputSymbol: TokenSymbol;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(work: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      lastError = error;
      await sleep(150 * (attempt + 1));
    }
  }
  throw lastError;
}

function getProvider(chainId: number): ethers.JsonRpcProvider | undefined {
  const rpcUrl = config.rpcUrls[chainId];
  if (!rpcUrl) return undefined;
  return new ethers.JsonRpcProvider(rpcUrl, chainId);
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function hasCode(provider: ethers.JsonRpcProvider, address: string, missingReason: string): Promise<void> {
  const code = await withRetry(() => provider.getCode(address));
  if (code === "0x") throw new Error(missingReason);
}

async function quoteV3FeeTier(
  params: QuoteParams & {
    adapter: Extract<AmmAdapter, "uniswap-v3" | "pancakeswap-v3">;
    quoterAddress: string;
    feeTier: number;
  }
): Promise<AmmRouteQuote> {
  const provider = getProvider(params.chainId);
  if (!provider) throw new Error("RPC URL not configured");

  const quoter = new ethers.Contract(params.quoterAddress, v3QuoterAbi, provider);
  const [amountOut, , , gasEstimate] = await quoter.quoteExactInputSingle.staticCall({
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    amountIn: params.amountIn,
    fee: params.feeTier,
    sqrtPriceLimitX96: 0
  });

  return {
    adapter: params.adapter,
    chainId: params.chainId,
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    inputSymbol: params.inputSymbol,
    outputSymbol: params.outputSymbol,
    feeTier: params.feeTier,
    amountIn: params.amountIn.toString(),
    amountOut: amountOut.toString(),
    gasEstimate: gasEstimate?.toString()
  };
}

async function quoteV2Router(params: QuoteParams & { adapter: "alienbase"; routerAddress: string }): Promise<AmmRouteQuote> {
  const provider = getProvider(params.chainId);
  if (!provider) throw new Error("RPC URL not configured");

  const router = new ethers.Contract(params.routerAddress, routerV2Abi, provider);
  const amounts: bigint[] = await router.getAmountsOut.staticCall(params.amountIn, [params.tokenIn, params.tokenOut]);
  const amountOut = amounts.at(-1);
  if (!amountOut || amountOut === 0n) throw new Error("Router returned zero output");

  return {
    adapter: params.adapter,
    chainId: params.chainId,
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    inputSymbol: params.inputSymbol,
    outputSymbol: params.outputSymbol,
    feeTier: 0,
    amountIn: params.amountIn.toString(),
    amountOut: amountOut.toString()
  };
}

async function quoteAerodrome(params: QuoteParams & { routerAddress: string; stable: boolean }): Promise<AmmRouteQuote> {
  const provider = getProvider(params.chainId);
  if (!provider) throw new Error("RPC URL not configured");

  const router = new ethers.Contract(params.routerAddress, aerodromeRouterAbi, provider);
  const routes = [{ from: params.tokenIn, to: params.tokenOut, stable: params.stable, factory: ethers.ZeroAddress }];
  const amounts: bigint[] = await router.getAmountsOut.staticCall(params.amountIn, routes);
  const amountOut = amounts.at(-1);
  if (!amountOut || amountOut === 0n) throw new Error("Aerodrome returned zero output");

  return {
    adapter: "aerodrome",
    chainId: params.chainId,
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    inputSymbol: params.inputSymbol,
    outputSymbol: params.outputSymbol,
    feeTier: params.stable ? 1 : 0,
    amountIn: params.amountIn.toString(),
    amountOut: amountOut.toString()
  };
}

async function quoteOpenOcean(params: QuoteParams): Promise<AmmRouteQuote> {
  if (!config.openOcean.enabled) throw new Error("OpenOcean disabled");

  const chainName = config.openOcean.chainNames[params.chainId];
  if (!chainName) throw new Error("OpenOcean chain name not configured");

  const amount = ethers.formatUnits(params.amountIn, TOKENS[params.inputSymbol].decimals);
  const url = `${config.openOcean.baseUrl.replace(/\/$/, "")}/v4/${chainName}/quote`;
  const response = await axios.get(url, {
    params: {
      inTokenAddress: params.tokenIn,
      outTokenAddress: params.tokenOut,
      amount,
      gasPrice: 0.01
    },
    timeout: 7000
  });

  const data = response.data?.data ?? response.data;
  const rawAmountOut = data?.outAmount ?? data?.outAmountWithoutFee ?? data?.toTokenAmount;
  if (!rawAmountOut || BigInt(rawAmountOut) === 0n) throw new Error(response.data?.message || "OpenOcean returned no output");

  return {
    adapter: "openocean",
    chainId: params.chainId,
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    inputSymbol: params.inputSymbol,
    outputSymbol: params.outputSymbol,
    feeTier: 0,
    amountIn: params.amountIn.toString(),
    amountOut: rawAmountOut.toString()
  };
}

function pushAttempt(
  attemptedRoutes: AmmQuoteResult["attemptedRoutes"],
  adapter: AmmAdapter,
  chainId: number,
  feeTier: number,
  ok: boolean,
  failedReason?: string
) {
  attemptedRoutes.push({ adapter, chainId, feeTier, ok, reason: failedReason });
}

async function tryQuote(
  attemptedRoutes: AmmQuoteResult["attemptedRoutes"],
  successfulQuotes: AmmRouteQuote[],
  adapter: AmmAdapter,
  chainId: number,
  feeTier: number,
  work: () => Promise<AmmRouteQuote>
) {
  try {
    const quote = await withRetry(work, 2);
    successfulQuotes.push(quote);
    pushAttempt(attemptedRoutes, adapter, chainId, feeTier, true);
  } catch (error) {
    pushAttempt(attemptedRoutes, adapter, chainId, feeTier, false, reason(error));
  }
}

export async function getBestAmmQuote(params: QuoteParams): Promise<AmmQuoteResult> {
  const attemptedRoutes: AmmQuoteResult["attemptedRoutes"] = [];
  const successfulQuotes: AmmRouteQuote[] = [];
  const provider = getProvider(params.chainId);

  if (!provider) {
    return {
      attemptedRoutes: [{ adapter: "uniswap-v3", chainId: params.chainId, feeTier: 0, ok: false, reason: "RPC URL not configured" }]
    };
  }

  try {
    await Promise.all([
      hasCode(provider, params.tokenIn, "Input token has no contract code on this chain"),
      hasCode(provider, params.tokenOut, "Output token has no contract code on this chain")
    ]);
  } catch (error) {
    return {
      attemptedRoutes: [{ adapter: "uniswap-v3", chainId: params.chainId, feeTier: 0, ok: false, reason: reason(error) }]
    };
  }

  const uniswapQuoter = config.ammQuoters[params.chainId];
  if (uniswapQuoter && ethers.isAddress(uniswapQuoter)) {
    try {
      await hasCode(provider, uniswapQuoter, "Configured Uniswap V3 quoter has no contract code on this chain");
      for (const feeTier of DEFAULT_UNISWAP_V3_FEE_TIERS) {
        await tryQuote(attemptedRoutes, successfulQuotes, "uniswap-v3", params.chainId, feeTier, () =>
          quoteV3FeeTier({ ...params, adapter: "uniswap-v3", quoterAddress: uniswapQuoter, feeTier })
        );
      }
    } catch (error) {
      pushAttempt(attemptedRoutes, "uniswap-v3", params.chainId, 0, false, reason(error));
    }
  } else {
    pushAttempt(attemptedRoutes, "uniswap-v3", params.chainId, 0, false, "Uniswap V3 quoter not configured");
  }

  const pancakeQuoter = config.pancakeV3Quoters[params.chainId];
  if (pancakeQuoter && ethers.isAddress(pancakeQuoter)) {
    try {
      await hasCode(provider, pancakeQuoter, "Configured PancakeSwap V3 quoter has no contract code on this chain");
      for (const feeTier of DEFAULT_UNISWAP_V3_FEE_TIERS) {
        await tryQuote(attemptedRoutes, successfulQuotes, "pancakeswap-v3", params.chainId, feeTier, () =>
          quoteV3FeeTier({ ...params, adapter: "pancakeswap-v3", quoterAddress: pancakeQuoter, feeTier })
        );
      }
    } catch (error) {
      pushAttempt(attemptedRoutes, "pancakeswap-v3", params.chainId, 0, false, reason(error));
    }
  } else {
    pushAttempt(attemptedRoutes, "pancakeswap-v3", params.chainId, 0, false, "PancakeSwap V3 quoter not configured");
  }

  const aerodromeRouter = config.aerodromeRouters[params.chainId];
  if (aerodromeRouter && ethers.isAddress(aerodromeRouter)) {
    try {
      await hasCode(provider, aerodromeRouter, "Configured Aerodrome router has no contract code on this chain");
      await tryQuote(attemptedRoutes, successfulQuotes, "aerodrome", params.chainId, 0, () =>
        quoteAerodrome({ ...params, routerAddress: aerodromeRouter, stable: false })
      );
      await tryQuote(attemptedRoutes, successfulQuotes, "aerodrome", params.chainId, 1, () =>
        quoteAerodrome({ ...params, routerAddress: aerodromeRouter, stable: true })
      );
    } catch (error) {
      pushAttempt(attemptedRoutes, "aerodrome", params.chainId, 0, false, reason(error));
    }
  } else {
    pushAttempt(attemptedRoutes, "aerodrome", params.chainId, 0, false, "Aerodrome router not configured");
  }

  const alienBaseRouter = config.alienBaseRouters[params.chainId];
  if (alienBaseRouter && ethers.isAddress(alienBaseRouter)) {
    try {
      await hasCode(provider, alienBaseRouter, "Configured AlienBase router has no contract code on this chain");
      await tryQuote(attemptedRoutes, successfulQuotes, "alienbase", params.chainId, 0, () =>
        quoteV2Router({ ...params, adapter: "alienbase", routerAddress: alienBaseRouter })
      );
    } catch (error) {
      pushAttempt(attemptedRoutes, "alienbase", params.chainId, 0, false, reason(error));
    }
  } else {
    pushAttempt(attemptedRoutes, "alienbase", params.chainId, 0, false, "AlienBase router not configured");
  }

  await tryQuote(attemptedRoutes, successfulQuotes, "openocean", params.chainId, 0, () => quoteOpenOcean(params));

  successfulQuotes.sort((a, b) => {
    const left = BigInt(a.amountOut);
    const right = BigInt(b.amountOut);
    if (left === right) return 0;
    return left > right ? -1 : 1;
  });

  return { bestRoute: successfulQuotes[0], attemptedRoutes };
}
