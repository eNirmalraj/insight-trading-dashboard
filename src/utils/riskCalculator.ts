/**
 * Risk Management Calculus for Forex and Crypto
 */

/**
 * Calculate Forex Lot Size
 * Formula: Lot Size = (Balance * Risk%) / (SL Pips * Pip Value)
 * Standard Lot: 100,000 units. Pip Value for most pairs ≈ $10 per lot.
 */
export const calculateForexLotSize = (
    balance: number,
    riskPercent: number,
    slPips: number,
    pipValue: number = 10
): number => {
    if (slPips <= 0 || balance <= 0 || riskPercent <= 0) return 0.01;

    const riskAmount = balance * (riskPercent / 100);
    const lotSize = riskAmount / (slPips * pipValue);

    // Return with 2 decimal precision, min 0.01
    return Math.max(0.01, Math.round(lotSize * 100) / 100);
};

/**
 * Calculate Forex Risk Percentage from Lot Size
 */
export const calculateForexRiskPercent = (
    balance: number,
    lotSize: number,
    slPips: number,
    pipValue: number = 10
): number => {
    if (balance <= 0 || lotSize <= 0 || slPips <= 0) return 1.0;

    const riskAmount = lotSize * slPips * pipValue;
    const riskPercent = (riskAmount / balance) * 100;

    return Math.round(riskPercent * 100) / 100;
};

/**
 * Calculate Crypto Position Size (Quantity)
 * Formula: Quantity = (Balance * Risk%) / |Entry - SL|
 */
export const calculateCryptoPositionSize = (
    balance: number,
    riskPercent: number,
    leverage: number,
    entryPrice: number,
    slPrice: number
): number => {
    if (balance <= 0 || riskPercent <= 0 || Math.abs(entryPrice - slPrice) <= 0) return 0;

    const riskAmount = balance * (riskPercent / 100);
    const priceDistance = Math.abs(entryPrice - slPrice);
    const quantity = riskAmount / priceDistance;

    return Math.round(quantity * 10000) / 10000; // 4 decimal precision for crypto
};

/**
 * Calculate Crypto Risk Percentage from Quantity
 */
export const calculateCryptoRiskPercent = (
    balance: number,
    quantity: number,
    entryPrice: number,
    slPrice: number
): number => {
    if (balance <= 0 || quantity <= 0) return 1.0;

    const riskAmount = quantity * Math.abs(entryPrice - slPrice);
    const riskPercent = (riskAmount / balance) * 100;

    return Math.round(riskPercent * 100) / 100;
};
