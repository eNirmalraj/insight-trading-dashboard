// src/components/SignalRow.tsx
import React from 'react';
import { Signal, SignalStatus, TradeDirection } from '../types';
import { computeSignalPnl } from '../utils/signalPnl';

interface SignalRowProps {
    signal: Signal;
    currentPrice?: number;
    onShowChart: (signal: Signal) => void;
    onExecute: (signal: Signal) => void;
}

const formatCreated = (timestamp: string | number | Date): string => {
    const d = new Date(timestamp);
    if (Number.isNaN(d.getTime())) return '—';
    const isToday = d.toDateString() === new Date().toDateString();
    return isToday
        ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const formatPrice = (price: number | undefined | null): string => {
    if (price === undefined || price === null || Number.isNaN(price)) return '—';
    if (price === 0) return '0.00';
    if (price < 0.0001) return price.toFixed(8);
    if (price < 0.01) return price.toFixed(6);
    if (price < 1) return price.toFixed(4);
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const SignalRow: React.FC<SignalRowProps> = ({ signal, currentPrice, onShowChart, onExecute }) => {
    const isBuy = signal.direction === TradeDirection.BUY;
    const { pct, ratio } = computeSignalPnl(signal, currentPrice);

    const pnlNumberClass =
        pct === null
            ? 'text-gray-500'
            : pct >= 0
              ? 'text-green-400'
              : 'text-red-400';
    const pnlLabel = pct === null ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;

    // Bar fill width = |ratio| * 50% of the bar (so full TP = half width, full SL = half width)
    const fillWidthPct = Math.abs(ratio) * 50;
    const fillIsProfit = ratio >= 0;

    const statusClasses: Record<string, string> = {
        [SignalStatus.ACTIVE]: 'bg-gray-700/50 text-gray-200 border-gray-600',
        [SignalStatus.CLOSED]: 'bg-gray-800 text-gray-500 border-gray-700',
        [SignalStatus.PENDING]: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    };

    return (
        <tr className="border-b border-gray-800 hover:bg-gray-800/40 transition-colors">
            {/* Symbol */}
            <td className="px-3 py-3 font-bold text-white text-sm whitespace-nowrap">
                {signal.pair}
            </td>

            {/* Timeframe */}
            <td className="px-3 py-3 text-center">
                <span className="inline-block text-[10px] text-gray-400 bg-gray-800 border border-gray-700 rounded px-2 py-0.5">
                    {signal.timeframe}
                </span>
            </td>

            {/* Strategy */}
            <td className="px-3 py-3 text-gray-300 text-xs whitespace-nowrap">
                {signal.strategy || '—'}
            </td>

            {/* Direction */}
            <td className="px-3 py-3 text-center">
                <span className={`text-xs font-bold ${isBuy ? 'text-green-400' : 'text-red-400'}`}>
                    {signal.direction}
                </span>
            </td>

            {/* Entry */}
            <td className="px-3 py-3 text-right font-mono text-xs text-white whitespace-nowrap">
                {formatPrice(signal.entry)}
            </td>

            {/* SL */}
            <td className="px-3 py-3 text-right font-mono text-xs text-red-400 whitespace-nowrap">
                {formatPrice(signal.stopLoss)}
            </td>

            {/* TP */}
            <td className="px-3 py-3 text-right font-mono text-xs text-green-400 whitespace-nowrap">
                {formatPrice(signal.takeProfit)}
            </td>

            {/* Live price */}
            <td className="px-3 py-3 text-right font-mono text-xs text-white whitespace-nowrap">
                {formatPrice(currentPrice)}
            </td>

            {/* P&L cell with visual bar */}
            <td className="px-3 py-3 min-w-[180px]">
                <div className="flex flex-col gap-1">
                    <div className={`text-right font-mono text-sm font-bold ${pnlNumberClass}`}>
                        {pnlLabel}
                    </div>
                    <div className="relative h-1.5 bg-gray-800 rounded-full">
                        {/* center tick */}
                        <div className="absolute left-1/2 top-[-2px] w-px h-[10px] bg-gray-500" />
                        {/* fill */}
                        {pct !== null && (
                            <div
                                className={`absolute top-0 h-full rounded-full ${fillIsProfit ? 'bg-gradient-to-r from-green-600 to-green-400' : 'bg-gradient-to-l from-red-600 to-red-400'}`}
                                style={
                                    fillIsProfit
                                        ? { left: '50%', width: `${fillWidthPct}%` }
                                        : { right: '50%', width: `${fillWidthPct}%` }
                                }
                            />
                        )}
                    </div>
                    <div className="flex justify-between text-[9px] text-gray-500 font-mono">
                        <span className="text-red-500">-SL</span>
                        <span>0</span>
                        <span className="text-green-500">+TP</span>
                    </div>
                </div>
            </td>

            {/* Status */}
            <td className="px-3 py-3 text-center">
                <span
                    className={`inline-block text-[9px] font-bold uppercase tracking-wide rounded border px-2 py-0.5 ${statusClasses[signal.status] ?? 'bg-gray-800 border-gray-700 text-gray-400'}`}
                >
                    {signal.status}
                </span>
            </td>

            {/* Created */}
            <td className="px-3 py-3 text-right font-mono text-[11px] text-gray-400 whitespace-nowrap">
                {formatCreated(signal.timestamp)}
            </td>

            {/* Actions */}
            <td className="px-3 py-3 text-right whitespace-nowrap">
                <button
                    type="button"
                    onClick={() => onShowChart(signal)}
                    className="text-[10px] px-3 py-1.5 rounded-md bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-700 transition-colors mr-1"
                >
                    Chart
                </button>
                {signal.status !== SignalStatus.CLOSED && (
                    <button
                        type="button"
                        onClick={() => onExecute(signal)}
                        className={`text-[10px] px-3 py-1.5 rounded-md font-bold transition-colors ${
                            isBuy
                                ? 'bg-green-600/20 text-green-400 border border-green-500/40 hover:bg-green-600/30'
                                : 'bg-red-600/20 text-red-400 border border-red-500/40 hover:bg-red-600/30'
                        }`}
                    >
                        Execute
                    </button>
                )}
            </td>
        </tr>
    );
};

export default SignalRow;
