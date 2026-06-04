export const rfxSettlementAbi = [
  {
    type: "function",
    name: "settleRFQ",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "order",
        type: "tuple",
        components: [
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
      },
      { name: "signature", type: "bytes" }
    ],
    outputs: []
  }
] as const;
