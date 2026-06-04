# PrepAMM FX

PrepAMM FX is a capital-efficient RFQ settlement foundation for fiat-backed stablecoins such as EURe. Instead of deploying liquidity pools for every route on every chain, a dedicated market maker signs firm quotes and the `RFXSettlement` contract atomically settles the taker and maker token transfers.

## Architecture

- `contracts/RFXRegistry.sol` owns token whitelists, trusted market-maker signers, treasury, fee configuration, and pause control.
- `contracts/RFXSettlement.sol` verifies EIP-712 RFQ orders, validates nonce, expiry, chain ID, token whitelist, and the 10 bps protocol fee, then routes settlement transfers.
- `backend/` exposes `POST /quote`, prices pairs through CoinGecko with CoinMarketCap and Binance fallbacks, applies market-maker spread, applies the protocol fee field, and signs RFQ orders with the MM key.
- `frontend/` is a Vite React dApp using wagmi and viem for wallet connection, quote retrieval, and `settleRFQ` execution.

Supported v1 chains: Ethereum Mainnet, Arbitrum, Base, Base Sepolia, Polygon, and Optimism.

## Local Setup

```bash
cd prepamm-fx
npm install
npm run compile
npm test
```

Backend:

```bash
cp backend/.env.example backend/.env
npm run backend:dev
```

Frontend:

```bash
cp frontend/.env.example frontend/.env
npm run frontend:dev
```

## Quote Flow

1. The taker connects a wallet in the dApp and requests a quote.
2. The backend first attempts on-chain AMM quote discovery through configured quoter contracts.
3. If AMM liquidity exists, the best AMM output becomes the RFQ benchmark. If AMM quoting is unavailable, the backend falls back to reference prices.
4. The backend applies market-maker spread, sets `feeBps` to `10`, and signs the `RFQOrder`.
5. The dApp displays guaranteed output, quote source, AMM route metadata when present, and quote expiry.
6. The taker approves the settlement contract for `inputToken` or uses `settleRFQWithPermit`.
7. The dApp calls `settleRFQ(order, signature)`.
8. The settlement contract transfers the protocol fee to treasury, net input to maker, and guaranteed output from maker to taker.

## AMM Liquidity Pipeline

The quoting engine is structured for RFQ quotes that are benchmarked against executable AMM liquidity:

```text
User request -> token metadata -> AMM quoter adapters -> best route -> MM spread -> signed RFQ
                                      |
                                      +-> fallback to CoinGecko/CMC/Binance reference prices
```

The AMM layer now fans out across multiple quote sources and chooses the highest executable output:

- `uniswap-v3`: V3 `QuoterV2` fee-tier quotes.
- `pancakeswap-v3`: PancakeSwap V3-compatible quoter quotes.
- `aerodrome`: Base router quotes for volatile and stable routes.
- `alienbase`: Base router quote support when `ALIENBASE_ROUTER_8453` is configured.
- `openocean`: Aggregator quote API fallback alongside direct on-chain router calls.

Set the chain RPC and adapter addresses to enable route discovery:

```bash
BASE_RPC_URL=https://mainnet.base.org
UNISWAP_V3_QUOTER_8453=0xQuoterV2OnBase
PANCAKESWAP_V3_QUOTER_8453=0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997
AERODROME_ROUTER_8453=0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43
ALIENBASE_ROUTER_8453=0xAlienBaseRouterOnBase
OPENOCEAN_ENABLED=true
OPENOCEAN_CHAIN_8453=base
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
UNISWAP_V3_QUOTER_84532=0xC5290058841028F1614F3A6F0F5816cAd0df5E27
```

For each quote, the backend tries common V3 fee tiers: `0.01%`, `0.05%`, `0.3%`, and `1%`, plus configured router/API adapters. It chooses the route with the highest output, then applies the RFQ spread before signing the order. If no pool exists, no liquidity is available, the quoter is not configured, or the RPC/API fails, the response falls back to reference-price mode and the frontend shows `Source Price API`.

