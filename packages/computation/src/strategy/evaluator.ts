// @insight/computation — Strategy Evaluation (Pure Computation)
// Unified strategy evaluation logic for both frontend and backend.
// NO I/O, NO DB, NO DOM — pure functions only.

import { Candle } from '@insight/types';
import { calculateIndicator, detectCrossover } from '../indicators';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

/** Result of evaluating a strategy against candle data */
export interface StrategyEvaluationResult {
    wouldSignal: boolean;
    direction?: 'BUY' | 'SELL';
    reason: string;
    strategyId?: string;
    strategyName?: string;
    exitRules?: ExitRule[];
}

/** Exit rule definition */
export interface ExitRule {
    id: string;
    type: 'STOP_LOSS' | 'TAKE_PROFIT';
    value: number;
    unit: 'PERCENTAGE' | 'FIXED';
}

/** Risk settings for signal creation */
export interface RiskSettings {
    lot_size?: number;
    risk_percent?: number;
    take_profit_distance?: number;
    stop_loss_distance?: number;
    trailing_stop_loss_distance?: number;
    leverage?: number;
}

/** Strategy definition (minimal interface needed for evaluation) */
export interface StrategyInput {
    id: string;
    name: string;
    type?: string;
    indicators: Array<{
        type: string;
        parameters: Record<string, any>;
    }>;
    entryRules: Array<{
        condition: string;
        indicator1: string;
        indicator2?: string;
        value?: number;
        direction: 'BUY' | 'SELL';
    }>;
    exitRules?: ExitRule[];
    symbolScope?: string[];
}

// ─────────────────────────────────────────────────────────────
// Safety Constants
// ─────────────────────────────────────────────────────────────

const MAX_INDICATORS_PER_STRATEGY = 10;
const MAX_ENTRY_RULES_PER_STRATEGY = 20;

// ─────────────────────────────────────────────────────────────
// Core: Rule-Based Strategy Evaluation
// ─────────────────────────────────────────────────────────────

/**
 * Evaluate a single strategy against candle data.
 * Returns signals that would be generated (not persisted — pure computation).
 */
export const evaluateStrategy = (
    strategy: StrategyInput,
    candles: Candle[]
): StrategyEvaluationResult[] => {
    if (!strategy || !candles || candles.length === 0) return [];

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
            const key = `${indicator.type}_${indicator.parameters.period || 'default'}`;
            calculatedIndicators[key] = calculateIndicator(indicator.type, candles, indicator.parameters);
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

// ─────────────────────────────────────────────────────────────
// Entry Rule Evaluation
// ─────────────────────────────────────────────────────────────

/**
 * Evaluate a single entry rule against indicator data (pure computation).
 */
export const evaluateEntryRule = (
    rule: {
        condition: string;
        indicator1: string;
        indicator2?: string;
        value?: number;
        direction: 'BUY' | 'SELL';
    },
    indicators: Record<string, Record<string, (number | null)[]>>,
    candles: Candle[]
): StrategyEvaluationResult => {
    const latestIndex = candles.length - 1;

    try {
        switch (rule.condition) {
            case 'crossover':
            case 'crossunder': {
                const series1 = getSeries(rule.indicator1, indicators, candles);
                const series2 = getSeries(rule.indicator2!, indicators, candles);
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

            case 'greater_than':
                return _evaluateComparison(rule, indicators, candles, '>');

            case 'less_than':
                return _evaluateComparison(rule, indicators, candles, '<');

            default:
                console.warn(`Unknown rule condition: ${rule.condition}`);
                return { wouldSignal: false, reason: 'Unknown condition' };
        }
    } catch (error) {
        console.error('Error evaluating entry rule:', error);
        return { wouldSignal: false, reason: 'Evaluation error' };
    }
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Get indicator series by key. Handles 'CLOSE' and multipart keys.
 */
export const getSeries = (
    key: string,
    indicators: Record<string, Record<string, (number | null)[]>>,
    candles: Candle[]
): (number | null)[] | undefined => {
    if (key === 'CLOSE') return candles.map(c => c.close);
    if (key === 'OPEN') return candles.map(c => c.open);
    if (key === 'HIGH') return candles.map(c => c.high);
    if (key === 'LOW') return candles.map(c => c.low);
    if (key === 'VOLUME') return candles.map(c => c.volume);

    // Direct match
    if (indicators[key]?.main) return indicators[key].main;

    // Multipart match (e.g. 'BOLLINGER_BANDS_20_upper')
    const lastUnderscoreIndex = key.lastIndexOf('_');
    if (lastUnderscoreIndex !== -1) {
        const baseKey = key.substring(0, lastUnderscoreIndex);
        const subKey = key.substring(lastUnderscoreIndex + 1);
        if (indicators[baseKey]?.[subKey]) return indicators[baseKey][subKey];
    }

    return undefined;
};

/** Helper: comparison evaluation for greater_than / less_than rules */
function _evaluateComparison(
    rule: { indicator1: string; indicator2?: string; value?: number; direction: 'BUY' | 'SELL' },
    indicators: Record<string, Record<string, (number | null)[]>>,
    candles: Candle[],
    op: '>' | '<'
): StrategyEvaluationResult {
    const latestIndex = candles.length - 1;
    const series1 = getSeries(rule.indicator1, indicators, candles);
    if (!series1) return { wouldSignal: false, reason: 'Missing indicator data' };

    const val1 = series1[latestIndex];
    if (val1 === null || val1 === undefined) return { wouldSignal: false, reason: 'No indicator value' };

    if (rule.indicator2) {
        const series2 = getSeries(rule.indicator2, indicators, candles);
        if (!series2) return { wouldSignal: false, reason: 'Missing second indicator data' };
        const val2 = series2[latestIndex];
        if (val2 === null || val2 === undefined) return { wouldSignal: false, reason: 'No second indicator value' };

        const matches = op === '>' ? val1 > val2 : val1 < val2;
        if (matches) {
            return {
                wouldSignal: true,
                direction: rule.direction,
                reason: `${rule.indicator1} (${val1.toFixed(2)}) ${op} ${rule.indicator2} (${val2.toFixed(2)})`
            };
        }
    } else {
        const threshold = rule.value || 0;
        const matches = op === '>' ? val1 > threshold : val1 < threshold;
        if (matches) {
            return {
                wouldSignal: true,
                direction: rule.direction,
                reason: `${rule.indicator1} (${val1.toFixed(2)}) ${op} ${threshold}`
            };
        }
    }

    return { wouldSignal: false, reason: 'Condition not met' };
}
