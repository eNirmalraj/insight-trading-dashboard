// backend/server/src/engine/strategyEngine.ts
// Strategy Evaluation Engine

import { Candle } from './indicators';
import { BuiltInStrategy, TradeDirection, BUILT_IN_STRATEGIES, ExitRule, ExitType } from '../constants/builtInStrategies';
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

        // Execute Script using the new BackendVM execution path
        const result = Kuri.executeWithVM(strategy.kuriScript, context);

        // Check for Buy/Sell Signals
        // 1. Support legacy variables (buy_signal/sell_signal)
        const buyVar = result.variables['buy_signal'];
        const sellVar = result.variables['sell_signal'];

        const latestIndex = candles.length - 1;
        const isBuyVar = Array.isArray(buyVar) ? buyVar[latestIndex] : buyVar;
        const isSellVar = Array.isArray(sellVar) ? sellVar[latestIndex] : sellVar;

        // 2. Support modern strategy signals (strategy.entry)
        const entrySignals = result.signals.filter(s => s.type === 'ENTRY' && s.timestamp === latestIndex);

        const results: SignalResult[] = [];

        // Priority: strategy.entry() > buy_signal variable
        if (entrySignals.length > 0) {
            for (const signal of entrySignals) {
                // Determine exit rules: Script defined SL/TP takes priority
                const exitRules: ExitRule[] = [...(strategy.exitRules || [])];

                if (result.stopLoss !== undefined) {
                    // Update or add stop loss
                    const slIndex = exitRules.findIndex(r => r.type === ExitType.STOP_LOSS);
                    if (slIndex !== -1) {
                        exitRules[slIndex] = { ...exitRules[slIndex], value: result.stopLoss };
                    } else {
                        exitRules.push({ id: 'script_sl', type: ExitType.STOP_LOSS, value: result.stopLoss, unit: 'PERCENTAGE' });
                    }
                }

                if (result.takeProfit !== undefined) {
                    // Update or add take profit
                    const tpIndex = exitRules.findIndex(r => r.type === ExitType.TAKE_PROFIT);
                    if (tpIndex !== -1) {
                        exitRules[tpIndex] = { ...exitRules[tpIndex], value: result.takeProfit };
                    } else {
                        exitRules.push({ id: 'script_tp', type: ExitType.TAKE_PROFIT, value: result.takeProfit, unit: 'PERCENTAGE' });
                    }
                }

                results.push({
                    wouldSignal: true,
                    direction: signal.direction === 'LONG' ? TradeDirection.BUY : TradeDirection.SELL,
                    reason: `Kuri Strategy: ${signal.id}`,
                    strategyId: strategy.id,
                    strategyName: strategy.name,
                    exitRules
                });
            }
        }
        // Fallback to buy_signal/sell_signal for backward compatibility
        else if (isBuyVar || isSellVar) {
            // Use static exit rules from strategy definition
            const exitRules = strategy.exitRules || [];

            // Still check if the script defined default SL/TP via strategy.exit_sl/tp
            const effectiveExitRules: ExitRule[] = [...exitRules];
            if (result.stopLoss !== undefined) {
                effectiveExitRules.push({ id: 'script_sl', type: ExitType.STOP_LOSS, value: result.stopLoss, unit: 'PERCENTAGE' });
            }
            if (result.takeProfit !== undefined) {
                effectiveExitRules.push({ id: 'script_tp', type: ExitType.TAKE_PROFIT, value: result.takeProfit, unit: 'PERCENTAGE' });
            }

            if (isBuyVar) {
                results.push({
                    wouldSignal: true,
                    direction: TradeDirection.BUY,
                    reason: 'Kuri Script Buy Signal',
                    strategyId: strategy.id,
                    strategyName: strategy.name,
                    exitRules: effectiveExitRules
                });
            }

            if (isSellVar) {
                results.push({
                    wouldSignal: true,
                    direction: TradeDirection.SELL,
                    reason: 'Kuri Script Sell Signal',
                    strategyId: strategy.id,
                    strategyName: strategy.name,
                    exitRules: effectiveExitRules
                });
            }
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
            // console.log(`[TRACE] Running Kuri for:`, strategy.name);
            const results = runKuriStrategy(strategy, candles);
            // console.log(`[TRACE] VM signals:`, results.length);
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
