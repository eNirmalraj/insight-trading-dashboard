import { Strategy, StrategyCategory, TradeDirection } from '../types';

export const BUILT_IN_STRATEGIES: Strategy[] = [
    {
        id: '11111111-1111-1111-1111-111111111111', // Matches Backend UUID
        name: 'SMA Trend Strategy',
        description: 'Simple Moving Average Trend Following Strategy. Buys when price closes above SMA 20, Sells when price closes below SMA 20.',
        type: 'STRATEGY',
        category: StrategyCategory.TREND_FOLLOWING,
        symbolScope: [],
        timeframe: '1H',
        isActive: true,
        indicators: [
            {
                type: 'SMA',
                parameters: { period: 20 }
            }
        ],
        entryRules: [
            {
                condition: 'greater_than',
                indicator1: 'CLOSE',
                indicator2: 'SMA_20',
                direction: TradeDirection.BUY
            },
            {
                condition: 'less_than',
                indicator1: 'CLOSE',
                indicator2: 'SMA_20',
                direction: TradeDirection.SELL
            }
        ],
        exitRules: [],
        parameters: []
    },
    {
        id: '22222222-2222-2222-2222-222222222222', // Matches Backend UUID
        name: 'EMA Trend Strategy',
        description: 'Exponential Moving Average Trend Following Strategy. Buys when price closes above EMA 20, Sells when price closes below EMA 20.',
        type: 'STRATEGY',
        category: StrategyCategory.TREND_FOLLOWING,
        symbolScope: [],
        timeframe: '1H',
        isActive: true,
        indicators: [
            {
                type: 'EMA',
                parameters: { period: 20 }
            }
        ],
        entryRules: [
            {
                condition: 'greater_than',
                indicator1: 'CLOSE',
                indicator2: 'EMA_20',
                direction: TradeDirection.BUY
            },
            {
                condition: 'less_than',
                indicator1: 'CLOSE',
                indicator2: 'EMA_20',
                direction: TradeDirection.SELL
            }
        ],
        exitRules: [],
        parameters: []
    }
];
