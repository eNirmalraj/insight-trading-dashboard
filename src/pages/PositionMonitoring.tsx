import React, { useEffect, useMemo, useState } from 'react';
import { getSignals } from '../services/signalService';
import { Signal } from '../types';

type Timeframe = 'today' | 'week' | 'all';

const PositionMonitoring: React.FC = () => {
    const [signals, setSignals] = useState<Signal[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<Timeframe>('today');
    const [direction, setDirection] = useState<'all' | 'BUY' | 'SELL'>('all');

    useEffect(() => {
        let cancelled = false;
        getSignals()
            .then((rows) => { if (!cancelled) { setSignals(rows); setLoading(false); } })
            .catch(() => { if (!cancelled) { setSignals([]); setLoading(false); } });
        return () => { cancelled = true; };
    }, []);

    const filtered = useMemo(() => {
        const now = Date.now();
        const DAY = 24 * 60 * 60 * 1000;
        return signals.filter((s) => {
            const age = now - new Date(s.timestamp).getTime();
            if (filter === 'today' && age > DAY) return false;
            if (filter === 'week' && age > 7 * DAY) return false;
            if (direction !== 'all' && s.direction !== direction) return false;
            return true;
        });
    }, [signals, filter, direction]);

    const stats = useMemo(() => ({
        total: filtered.length,
        bullish: filtered.filter((s) => s.direction === 'BUY').length,
        bearish: filtered.filter((s) => s.direction === 'SELL').length,
        uniqueSymbols: new Set(filtered.map((s) => s.pair)).size,
    }), [filtered]);

    if (loading) return <div className="p-6 text-gray-400">Loading signals…</div>;

    return (
        <div className="p-6 space-y-6 max-w-6xl mx-auto">
            <header>
                <h1 className="text-2xl font-bold text-white">Position Monitoring</h1>
                <p className="text-sm text-gray-400 mt-1 max-w-2xl">
                    Live signal activity from your strategies. Each row shows the entry, stop-loss, and
                    take-profit levels — monitor them here and execute on your preferred broker.
                </p>
            </header>

            {/* Stat strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Signals" value={stats.total} />
                <StatCard label="Symbols" value={stats.uniqueSymbols} />
                <StatCard label="Bullish" value={stats.bullish} color="text-green-400" />
                <StatCard label="Bearish" value={stats.bearish} color="text-red-400" />
            </div>

            {/* Filter bar */}
            <div className="flex items-center gap-3 flex-wrap">
                <TabGroup
                    options={[
                        { value: 'today', label: 'Today' },
                        { value: 'week', label: 'This Week' },
                        { value: 'all', label: 'All' },
                    ]}
                    value={filter}
                    onChange={(v) => setFilter(v as Timeframe)}
                />
                <div className="h-6 w-px bg-gray-700" />
                <TabGroup
                    options={[
                        { value: 'all', label: 'All Directions' },
                        { value: 'BUY', label: 'Buy Only' },
                        { value: 'SELL', label: 'Sell Only' },
                    ]}
                    value={direction}
                    onChange={(v) => setDirection(v as 'all' | 'BUY' | 'SELL')}
                />
            </div>

            {/* Signal list */}
            {filtered.length === 0 ? (
                <div className="p-12 text-center text-gray-500 border border-dashed border-gray-700 rounded-xl">
                    No signals in this view.
                    {signals.length === 0
                        ? ' Assign strategies to your watchlists to start generating signals.'
                        : ' Try widening the timeframe or direction filter.'}
                </div>
            ) : (
                <div className="space-y-2">
                    {filtered.map((s) => <SignalRow key={s.id} signal={s} />)}
                </div>
            )}
        </div>
    );
};

const StatCard: React.FC<{ label: string; value: number; color?: string }> = ({
    label,
    value,
    color = 'text-white',
}) => (
    <div className="p-4 bg-[#18181b] border border-gray-800 rounded-xl">
        <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
        <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
    </div>
);

interface TabGroupProps {
    options: { value: string; label: string }[];
    value: string;
    onChange: (v: string) => void;
}

const TabGroup: React.FC<TabGroupProps> = ({ options, value, onChange }) => (
    <div className="inline-flex bg-gray-800/60 rounded-lg p-1">
        {options.map((opt) => (
            <button
                key={opt.value}
                type="button"
                onClick={() => onChange(opt.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    value === opt.value
                        ? 'bg-blue-500 text-white'
                        : 'text-gray-400 hover:text-gray-200'
                }`}
            >
                {opt.label}
            </button>
        ))}
    </div>
);

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
}

const SignalRow: React.FC<{ signal: Signal }> = ({ signal }) => {
    const isBuy = signal.direction === 'BUY';
    const entry = signal.entry || 0;
    const tpPct = entry > 0 ? ((signal.takeProfit - entry) / entry) * 100 : 0;
    const slPct = entry > 0 ? ((signal.stopLoss - entry) / entry) * 100 : 0;
    const rr = Math.abs(slPct) > 0 ? Math.abs(tpPct / slPct).toFixed(2) : '—';

    return (
        <div className="p-4 bg-[#18181b] border border-gray-800 rounded-xl hover:border-gray-700 transition">
            <div className="flex items-center gap-4 flex-wrap">
                <div
                    className={`px-3 py-1 rounded-full text-xs font-bold shrink-0 ${
                        isBuy ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                    }`}
                >
                    {signal.direction}
                </div>

                <div className="flex-1 min-w-[180px]">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-bold text-base">{signal.pair}</span>
                        <span className="text-xs text-gray-500 uppercase tracking-wide">
                            {signal.timeframe}
                        </span>
                        {signal.strategy && (
                            <span className="text-[10px] font-medium uppercase px-2 py-0.5 rounded bg-gray-700 text-gray-300">
                                {signal.strategy}
                            </span>
                        )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                        {timeAgo(signal.timestamp)} · {new Date(signal.timestamp).toLocaleString()}
                    </div>
                </div>

                <div className="flex items-center gap-5 text-sm font-mono">
                    <PriceCell label="Entry" value={signal.entry} />
                    <PriceCell
                        label="SL"
                        value={signal.stopLoss}
                        className="text-red-400"
                        subtext={`${slPct >= 0 ? '+' : ''}${slPct.toFixed(2)}%`}
                    />
                    <PriceCell
                        label="TP"
                        value={signal.takeProfit}
                        className="text-green-400"
                        subtext={`${tpPct >= 0 ? '+' : ''}${tpPct.toFixed(2)}%`}
                    />
                    <div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-wide">R:R</div>
                        <div className="text-blue-400 font-mono">{rr}</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const PriceCell: React.FC<{
    label: string;
    value: number;
    className?: string;
    subtext?: string;
}> = ({ label, value, className = 'text-white', subtext }) => (
    <div>
        <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
        <div className={`font-mono ${className}`}>{Number(value).toLocaleString()}</div>
        {subtext && <div className="text-[10px] text-gray-500 font-mono">{subtext}</div>}
    </div>
);

export default PositionMonitoring;
