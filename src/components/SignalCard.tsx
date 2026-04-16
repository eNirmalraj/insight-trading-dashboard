import React from 'react';
import { Signal, SignalStatus, TradeDirection } from '../types';
import { BookmarkIcon, BookmarkOutlineIcon } from './IconComponents';
import { computeSignalPnl } from '../utils/signalPnl';

// import SignalProgressBar from './SignalProgressBar'; // Components neutralized per audit

interface SignalCardProps {
    signal: Signal;
    currentPrice?: number;
    onShowChart: (signal: Signal) => void;
    onAddToWatchlist: (pair: string) => void;
    onExecute: (signal: Signal) => void;
    isAddedToWatchlist: boolean;
    onTogglePin: (signal: Signal) => void;
}

const getStatusColor = (status: SignalStatus) => {
    switch (status) {
        case SignalStatus.ACTIVE:
            return 'bg-gray-700/50 text-gray-200 border-gray-600';
        case SignalStatus.CLOSED:
            return 'bg-gray-800 text-gray-500 border-gray-700';
        case SignalStatus.PENDING:
            return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30';
        default:
            return 'bg-gray-700 border-gray-600';
    }
};

const formatPrice = (price: number | undefined) => {
    if (price === undefined || price === null) return '0.00';
    if (price === 0) return '0.00';
    if (price < 0.0001) return price.toFixed(8);
    if (price < 0.01) return price.toFixed(6);
    if (price < 1) return price.toFixed(4);
    return price.toFixed(2);
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
    const borderColor = isBuy ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-red-500';

    // Check if signal is new (created within last 30 minutes)
    const isNew = Date.now() - new Date(signal.timestamp).getTime() < 30 * 60 * 1000;

    const copySignalToClipboard = () => {
        const text = `🎯 ${signal.pair} - ${signal.direction}\n📊 Strategy: ${signal.strategy}\n💰 Entry: ${signal.entry}\n🛑 Stop Loss: ${signal.stopLoss}\n🎯 Take Profit: ${signal.takeProfit}\n⏰ ${new Date(signal.timestamp).toLocaleString()}`;
        navigator.clipboard.writeText(text);
    };

    const riskReward = Math.abs(
        (signal.takeProfit - signal.entry) / (signal.entry - signal.stopLoss)
    ).toFixed(2);

    // Calculate Context Metrics
    // progressToTP / progressToSL are COMPLETED fractions (0–100%) of the journey
    // from entry to the respective level. 0% = at entry, 100% = hit the level.
    const getContextMetrics = () => {
        if (!currentPrice || signal.status === SignalStatus.CLOSED) return null;

        const distToEntry = ((currentPrice - signal.entry) / signal.entry) * 100;

        const tpDistance = Math.abs(signal.takeProfit - signal.entry);
        const slDistance = Math.abs(signal.stopLoss - signal.entry);
        const travelTowardTP = isBuy
            ? currentPrice - signal.entry
            : signal.entry - currentPrice;
        const travelTowardSL = isBuy
            ? signal.entry - currentPrice
            : currentPrice - signal.entry;

        const progressToTP =
            tpDistance > 0
                ? Math.max(0, Math.min(100, (travelTowardTP / tpDistance) * 100))
                : 0;
        const progressToSL =
            slDistance > 0
                ? Math.max(0, Math.min(100, (travelTowardSL / slDistance) * 100))
                : 0;

        return { distToEntry, progressToTP, progressToSL };
    };

    const context = getContextMetrics();

    const { pct: pnlPct, ratio: pnlRatio } = computeSignalPnl(signal, currentPrice);
    const pnlNumberClass =
        pnlPct === null ? 'text-gray-500' : pnlPct >= 0 ? 'text-green-400' : 'text-red-400';
    const pnlLabel =
        pnlPct === null ? '—' : `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`;
    const pnlFillWidthPct = Math.abs(pnlRatio) * 50;
    const pnlFillIsProfit = pnlRatio >= 0;

    // Time Context
    const getTimeContext = () => {
        if (signal.status === SignalStatus.ACTIVE && signal.activatedAt) {
            const diff = Date.now() - new Date(signal.activatedAt).getTime();
            const mins = Math.floor(diff / 60000);
            return {
                label: 'Active for',
                value: mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`,
            };
        }
        if (signal.status === SignalStatus.CLOSED && signal.closedAt) {
            const timeStr = new Date(signal.closedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
            });
            const reason = signal.closeReason ? `(${signal.closeReason})` : '';
            return { label: 'Closed', value: `${reason} at ${timeStr}` };
        }
        const created = new Date(signal.timestamp);
        const isToday = created.toDateString() === new Date().toDateString();
        const value = isToday
            ? created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : created.toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
              });
        return { label: 'Created', value };
    };

    const timeContext = getTimeContext();

    return (
        <div
            className={`bg-card-bg rounded-xl p-5 space-y-4 hover:shadow-xl transition-shadow relative ${borderColor}`}
        >
            {/* Top Bar: Badges & Actions */}
            <div className="absolute top-0 left-0 w-full p-3 flex justify-between items-start z-10">
                {/* Left: NEW Badge */}
                <div>
                    {isNew && (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-yellow-400 text-black shadow-sm shadow-yellow-400/20">
                            NEW
                        </span>
                    )}
                </div>

                {/* Right: Status, Direction, Pin */}
                <div className="flex items-center gap-2">
                    <span
                        className={`h-5 px-2 flex items-center justify-center text-[9px] uppercase font-bold tracking-wide rounded border backdrop-blur-md shadow-sm ${getStatusColor(signal.status)}`}
                    >
                        {signal.status}
                    </span>
                    <span
                        className={`h-5 px-2 flex items-center justify-center text-[9px] uppercase font-bold tracking-wide rounded border backdrop-blur-md shadow-sm ${isBuy ? 'bg-green-500/10 text-green-400 border-green-500/20 shadow-green-500/10' : 'bg-red-500/10 text-red-400 border-red-500/20 shadow-red-500/10'}`}
                    >
                        {signal.direction}
                    </span>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onTogglePin(signal);
                        }}
                        className={`p-1 rounded-full transition-colors ${signal.isPinned ? 'text-yellow-400 bg-yellow-400/10 hover:bg-yellow-400/20' : 'text-gray-500 hover:text-gray-300'}`}
                        title={signal.isPinned ? 'Unpin Signal' : 'Pin Signal'}
                    >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M16 12V4H17V2H7V4H8V12L6 14V16H11.2V22H12.8V16H18V14L16 12Z" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="mt-8 mb-4">
                <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                        <h3 className="text-xl font-bold text-white leading-none tracking-tight">
                            {signal.pair}
                        </h3>
                        {signal.pair.endsWith('.P') && (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 leading-none">
                                FUTURES
                            </span>
                        )}
                        <span className="text-xs text-gray-500 font-medium bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700">
                            {signal.timeframe}
                        </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5 font-medium">{signal.strategy}</p>
                </div>
            </div>

            {/* Pending Context */}
            {context && signal.status === SignalStatus.PENDING && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2 text-xs flex justify-between items-center">
                    <span className="text-yellow-500">Distance to Entry</span>
                    <span className="font-mono text-white">
                        {Math.abs(context.distToEntry).toFixed(2)}%
                    </span>
                </div>
            )}

            {/* P&L bar (direction-aware, shared with row view) */}
            <div className="bg-gray-800/30 rounded-lg p-3 border border-gray-700/30">
                <div className="flex items-baseline justify-between mb-2">
                    <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">
                        P&amp;L
                    </span>
                    <span className={`font-mono text-sm font-bold ${pnlNumberClass}`}>
                        {pnlLabel}
                    </span>
                </div>
                <div className="relative h-1.5 bg-gray-900 rounded-full">
                    <div className="absolute left-1/2 top-[-2px] w-px h-[10px] bg-gray-500" />
                    {pnlPct !== null && (
                        <div
                            className={`absolute top-0 h-full rounded-full ${pnlFillIsProfit ? 'bg-gradient-to-r from-green-600 to-green-400' : 'bg-gradient-to-l from-red-600 to-red-400'}`}
                            style={
                                pnlFillIsProfit
                                    ? { left: '50%', width: `${pnlFillWidthPct}%` }
                                    : { right: '50%', width: `${pnlFillWidthPct}%` }
                            }
                        />
                    )}
                </div>
                <div className="relative mt-1 text-[9px] font-mono">
                    <span className="absolute left-0 text-red-500">
                        Stop {context && signal.status === SignalStatus.ACTIVE
                            ? `${context.progressToSL.toFixed(1)}%`
                            : '0%'}
                    </span>
                    <span className="block text-center text-white">
                        {currentPrice !== undefined && signal.status === SignalStatus.ACTIVE
                            ? formatPrice(currentPrice)
                            : '—'}
                    </span>
                    <span className="absolute right-0 text-green-500">
                        Target {context && signal.status === SignalStatus.ACTIVE
                            ? `${context.progressToTP.toFixed(1)}%`
                            : '0%'}
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center py-2 h-16">
                <div className="bg-gray-800/30 rounded-lg p-1.5 flex flex-col justify-center border border-gray-700/30">
                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">
                        Entry
                    </p>
                    <p className="text-xs font-bold text-white font-mono mt-0.5">
                        {formatPrice(signal.entry)}
                    </p>
                </div>
                <div className="bg-gray-800/30 rounded-lg p-1.5 flex flex-col justify-center border border-gray-700/30">
                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">
                        Stop
                    </p>
                    <p className="text-xs font-bold text-red-400 font-mono mt-0.5">
                        {formatPrice(signal.stopLoss)}
                    </p>
                </div>
                <div className="bg-gray-800/30 rounded-lg p-1.5 flex flex-col justify-center border border-gray-700/30">
                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">
                        Target
                    </p>
                    <p className="text-xs font-bold text-green-400 font-mono mt-0.5">
                        {formatPrice(signal.takeProfit)}
                    </p>
                </div>
                <div className="bg-gray-800/30 rounded-lg p-1.5 flex flex-col justify-center border border-gray-700/30">
                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">
                        R:R
                    </p>
                    <p className="text-xs font-bold text-blue-400 font-mono mt-0.5">
                        1:{riskReward}
                    </p>
                </div>
            </div>

            <div className="flex justify-between items-center text-xs text-gray-400 pt-3 border-t border-gray-700 mt-auto">
                <span className="flex items-center gap-1.5 h-7">
                    <span className="text-gray-500">{timeContext.label}:</span>
                    <span className="text-gray-300 font-medium">{timeContext.value}</span>
                </span>
                <div className="flex items-center space-x-2 h-7">
                    <button
                        onClick={copySignalToClipboard}
                        className="h-7 w-7 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-700 transition-colors border border-transparent hover:border-gray-600"
                        title="Copy to clipboard"
                    >
                        <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                            />
                        </svg>
                    </button>
                    <button
                        onClick={() => onAddToWatchlist(signal.pair)}
                        className="h-7 w-7 flex items-center justify-center rounded-md text-blue-400 hover:bg-blue-500/20 transition-colors border border-transparent hover:border-blue-500/30"
                        title={isAddedToWatchlist ? 'Manage in Watchlist' : 'Add to Watchlist'}
                    >
                        {isAddedToWatchlist ? (
                            <BookmarkIcon className="w-3.5 h-3.5" />
                        ) : (
                            <BookmarkOutlineIcon className="w-3.5 h-3.5" />
                        )}
                    </button>
                    <button
                        onClick={() => onShowChart(signal)}
                        className="h-7 px-3 flex items-center justify-center bg-gray-700 text-white font-bold rounded-md hover:bg-gray-600 transition-colors text-[10px] uppercase tracking-wider border border-gray-600"
                    >
                        Chart
                    </button>
                    {signal.status !== SignalStatus.CLOSED && (
                        <button
                            onClick={() => onExecute(signal)}
                            className={`h-7 px-3 flex items-center justify-center font-bold rounded-md transition-colors text-[10px] uppercase tracking-wider shadow-lg ${isBuy ? 'bg-green-600 hover:bg-green-500 text-white shadow-green-900/20' : 'bg-red-600 hover:bg-red-500 text-white shadow-red-900/20'}`}
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
