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
const ORACLE_ADDRESS = "0x8D2eCC24E56FDD0a6f501E4b68CE92180224d654"; // UPDATE THIS!
