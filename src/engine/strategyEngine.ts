// src/engine/strategyEngine.ts
// Strategy Signal Generation Engine - Converts strategies into trade signals

import { Strategy, TradeDirection, SignalStatus, EntryType, StrategyCategory } from '../types';
import { Candle } from '../components/market-chart/types';
import { calculateIndicator, detectCrossover } from './indicators';
import { getStrategies } from '../services/strategyService';
import { createSignal, isDuplicateSignal } from '../services/signalService';

// Maximum execution limits for safety
const MAX_INDICATORS_PER_STRATEGY = 10;
const MAX_ENTRY_RULES_PER_STRATEGY = 20;
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

/**
 * Load all active strategies from database
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
 * Evaluate a single strategy against candle data
 * Returns signals that would be generated (not yet persisted)
 */
export const runStrategy = async (
    strategy: Strategy,
    candles: Candle[]
): Promise<StrategyEvaluationResult[]> => {
    // Safety checks
    if (!strategy || !candles || candles.length === 0) {
        return [];
    }

    if (strategy.indicators.length > MAX_INDICATORS_PER_STRATEGY) {
        console.warn(`Strategy ${strategy.name} has too many indicators (${strategy.indicators.length})`);
        return [];
    }

    if (strategy.entryRules.length > MAX_ENTRY_RULES_PER_STRATEGY) {
        console.warn(`Strategy ${strategy.name} has too many entry rules (${strategy.entryRules.length})`);
        return [];
    }

    try {
        // Calculate all indicators
        const calculatedIndicators: Record<string, Record<string, (number | null)[]>> = {};

        for (const indicator of strategy.indicators) {
            const indicatorKey = `${indicator.type}_${indicator.parameters.period || 'default'}`;
            calculatedIndicators[indicatorKey] = calculateIndicator(
                indicator.type,
                candles,
                indicator.parameters
            );
        }

        // Evaluate entry rules
        const results: StrategyEvaluationResult[] = [];

        for (const rule of strategy.entryRules) {
            const result = evaluateEntryRule(rule, calculatedIndicators, candles);
            if (result.wouldSignal) {
                results.push(result);
            }
        }

        return results;
    } catch (error) {
        console.error(`Error running strategy ${strategy.name}:`, error);
        return [];
    }
};

/**
 * Helper to get indicator series by key, handling 'CLOSE' and multipart keys
 */
const getSeries = (
    key: string,
    indicators: Record<string, Record<string, (number | null)[]>>,
    candles: Candle[]
): (number | null)[] | undefined => {
    // 1. Special 'CLOSE' keyword
    if (key === 'CLOSE') {
        return candles.map(c => c.close);
    }

    // 2. Direct match (e.g. 'EMA_9' -> { main: [...] })
    if (indicators[key]?.main) {
        return indicators[key].main;
    }

    // 3. Multipart match (e.g. 'BOLLINGER_BANDS_20_upper')
    // Split by last underscore
    const lastUnderscoreIndex = key.lastIndexOf('_');
    if (lastUnderscoreIndex !== -1) {
        const baseKey = key.substring(0, lastUnderscoreIndex);
        const subKey = key.substring(lastUnderscoreIndex + 1);

        if (indicators[baseKey] && indicators[baseKey][subKey]) {
            return indicators[baseKey][subKey];
        }
    }

    return undefined;
};

/**
 * Evaluate a single entry rule
 */
