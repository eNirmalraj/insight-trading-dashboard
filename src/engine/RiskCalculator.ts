// src/engine/RiskCalculator.ts
// Re-exports from @insight/computation — single source of truth.
// Wraps the shared functions in the original class-based API for backward compatibility.

import {
    calculateFeeAwareQty,
    isStopLossValid,
    checkLiquidationSafety,
} from '@insight/computation';

/**
 * Exchange-Grade Risk Calculator
 * Now delegates to @insight/computation pure functions.
 */
export class RiskCalculator {
    public static calculateFeeAwareQty(
        riskAmount: number,
        entryPrice: number,
        stopLossPrice: number
    ): number {
        return calculateFeeAwareQty(riskAmount, entryPrice, stopLossPrice);
    }

    public static isStopLossValid(
        entryPrice: number,
        stopLossPrice: number
    ): { isValid: boolean; reason?: string } {
        return isStopLossValid(entryPrice, stopLossPrice);
    }

    public static checkLiquidationSafety(
        entryPrice: number,
        stopLossPrice: number,
        leverage: number,
        direction: 'buy' | 'sell'
    ): { isSafe: boolean; liquidationPrice: number; reason?: string } {
        return checkLiquidationSafety(entryPrice, stopLossPrice, leverage, direction);
    }
}
