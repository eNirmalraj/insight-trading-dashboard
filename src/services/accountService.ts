
import { Metric, DailyTradeSummary } from '../types';

// Default "Real" State (Empty/Zero for new users until exchange connected)
const DEFAULT_METRICS: Metric[] = [
    { title: "Balance", value: "$0.00", change: "0", isPositive: true },
    { title: "Today's P/L", value: "$0.00", change: "0", isPositive: true },
    { title: "Open Positions", value: "0", change: "0", isPositive: true },
    { title: "Win Rate", value: "0%", change: "0", isPositive: true }
];

const DEFAULT_DETAILED_METRICS = {
    'Daily Return': '0%',
    'Sharpe Ratio': '0',
    'Profit Factor': '0',
    'Max Drawdown': '0%'
};

export const getAccountMetrics = async (accountType: 'Forex' | 'Binance'): Promise<Metric[]> => {
    // TODO: Connect to real backend/exchange for balance
    return DEFAULT_METRICS;
};

export const getDetailedMetrics = async (accountType: 'Forex' | 'Binance') => {
    return DEFAULT_DETAILED_METRICS;
};

export const getBalanceHistory = async (accountType: 'Forex' | 'Binance') => {
    return []; // Empty chart
};

export const getTradeHistory = async (): Promise<DailyTradeSummary[]> => {
    return [];
};

export const getStrategyPerformanceData = async () => {
    return {
        labels: [],
        datasets: []
    };
};
