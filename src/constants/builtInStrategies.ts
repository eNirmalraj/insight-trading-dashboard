import { Strategy, StrategyCategory, TradeDirection, EntryType } from '../types';

export const BUILT_IN_STRATEGIES: Strategy[] = [
    {
        id: 'builtin-ma-crossover',
        name: 'MA Crossover',
        description: 'Classic trend following strategy using EMA 9 and EMA 21 crossover',
        type: 'STRATEGY',
        category: StrategyCategory.TREND_FOLLOWING,
        symbolScope: [], // Applies to all if empty or handled dynamically
        timeframe: '1H', // Default, overridden by execution context
        isActive: true,
        indicators: [
            {
                id: 'fast_ema',
                type: 'EMA',
                parameters: { period: 9 }
            },
            {
                id: 'slow_ema',
                type: 'EMA',
                parameters: { period: 21 }
            }
        ],
        entryRules: [
            {
                id: 'buy_cross',
                condition: 'crossover',
                indicator1: 'EMA_9',
                indicator2: 'EMA_21',
                direction: TradeDirection.BUY
            },
            {
                id: 'sell_cross',
                condition: 'crossunder',
                indicator1: 'EMA_9',
                indicator2: 'EMA_21',
                direction: TradeDirection.SELL
            }
        ],
        exitRules: [],
        parameters: []
    },
    {
        id: 'builtin-rsi-divergence',
        name: 'RSI Divergence',
        description: 'Counter-trend strategy looking for RSI overbought/oversold conditions',
        type: 'STRATEGY',
        category: StrategyCategory.MOMENTUM,
        symbolScope: [],
        timeframe: '1H',
        isActive: true,
        indicators: [
            {
                id: 'rsi',
                type: 'RSI',
                parameters: { period: 14 }
            }
        ],
        entryRules: [
            {
                id: 'rsi_oversold',
                condition: 'less_than',
                indicator1: 'RSI_14',
                value: 30,
                direction: TradeDirection.BUY
            },
            {
                id: 'rsi_overbought',
                condition: 'greater_than',
                indicator1: 'RSI_14',
                value: 70,
                direction: TradeDirection.SELL
            }
        ],
        exitRules: [],
        parameters: []
    },
    {
        id: 'builtin-momentum-breakout',
        name: 'Momentum Breakout',
        description: 'Breakout strategy using Bollinger Bands',
        type: 'STRATEGY',
        category: StrategyCategory.BREAKOUT,
        symbolScope: [],
        timeframe: '1H',
        isActive: true,
        indicators: [
            {
                id: 'bb',
                type: 'BOLLINGER_BANDS',
                parameters: { period: 20, stdDev: 2 }
            }
        ],
        entryRules: [
            {
                id: 'bb_upper_break',
                condition: 'crossover', // Close crossing over upper band
                indicator1: 'CLOSE', // Special keyword for price
                indicator2: 'BOLLINGER_BANDS_20_upper',
                direction: TradeDirection.BUY
            },
            {
                id: 'bb_lower_break',
                condition: 'crossunder', // Close crossing under lower band
                indicator1: 'CLOSE',
                indicator2: 'BOLLINGER_BANDS_20_lower',
                direction: TradeDirection.SELL
            }
        ],
        exitRules: [],
        parameters: []
    }
];