For PURe specifically, deploying and minting the token is not enough. AMM quotes will only show `Source AMM` after a funded PURe/USDC pool exists on the target chain and the corresponding quoter/RPC env values are configured.

## API

`POST /quote`

```json
{
  "chainId": 137,
  "taker": "0xTaker",
  "inputSymbol": "EURe",
  "outputSymbol": "USDC",
  "inputAmount": "100"
}
```

Response includes `order`, `signature`, settlement address, guaranteed output, spread, protocol fee, and expiry.

## Deployment

Set root `.env` values:

```bash
DEPLOYER_PRIVATE_KEY=0x...
ADMIN_ADDRESS=0xMultisig
TREASURY_ADDRESS=0xTreasury
MM_SIGNER_ADDRESS=0xMarketMaker
ETHEREUM_RPC_URL=https://...
ARBITRUM_RPC_URL=https://...
BASE_RPC_URL=https://...
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
POLYGON_RPC_URL=https://...
OPTIMISM_RPC_URL=https://...
```

Deploy per chain:

```bash
npx hardhat run scripts/deploy.ts --network polygon
```

After deployment, whitelist concrete token addresses with `setTokenWhitelisted`, configure frontend `VITE_SETTLEMENT_ADDRESS_*`, and configure backend `SETTLEMENT_ADDRESS_*`.

## Deploy PURe Test Stablecoin

`PUReToken` is a mintable ERC20Permit test stablecoin intended for RFQ and AMM experiments.

```bash
PURE_MINT_TO=0xYourWallet \
PURE_MINT_AMOUNT=100 \
npx hardhat run scripts/deploy-pure.ts --network base
```

The script deploys `PUReToken` and mints `100 PURe` by default. After deployment, set the matching backend env value, for example:

```bash
PURE_ADDRESS_8453=0xDeployedPUReOnBase
```

Creating PURe does not automatically create AMM liquidity. To test AMM swaps into USDC, create and fund a pool on the target AMM, for example PURe/USDC on Uniswap, Aerodrome, or QuickSwap depending on the chain. Without a funded pool, aggregators and routers will report no route even though the token exists.

## Stablecoin Issuer Integration

Issuers such as Monerium can integrate by:

- Asking the protocol admin multisig to whitelist their token address on supported chains.
- Supplying canonical token metadata, chain deployments, and risk limits to the market maker.
- Running their own quote consumer against `POST /quote`, or embedding the frontend flow.
- Indexing `RFQSettled` events through TheGraph for settlement reporting and reconciliation.

No issuer liquidity pool is required. The market maker inventories the relevant assets and signs quotes only when it is willing to settle.

## Adding Tokens

1. Add token metadata and chain addresses in `backend/src/tokens.ts`.
2. Add the symbol in `frontend/src/lib/tokens.ts`.
3. Whitelist the token in `RFXRegistry` on each target chain.
4. Ensure the market maker has inventory and allowance for output tokens.
5. Add route-specific risk controls or spread overrides in the backend before production launch.

## Security Notes

- EIP-712 domain binds quotes to the settlement contract and chain.
- Nonces are scoped by taker and cannot be replayed.
- Quotes expire on-chain.
- Signatures are recovered through OpenZeppelin `ECDSA`, rejecting malleable signatures.
- Token movement uses OpenZeppelin `SafeERC20` and `ReentrancyGuard`.
- Pausing and emergency withdrawal are admin-gated and should be held by a multisig.
- Fork tests should be added per deployment using canonical token contracts and live allowances before mainnet release.

## Production Hardening Checklist

- Add per-pair inventory limits, quote size bounds, and volatility-aware spreads.
- Move rate limiting/cache to Redis for horizontally scaled quote servers.
- Add market-maker hot key rotation and HSM/KMS signing.
- Add chain-specific token address verification and monitoring.
- Add TheGraph subgraph and operational dashboards.
- Run Slither, Mythril, Echidna/fuzzing, and independent audit before custodying material value.
