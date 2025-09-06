const { ethers } = require('ethers');
require('dotenv').config();

const ORACLE_ADDRESS = "0x8D2eCC24E56FDD0a6f501E4b68CE92180224d654";
const BASE_SEPOLIA_RPC = "https://sepolia.base.org"; 

const TOKEN_ENUM = {
    ETH: 0,
    USDC: 1,
    USDT: 2,
    PYUSD: 3
};

const TOKEN_NAMES = ['ETH', 'USDC', 'USDT', 'PYUSD'];

// Contract ABI
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

class PriceFetchOracle {
    constructor() {
        this.provider = null;
        this.contract = null;
        this.wallet = null;
    }

    async initialize() {
        try {
            console.log('🔗 Connecting to Base Sepolia...');
            
            // Initialize provider
            this.provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC);
            
            // Test connection
            const network = await this.provider.getNetwork();
            console.log(`✅ Connected to network: ${network.name} (Chain ID: ${network.chainId})`);
            
            // Initialize contract (read-only)
            this.contract = new ethers.Contract(ORACLE_ADDRESS, ORACLE_ABI, this.provider);
            
            // If private key is provided, create wallet for write operations
            if (process.env.PRIVATE_KEY) {
                this.wallet = new ethers.Wallet(process.env.PRIVATE_KEY, this.provider);
                console.log(`🔑 Wallet loaded: ${this.wallet.address}`);
            }
            
            console.log(`📄 Contract loaded at: ${ORACLE_ADDRESS}`);
            
        } catch (error) {
            console.error('❌ Initialization failed:', error.message);
            throw error;
        }
    }

    // Helper function to format prices
    formatPrice(priceData) {
        const { price, confidence, expo, publishTime } = priceData;
        
        // Convert BigInt to regular numbers for calculations
        const priceNum = Number(price);
        const expoNum = Number(expo);
        
        // Calculate actual price (price * 10^expo)
        const actualPrice = priceNum * Math.pow(10, expoNum);
        
        // Format publish time
        const publishDate = new Date(Number(publishTime) * 1000);
        
        return {
            rawPrice: priceNum,
            actualPrice: actualPrice,
            confidence: Number(confidence),
            expo: expoNum,
            publishTime: Number(publishTime),
            publishDate: publishDate.toISOString(),
            formatted: `$${actualPrice.toFixed(6)}`
        };
    }

    // Get all token prices using the getAllPrices function
    async getAllTokenPrices() {
        try {
            console.log('\n📊 Fetching all token prices...');
            
            const result = await this.contract.getAllPrices();
            const [ethPrice, usdcPrice, usdtPrice, pyusdPrice] = result;
            
            const prices = {
                ETH: this.formatPrice(ethPrice),
                USDC: this.formatPrice(usdcPrice),
                USDT: this.formatPrice(usdtPrice),
                PYUSD: this.formatPrice(pyusdPrice)
            };
            
            return prices;
            
        } catch (error) {
            console.error('❌ Failed to fetch all prices:', error.message);
            throw error;
        }
    }

    // Get individual token price
    async getTokenPrice(tokenName) {
        try {
            const tokenEnum = TOKEN_ENUM[tokenName.toUpperCase()];
            if (tokenEnum === undefined) {
                throw new Error(`Unsupported token: ${tokenName}`);
            }

            console.log(`📈 Fetching ${tokenName} price...`);
            
            const priceData = await this.contract.getLatestPrice(tokenEnum);
            return this.formatPrice(priceData);
            
        } catch (error) {
            console.error(`❌ Failed to fetch ${tokenName} price:`, error.message);
            throw error;
        }
    }

    // Get readable price (human-friendly format)
    async getReadablePrice(tokenName) {
        try {
            const tokenEnum = TOKEN_ENUM[tokenName.toUpperCase()];
            if (tokenEnum === undefined) {
                throw new Error(`Unsupported token: ${tokenName}`);
            }

            const [price, decimals] = await this.contract.getReadablePrice(tokenEnum);
            
            const actualPrice = Number(price) / Math.pow(10, Number(decimals));
            
            return {
                token: tokenName,
                price: Number(price),
                decimals: Number(decimals),
                actualPrice: actualPrice,
                formatted: `$${actualPrice.toFixed(6)}`
            };
            
        } catch (error) {
            console.error(`❌ Failed to get readable price for ${tokenName}:`, error.message);
            throw error;
        }
    }

    // Check if price is stale
    async checkPriceFreshness(tokenName, maxAgeMinutes = 30) {
        try {
            const tokenEnum = TOKEN_ENUM[tokenName.toUpperCase()];
            const maxAgeSeconds = maxAgeMinutes * 60;
            
            const isStale = await this.contract.isPriceStale(tokenEnum, maxAgeSeconds);
            
            return {
                token: tokenName,
                isStale: isStale,
                maxAge: `${maxAgeMinutes} minutes`
            };
            
        } catch (error) {
            console.error(`❌ Failed to check price freshness for ${tokenName}:`, error.message);
            throw error;
        }
    }

    // Get contract information
    async getContractInfo() {
        try {
            const [pythAddress, contractOwner, contractBalance] = await this.contract.getContractInfo();
            
            return {
                contractAddress: ORACLE_ADDRESS,
                pythAddress: pythAddress,
                owner: contractOwner,
                balance: ethers.formatEther(contractBalance) + ' ETH'
            };
            
        } catch (error) {
            console.error('❌ Failed to get contract info:', error.message);
            throw error;
        }
    }

    // Display all prices in a formatted table
    displayPrices(prices) {
        console.log('\n' + '='.repeat(80));
        console.log('📊 TOKEN PRICES');
        console.log('='.repeat(80));
        console.log('Token    | Price (USD)      | Confidence      | Last Updated');
        console.log('-'.repeat(80));
        
        Object.entries(prices).forEach(([token, data]) => {
            const confidence = data.confidence * Math.pow(10, data.expo);
            const timeAgo = Math.floor((Date.now() - data.publishTime * 1000) / 1000 / 60);
            
            console.log(
                `${token.padEnd(8)} | ${data.formatted.padEnd(15)} | ±${confidence.toFixed(6).padEnd(13)} | ${timeAgo}m ago`
            );
        });
        
        console.log('='.repeat(80));
    }
}