const evaluateEntryRule = (
    rule: any,
    indicators: Record<string, Record<string, (number | null)[]>>,
    candles: Candle[]
): StrategyEvaluationResult => {
    const latestIndex = candles.length - 1;

    try {
        switch (rule.condition) {
            case 'crossover':
            case 'crossunder': {
                // Get indicator series
                const series1 = getSeries(rule.indicator1, indicators, candles);
                const series2 = getSeries(rule.indicator2, indicators, candles);

                if (!series1 || !series2) {
                    return { wouldSignal: false, reason: 'Missing indicator data' };
                }

                const crossover = detectCrossover(series1, series2, latestIndex);

                if (rule.condition === 'crossover' && crossover === 'up') {
                    return {
                        wouldSignal: true,
                        direction: rule.direction,
                        reason: `${rule.indicator1} crossed above ${rule.indicator2}`
                    };
                }

                if (rule.condition === 'crossunder' && crossover === 'down') {
                    return {
                        wouldSignal: true,
                        direction: rule.direction,
                        reason: `${rule.indicator1} crossed below ${rule.indicator2}`
                    };
                }

                return { wouldSignal: false, reason: 'No crossover detected' };
            }

            case 'greater_than': {
                const series1 = getSeries(rule.indicator1, indicators, candles);
                if (!series1) {
                    return { wouldSignal: false, reason: 'Missing indicator data' };
                }

                const currentValue1 = series1[latestIndex];
                if (currentValue1 === null || currentValue1 === undefined) {
                    return { wouldSignal: false, reason: 'No indicator value' };
                }

                // Check for second indicator comparison
                if (rule.indicator2) {
                    const series2 = getSeries(rule.indicator2, indicators, candles);
                    if (!series2) {
                        return { wouldSignal: false, reason: 'Missing second indicator data' };
                    }
                    const currentValue2 = series2[latestIndex];
                    if (currentValue2 === null || currentValue2 === undefined) {
                        return { wouldSignal: false, reason: 'No second indicator value' };
                    }

                    if (currentValue1 > currentValue2) {
                        return {
                            wouldSignal: true,
                            direction: rule.direction,
                            reason: `${rule.indicator1} (${currentValue1.toFixed(2)}) > ${rule.indicator2} (${currentValue2.toFixed(2)})`
                        };
                    }
                } else {
                    // Static value comparison
                    if (currentValue1 > (rule.value || 0)) {
                        return {
                            wouldSignal: true,
                            direction: rule.direction,
                            reason: `${rule.indicator1} (${currentValue1.toFixed(2)}) > ${rule.value}`
                        };
                    }
                }

                return { wouldSignal: false, reason: 'Condition not met' };
            }

            case 'less_than': {
                const series1 = getSeries(rule.indicator1, indicators, candles);
                if (!series1) {
                    return { wouldSignal: false, reason: 'Missing indicator data' };
                }

                const currentValue1 = series1[latestIndex];
                if (currentValue1 === null || currentValue1 === undefined) {
                    return { wouldSignal: false, reason: 'No indicator value' };
                }

                // Check for second indicator comparison
                if (rule.indicator2) {
                    const series2 = getSeries(rule.indicator2, indicators, candles);
                    if (!series2) {
                        return { wouldSignal: false, reason: 'Missing second indicator data' };
                    }
                    const currentValue2 = series2[latestIndex];
                    if (currentValue2 === null || currentValue2 === undefined) {
                        return { wouldSignal: false, reason: 'No second indicator value' };
                    }

                    if (currentValue1 < currentValue2) {
                        return {
                            wouldSignal: true,
                            direction: rule.direction,
                            reason: `${rule.indicator1} (${currentValue1.toFixed(2)}) < ${rule.indicator2} (${currentValue2.toFixed(2)})`
                        };
                    }
                } else {
                    // Static value comparison
                    if (currentValue1 < (rule.value || 0)) {
                        return {
                            wouldSignal: true,
                            direction: rule.direction,
                            reason: `${rule.indicator1} (${currentValue1.toFixed(2)}) < ${rule.value}`
                        };
                    }
                }

                return { wouldSignal: false, reason: 'Condition not met' };
            }

            default:
                console.warn(`Unknown rule condition: ${rule.condition}`);
                return { wouldSignal: false, reason: 'Unknown condition' };
        }
    } catch (error) {
        console.error('Error evaluating entry rule:', error);
        return { wouldSignal: false, reason: 'Evaluation error' };
    }
};

/**
 * Run all active strategies for a specific symbol and timeframe
 * Creates signals in database
 */
