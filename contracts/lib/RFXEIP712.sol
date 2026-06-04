// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IRFXTypes} from "../IRFXTypes.sol";

/// @notice EIP-712 hashing helpers for PrepAMM FX RFQ orders.
abstract contract RFXEIP712 is EIP712, IRFXTypes {
    bytes32 public constant RFQ_ORDER_TYPEHASH = keccak256(
        "RFQOrder(address maker,address taker,address inputToken,address outputToken,uint256 inputAmount,uint256 outputAmount,uint256 expiry,uint256 nonce,uint256 chainId,uint256 feeBps)"
    );

    constructor() EIP712("PrepAMM FX RFQ", "1") {}

    function _hashOrder(RFQOrder calldata order) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                RFQ_ORDER_TYPEHASH,
                order.maker,
                order.taker,
                order.inputToken,
                order.outputToken,
                order.inputAmount,
                order.outputAmount,
                order.expiry,
                order.nonce,
                order.chainId,
                order.feeBps
            )
        );

        return _hashTypedDataV4(structHash);
    }
}
