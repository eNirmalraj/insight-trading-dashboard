


import React, { useState, useMemo, useEffect, useCallback } from 'react';
// Fix: Use namespace import for react-router-dom to resolve module resolution issues.
import * as ReactRouterDOM from 'react-router-dom';
import SignalCard from '../components/SignalCard';
import { Signal, SignalStatus, Watchlist, Position, Timeframe, TradeDirection } from '../types';
import { Candle } from '../components/market-chart/types';
import { SignalIcon, CloseIcon, SearchIcon } from '../components/IconComponents';
import MiniChart from '../components/MiniChart';
import { calculateEMA, calculateRSI } from '../components/market-chart/helpers';
import ExecuteTradeModal from '../components/ExecuteTradeModal';
import AddToWatchlistModal from '../components/AddToWatchlistModal';
import { createPaperTrade } from '../services/paperTradingService';
import { supabase } from '../services/supabaseClient';
import * as api from '../api';
import { subscribeToTicker, unsubscribeFromTicker } from '../services/marketRealtimeService';
import Loader from '../components/Loader';
import { startSignalEngine, stopSignalEngine, getEngineStatus, triggerSignalGeneration } from '../engine/signalEngine';
import { getSignalStatistics } from '../services/signalService';
import { getStoredEngineStatus, setStoredEngineStatus } from '../services/signalEngineService';
import { saveFavoriteTimeframesToDB } from '../services/settingsService';
import { useAuth } from '../context/AuthContext';

