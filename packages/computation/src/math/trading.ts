// @insight/computation — Shared Trading Math (Pure Computation)
// Common trading math utilities used across all engines.

// ─────────────────────────────────────────────────────────────
// Position Sizing
// ─────────────────────────────────────────────────────────────

/**
 * Calculate position size based on risk amount and stop loss distance.
 */
export const calculatePositionSize = (
    riskAmount: number,
    entryPrice: number,
    stopLossPrice: number
): number => {
    const slDistance = Math.abs(entryPrice - stopLossPrice);
    if (slDistance === 0) return 0;
    return riskAmount / slDistance;
};

/**
 * Calculate risk amount from account balance and risk percentage.
 */
export const calculateRiskAmount = (
    accountBalance: number,
    riskPercent: number
): number => {
    return accountBalance * (riskPercent / 100);
};

// ─────────────────────────────────────────────────────────────
// Risk:Reward Ratio
// ─────────────────────────────────────────────────────────────

/**
 * Calculate the Risk:Reward ratio for a trade.
 * Returns the reward multiple (e.g., 2.0 means 1:2 R:R).
 */
export const calculateRiskRewardRatio = (
    entryPrice: number,
    stopLossPrice: number,
    takeProfitPrice: number
): number => {
    const risk = Math.abs(entryPrice - stopLossPrice);
    const reward = Math.abs(takeProfitPrice - entryPrice);
    if (risk === 0) return 0;
    return reward / risk;
};

// ─────────────────────────────────────────────────────────────
// PnL Calculations
// ─────────────────────────────────────────────────────────────

/**
 * Calculate PnL in USD for a position.
 */
export const calculatePnlUsd = (
    entryPrice: number,
    currentPrice: number,
    quantity: number,
    direction: 'BUY' | 'SELL'
): number => {
    if (direction === 'BUY') {
        return (currentPrice - entryPrice) * quantity;
    } else {
        return (entryPrice - currentPrice) * quantity;
    }
};

/**
 * Calculate PnL percentage.
 */
export const calculatePnlPercent = (
    entryPrice: number,
    currentPrice: number,
    direction: 'BUY' | 'SELL',
    leverage: number = 1
): number => {
    let pnlPercent: number;
    if (direction === 'BUY') {
        pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
    } else {
        pnlPercent = ((entryPrice - currentPrice) / entryPrice) * 100;
    }
    return pnlPercent * leverage;
};

/**
 * Calculate ROE (Return on Equity) for leveraged positions.
 */
export const calculateROE = (
    entryPrice: number,
    currentPrice: number,
    direction: 'BUY' | 'SELL',
    leverage: number
): number => {
    return calculatePnlPercent(entryPrice, currentPrice, direction, leverage);
};

// ─────────────────────────────────────────────────────────────
// Timeframe Utilities
// ─────────────────────────────────────────────────────────────

/** Timeframe to seconds mapping */
export const TIMEFRAME_SECONDS: Record<string, number> = {
    '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800,
    '1H': 3600, '2H': 7200, '4H': 14400, '6H': 21600, '8H': 28800, '12H': 43200,
    '1D': 86400, '3D': 259200, '1W': 604800, '1M': 2592000
};

/**
 * Get the duration of a timeframe in seconds.
 */
export const getTimeframeSeconds = (timeframe: string): number => {
    return TIMEFRAME_SECONDS[timeframe] || 3600;
};

// ─────────────────────────────────────────────────────────────
// Symbol Utilities
// ─────────────────────────────────────────────────────────────

/**
 * Normalize a trading symbol (remove slashes, uppercase).
 */
export const normalizeSymbol = (symbol: string): string => {
    return symbol.replace('/', '').toUpperCase();
};

/**
 * Check if a symbol matches a scope list.
 * Empty scope means "all symbols" (match everything).
 */
export const isSymbolInScope = (symbol: string, scope: string[]): boolean => {
    if (!scope || scope.length === 0) return true; // Empty = all
    const normalized = normalizeSymbol(symbol);
    return scope.some(s => normalizeSymbol(s) === normalized);
};
