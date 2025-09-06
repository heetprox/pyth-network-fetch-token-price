const { ethers } = require('ethers');
const axios = require('axios');
require('dotenv').config();

// Configuration
const ORACLE_ADDRESS = "0x8D2eCC24E56FDD0a6f501E4b68CE92180224d654";
const BASE_SEPOLIA_RPC = "https://sepolia.base.org";
const PYTH_HERMES_URL = "https://hermes.pyth.network";

// Token enum mapping
const TOKEN_ENUM = {
    ETH: 0,
    USDC: 1,
    USDT: 2,
    PYUSD: 3
};

const TOKEN_NAMES = ['ETH', 'USDC', 'USDT', 'PYUSD'];

// Price feed IDs from your contract
const PRICE_FEED_IDS = {
    ETH: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
    USDC: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
    USDT: '0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b',
    PYUSD: '0x6ec879b1e9963de5ee97e9c8710b742d6228252a5e2ca12d4ae81d7fe5ee8c5d'
};

// Minimal ABI for the functions we need
const ORACLE_ABI = [
    "function getLatestPrice(uint8 token) view returns (tuple(int64 price, uint64 confidence, int32 expo, uint256 publishTime))",
    "function getLatestPriceWithUpdate(uint8 token, bytes[] priceUpdateData) payable returns (tuple(int64 price, uint64 confidence, int32 expo, uint256 publishTime))",
    "function getUpdateFee(bytes[] priceUpdateData) view returns (uint256)",
    "function updatePriceFeeds(bytes[] priceUpdateData) payable",
    "function getContractInfo() view returns (address pythAddress, address contractOwner, uint256 contractBalance)",
    "function isPriceStale(uint8 token, uint256 maxAgeSeconds) view returns (bool)",
    "function getReadablePrice(uint8 token) view returns (uint256 price, uint8 decimals)"
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
                
                // Check wallet balance
                const balance = await this.provider.getBalance(this.wallet.address);
                console.log(`💰 Wallet balance: ${ethers.formatEther(balance)} ETH`);
            } else {
                console.log('ℹ️  No private key provided - read-only mode');
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
        const confidenceNum = Number(confidence);
        
        // Calculate actual price (price * 10^expo)
        const actualPrice = priceNum * Math.pow(10, expoNum);
        
        // Format publish time
        const publishDate = new Date(Number(publishTime) * 1000);
        
        return {
            rawPrice: priceNum,
            actualPrice: actualPrice,
            confidence: confidenceNum,
            expo: expoNum,
            publishTime: Number(publishTime),
            publishDate: publishDate.toISOString(),
            formatted: `$${actualPrice.toFixed(6)}`,
            isValid: actualPrice > 0
        };
    }

    // Fetch price update data from Pyth Hermes API
    async fetchPriceUpdateData() {
        try {
            const priceIds = Object.values(PRICE_FEED_IDS);
            const idsParam = priceIds.map(id => `ids[]=${id}`).join('&');
            
            console.log('🌐 Fetching price updates from Pyth Hermes...');
            const response = await axios.get(
                `${PYTH_HERMES_URL}/v2/updates/price/latest?${idsParam}&encoding=hex`,
                { timeout: 10000 }
            );
            
            if (response.data && response.data.binary && response.data.binary.data) {
                const updateData = response.data.binary.data.map(update => '0x' + update);
                console.log(`✅ Got ${updateData.length} price updates from Hermes`);
                return updateData;
            }
            
            throw new Error('No price update data received from Hermes');
        } catch (error) {
            console.error('❌ Failed to fetch price updates:', error.message);
            throw error;
        }
    }

    // Get individual token price with optional update
    async getTokenPrice(tokenName, withUpdate = false) {
        try {
            const tokenEnum = TOKEN_ENUM[tokenName.toUpperCase()];
            if (tokenEnum === undefined) {
                throw new Error(`Unsupported token: ${tokenName}`);
            }

            console.log(`📈 Fetching ${tokenName} price${withUpdate ? ' (with update)' : ''}...`);
            
            if (withUpdate && this.wallet) {
                // Get fresh price with update
                const priceUpdateData = await this.fetchPriceUpdateData();
                const contractWithWallet = new ethers.Contract(ORACLE_ADDRESS, ORACLE_ABI, this.wallet);
                
                // Get update fee
                const updateFee = await this.contract.getUpdateFee(priceUpdateData);
                console.log(`💰 Update fee: ${ethers.formatEther(updateFee)} ETH`);
                
                // Get fresh price with update
                const priceData = await contractWithWallet.getLatestPriceWithUpdate(
                    tokenEnum, 
                    priceUpdateData,
                    { value: updateFee, gasLimit: 500000 }
                );
                
                return this.formatPrice(priceData);
            } else {
                // Get cached price
                const priceData = await this.contract.getLatestPrice(tokenEnum);
                return this.formatPrice(priceData);
            }
            
        } catch (error) {
            console.error(`❌ Failed to fetch ${tokenName} price:`, error.message);
            return {
                rawPrice: 'N/A',
                actualPrice: 0,
                confidence: 'N/A',
                expo: 'N/A',
                publishTime: 'N/A',
                publishDate: 'N/A',
                formatted: 'Price not available',
                isValid: false,
                error: error.message
            };
        }
    }

    // Get all token prices
    async getAllTokenPrices(withUpdate = false) {
        console.log(`\n📊 Fetching all token prices${withUpdate ? ' (with updates)' : ''}...`);
        
        const prices = {};
        
        for (const tokenName of TOKEN_NAMES) {
            prices[tokenName] = await this.getTokenPrice(tokenName, withUpdate);
            
            // Add small delay between requests to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        return prices;
    }

    // Display all prices in a formatted table
    displayPrices(prices) {
        console.log('\n' + '='.repeat(85));
        console.log('📊 TOKEN PRICES');
        console.log('='.repeat(85));
        console.log('Token    | Price (USD)       | Confidence       | Last Updated');
        console.log('-'.repeat(85));
        
        Object.entries(prices).forEach(([token, data]) => {
            if (!data.isValid) {
                console.log(`${token.padEnd(8)} | ${data.formatted.padEnd(17)} | ${'N/A'.padEnd(16)} | N/A`);
            } else {
                const confidence = data.confidence * Math.pow(10, data.expo);
                const timeAgo = Math.floor((Date.now() - data.publishTime * 1000) / 1000 / 60);
                const timeDisplay = timeAgo < 1440 ? `${timeAgo}m ago` : `${Math.floor(timeAgo/1440)}d ago`;
                
                console.log(
                    `${token.padEnd(8)} | ${data.formatted.padEnd(17)} | ±${confidence.toFixed(6).padEnd(15)} | ${timeDisplay}`
                );
            }
        });
        
        console.log('='.repeat(85));
        
        // Summary
        const validPrices = Object.values(prices).filter(p => p.isValid).length;
        const totalPrices = Object.keys(prices).length;
        
        console.log(`\n📈 Status: ${validPrices}/${totalPrices} prices available`);
        
        if (validPrices < totalPrices) {
            const unavailableTokens = Object.entries(prices)
                .filter(([, data]) => !data.isValid)
                .map(([token]) => token);
                
            console.log('❌ Unavailable:', unavailableTokens.join(', '));
            console.log('\n💡 To get live prices:');
            console.log('1. Add PRIVATE_KEY to .env file');
            console.log('2. Ensure you have Base Sepolia ETH for gas');
            console.log('3. Run with fresh updates enabled');
        }
    }

    // Get contract info
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
            return null;
        }
    }
}

