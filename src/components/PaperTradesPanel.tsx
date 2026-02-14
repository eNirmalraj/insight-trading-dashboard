import React, { useEffect, useState } from 'react';
import { getPaperTrades } from '../api';

interface PaperTrade {
    id: string;
    symbol: string;
    direction: 'BUY' | 'SELL';
    entry_price: number;
    quantity: number;
    status: 'OPEN' | 'CLOSED';
    exit_price?: number;
    pnl?: number;
    pnl_percent?: number;
    exit_reason?: string;
    filled_at: string;
    closed_at?: string;
}

export const PaperTradesPanel: React.FC = () => {
    const [trades, setTrades] = useState<PaperTrade[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadTrades();
        // Poll every 10 seconds for updates
        const interval = setInterval(loadTrades, 10000);
        return () => clearInterval(interval);
    }, []);

    const loadTrades = async () => {
        try {
            const data = await getPaperTrades();
            setTrades(data as PaperTrade[]);
        } catch (error) {
            console.error("Failed to load paper trades", error);
        } finally {
            setLoading(false);
        }
    };

    if (loading && trades.length === 0) return <div className="p-4 text-emerald-400">Loading Paper Trades...</div>;

    if (trades.length === 0) return null;


    return (
        <div className="bg-[#0f1115] rounded-xl border border-white/5 overflow-hidden mt-6">
            <div className="p-4 border-b border-white/5 flex justify-between items-center">
                <h3 className="font-semibold text-white">Paper Execution History (Simulated)</h3>
                <span className="text-xs px-2 py-1 bg-purple-500/20 text-purple-400 rounded-full border border-purple-500/30">
                    Phase C2 Beta
                </span>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-white/5 text-white/40 uppercase text-xs">
                        <tr>
                            <th className="px-4 py-3">Time</th>
                            <th className="px-4 py-3">Symbol</th>
                            <th className="px-4 py-3">Side</th>
                            <th className="px-4 py-3">Entry</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Exit</th>
                            <th className="px-4 py-3">PnL</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {trades.map((trade) => (
                            <tr key={trade.id} className="hover:bg-white/5 transition-colors">
                                <td className="px-4 py-3 text-white/60">
                                    {new Date(trade.filled_at).toLocaleString()}
                                </td>
                                <td className="px-4 py-3 font-medium text-white">
                                    {trade.symbol}
                                </td>
                                <td className={`px-4 py-3 font-medium ${trade.direction === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    <div className="flex flex-col">
                                        <span>{trade.direction}</span>
                                        {trade.direction === 'SELL' && !trade.symbol.endsWith('.P') && (
                                            <span className="text-[10px] bg-rose-500/10 text-rose-300 px-1 py-0.5 rounded border border-rose-500/20 w-fit mt-0.5">
                                                Simulated
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-white/80">
                                    {trade.entry_price.toFixed(5)}
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`px-2 py-0.5 rounded text-xs ${trade.status === 'OPEN' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'
                                        }`}>
                                        {trade.status}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-white/80">
                                    {trade.exit_price ? trade.exit_price.toFixed(5) : '-'}
                                </td>
                                <td className={`px-4 py-3 font-medium ${(trade.pnl || 0) > 0 ? 'text-emerald-400' : (trade.pnl || 0) < 0 ? 'text-rose-400' : 'text-white/40'
                                    }`}>
                                    {trade.pnl ? `$${trade.pnl.toFixed(2)}` : '-'}
                                    {trade.pnl_percent && (
                                        <span className="text-xs opacity-70 ml-1">
                                            ({trade.pnl_percent.toFixed(2)}%)
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
