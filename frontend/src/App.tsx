import axios from "axios";
import { ArrowDownUp, Check, Loader2, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain, useWriteContract } from "wagmi";
import { injected } from "wagmi/connectors";
import { rfxSettlementAbi } from "./abis/RFXSettlement";
import { chains } from "./lib/wagmi";
import { TokenSymbol, settlementAddresses, stableToUsdcSymbols, tokenSymbols } from "./lib/tokens";

type QuoteResponse = {
  order: {
    maker: `0x${string}`;
    taker: `0x${string}`;
    inputToken: `0x${string}`;
    outputToken: `0x${string}`;
    inputAmount: string;
    outputAmount: string;
    expiry: number;
    nonce: string;
    chainId: number;
    feeBps: number;
  };
  signature: `0x${string}`;
  settlement: `0x${string}`;
  quote: {
    guaranteedOutput: string;
    expiresAt: string;
    spreadBps: number;
    protocolFeeBps: number;
    source: "amm" | "price-api" | "self" | "native-usdc-amm" | "market-maker-rfq";
    benchmarkOutput: string;
    bestAmmRoute: null | {
      adapter: string;
      feeTier: number;
      amountOut: string;
      gasEstimate?: string;
    };
    routePlan: Array<{
      leg: number;
      from: TokenSymbol;
      to: TokenSymbol;
      venue: string;
      source: string;
      inputAmount: string;
      outputAmount: string;
      adapter?: string;
      feeTier?: number;
    }>;
  };
};

type StableQuoteRow = {
  inputSymbol: TokenSymbol;
  outputSymbol: "USDC";
  ok: boolean;
  source: "amm" | "none" | "self";
  guaranteedOutput: string | null;
  benchmarkOutput?: string | null;
  route: null | {
    adapter: string;
    feeTier: number;
    amountOut: string;
    gasEstimate?: string;
  };
  reason: string | null;
};

type StableQuoteResponse = {
  chainId: number;
  inputAmount: string;
  outputSymbol: "USDC";
  rows: StableQuoteRow[];
};

const apiBase = import.meta.env.VITE_QUOTE_API_URL || "http://localhost:4000";
const demoTaker = "0x000000000000000000000000000000000000dEaD" as const;
const defaultChainId = 8453;

