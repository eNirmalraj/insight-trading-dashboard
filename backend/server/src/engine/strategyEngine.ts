// backend/server/src/engine/strategyEngine.ts
// Strategy Evaluation Engine

import { Candle, calculateIndicator, detectCrossover } from './indicators';
import { BuiltInStrategy, EntryRule, TradeDirection, BUILT_IN_STRATEGIES, ExitRule, ExitType } from '../constants/builtInStrategies';
import { Kuri } from '../kuri/kuri';

export interface SignalResult {
    wouldSignal: boolean;
    direction?: TradeDirection;
    reason: string;
    strategyId: string;
    strategyName: string;
    exitRules?: ExitRule[];
}

/**
 * Helper to get indicator series by key
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
    rule: EntryRule,
    indicators: Record<string, Record<string, (number | null)[]>>,
    candles: Candle[]
): { triggered: boolean; direction?: TradeDirection; reason: string } => {
    const latestIndex = candles.length - 1;

    try {
        switch (rule.condition) {
            case 'crossover':
            case 'crossunder': {
                const series1 = getSeries(rule.indicator1, indicators, candles);
                const series2 = getSeries(rule.indicator2!, indicators, candles);

                if (!series1 || !series2) {
                    return { triggered: false, reason: 'Missing indicator data' };
                }

                const crossover = detectCrossover(series1, series2, latestIndex);

                if (rule.condition === 'crossover' && crossover === 'up') {
                    return {
                        triggered: true,
                        direction: rule.direction,
                        reason: `${rule.indicator1} crossed above ${rule.indicator2}`
                    };
                }

                if (rule.condition === 'crossunder' && crossover === 'down') {
                    return {
                        triggered: true,
                        direction: rule.direction,
                        reason: `${rule.indicator1} crossed below ${rule.indicator2}`
                    };
                }

                return { triggered: false, reason: 'No crossover detected' };
            }

            case 'greater_than': {
                const series1 = getSeries(rule.indicator1, indicators, candles);
                if (!series1) return { triggered: false, reason: 'Missing indicator1 data' };

                const val1 = series1[latestIndex];
                if (val1 === null || val1 === undefined) return { triggered: false, reason: 'No value for indicator1' };

                // Compare against Indicator 2
                if (rule.indicator2) {
                    const series2 = getSeries(rule.indicator2, indicators, candles);
                    if (!series2) return { triggered: false, reason: 'Missing indicator2 data' };

                    const val2 = series2[latestIndex];
                    if (val2 === null || val2 === undefined) return { triggered: false, reason: 'No value for indicator2' };

                    if (val1 > val2) {
                        return { triggered: true, direction: rule.direction, reason: `${rule.indicator1} (${val1.toFixed(2)}) > ${rule.indicator2} (${val2.toFixed(2)})` };
                    }
                }
                // Compare against Static Value
                else {
                    if (val1 > (rule.value || 0)) {
                        return { triggered: true, direction: rule.direction, reason: `${rule.indicator1} (${val1.toFixed(2)}) > ${rule.value}` };
                    }
                }
                return { triggered: false, reason: 'Condition not met' };
            }

            case 'less_than': {
                const series1 = getSeries(rule.indicator1, indicators, candles);
                if (!series1) return { triggered: false, reason: 'Missing indicator1 data' };

                const val1 = series1[latestIndex];
                if (val1 === null || val1 === undefined) return { triggered: false, reason: 'No value for indicator1' };

                // Compare against Indicator 2
                if (rule.indicator2) {
                    const series2 = getSeries(rule.indicator2, indicators, candles);
                    if (!series2) return { triggered: false, reason: 'Missing indicator2 data' };

                    const val2 = series2[latestIndex];
                    if (val2 === null || val2 === undefined) return { triggered: false, reason: 'No value for indicator2' };

                    if (val1 < val2) {
                        return { triggered: true, direction: rule.direction, reason: `${rule.indicator1} (${val1.toFixed(2)}) < ${rule.indicator2} (${val2.toFixed(2)})` };
                    }
                }
                // Compare against Static Value
                else {
                    if (val1 < (rule.value || 0)) {
                        return { triggered: true, direction: rule.direction, reason: `${rule.indicator1} (${val1.toFixed(2)}) < ${rule.value}` };
                    }
                }
                return { triggered: false, reason: 'Condition not met' };
            }

            default:
                return { triggered: false, reason: 'Unknown condition' };
        }
    } catch (error) {
        console.error('Error evaluating entry rule:', error);
        return { triggered: false, reason: 'Evaluation error' };
    }
};

/**
 * Run a single strategy against candle data
 */
