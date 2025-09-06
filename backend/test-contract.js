const { ethers } = require('ethers');

// Your contract details
const ORACLE_ADDRESS = "0x02688C437601349b24741C24e3381763296452a7";
const BASE_SEPOLIA_RPC = "https://sepolia.base.org";

// Minimal ABI to test basic functions
const TEST_ABI = [
    "function owner() view returns (address)",
    "function pyth() view returns (address)",
    "function getContractInfo() view returns (address, address, uint256)"
];

async function testContract() {
    console.log('🧪 Testing Contract Deployment');
    console.log('================================');
    
    try {
        // Connect to provider
        const provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC);
        console.log('✅ Connected to Base Sepolia');
        
        // Check if contract exists
        const code = await provider.getCode(ORACLE_ADDRESS);
        if (code === '0x') {
            console.log('❌ No contract found at address:', ORACLE_ADDRESS);
            console.log('Please verify the contract address is correct.');
            return;
        }
        console.log('✅ Contract found at address');
        
        // Create contract instance
        const contract = new ethers.Contract(ORACLE_ADDRESS, TEST_ABI, provider);
        
        // Test basic functions
        console.log('\n📋 Contract Information:');
        
        try {
            const owner = await contract.owner();
            console.log('Owner:', owner);
        } catch (error) {
            console.log('Owner: Could not fetch -', error.message);
        }
        
        try {
            const pythAddress = await contract.pyth();
            console.log('Pyth Address:', pythAddress);
        } catch (error) {
            console.log('Pyth Address: Could not fetch -', error.message);
        }
        
        try {
            const [pyth, owner, balance] = await contract.getContractInfo();
            console.log('Contract Info:');
            console.log('  Pyth:', pyth);
            console.log('  Owner:', owner);
            console.log('  Balance:', ethers.formatEther(balance), 'ETH');
        } catch (error) {
            console.log('Contract Info: Could not fetch -', error.message);
        }
        
        console.log('\n✅ Contract test completed');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testContract();