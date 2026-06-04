import { ethers } from "ethers";
import { config, DEFAULT_SPREAD_BPS, PROTOCOL_FEE_BPS, QUOTE_TTL_SECONDS, SUPPORTED_CHAIN_IDS } from "./config";
import { AmmQuoteResult, getBestAmmQuote } from "./amm";
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

function getUsdcRouteMode(inputSymbol: TokenSymbol, outputSymbol: TokenSymbol): "input-native" | "output-native" | "none" {
  if (inputSymbol === "EURe" && outputSymbol !== "USDC") return "input-native";
  if (outputSymbol === "EURe" && inputSymbol !== "USDC") return "output-native";
  return "none";
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
  const isSameAsset = inputTokenAddress.toLowerCase() === outputTokenAddress.toLowerCase();
  const usdcRouteMode = getUsdcRouteMode(req.inputSymbol, req.outputSymbol);
  const routeViaUsdc = usdcRouteMode !== "none";
  const usdcToken = TOKENS.USDC;
  const usdcTokenAddress = usdcToken.addresses[req.chainId];

  if (routeViaUsdc && !usdcTokenAddress) throw new Error("USDC not deployed for selected chain");

  const inputUsd = isSameAsset ? 1 : await getUsdPrice(req.inputSymbol);
  const outputUsd = isSameAsset ? 1 : await getUsdPrice(req.outputSymbol);
  const usdcUsd = routeViaUsdc ? await getUsdPrice("USDC") : 1;
  const nativeUsdcRawOutput = Number(req.inputAmount) * (inputUsd / usdcUsd);
  const nativeUsdcOutputUnits = usdcRouteMode === "input-native" ? ethers.parseUnits(nativeUsdcRawOutput.toFixed(Math.min(usdcToken.decimals, 8)), usdcToken.decimals) : 0n;
  const ammInputTokenAddress = usdcRouteMode === "input-native" ? usdcTokenAddress : inputTokenAddress;
  const ammOutputTokenAddress = usdcRouteMode === "output-native" ? usdcTokenAddress : outputTokenAddress;
  const ammInputSymbol = usdcRouteMode === "input-native" ? "USDC" : req.inputSymbol;
  const ammOutputSymbol = usdcRouteMode === "output-native" ? "USDC" : req.outputSymbol;
  const ammInputUnits = usdcRouteMode === "input-native" ? nativeUsdcOutputUnits : inputUnits;
  const ammOutputToken = usdcRouteMode === "output-native" ? usdcToken : outputToken;

  const ammQuote: AmmQuoteResult = isSameAsset
    ? { attemptedRoutes: [] }
    : await getBestAmmQuote({
        chainId: req.chainId,
        tokenIn: ammInputTokenAddress,
        tokenOut: ammOutputTokenAddress,
        amountIn: ammInputUnits,
        inputSymbol: ammInputSymbol,
        outputSymbol: ammOutputSymbol
      });
  if (req.requireAmm && !isSameAsset && !ammQuote.bestRoute) {
    const reasons = ammQuote.attemptedRoutes.map((route) => route.reason).filter(Boolean);
    const missingRoute = usdcRouteMode === "input-native" ? `USDC -> ${req.outputSymbol}` : usdcRouteMode === "output-native" ? `${req.inputSymbol} -> USDC` : `${req.inputSymbol} -> ${req.outputSymbol}`;
    throw new Error(`No ${missingRoute} AMM liquidity route found${reasons.length ? `: ${reasons[0]}` : ""}`);
  }
  const rawOutput = Number(req.inputAmount) * (inputUsd / outputUsd);
  const priceApiOutput = isSameAsset ? inputUnits : ethers.parseUnits(rawOutput.toFixed(Math.min(outputToken.decimals, 8)), outputToken.decimals);
  const ammBenchmarkOutput = ammQuote.bestRoute ? BigInt(ammQuote.bestRoute.amountOut) : null;
  const outputNativeRawOutput =
    usdcRouteMode === "output-native" && ammBenchmarkOutput !== null
      ? Number(ethers.formatUnits(ammBenchmarkOutput, usdcToken.decimals)) * (usdcUsd / outputUsd)
      : 0;
  const outputNativeBenchmark = usdcRouteMode === "output-native" ? ethers.parseUnits(outputNativeRawOutput.toFixed(Math.min(outputToken.decimals, 8)), outputToken.decimals) : 0n;
  const benchmarkOutput = isSameAsset ? inputUnits : usdcRouteMode === "output-native" ? (ammBenchmarkOutput === null ? priceApiOutput : outputNativeBenchmark) : ammBenchmarkOutput ?? priceApiOutput;
  const outputAmount = isSameAsset ? benchmarkOutput : applyBps(benchmarkOutput, DEFAULT_SPREAD_BPS);
  const source = isSameAsset ? "self" : routeViaUsdc && ammQuote.bestRoute ? "native-usdc-amm" : ammQuote.bestRoute ? "amm" : "price-api";
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
      source,
      benchmarkOutput: ethers.formatUnits(benchmarkOutput, outputToken.decimals),
      bestAmmRoute: ammQuote.bestRoute
        ? {
            adapter: ammQuote.bestRoute.adapter,
            feeTier: ammQuote.bestRoute.feeTier,
            amountOut: ethers.formatUnits(ammQuote.bestRoute.amountOut, ammOutputToken.decimals),
            gasEstimate: ammQuote.bestRoute.gasEstimate
          }
        : null,
      routePlan: usdcRouteMode === "input-native"
        ? [
            {
              leg: 1,
              from: req.inputSymbol,
              to: "USDC",
              venue: "Our EURe/USDC native liquidity",
              source: "native-liquidity",
              inputAmount: req.inputAmount,
              outputAmount: ethers.formatUnits(nativeUsdcOutputUnits, usdcToken.decimals)
            },
            {
              leg: 2,
              from: "USDC",
              to: req.outputSymbol,
              venue: ammQuote.bestRoute ? "Market makers via AMM benchmark" : "Market makers via reference fallback",
              source: ammQuote.bestRoute ? "amm" : "price-api",
              inputAmount: ethers.formatUnits(nativeUsdcOutputUnits, usdcToken.decimals),
              outputAmount: ethers.formatUnits(ammBenchmarkOutput ?? priceApiOutput, outputToken.decimals),
              adapter: ammQuote.bestRoute?.adapter,
              feeTier: ammQuote.bestRoute?.feeTier
            }
          ]
        : usdcRouteMode === "output-native"
          ? [
              {
                leg: 1,
                from: req.inputSymbol,
                to: "USDC",
                venue: ammQuote.bestRoute ? "Market makers via AMM benchmark" : "Market makers via reference fallback",
                source: ammQuote.bestRoute ? "amm" : "price-api",
                inputAmount: req.inputAmount,
                outputAmount: ethers.formatUnits(ammBenchmarkOutput ?? ethers.parseUnits((Number(req.inputAmount) * (inputUsd / usdcUsd)).toFixed(Math.min(usdcToken.decimals, 8)), usdcToken.decimals), usdcToken.decimals),
                adapter: ammQuote.bestRoute?.adapter,
                feeTier: ammQuote.bestRoute?.feeTier
              },
              {
                leg: 2,
                from: "USDC",
                to: req.outputSymbol,
                venue: "Our EURe/USDC native liquidity",
                source: "native-liquidity",
                inputAmount: ethers.formatUnits(ammBenchmarkOutput ?? 0n, usdcToken.decimals),
                outputAmount: ethers.formatUnits(benchmarkOutput, outputToken.decimals)
              }
            ]
        : [
            {
              leg: 1,
              from: req.inputSymbol,
              to: req.outputSymbol,
              venue: isSameAsset ? "Same asset" : ammQuote.bestRoute ? "Market makers via AMM benchmark" : "Reference-price fallback",
              source,
              inputAmount: req.inputAmount,
              outputAmount: ethers.formatUnits(benchmarkOutput, outputToken.decimals),
              adapter: ammQuote.bestRoute?.adapter,
              feeTier: ammQuote.bestRoute?.feeTier
            }
          ],
      attemptedAmmRoutes: ammQuote.attemptedRoutes,
      spreadBps: DEFAULT_SPREAD_BPS,
      protocolFeeBps: PROTOCOL_FEE_BPS,
      expiresAt: new Date(expiry * 1000).toISOString()
    }
  };
}
