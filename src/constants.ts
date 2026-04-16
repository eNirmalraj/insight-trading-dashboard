// src/constants.ts
// Exports only what is actively imported by other modules.
// All dummy/mock data has been removed — the app uses real data from Supabase.

export const AVAILABLE_STRATEGIES: string[] = [];

export interface PerformanceData {
    date: string;
    avgWin: number;
    avgLoss: number;
    maxDrawdown: number;
    profitFactor: number;
    sharpeRatio: number;
    winRate: number;
    trades: number;
}

export interface BalanceHistoryData {
    date: string;
    balance: number;
}

export interface DailyTradeSummary {
    date: string;
    pnl: number;
    trades: number;
}
