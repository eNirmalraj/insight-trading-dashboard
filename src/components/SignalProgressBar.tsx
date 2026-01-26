import React from 'react';
import { Signal, SignalStatus } from '../types';

interface SignalProgressBarProps {
    signal: Signal;
    currentPrice?: number;
    className?: string;
}

const SignalProgressBar: React.FC<SignalProgressBarProps> = ({ signal, currentPrice, className = '' }) => {

    // CLOSED STATE VISUALIZATION
    if (signal.status === SignalStatus.CLOSED) {
        const { entry, stopLoss, takeProfit } = signal;
        const pnl = (signal as any).profit_loss ?? signal.profitLoss;
        const reason = (signal as any).close_reason ?? signal.closeReason;

        let barColor = 'bg-gray-600';
        let resultText = 'Closed';
        let isWin = false;

        // Determine if win or loss
        if (typeof pnl === 'number') {
            if (pnl > 0) {
                barColor = 'bg-green-500';
                resultText = 'Target Hit';
                isWin = true;
            } else if (pnl < 0) {
                barColor = 'bg-red-500';
                resultText = 'Stop Loss Hit';
                isWin = false;
            }
        } else if (reason) {
            if (reason === 'TP' || reason === 'MANUAL_PROFIT') {
                barColor = 'bg-green-500';
                resultText = 'Target Hit';
                isWin = true;
            } else if (reason === 'SL' || reason === 'MANUAL_LOSS') {
                barColor = 'bg-red-500';
                resultText = 'Stop Loss Hit';
                isWin = false;
            }
        }

        // Calculate bar positioning (similar to active signals)
        const totalRange = takeProfit - stopLoss;
        if (totalRange === 0) return null;

        const getRatio = (price: number) => (price - stopLoss) / totalRange;
        const entryRatio = Math.min(1, Math.max(0, getRatio(entry)));

        // For closed signals, show bar from Entry to the close point
        const closeRatio = isWin ? 1 : 0; // TP hit = right edge (1), SL hit = left edge (0)
        const barStart = Math.min(entryRatio, closeRatio) * 100;
        const barWidth = Math.abs(closeRatio - entryRatio) * 100;

        return (
            <div className={`w-full ${className}`}>
                <div className="flex justify-between text-[10px] text-gray-400 mb-1 font-mono uppercase">
                    <span className="text-red-400">SL</span>
                    <span className={isWin ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
                        {resultText}
                    </span>
                    <span className="text-green-400">TP</span>
                </div>

                {/* The Bar Track */}
                <div className="relative h-2.5 bg-gray-800 rounded-full w-full overflow-hidden">
                    {/* SL Marker (Left) */}
                    <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-red-900/50 z-10" />

                    {/* TP Marker (Right) */}
                    <div className="absolute right-0 top-0 bottom-0 w-[2px] bg-green-900/50 z-10" />

                    {/* Entry Marker */}
                    <div
                        className="absolute top-0 bottom-0 w-[2px] bg-gray-400 z-20"
                        style={{ left: `${entryRatio * 100}%` }}
                    />

                    {/* Result Fill Bar */}
                    <div
                        className={`absolute top-0 bottom-0 h-full ${barColor} transition-all duration-300`}
                        style={{
                            left: `${barStart}%`,
                            width: `${Math.max(barWidth, 2)}%`
                        }}
                    />
                </div>

                {/* P/L Display */}
                {typeof pnl === 'number' && (
                    <div className={`text-center text-[10px] mt-1 font-bold ${pnl > 0 ? "text-green-400" : "text-red-400"}`}>
                        {pnl > 0 ? '+' : ''}{pnl.toFixed(2)}%
                    </div>
                )}
            </div>
        );
    }

    // PENDING SIGNALS: Show distance to entry
    if (signal.status === SignalStatus.PENDING) {
        if (!currentPrice) return <div className="h-8" />; // Placeholder space

        const distance = Math.abs((currentPrice - signal.entry) / signal.entry) * 100;
        const isNear = distance < 0.2;

        return (
            <div className={`space-y-1 ${className}`}>
                <div className="flex justify-between text-xs text-gray-400">
                    <span>Pending Entry</span>
                    <span className={isNear ? "text-yellow-400 animate-pulse font-bold" : ""}>
                        {distance.toFixed(2)}% away
                    </span>
                </div>
                <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    {/* Indeterminate loader looking bar or inverted progress */}
                    <div
                        className="h-full bg-yellow-600 transition-all duration-500 rounded-full"
                        style={{ width: `${Math.max(5, 100 - (distance * 20))}%` }}
                    />
                </div>
            </div>
        );
    }

    // ACTIVE SIGNALS: Single Bar Layout
    if (currentPrice) {
        const { entry, stopLoss, takeProfit } = signal;

        const totalRange = takeProfit - stopLoss;
        if (totalRange === 0) return null; // Protect division by zero

        const getRatio = (price: number) => (price - stopLoss) / totalRange;

        const entryRatio = getRatio(entry);
        const currentRatio = getRatio(currentPrice);

        // Clamp ratios to visible area (0% to 100%)
        const clampedCurrent = Math.min(1, Math.max(0, currentRatio));
        const clampedEntry = Math.min(1, Math.max(0, entryRatio));

        // Determine Profit/Loss state relative to Entry
        const isProfit = currentRatio > entryRatio;

        // Bar Fill Logic
        // Start from Entry. End at Current.
        // We use Math.min/max to define the "span" of the bar.
        const barStart = Math.min(clampedEntry, clampedCurrent) * 100;
        const barWidth = Math.abs(clampedCurrent - clampedEntry) * 100;

        return (
            <div className={`w-full ${className}`}>
                {/* Labels Layout */}
                <div className="flex justify-between text-[10px] text-gray-400 mb-1 font-mono uppercase">
                    <span className="text-red-400">SL</span>
                    <span className="text-gray-500">Entry</span>
                    <span className="text-green-400">TP</span>
                </div>

                {/* The Bar Track */}
                <div className="relative h-2.5 bg-gray-800 rounded-full w-full overflow-hidden">

                    {/* Tick Markers */}
                    {/* SL Marker (Left) */}
                    <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-red-900/50 z-10" />

                    {/* TP Marker (Right) */}
                    <div className="absolute right-0 top-0 bottom-0 w-[2px] bg-green-900/50 z-10" />

                    {/* Entry Marker (Middle-ish) */}
                    <div
                        className="absolute top-0 bottom-0 w-[2px] bg-gray-400 z-20"
                        style={{ left: `${clampedEntry * 100}%` }}
                    />

                    {/* Current Price Marker / Fill */}
                    <div
                        className={`absolute top-0 bottom-0 h-full transition-all duration-300 ease-out ${isProfit ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]'
                            }`}
                        style={{
                            left: `${barStart}%`,
                            width: `${Math.max(barWidth, 2)}%` // Ensure at least visible dot
                        }}
                    />

                </div>

                {/* Numeric Status Below */}
                <div className="flex justify-between items-center mt-1">
                    <span className="text-[10px] text-gray-500">{stopLoss}</span>
                    <span
                        className={`text-[11px] font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}
                    >
                        {/* Dynamic Percentage Label */}
                        {isProfit
                            ? `+${((currentRatio - entryRatio) / (1 - entryRatio) * 100).toFixed(1)}%`
                            : `${((currentRatio - entryRatio) / entryRatio * 100).toFixed(1)}%`
                        }
                    </span>
                    <span className="text-[10px] text-gray-500">{takeProfit}</span>
                </div>
            </div>
        );
    }

    return null;
};

export default SignalProgressBar;