export function App() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync, isPending: isExecuting } = useWriteContract();
  const [inputSymbol, setInputSymbol] = useState<TokenSymbol>("EURe");
  const [outputSymbol, setOutputSymbol] = useState<TokenSymbol>("WETH");
  const [amount, setAmount] = useState("100");
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [status, setStatus] = useState("");
  const [isQuoting, setIsQuoting] = useState(false);
  const [selectedChainId, setSelectedChainId] = useState(defaultChainId);
  const [stableQuotes, setStableQuotes] = useState<StableQuoteRow[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  const activeChain = useMemo(
    () => chains.find((chain) => chain.id === (isConnected ? chainId : selectedChainId)) || chains.find((chain) => chain.id === defaultChainId) || chains[0],
    [chainId, isConnected, selectedChainId]
  );
  const sourceLabel = quote
    ? quote.quote.source === "amm"
      ? "AMM"
      : quote.quote.source === "native-usdc-amm"
        ? "Native USDC + AMM"
        : quote.quote.source === "market-maker-rfq"
          ? "Market Maker RFQ"
        : quote.quote.source === "self"
          ? "Same asset"
          : "Price API"
    : "";

  async function getQuote() {
    setIsQuoting(true);
    setStatus("");
    try {
      const response = await axios.post<QuoteResponse>(`${apiBase}/quote`, {
        chainId: activeChain.id,
        taker: address || demoTaker,
        inputSymbol,
        outputSymbol,
        inputAmount: amount,
        requireAmm: true
      });
      setQuote(response.data);
      setStatus(address ? "Quote locked" : "Demo quote shown. Connect wallet to execute.");
    } catch (error) {
      setStatus(axios.isAxiosError(error) ? error.response?.data?.error || error.message : "Quote failed");
    } finally {
      setIsQuoting(false);
    }
  }

  async function scanStableQuotes() {
    setIsScanning(true);
    setStatus("");
    try {
      const response = await axios.post<StableQuoteResponse>(`${apiBase}/quotes/stable-to-usdc`, {
        chainId: activeChain.id,
        taker: address || demoTaker,
        inputAmount: amount
      });
      setStableQuotes(response.data.rows);
      const ammCount = response.data.rows.filter((row) => row.source === "amm").length;
      setStatus(`${ammCount} AMM routes found`);
    } catch (error) {
      setStatus(axios.isAxiosError(error) ? error.response?.data?.error || error.message : "Scan failed");
    } finally {
      setIsScanning(false);
    }
  }

  async function executeSwap() {
    if (!quote) return;
    setStatus("");
    const txHash = await writeContractAsync({
      address: quote.settlement || settlementAddresses[quote.order.chainId],
      abi: rfxSettlementAbi,
      functionName: "settleRFQ",
      args: [
        {
          ...quote.order,
          inputAmount: BigInt(quote.order.inputAmount),
          outputAmount: BigInt(quote.order.outputAmount),
          expiry: BigInt(quote.order.expiry),
          nonce: BigInt(quote.order.nonce),
          chainId: BigInt(quote.order.chainId),
          feeBps: BigInt(quote.order.feeBps)
        },
        quote.signature
      ]
    });
    setStatus(`Submitted ${txHash.slice(0, 10)}...`);
  }

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">PrepAMM FX</p>
          <h1>Firm RFQ stablecoin settlement</h1>
        </div>
        {isConnected ? (
          <button className="ghost" onClick={() => disconnect()}>
            <Wallet size={18} />
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </button>
        ) : (
          <button onClick={() => connect({ connector: injected() })} disabled={isConnecting}>
            <Wallet size={18} />
            Connect
          </button>
        )}
      </section>

      <section className="swap">
        <div className="row">
          <label>Chain</label>
          <select
            value={activeChain.id}
            onChange={(event) => {
              const nextChainId = Number(event.target.value);
              setSelectedChainId(nextChainId);
              setQuote(null);
              setStableQuotes([]);
              if (isConnected) switchChain({ chainId: nextChainId });
            }}
          >
            {chains.map((chain) => (
              <option key={chain.id} value={chain.id}>
                {chain.name}
              </option>
            ))}
          </select>
        </div>

        <div className="tokenBox">
          <label>Pay</label>
          <div className="amountLine">
            <input
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setQuote(null);
                setStableQuotes([]);
              }}
              inputMode="decimal"
            />
            <select
              value={inputSymbol}
              onChange={(event) => {
                setInputSymbol(event.target.value as TokenSymbol);
                setQuote(null);
                setStableQuotes([]);
              }}
            >
              {tokenSymbols.map((symbol) => (
                <option key={symbol}>{symbol}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          className="flip"
          onClick={() => {
            setInputSymbol(outputSymbol);
            setOutputSymbol(inputSymbol);
            setQuote(null);
            setStableQuotes([]);
          }}
          aria-label="Swap token direction"
        >
          <ArrowDownUp size={18} />
        </button>

        <div className="tokenBox">
          <label>Receive</label>
          <div className="amountLine">
            <output>{quote?.quote.guaranteedOutput || "0.00"}</output>
            <select
              value={outputSymbol}
              onChange={(event) => {
                setOutputSymbol(event.target.value as TokenSymbol);
                setQuote(null);
                setStableQuotes([]);
              }}
            >
              {tokenSymbols.map((symbol) => (
                <option key={symbol}>{symbol}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="quoteMeta">
          <span>Fee 10 bps</span>
          <span>Spread {quote?.quote.spreadBps ?? 20} bps</span>
          <span>{quote ? `Source ${sourceLabel}` : "Zero slippage quote"}</span>
          <span>{quote ? `Expires ${new Date(quote.quote.expiresAt).toLocaleTimeString()}` : ""}</span>
        </div>
        {quote?.quote.routePlan && (
          <div className="routePlan">
            {quote.quote.routePlan.map((leg) => (
              <div className="routeLeg" key={leg.leg}>
                <span>Leg {leg.leg}</span>
                <strong>
                  {leg.from} to {leg.to}
                </strong>
                <span>{leg.venue}</span>
                <span>
                  {leg.inputAmount} {leg.from} to {leg.outputAmount} {leg.to}
                </span>
                {leg.adapter && <span>{leg.adapter} {leg.feeTier ? `${leg.feeTier / 10_000}%` : ""}</span>}
              </div>
            ))}
          </div>
        )}
        {quote?.quote.bestAmmRoute && (
          <div className="routeMeta">
            <span>{quote.quote.bestAmmRoute.adapter}</span>
            <span>Fee tier {quote.quote.bestAmmRoute.feeTier / 10_000}%</span>
            <span>AMM out {quote.quote.bestAmmRoute.amountOut}</span>
          </div>
        )}

        <button disabled={isQuoting || Number(amount) <= 0} onClick={getQuote}>
          {isQuoting ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
          Get Quote
        </button>
        <button className="primary" disabled={!quote || !isConnected || isExecuting} onClick={executeSwap}>
          {isExecuting ? <Loader2 className="spin" size={18} /> : <ArrowDownUp size={18} />}
          Execute Swap
        </button>
        <button disabled={isScanning || Number(amount) <= 0} onClick={scanStableQuotes}>
          {isScanning ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
          Scan AMM Quotes
        </button>
        {stableQuotes.length > 0 && (
          <div className="quoteTable">
            {stableToUsdcSymbols.map((symbol) => {
              const row = stableQuotes.find((item) => item.inputSymbol === symbol);
              if (!row) return null;
              return (
                <div className="quoteRow" key={symbol}>
                  <span>{symbol}</span>
                  <span>{row.ok ? row.guaranteedOutput : "No route"}</span>
                  <span>{row.source === "amm" && row.route ? `${row.route.adapter} ${row.route.feeTier / 10_000}%` : row.reason}</span>
                </div>
              );
            })}
          </div>
        )}
        {status && <p className="status">{status}</p>}
      </section>
    </main>
  );
}
