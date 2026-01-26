import React from 'react';
import { Signal, SignalStatus, TradeDirection } from '../types';
import { BookmarkIcon, BookmarkOutlineIcon } from './IconComponents';
import SignalProgressBar from './SignalProgressBar';

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

            {/* Progress Bar */}
            <SignalProgressBar signal={signal} currentPrice={currentPrice} className="mb-2" />

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
                <span>{new Date(signal.timestamp).toLocaleString()}</span>
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
