// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {IPyth} from "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import {PythStructs} from "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

interface IENS {
    function resolver(bytes32 node) external view returns (address);
}

interface IResolver {
    function addr(bytes32 node) external view returns (address);
}

contract PriceFetch {
    IPyth public immutable pyth;

    IENS public immutable ens;

    // Base Mainnet Pyth Contract: 0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a
    // Base Mainnet ENS Registry: 0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e (same as ETH Mainnet)

    // Price Feed IDs for Base Mainnet.
    bytes32 public constant ETH_USD_PRICE_ID =
        0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace;
    bytes32 public constant USDC_USD_PRICE_ID =
        0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a;
    bytes32 public constant USDT_USD_PRICE_ID =
        0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b;
    bytes32 public constant PYUSD_USD_PRICE_ID =
        0x6ec879b1e9963de5ee97e9c8710b742d6228252a5e2ca12d4ae81d7fe5ee8c5d;
}
