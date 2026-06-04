import { ethers } from "ethers";
import { config, DEFAULT_UNISWAP_V3_FEE_TIERS } from "./config";
import { TokenSymbol } from "./tokens";

const uniswapV3QuoterAbi = [
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)"
];

export interface AmmRouteQuote {
  adapter: "uniswap-v3";
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

async function quoteUniswapV3FeeTier(params: {
  chainId: number;
  quoterAddress: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  inputSymbol: TokenSymbol;
  outputSymbol: TokenSymbol;
  feeTier: number;
}): Promise<AmmRouteQuote> {
  const provider = getProvider(params.chainId);
  if (!provider) throw new Error("RPC URL not configured");

  const quoter = new ethers.Contract(params.quoterAddress, uniswapV3QuoterAbi, provider);
  const [amountOut, , , gasEstimate] = await quoter.quoteExactInputSingle.staticCall({
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    amountIn: params.amountIn,
    fee: params.feeTier,
    sqrtPriceLimitX96: 0
  });

  return {
    adapter: "uniswap-v3",
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

export async function getBestAmmQuote(params: {
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  inputSymbol: TokenSymbol;
  outputSymbol: TokenSymbol;
}): Promise<AmmQuoteResult> {
  const attemptedRoutes: AmmQuoteResult["attemptedRoutes"] = [];
  const quoterAddress = config.ammQuoters[params.chainId];

  if (!config.rpcUrls[params.chainId]) {
    return { attemptedRoutes: [{ adapter: "uniswap-v3", chainId: params.chainId, feeTier: 0, ok: false, reason: "RPC URL not configured" }] };
  }

  if (!quoterAddress || !ethers.isAddress(quoterAddress)) {
    return { attemptedRoutes: [{ adapter: "uniswap-v3", chainId: params.chainId, feeTier: 0, ok: false, reason: "Uniswap V3 quoter not configured" }] };
  }

  const provider = getProvider(params.chainId);
  if (!provider) {
    return { attemptedRoutes: [{ adapter: "uniswap-v3", chainId: params.chainId, feeTier: 0, ok: false, reason: "RPC URL not configured" }] };
  }

  const [tokenInCode, tokenOutCode, quoterCode] = await Promise.all([
    withRetry(() => provider.getCode(params.tokenIn)),
    withRetry(() => provider.getCode(params.tokenOut)),
    withRetry(() => provider.getCode(quoterAddress))
  ]);
  if (tokenInCode === "0x") {
    return { attemptedRoutes: [{ adapter: "uniswap-v3", chainId: params.chainId, feeTier: 0, ok: false, reason: "Input token has no contract code on this chain" }] };
  }
  if (tokenOutCode === "0x") {
    return { attemptedRoutes: [{ adapter: "uniswap-v3", chainId: params.chainId, feeTier: 0, ok: false, reason: "Output token has no contract code on this chain" }] };
  }
  if (quoterCode === "0x") {
    return { attemptedRoutes: [{ adapter: "uniswap-v3", chainId: params.chainId, feeTier: 0, ok: false, reason: "Configured quoter has no contract code on this chain" }] };
  }

  const successfulQuotes: AmmRouteQuote[] = [];
  for (const feeTier of DEFAULT_UNISWAP_V3_FEE_TIERS) {
    let lastError: unknown;
    try {
      let quote: AmmRouteQuote | undefined;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          quote = await withRetry(() => quoteUniswapV3FeeTier({ ...params, quoterAddress, feeTier }), 2);
          break;
        } catch (error) {
          lastError = error;
          await sleep(120 * (attempt + 1));
        }
      }
      if (!quote) throw lastError;
      successfulQuotes.push(quote);
      attemptedRoutes.push({ adapter: "uniswap-v3", chainId: params.chainId, feeTier, ok: true });
    } catch (error) {
      attemptedRoutes.push({
        adapter: "uniswap-v3",
        chainId: params.chainId,
        feeTier,
        ok: false,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  successfulQuotes.sort((a, b) => {
    const left = BigInt(a.amountOut);
    const right = BigInt(b.amountOut);
    if (left === right) return 0;
    return left > right ? -1 : 1;
  });

  return { bestRoute: successfulQuotes[0], attemptedRoutes };
}
