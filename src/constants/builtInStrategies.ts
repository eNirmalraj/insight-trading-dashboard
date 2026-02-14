import { Strategy, StrategyCategory, TradeDirection } from '../types';

export const BUILT_IN_STRATEGIES: Strategy[] = [
    {
        id: '11111111-1111-1111-1111-111111111111', // Matches Backend UUID
        name: 'SMA Trend Strategy',
        description: 'Simple Moving Average Trend Following Strategy. Buys when price closes above SMA 20, Sells when price closes below SMA 20.',
        type: 'KURI',
        category: StrategyCategory.TREND_FOLLOWING,
        symbolScope: [],
        timeframe: '1H',
        isActive: true,
        indicators: [],
        entryRules: [],
        exitRules: [],
        parameters: [],
        content: {
            code: `// SMA Trend Strategy
// Buys when price closes above SMA 20
// Sells when price closes below SMA 20

ma = sma(close, 20)

// Entry Conditions
buy = crossover(close, ma)
sell = crossunder(close, ma)
`
        }
    },
    {
        id: '22222222-2222-2222-2222-222222222222', // Matches Backend UUID
        name: 'EMA Trend Strategy',
        description: 'Exponential Moving Average Trend Following Strategy. Buys when price closes above EMA 20, Sells when price closes below EMA 20.',
        type: 'KURI',
        category: StrategyCategory.TREND_FOLLOWING,
        symbolScope: [],
        timeframe: '1H',
        isActive: true,
        indicators: [],
        entryRules: [],
        exitRules: [],
        parameters: [],
        content: {
            code: `// EMA Trend Strategy
// Buys when price closes above EMA 20
// Sells when price closes below EMA 20

ma = ema(close, 20)

// Entry Conditions
buy = crossover(close, ma)
sell = crossunder(close, ma)
`
        }
    }
];
