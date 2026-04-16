// backend/server/src/constants/builtInStrategies.ts
// Shared enums used by the Signal Engine and Signal Storage.
// Strategy definitions live in strategyRegistry.ts

export enum TradeDirection {
    BUY = 'BUY',
    SELL = 'SELL',
}

export enum StrategyCategory {
    TREND_FOLLOWING = 'Trend Following',
    MOMENTUM = 'Momentum',
    BREAKOUT = 'Breakout',
    MEAN_REVERSION = 'Mean Reversion',
}
