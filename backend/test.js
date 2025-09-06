const { ethers } = require('ethers');

const ORACLE_ABI = [
    // --- Price Fetching ---
    "function getPriceFeedId(uint8 token) pure returns (bytes32)",
    "function getLatestPrice(uint8 token) view returns (tuple(int64 price, uint64 confidence, int32 expo, uint256 publishTime))",
    "function getLatestPriceWithUpdate(uint8 token, bytes[] priceUpdateData) payable returns (tuple(int64 price, uint64 confidence, int32 expo, uint256 publishTime))",
    "function getAllPrices() view returns ((int64,uint64,int32,uint256), (int64,uint64,int32,uint256), (int64,uint64,int32,uint256), (int64,uint64,int32,uint256))",
    "function getUSDValue(uint8 token, uint256 tokenAmount, uint8 decimals) view returns (uint256)",
    "function convertUSDToToken(uint256 usdAmount, uint8 targetToken, uint8 targetDecimals) view returns (uint256)",
    "function getReadablePrice(uint8 token) view returns (uint256 price, uint8 decimals)",
  
    // --- Expense Calculations ---
    "function calculateSplitInUSD(uint256 totalAmount, uint8 totalToken, uint8 totalDecimals, uint256 participants) view returns (tuple(uint256 totalAmount, uint8 token, uint8 decimals, uint256 participants, uint256 usdPerPerson))",
    "function calculatePaymentInToken(uint256 expenseAmount, uint8 expenseToken, uint8 expenseDecimals, uint256 participants, uint8 paymentToken, uint8 paymentDecimals) view returns (uint256)",
  
    // --- Token Info ---
    "function getTokenName(uint8 token) pure returns (string)",
    "function getTokenDecimals(uint8 token) pure returns (uint8)",
  
    // --- Price Freshness ---
    "function isPriceStale(uint8 token, uint256 maxAgeSeconds) view returns (bool)",
  
    // --- Pyth Update Helpers ---
    "function getUpdateFee(bytes[] priceUpdateData) view returns (uint256)",
    "function updatePriceFeeds(bytes[] priceUpdateData) payable",
  
    // --- Contract Management ---
    "function emergencyWithdraw()",
    "function getContractInfo() view returns (address pythAddress, address contractOwner, uint256 contractBalance)",
  
    // --- State Variables ---
    "function owner() view returns (address)",
    "function pyth() view returns (address)"
  ];
  

// Your deployed contract address
const ORACLE_ADDRESS = "0xYourDeployedContractAddress"; // UPDATE THIS!

// Base Sepolia provider
const provider = new ethers.providers.JsonRpcProvider("https://sepolia.base.org");
const contract = new ethers.Contract(ORACLE_ADDRESS, ORACLE_ABI, provider);

// Token enum
const Token = { ETH: 0, USDC: 1, USDT: 2, PYUSD: 3 };

class SplitWiseAPI {
    constructor() {
        this.contract = contract;
    }

    // Get human-readable price
    async getPrice(token) {
        try {
            const [price, decimals] = await this.contract.getReadablePrice(token);
            const humanPrice = parseFloat(price) / Math.pow(10, decimals);
            return { token: this.getTokenName(token), price: humanPrice, decimals };
        } catch (error) {
            console.error(`Error getting ${this.getTokenName(token)} price:`, error);
            throw error;
        }
    }

    // Get all prices at once
    async getAllPrices() {
        try {
            const prices = {};
            const tokens = ['ETH', 'USDC', 'USDT', 'PYUSD'];
            
            for (let i = 0; i < tokens.length; i++) {
                try {
                    const priceData = await this.getPrice(i);
                    prices[tokens[i]] = priceData.price;
                } catch (error) {
                    console.log(`${tokens[i]} price not available`);
                    prices[tokens[i]] = null;
                }
            }
            
            return prices;
        } catch (error) {
            console.error("Error getting all prices:", error);
            throw error;
        }
    }

    // Calculate expense split
    async calculateSplit(totalAmount, tokenType, participants) {
        try {
            const decimals = this.getTokenDecimals(tokenType);
            const amount = ethers.utils.parseUnits(totalAmount.toString(), decimals);
            
            const expenseData = await this.contract.calculateSplitInUSD(
                amount, tokenType, decimals, participants
            );
            
            // Convert USD per person to readable format
            const usdPerPerson = parseFloat(expenseData.usdPerPerson) / Math.pow(10, 8);
            
            return {
                totalAmount,
                tokenType: this.getTokenName(tokenType),
                participants,
                usdPerPerson: usdPerPerson.toFixed(2)
            };
        } catch (error) {
            console.error("Error calculating split:", error);
            throw error;
        }
    }

    // Calculate cross-currency payment
    async calculatePayment(expenseAmount, expenseToken, participants, paymentToken) {
        try {
            const expenseDecimals = this.getTokenDecimals(expenseToken);
            const paymentDecimals = this.getTokenDecimals(paymentToken);
            
            const amount = ethers.utils.parseUnits(expenseAmount.toString(), expenseDecimals);
            
            const paymentAmount = await this.contract.calculatePaymentInToken(
                amount, expenseToken, expenseDecimals, participants, paymentToken, paymentDecimals
            );
            
            const humanAmount = parseFloat(ethers.utils.formatUnits(paymentAmount, paymentDecimals));
            
            return {
                expenseAmount,
                expenseToken: this.getTokenName(expenseToken),
                paymentAmount: humanAmount.toFixed(6),
                paymentToken: this.getTokenName(paymentToken),
                participants
            };
        } catch (error) {
            console.error("Error calculating payment:", error);
            throw error;
        }
    }

    // Helper functions
    getTokenName(token) {
        const names = ['ETH', 'USDC', 'USDT', 'PYUSD'];
        return names[token] || 'UNKNOWN';
    }

    getTokenDecimals(token) {
        const decimals = [18, 6, 6, 6]; // ETH, USDC, USDT, PYUSD
        return decimals[token] || 18;
    }
}

// Usage examples
async function examples() {
    const api = new SplitWiseAPI();
    
    console.log("=== SplitWise API Examples ===\n");
    
    // 1. Get current prices
    console.log("1. Current Prices:");
    try {
        const prices = await api.getAllPrices();
        Object.entries(prices).forEach(([token, price]) => {
            if (price !== null) {
                console.log(`   ${token}: ${price.toFixed(2)}`);
            }
        });
    } catch (error) {
        console.log("   Failed to get prices");
    }
    
    // 2. Calculate expense split
    console.log("\n2. Expense Split:");
    try {
        const split = await api.calculateSplit(100, Token.USDC, 4);
        console.log(`   Expense: ${split.totalAmount} ${split.tokenType}`);
        console.log(`   Participants: ${split.participants}`);
        console.log(`   Each person owes: ${split.usdPerPerson}`);
    } catch (error) {
        console.log("   Failed to calculate split");
    }
    
    // 3. Cross-currency payment
    console.log("\n3. Cross-Currency Payment:");
    try {
        const payment = await api.calculatePayment(1, Token.ETH, 2, Token.USDC);
        console.log(`   Expense: ${payment.expenseAmount} ${payment.expenseToken}`);
        console.log(`   Split between: ${payment.participants} people`);
        console.log(`   Each pays: ${payment.paymentAmount} ${payment.paymentToken}`);
    } catch (error) {
        console.log("   Failed to calculate payment");
    }
}

// Run examples
if (require.main === module) {
    examples().catch(console.error);
}

module.exports = { SplitWiseAPI, Token };