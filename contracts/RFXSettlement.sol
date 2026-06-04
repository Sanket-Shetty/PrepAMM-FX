// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {RFXEIP712} from "./lib/RFXEIP712.sol";
import {RFXRegistry} from "./RFXRegistry.sol";

/// @title PrepAMM FX RFQ Settlement
/// @notice Executes firm signed RFQ orders between takers and a dedicated market maker.
/// @dev Slither: token transfers are protected by ReentrancyGuard and SafeERC20.
contract RFXSettlement is AccessControl, ReentrancyGuard, RFXEIP712 {
    using SafeERC20 for IERC20;

    bytes32 public constant RESCUER_ROLE = keccak256("RESCUER_ROLE");

    RFXRegistry public immutable registry;
    mapping(address taker => mapping(uint256 nonce => bool used)) public usedNonces;

    event RFQSettled(
        bytes32 indexed orderHash,
        address indexed maker,
        address indexed taker,
        address inputToken,
        address outputToken,
        uint256 inputAmount,
        uint256 outputAmount,
        uint256 feeAmount,
        uint256 nonce
    );
    event NonceCancelled(address indexed taker, uint256 indexed nonce);
    event EmergencyWithdraw(address indexed token, address indexed to, uint256 amount);

    error InvalidRegistry();
    error RegistryPaused();
    error InvalidTaker();
    error InvalidMaker();
    error InvalidChain();
    error InvalidFee();
    error OrderExpired();
    error NonceAlreadyUsed();
    error TokenNotWhitelisted();
    error InvalidSignature();
    error InvalidAmount();

    constructor(address admin, RFXRegistry registry_) {
        if (address(registry_) == address(0)) revert InvalidRegistry();
        registry = registry_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RESCUER_ROLE, admin);
    }

    /// @notice Settles a signed RFQ order. Taker pays inputToken; maker pays outputToken.
    /// @param order Firm quote signed by a trusted market-maker signer.
    /// @param signature EIP-712 signature over the RFQOrder.
    function settleRFQ(RFQOrder calldata order, bytes calldata signature) external nonReentrant {
        _settle(order, signature);
    }

    /// @notice Uses ERC20Permit before settlement to support gasless taker approval flows.
    function settleRFQWithPermit(
        RFQOrder calldata order,
        bytes calldata signature,
        uint256 permitDeadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        IERC20Permit(order.inputToken).permit(
            msg.sender,
            address(this),
            order.inputAmount,
            permitDeadline,
            v,
            r,
            s
        );
        _settle(order, signature);
    }

    /// @notice Allows a taker to invalidate an unused quote nonce before it is filled.
    function cancelNonce(uint256 nonce) external {
        usedNonces[msg.sender][nonce] = true;
        emit NonceCancelled(msg.sender, nonce);
    }

    /// @notice Rescue tokens accidentally sent to the contract. Intended for multisig use.
    function emergencyWithdraw(address token, address to, uint256 amount) external onlyRole(RESCUER_ROLE) {
        if (to == address(0)) revert InvalidTaker();
        IERC20(token).safeTransfer(to, amount);
        emit EmergencyWithdraw(token, to, amount);
    }

    function hashOrder(RFQOrder calldata order) external view returns (bytes32) {
        return _hashOrder(order);
    }

    function _settle(RFQOrder calldata order, bytes calldata signature) internal {
        if (registry.paused()) revert RegistryPaused();
        if (order.taker != msg.sender) revert InvalidTaker();
        if (order.maker == address(0)) revert InvalidMaker();
        if (order.chainId != block.chainid) revert InvalidChain();
        if (order.expiry < block.timestamp) revert OrderExpired();
        if (order.inputAmount == 0 || order.outputAmount == 0) revert InvalidAmount();
        if (order.feeBps != registry.protocolFeeBps()) revert InvalidFee();
        if (usedNonces[order.taker][order.nonce]) revert NonceAlreadyUsed();
        if (!registry.whitelistedTokens(order.inputToken) || !registry.whitelistedTokens(order.outputToken)) {
            revert TokenNotWhitelisted();
        }

        bytes32 orderHash = _hashOrder(order);
        address recovered = ECDSA.recover(orderHash, signature);
        if (recovered != order.maker || !registry.trustedSigners(recovered)) revert InvalidSignature();

        usedNonces[order.taker][order.nonce] = true;

        uint256 feeAmount = (order.inputAmount * order.feeBps) / 10_000;
        uint256 makerInputAmount = order.inputAmount - feeAmount;

        IERC20(order.inputToken).safeTransferFrom(order.taker, registry.treasury(), feeAmount);
        IERC20(order.inputToken).safeTransferFrom(order.taker, order.maker, makerInputAmount);
        IERC20(order.outputToken).safeTransferFrom(order.maker, order.taker, order.outputAmount);

        emit RFQSettled(
            orderHash,
            order.maker,
            order.taker,
            order.inputToken,
            order.outputToken,
            order.inputAmount,
            order.outputAmount,
            feeAmount,
            order.nonce
        );
    }
}