// Main execution function
async function main() {
    console.log('🚀 PriceFetch Oracle Backend');
    console.log('============================');
    
    const oracle = new PriceFetchOracle();
    
    try {
        // Initialize the oracle
        await oracle.initialize();
        
        // Get contract info
        console.log('\n📋 Contract Information:');
        const contractInfo = await oracle.getContractInfo();
        if (contractInfo) {
            console.log('Contract Address:', contractInfo.contractAddress);
            console.log('Pyth Address:    ', contractInfo.pythAddress);
            console.log('Owner:           ', contractInfo.owner);
            console.log('Balance:         ', contractInfo.balance);
        }
        
        // Try to get cached prices first
        console.log('\n🔄 Step 1: Trying cached prices...');
        let prices = await oracle.getAllTokenPrices(false);
        
        // Check if we got any valid prices
        const validPrices = Object.values(prices).filter(p => p.isValid).length;
        
        if (validPrices === 0 && oracle.wallet) {
            console.log('\n🔄 Step 2: No cached prices found. Updating with fresh data...');
            prices = await oracle.getAllTokenPrices(true);
        }
        
        // Display results
        oracle.displayPrices(prices);
        
        // Show individual readable prices for valid ones
        const validTokens = Object.entries(prices)
            .filter(([, data]) => data.isValid)
            .map(([token]) => token);
            
        if (validTokens.length > 0) {
            console.log('\n🔍 Readable Prices:');
            validTokens.forEach(token => {
                const data = prices[token];
                console.log(`${token}: ${data.formatted} (${data.confidence} confidence)`);
            });
        }
        
        console.log('\n✅ Price fetch completed!');
        
        if (validPrices === 0) {
            console.log('\n🔧 No prices available. This is normal for testnets.');
            console.log('The Pyth oracle requires price updates which cost gas.');
        }
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        
        console.log('\n🔧 Troubleshooting:');
        console.log('- Verify internet connection');
        console.log('- Check contract address is correct');
        console.log('- Ensure Base Sepolia RPC is accessible');
        console.log('- For price updates: add PRIVATE_KEY to .env and have ETH');
        
        process.exit(1);
    }
}

// Export for use as module
module.exports = {
    PriceFetchOracle,
    TOKEN_ENUM,
    TOKEN_NAMES,
    PRICE_FEED_IDS,
    ORACLE_ADDRESS
};

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}