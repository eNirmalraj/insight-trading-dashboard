/**
 * @insight/types — Signal Types
 * Signal lifecycle and status management.
 */

export enum SignalStatus {
    ACTIVE = 'Active',
    CLOSED = 'Closed',
    PENDING = 'Pending',
}

export enum TradeDirection {
    BUY = 'BUY',
    SELL = 'SELL',
}

export enum EntryType {
    MARKET = 'Market',
    LIMIT = 'Limit',
    STOP = 'Stop',
}

export enum StrategyCategory {
    TREND_FOLLOWING = 'Trend Following',
    MEAN_REVERSION = 'Mean Reversion',
    VOLATILITY_BREAKOUT = 'Volatility Breakout',
    MOMENTUM = 'Momentum',
    BREAKOUT = 'Breakout',
}

export interface Signal {
    id: string;
    pair: string;
    strategy: string;
    strategyCategory?: StrategyCategory;
    strategyId?: string;
    direction: TradeDirection;
    entry: number;
    entryType: EntryType;
    stopLoss: number;
    takeProfit: number;
    status: SignalStatus;
    timestamp: string;
    timeframe: string;
    chartData?: any[];
    closeReason?: 'TP' | 'SL' | 'MANUAL' | 'TIMEOUT';
    profitLoss?: number;
    isPinned?: boolean;
    activatedAt?: string;
    closedAt?: string;
    trailingStopLoss?: number;
    lotSize?: number;
    leverage?: number;
}
