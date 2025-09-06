# Token Price Fetching from Pyth Network

A decentralized price oracle system built on Base Sepolia that fetches cryptocurrency prices from Pyth Network. This project enables fair expense splitting in multiple currencies by providing accurate price conversion between different tokens.

![USDT USDC PYUSD ETH](https://img.shields.io/badge/USDT-USDC-PYUSD-ETH-blue)
![Base Sepolia](https://img.shields.io/badge/Network-Base%20Sepolia-blue)
![Pyth Network](https://img.shields.io/badge/Oracle-Pyth%20Network-orange)

## Overview

Token Price Fetching:

- Fetches real-time cryptocurrency prices from Pyth Network
- Supports ETH, USDC, USDT, and PYUSD tokens
- Enables fair expense splitting in multiple currencies
- Provides USD value conversion for different tokens
- Calculates per-person payment amounts in any supported token

## Project Structure

```
├── backend/                # Node.js backend for price updates
│   ├── price_fetch.js      # Main price fetching logic
│   ├── test-contract.js    # Contract testing utility
│   └── package.json        # Backend dependencies
├── src/                    # Solidity smart contracts
│   └── PriceFetch.sol      # Main oracle contract
├── script/                 # Deployment scripts
│   ├── Deploy.s.sol        # Contract deployment
│   └── Interact.s.sol      # Contract interaction
└── lib/                    # Dependencies
    ├── forge-std/          # Foundry standard library
    └── pyth-sdk-solidity/  # Pyth Network SDK
```

## Smart Contract Features

- **Price Fetching**: Get latest prices for ETH, USDC, USDT, and PYUSD
- **USD Conversion**: Convert token amounts to USD value
- **Expense Splitting**: Calculate fair splits in USD for expense sharing
- **Token Conversion**: Convert USD amounts to specific token amounts
- **Payment Calculation**: Calculate how much each participant should pay in their preferred token

## Backend Features

- **Price Updates**: Update on-chain prices from Pyth Network
- **Price Monitoring**: Display current prices with confidence intervals
- **Automated Updates**: Batch update all token prices efficiently

## Prerequisites

- Node.js and npm/bun
- Foundry (for smart contract deployment)
- Base Sepolia RPC endpoint
- Private key with Base Sepolia ETH

## Installation

### Smart Contract

1. Clone the repository
   ```bash
   git clone https://github.com/yourusername/splitwise-oracle.git
   cd splitwise-oracle
   ```

2. Install Foundry dependencies
   ```bash
   forge install
   ```

3. Create a `.env` file with your private key
   ```
   PRIVATE_KEY=your_private_key_here
   BASESCAN_API_KEY=your_basescan_api_key_here
   ```

4. Deploy the contract
   ```bash
   forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --verify
   ```

### Backend

1. Navigate to the backend directory
   ```bash
   cd backend
   ```

2. Install dependencies
   ```bash
   npm install
   # or
   bun install
   ```

3. Create a `.env` file with your private key
   ```
   PRIVATE_KEY=your_private_key_here
   ```

4. Run the price fetcher
   ```bash
   npm start
   # or
   bun start
   ```

## Usage

### Smart Contract

The `PriceFetch.sol` contract provides these main functions:

```solidity
// Get latest price for a token
function getLatestPrice(Token token) public view returns (PriceData memory);

// Get USD value of a token amount
function getUSDValue(Token token, uint256 tokenAmount, uint8 decimals) public view returns (uint256);

// Calculate fair split amounts in USD
function calculateSplitInUSD(uint256 totalAmount, Token totalToken, uint8 totalDecimals, uint256 participants) external view returns (ExpenseData memory);

// Convert USD amount to specific token amount
function convertUSDToToken(uint256 usdAmount, Token targetToken, uint8 targetDecimals) external view returns (uint256);

// Calculate payment in preferred token
function calculatePaymentInToken(uint256 expenseAmount, Token expenseToken, uint8 expenseDecimals, uint256 participants, Token paymentToken, uint8 paymentDecimals) external view returns (uint256);
```

### Backend

The `price_fetch.js` script provides a `PriceFetchOracle` class with these main methods:

```javascript
// Initialize the oracle
await oracle.initialize();

// Update all prices
await oracle.updateAllPrices();

// Get all token prices
const prices = await oracle.getAllTokenPrices();

// Display prices in a formatted table
oracle.displayPrices(prices);
```

## Example Output

When running the backend, you'll see output like this:

```
🔄 Step 1: Updating all prices...                                                                                             
📊 Updating all prices in batch...                                                                                            
🌐 Fetching Beta price updates from Pyth Hermes...                                                                            
✅ Got 1 Beta price updates from Hermes                                                                                       
💰 Total update fee: 0.00000000000000004 ETH                                                                                  
🚀 Transaction sent: 0x83826c5ef0e19dfef319ad5b10abd0a46ea33e56109033d2a8eaa45d27fae295                                       
✅ All prices updated successfully! Block: 30716110                                                                           
⏳ Waiting for prices to settle...                                                                                            
                                                                                                                              
🔄 Step 2: Fetching updated prices...                                                                                         
                                                                                                                              
📊 Fetching all cached token prices...                                                                                        
📈 Fetching ETH price (cached)...                                                                                             
📈 Fetching USDC price (cached)...                                                                                            
📈 Fetching USDT price (cached)...                                                                                            
📈 Fetching PYUSD price (cached)...                                                                                           
                                                                                                                              
=====================================================================================                                         
📊 TOKEN PRICES (BETA FEEDS)                                                                                                  
=====================================================================================                                         
Token    | Price (USD)       | Confidence       | Last Updated                                                                
-------------------------------------------------------------------------------------                                         
ETH      | $4280.177519      | ±1.641355        | 0m ago                                                                      
USDC     | $0.999904         | ±0.000640        | 0m ago                                                                      
USDT     | $1.000257         | ±0.000635        | 0m ago                                                                      
PYUSD    | $1.001007         | ±0.000595        | 0m ago                                                                      
=====================================================================================                                         
                                                                                                                              
📈 Status: 4/4 prices available                                                                                               
                                                                                                                              
🎉 SUCCESS! Price data is now available:                                                                                      
  ETH: $4280.177519 (updated 0m ago)                                                                                          
  USDC: $0.999904 (updated 0m ago)                                                                                            
  USDT: $1.000257 (updated 0m ago)                                                                                            
  PYUSD: $1.001007 (updated 0m ago)                                                                                           
                                                                                                                              
✅ Process completed!
```

## Use Cases

1. **Expense Splitting**: Split expenses fairly when participants use different currencies
2. **Price Monitoring**: Monitor cryptocurrency prices on Base Sepolia
3. **Currency Conversion**: Convert between different tokens at current market rates
4. **DeFi Applications**: Use as a price oracle for other DeFi applications

## License

MIT

## Acknowledgements

- [Pyth Network](https://pyth.network/) for providing price feeds
- [Base](https://base.org/) for the Sepolia testnet
- [Foundry](https://book.getfoundry.sh/) for smart contract development tools