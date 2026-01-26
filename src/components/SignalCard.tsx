import React from 'react';
import { Signal, SignalStatus, TradeDirection } from '../types';
import { BookmarkIcon, BookmarkOutlineIcon } from './IconComponents';

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
        case SignalStatus.ACTIVE: return 'bg-blue-500';
        case SignalStatus.CLOSED: return 'bg-gray-500';
        case SignalStatus.PENDING: return 'bg-yellow-500';
        default: return 'bg-gray-500';
    }
}

const formatPrice = (price: number | undefined) => {
    if (price === undefined || price === null) return '0.00';
    if (price === 0) return '0.00';
    if (price < 0.0001) return price.toFixed(8);
    if (price < 0.01) return price.toFixed(6);
    if (price < 1) return price.toFixed(4);
    return price.toFixed(2);
};

const SignalCard: React.FC<SignalCardProps> = ({ signal, currentPrice, onShowChart, onAddToWatchlist, onExecute, isAddedToWatchlist, onTogglePin }) => {
    const isBuy = signal.direction === TradeDirection.BUY;
    const borderColor = isBuy ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-red-500';

    // Check if signal is new (created within last 30 minutes)
    const isNew = (Date.now() - new Date(signal.timestamp).getTime()) < 30 * 60 * 1000;

    const copySignalToClipboard = () => {
        const text = `🎯 ${signal.pair} - ${signal.direction}\n📊 Strategy: ${signal.strategy}\n💰 Entry: ${signal.entry}\n🛑 Stop Loss: ${signal.stopLoss}\n🎯 Take Profit: ${signal.takeProfit}\n⏰ ${new Date(signal.timestamp).toLocaleString()}`;
        navigator.clipboard.writeText(text);
    };

    const riskReward = Math.abs((signal.takeProfit - signal.entry) / (signal.entry - signal.stopLoss)).toFixed(2);

    // Calculate Context Metrics
    const getContextMetrics = () => {
        if (!currentPrice || signal.status === SignalStatus.CLOSED) return null;

        const distToEntry = ((currentPrice - signal.entry) / signal.entry) * 100;
        const distToTP = ((signal.takeProfit - currentPrice) / currentPrice) * 100 * (isBuy ? 1 : -1);
        const distToSL = ((currentPrice - signal.stopLoss) / currentPrice) * 100 * (isBuy ? -1 : 1);

        return { distToEntry, distToTP, distToSL };
    };

    const context = getContextMetrics();

    // Time Context
    const getTimeContext = () => {
        if (signal.status === SignalStatus.ACTIVE && signal.activatedAt) {
            const diff = Date.now() - new Date(signal.activatedAt).getTime();
            const mins = Math.floor(diff / 60000);
            return { label: 'Active for', value: mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m` };
        }
        if (signal.status === SignalStatus.CLOSED && signal.closedAt) {
            return { label: 'Closed', value: new Date(signal.closedAt).toLocaleTimeString() };
        }
        const diff = Date.now() - new Date(signal.timestamp).getTime();
        const mins = Math.floor(diff / 60000);
        return { label: 'Created', value: mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago` };
    };

    const timeContext = getTimeContext();

    return (
        <div className={`bg-card-bg rounded-xl p-5 space-y-4 hover:shadow-xl transition-shadow relative ${borderColor}`}>
            {isNew && (
                <div className="absolute top-2 left-2 z-10">
                    <span className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-gradient-to-r from-yellow-400 to-yellow-500 text-black shadow-md">
                        NEW
                    </span>
                </div>
            )}

            {/* Pin Button - Top Right Corner */}
            <button
                onClick={(e) => { e.stopPropagation(); onTogglePin(signal); }}
                className={`absolute top-2 right-2 z-10 p-1.5 rounded-full transition-colors ${signal.isPinned ? 'text-yellow-400 bg-yellow-400/10 hover:bg-yellow-400/20' : 'text-gray-600 hover:text-gray-400'}`}
                title={signal.isPinned ? "Unpin Signal" : "Pin Signal"}
            >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M16 12V4H17V2H7V4H8V12L6 14V16H11.2V22H12.8V16H18V14L16 12Z" />
                </svg>
            </button>
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        {signal.pair}
                        <span className="text-xs text-gray-500">{signal.timeframe}</span>
                    </h3>
                    <p className="text-sm text-gray-400">{signal.strategy}</p>
                </div>
                <div className="flex items-center space-x-2">
                    <span className={`px-3 py-1 text-xs font-semibold rounded-full text-white ${getStatusColor(signal.status)}`}>
                        {signal.status}
                    </span>
                    <span className={`px-3 py-1 text-sm font-bold rounded-full ${isBuy ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        {signal.direction}
                    </span>
                </div>
            </div>

            {/* Live Context Data */}
            {context && signal.status === SignalStatus.ACTIVE && (
                <div className="bg-gray-800/40 rounded-lg p-2 text-xs space-y-1">
                    <div className="flex justify-between items-center">
                        <span className="text-gray-400">Current Price</span>
                        <span className="font-mono text-white">{formatPrice(currentPrice)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-gray-400">To Target</span>
                        <span className={`${context.distToTP > 0 ? 'text-green-400' : 'text-gray-400'}`}>
                            {context.distToTP > 0 ? '-' : '+'}{Math.abs(context.distToTP).toFixed(2)}%
                        </span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-gray-400">To Stop</span>
                        <span className={`${context.distToSL < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                            {Math.abs(context.distToSL).toFixed(2)}%
                        </span>
                    </div>
                </div>
            )}

            {/* Pending Context */}
            {context && signal.status === SignalStatus.PENDING && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2 text-xs flex justify-between items-center">
                    <span className="text-yellow-500">Distance to Entry</span>
                    <span className="font-mono text-white">{Math.abs(context.distToEntry).toFixed(2)}%</span>
                </div>
            )}

            <div className="grid grid-cols-4 gap-3 text-center">
                <div className="bg-gray-800/50 rounded-lg p-2">
                    <p className="text-xs text-gray-400">Entry</p>
                    <p className="text-sm font-semibold text-white">{formatPrice(signal.entry)}</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-2">
                    <p className="text-xs text-gray-400">Stop Loss</p>
                    <p className="text-sm font-semibold text-red-400">{formatPrice(signal.stopLoss)}</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-2">
                    <p className="text-xs text-gray-400">Take Profit</p>
                    <p className="text-sm font-semibold text-green-400">{formatPrice(signal.takeProfit)}</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-2">
                    <p className="text-xs text-gray-400">R:R</p>
                    <p className="text-sm font-semibold text-blue-400">1:{riskReward}</p>
                </div>
            </div>

            <div className="flex justify-between items-center text-xs text-gray-400 pt-2 border-t border-gray-700">
                <span className="flex items-center gap-1">
                    <span className="text-gray-500">{timeContext.label}:</span>
                    <span className="text-gray-300 font-medium">{timeContext.value}</span>
                </span>
                <div className="flex items-center space-x-2">
                    <button
                        onClick={copySignalToClipboard}
                        className="p-1.5 rounded-md text-gray-400 hover:bg-gray-700 transition-colors"
                        title="Copy to clipboard"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                    </button>
                    <button
                        onClick={() => onAddToWatchlist(signal.pair)}
                        className="p-1.5 rounded-md text-blue-400 hover:bg-blue-500/20 transition-colors"
                        title={isAddedToWatchlist ? "Manage in Watchlist" : "Add to Watchlist"}
                    >
                        {isAddedToWatchlist ? <BookmarkIcon className="w-4 h-4" /> : <BookmarkOutlineIcon className="w-4 h-4" />}
                    </button>
                    {signal.chartData && (
                        <button
                            onClick={() => onShowChart(signal)}
                            className="bg-gray-700 text-white font-semibold py-1.5 px-3 rounded-md hover:bg-gray-600 transition-colors text-xs"
                        >
                            Chart
                        </button>
                    )}
                    {signal.status !== SignalStatus.CLOSED && (
                        <button
                            onClick={() => onExecute(signal)}
                            className={`${isBuy ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'} text-white font-semibold py-1.5 px-3 rounded-md transition-colors text-xs`}
                        >
                            Execute
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export default SignalCard;
