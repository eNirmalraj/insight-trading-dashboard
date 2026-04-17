// src/components/SignalTable.tsx
import React from 'react';
import { Signal } from '../types';
import SignalRow from './SignalRow';
import { StrategyWinRate } from '../utils/strategyStats';

interface SignalTableProps {
    signals: Signal[];
    currentPrices: Record<string, number>;
    onShowChart: (signal: Signal) => void;
    onExecute: (signal: Signal) => void;
    strategyStats?: Map<string, StrategyWinRate>;
}

const SignalTable: React.FC<SignalTableProps> = ({
    signals,
    currentPrices,
    onShowChart,
    onExecute,
    strategyStats,
}) => {
    if (signals.length === 0) {
        return (
            <div className="bg-card-bg rounded-xl border border-gray-700 p-8 text-center">
                <p className="text-gray-400 text-sm">No signals match your filters.</p>
            </div>
        );
    }

    return (
        <div className="bg-card-bg rounded-xl border border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <caption className="sr-only">Trading signals, list view</caption>
                    <thead className="bg-gray-900/60 border-b border-gray-700">
                        <tr>
                            <th className="px-3 py-3 text-[10px] uppercase tracking-wide text-gray-400 font-semibold">
                                Symbol
                            </th>
                            <th className="px-3 py-3 text-[10px] uppercase tracking-wide text-gray-400 font-semibold text-center">
                                TF
                            </th>
                            <th className="px-3 py-3 text-[10px] uppercase tracking-wide text-gray-400 font-semibold">
                                Strategy
                            </th>
                            <th className="px-3 py-3 text-[10px] uppercase tracking-wide text-gray-400 font-semibold text-center">
                                Dir
                            </th>
                            <th className="px-3 py-3 text-[10px] uppercase tracking-wide text-gray-400 font-semibold text-right">
                                Entry
                            </th>
                            <th className="px-3 py-3 text-[10px] uppercase tracking-wide text-gray-400 font-semibold text-right">
                                SL
                            </th>
                            <th className="px-3 py-3 text-[10px] uppercase tracking-wide text-gray-400 font-semibold text-right">
                                TP
                            </th>
                            <th className="px-3 py-3 text-[10px] uppercase tracking-wide text-gray-400 font-semibold text-right">
                                Live
                            </th>
                            <th className="px-3 py-3 text-[10px] uppercase tracking-wide text-gray-400 font-semibold text-right">
                                P&amp;L
                            </th>
                            <th className="px-3 py-3 text-[10px] uppercase tracking-wide text-gray-400 font-semibold text-center">
                                Status
                            </th>
                            <th className="px-3 py-3 text-[10px] uppercase tracking-wide text-gray-400 font-semibold text-right">
                                Created
                            </th>
                            <th className="px-3 py-3 text-[10px] uppercase tracking-wide text-gray-400 font-semibold text-right">
                                Closed
                            </th>
                            <th className="px-3 py-3 text-[10px] uppercase tracking-wide text-gray-400 font-semibold text-right">
                                Duration
                            </th>
                            <th className="px-3 py-3 text-[10px] uppercase tracking-wide text-gray-400 font-semibold text-right">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {signals.map((signal) => (
                            <SignalRow
                                key={signal.id}
                                signal={signal}
                                currentPrice={currentPrices[signal.pair]}
                                onShowChart={onShowChart}
                                onExecute={onExecute}
                                strategyWinRate={strategyStats?.get(signal.strategyId || signal.strategy || '')}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default SignalTable;
