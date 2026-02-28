// @insight/computation — Risk Level Calculations (Pure Computation)
// Unified stop loss, take profit, and risk level calculations.

import { Candle } from '@insight/types';
import type { ExitRule } from './evaluator';

// ─────────────────────────────────────────────────────────────
// Stop Loss Calculation
// ─────────────────────────────────────────────────────────────

/**
 * Calculate stop loss based on entry candle high/low.
 * Buy: SL below entry candle Low (with buffer)
 * Sell: SL above entry candle High (with buffer)
 */
export const calculateStopLoss = (
    candle: Candle,
    direction: 'BUY' | 'SELL',
    bufferPercent: number = 0.001
): number => {
    if (direction === 'BUY') {
        return candle.low * (1 - bufferPercent);
    } else {
        return candle.high * (1 + bufferPercent);
    }
};

// ─────────────────────────────────────────────────────────────
// Take Profit Calculation
// ─────────────────────────────────────────────────────────────

/**
 * Calculate take profit based on Risk:Reward ratio.
 * Default ratio is 1:2.
 */
export const calculateTakeProfit = (
    entryPrice: number,
    stopLoss: number,
    direction: 'BUY' | 'SELL',
    rewardMultiplier: number = 2
): number => {
    const risk = Math.abs(entryPrice - stopLoss);
    const reward = risk * rewardMultiplier;

    if (direction === 'BUY') {
        return entryPrice + reward;
    } else {
        return entryPrice - reward;
    }
};

// ─────────────────────────────────────────────────────────────
// Exit-Rule-Based Risk Levels (from backend)
// ─────────────────────────────────────────────────────────────

/**
 * Calculate stop loss and take profit from ExitRule definitions.
 * Supports PERCENTAGE and FIXED unit types.
 */
export const calculateRiskLevels = (
    entryPrice: number,
    direction: 'BUY' | 'SELL',
    exitRules?: ExitRule[]
): { stopLoss: number | null; takeProfit: number | null } => {
    let stopLoss: number | null = null;
    let takeProfit: number | null = null;

    if (!exitRules || exitRules.length === 0) {
        return { stopLoss, takeProfit };
    }

    for (const rule of exitRules) {
        if (rule.type === 'STOP_LOSS') {
            if (rule.unit === 'PERCENTAGE') {
                stopLoss = direction === 'BUY'
                    ? entryPrice * (1 - rule.value)
                    : entryPrice * (1 + rule.value);
            } else if (rule.unit === 'FIXED') {
                stopLoss = direction === 'BUY'
                    ? entryPrice - rule.value
                    : entryPrice + rule.value;
            }
        } else if (rule.type === 'TAKE_PROFIT') {
            if (rule.unit === 'PERCENTAGE') {
                takeProfit = direction === 'BUY'
                    ? entryPrice * (1 + rule.value)
                    : entryPrice * (1 - rule.value);
            } else if (rule.unit === 'FIXED') {
                takeProfit = direction === 'BUY'
                    ? entryPrice + rule.value
                    : entryPrice - rule.value;
            }
        }
    }

    return { stopLoss, takeProfit };
};

/**
 * Determine stop loss with priority:
 * 1. User-defined distance (from risk settings)
 * 2. Dynamic candle-based SL
 */
export const resolveStopLoss = (
    entryPrice: number,
    direction: 'BUY' | 'SELL',
    candle: Candle,
    stopLossDistance?: number
): number => {
    if (stopLossDistance && stopLossDistance > 0) {
        return direction === 'BUY'
            ? entryPrice - stopLossDistance
            : entryPrice + stopLossDistance;
    }
    return calculateStopLoss(candle, direction);
};

/**
 * Determine take profit with priority:
 * 1. User-defined distance (from risk settings)
 * 2. Dynamic R:R-based TP
 */
export const resolveTakeProfit = (
    entryPrice: number,
    direction: 'BUY' | 'SELL',
    stopLoss: number,
    takeProfitDistance?: number,
    rewardMultiplier: number = 2
): number => {
    if (takeProfitDistance && takeProfitDistance > 0) {
        return direction === 'BUY'
            ? entryPrice + takeProfitDistance
            : entryPrice - takeProfitDistance;
    }
    return calculateTakeProfit(entryPrice, stopLoss, direction, rewardMultiplier);
};
