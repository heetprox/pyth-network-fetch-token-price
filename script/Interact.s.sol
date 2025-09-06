// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/PriceFetch.sol";

contract InteractScript is Script {
    
    // Replace with your deployed contract address
    address constant ORACLE_ADDRESS = 0x0000000000000000000000000000000000000000; // UPDATE THIS!
    
    function run() external {
        // Load private key
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        
        vm.startBroadcast(privateKey);
        
        PriceFetch oracle = PriceFetch(payable(ORACLE_ADDRESS));
        
        console.log("=== PriceFetch Oracle Testing ===");
        console.log("Oracle address:", address(oracle));
        
        // Test 1: Get all prices
        console.log("\n1. Getting all token prices...");
        
        string[4] memory tokens = ["ETH", "USDC", "USDT", "PYUSD"];
        
        for (uint i = 0; i < 4; i++) {
            try oracle.getLatestPrice(PriceFetch.Token(i)) returns (
                PriceFetch.PriceData memory price
            ) {
                // Convert to readable format
                (uint256 readablePrice, uint8 decimals) = oracle.getReadablePrice(PriceFetch.Token(i));
                console.log("%s/USD: %s (decimals: %d)", tokens[i], readablePrice, decimals);
            } catch {
                console.log("%s: Price not available", tokens[i]);
            }
        }
        
        // Test 2: Calculate expense split
        console.log("\n2. Testing expense split calculation...");
        
        try oracle.calculateSplitInUSD(
            100 * 10**6,  // $100 USDC (6 decimals)
            PriceFetch.Token.USDC,
            6,            // USDC decimals
            4             // 4 people
        ) returns (PriceFetch.ExpenseData memory expense) {
            console.log("Total expense: $100 USDC");
            console.log("Participants: 4");
            console.log("Each person owes: $%s (8 decimals)", expense.usdPerPerson);
            console.log("Each person owes: $%s.%s", expense.usdPerPerson / 10**8, (expense.usdPerPerson % 10**8) / 10**6);
        } catch {
            console.log("Failed to calculate expense split");
        }
        
        // Test 3: Cross-currency payment
        console.log("\n3. Testing cross-currency payment...");
        
        try oracle.calculatePaymentInToken(
            1 ether,      // 1 ETH expense
            PriceFetch.Token.ETH,
            18,           // ETH decimals
            2,            // 2 people
            PriceFetch.Token.USDC,
            6             // USDC decimals
        ) returns (uint256 usdcAmount) {
            console.log("Expense: 1 ETH split between 2 people");
            console.log("Each person pays: %s USDC", usdcAmount);
            console.log("Each person pays: $%s.%s USDC", usdcAmount / 10**6, (usdcAmount % 10**6) / 10**4);
        } catch {
            console.log("Failed to calculate cross-currency payment");
        }
        
        // Test 4: Check price staleness
        console.log("\n4. Checking price freshness...");
        
        try oracle.isPriceStale(PriceFetch.Token.ETH, 300) returns (bool isStale) {
            console.log("ETH price is stale (>5min): %s", isStale ? "Yes" : "No");
        } catch {
            console.log("Failed to check price staleness");
        }
        
        vm.stopBroadcast();
        
        console.log("\n=== Testing Complete ===");
    }
}