export const runStrategy = (
    strategy: BuiltInStrategy,
    candles: Candle[]
): SignalResult[] => {
    if (!candles || candles.length < 50) {
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
        const results: SignalResult[] = [];

        for (const rule of strategy.entryRules) {
            const result = evaluateEntryRule(rule, calculatedIndicators, candles);
            if (result.triggered) {
                results.push({
                    wouldSignal: true,
                    direction: result.direction,
                    reason: result.reason,
                    strategyId: strategy.id,
                    strategyName: strategy.name,
                    exitRules: strategy.exitRules
                });
            }
        }

        return results;
    } catch (error) {
        console.error(`Error running strategy ${strategy.name}:`, error);
        return [];
    }
};

/**
 * Execute a Kuri script strategy
 */
const runKuriStrategy = (
    strategy: BuiltInStrategy,
    candles: Candle[]
): SignalResult[] => {
    try {
        if (!strategy.kuriScript) return [];

        // Prepare Context
        const context = {
            open: candles.map(c => c.open),
            high: candles.map(c => c.high),
            low: candles.map(c => c.low),
            close: candles.map(c => c.close),
            volume: candles.map(c => c.volume)
        };

        // Execute Script
        const result = Kuri.execute(strategy.kuriScript, context);

        // Check for Buy/Sell Signals
        // Kuri convention: buy_signal = boolean, sell_signal = boolean (Series or single value)
        const buySignal = result['buy_signal'];
        const sellSignal = result['sell_signal'];

        const latestIndex = candles.length - 1;
        const isBuy = Array.isArray(buySignal) ? buySignal[latestIndex] : buySignal;
        const isSell = Array.isArray(sellSignal) ? sellSignal[latestIndex] : sellSignal;

        const results: SignalResult[] = [];

        if (isBuy) {
            results.push({
                wouldSignal: true,
                direction: TradeDirection.BUY,
                reason: 'Kuri Script Buy Signal',
                strategyId: strategy.id,
                strategyName: strategy.name,
                exitRules: strategy.exitRules
            });
        }

        if (isSell) {
            results.push({
                wouldSignal: true,
                direction: TradeDirection.SELL,
                reason: 'Kuri Script Sell Signal',
                strategyId: strategy.id,
                strategyName: strategy.name,
                exitRules: strategy.exitRules
            });
        }

        return results;

    } catch (error) {
        console.error(`Error running Kuri strategy ${strategy.name}:`, error);
        return [];
    }
};

/**
 * Run all built-in strategies against candle data
 */
export const runAllBuiltInStrategies = (candles: Candle[]): SignalResult[] => {
    const allResults: SignalResult[] = [];

    for (const strategy of BUILT_IN_STRATEGIES) {
        if (strategy.kuriScript) {
            const results = runKuriStrategy(strategy, candles);
            allResults.push(...results);
        } else {
            const results = runStrategy(strategy, candles);
            allResults.push(...results);
        }
    }

    return allResults;
};

/**
 * Calculate stop loss and take profit
 */
export const calculateRiskLevels = (
    entryPrice: number,
    direction: TradeDirection,
    exitRules?: ExitRule[]
): { stopLoss: number | null; takeProfit: number | null } => {
    let stopLoss: number | null = null;
    let takeProfit: number | null = null;

    if (!exitRules || exitRules.length === 0) {
        return { stopLoss, takeProfit };
    }

    for (const rule of exitRules) {
        if (rule.type === ExitType.STOP_LOSS) {
            if (rule.unit === 'PERCENTAGE') {
                stopLoss = direction === TradeDirection.BUY
                    ? entryPrice * (1 - rule.value)
                    : entryPrice * (1 + rule.value);
            }
            // Support for fixed value could be added here if needed
        } else if (rule.type === ExitType.TAKE_PROFIT) {
            if (rule.unit === 'PERCENTAGE') {
                takeProfit = direction === TradeDirection.BUY
                    ? entryPrice * (1 + rule.value)
                    : entryPrice * (1 - rule.value);
            }
        }
    }

    return { stopLoss, takeProfit };
};
