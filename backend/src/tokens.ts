export type TokenSymbol =
  | "EURe"
  | "EURC"
  | "EURS"
  | "EURT"
  | "GBPe"
  | "GBPT"
  | "USDC"
  | "USDT"
  | "USDP"
  | "PYUSD"
  | "USDY"
  | "CADC"
  | "QCAD"
  | "AUDD"
  | "A$DC"
  | "NZDS"
  | "CHFX"
  | "XSGD"
  | "JPYC"
  | "TRYB"
  | "BRZ"
  | "MXNT"
  | "DAI"
  | "WETH"
  | "WBTC";

export interface TokenInfo {
  symbol: TokenSymbol;
  decimals: number;
  coingeckoId: string;
  cmcSymbol: string;
  binanceSymbol?: string;
  addresses: Record<number, string>;
}

export const STABLE_TO_USDC_SYMBOLS: TokenSymbol[] = [
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
];

const chainEnvSuffixes: Record<number, string> = {
  1: "1",
  42161: "42161",
  8453: "8453",
  84532: "84532",
  137: "137",
  10: "10"
};

function envAddress(symbol: TokenSymbol, chainId: number): string {
  const suffix = chainEnvSuffixes[chainId];
  const normalizedSymbol = symbol.replace("$", "DOLLAR").toUpperCase();
  return suffix ? process.env[`${normalizedSymbol}_ADDRESS_${suffix}`] || "" : "";
}

function addresses(symbol: TokenSymbol, known: Record<number, string> = {}): Record<number, string> {
  return {
    1: envAddress(symbol, 1) || known[1] || "",
    42161: envAddress(symbol, 42161) || known[42161] || "",
    8453: envAddress(symbol, 8453) || known[8453] || "",
    84532: envAddress(symbol, 84532) || known[84532] || "",
    137: envAddress(symbol, 137) || known[137] || "",
    10: envAddress(symbol, 10) || known[10] || ""
  };
}

