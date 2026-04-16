// src/components/SignalChartModal.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Signal, Strategy } from '../types';
import { Candle, HorizontalLineDrawing, SignalMarkerDrawing, Drawing } from './market-chart/types';
import CandlestickChart from './market-chart/CandlestickChart';
import { getCandlesWithCache } from '../services/marketDataService';
import { getStrategies } from '../services/strategyService';
import { CloseIcon } from './IconComponents';
import Loader from './Loader';

interface SignalChartModalProps {
    signal: Signal;
    onClose: () => void;
}

function buildSignalDrawings(signal: Signal): Drawing[] {
    const drawings: Drawing[] = [];

    // Entry price line (yellow dashed)
    if (signal.entry) {
        drawings.push({
            id: '__signal-entry',
            type: 'Horizontal Line',
            price: signal.entry,
            style: { color: '#eab308', width: 1, lineStyle: 'solid' },
        } as HorizontalLineDrawing);
    }
    // Stop loss line (red dashed)
    if (signal.stopLoss) {
        drawings.push({
            id: '__signal-sl',
            type: 'Horizontal Line',
            price: signal.stopLoss,
            style: { color: '#ef4444', width: 1, lineStyle: 'solid' },
        } as HorizontalLineDrawing);
    }
    // Take profit line (green dashed)
    if (signal.takeProfit) {
        drawings.push({
            id: '__signal-tp',
            type: 'Horizontal Line',
            price: signal.takeProfit,
            style: { color: '#22c55e', width: 1, lineStyle: 'solid' },
        } as HorizontalLineDrawing);
    }
    // Entry marker — ▲/▼ on the entry candle + tiny ▶ at price
    if (signal.timestamp && signal.entry) {
        const isBuy = signal.direction === 'BUY';
        drawings.push({
            id: '__signal-entry-marker',
            type: 'Signal Marker',
            point: {
                time: Math.floor(new Date(signal.timestamp).getTime() / 1000),
                price: signal.entry,
            },
            style: { color: '#8b5cf6', width: 1, lineStyle: 'solid' },
            signal: isBuy ? 'buy' : 'sell',
            markerType: 'entry',
        } as unknown as Drawing);
    }


    return drawings;
}

const EMPTY_TOOLS: { icon: React.ReactNode; name: string; category: string }[] = [];

const READONLY_SETTINGS: Record<string, any> = {
    scalesAndLines: {
        showGrid: false,
    },
};

const SignalChartModal: React.FC<SignalChartModalProps> = ({ signal, onClose }) => {
    const [candles, setCandles] = useState<Candle[]>([]);
    const [strategies, setStrategies] = useState<Strategy[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [scriptToAdd, setScriptToAdd] = useState<string | null>(signal.strategyId || null);
    const [isFullView, setIsFullView] = useState(false);

    // Escape key handler
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [onClose]);

    // Fetch candles + strategy on mount
    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const [candleResult, allStrategies] = await Promise.all([
                    getCandlesWithCache(signal.pair, signal.timeframe, 300),
                    getStrategies(),
                ]);

                if (cancelled) return;
                setCandles(candleResult.data);
                setStrategies(allStrategies);
            } catch (err: any) {
                if (cancelled) return;
                console.error('[SignalChartModal] load failed:', err);
                setError(err?.message || 'Failed to load chart data');
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };

        load();
        return () => { cancelled = true; };
    }, [signal.pair, signal.timeframe]);

    const levelDrawings = buildSignalDrawings(signal);

    // No-op callbacks for read-only mode
    const noop = useCallback(() => {}, []);
    const noopStr = useCallback((_s: string) => {}, []);

    const handleRetry = () => {
        setError(null);
        setIsLoading(true);
        getCandlesWithCache(signal.pair, signal.timeframe, 300)
            .then((result) => setCandles(result.data))
            .catch((err) => setError(err?.message || 'Failed to load chart data'))
            .finally(() => setIsLoading(false));
    };

    const panelClasses = isFullView
        ? 'fixed inset-0 bg-[#0f0f13] z-50 flex flex-col'
        : 'relative w-[80vw] max-w-[1200px] h-[70vh] bg-[#0f0f13] rounded-xl border border-gray-700 shadow-2xl flex flex-col overflow-hidden';

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className={panelClasses}>
                {/* Top bar — close + fullscreen toggle */}
                <div className="absolute top-3 right-3 z-[60] flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setIsFullView((v) => !v)}
                        title={isFullView ? 'Exit full view' : 'Full view'}
                        aria-label={isFullView ? 'Exit full view' : 'Full view'}
                        className="p-2 rounded-lg bg-gray-800/80 hover:bg-gray-700 transition-colors border border-gray-700"
                    >
                        {isFullView ? (
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m0 0v5m0-5h5m6 6l5 5m0 0v-5m0 5h-5" />
                            </svg>
                        ) : (
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
                            </svg>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close chart"
                        className="p-2 rounded-lg bg-gray-800/80 hover:bg-gray-700 transition-colors border border-gray-700"
                    >
                        <CloseIcon className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                {/* Chart */}
                <div className="flex-1 min-h-0">
                    {isLoading && (
                        <div className="flex items-center justify-center h-full">
                            <Loader />
                        </div>
                    )}

                    {error && (
                        <div className="flex flex-col items-center justify-center h-full gap-4">
                            <p className="text-red-400 text-sm">{error}</p>
                            <button
                                type="button"
                                onClick={handleRetry}
                                className="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm hover:bg-blue-600 transition-colors"
                            >
                                Retry
                            </button>
                        </div>
                    )}

                    {!isLoading && !error && candles.length > 0 && (
                        <CandlestickChart
                            data={candles}
                            tools={EMPTY_TOOLS}
                            symbol={signal.pair}
                            onSymbolChange={noopStr}
                            allTimeframes={[signal.timeframe]}
                            favoriteTimeframes={[signal.timeframe]}
                            activeTimeframe={signal.timeframe}
                            onTimeframeChange={noopStr}
                            onToggleFavorite={noopStr}
                            onAddCustomTimeframe={noopStr}
                            onLogout={noop}
                            onToggleMobileSidebar={noop}
                            initialSettings={READONLY_SETTINGS}
                            initialDrawings={levelDrawings}
                            customScripts={strategies}
                            autoAddScriptId={scriptToAdd}
                            onAutoAddComplete={() => setScriptToAdd(null)}
                            readOnly
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default SignalChartModal;
