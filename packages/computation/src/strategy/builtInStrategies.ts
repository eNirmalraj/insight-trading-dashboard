// @insight/computation — Built-In Strategy Definitions
// Single source of truth for all built-in strategies.
// Rule-based format: indicators + entryRules (no scripting language needed).

import { BuiltInStrategy, StrategyCategory, TradeDirection, ExitType } from '@insight/types';

export const BUILT_IN_STRATEGIES: BuiltInStrategy[] = [
    {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'SMA Trend Strategy',
        description: 'Simple Moving Average Trend Following Strategy. Buys when price closes above SMA 20, Sells when price closes below SMA 20.',
        category: StrategyCategory.TREND_FOLLOWING,
        indicators: [
            { id: 'sma_20', type: 'SMA', parameters: { period: 20 } }
        ],
        entryRules: [
            {
                id: 'sma_buy',
                condition: 'crossover',
                indicator1: 'CLOSE',
                indicator2: 'SMA_20',
                direction: TradeDirection.BUY
            },
            {
                id: 'sma_sell',
                condition: 'crossunder',
                indicator1: 'CLOSE',
                indicator2: 'SMA_20',
                direction: TradeDirection.SELL
            }
        ],
        exitRules: [
            { id: 'sl', type: ExitType.STOP_LOSS, value: 2.0, unit: 'PERCENTAGE' },
            { id: 'tp', type: ExitType.TAKE_PROFIT, value: 4.0, unit: 'PERCENTAGE' }
        ]
    },
    {
        id: '22222222-2222-2222-2222-222222222222',
        name: 'EMA Trend Strategy',
        description: 'Exponential Moving Average Trend Following Strategy. Buys when price closes above EMA 20, Sells when price closes below EMA 20.',
        category: StrategyCategory.TREND_FOLLOWING,
        indicators: [
            { id: 'ema_20', type: 'EMA', parameters: { period: 20 } }
        ],
        entryRules: [
            {
                id: 'ema_buy',
                condition: 'crossover',
                indicator1: 'CLOSE',
                indicator2: 'EMA_20',
                direction: TradeDirection.BUY
            },
            {
                id: 'ema_sell',
                condition: 'crossunder',
                indicator1: 'CLOSE',
                indicator2: 'EMA_20',
                direction: TradeDirection.SELL
            }
        ],
        exitRules: [
            { id: 'sl', type: ExitType.STOP_LOSS, value: 1.5, unit: 'PERCENTAGE' },
            { id: 'tp', type: ExitType.TAKE_PROFIT, value: 3.0, unit: 'PERCENTAGE' }
        ]
    }
];
