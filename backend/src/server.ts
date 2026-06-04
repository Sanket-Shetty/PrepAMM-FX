import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import winston from "winston";
import { config } from "./config";
import { buildQuote } from "./quote";
import { STABLE_TO_USDC_SYMBOLS } from "./tokens";

const logger = winston.createLogger({
  level: "info",
  transports: [new winston.transports.Console({ format: winston.format.simple() })]
});

const app = express();
app.use(cors());
app.use(express.json({ limit: "64kb" }));
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "prepamm-fx-quote-engine" });
});

app.post("/quote", async (req, res) => {
  try {
    const quote = await buildQuote(req.body);
    res.json(quote);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.warn(`quote failed: ${message}`);
    res.status(400).json({ error: message });
  }
});

app.post("/quotes/stable-to-usdc", async (req, res) => {
  const chainId = Number(req.body.chainId);
  const taker = String(req.body.taker || "0x000000000000000000000000000000000000dEaD");
  const inputAmount = String(req.body.inputAmount || "100");

  const rows = [];
  for (const symbol of STABLE_TO_USDC_SYMBOLS) {
    if (symbol === "USDC") {
      rows.push({
        inputSymbol: symbol,
        outputSymbol: "USDC",
        ok: true,
        source: "self",
        guaranteedOutput: inputAmount,
        route: null,
        reason: "Same asset"
      });
      continue;
    }

    try {
      const quote = await buildQuote({
        chainId,
        taker,
        inputSymbol: symbol,
        outputSymbol: "USDC",
        inputAmount,
        requireAmm: true
      });
      rows.push({
        inputSymbol: symbol,
        outputSymbol: "USDC",
        ok: true,
        source: quote.quote.source,
        guaranteedOutput: quote.quote.guaranteedOutput,
        benchmarkOutput: quote.quote.benchmarkOutput,
        route: quote.quote.bestAmmRoute,
        reason: null
      });
    } catch (error) {
      rows.push({
        inputSymbol: symbol,
        outputSymbol: "USDC",
        ok: false,
        source: "none",
        guaranteedOutput: null,
        benchmarkOutput: null,
        route: null,
        reason: error instanceof Error ? error.message : "Unknown error"
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 80));
  }

  res.json({ chainId, inputAmount, outputSymbol: "USDC", rows });
});

app.listen(config.port, () => {
  logger.info(`PrepAMM FX quoting engine listening on :${config.port}`);
});
