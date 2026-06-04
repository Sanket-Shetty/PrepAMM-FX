import { ethers } from "ethers";
import { config, DEFAULT_SPREAD_BPS, PROTOCOL_FEE_BPS, QUOTE_TTL_SECONDS, SUPPORTED_CHAIN_IDS } from "./config";
import { getBestAmmQuote } from "./amm";
import { getUsdPrice } from "./pricing";
import { TOKENS, TokenSymbol } from "./tokens";

export interface QuoteRequest {
  chainId: number;
  taker: string;
  inputSymbol: TokenSymbol;
  outputSymbol: TokenSymbol;
  inputAmount: string;
  nonce?: string;
  requireAmm?: boolean;
}

function applyBps(amount: bigint, bps: number): bigint {
  return (amount * BigInt(10_000 - bps)) / 10_000n;
}

export async function buildQuote(req: QuoteRequest) {
  if (!SUPPORTED_CHAIN_IDS.includes(req.chainId as any)) throw new Error("Unsupported chain");
  if (!ethers.isAddress(req.taker)) throw new Error("Invalid taker");
  if (!TOKENS[req.inputSymbol] || !TOKENS[req.outputSymbol]) throw new Error("Unsupported token");

  const inputToken = TOKENS[req.inputSymbol];
  const outputToken = TOKENS[req.outputSymbol];
  const inputTokenAddress = inputToken.addresses[req.chainId];
  const outputTokenAddress = outputToken.addresses[req.chainId];
  const settlement = config.settlements[req.chainId];

  if (!inputTokenAddress || !outputTokenAddress) throw new Error("Token not deployed for selected chain");
  if (!settlement || !ethers.isAddress(settlement)) throw new Error("Settlement address not configured");
  if (!config.mmPrivateKey) throw new Error("MM_PRIVATE_KEY not configured");

  const wallet = new ethers.Wallet(config.mmPrivateKey);
  const maker = config.makerAddress && ethers.isAddress(config.makerAddress) ? config.makerAddress : wallet.address;
  const inputUnits = ethers.parseUnits(req.inputAmount, inputToken.decimals);
  const ammQuote = await getBestAmmQuote({
    chainId: req.chainId,
    tokenIn: inputTokenAddress,
    tokenOut: outputTokenAddress,
    amountIn: inputUnits,
    inputSymbol: req.inputSymbol,
    outputSymbol: req.outputSymbol
  });
  if (req.requireAmm && !ammQuote.bestRoute) {
    const reasons = ammQuote.attemptedRoutes.map((route) => route.reason).filter(Boolean);
    throw new Error(`No AMM liquidity route found${reasons.length ? `: ${reasons[0]}` : ""}`);
  }
  const inputUsd = await getUsdPrice(req.inputSymbol);
  const outputUsd = await getUsdPrice(req.outputSymbol);
  const rawOutput = Number(req.inputAmount) * (inputUsd / outputUsd);
  const priceApiOutput = ethers.parseUnits(rawOutput.toFixed(Math.min(outputToken.decimals, 8)), outputToken.decimals);
  const benchmarkOutput = ammQuote.bestRoute ? BigInt(ammQuote.bestRoute.amountOut) : priceApiOutput;
  const outputAmount = applyBps(benchmarkOutput, DEFAULT_SPREAD_BPS);
  const expiry = Math.floor(Date.now() / 1000) + QUOTE_TTL_SECONDS;
  const nonce = req.nonce ? BigInt(req.nonce) : BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));

  const order = {
    maker,
    taker: req.taker,
    inputToken: inputTokenAddress,
    outputToken: outputTokenAddress,
    inputAmount: inputUnits.toString(),
    outputAmount: outputAmount.toString(),
    expiry,
    nonce: nonce.toString(),
    chainId: req.chainId,
    feeBps: PROTOCOL_FEE_BPS
  };

  const domain = {
    name: "PrepAMM FX RFQ",
    version: "1",
    chainId: req.chainId,
    verifyingContract: settlement
  };
  const types = {
    RFQOrder: [
      { name: "maker", type: "address" },
      { name: "taker", type: "address" },
      { name: "inputToken", type: "address" },
      { name: "outputToken", type: "address" },
      { name: "inputAmount", type: "uint256" },
      { name: "outputAmount", type: "uint256" },
      { name: "expiry", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "chainId", type: "uint256" },
      { name: "feeBps", type: "uint256" }
    ]
  };
  const signature = await wallet.signTypedData(domain, types, order);

  return {
    order,
    signature,
    settlement,
    quote: {
      inputSymbol: req.inputSymbol,
      outputSymbol: req.outputSymbol,
      guaranteedOutput: ethers.formatUnits(outputAmount, outputToken.decimals),
      inputUsd,
      outputUsd,
      source: ammQuote.bestRoute ? "amm" : "price-api",
      benchmarkOutput: ethers.formatUnits(benchmarkOutput, outputToken.decimals),
      bestAmmRoute: ammQuote.bestRoute
        ? {
            adapter: ammQuote.bestRoute.adapter,
            feeTier: ammQuote.bestRoute.feeTier,
            amountOut: ethers.formatUnits(ammQuote.bestRoute.amountOut, outputToken.decimals),
            gasEstimate: ammQuote.bestRoute.gasEstimate
          }
        : null,
      attemptedAmmRoutes: ammQuote.attemptedRoutes,
      spreadBps: DEFAULT_SPREAD_BPS,
      protocolFeeBps: PROTOCOL_FEE_BPS,
      expiresAt: new Date(expiry * 1000).toISOString()
    }
  };
}
