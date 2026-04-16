/**
 * @insight/types — Trading Types
 * Positions, watchlists, and trade management.
 */

import { TradeDirection } from './signal';

export enum AccountType {
    FOREX = 'Forex',
    CRYPTO = 'Crypto',
    INDIAN = 'Indian',
}

export enum PositionStatus {
    OPEN = 'OPEN',
    PENDING = 'PENDING',
    CLOSED = 'CLOSED',
}

export interface WatchlistItem {
    id: string;
    symbol: string;
    price: number;
    change: number;
    changePercent: number;
    isPositive: boolean;
    autoTradeEnabled?: boolean;
    pnl?: number;
    lot_size?: number;
    risk_percent?: number;
    take_profit_distance?: number;
    stop_loss_distance?: number;
    trailing_stop_loss_distance?: number;
    leverage?: number;
}

export interface Watchlist {
    id: string;
    name: string;
    accountType: AccountType | 'Forex' | 'Crypto' | 'Indian';
    strategyType?: string;
    tradingMode?: 'paper' | 'live';
    items: WatchlistItem[];
    isMasterAutoTradeEnabled?: boolean;
    lotSize?: number;
    riskPercent?: number;
    takeProfitDistance?: number;
    stopLossDistance?: number;
    trailingStopLossDistance?: number;
    leverage?: number;
    executionTimeframes?: string[];
    manualRiskEnabled?: boolean;
    marketType?: 'spot' | 'futures';
    riskMethod?: 'fixed' | 'percent';
    autoLeverageEnabled?: boolean;
}

export interface Position {
    id: string;
    symbol: string;
    account: 'Forex' | 'Binance' | 'Paper';
    direction: TradeDirection;
    quantity: number;
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    pnl: number;
    status: PositionStatus;
    openTime: string;
    closeTime?: string;
    leverage?: number;
    marketType?: 'spot' | 'futures';
}

export interface RecentTrade {
    id: string;
    symbol: string;
    direction: TradeDirection;
    pnl: number;
    timestamp: string;
}

export interface OrderDetails {
    quantity: string;
    sl: string;
    tp: string;
    price: string;
    riskPercent: string;
    leverage: number;
    marginMode: 'Cross' | 'Isolated';
    reduceOnly: boolean;
    postOnly: boolean;
}
