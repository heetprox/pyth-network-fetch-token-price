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

}
