// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title PrepAMM FX Registry
/// @notice Stores token allowlists, trusted market-maker signers, treasury, and fee configuration.
/// @dev Slither: owner/admin powers are intentionally isolated behind DEFAULT_ADMIN_ROLE for multisig custody.
contract RFXRegistry is AccessControl, Pausable {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 public constant MAX_FEE_BPS = 100;
    uint256 public protocolFeeBps;
    address public treasury;

    mapping(address token => bool whitelisted) public whitelistedTokens;
    mapping(address signer => bool trusted) public trustedSigners;

    event TokenWhitelistUpdated(address indexed token, bool whitelisted);
    event TrustedSignerUpdated(address indexed signer, bool trusted);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event ProtocolFeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);

    error InvalidAddress();
    error FeeTooHigh();

    constructor(address admin, address initialTreasury, address initialSigner) {
        if (admin == address(0) || initialTreasury == address(0) || initialSigner == address(0)) {
            revert InvalidAddress();
        }

        treasury = initialTreasury;
        protocolFeeBps = 10;
        trustedSigners[initialSigner] = true;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);

        emit TreasuryUpdated(address(0), initialTreasury);
        emit ProtocolFeeUpdated(0, 10);
        emit TrustedSignerUpdated(initialSigner, true);
    }

    function setTokenWhitelisted(address token, bool whitelisted) external onlyRole(OPERATOR_ROLE) {
        if (token == address(0)) revert InvalidAddress();
        whitelistedTokens[token] = whitelisted;
        emit TokenWhitelistUpdated(token, whitelisted);
    }

    function setTrustedSigner(address signer, bool trusted) external onlyRole(OPERATOR_ROLE) {
        if (signer == address(0)) revert InvalidAddress();
        trustedSigners[signer] = trusted;
        emit TrustedSignerUpdated(signer, trusted);
    }

    function setTreasury(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newTreasury == address(0)) revert InvalidAddress();
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    function setProtocolFeeBps(uint256 newFeeBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh();
        emit ProtocolFeeUpdated(protocolFeeBps, newFeeBps);
        protocolFeeBps = newFeeBps;
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }
}