export const TOKENS: Record<TokenSymbol, TokenInfo> = {
  EURe: {
    symbol: "EURe",
    decimals: 18,
    coingeckoId: "monerium-eur-money",
    cmcSymbol: "EURE",
    addresses: addresses("EURe", {
      1: "0x3231cb76718cdef2155fc47b5286d82e6eda273f",
      137: "0x7ca71070b31d1b0f35977c5fdf90861f68c3b68f"
    })
  },
  EURC: {
    symbol: "EURC",
    decimals: 6,
    coingeckoId: "euro-coin",
    cmcSymbol: "EURC",
    addresses: addresses("EURC", {
      1: "0x1abaea1f7c830bd89acc67ec4af516284b1bc33c",
      8453: "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42"
    })
  },
  EURS: {
    symbol: "EURS",
    decimals: 2,
    coingeckoId: "stasis-eurs",
    cmcSymbol: "EURS",
    addresses: addresses("EURS", {
      1: "0xdb25f211ab05b1c97d595516f45794528a807ad8",
      137: "0xe111178a87a3bff0c8d18decba5798827539ae99"
    })
  },
  EURT: {
    symbol: "EURT",
    decimals: 6,
    coingeckoId: "tether-eurt",
    cmcSymbol: "EURT",
    addresses: addresses("EURT", {
      1: "0xc581b735a1688071a1746c968e0798d642ede491"
    })
  },
  GBPe: {
    symbol: "GBPe",
    decimals: 18,
    coingeckoId: "monerium-gbp-money",
    cmcSymbol: "GBPE",
    addresses: addresses("GBPe")
  },
  GBPT: {
    symbol: "GBPT",
    decimals: 18,
    coingeckoId: "poundtoken",
    cmcSymbol: "GBPT",
    addresses: addresses("GBPT")
  },
  USDC: {
    symbol: "USDC",
    decimals: 6,
    coingeckoId: "usd-coin",
    cmcSymbol: "USDC",
    binanceSymbol: "USDCUSDT",
    addresses: addresses("USDC", {
      1: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      42161: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
      8453: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      84532: "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
      137: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
      10: "0x0b2c639c533813f4aa9d7837caf62653d097ff85"
    })
  },
  USDT: {
    symbol: "USDT",
    decimals: 6,
    coingeckoId: "tether",
    cmcSymbol: "USDT",
    addresses: addresses("USDT", {
      1: "0xdac17f958d2ee523a2206206994597c13d831ec7",
      42161: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
      137: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
      10: "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58"
    })
  },
  USDP: {
    symbol: "USDP",
    decimals: 18,
    coingeckoId: "paxos-standard",
    cmcSymbol: "USDP",
    addresses: addresses("USDP", {
      1: "0x8e870d67f660d95d5be530380d0ec0bd388289e1"
    })
  },
  PYUSD: {
    symbol: "PYUSD",
    decimals: 6,
    coingeckoId: "paypal-usd",
    cmcSymbol: "PYUSD",
    addresses: addresses("PYUSD", {
      1: "0x6c3ea9036406852006290770bedfcaba0e23a0e8"
    })
  },
  USDY: {
    symbol: "USDY",
    decimals: 18,
    coingeckoId: "ondo-us-dollar-yield",
    cmcSymbol: "USDY",
    addresses: addresses("USDY", {
      1: "0x96f6ef951840721adbf46ac996b59e0235cb985c"
    })
  },
  CADC: {
    symbol: "CADC",
    decimals: 18,
    coingeckoId: "cad-coin",
    cmcSymbol: "CADC",
    addresses: addresses("CADC")
  },
  QCAD: {
    symbol: "QCAD",
    decimals: 2,
    coingeckoId: "qcad",
    cmcSymbol: "QCAD",
    addresses: addresses("QCAD")
  },
  AUDD: {
    symbol: "AUDD",
    decimals: 6,
    coingeckoId: "audd",
    cmcSymbol: "AUDD",
    addresses: addresses("AUDD")
  },
  "A$DC": {
    symbol: "A$DC",
    decimals: 6,
    coingeckoId: "australian-digital-dollar",
    cmcSymbol: "A$DC",
    addresses: addresses("A$DC")
  },
  NZDS: {
    symbol: "NZDS",
    decimals: 6,
    coingeckoId: "nzd-stablecoin",
    cmcSymbol: "NZDS",
    addresses: addresses("NZDS")
  },
  CHFX: {
    symbol: "CHFX",
    decimals: 18,
    coingeckoId: "chfx",
    cmcSymbol: "CHFX",
    addresses: addresses("CHFX")
  },
  XSGD: {
    symbol: "XSGD",
    decimals: 6,
    coingeckoId: "xsgd",
    cmcSymbol: "XSGD",
    addresses: addresses("XSGD", {
      1: "0x70e8de73ce538da2beed35d14187f6959a8eca96",
      137: "0xdc3326e71d45186f113a2f448984ca0e8d201995"
    })
  },
  JPYC: {
    symbol: "JPYC",
    decimals: 18,
    coingeckoId: "jpy-coin",
    cmcSymbol: "JPYC",
    addresses: addresses("JPYC", {
      1: "0x431d5dff03120afa4bdf332c61a6e1766ef37bdb"
    })
  },
  TRYB: {
    symbol: "TRYB",
    decimals: 6,
    coingeckoId: "bilira",
    cmcSymbol: "TRYB",
    addresses: addresses("TRYB")
  },
  BRZ: {
    symbol: "BRZ",
    decimals: 4,
    coingeckoId: "brz",
    cmcSymbol: "BRZ",
    addresses: addresses("BRZ", {
      1: "0x420412e765bfa6d85aaaC94b4f7b708c89be2e2b"
    })
  },
  MXNT: {
    symbol: "MXNT",
    decimals: 6,
    coingeckoId: "mexican-peso-tether",
    cmcSymbol: "MXNT",
    addresses: addresses("MXNT")
  },
  DAI: {
    symbol: "DAI",
    decimals: 18,
    coingeckoId: "dai",
    cmcSymbol: "DAI",
    addresses: addresses("DAI", {
      1: "0x6b175474e89094c44da98b954eedeac495271d0f",
      42161: "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1",
      8453: "0x50c5725949a6f0c72e6c4a641f24049a917db0cb",
      137: "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063",
      10: "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1"
    })
  },
  WETH: {
    symbol: "WETH",
    decimals: 18,
    coingeckoId: "weth",
    cmcSymbol: "WETH",
    binanceSymbol: "ETHUSDT",
    addresses: addresses("WETH", {
      1: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
      42161: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
      8453: "0x4200000000000000000000000000000000000006",
      137: "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
      10: "0x4200000000000000000000000000000000000006"
    })
  },
  WBTC: {
    symbol: "WBTC",
    decimals: 8,
    coingeckoId: "wrapped-bitcoin",
    cmcSymbol: "WBTC",
    binanceSymbol: "BTCUSDT",
    addresses: addresses("WBTC", {
      1: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
      42161: "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f",
      8453: "0x0555e30da8f98308edb960aa94c0dbc2c9ccddbf",
      137: "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6",
      10: "0x68f180fcce6836688e9084f035309e29bf0a2095"
    })
  }
};
