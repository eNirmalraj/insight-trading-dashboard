import React from 'react';
import { Signal, SignalStatus, TradeDirection } from '../types';
import { computeSignalPnl } from '../utils/signalPnl';

interface SignalCardProps {
    signal: Signal;
    currentPrice?: number;
    onShowChart: (signal: Signal) => void;
    onAddToWatchlist: (pair: string) => void;
    onExecute: (signal: Signal) => void;
    isAddedToWatchlist: boolean;
    onTogglePin: (signal: Signal) => void;
}

const fmt = (price: number | undefined) => {
    if (price === undefined || price === null) return '—';
    if (price === 0) return '0.00';
    if (price < 0.0001) return price.toFixed(8);
    if (price < 0.01) return price.toFixed(6);
    if (price < 1) return price.toFixed(4);
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const SignalCard: React.FC<SignalCardProps> = ({
    signal,
    currentPrice,
    onShowChart,
    onAddToWatchlist,
    onExecute,
    isAddedToWatchlist,
    onTogglePin,
}) => {
    const isBuy = signal.direction === TradeDirection.BUY;
    const isNew = Date.now() - new Date(signal.timestamp).getTime() < 30 * 60 * 1000;
    const isClosed = signal.status === SignalStatus.CLOSED;

    const rr = Math.abs(
        (signal.takeProfit - signal.entry) / (signal.entry - signal.stopLoss)
    ).toFixed(1);

    const { pct: pnlPct, ratio: pnlRatio } = computeSignalPnl(signal, currentPrice);
    const pnlLabel = pnlPct === null ? '—' : `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`;
    const pnlColor = pnlPct === null ? 'text-gray-500' : pnlPct >= 0 ? 'text-green-400' : 'text-red-400';
    const fillW = Math.abs(pnlRatio) * 50;
    const fillProfit = pnlRatio >= 0;

    // Context metrics for active signals
    const progress = (() => {
        if (!currentPrice || isClosed) return null;
        const tpDist = Math.abs(signal.takeProfit - signal.entry);
        const slDist = Math.abs(signal.stopLoss - signal.entry);
        const toTP = isBuy ? currentPrice - signal.entry : signal.entry - currentPrice;
        const toSL = isBuy ? signal.entry - currentPrice : currentPrice - signal.entry;
        return {
            tp: tpDist > 0 ? Math.max(0, Math.min(100, (toTP / tpDist) * 100)) : 0,
            sl: slDist > 0 ? Math.max(0, Math.min(100, (toSL / slDist) * 100)) : 0,
        };
    })();

    // Time display
    const timeDisplay = (() => {
        if (signal.status === SignalStatus.ACTIVE && signal.activatedAt) {
            const mins = Math.floor((Date.now() - new Date(signal.activatedAt).getTime()) / 60000);
            return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
        }
        if (isClosed && signal.closedAt) {
            const reason = signal.closeReason || '';
            const t = new Date(signal.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return `${reason} ${t}`;
        }
        const d = new Date(signal.timestamp);
        return d.toDateString() === new Date().toDateString()
            ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    })();

    const dirColor = isBuy ? 'green' : 'red';

    return (
        <div className={`group relative rounded-xl overflow-hidden transition-all hover:shadow-lg ${
            isClosed
                ? 'opacity-75 hover:opacity-100 hover:shadow-gray-900/30'
                : isBuy
                    ? 'hover:shadow-green-500/10'
                    : 'hover:shadow-red-500/10'
        }`}>
            {/* Direction accent — top edge glow */}
            <div className={`absolute top-0 left-0 right-0 h-[2px] ${
                isBuy ? 'bg-gradient-to-r from-green-400 via-green-500 to-green-400/0' : 'bg-gradient-to-r from-red-400 via-red-500 to-red-400/0'
            }`} />

            <div className="bg-[#18181b] border border-gray-700/60 rounded-xl p-4">
                {/* Row 1: Symbol + badges + pin */}
                <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <h3 className="text-base font-bold text-white tracking-tight truncate">
                            {signal.pair}
                        </h3>
                        <span className="flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-300 border border-gray-600/50 font-mono">
                            {signal.timeframe}
                        </span>
                        <span className={`flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded font-bold bg-${dirColor}-500/10 text-${dirColor}-400 border border-${dirColor}-500/20`}>
                            {signal.direction}
                        </span>
                        {isNew && (
                            <span className="flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300 font-bold">
                                NEW
                            </span>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onTogglePin(signal); }}
                        className={`flex-shrink-0 p-1 rounded transition-colors ${
                            signal.isPinned
                                ? 'text-yellow-400 hover:text-yellow-300'
                                : 'text-gray-600 hover:text-gray-400'
                        }`}
                        title={signal.isPinned ? 'Unpin' : 'Pin'}
                    >
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M16 12V4H17V2H7V4H8V12L6 14V16H11.2V22H12.8V16H18V14L16 12Z" />
                        </svg>
                    </button>
                </div>

                {/* Row 2: Strategy + time */}
                <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] text-gray-400 truncate">{signal.strategy}</span>
                    <span className="text-[10px] text-gray-400 font-mono flex-shrink-0 ml-2">{timeDisplay}</span>
                </div>

                {/* Row 3: P&L block */}
                <div className="mb-3">
                    <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-lg font-bold font-mono ${pnlColor}`}>{pnlLabel}</span>
                        {currentPrice !== undefined && !isClosed && (
                            <span className="text-[11px] text-gray-400 font-mono">{fmt(currentPrice)}</span>
                        )}
                    </div>
                    <div className="relative h-1.5 bg-gray-700/40 rounded-full">
                        <div className="absolute left-1/2 top-[-1px] w-px h-[8px] bg-gray-500" />
                        {pnlPct !== null && (
                            <div
                                className={`absolute top-0 h-full rounded-full transition-all duration-500 ${
                                    fillProfit
                                        ? 'bg-gradient-to-r from-green-600 to-green-400'
                                        : 'bg-gradient-to-l from-red-600 to-red-400'
                                }`}
                                style={fillProfit ? { left: '50%', width: `${fillW}%` } : { right: '50%', width: `${fillW}%` }}
                            />
                        )}
                    </div>
                    <div className="flex justify-between mt-1 text-[9px] font-mono">
                        <span className="text-red-400/80">
                            SL {progress ? `${progress.sl.toFixed(0)}%` : ''}
                        </span>
                        <span className="text-green-400/80">
                            TP {progress ? `${progress.tp.toFixed(0)}%` : ''}
                        </span>
                    </div>
                </div>

                {/* Row 4: Price levels — compact horizontal */}
                <div className="flex items-center gap-1 mb-3 text-[10px] font-mono">
                    <div className="flex-1 text-center py-1.5 rounded bg-gray-700/30 border border-gray-700/50">
                        <span className="text-gray-400">E </span>
                        <span className="text-white">{fmt(signal.entry)}</span>
                    </div>
                    <div className="flex-1 text-center py-1.5 rounded bg-red-500/5 border border-red-500/10">
                        <span className="text-gray-400">SL </span>
                        <span className="text-red-400">{fmt(signal.stopLoss)}</span>
                    </div>
                    <div className="flex-1 text-center py-1.5 rounded bg-green-500/5 border border-green-500/10">
                        <span className="text-gray-400">TP </span>
                        <span className="text-green-400">{fmt(signal.takeProfit)}</span>
                    </div>
                    <div className="w-12 text-center py-1.5 rounded bg-blue-500/8 border border-blue-500/15">
                        <span className="text-blue-400">1:{rr}</span>
                    </div>
                </div>

                {/* Row 5: Actions */}
                <div className="flex items-center gap-1.5 pt-2 border-t border-gray-700/40">
                    <button
                        type="button"
                        onClick={() => onShowChart(signal)}
                        className="flex-1 h-7 flex items-center justify-center rounded-md text-[10px] font-semibold bg-gray-700/50 text-gray-200 hover:bg-gray-600/60 hover:text-white transition-colors border border-gray-600/50"
                    >
                        Chart
                    </button>
                    <button
                        type="button"
                        onClick={() => onAddToWatchlist(signal.pair)}
                        className="h-7 w-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-800 hover:text-blue-400 transition-colors"
                        title={isAddedToWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
                    >
                        <svg className="w-3.5 h-3.5" fill={isAddedToWatchlist ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(
                            `${signal.pair} ${signal.direction} | E:${signal.entry} SL:${signal.stopLoss} TP:${signal.takeProfit}`
                        )}
                        className="h-7 w-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-800 hover:text-white transition-colors"
                        title="Copy"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                    </button>
                    {!isClosed && (
                        <button
                            type="button"
                            onClick={() => onExecute(signal)}
                            className={`flex-1 h-7 flex items-center justify-center rounded-md text-[10px] font-bold transition-colors ${
                                isBuy
                                    ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25 border border-green-500/20'
                                    : 'bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/20'
                            }`}
                        >
                            Execute
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SignalCard;