// Main execution function
async function main() {
    const oracle = new PriceFetchOracle();
    
    try {
        // Initialize the oracle
        await oracle.initialize();
        
        console.log('\n🚀 Starting price fetch operations...');
        
        // Get all token prices
        const allPrices = await oracle.getAllTokenPrices();
        
        // Display formatted prices
        oracle.displayPrices(allPrices);
        
        // Get contract info
        console.log('\n📋 Contract Information:');
        const contractInfo = await oracle.getContractInfo();
        console.log('Contract Address:', contractInfo.contractAddress);
        console.log('Pyth Address:    ', contractInfo.pythAddress);
        console.log('Owner:           ', contractInfo.owner);
        console.log('Balance:         ', contractInfo.balance);
        
        // Check price freshness (optional)
        console.log('\n🕐 Price Freshness Check (30min threshold):');
        for (const token of TOKEN_NAMES) {
            const freshness = await oracle.checkPriceFreshness(token, 30);
            const status = freshness.isStale ? '🟡 STALE' : '🟢 FRESH';
            console.log(`${token}: ${status}`);
        }
        
        // Example: Get individual token prices
        console.log('\n🔍 Individual Token Prices (Human Readable):');
        for (const token of TOKEN_NAMES) {
            const readablePrice = await oracle.getReadablePrice(token);
            console.log(`${token}: ${readablePrice.formatted}`);
        }
        
        console.log('\n✅ All operations completed successfully!');
        
    } catch (error) {
        console.error('\n❌ Error in main execution:', error);
        process.exit(1);
    }
}

// Export the class for use in other modules
module.exports = {
    PriceFetchOracle,
    TOKEN_ENUM,
    TOKEN_NAMES,
    ORACLE_ADDRESS
};

// Run the main function if this file is executed directly
if (require.main === module) {
    main().catch(console.error);
}