import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as ReactRouterDOM from 'react-router-dom';
import CandlestickChart from '../components/CandlestickChart';
import type { ChartError } from '../components/market-chart/errorUtils';
import { toChartErrorFromString } from '../components/market-chart/errorUtils';
import {
    HorizontalLineIcon,
    ParallelChannelIcon,
    TrendLineIcon,
    RectangleIcon,
    TextIcon,
    PathIcon,
    BrushIcon,
    VerticalLineIcon,
    ArrowIcon,
    CalloutIcon,
    PriceMeasureIcon,
    DateMeasureIcon,
    DatePriceMeasureIcon,
    LongPositionIcon,
    ShortPositionIcon,
    HorizontalRayIcon,
    GannBoxIcon,
    FibRetracementIcon,
} from '../components/IconComponents';
import * as api from '../api'; // Keep for other API calls if any
import { getCandles, getCandlesWithCache } from '../services/marketDataService';
import { preloadCommonSymbols } from '../services/marketCacheService';
import { marketRealtimeService } from '../services/marketRealtimeService';
import { alertEngine } from '../engine/alertEngine';
import {
    loadMarketState,
    saveMarketState,
    loadChartSettings,
    saveChartSettings,
} from '../services/marketStateService';
import { loadDrawings, saveDrawings } from '../services/chartDrawingService';
import { Candle, ChartSettings, Drawing } from '../components/market-chart/types';
// Registry removed
import Loader from '../components/Loader';
import { Strategy } from '../types';

interface MarketProps {
    onLogout: () => void;
    onToggleMobileSidebar: () => void;
}

import { useAuth } from '../context/AuthContext';

class ChartErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { hasError: boolean; error: Error | null }
> {
    state = { hasError: false, error: null as Error | null };
    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }
    render() {
        if (this.state.hasError) {
            return (
                <div className="h-full flex flex-col items-center justify-center gap-4 error-boundary-container">
                    <svg
                        className="w-12 h-12 error-boundary-icon"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                        />
                    </svg>
                    <p className="error-boundary-text">Chart failed to load</p>
                    <button
                        type="button"
                        onClick={() => this.setState({ hasError: false, error: null })}
                        className="error-boundary-btn"
                    >
                        Retry
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

const Market: React.FC<MarketProps> = ({ onLogout, onToggleMobileSidebar }) => {
    const { user, isLoading: isAuthLoading } = useAuth();
    const location = ReactRouterDOM.useLocation();
    const chartTools = [
        {
            icon: <TrendLineIcon className="w-5 h-5" />,
            name: 'Trend Line',
            category: 'Trend lines',
        },
        {
            icon: <HorizontalRayIcon className="w-5 h-5" />,
            name: 'Horizontal Ray',
            category: 'Trend lines',
        },
        {
            icon: <HorizontalLineIcon className="w-5 h-5" />,
            name: 'Horizontal Line',
            category: 'Trend lines',
        },
        {
            icon: <VerticalLineIcon className="w-5 h-5" />,
            name: 'Vertical Line',
            category: 'Trend lines',
        },
        {
            icon: <ParallelChannelIcon className="w-5 h-5" />,
            name: 'Parallel Channel',
            category: 'Trend lines',
        },
        { icon: <ArrowIcon className="w-5 h-5" />, name: 'Arrow', category: 'Trend lines' },

        {
            icon: <GannBoxIcon className="w-5 h-5" />,
            name: 'Gann Box',
            category: 'Gann and Fibonacci',
        },
        {
            icon: <FibRetracementIcon className="w-5 h-5" />,
            name: 'Fibonacci Retracement',
            category: 'Gann and Fibonacci',
        },

        {
            icon: <RectangleIcon className="w-5 h-5" />,
            name: 'Rectangle',
            category: 'Geometric shapes',
        },
        { icon: <PathIcon className="w-5 h-5" />, name: 'Path', category: 'Geometric shapes' },
        { icon: <BrushIcon className="w-5 h-5" />, name: 'Brush', category: 'Geometric shapes' },
        {
            icon: <span className="w-5 h-5 flex items-center justify-center text-xs">○</span>,
            name: 'Circle',
            category: 'Geometric shapes',
        },
        {
            icon: <span className="w-5 h-5 flex items-center justify-center text-xs">⬭</span>,
            name: 'Ellipse',
            category: 'Geometric shapes',
        },
        {
            icon: <span className="w-5 h-5 flex items-center justify-center text-xs">△</span>,
            name: 'Triangle',
            category: 'Geometric shapes',
        },
        {
            icon: <span className="w-5 h-5 flex items-center justify-center text-xs">⌒</span>,
            name: 'Arc',
            category: 'Geometric shapes',
        },
        {
            icon: <span className="w-5 h-5 flex items-center justify-center text-xs">⬠</span>,
            name: 'Polygon',
            category: 'Geometric shapes',
        },

        { icon: <TextIcon className="w-5 h-5" />, name: 'Text Note', category: 'Annotation' },
        { icon: <CalloutIcon className="w-5 h-5" />, name: 'Callout', category: 'Annotation' },

        {
            icon: <PriceMeasureIcon className="w-5 h-5" />,
            name: 'Price Range',
            category: 'Forecasting and Measurement',
        },
        {
            icon: <DateMeasureIcon className="w-5 h-5" />,
            name: 'Date Range',
            category: 'Forecasting and Measurement',
        },
        {
            icon: <DatePriceMeasureIcon className="w-5 h-5" />,
            name: 'Date & Price Range',
            category: 'Forecasting and Measurement',
        },
        {
            icon: <LongPositionIcon className="w-5 h-5" />,
            name: 'Long Position',
            category: 'Forecasting and Measurement',
        },
        {
            icon: <ShortPositionIcon className="w-5 h-5" />,
            name: 'Short Position',
            category: 'Forecasting and Measurement',
        },
        {
            icon: (
                <span className="w-5 h-5 flex items-center justify-center text-xs font-bold">
                    $
                </span>
            ),
            name: 'Price Label',
            category: 'Forecasting and Measurement',
        },
        {
            icon: <span className="w-5 h-5 flex items-center justify-center text-xs">▲</span>,
            name: 'Signal Marker',
            category: 'Forecasting and Measurement',
        },
        {
            icon: <span className="w-5 h-5 flex items-center justify-center text-xs">⚑</span>,
            name: 'Note Flag',
            category: 'Forecasting and Measurement',
        },
        {
            icon: <span className="w-5 h-5 flex items-center justify-center text-xs">□</span>,
            name: 'Highlight Zone',
            category: 'Geometric shapes',
        },
        {
            icon: <span className="w-5 h-5 flex items-center justify-center text-xs">😀</span>,
            name: 'Emoji Sticker',
            category: 'Geometric shapes',
        },
        {
            icon: <span className="w-5 h-5 flex items-center justify-center text-xs">📏</span>,
            name: 'Measure Tool',
            category: 'Forecasting and Measurement',
        },
    ];
    const [allTimeframes, setAllTimeframes] = useState([
        '1m',
        '3m',
        '5m',
        '15m',
        '30m',
        '45m',
        '1H',
        '2H',
        '3H',
        '4H',
        '1D',
        '1W',
        '1M',
    ]);
    const [symbol, setSymbol] = useState<string | null>(null);
    const [activeTimeframe, setActiveTimeframe] = useState<string | null>(null);
    const [favoriteTimeframes, setFavoriteTimeframes] = useState(['5m', '15m', '1H', '4H', '1D']);
    const [chartData, setChartData] = useState<Candle[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [customIndicators, setCustomIndicators] = useState<Strategy[]>([]);
    const [initialChartSettings, setInitialChartSettings] = useState<ChartSettings | null>(null);
    const [initialDrawings, setInitialDrawings] = useState<Drawing[]>([]);
    const saveDrawingsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [autoAddScriptId, setAutoAddScriptId] = useState<string | null>(null);

    // Chart error banner state
    const [chartErrors, setChartErrors] = useState<ChartError[]>([]);

    const addChartError = useCallback((error: ChartError) => {
        setChartErrors((prev) => [...prev.filter((e) => e.source !== error.source), error]);
    }, []);

    const dismissChartError = useCallback((id: string) => {
        setChartErrors((prev) => prev.filter((e) => e.id !== id));
    }, []);

    const clearChartErrors = useCallback((source?: string) => {
        if (source) {
            setChartErrors((prev) => prev.filter((e) => e.source !== source));
        } else {
            setChartErrors([]);
        }
    }, []);

    // Detect ?addScript=<id> from URL (sent by Strategy Studio "Add to chart")
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const scriptId = params.get('addScript');
        if (scriptId) {
            setAutoAddScriptId(scriptId);
            // Clean URL param so it doesn't re-trigger on navigation
            params.delete('addScript');
            const cleanSearch = params.toString();
            window.history.replaceState(
                null,
                '',
                window.location.pathname +
                    window.location.hash.split('?')[0] +
                    (cleanSearch ? '?' + cleanSearch : '')
            );
        }
    }, [location.search]);

    useEffect(() => {
        // Only load if auth is ready
        if (isAuthLoading) return;

        const loadState = async () => {
            // ... existing loadState content ...
            try {
                // If user is null (not logged in), defaults will be returned by service or we can set them here if needed
                // Service handles it gracefully returning defaults
                const state = await loadMarketState();
                setSymbol(state.symbol);
                setActiveTimeframe(state.timeframe);

                const settings = await loadChartSettings();
                setInitialChartSettings(settings);

                // Load drawings for initial symbol/timeframe
                // Note: savedState might be empty, so use defaults if needed, but we used them above
                if (state) {
                    const drawings = await loadDrawings(state.symbol, state.timeframe);
                    setInitialDrawings(drawings);
                    alertEngine.setDrawings(drawings);
                } else {
                    // Default fallback load
                    const drawings = await loadDrawings('BTCUSDT.P', '1H');
                    setInitialDrawings(drawings);
                    alertEngine.setDrawings(drawings);
                }
            } catch (error) {
                console.error('Failed to load market state', error);
                addChartError(
                    toChartErrorFromString('Failed to load market state', 'Market State')
                );
                // Fallback defaults
                setSymbol('BTCUSDT.P');
                setActiveTimeframe('1H');
            }
        };
        loadState();
    }, [isAuthLoading, user]);

    // Save market state on change
    useEffect(() => {
        if (!symbol || !activeTimeframe || isAuthLoading) return;

        const saveTimeout = setTimeout(() => {
            saveMarketState({ symbol, timeframe: activeTimeframe });
        }, 1000); // Debounce saves
        return () => clearTimeout(saveTimeout);
    }, [symbol, activeTimeframe, isAuthLoading]);

    const handleSettingsChange = (settings: ChartSettings) => {
        // Debounce handled by service if needed, but here simple call is fine
        // Maybe debounce here to avoid too many writes if settings change rapidly (e.g. dragging)
        // Service writes are upserts, okay to be somewhat frequent but let's debounce slightly if possible?
        // For now direct call, assuming component doesn't spam onSettingsChange too fast (e.g. only on completion of action)
        // Actually, internal state updates on drag, so we should debounce.

        // Using a ref for debounce would be better?
        // Let's implement simple save for now.
        saveChartSettings(settings);
    };

    const handleDrawingsChange = (drawings: Drawing[]) => {
        if (!symbol || !activeTimeframe) return;

        // Sync with engine
        alertEngine.setDrawings(drawings);

        // Debounce save
        if (saveDrawingsTimeoutRef.current) {
            clearTimeout(saveDrawingsTimeoutRef.current);
        }

        saveDrawingsTimeoutRef.current = setTimeout(() => {
            saveDrawings(symbol, activeTimeframe, drawings);
        }, 1000); // 1 second debounce
    };

    // Reload drawings when symbol/timeframe changes
    useEffect(() => {
        if (isAuthLoading || isLoading) return;
        if (!symbol || !activeTimeframe) return;

        const load = async () => {
            const drawings = await loadDrawings(symbol, activeTimeframe);
            setInitialDrawings(drawings);
        };
        load();
    }, [symbol, activeTimeframe, isAuthLoading, isLoading]);

    useEffect(() => {
        // Load custom indicators
        const loadIndicators = async () => {
            try {
                // Determine source for strategies:
                // Since strategyService exports getStrategies, we use that.
                // We need to dynamic import or use the imported api?
                // Importing strategyService directly.
                const { getStrategies } = await import('../services/strategyService');
                const all = await getStrategies();
                setCustomIndicators(all); // Pass all scripts (Strategies + Indicators)
            } catch (e) {
                console.error('Failed to load indicators', e);
                addChartError(
                    toChartErrorFromString('Failed to load indicators/strategies', 'Indicators')
                );
            }
        };
        loadIndicators();
    }, [autoAddScriptId]);

    const toggleFavoriteTimeframe = (tf: string) => {
        setFavoriteTimeframes((prev) =>
            prev.includes(tf) ? prev.filter((t) => t !== tf) : [...prev, tf]
        );
    };

    const handleAddCustomTimeframe = (tf: string) => {
        // Regex for number followed by m, H, D, W, M
        if (!/^\d+[mHDWM]$/.test(tf)) {
            alert(
                "Invalid timeframe format. Use a number followed by m, H, D, W, or M (e.g., '10m', '6H', '3D')."
            );
            return;
        }

        // Add to all timeframes if not present, and sort
        if (!allTimeframes.includes(tf)) {
            const getTimeframeValue = (t: string) => {
                const num = parseInt(t.slice(0, -1));
                const unit = t.slice(-1);
                switch (unit) {
                    case 'm':
                        return num;
                    case 'H':
                        return num * 60;
                    case 'D':
                        return num * 1440;
                    case 'W':
                        return num * 10080;
                    case 'M':
                        return num * 43200;
                    default:
                        return 0;
                }
            };
            setAllTimeframes((prev) =>
                [...prev, tf].sort((a, b) => getTimeframeValue(a) - getTimeframeValue(b))
            );
        }
        // Add to favorites if not present
        if (!favoriteTimeframes.includes(tf)) {
            setFavoriteTimeframes((prev) => [...prev, tf]);
        }
        // Set as active
        setChartData([]);
        setActiveTimeframe(tf);
    };

    // Data loading and WebSocket subscription
    useEffect(() => {
        if (!symbol || !activeTimeframe) return;

        let isMounted = true;
        const currentSymbol = symbol;
        const currentTimeframe = activeTimeframe;

        // Start Alert Engine
        if (user) {
            alertEngine.start();
        }

        const subscribeToRealtime = (initialData: Candle[]) => {
            // 2. Connect WebSocket (Service handles cleanup of previous connection automatically)
            marketRealtimeService.connect(currentSymbol, currentTimeframe, (tick) => {
                setChartData((prevData) => {
                    if (prevData.length === 0) {
                        // If we have no data yet (rare), just start with tick
                        return [tick];
                    }
                    const lastCandle = prevData[prevData.length - 1];

                    if (tick.time === lastCandle.time) {
                        // Update last candle
                        const newData = [...prevData];
                        newData[newData.length - 1] = tick;
                        return newData;
                    } else if (tick.time > lastCandle.time) {
                        // Append new candle
                        return [...prevData, tick];
                    }
                    return prevData;
                });
            });
        };

        const loadDataAndSubscribe = async () => {
            // Don't set isLoading(true) here to avoid blocking UI - we want instant switch
            // Only set if we really have NO data and NO cache (handled inside)

            try {
                // 1. Fetch Data with Stale-While-Revalidate
                // access instant cache or network
                const result = await getCandlesWithCache(
                    currentSymbol,
                    currentTimeframe,
                    10000,
                    (freshData) => {
                        // Background update callback
                        if (
                            isMounted &&
                            currentSymbol === symbol &&
                            currentTimeframe === activeTimeframe
                        ) {
                            console.log(
                                `[Market] Background refresh update: ${freshData.length} candles`
                            );
                            setChartData(freshData);
                            // Initial data loaded, now we ensure realtime is synced
                        }
                    }
                );

                if (isMounted && currentSymbol === symbol && currentTimeframe === activeTimeframe) {
                    setChartData(result.data);

                    // If we have data (cached or fresh), close the loader if it was open
                    // Note: We might want to keep a small "syncing" indicator but for now removing blocking loader
                    setIsLoading(false);

                    subscribeToRealtime(result.data);
                }
            } catch (error) {
                console.error('Failed to fetch chart data:', error);
                if (isMounted) {
                    addChartError(
                        toChartErrorFromString('Failed to fetch chart data', 'Chart Data')
                    );
                    setChartData([]);
                    setIsLoading(false);
                }
            }
        };

        loadDataAndSubscribe();

        // Cleanup: Disconnect when unmounting or switching symbol
        return () => {
            isMounted = false;
            marketRealtimeService.disconnect();
            alertEngine.stop();
        };
    }, [symbol, activeTimeframe, user]); // Added user dependency to restart engine if auth changes

    useEffect(() => {
        // Preload common symbols
        preloadCommonSymbols(getCandles);
    }, []);

    const handleSymbolChange = (s: string) => {
        setChartData([]);
        setSymbol(s);
    };

    const handleTimeframeChange = (tf: string) => {
        setChartData([]);
        setActiveTimeframe(tf);
    };

    return (
        <div className="h-full flex flex-col relative market-bg">
            {(isLoading || isAuthLoading || !symbol || !activeTimeframe) && (
                <div className="absolute inset-0 backdrop-blur-sm z-50 flex items-center justify-center market-loader-overlay">
                    <Loader />
                </div>
            )}
            {chartErrors.length > 0 && (
                <div className="flex flex-col gap-1 px-3 py-2 bg-[#1a1a2e] border-b border-red-900/30">
                    {chartErrors.map((err) => (
                        <div
                            key={err.id}
                            className={`flex items-center justify-between text-xs px-2 py-1 rounded ${
                                err.severity === 'error'
                                    ? 'bg-red-900/20 text-red-400'
                                    : 'bg-yellow-900/20 text-yellow-400'
                            }`}
                        >
                            <span>
                                <span className="font-medium">{err.source}:</span> {err.message}
                            </span>
                            {err.dismissible && (
                                <button
                                    type="button"
                                    onClick={() => dismissChartError(err.id)}
                                    className="ml-2 text-gray-500 hover:text-gray-300"
                                >
                                    ×
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
            {symbol && activeTimeframe && (
                <ChartErrorBoundary>
                    <CandlestickChart
                        data={chartData}
                        tools={chartTools}
                        symbol={symbol}
                        onSymbolChange={handleSymbolChange}
                        allTimeframes={allTimeframes}
                        favoriteTimeframes={favoriteTimeframes}
                        activeTimeframe={activeTimeframe}
                        onTimeframeChange={handleTimeframeChange}
                        onToggleFavorite={toggleFavoriteTimeframe}
                        onAddCustomTimeframe={handleAddCustomTimeframe}
                        onLogout={onLogout}
                        onToggleMobileSidebar={onToggleMobileSidebar}
                        customScripts={customIndicators}
                        autoAddScriptId={autoAddScriptId}
                        onAutoAddComplete={() => setAutoAddScriptId(null)}
                        initialSettings={initialChartSettings}
                        onSettingsChange={handleSettingsChange}
                        initialDrawings={initialDrawings}
                        onDrawingsChange={handleDrawingsChange}
                        onChartError={addChartError}
                        onClearErrors={clearChartErrors}
                    />
                </ChartErrorBoundary>
            )}
        </div>
    );
};

export default Market;
