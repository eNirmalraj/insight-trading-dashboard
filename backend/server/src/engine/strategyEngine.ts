// backend/server/src/engine/strategyEngine.ts
// Strategy Evaluation Engine — Thin wrapper over @insight/computation.

import { Candle } from '@insight/types';
import { BuiltInStrategy, TradeDirection, BUILT_IN_STRATEGIES, ExitRule, ExitType } from '../constants/builtInStrategies';
import {
    evaluateStrategy as computeEvaluateStrategy,
    calculateRiskLevels as computeRiskLevels,
} from '@insight/computation';
import type { StrategyInput, ExitRule as ComputeExitRule } from '@insight/computation';

export interface SignalResult {
    wouldSignal: boolean;
    direction?: TradeDirection;
    reason: string;
    strategyId: string;
    strategyName: string;
    exitRules?: ExitRule[];
}

/**
 * Execute a rule-based strategy against candle data.
 * Delegates computation to @insight/computation unified evaluator.
 */
export const runStrategy = (
    strategy: BuiltInStrategy,
    candles: Candle[]
): SignalResult[] => {
    if (!strategy.indicators || strategy.indicators.length === 0) return [];

    // Adapt BuiltInStrategy to StrategyInput for the shared computation
    const strategyInput: StrategyInput = {
        id: strategy.id,
        name: strategy.name,
        indicators: strategy.indicators || [],
        entryRules: (strategy.entryRules || []).map(r => ({
            condition: r.condition,
            indicator1: r.indicator1,
            indicator2: r.indicator2,
            value: r.value,
            direction: r.direction as 'BUY' | 'SELL',
        })),
        exitRules: (strategy.exitRules || []).map(r => ({
            id: r.id,
            type: r.type as 'STOP_LOSS' | 'TAKE_PROFIT',
            value: r.value,
            unit: r.unit as 'PERCENTAGE' | 'FIXED',
        })),
    };

    // Use shared computation evaluator
    const computeResults = computeEvaluateStrategy(strategyInput, candles);

    // Map back to backend's SignalResult format
    return computeResults.map(r => ({
        wouldSignal: r.wouldSignal,
        direction: r.direction as TradeDirection | undefined,
        reason: r.reason,
        strategyId: r.strategyId || strategy.id,
        strategyName: r.strategyName || strategy.name,
        exitRules: (r.exitRules || []).map(er => ({
            id: er.id,
            type: er.type === 'STOP_LOSS' ? ExitType.STOP_LOSS : ExitType.TAKE_PROFIT,
            value: er.value,
            unit: er.unit as 'PERCENTAGE' | 'FIXED',
        })),
    }));
};

/**
 * Run all built-in strategies against candle data
 */
export const runAllBuiltInStrategies = (candles: Candle[]): SignalResult[] => {
    const allResults: SignalResult[] = [];
    for (const strategy of BUILT_IN_STRATEGIES) {
        if (strategy.indicators && strategy.indicators.length > 0) {
            const results = runStrategy(strategy, candles);
            allResults.push(...results);
        }
    }
    return allResults;
};

/**
 * Calculate stop loss and take profit from exit rules.
 * Delegates to @insight/computation.
 */
export const calculateRiskLevels = (
    entryPrice: number,
    direction: TradeDirection,
    exitRules?: ExitRule[]
): { stopLoss: number | null; takeProfit: number | null } => {
    const computeRules: ComputeExitRule[] | undefined = exitRules?.map(r => ({
        id: r.id,
        type: r.type === ExitType.STOP_LOSS ? 'STOP_LOSS' as const : 'TAKE_PROFIT' as const,
        value: r.value,
        unit: r.unit as 'PERCENTAGE' | 'FIXED',
    }));
    return computeRiskLevels(entryPrice, direction as 'BUY' | 'SELL', computeRules);
};
