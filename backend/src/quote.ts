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
  const attemptedAmmRoutes: AmmQuoteResult["attemptedRoutes"] = [];
  const priceCache = new Map<TokenSymbol, number>();
  const routePlan: Array<{
    leg: number;
    from: TokenSymbol;
    to: TokenSymbol;
    venue: string;
    source: string;
    inputAmount: string;
    outputAmount: string;
    adapter?: string;
    feeTier?: number;
  }> = [];
  let bestAmmRoute: AmmQuoteResult["bestRoute"];
  let currentSymbol = req.inputSymbol;
  let currentAmount = inputUnits;

  async function usd(symbol: TokenSymbol): Promise<number> {
    const cached = priceCache.get(symbol);
    if (cached) return cached;
    const price = await getUsdPrice(symbol);
    priceCache.set(symbol, price);
    return price;
  }

  function formatUnits(symbol: TokenSymbol, amount: bigint): string {
    return ethers.formatUnits(amount, TOKENS[symbol].decimals);
  }

  async function priceOutput(from: TokenSymbol, to: TokenSymbol, amount: bigint): Promise<bigint> {
    const rawOutput = Number(formatUnits(from, amount)) * ((await usd(from)) / (await usd(to)));
    return ethers.parseUnits(rawOutput.toFixed(Math.min(TOKENS[to].decimals, 8)), TOKENS[to].decimals);
  }

  async function addNativeLiquidityLeg(to: "USDC" | "EURe") {
    const from = currentSymbol;
    const amountIn = currentAmount;
    currentAmount = await priceOutput(from, to, amountIn);
    routePlan.push({
      leg: routePlan.length + 1,
      from,
      to,
      venue: "Our EURe/USDC native liquidity",
      source: "native-liquidity",
      inputAmount: formatUnits(from, amountIn),
      outputAmount: formatUnits(to, currentAmount)
    });
    currentSymbol = to;
  }

  async function addAmmLeg(to: TokenSymbol) {
    const from = currentSymbol;
    const amountIn = currentAmount;
    const fromAddress = TOKENS[from].addresses[req.chainId];
    const toAddress = TOKENS[to].addresses[req.chainId];
    if (!fromAddress || !toAddress) throw new Error(`${from} or ${to} not deployed for selected chain`);

    const ammQuote = await getBestAmmQuote({
      chainId: req.chainId,
      tokenIn: fromAddress,
      tokenOut: toAddress,
      amountIn,
      inputSymbol: from,
      outputSymbol: to
    });
    attemptedAmmRoutes.push(...ammQuote.attemptedRoutes);

    if (ammQuote.bestRoute) {
      bestAmmRoute = ammQuote.bestRoute;
      currentAmount = BigInt(ammQuote.bestRoute.amountOut);
      routePlan.push({
        leg: routePlan.length + 1,
        from,
        to,
        venue: "Market makers via AMM benchmark",
        source: "amm",
        inputAmount: formatUnits(from, amountIn),
        outputAmount: formatUnits(to, currentAmount),
        adapter: ammQuote.bestRoute.adapter,
        feeTier: ammQuote.bestRoute.feeTier
      });
    } else {
      const reasons = ammQuote.attemptedRoutes.map((route) => route.reason).filter(Boolean);
      const isMarketMakerBridgeLeg = (from === "WETH" && to === "SOL") || (from === "SOL" && to === "WETH");
      if (req.requireAmm && !isMarketMakerBridgeLeg) throw new Error(`No ${from} -> ${to} AMM liquidity route found${reasons.length ? `: ${reasons[0]}` : ""}`);
      currentAmount = await priceOutput(from, to, amountIn);
      routePlan.push({
        leg: routePlan.length + 1,
        from,
        to,
        venue: isMarketMakerBridgeLeg ? "Market makers via RFQ bridge inventory" : "Market makers via reference fallback",
        source: isMarketMakerBridgeLeg ? "market-maker-rfq" : "price-api",
        inputAmount: formatUnits(from, amountIn),
        outputAmount: formatUnits(to, currentAmount)
      });
    }
    currentSymbol = to;
  }

  if (isSameAsset) {
    routePlan.push({
      leg: 1,
      from: req.inputSymbol,
      to: req.outputSymbol,
      venue: "Same asset",
      source: "self",
      inputAmount: req.inputAmount,
      outputAmount: formatUnits(req.outputSymbol, inputUnits)
    });
  } else {
    if (currentSymbol === "EURe" && req.outputSymbol !== "USDC") await addNativeLiquidityLeg("USDC");
    if (currentSymbol === "SOL" && req.outputSymbol !== "SOL") await addAmmLeg("WETH");

    if (req.outputSymbol === "EURe") {
      if (currentSymbol !== "USDC") await addAmmLeg("USDC");
      await addNativeLiquidityLeg("EURe");
    } else if (req.outputSymbol === "SOL") {
      if (currentSymbol !== "WETH") await addAmmLeg("WETH");
      await addAmmLeg("SOL");
    } else if (currentSymbol !== req.outputSymbol) {
      await addAmmLeg(req.outputSymbol);
    }
  }

  const inputUsd = isSameAsset ? 1 : await usd(req.inputSymbol);
  const outputUsd = isSameAsset ? 1 : await usd(req.outputSymbol);
  const benchmarkOutput = currentAmount;
  const outputAmount = isSameAsset ? benchmarkOutput : applyBps(benchmarkOutput, DEFAULT_SPREAD_BPS);
  const usesNativeLiquidity = routePlan.some((leg) => leg.source === "native-liquidity");
  const usesAmm = routePlan.some((leg) => leg.source === "amm");
  const usesMarketMakerRfq = routePlan.some((leg) => leg.source === "market-maker-rfq");
  const source = isSameAsset ? "self" : usesNativeLiquidity && usesAmm ? "native-usdc-amm" : usesAmm ? "amm" : usesMarketMakerRfq ? "market-maker-rfq" : "price-api";
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
      bestAmmRoute: bestAmmRoute
        ? {
            adapter: bestAmmRoute.adapter,
            feeTier: bestAmmRoute.feeTier,
            amountOut: ethers.formatUnits(bestAmmRoute.amountOut, TOKENS[bestAmmRoute.outputSymbol].decimals),
            gasEstimate: bestAmmRoute.gasEstimate
          }
        : null,
      routePlan,
      attemptedAmmRoutes,
      spreadBps: DEFAULT_SPREAD_BPS,
      protocolFeeBps: PROTOCOL_FEE_BPS,
      expiresAt: new Date(expiry * 1000).toISOString()
    }
  };
}
