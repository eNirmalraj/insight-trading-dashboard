// src/engine/strategyEngine.ts
// Strategy Signal Generation Engine — Thin wrapper over @insight/computation.
// This file handles I/O (DB, services) while computation uses the shared package.

import { Strategy, TradeDirection, SignalStatus, EntryType, StrategyCategory } from '../types';
import { Candle } from '../components/market-chart/types';
import { getStrategies } from '../services/strategyService';
import { createSignal, isDuplicateSignal } from '../services/signalService';
import {
    evaluateStrategy as computeStrategy,
    resolveStopLoss,
    resolveTakeProfit,
    isSymbolInScope,
    getTimeframeSeconds,
} from '@insight/computation';
import type { StrategyEvaluationResult, StrategyInput, RiskSettings } from '@insight/computation';

// Re-export types that consumers depend on
export type { StrategyEvaluationResult, RiskSettings };

// Safety constants
const STRATEGY_TIMEOUT_MS = 5000;
const DUPLICATE_LOOKBACK_CANDLES = 5;

export interface EngineRunResult {
    success: boolean;
    signalsCreated: number;
    errors: string[];
}

/**
 * Load all active strategies from database (I/O layer)
 */
export const loadActiveStrategies = async (): Promise<Strategy[]> => {
    try {
        const allStrategies = await getStrategies();
        return allStrategies.filter(s => s.isActive && s.type === 'STRATEGY');
    } catch (error) {
        console.error('Failed to load active strategies:', error);
        return [];
    }
};

/**
 * Evaluate a single strategy against candle data.
 * Delegates pure computation to @insight/computation.
 */
export const runStrategy = async (
    strategy: Strategy,
    candles: Candle[]
): Promise<StrategyEvaluationResult[]> => {
    return computeStrategy(strategy as unknown as StrategyInput, candles);
};

/**
 * Run all active strategies for a specific symbol and timeframe.
 * Creates signals in database (I/O layer wrapping pure computation).
 */
export const runAllStrategies = async (
    symbol: string,
    timeframe: string,
    candles: Candle[],
    strategies: Strategy[] | null = null,
    riskSettings: RiskSettings | null = null
): Promise<EngineRunResult> => {
    const result: EngineRunResult = { success: true, signalsCreated: 0, errors: [] };

    try {
        const activeStrategies = strategies || await loadActiveStrategies();
        if (activeStrategies.length === 0) return result;

        const currentTime = candles.length > 0 ? candles[candles.length - 1].time : Math.floor(Date.now() / 1000);
        const intervalSeconds = getTimeframeSeconds(timeframe);
        const lookbackSeconds = DUPLICATE_LOOKBACK_CANDLES * intervalSeconds;

        for (const strategy of activeStrategies) {
            try {
                // Check symbol scope
                if (!isSymbolInScope(symbol, strategy.symbolScope || [])) continue;

                // Run strategy with timeout (wraps pure computation)
                const evaluationPromise = runStrategy(strategy, candles);
                const timeoutPromise = new Promise<StrategyEvaluationResult[]>((_, reject) =>
                    setTimeout(() => reject(new Error('Strategy timeout')), STRATEGY_TIMEOUT_MS)
                );
                const evaluations = await Promise.race([evaluationPromise, timeoutPromise]) as StrategyEvaluationResult[];

                // Create signals for positive evaluations (I/O layer)
                for (const evaluation of evaluations) {
                    if (!evaluation.wouldSignal || !evaluation.direction) continue;

                    // Check for duplicates (I/O)
                    const isDuplicate = await isDuplicateSignal(
                        strategy.id, symbol, evaluation.direction, currentTime, lookbackSeconds
                    );
                    if (isDuplicate) {
                        console.log(`Duplicate signal prevented for ${strategy.name} on ${symbol}`);
                        continue;
                    }

                    // Calculate risk levels using shared computation
                    const latestCandle = candles[candles.length - 1];
                    const entryPrice = latestCandle.close;
                    const stopLoss = resolveStopLoss(entryPrice, evaluation.direction as 'BUY' | 'SELL', latestCandle, riskSettings?.stop_loss_distance);
                    const takeProfit = resolveTakeProfit(entryPrice, evaluation.direction as 'BUY' | 'SELL', stopLoss, riskSettings?.take_profit_distance);

                    const orderType = EntryType.MARKET;
                    const initialStatus = orderType === EntryType.MARKET ? SignalStatus.ACTIVE : SignalStatus.PENDING;

                    // Persist signal (I/O)
                    await createSignal({
                        pair: symbol,
                        strategy: strategy.name,
                        strategyId: strategy.id,
                        direction: evaluation.direction as TradeDirection,
                        entry: entryPrice,
                        entryType: orderType,
                        stopLoss,
                        takeProfit,
                        trailingStopLoss: riskSettings?.trailing_stop_loss_distance || 0,
                        lotSize: riskSettings?.lot_size || 0,
                        leverage: riskSettings?.leverage || 1,
                        timeframe: timeframe as any,
                        status: initialStatus,
                        timestamp: new Date(currentTime * 1000).toISOString()
                    });

                    result.signalsCreated++;
                    console.log(`✨ Signal: ${strategy.name} ${evaluation.direction} ${symbol} @ ${entryPrice} SL:${stopLoss.toFixed(2)} TP:${takeProfit.toFixed(2)} [${initialStatus}]`);
                }
            } catch (error: any) {
                const errorMsg = `Strategy ${strategy.name} failed: ${error.message}`;
                console.error(errorMsg);
                result.errors.push(errorMsg);
                result.success = false;
            }
        }

        return result;
    } catch (error: any) {
        result.success = false;
        result.errors.push(`Engine error: ${error.message}`);
        return result;
    }
};

/**
 * Evaluate if strategy would generate signal on latest candle (debug/testing).
 */
export const evaluateStrategy = async (
    strategy: Strategy,
    candles: Candle[]
): Promise<StrategyEvaluationResult> => {
    const results = await runStrategy(strategy, candles);
    if (results.length === 0) return { wouldSignal: false, reason: 'No signals generated' };
    return results[0];
};
