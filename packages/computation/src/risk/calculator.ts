// @insight/computation — Risk Calculator (Pure Computation)
// Exchange-Grade Risk Calculator — moved from src/engine/RiskCalculator.ts
// Already was pure computation. Now shared between frontend and backend.

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const TAKER_FEE_RATE = 0.0006;    // 0.06% Conservative avg (Binance/Bybit)
const SLIPPAGE_BUFFER = 1.05;     // 5% buffer on SL distance checks
const MIN_SL_PERCENT = 0.002;     // 0.2% minimum SL distance

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface StopLossValidation {
    isValid: boolean;
    reason?: string;
}

export interface LiquidationSafety {
    isSafe: boolean;
    liquidationPrice: number;
    reason?: string;
}

export interface RiskDecision {
    allowed: boolean;
    reason?: string;
}

export interface RiskConfig {
    MAX_DAILY_LOSS: number;
    MAX_SYMBOL_EXPOSURE: number;     // % of total capital
    MAX_VOLATILITY: number;          // ATR threshold
    MAX_POSITION_SIZE: number;       // USD
}

// ─────────────────────────────────────────────────────────────
// Fee-Aware Position Sizing
// ─────────────────────────────────────────────────────────────

/**
 * Calculate Quantity considering Risk Amount AND Fees.
 * 
 * Fee-Aware Formula:
 *   Qty = Risk / (SL_Dist + Fee*(Entry + SL))
 */
export const calculateFeeAwareQty = (
    riskAmount: number,
    entryPrice: number,
    stopLossPrice: number,
    feeRate: number = TAKER_FEE_RATE
): number => {
    const slDistance = Math.abs(entryPrice - stopLossPrice);
    const feesPerUnit = (entryPrice + stopLossPrice) * feeRate;
    const denominator = slDistance + feesPerUnit;

    if (denominator <= 0) return 0;
    return riskAmount / denominator;
};

// ─────────────────────────────────────────────────────────────
// Stop Loss Validation
// ─────────────────────────────────────────────────────────────

/**
 * Validates if the Stop Loss is wide enough.
 * Rejects "Micro-SL" which leads to massive position sizes and guaranteed slippage stops.
 */
export const isStopLossValid = (
    entryPrice: number,
    stopLossPrice: number,
    minSlPercent: number = MIN_SL_PERCENT
): StopLossValidation => {
    const slDistance = Math.abs(entryPrice - stopLossPrice);
    const slPercent = slDistance / entryPrice;

    if (slPercent < minSlPercent) {
        return {
            isValid: false,
            reason: `Stop Loss ${(slPercent * 100).toFixed(4)}% is too tight. Minimum ${minSlPercent * 100}% required.`
        };
    }
    return { isValid: true };
};

// ─────────────────────────────────────────────────────────────
// Liquidation Safety
// ─────────────────────────────────────────────────────────────

/**
 * Check if Liquidation Price is too close to Stop Loss.
 * SL should trigger BEFORE Liquidation with a safety buffer.
 */
export const checkLiquidationSafety = (
    entryPrice: number,
    stopLossPrice: number,
    leverage: number,
    direction: 'buy' | 'sell',
    slippageBuffer: number = SLIPPAGE_BUFFER
): LiquidationSafety => {
    if (leverage <= 1) return { isSafe: true, liquidationPrice: 0 };

    let liquidationPrice = 0;

    if (direction === 'buy') {
        const liqDistance = entryPrice / leverage;
        liquidationPrice = entryPrice - liqDistance;

        if (stopLossPrice <= liquidationPrice * slippageBuffer) {
            return {
                isSafe: false,
                liquidationPrice,
                reason: `Unsafe Leverage! Liquidation ($${liquidationPrice.toFixed(2)}) is too close to SL ($${stopLossPrice}).`
            };
        }
    } else {
        const liqDistance = entryPrice / leverage;
        liquidationPrice = entryPrice + liqDistance;

        if (stopLossPrice >= liquidationPrice / slippageBuffer) {
            return {
                isSafe: false,
                liquidationPrice,
                reason: `Unsafe Leverage! Liquidation ($${liquidationPrice.toFixed(2)}) is too close to SL ($${stopLossPrice}).`
            };
        }
    }

    return { isSafe: true, liquidationPrice };
};

// ─────────────────────────────────────────────────────────────
// Trade Risk Check (from backend RiskManager)
// ─────────────────────────────────────────────────────────────

/**
 * Check if a trade is allowed based on risk rules (pure computation).
 * The caller provides the current state (dailyPnL, exposures, capital).
 */
export const checkTradeRisk = (
    trade: { symbol: string; quantity: number; price: number },
    state: {
        dailyPnL: number;
        symbolExposure: Map<string, number> | Record<string, number>;
        totalCapital: number;
    },
    config: RiskConfig = {
        MAX_DAILY_LOSS: 5000,
        MAX_SYMBOL_EXPOSURE: 0.25,
        MAX_VOLATILITY: 0.05,
        MAX_POSITION_SIZE: 10000
    }
): RiskDecision => {
    // 1. Daily loss limit
    if (state.dailyPnL < -config.MAX_DAILY_LOSS) {
        return { allowed: false, reason: 'Daily loss limit reached' };
    }

    // 2. Position size limit
    const tradeValue = trade.quantity * trade.price;
    if (tradeValue > config.MAX_POSITION_SIZE) {
        return { allowed: false, reason: 'Position size exceeds limit' };
    }

    // 3. Symbol concentration limit
    const exposureMap = state.symbolExposure instanceof Map
        ? state.symbolExposure
        : new Map(Object.entries(state.symbolExposure));
    const currentExposure = exposureMap.get(trade.symbol) || 0;
    const newExposure = currentExposure + tradeValue;

    if (newExposure / state.totalCapital > config.MAX_SYMBOL_EXPOSURE) {
        return { allowed: false, reason: 'Symbol exposure limit exceeded' };
    }

    return { allowed: true };
};
