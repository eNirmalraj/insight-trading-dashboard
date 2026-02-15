// backend/server/src/constants/builtInStrategies.ts
// Built-in Strategy Definitions for Signal Engine

export enum TradeDirection {
    BUY = 'BUY',
    SELL = 'SELL'
}

export enum StrategyCategory {
    TREND_FOLLOWING = 'Trend Following',
    MOMENTUM = 'Momentum',
    BREAKOUT = 'Breakout',
    MEAN_REVERSION = 'Mean Reversion'
}

export interface StrategyIndicator {
    id: string;
    type: string;
    parameters: Record<string, any>;
}

export interface EntryRule {
    id: string;
    condition: string;
    indicator1: string;
    indicator2?: string;
    value?: number;
    direction: TradeDirection;
}

export enum ExitType {
    STOP_LOSS = 'STOP_LOSS',
    TAKE_PROFIT = 'TAKE_PROFIT'
}

export interface ExitRule {
    id: string;
    type: ExitType;
    value: number; // e.g., 0.02 for 2%
    unit: 'PERCENTAGE' | 'FIXED';
}

export interface BuiltInStrategy {
    id: string;
    name: string;
    description: string;
    category: StrategyCategory;
    indicators?: StrategyIndicator[];
    entryRules?: EntryRule[];
    exitRules?: ExitRule[];
    kuriScript?: string; // Optional Kuri script for custom strategies
}

export const BUILT_IN_STRATEGIES: BuiltInStrategy[] = [
    {
        id: '11111111-1111-1111-1111-111111111111', // SMA Trend Strategy UUID
        name: 'SMA Trend Strategy',
        description: 'Simple Moving Average Trend Following Strategy. Buys when price closes above SMA 20, Sells when price closes below SMA 20.',
        category: StrategyCategory.TREND_FOLLOWING,

        exitRules: [],
        kuriScript: `
// SMA Trend Strategy
// Buy when Close crosses above SMA(20)
// Sell when Close crosses below SMA(20)

period = 20
my_sma = sma(close, period)

// Risk Management
strategy.exit_sl(0.02)
strategy.exit_tp(0.04)

buy_signal = close > my_sma
sell_signal = close < my_sma
        `
    },
    {
        id: '22222222-2222-2222-2222-222222222222', // EMA Trend Strategy UUID
        name: 'EMA Trend Strategy',
        description: 'Exponential Moving Average Trend Following Strategy. Buys when price closes above EMA 20, Sells when price closes below EMA 20.',
        category: StrategyCategory.TREND_FOLLOWING,

        exitRules: [],
        kuriScript: `
// EMA Trend Strategy
// Buy when Close crosses above EMA(20)
// Sell when Close crosses below EMA(20)

period = 20
my_ema = ema(close, period)

// Risk Management
strategy.exit_sl(0.02)
strategy.exit_tp(0.04)

buy_signal = close > my_ema
sell_signal = close < my_ema
        `
    }
];
