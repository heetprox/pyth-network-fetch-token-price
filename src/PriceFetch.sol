// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {IPyth} from "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import {PythStructs} from "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

contract PriceFetch {
    IPyth public pyth;

    address public owner;

    // Base Sepolia: 0xA2aa501b19aff244D90cc15a4Cf739D2725B5729

    // *** UPDATED: BETA PRICE FEED IDs FOR TESTNET ***
    // These are the correct Beta price feed IDs for testnet environments
    bytes32 public constant ETH_USD_PRICE_ID =
        0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace; // ETH/USD Beta
    bytes32 public constant USDC_USD_PRICE_ID =
        0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a; // USDC/USD Beta
    bytes32 public constant USDT_USD_PRICE_ID =
        0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b; // USDT/USD Beta
    bytes32 public constant PYUSD_USD_PRICE_ID =
        0x6ec879b1e9963de5ee97e9c8710b742d6228252a5e2ca12d4ae81d7fe5ee8c5d; // PYUSD/USD Beta

    event PriceUpdated(string token, int64 price, uint256 timestamp);
    event UserResolved(string ensName, address userAddress);

    enum Token {
        ETH,
        USDC,
        USDT,
        PYUSD
    }

    struct PriceData {
        int64 price;
        uint64 confidence;
        int32 expo;
        uint256 publishTime;
    }

    struct ExpenseData {
        uint256 totalAmount; // Total expense amount
        Token token; // Token type of expense
        uint8 decimals; // Token decimals
        uint256 participants; // Number of participants
        uint256 usdPerPerson; // USD amount each person owes
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }

    modifier validToken(Token token) {
        require(uint8(token) <= 3, "Invalid token");
        _;
    }

    constructor(address _pythContract) {
        require(_pythContract != address(0), "Invalid Pyth contract address");
        pyth = IPyth(_pythContract);
        owner = msg.sender;
    }

    /**
     * @dev Get price feed ID for a specific token
     * @param token Token enum value
     * @return bytes32 Price feed ID
     */
    function getPriceFeedId(
        Token token
    ) public pure validToken(token) returns (bytes32) {
        if (token == Token.ETH) return ETH_USD_PRICE_ID;
        if (token == Token.USDC) return USDC_USD_PRICE_ID;
        if (token == Token.USDT) return USDT_USD_PRICE_ID;
        if (token == Token.PYUSD) return PYUSD_USD_PRICE_ID;
        revert("Invalid token");
    }

    /**
     * @dev Get latest cached price for a specific token
     * @param token Token to get price for
     * @return PriceData struct containing price info
     */
    function getLatestPrice(
        Token token
    ) public view validToken(token) returns (PriceData memory) {
        bytes32 priceId = getPriceFeedId(token);
        PythStructs.Price memory pythPrice = pyth.getPrice(priceId);

        return
            PriceData({
                price: pythPrice.price,
                confidence: pythPrice.conf,
                expo: pythPrice.expo,
                publishTime: pythPrice.publishTime
            });
    }

    /**
     * @dev Get latest price with fresh update from Hermes API
     * @param token Token to get price for
     * @param priceUpdateData Update data from Pyth Hermes API
     * @return PriceData struct containing fresh price info
     */
    function getLatestPriceWithUpdate(
        Token token,
        bytes[] calldata priceUpdateData
    ) external payable validToken(token) returns (PriceData memory) {
        bytes32 priceId = getPriceFeedId(token);

        // Calculate required update fee
        uint updateFee = pyth.getUpdateFee(priceUpdateData);
        require(msg.value >= updateFee, "Insufficient update fee sent");

        // Update price feeds on-chain
        pyth.updatePriceFeeds{value: updateFee}(priceUpdateData);

        // Get the freshly updated price
        PythStructs.Price memory pythPrice = pyth.getPrice(priceId);

        // Emit event for tracking
        string memory tokenName = getTokenName(token);
        emit PriceUpdated(tokenName, pythPrice.price, pythPrice.publishTime);

        // Return excess ETH if any
        if (msg.value > updateFee) {
            payable(msg.sender).transfer(msg.value - updateFee);
        }

        return
            PriceData({
                price: pythPrice.price,
                confidence: pythPrice.conf,
                expo: pythPrice.expo,
                publishTime: pythPrice.publishTime
            });
    }

    /**
     * @dev Get USD value of a token amount
     * @param token Token type (ETH, USDC, USDT, PYUSD)
     * @param tokenAmount Amount of tokens (in token's native decimals)
     * @param decimals Token decimals (18 for ETH, 6 for USDC/USDT/PYUSD)
     * @return usdValue USD value with 8 decimal places
     */
    function getUSDValue(
        Token token,
        uint256 tokenAmount,
        uint8 decimals
    ) public view validToken(token) returns (uint256 usdValue) {
        require(tokenAmount > 0, "Token amount must be greater than 0");
        require(decimals > 0 && decimals <= 18, "Invalid decimals");

        PriceData memory priceData = getLatestPrice(token);

        // Pyth prices come with negative exponents (e.g., -8 means actual_price / 10^8)
        // We need to handle the math carefully to avoid overflow/underflow

        uint256 price = uint256(int256(priceData.price));
        require(price > 0, "Invalid price from oracle");

        uint256 expo = uint256(uint32(-priceData.expo)); // Convert negative expo to positive

        // Normalize token amount to 18 decimals for consistent calculation
        uint256 normalizedAmount;
        if (decimals < 18) {
            normalizedAmount = tokenAmount * (10 ** (18 - decimals));
        } else {
            normalizedAmount = tokenAmount;
        }

        // Calculate USD value with 8 decimal places
        // Formula: (normalizedAmount * price) / (10^(18 + expo - 8))
        usdValue = (normalizedAmount * price) / (10 ** (18 + expo - 8));

        return usdValue;
    }

    /**
     * @dev Get all supported token prices at once (batch operation)
     * @return ethPrice ETH/USD price data
     * @return usdcPrice USDC/USD price data
     * @return usdtPrice USDT/USD price data
     * @return pyusdPrice PYUSD/USD price data
     */
    function getAllPrices()
        external
        view
        returns (
            PriceData memory ethPrice,
            PriceData memory usdcPrice,
            PriceData memory usdtPrice,
            PriceData memory pyusdPrice
        )
    {
        ethPrice = getLatestPrice(Token.ETH);
        usdcPrice = getLatestPrice(Token.USDC);
        usdtPrice = getLatestPrice(Token.USDT);
        pyusdPrice = getLatestPrice(Token.PYUSD);
    }

    // ... (rest of your functions remain the same)

    /**
     * @dev Calculate fair split amounts in USD for expense sharing
     */
    function calculateSplitInUSD(
        uint256 totalAmount,
        Token totalToken,
        uint8 totalDecimals,
        uint256 participants
    )
        external
        view
        validToken(totalToken)
        returns (ExpenseData memory expenseData)
    {
        require(participants > 0, "Must have at least 1 participant");
        require(totalAmount > 0, "Expense amount must be greater than 0");
        require(totalDecimals > 0 && totalDecimals <= 18, "Invalid decimals");

        // Convert total expense to USD
        uint256 totalUSD = getUSDValue(totalToken, totalAmount, totalDecimals);

        // Calculate per person amount
        uint256 usdPerPerson = totalUSD / participants;

        return
            ExpenseData({
                totalAmount: totalAmount,
                token: totalToken,
                decimals: totalDecimals,
                participants: participants,
                usdPerPerson: usdPerPerson
            });
    }

    /**
     * @dev Convert USD amount to specific token amount
     */
    function convertUSDToToken(
        uint256 usdAmount,
        Token targetToken,
        uint8 targetDecimals
    ) external view validToken(targetToken) returns (uint256 tokenAmount) {
        require(usdAmount > 0, "USD amount must be greater than 0");
        require(targetDecimals > 0 && targetDecimals <= 18, "Invalid decimals");

        PriceData memory priceData = getLatestPrice(targetToken);

        uint256 price = uint256(int256(priceData.price));
        require(price > 0, "Invalid price from oracle");

        uint256 expo = uint256(uint32(-priceData.expo));

        // Calculate token amount
        tokenAmount =
            (usdAmount * (10 ** (expo + targetDecimals))) /
            (price * (10 ** 8));

        return tokenAmount;
    }

    /**
     * @dev Calculate how much each participant should pay in their preferred token
     */
    function calculatePaymentInToken(
        uint256 expenseAmount,
        Token expenseToken,
        uint8 expenseDecimals,
        uint256 participants,
        Token paymentToken,
        uint8 paymentDecimals
    ) external view returns (uint256 paymentAmount) {
        // First calculate USD per person
        ExpenseData memory expense = this.calculateSplitInUSD(
            expenseAmount,
            expenseToken,
            expenseDecimals,
            participants
        );

        // Then convert USD to payment token
        paymentAmount = this.convertUSDToToken(
            expense.usdPerPerson,
            paymentToken,
            paymentDecimals
        );

        return paymentAmount;
    }

    /**
     * @dev Get human-readable price for a token (price as decimal)
     */
    function getReadablePrice(
        Token token
    ) external view validToken(token) returns (uint256 price, uint8 decimals) {
        PriceData memory priceData = getLatestPrice(token);

        uint256 rawPrice = uint256(int256(priceData.price));
        uint8 priceDecimals = uint8(uint32(-priceData.expo));

        return (rawPrice, priceDecimals);
    }

    // Helper Functions

    /**
     * @dev Get token name as string
     */
    function getTokenName(
        Token token
    ) public pure validToken(token) returns (string memory) {
        if (token == Token.ETH) return "ETH";
        if (token == Token.USDC) return "USDC";
        if (token == Token.USDT) return "USDT";
        if (token == Token.PYUSD) return "PYUSD";
        return "UNKNOWN";
    }

    /**
     * @dev Get standard decimals for supported tokens
     */
    function getTokenDecimals(
        Token token
    ) public pure validToken(token) returns (uint8) {
        if (token == Token.ETH) return 18;
        if (token == Token.USDC) return 6;
        if (token == Token.USDT) return 6;
        if (token == Token.PYUSD) return 6;
        return 18; // Default
    }

    /**
     * @dev Check if a price is stale (older than specified seconds)
     */
    function isPriceStale(
        Token token,
        uint256 maxAgeSeconds
    ) external view validToken(token) returns (bool isStale) {
        PriceData memory priceData = getLatestPrice(token);
        return (block.timestamp - priceData.publishTime) > maxAgeSeconds;
    }

    /**
     * @dev Get required update fee for price feeds
     */
    function getUpdateFee(
        bytes[] calldata priceUpdateData
    ) external view returns (uint fee) {
        return pyth.getUpdateFee(priceUpdateData);
    }

    /**
     * @dev Batch update multiple price feeds
     */
    function updatePriceFeeds(
        bytes[] calldata priceUpdateData
    ) external payable {
        uint updateFee = pyth.getUpdateFee(priceUpdateData);
        require(msg.value >= updateFee, "Insufficient update fee");

        pyth.updatePriceFeeds{value: updateFee}(priceUpdateData);

        // Return excess ETH
        if (msg.value > updateFee) {
            payable(msg.sender).transfer(msg.value - updateFee);
        }
    }

    /**
     * @dev Emergency function to withdraw stuck ETH (only owner)
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to withdraw");

        payable(owner).transfer(balance);
    }

    /**
     * @dev Get contract info
     */
    function getContractInfo()
        external
        view
        returns (
            address pythAddress,
            address contractOwner,
            uint256 contractBalance
        )
    {
        return (address(pyth), owner, address(this).balance);
    }

    // Allow contract to receive ETH for price updates
    receive() external payable {
        // ETH sent directly to contract (for price update fees)
    }

    // Fallback function
    fallback() external payable {
        revert("Function not found");
    }
}