// Market type detection helpers
const getMarketType = (symbol: string): 'Crypto' | 'Forex' | 'Indian' | 'Unknown' => {
    const upperSymbol = symbol.toUpperCase();

    // Crypto: Only USDT quote currency (Spot or Futures)
    if (upperSymbol.endsWith('USDT') || upperSymbol.endsWith('USDT.P')) {
        return 'Crypto';
    }

    // Forex: Traditional forex pairs
    const forexPairs = ['EUR', 'GBP', 'USD', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'];
    const baseCurrency = upperSymbol.slice(0, 3);
    const quoteCurrency = upperSymbol.slice(3, 6);
    if (forexPairs.includes(baseCurrency) && forexPairs.includes(quoteCurrency)) {
        return 'Forex';
    }

    // Indian: NSE/BSE stocks (to be implemented)
    // Will check for .NS or .BO suffix or known Indian stock symbols

    return 'Unknown';
};

const isCryptoSymbol = (symbol: string): boolean => {
    return getMarketType(symbol) === 'Crypto';
};

const FilterSelect: React.FC<{ label: string, value: string, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void, options: string[] }> = ({ label, value, onChange, options }) => (
    <div>
        <label className="block text-xs text-gray-400 mb-1">{label}</label>
        <select value={value} onChange={onChange} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="All">All</option>
            {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
    </div>
);

const Signals: React.FC = () => {
    const { user } = useAuth(); // Get auth user for Supabase sync
    const [signals, setSignals] = useState<Signal[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isGeneratingSignals, setIsGeneratingSignals] = useState(false);

    // Signal Engine state
    // Signal Engine state - Always enabled as requested
    const [engineEnabled, setEngineEnabled] = useState(true);
    const [isConnected, setIsConnected] = useState(false);
    // const [engineStatus, setEngineStatus] = useState(getEngineStatus());
    const [signalStats, setSignalStats] = useState<any>(null);

    // Full timeframe options from 1m to 1M
    const ALL_TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1H', '2H', '4H', '6H', '12H', '1D', '3D', '1W', '1M'];

    // Favorite timeframes for Signal Engine
    const [favoriteTimeframes, setFavoriteTimeframes] = useState<string[]>(() => {
        const stored = localStorage.getItem('favoriteTimeframes');
        return stored ? JSON.parse(stored) : ['1H', '4H'];
    });

    const [strategyFilter, setStrategyFilter] = useState<string>('All');
    const [statusFilter, setStatusFilter] = useState<string>('All');
    const [directionFilter, setDirectionFilter] = useState<string>('All');
    const [marketTypeFilter, setMarketTypeFilter] = useState<string>('Crypto'); // Default to Crypto
    const [availableStrategies, setAvailableStrategies] = useState<string[]>([]); // Will be loaded from database
    const [timeframeFilter, setTimeframeFilter] = useState<string>('All');
    const [symbolSearch, setSymbolSearch] = useState<string>('');
    const [showTimeframeDropdown, setShowTimeframeDropdown] = useState<boolean>(false);

    const [executingSignal, setExecutingSignal] = useState<Signal | null>(null);
    const [chartModalData, setChartModalData] = useState<{
        chartData: Candle[];
        pair: string;
        entry: number;
        stopLoss: number;
        takeProfit: number;
        indicatorData?: any;
    } | null>(null);
    const [addToWatchlistPair, setAddToWatchlistPair] = useState<string | null>(null);
    const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
    const [positions, setPositions] = useState<Position[]>([]);
    const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});

    const navigate = ReactRouterDOM.useNavigate();

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('[data-timeframe-dropdown]')) {
                setShowTimeframeDropdown(false);
            }
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    const fetchData = useCallback(async (isBackground = false) => {
        try {
            if (!isBackground) setIsLoading(true);
            const [signalsData, watchlistsData, positionsData] = await Promise.all([
                api.getSignals(),
                api.getWatchlists(),
                api.getPositions(),
            ]);
            setSignals(signalsData);
            setWatchlists(watchlistsData);
            setPositions(positionsData);
            setError(null);
        } catch (err) {
            setError("Failed to load data. Please try again later.");
            console.error(err);
        } finally {
            if (!isBackground) setIsLoading(false);
        }
    }, []);

    // WebSocket subscription for live prices
    useEffect(() => {
        const activePairs = new Set<string>();
        signals.forEach(s => {
            // Monitor price for Active and Pending signals
            if (s.status === SignalStatus.ACTIVE || s.status === SignalStatus.PENDING) {
                activePairs.add(s.pair);
            }
        });

        const subscriptions: { pair: string, cb: (data: any) => void }[] = [];

        activePairs.forEach(pair => {
            const cb = (data: { price: number }) => {
                setCurrentPrices(prev => {
                    // Avoid unnecessary re-renders if price hasn't changed
                    if (prev[pair] === data.price) return prev;
                    return { ...prev, [pair]: data.price };
                });
            };
            subscribeToTicker(pair, cb);
            subscriptions.push({ pair, cb });
        });

        return () => {
            subscriptions.forEach(s => unsubscribeFromTicker(s.pair, s.cb));
        };
    }, [signals]);

    // Supabase Realtime subscription for instant signal updates
    // The backend now generates signals, frontend just listens
    // Supabase Realtime subscription for instant signal updates
    useEffect(() => {
        if (!supabase) return;

        console.log('[Signals] 🔌 Setting up Supabase Realtime subscription...');

        const channel = supabase
            .channel('signals-realtime')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'signals'
                },
                (payload) => {
                    console.log('[Signals] ⚡ Signal update received:', payload);

                    if (payload.eventType === 'INSERT') {
                        const newRow = payload.new;
                        setSignals(prev => {
                            // 1. Duplicate Check: Ensure ID doesn't already exist
                            if (prev.some(s => s.id === newRow.id)) {
                                console.warn('[Signals] Duplicate signal ignored:', newRow.id);
                                return prev;
                            }

                            // 2. Map Payload to Signal Type
                            const newSignal: Signal = {
                                id: newRow.id,
                                pair: newRow.symbol,
                                strategy: newRow.strategy,
                                strategyCategory: newRow.strategy_category,
                                strategyId: newRow.strategy_id,
                                direction: newRow.direction,
                                entry: newRow.entry_price,
                                entryType: newRow.entry_type,
                                stopLoss: newRow.stop_loss,
                                takeProfit: newRow.take_profit,
                                status: newRow.status,
                                timestamp: newRow.created_at,
                                timeframe: newRow.timeframe,
                                isPinned: newRow.is_pinned || false,
                                activatedAt: newRow.activated_at,
                                closedAt: newRow.closed_at
                            };

                            // 3. Prepend to list (maintaining sort mostly, but new is usually top)
                            return [newSignal, ...prev];
                        });
                    } else if (payload.eventType === 'UPDATE') {
                        const updatedRow = payload.new;
                        setSignals(prev => prev.map(s =>
                            s.id === updatedRow.id ? {
                                ...s,
                                status: updatedRow.status,
                                // Only update fields that might change live
                                isPinned: updatedRow.is_pinned !== undefined ? updatedRow.is_pinned : s.isPinned,
                                profitLoss: updatedRow.profit_loss,
                                closeReason: updatedRow.close_reason,
                                activatedAt: updatedRow.activated_at,
                                closedAt: updatedRow.closed_at
                            } : s
                        ));
                    }
                    // Refresh stats instantly on any change
                    refreshSignalStats();
                }
            )
            .subscribe((status) => {
                const isSubscribed = status === 'SUBSCRIBED';
                setIsConnected(isSubscribed);
                console.log(`[Signals] Realtime status: ${status}`);
            });

        return () => {
            console.log('[Signals] Cleaning up realtime subscription');
            supabase.removeChannel(channel);
            setIsConnected(false);
        };
    }, []);

    // Engine control functions - now just controls local state display
    const handleToggleEngine = useCallback(() => {
        const newState = !engineEnabled;
        setEngineEnabled(newState);
        setStoredEngineStatus(newState);
        // Note: Actual engine runs on backend, this is just UI state
    }, [engineEnabled]);

    const refreshSignalStats = useCallback(async () => {
        try {
            const stats = await getSignalStatistics();
            setSignalStats(stats);
        } catch (err) {
            console.error('Error fetching signal statistics:', err);
        }
    }, []);

    // Auto-refresh signals data periodically (independent of generation)
    useEffect(() => {
        const interval = setInterval(() => {
            fetchData(true); // Background refresh
            refreshSignalStats();
        }, 60000); // 60 seconds (Relaxed due to realtime)

        return () => clearInterval(interval);
    }, [fetchData, refreshSignalStats]);

    // Initial load
    useEffect(() => {
        fetchData();
        refreshSignalStats();
    }, [fetchData, refreshSignalStats]);

    // Manage Signal Engine Lifecycle
    useEffect(() => {
        if (engineEnabled) {
            startSignalEngine();
        } else {
            stopSignalEngine();
        }

        return () => {
            stopSignalEngine();
        };
    }, [engineEnabled]);


    // Load available strategies - Hybrid approach (Service + Actual Signals)
    useEffect(() => {
        const loadStrategies = async () => {
            let strategyNames: string[] = [];

            // 1. Try to load from Strategy Service (DB)
            try {
                const { getStrategies } = await import('../services/strategyService');
                const all = await getStrategies();
                const serviceStrategies = all
                    .filter((s: any) => s.type === 'STRATEGY')
                    .map((s: any) => s.name);
                strategyNames = [...serviceStrategies];
            } catch (e) {
                console.warn("Failed to load defined strategies, falling back to signals", e);
            }

            // 2. Also extract from current visible signals (Handling orphan signals)
            if (signals.length > 0) {
                const fromSignals = signals.map(s => s.strategy).filter(Boolean);
                strategyNames = [...strategyNames, ...fromSignals];
            }

            // 3. Deduplicate and Sort
            const uniqueStrategies = Array.from(new Set(strategyNames)).sort();

            // Only update if different to prevent loops and UI resets
            setAvailableStrategies(prev => {
                const isSame = prev.length === uniqueStrategies.length &&
                    prev.every((val, index) => val === uniqueStrategies[index]);
                return isSame ? prev : uniqueStrategies;
            });
        };

        loadStrategies();
    }, [signals]); // Runs when signals populate or update

    const handleTogglePin = async (signal: Signal) => {
        try {
            const newPinStatus = !signal.isPinned;
            // Optimistic update
            setSignals(prev => prev.map(s => s.id === signal.id ? { ...s, isPinned: newPinStatus } : s));
            await api.toggleSignalPin(signal.id, newPinStatus);
        } catch (err) {
            console.error('Failed to toggle pin:', err);
            // Revert on error
            setSignals(prev => prev.map(s => s.id === signal.id ? { ...s, isPinned: !signal.isPinned } : s));
        }
    };

    const filteredSignals = useMemo(() => {
        return signals
            .filter(s => statusFilter === 'All' || s.status === statusFilter)
            .filter(s => strategyFilter === 'All' || s.strategy === strategyFilter)
            .filter(s => directionFilter === 'All' || s.direction === directionFilter)
            .filter(s => {
                // Market type filter
                if (marketTypeFilter === 'All') return true;
                return getMarketType(s.pair) === marketTypeFilter;
            })
            .filter(s => {
                // Timeframe filter - 'All' shows all favorite timeframes
                if (timeframeFilter === 'All') {
                    return favoriteTimeframes.includes(s.timeframe);
                }
                return s.timeframe === timeframeFilter;
            })
            .filter(s => {
                // Symbol search filter
                if (!symbolSearch.trim()) return true;
                return s.pair.toUpperCase().includes(symbolSearch.toUpperCase());
            })
            .sort((a, b) => {
                // Sort by Pinned First
                if (a.isPinned && !b.isPinned) return -1;
                if (!a.isPinned && b.isPinned) return 1;
                // Then Sort by Time
                return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
            });
    }, [signals, statusFilter, strategyFilter, directionFilter, marketTypeFilter, timeframeFilter, symbolSearch, favoriteTimeframes]);

    const addedToWatchlistPairs = useMemo(() => {
        const pairs = new Set<string>();
        watchlists.forEach(wl => {
            wl.items.forEach(item => pairs.add(item.symbol));
        });
        return pairs;
    }, [watchlists]);

    const handleShowChart = (signal: Signal) => {
        if (!signal.chartData) return;

        let indicatorData: any = undefined;
        if (signal.strategy === 'RSI Divergence') {
            indicatorData = { type: 'RSI', data: { rsi: calculateRSI(signal.chartData, 14).main } };
        } else if (signal.strategy === 'MA Crossover') {
            indicatorData = {
                type: 'MA_CROSSOVER', data: {
                    fastMA: calculateEMA(signal.chartData.map(c => c.close), 9),
                    slowMA: calculateEMA(signal.chartData.map(c => c.close), 21),
                }
            };
        }

        setChartModalData({
            chartData: signal.chartData,
            pair: signal.pair,
            entry: signal.entry,
            stopLoss: signal.stopLoss,
            takeProfit: signal.takeProfit,
            indicatorData: indicatorData
        });
    };

    const handleExecuteTrade = async (newPosition: Position) => {
        if (!executingSignal || !user?.id) return;

        try {
            console.log("Executing paper trade for signal:", executingSignal.id, "User:", user.id);

            // 1. Call Service to persist in DB
            const tradeId = await createPaperTrade(
                executingSignal,
                user.id,
                {
                    stopLoss: newPosition.stopLoss,
                    takeProfit: newPosition.takeProfit
                },
                newPosition.quantity,
                newPosition.leverage || 1
            );

            if (!tradeId) {
                console.error("Failed to create paper trade in DB.");
                alert("Execution Failed: Could not save trade to paper trading account.");
                return;
            }

            // 2. Update local state
            setPositions(prev => [{ ...newPosition, id: tradeId }, ...prev]);

            // 3. Update the signal status locally
            setSignals(prev => prev.map(s => s.id === executingSignal.id ? { ...s, status: SignalStatus.ACTIVE } : s));

            alert(`Trade for ${newPosition.symbol} executed successfully! Trade ID: ${tradeId}`);
            setExecutingSignal(null);
        } catch (err: any) {
            console.error('Error executing manual trade:', err);
            alert(`Execution Error: ${err.message || 'Unknown error'}`);
        }
    };

    const handleAddToWatchlist = async (watchlistId: string) => {
        if (!addToWatchlistPair) return;
        try {
            await api.addSymbolToWatchlist(watchlistId, addToWatchlistPair);
            const updatedWatchlists = await api.getWatchlists();
            setWatchlists(updatedWatchlists);
            setAddToWatchlistPair(null);
        } catch (err: any) {
            alert(`Error: ${err.message || 'Could not add to watchlist'}`);
        }
    };



    const applicableWatchlists = useMemo(() => {
        if (!addToWatchlistPair) return [];
        const isCrypto = isCryptoSymbol(addToWatchlistPair);
        const requiredAccountType = isCrypto ? 'Crypto' : 'Forex';
        return watchlists.filter(wl => wl.accountType === requiredAccountType);
    }, [addToWatchlistPair, watchlists]);

    const renderContent = () => {
        if (isLoading) return <Loader />;
        if (error) return <div className="p-6 text-center text-red-400">{error}</div>;

        if (filteredSignals.length === 0) {
            return (
                <div className="text-center py-16 px-6 bg-card-bg rounded-xl border border-dashed border-gray-700 mt-6">
                    <SignalIcon className="w-12 h-12 mx-auto text-gray-600" />
                    <h3 className="mt-4 text-lg font-semibold text-white">No Signals Found</h3>
                    <p className="mt-2 text-sm text-gray-400">
                        There are no signals matching your current filters. Try adjusting your criteria.
                    </p>
                </div>
            );
        }

        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredSignals.map(signal => (
                    <SignalCard
                        key={signal.id}
                        signal={signal}
                        onShowChart={handleShowChart}
                        onExecute={setExecutingSignal}
                        onAddToWatchlist={setAddToWatchlistPair}
                        isAddedToWatchlist={addedToWatchlistPairs.has(signal.pair)}
                        currentPrice={currentPrices[signal.pair]}
                        onTogglePin={handleTogglePin}
                    />
                ))}
            </div>
        );
    };



    return (
        <div className="space-y-6 p-6">
            {/* Stats Summary Cards - Reactive to Filters */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-card-bg rounded-xl p-4 border border-gray-700">
                    <p className="text-xs text-gray-400 mb-1">Active Signals</p>
                    <p className="text-2xl font-bold text-white">{filteredSignals.filter(s => s.status === SignalStatus.ACTIVE).length}</p>
                </div>
                <div className="bg-card-bg rounded-xl p-4 border border-gray-700">
                    <p className="text-xs text-gray-400 mb-1">Win Rate</p>
                    <p className="text-2xl font-bold text-green-400">
                        {(() => {
                            const closedSignals = filteredSignals.filter(s => s.status === SignalStatus.CLOSED);
                            let wins = 0, losses = 0;
                            closedSignals.forEach(s => {
                                const pnl = (s as any).profit_loss ?? s.profitLoss;
                                const reason = (s as any).close_reason ?? s.closeReason;
                                if (typeof pnl === 'number') {
                                    if (pnl > 0) wins++;
                                    else if (pnl < 0) losses++;
                                } else if (reason === 'TP') wins++;
                                else if (reason === 'SL') losses++;
                            });
                            const total = wins + losses;
                            return total > 0 ? ((wins / total) * 100).toFixed(1) : '0';
                        })()}%
                    </p>
                </div>
                <div className="bg-card-bg rounded-xl p-4 border border-gray-700">
                    <p className="text-xs text-gray-400 mb-1">Today's Signals</p>
                    <p className="text-2xl font-bold text-white">
                        {filteredSignals.filter(s => new Date(s.timestamp).toDateString() === new Date().toDateString()).length}
                    </p>
                </div>
                <div className="bg-card-bg rounded-xl p-4 border border-gray-700">
                    <p className="text-xs text-gray-400 mb-1">Total Signals</p>
                    <p className="text-2xl font-bold text-white">{filteredSignals.length}</p>
                </div>
            </div>

            {/* Connection Status Banner */}
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border ${isConnected ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                <span className={`relative flex h-2.5 w-2.5`}>
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></span>
                    <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                </span>
                {isConnected ? 'Live Updates: Connected to Signal Engine' : 'Reconnecting to Live Stream...'}
            </div>

            {/* Generating Signals Banner */}
            {isGeneratingSignals && (
                <div className="bg-blue-600/20 border border-blue-500/50 rounded-lg p-3 flex items-center gap-3">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent"></div>
                    <span className="text-blue-300 text-sm">Generating signals from active strategies...</span>
                </div>
            )}

            {/* Quick Filter Pills */}
            <div className="bg-card-bg rounded-xl p-4 space-y-4">
                {/* Top Filter Row: Status & Direction */}
                <div className="flex flex-col md:flex-row gap-6">
                    {/* Status Filter */}
                    <div>
                        <label className="block text-xs text-gray-400 mb-2">Status</label>
                        <div className="flex flex-wrap gap-2">
                            {['All', ...Object.values(SignalStatus)].map(status => (
                                <button
                                    key={status}
                                    onClick={() => setStatusFilter(status)}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${statusFilter === status
                                        ? 'bg-blue-500 text-white shadow-lg'
                                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                        }`}
                                >
                                    {status}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Direction Filter (Moved up) */}
                    <div>
                        <label className="block text-xs text-gray-400 mb-2">Direction</label>
                        <div className="flex flex-wrap gap-2">
                            {['All', ...Object.values(TradeDirection)].map(direction => (
                                <button
                                    key={direction}
                                    onClick={() => setDirectionFilter(direction)}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${directionFilter === direction
                                        ? direction === 'BUY'
                                            ? 'bg-green-500 text-white shadow-lg'
                                            : direction === 'SELL'
                                                ? 'bg-red-500 text-white shadow-lg'
                                                : 'bg-blue-500 text-white shadow-lg'
                                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                        }`}
                                >
                                    {direction}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Signal Timeframe Selector - Controls what engine scans */}
                    <div>
                        <label className="block text-xs text-gray-400 mb-2">Signal Timeframe</label>
                        <div className="flex flex-wrap gap-1.5">
                            {['1m', '5m', '15m', '30m', '1H', '4H', '1D'].map(tf => (
                                <button
                                    key={tf}
                                    onClick={() => {
                                        const updated = favoriteTimeframes.includes(tf)
                                            ? favoriteTimeframes.filter(t => t !== tf)
                                            : [...favoriteTimeframes, tf];
                                        setFavoriteTimeframes(updated);
                                        localStorage.setItem('favoriteTimeframes', JSON.stringify(updated));
                                        if (user?.id) {
                                            saveFavoriteTimeframesToDB(user.id, updated);
                                        }
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1 ${favoriteTimeframes.includes(tf)
                                        ? 'bg-yellow-500 text-black shadow-md'
                                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                        }`}
                                    title={favoriteTimeframes.includes(tf) ? 'Click to remove from scan' : 'Click to add to scan'}
                                >
                                    <span className="text-xs">{favoriteTimeframes.includes(tf) ? '★' : '☆'}</span>
                                    {tf}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Combined Filter Row: Strategy, Market, Timeframe, Search */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                    <FilterSelect label="Strategy" value={strategyFilter} onChange={e => setStrategyFilter(e.target.value)} options={availableStrategies} />
                    <FilterSelect label="Market Type" value={marketTypeFilter} onChange={e => setMarketTypeFilter(e.target.value)} options={['Crypto']} />

                    {/* Timeframe Filter Dropdown - Simple filter for viewing */}
                    <div className="relative" data-timeframe-dropdown>
                        <label className="block text-xs text-gray-400 mb-1">Timeframe Filter</label>
                        <button
                            onClick={() => setShowTimeframeDropdown(!showTimeframeDropdown)}
                            className="w-full flex items-center justify-between bg-gray-800 border border-gray-700 rounded-lg p-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <span>{timeframeFilter === 'All' ? `All (${favoriteTimeframes.join(', ')})` : timeframeFilter}</span>
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {showTimeframeDropdown && (
                            <div className="absolute z-50 mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                                {/* All Favorites Option */}
                                <div
                                    onClick={() => {
                                        setTimeframeFilter('All');
                                        setShowTimeframeDropdown(false);
                                    }}
                                    className={`px-3 py-2 hover:bg-gray-700 cursor-pointer border-b border-gray-700 text-sm ${timeframeFilter === 'All' ? 'bg-blue-500/20 text-yellow-400' : 'text-gray-300'}`}
                                >
                                    ★ All ({favoriteTimeframes.join(', ')})
                                </div>

                                {ALL_TIMEFRAMES.map(tf => (
                                    <div
                                        key={tf}
                                        onClick={() => {
                                            setTimeframeFilter(tf);
                                            setShowTimeframeDropdown(false);
                                        }}
                                        className={`px-3 py-2 hover:bg-gray-700 cursor-pointer text-sm ${timeframeFilter === tf ? 'bg-blue-500/20 text-white' : 'text-gray-300'}`}
                                    >
                                        {favoriteTimeframes.includes(tf) ? `★ ${tf}` : tf}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Symbol Search */}
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Search Symbol</label>
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Search symbol..."
                                value={symbolSearch}
                                onChange={(e) => setSymbolSearch(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                            <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                            {symbolSearch && (
                                <button
                                    onClick={() => setSymbolSearch('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                                >
                                    <CloseIcon className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {renderContent()}

            {/* Chart Modal */}
            {
                chartModalData && (
                    <div className="fixed inset-0 bg-black/70 z-40 flex items-center justify-center p-4">
                        <div className="bg-gray-800 rounded-xl w-full max-w-4xl h-[600px] flex flex-col p-4 border border-gray-700">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-bold text-white">{chartModalData.pair} Signal Chart</h3>
                                <button onClick={() => setChartModalData(null)} className="p-1 rounded-full hover:bg-gray-700">
                                    <CloseIcon className="w-6 h-6 text-gray-400" />
                                </button>
                            </div>
                            <div className="flex-1 min-h-0">
                                <MiniChart
                                    data={chartModalData.chartData}
                                    entry={chartModalData.entry}
                                    stopLoss={chartModalData.stopLoss}
                                    takeProfit={chartModalData.takeProfit}
                                    indicatorData={chartModalData.indicatorData}
                                />
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Execute Trade Modal */}
            {
                executingSignal && (
                    <ExecuteTradeModal
                        signal={executingSignal}
                        onClose={() => setExecutingSignal(null)}
                        onExecute={handleExecuteTrade}
                    />
                )
            }

            {/* Add to Watchlist Modal */}
            {
                addToWatchlistPair && (
                    <AddToWatchlistModal
                        pair={addToWatchlistPair}
                        watchlists={applicableWatchlists}
                        existingWatchlistIds={Array.from(addedToWatchlistPairs)}
                        onClose={() => setAddToWatchlistPair(null)}
                        onSelectWatchlist={handleAddToWatchlist}
                        onCreateWatchlist={() => navigate('/watchlist')}
                    />
                )
            }

        </div >
    );
};

export default Signals;
