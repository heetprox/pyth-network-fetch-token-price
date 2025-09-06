// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/PriceFetch.sol";

contract DeployScript is Script {
    
    // Base Sepolia Pyth Network contract address
    address constant PYTH_SEPOLIA = 0xA2aa501b19aff244D90cc15a4Cf739D2725B5729;
    
    function run() external {
        // Load deployer private key from .env
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("=== Base Sepolia Deployment ===");
        console.log("Deployer address:", deployer);
        console.log("Deployer balance:", deployer.balance);
        console.log("Pyth contract:", PYTH_SEPOLIA);
        
        // Start broadcasting transactions
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy the contract
        PriceFetch oracle = new PriceFetch(PYTH_SEPOLIA);
        
        console.log(" PriceFetch Oracle deployed at:", address(oracle));
        console.log(" Verify on BaseScan:", "https://sepolia.basescan.org/address/%s", address(oracle));
        
        // Test basic functionality
        console.log("\n=== Testing Basic Functions ===");
        
        // Test get ETH price
        try oracle.getLatestPrice(PriceFetch.Token.ETH) returns (
            PriceFetch.PriceData memory priceData
        ) {
            console.log("ETH Price (raw):", uint256(int256(priceData.price)));
            console.log("ETH Price expo:", int256(priceData.expo));
            console.log("ETH Publish time:", priceData.publishTime);
        } catch {
            console.log("Failed to get ETH price");
        }
        
        // Test USD conversion
        try oracle.getUSDValue(
            PriceFetch.Token.ETH,
            1 ether,  // 1 ETH
            18        // ETH decimals
        ) returns (uint256 usdValue) {
            console.log("1 ETH = $%s (8 decimals)", usdValue);
        } catch {
            console.log("Failed to convert ETH to USD");
        }
        
        vm.stopBroadcast();
        
        console.log("\n=== Deployment Complete ===");
        console.log("Contract Address:", address(oracle));
        console.log("Next steps:");
        console.log("1. Verify contract: forge verify-contract --chain base-sepolia %s src/PriceFetch.sol:PriceFetch", address(oracle));
        console.log("2. Test with script: forge script script/Interact.s.sol --rpc-url base_sepolia");
    }
}