export const runAllStrategies = async (
    symbol: string,
    timeframe: string,
    candles: Candle[],
    strategies: Strategy[] | null = null // Optional override
): Promise<EngineRunResult> => {
    const result: EngineRunResult = {
        success: true,
        signalsCreated: 0,
        errors: []
    };

    try {
        // Load active strategies if not provided
        const activeStrategies = strategies || await loadActiveStrategies();

        if (activeStrategies.length === 0) {
            return result;
        }

        // Get current time for duplicate detection
        const currentTime = candles.length > 0 ? candles[candles.length - 1].time : Math.floor(Date.now() / 1000);

        // Calculate lookback period in seconds
        // Assuming typical timeframe intervals
        const timeframeSeconds: Record<string, number> = {
            '1m': 60, '5m': 300, '15m': 900, '30m': 1800,
            '1H': 3600, '4H': 14400, '1D': 86400
        };
        const intervalSeconds = timeframeSeconds[timeframe] || 3600;
        const lookbackSeconds = DUPLICATE_LOOKBACK_CANDLES * intervalSeconds;

        // Run each strategy
        for (const strategy of activeStrategies) {
            try {
                // Check if strategy applies to this symbol (skip if empty scope is "all")
                // NOTE: For builtin strategies, we usually ignore scope or set it to empty for "all"
                const normalizedSymbol = symbol.replace('/', '').toUpperCase();
                const strategySymbols = (strategy.symbolScope || []).map(s => s.replace('/', '').toUpperCase());

                if (strategySymbols.length > 0 && !strategySymbols.includes(normalizedSymbol)) {
                    continue; // Skip strategy if symbol not in scope
                }

                // Run strategy with timeout
                const evaluationPromise = runStrategy(strategy, candles);
                const timeoutPromise = new Promise<StrategyEvaluationResult[]>((_, reject) =>
                    setTimeout(() => reject(new Error('Strategy timeout')), STRATEGY_TIMEOUT_MS)
                );

                const evaluations = await Promise.race([evaluationPromise, timeoutPromise]) as StrategyEvaluationResult[];

                // Create signals for positive evaluations
                for (const evaluation of evaluations) {
                    if (!evaluation.wouldSignal || !evaluation.direction) {
                        continue;
                    }

                    // Check for duplicates
                    const isDuplicate = await isDuplicateSignal(
                        strategy.id,
                        symbol,
                        evaluation.direction,
                        currentTime,
                        lookbackSeconds
                    );

                    if (isDuplicate) {
                        console.log(`Duplicate signal prevented for ${strategy.name} on ${symbol}`);
                        continue;
                    }

                    // Create the signal
                    const latestCandle = candles[candles.length - 1];
                    const stopLoss = calculateStopLoss(latestCandle, evaluation.direction);
                    const takeProfit = calculateTakeProfit(latestCandle.close, stopLoss, evaluation.direction);

                    // Determine initial status based on order type
                    // MARKET orders execute immediately → ACTIVE
                    // LIMIT/STOP orders wait for entry → PENDING
                    const orderType = EntryType.MARKET; // SMA/EMA strategies use MARKET orders
                    const initialStatus = orderType === EntryType.MARKET
                        ? SignalStatus.ACTIVE
                        : SignalStatus.PENDING;

                    await createSignal({
                        pair: symbol,
                        strategy: strategy.name,
                        strategyId: strategy.id,
                        direction: evaluation.direction,
                        entry: latestCandle.close,
                        entryType: orderType,
                        stopLoss: stopLoss,
                        takeProfit: takeProfit,
                        timeframe: timeframe as any,
                        status: initialStatus,
                        timestamp: new Date(currentTime * 1000).toISOString()
                    });

                    result.signalsCreated++;
                    console.log(`✨ Signal created: ${strategy.name} ${evaluation.direction} ${symbol} @ ${latestCandle.close} SL:${stopLoss.toFixed(2)} TP:${takeProfit.toFixed(2)} [${initialStatus}]`);
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
const calculateTakeProfit = (entryPrice: number, stopLoss: number, direction: TradeDirection): number => {
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
    const results = await runStrategy(strategy, candles);

    if (results.length === 0) {
        return { wouldSignal: false, reason: 'No signals generated' };
    }

    return results[0];
};
