// src/engine/strategyEngine.ts
// Strategy Signal Generation Engine - Converts strategies into trade signals

import { Strategy, TradeDirection } from '../types';
import { Candle } from '../components/market-chart/types';
import { Kuri, BackendVM, Context } from '@insight/kuri-engine';
import { getStrategies } from '../services/strategyService';
import { createSignal } from '../services/signalService';

// Maximum execution limits for safety
const STRATEGY_TIMEOUT_MS = 5000;

// Duplicate signal lookback period (in seconds)
const DUPLICATE_LOOKBACK_CANDLES = 5;

export interface StrategyEvaluationResult {
    wouldSignal: boolean;
    direction?: TradeDirection;
    reason: string;
}

export interface EngineRunResult {
    success: boolean;
    signalsCreated: number;
    errors: string[];
}

export type StrategyResult =
    | { ok: true; signals: StrategyEvaluationResult[] }
    | { ok: false; error: string };

export interface RiskSettings {
    lot_size?: number;
    risk_percent?: number;
    take_profit_distance?: number;
    stop_loss_distance?: number;
    trailing_stop_loss_distance?: number;
    leverage?: number;
}

/**
 * Load all active strategies from database
 */
export const loadActiveStrategies = async (): Promise<Strategy[]> => {
    try {
        const allStrategies = await getStrategies();
        return allStrategies.filter((s) => s.isActive && s.type === 'STRATEGY');
    } catch (error) {
        console.error('Failed to load active strategies:', error);
        return [];
    }
};

/**
 * Evaluate a generic Kuri Strategy
 * Compiles and runs the Kuri script, then checks for 'buy' / 'sell' signals
 */
const runKuriStrategy = async (strategy: Strategy, candles: Candle[]): Promise<StrategyResult> => {
    if (!strategy.content || !strategy.content.code) {
        return { ok: false, error: `Strategy "${strategy.name}" has no code` };
    }

    try {
        // 1. Prepare Context
        const context: Context = {
            open: candles.map((c) => c.open),
            high: candles.map((c) => c.high),
            low: candles.map((c) => c.low),
            close: candles.map((c) => c.close),
            volume: candles.map((c) => c.volume),
        };

        // 2. Execute using Kuri.compileIR and BackendVM
        const ir = Kuri.compileIR(strategy.content.code);
        const vm = new BackendVM(context);
        const result = vm.run(ir);

        // 3. Check for signals in the LAST candle
        // The script defines 'buy' and 'sell' boolean series
        const buySeries = result.variables['buy'];
        const sellSeries = result.variables['sell'];

        // Safety check: Ensure they are arrays
        if (!Array.isArray(buySeries) || !Array.isArray(sellSeries)) {
            // Script might not define buy/sell, or they are not series
            // This is valid, just means no signals
            return { ok: true, signals: [] };
        }

        const lastIndex = candles.length - 1;
        const buySignal = buySeries[lastIndex];
        const sellSignal = sellSeries[lastIndex];

        const evaluationResults: StrategyEvaluationResult[] = [];

        if (buySignal) {
            evaluationResults.push({
                wouldSignal: true,
                direction: TradeDirection.BUY,
                reason: 'Kuri Script Buy Signal',
            });
        }

        if (sellSignal) {
            evaluationResults.push({
                wouldSignal: true,
                direction: TradeDirection.SELL,
                reason: 'Kuri Script Sell Signal',
            });
        }

        return { ok: true, signals: evaluationResults };
    } catch (error: any) {
        console.error(`Kuri execution failed for ${strategy.name}:`, error);
        return {
            ok: false,
            error: `Strategy execution failed for "${strategy.name}": ${error.message}`,
        };
    }
};

/**
 * Evaluate a single strategy against candle data
 * Returns signals that would be generated (not yet persisted)
 *
 * Note: Only KURI strategies are supported. All other strategy types return empty array.
 */
export const runStrategy = async (
    strategy: Strategy,
    candles: Candle[]
): Promise<StrategyResult> => {
    // Safety checks
    if (!strategy || !candles || candles.length === 0) {
        return { ok: false, error: 'Missing strategy or candle data' };
    }

    // --- KURI STRATEGY EXECUTION ---
    if (strategy.type === 'KURI') {
        return runKuriStrategy(strategy, candles);
    }
    // -------------------------------

    // All other strategy types are not supported (indicator-based strategies removed)
    console.warn(
        `Strategy type ${strategy.type} is not supported. Only KURI strategies are supported.`
    );
    return {
        ok: false,
        error: `Strategy type ${strategy.type} is not supported. Only KURI strategies are supported.`,
    };
};

/**
 * Run all active strategies for a specific symbol and timeframe
 * Creates signals in database
 *
 * Note: This is currently stubbed as a placeholder. Implementation will be added later.
 */
export const runAllStrategies = async (
    symbol: string,
    timeframe: string,
    candles: Candle[],
    strategies: Strategy[] | null = null,
    riskSettings: RiskSettings | null = null
): Promise<EngineRunResult> => {
    const result: EngineRunResult = {
        success: true,
        signalsCreated: 0,
        errors: [],
    };

    // TODO: Implement full strategy execution logic
    // For now, return empty result
    console.log(`runAllStrategies called for ${symbol} ${timeframe} - not yet implemented`);

    return result;
};

/**
 * Calculate stop loss based on entry candle high/low
 * Buy: SL below entry candle Low
 * Sell: SL above entry candle High
 */
const calculateStopLoss = (candle: Candle, direction: TradeDirection): number => {
    // Add small buffer (e.g., 0.1%) to avoid being stopped out exactly at the wick
    const bufferPercent = 0.001;

    if (direction === TradeDirection.BUY) {
        return candle.low * (1 - bufferPercent);
    } else {
        return candle.high * (1 + bufferPercent);
    }
};

/**
 * Calculate take profit based on Risk:Reward ratio 1:2
 */
const calculateTakeProfit = (
    entryPrice: number,
    stopLoss: number,
    direction: TradeDirection
): number => {
    const risk = Math.abs(entryPrice - stopLoss);
    const reward = risk * 2; // 1:2 Ratio

    if (direction === TradeDirection.BUY) {
        return entryPrice + reward;
    } else {
        return entryPrice - reward;
    }
};

/**
 * Evaluate if strategy would generate signal on latest candle
 * For debugging/testing purposes
 */
export const evaluateStrategy = async (
    strategy: Strategy,
    candles: Candle[]
): Promise<StrategyEvaluationResult> => {
    const result = await runStrategy(strategy, candles);

    if (!result.ok) {
        return { wouldSignal: false, reason: result.error };
    }

    if (result.signals.length === 0) {
        return { wouldSignal: false, reason: 'No signals generated' };
    }

    return result.signals[0];
};
