import { Signal, SignalStatus } from '../types';

export interface StrategyWinRate {
    wins: number;
    losses: number;
    total: number;
    winRate: number; // 0-100
}

export function computeStrategyStats(signals: Signal[]): Map<string, StrategyWinRate> {
    const map = new Map<string, StrategyWinRate>();

    for (const s of signals) {
        if (s.status !== SignalStatus.CLOSED) continue;
        const key = s.strategyId || s.strategy || 'unknown';
        if (!map.has(key)) map.set(key, { wins: 0, losses: 0, total: 0, winRate: 0 });
        const stats = map.get(key)!;
        stats.total++;

        const pnl = (s as any).profitLoss ?? (s as any).profit_loss;
        const reason = s.closeReason;
        if (typeof pnl === 'number' && pnl > 0) stats.wins++;
        else if (typeof pnl === 'number' && pnl < 0) stats.losses++;
        else if (reason === 'TP') stats.wins++;
        else if (reason === 'SL') stats.losses++;
    }

    for (const [, stats] of map) {
        const decided = stats.wins + stats.losses;
        stats.winRate = decided > 0 ? (stats.wins / decided) * 100 : 0;
    }

    return map;
}
