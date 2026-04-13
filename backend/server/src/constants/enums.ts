// backend/server/src/constants/enums.ts
// Shared enums for the Signal Engine and related services.

export enum TradeDirection {
    BUY = 'BUY',
    SELL = 'SELL',
}

export enum Market {
    SPOT = 'spot',
    FUTURES = 'futures',
}

export enum SignalStatus {
    ACTIVE = 'Active',
    CLOSED = 'Closed',
}

export enum CloseReason {
    TP = 'TP',
    SL = 'SL',
    MANUAL = 'MANUAL',
    TIMEOUT = 'TIMEOUT',
}

export enum StrategyCategory {
    TREND_FOLLOWING = 'Trend Following',
    MOMENTUM = 'Momentum',
    BREAKOUT = 'Breakout',
    MEAN_REVERSION = 'Mean Reversion',
}

export enum BrokerType {
    PAPER = 'paper',
    BINANCE = 'binance',
}
