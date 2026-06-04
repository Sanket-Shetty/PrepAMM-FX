// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title PURe Stable Token
/// @notice Minimal mintable ERC20Permit token for testing PrepAMM FX RFQ and AMM liquidity flows.
/// @dev The owner should be a multisig or controlled minter in any non-test deployment.
contract PUReToken is ERC20, ERC20Permit, Ownable {
    uint256 public immutable maxSupply;

    event PUReMinted(address indexed to, uint256 amount);

    error MaxSupplyExceeded();

    constructor(address initialOwner, uint256 maxSupply_) ERC20("PrepAMM Pure Stable", "PURe") ERC20Permit("PrepAMM Pure Stable") Ownable(initialOwner) {
        maxSupply = maxSupply_;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        if (totalSupply() + amount > maxSupply) revert MaxSupplyExceeded();
        _mint(to, amount);
        emit PUReMinted(to, amount);
    }
}
