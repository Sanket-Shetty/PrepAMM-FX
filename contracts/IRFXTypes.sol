// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Shared RFQ order type used by settlement, tests, and off-chain signers.
interface IRFXTypes {
    struct RFQOrder {
        address maker;
        address taker;
        address inputToken;
        address outputToken;
        uint256 inputAmount;
        uint256 outputAmount;
        uint256 expiry;
        uint256 nonce;
        uint256 chainId;
        uint256 feeBps;
    }
}
