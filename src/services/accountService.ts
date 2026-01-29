
import { supabase } from './supabaseClient';
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
    // Return default truthful data (0) as no broker is connected yet.
    // Future: Connect to specific exchange adapter here.
    return DEFAULT_METRICS;
};

export const getDetailedMetrics = async (accountType: 'Forex' | 'Binance') => {
    return DEFAULT_DETAILED_METRICS;
};

export const getBalanceHistory = async (accountType: 'Forex' | 'Binance') => {
    return []; // Empty chart
};

export const getTradeHistory = async (): Promise<DailyTradeSummary[]> => {
    if (!supabase) return [];

    // Fetch aggregated daily trades from signals table (closed only)
    const { data, error } = await supabase
        .from('signals')
        .select('closed_at, profit_loss')
        .eq('status', 'Closed')
        .not('closed_at', 'is', null)
        .order('closed_at', { ascending: true });

    if (error) {
        console.error('Error fetching trade history:', error);
        return [];
    }

    // Group by date
    const dailyMap = new Map<string, { trades: number, pnl: number, wins: number }>();

    data.forEach(trade => {
        const date = new Date(trade.closed_at).toISOString().split('T')[0];
        const current = dailyMap.get(date) || { trades: 0, pnl: 0, wins: 0 };

        current.trades++;
        current.pnl += (trade.profit_loss || 0);
        if ((trade.profit_loss || 0) > 0) current.wins++;

        dailyMap.set(date, current);
    });

    return Array.from(dailyMap.entries()).map(([date, stats]) => ({
        date,
        trades: stats.trades,
        pnl: stats.pnl,
        winRate: (stats.wins / stats.trades) * 100
    }));
};

export const getStrategyPerformanceData = async () => {
    if (!supabase) return { labels: [], datasets: [] };

    // Fetch from the real strategy_performance view
    const { data: stats, error } = await supabase
        .from('strategy_performance')
        .select('strategy_id, win_rate, total_trades, avg_risk_reward_ratio');

    if (error) {
        console.error('Error fetching strategy stats:', error);
        return { labels: [], datasets: [] };
    }

    // We need strategy names. Fetch strategies to map ID -> Name
    const { data: strategies } = await supabase
        .from('strategies')
        .select('id, name');

    const nameMap = new Map<string, string>();
    strategies?.forEach(s => nameMap.set(s.id, s.name));

    const labels = stats.map(s => nameMap.get(s.strategy_id) || 'Unknown Strategy');
    const winRates = stats.map(s => s.win_rate || 0);
    // const totalTrades = stats.map(s => s.total_trades || 0);

    return {
        labels,
        datasets: [
            {
                label: 'Win Rate (%)',
                data: winRates,
                backgroundColor: 'rgba(59, 130, 246, 0.5)',
                borderColor: 'rgba(59, 130, 246, 1)',
                borderWidth: 1,
            }
        ]
    };
};
