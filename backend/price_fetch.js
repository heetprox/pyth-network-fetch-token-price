const { ethers } = require('ethers');
const axios = require('axios');
require('dotenv').config();

// Configuration
const ORACLE_ADDRESS = "0x02688C437601349b24741C24e3381763296452a7"; 
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

// Beta price feed IDs for testnet
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
        this.currentNonce = null;
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
                
                // Get current nonce
                this.currentNonce = await this.provider.getTransactionCount(this.wallet.address);
                console.log(`🔢 Current nonce: ${this.currentNonce}`);
                
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

    // Fixed helper function to format prices
    formatPrice(priceData) {
        try {
            const { price, confidence, expo, publishTime } = priceData;
            
            // Convert BigInt to regular numbers for calculations
            const priceNum = Number(price);
            const expoNum = Number(expo);
            const confidenceNum = Number(confidence);
            const publishTimeNum = Number(publishTime);
            
            // Validate publishTime before creating Date
            let publishDate = 'N/A';
            let timeAgo = 'N/A';
            
            if (publishTimeNum && publishTimeNum > 0) {
                try {
                    // Check if it's a reasonable timestamp (not too far in future/past)
                    const now = Math.floor(Date.now() / 1000);
                    if (publishTimeNum > 1000000000 && publishTimeNum < now + 86400) { // Valid range
                        publishDate = new Date(publishTimeNum * 1000).toISOString();
                        const ageMinutes = Math.floor((now - publishTimeNum) / 60);
                        timeAgo = ageMinutes < 1440 ? `${ageMinutes}m ago` : `${Math.floor(ageMinutes/1440)}d ago`;
                    }
                } catch (dateError) {
                    console.warn('Date formatting error:', dateError.message);
                }
            }
            
            // Calculate actual price (price * 10^expo)
            const actualPrice = priceNum * Math.pow(10, expoNum);
            
            return {
                rawPrice: priceNum,
                actualPrice: actualPrice,
                confidence: confidenceNum,
                expo: expoNum,
                publishTime: publishTimeNum,
                publishDate: publishDate,
                timeAgo: timeAgo,
                formatted: actualPrice > 0 ? `$${actualPrice.toFixed(6)}` : '$0.000000',
                isValid: actualPrice > 0 && priceNum !== 0
            };
        } catch (error) {
            console.error('Price formatting error:', error.message);
            return {
                rawPrice: 'N/A',
                actualPrice: 0,
                confidence: 'N/A',
                expo: 'N/A',
                publishTime: 'N/A',
                publishDate: 'N/A',
                timeAgo: 'N/A',
                formatted: 'Price not available',
                isValid: false,
                error: error.message
            };
        }
    }

    // Fetch price update data from Pyth Hermes API
    async fetchPriceUpdateData() {
        try {
            const priceIds = Object.values(PRICE_FEED_IDS);
            console.log('🌐 Fetching Beta price updates from Pyth Hermes...');
            
            const idsParam = priceIds.map(id => `ids[]=${id}`).join('&');
            const url = `${PYTH_HERMES_URL}/v2/updates/price/latest?${idsParam}&encoding=hex`;
            
            const response = await axios.get(url, { 
                timeout: 15000,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'PriceFetch-Oracle/1.0'
                }
            });
            
            if (response.data && response.data.binary && response.data.binary.data) {
                const updateData = response.data.binary.data.map(update => '0x' + update);
                console.log(`✅ Got ${updateData.length} Beta price updates from Hermes`);
                return updateData;
            }
            
            throw new Error('No price update data received from Hermes');
        } catch (error) {
            console.error('❌ Failed to fetch Beta price updates:', error.message);
            throw error;
        }
    }

    // Update all prices in a single transaction (more efficient)
    async updateAllPrices() {
        if (!this.wallet) {
            throw new Error('Wallet required for price updates');
        }

        try {
            console.log('📊 Updating all prices in batch...');
            
            // Get price update data
            const priceUpdateData = await this.fetchPriceUpdateData();
            const contractWithWallet = new ethers.Contract(ORACLE_ADDRESS, ORACLE_ABI, this.wallet);
            
            // Get update fee
            const updateFee = await this.contract.getUpdateFee(priceUpdateData);
            console.log(`💰 Total update fee: ${ethers.formatEther(updateFee)} ETH`);
            
            // Update all price feeds in one transaction
            const tx = await contractWithWallet.updatePriceFeeds(priceUpdateData, {
                value: updateFee,
                gasLimit: 1000000,
                nonce: this.currentNonce++
            });
            
            console.log(`🚀 Transaction sent: ${tx.hash}`);
            
            // Wait for confirmation
            const receipt = await tx.wait();
            console.log(`✅ All prices updated successfully! Block: ${receipt.blockNumber}`);
            
            return true;
        } catch (error) {
            console.error('❌ Failed to update prices:', error.message);
            
            // Reset nonce if needed
            if (error.code === 'NONCE_EXPIRED' || error.message.includes('nonce')) {
                console.log('🔄 Resetting nonce...');
                this.currentNonce = await this.provider.getTransactionCount(this.wallet.address);
            }
            
            throw error;
        }
    }

    // Get individual token price (cached only)
    async getTokenPrice(tokenName) {
        try {
            const tokenEnum = TOKEN_ENUM[tokenName.toUpperCase()];
            if (tokenEnum === undefined) {
                throw new Error(`Unsupported token: ${tokenName}`);
            }

            console.log(`📈 Fetching ${tokenName} price (cached)...`);
            
            // Get cached price
            const priceData = await this.contract.getLatestPrice(tokenEnum);
            return this.formatPrice(priceData);
            
        } catch (error) {
            console.error(`❌ Failed to fetch ${tokenName} price:`, error.message);
            return {
                rawPrice: 'N/A',
                actualPrice: 0,
                confidence: 'N/A',
                expo: 'N/A',
                publishTime: 'N/A',
                publishDate: 'N/A',
                timeAgo: 'N/A',
                formatted: 'Price not available',
                isValid: false,
                error: error.message
            };
        }
    }

    // Get all token prices (cached)
    async getAllTokenPrices() {
        console.log('\n📊 Fetching all cached token prices...');
        
        const prices = {};
        
        for (const tokenName of TOKEN_NAMES) {
            prices[tokenName] = await this.getTokenPrice(tokenName);
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        return prices;
    }

    // Display all prices in a formatted table
    displayPrices(prices) {
        console.log('\n' + '='.repeat(85));
        console.log('📊 TOKEN PRICES (BETA FEEDS)');
        console.log('='.repeat(85));
        console.log('Token    | Price (USD)       | Confidence       | Last Updated');
        console.log('-'.repeat(85));
        
        Object.entries(prices).forEach(([token, data]) => {
            if (!data.isValid) {
                console.log(`${token.padEnd(8)} | ${'Price not available'.padEnd(17)} | ${'N/A'.padEnd(16)} | N/A`);
            } else {
                const confidence = data.confidence * Math.pow(10, data.expo);
                const confidenceDisplay = confidence > 0 ? `±${confidence.toFixed(6)}` : 'N/A';
                
                console.log(
                    `${token.padEnd(8)} | ${data.formatted.padEnd(17)} | ${confidenceDisplay.padEnd(16)} | ${data.timeAgo}`
                );
            }
        });
        
        console.log('='.repeat(85));
        
        // Summary
        const validPrices = Object.values(prices).filter(p => p.isValid).length;
        const totalPrices = Object.keys(prices).length;
        
        console.log(`\n📈 Status: ${validPrices}/${totalPrices} prices available`);
        
        if (validPrices > 0) {
            console.log('\n🎉 SUCCESS! Price data is now available:');
            Object.entries(prices)
                .filter(([, data]) => data.isValid)
                .forEach(([token, data]) => {
                    console.log(`  ${token}: ${data.formatted} (updated ${data.timeAgo})`);
                });
        } else {
            console.log('\n💡 Next steps:');
            console.log('1. Update prices first: await oracle.updateAllPrices()');
            console.log('2. Then fetch cached prices: await oracle.getAllTokenPrices()');
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
    console.log('🚀 PriceFetch Oracle Backend (FIXED VERSION)');
    console.log('==============================================');
    
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
        
        // Strategy: Update all prices first, then fetch cached prices
        if (oracle.wallet) {
            console.log('\n🔄 Step 1: Updating all prices...');
            try {
                await oracle.updateAllPrices();
                
                // Wait a bit for prices to settle
                console.log('⏳ Waiting for prices to settle...');
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                console.log('\n🔄 Step 2: Fetching updated prices...');
                const prices = await oracle.getAllTokenPrices();
                oracle.displayPrices(prices);
                
            } catch (updateError) {
                console.error('❌ Price update failed:', updateError.message);
                console.log('\n🔄 Fallback: Trying cached prices...');
                const prices = await oracle.getAllTokenPrices();
                oracle.displayPrices(prices);
            }
        } else {
            // No wallet - try cached prices only
            console.log('\n🔄 Fetching cached prices (read-only mode)...');
            const prices = await oracle.getAllTokenPrices();
            oracle.displayPrices(prices);
        }
        
        console.log('\n✅ Process completed!');
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.log('\n🔧 Troubleshooting checklist:');
        console.log('- Contract address is correct');
        console.log('- Network connectivity is good');
        console.log('- For updates: PRIVATE_KEY in .env and sufficient ETH balance');
        
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