// cspell:ignore Watchlist supabase Forex watchlist forex Supabase
import React, { useState, useMemo, useEffect, useCallback } from 'react';
// Fix: Use namespace import for react-router-dom to resolve module resolution issues.
import * as ReactRouterDOM from 'react-router-dom';
import SignalCard from '../components/SignalCard';
import SignalTable from '../components/SignalTable';
import ViewModeToggle from '../components/ViewModeToggle';
import { useSignalViewMode } from '../hooks/useSignalViewMode';
import { Signal, SignalStatus, Watchlist, Timeframe, TradeDirection } from '../types';
import { SignalIcon, CloseIcon, SearchIcon } from '../components/IconComponents';
import SignalChartModal from '../components/SignalChartModal';
import AssignStrategiesModal from '../components/AssignStrategiesModal';
import AddToWatchlistModal from '../components/AddToWatchlistModal';
import { db } from '../services/supabaseClient';
import * as api from '../api';
import { subscribeToTicker, unsubscribeFromTicker } from '../services/marketRealtimeService';
import Loader from '../components/Loader';
import { useAuth } from '../context/AuthContext';
import { computeStrategyStats, StrategyWinRate } from '../utils/strategyStats';

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


const Signals: React.FC = () => {
    const { user } = useAuth(); // Get auth user for Supabase sync
    const [signals, setSignals] = useState<Signal[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [isConnected, setIsConnected] = useState(false);

    // Full timeframe options from 1m to 1M
    const ALL_TIMEFRAMES = [
        '1m',
        '3m',
        '5m',
        '15m',
        '30m',
        '1H',
        '2H',
        '4H',
        '6H',
        '12H',
        '1D',
        '3D',
        '1W',
        '1M',
    ];

    const [strategyFilter, setStrategyFilter] = useState<string>('All');
    const [statusFilter, setStatusFilter] = useState<string>(SignalStatus.ACTIVE);
    const [directionFilter, setDirectionFilter] = useState<string>('All');
    const [marketTypeFilter, setMarketTypeFilter] = useState<string>('Crypto'); // Default to Crypto
    const [availableStrategies, setAvailableStrategies] = useState<string[]>([]); // Will be loaded from database
    const [timeframeFilter, setTimeframeFilter] = useState<string>('All');
    const [symbolSearch, setSymbolSearch] = useState<string>('');
    const [watchlistFilter, setWatchlistFilter] = useState<string>('All');
    // Sort + date range (Task 2 upgrades)
    type SortMode =
        | 'newest'
        | 'oldest'
        | 'pnl_desc'
        | 'pnl_asc'
        | 'profit_pct_desc'
        | 'profit_pct_asc';
    const [sortMode, setSortMode] = useState<SortMode>('newest');
    const [viewMode, setViewMode] = useSignalViewMode();
    type DateRange = 'all' | 'today' | '7d' | '30d' | 'custom';
    const [dateRange, setDateRange] = useState<DateRange>('all');
    const [customDateStart, setCustomDateStart] = useState<string>(''); // yyyy-mm-dd
    const [customDateEnd, setCustomDateEnd] = useState<string>('');
    const [showAssignModal, setShowAssignModal] = useState(false);

    const [openChartSignal, setOpenChartSignal] = useState<Signal | null>(null);
    const [addToWatchlistPair, setAddToWatchlistPair] = useState<string | null>(null);
    const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
    const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});

    const navigate = ReactRouterDOM.useNavigate();

    const fetchData = useCallback(async (isBackground = false) => {
        try {
            if (!isBackground) setIsLoading(true);
            const [signalsData, watchlistsData] = await Promise.all([
                api.getSignals(),
                api.getWatchlists(),
            ]);
            setSignals(signalsData);
            setWatchlists(watchlistsData);
            setError(null);
        } catch (err) {
            setError('Failed to load data. Please try again later.');
            console.error(err);
        } finally {
            if (!isBackground) setIsLoading(false);
        }
    }, []);

    // WebSocket subscription for live prices
    useEffect(() => {
        const activePairs = new Set<string>();
        signals.forEach((s) => {
            // Monitor price for Active and Pending signals
            if (s.status === SignalStatus.ACTIVE || s.status === SignalStatus.PENDING) {
                activePairs.add(s.pair);
            }
        });

        const subscriptions: { pair: string; cb: (data: any) => void }[] = [];

        activePairs.forEach((pair) => {
            const cb = (data: { price: number }) => {
                setCurrentPrices((prev) => {
                    // Avoid unnecessary re-renders if price hasn't changed
                    if (prev[pair] === data.price) return prev;
                    return { ...prev, [pair]: data.price };
                });
            };
            subscribeToTicker(pair, cb);
            subscriptions.push({ pair, cb });
        });

        return () => {
            subscriptions.forEach((s) => unsubscribeFromTicker(s.pair, s.cb));
        };
    }, [signals]);

    // Supabase Realtime subscription for instant signal updates
    // The backend now generates signals, frontend just listens
    // Supabase Realtime subscription for instant signal updates.
    // Listens to the `signals` table (immutable event rows written by the Signal Engine).
    // Debounces bursts of INSERTs into a single refetch. Reconnects on disconnect.
    useEffect(() => {
        if (!user?.id) return;

        console.log('[Signals] Setting up Supabase Realtime subscription...');

        let insertDebounce: ReturnType<typeof setTimeout> | null = null;
        const scheduleRefetch = () => {
            if (insertDebounce) return; // coalesce bursts
            insertDebounce = setTimeout(() => {
                insertDebounce = null;
                fetchData(true);
            }, 500);
        };

        let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
        let channel: ReturnType<ReturnType<typeof db>['channel']> | null = null;

        const connect = () => {
            channel = db()
                .channel(`signals-realtime`)
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'signals',
                    },
                    () => {
                        scheduleRefetch();
                    }
                )
                .subscribe((status) => {
                    const isSubscribed = status === 'SUBSCRIBED';
                    setIsConnected(isSubscribed);
                    console.log(`[Signals] Realtime status: ${status}`);

                    if (
                        status === 'CLOSED' ||
                        status === 'CHANNEL_ERROR' ||
                        status === 'TIMED_OUT'
                    ) {
                        if (reconnectTimer) return;
                        reconnectTimer = setTimeout(() => {
                            reconnectTimer = null;
                            console.log('[Signals] Reconnecting Realtime...');
                            if (channel) db().removeChannel(channel);
                            connect();
                        }, 3000);
                    }
                });
        };
        connect();

        return () => {
            console.log('[Signals] Cleaning up realtime subscription');
            if (insertDebounce) clearTimeout(insertDebounce);
            if (reconnectTimer) clearTimeout(reconnectTimer);
            if (channel) db().removeChannel(channel);
            setIsConnected(false);
        };
    }, [user?.id, fetchData]);

    // Auto-refresh signals data periodically (independent of generation)
    useEffect(() => {
        const interval = setInterval(() => {
            fetchData(true); // Background refresh
        }, 300000); // 5 minutes — Realtime pushes live changes; this is just a safety net

        return () => clearInterval(interval);
    }, [fetchData]);

    // Initial load
    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Load available strategies - Hybrid approach (Service + Actual Signals)
    useEffect(() => {
        const loadStrategies = async () => {
            let strategyNames: string[] = [];

            // 1. Try to load from Strategy Service (DB)
            try {
                const { getStrategies } = await import('../services/strategyService');
                const all = await getStrategies();
                const serviceStrategies = all
                    .filter(
                        (s: any) =>
                            s.type === 'STRATEGY' || s.type === 'INDICATOR' || s.type === 'KURI'
                    )
                    .map((s: any) => s.name);
                strategyNames = [...serviceStrategies];
            } catch (e) {
                console.warn('Failed to load defined strategies, falling back to signals', e);
            }

            // 2. Also extract from current visible signals (Handling orphan signals)
            if (signals.length > 0) {
                const fromSignals = signals.map((s) => s.strategy).filter(Boolean);
                strategyNames = [...strategyNames, ...fromSignals];
            }

            // 3. Deduplicate and Sort
            const uniqueStrategies = Array.from(new Set(strategyNames)).sort();

            // Only update if different to prevent loops and UI resets
            setAvailableStrategies((prev) => {
                const isSame =
                    prev.length === uniqueStrategies.length &&
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
            setSignals((prev) =>
                prev.map((s) => (s.id === signal.id ? { ...s, isPinned: newPinStatus } : s))
            );
            await api.toggleSignalPin(signal.id, newPinStatus);
        } catch (err) {
            console.error('Failed to toggle pin:', err);
            // Revert on error
            setSignals((prev) =>
                prev.map((s) => (s.id === signal.id ? { ...s, isPinned: !signal.isPinned } : s))
            );
        }
    };

    const filteredSignals = useMemo(() => {
        // Compute the date range window in epoch ms
        const now = Date.now();
        const DAY_MS = 24 * 60 * 60 * 1000;
        let windowStart = 0;
        let windowEnd = Number.POSITIVE_INFINITY;
        if (dateRange === 'today') {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            windowStart = startOfDay.getTime();
        } else if (dateRange === '7d') {
            windowStart = now - 7 * DAY_MS;
        } else if (dateRange === '30d') {
            windowStart = now - 30 * DAY_MS;
        } else if (dateRange === 'custom') {
            if (customDateStart) windowStart = new Date(customDateStart + 'T00:00:00').getTime();
            if (customDateEnd) windowEnd = new Date(customDateEnd + 'T23:59:59').getTime();
        }

        // Profit% helper — (pnl / entry) * 100 when entry is known
        const profitPct = (s: Signal): number => {
            if (s.profitLoss == null || !s.entry) return 0;
            return (s.profitLoss / (s.entry || 1)) * 100;
        };

        return signals
            .filter((s) => s.status === statusFilter)
            .filter((s) => strategyFilter === 'All' || s.strategy === strategyFilter)
            .filter((s) => directionFilter === 'All' || s.direction === directionFilter)
            .filter((s) => {
                // Market type filter
                if (marketTypeFilter === 'All') return true;
                return getMarketType(s.pair) === marketTypeFilter;
            })
            .filter((s) => {
                // Watchlist filter
                if (watchlistFilter === 'All') return true;
                if ((s as any).watchlistId) return (s as any).watchlistId === watchlistFilter;
                const wl = watchlists.find((w) => w.id === watchlistFilter);
                if (!wl) return true;
                return wl.items.some((item) => item.symbol === s.pair);
            })
            .filter((s) => {
                // Timeframe filter - 'All' shows everything
                if (timeframeFilter === 'All') return true;
                return s.timeframe === timeframeFilter;
            })
            .filter((s) => {
                // Symbol search filter
                if (!symbolSearch.trim()) return true;
                return s.pair.toUpperCase().includes(symbolSearch.toUpperCase());
            })
            .filter((s) => {
                // Date range filter — applied to created_at / timestamp
                if (dateRange === 'all') return true;
                const t = new Date(s.timestamp).getTime();
                return t >= windowStart && t <= windowEnd;
            })
            .sort((a, b) => {
                // Pinned always comes first regardless of sort mode
                if (a.isPinned && !b.isPinned) return -1;
                if (!a.isPinned && b.isPinned) return 1;

                switch (sortMode) {
                    case 'oldest':
                        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
                    case 'pnl_desc':
                        return (b.profitLoss ?? 0) - (a.profitLoss ?? 0);
                    case 'pnl_asc':
                        return (a.profitLoss ?? 0) - (b.profitLoss ?? 0);
                    case 'profit_pct_desc':
                        return profitPct(b) - profitPct(a);
                    case 'profit_pct_asc':
                        return profitPct(a) - profitPct(b);
                    case 'newest':
                    default:
                        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
                }
            });
    }, [
        signals,
        statusFilter,
        strategyFilter,
        directionFilter,
        marketTypeFilter,
        timeframeFilter,
        symbolSearch,
        watchlistFilter,
        watchlists,
        sortMode,
        dateRange,
        customDateStart,
        customDateEnd,
    ]);

    // Strategy win-rate stats computed from ALL signals (not just filtered)
    const strategyStats = useMemo(() => computeStrategyStats(signals), [signals]);

    const addedToWatchlistPairs = useMemo(() => {
        const pairs = new Set<string>();
        watchlists.forEach((wl) => {
            wl.items.forEach((item) => pairs.add(item.symbol));
        });
        return pairs;
    }, [watchlists]);

    const handleShowChart = (signal: Signal) => {
        setOpenChartSignal(signal);
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
        return watchlists.filter((wl) => wl.accountType === requiredAccountType);
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
                        There are no signals matching your current filters. Try adjusting your
                        criteria.
                    </p>
                </div>
            );
        }

        if (viewMode === 'list') {
            return (
                <SignalTable
                    signals={filteredSignals}
                    currentPrices={currentPrices}
                    onShowChart={handleShowChart}
                    onExecute={() => {}}
                    strategyStats={strategyStats}
                />
            );
        }

        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredSignals.map((signal) => (
                    <SignalCard
                        key={signal.id}
                        signal={signal}
                        onShowChart={handleShowChart}
                        onExecute={() => {}}
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
            {/* Stats Summary Cards */}
            {(() => {
                const activeCount = filteredSignals.filter((s) => s.status === SignalStatus.ACTIVE).length;
                const todayCount = filteredSignals.filter(
                    (s) => new Date(s.timestamp).toDateString() === new Date().toDateString()
                ).length;
                const closedSignals = filteredSignals.filter((s) => s.status === SignalStatus.CLOSED);
                let wins = 0, losses = 0;
                closedSignals.forEach((s) => {
                    const pnl = (s as any).profitLoss ?? (s as any).profit_loss;
                    const reason = s.closeReason;
                    if (typeof pnl === 'number') { if (pnl > 0) wins++; else if (pnl < 0) losses++; }
                    else if (reason === 'TP') wins++;
                    else if (reason === 'SL') losses++;
                });
                const decided = wins + losses;
                const winRate = decided > 0 ? (wins / decided) * 100 : 0;

                return (
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-500/20 bg-blue-500/5">
                            <span className="text-[10px] uppercase tracking-wider text-blue-300/70 font-semibold">Active</span>
                            <span className="text-lg font-bold text-white">{activeCount}</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-green-500/20 bg-green-500/5">
                            <span className="text-[10px] uppercase tracking-wider text-green-300/70 font-semibold">Win Rate</span>
                            <span className={`text-lg font-bold ${winRate >= 50 ? 'text-green-400' : winRate > 0 ? 'text-red-400' : 'text-gray-400'}`}>
                                {winRate.toFixed(0)}%
                            </span>
                            <span className="text-[9px] text-gray-500 font-mono">{wins}W/{losses}L</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-purple-500/20 bg-purple-500/5">
                            <span className="text-[10px] uppercase tracking-wider text-purple-300/70 font-semibold">Today</span>
                            <span className="text-lg font-bold text-white">{todayCount}</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-500/20 bg-amber-500/5">
                            <span className="text-[10px] uppercase tracking-wider text-amber-300/70 font-semibold">Total</span>
                            <span className="text-lg font-bold text-white">{filteredSignals.length}</span>
                        </div>

                        <div className="flex-1" />

                        {/* Connection status */}
                        <div className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border ${isConnected ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
                            <span className="relative flex h-2 w-2">
                                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
                                <span className={`relative inline-flex rounded-full h-2 w-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                            </span>
                            <span className={`text-[10px] font-semibold ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
                                {isConnected ? 'Live' : 'Offline'}
                            </span>
                        </div>
                    </div>
                );
            })()}

            {/* Filters */}
            <div className="bg-card-bg rounded-xl border border-gray-700/50 overflow-hidden">
                {/* Row 1: Status · Direction · Timeframe pills + Assign + Search + View toggle */}
                <div className="px-4 py-3 flex flex-wrap items-center gap-3">
                    {/* Status pills */}
                    <div className="flex items-center gap-1 border-r border-gray-700 pr-3">
                        {Object.values(SignalStatus).map((status) => (
                            <button
                                key={status}
                                type="button"
                                onClick={() => setStatusFilter(status)}
                                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                                    statusFilter === status
                                        ? 'bg-blue-500 text-white'
                                        : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                                }`}
                            >
                                {status}
                            </button>
                        ))}
                    </div>

                    {/* Direction pills */}
                    <div className="flex items-center gap-1 border-r border-gray-700 pr-3">
                        {['All', ...Object.values(TradeDirection)].map((dir) => (
                            <button
                                key={dir}
                                type="button"
                                onClick={() => setDirectionFilter(dir)}
                                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                                    directionFilter === dir
                                        ? dir === 'BUY'
                                            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                            : dir === 'SELL'
                                              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                              : 'bg-blue-500 text-white'
                                        : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                                }`}
                            >
                                {dir}
                            </button>
                        ))}
                    </div>

                    {/* Timeframe pills */}
                    <div className="flex items-center gap-1 border-r border-gray-700 pr-3">
                        <button
                            type="button"
                            onClick={() => setTimeframeFilter('All')}
                            className={`px-2 py-1.5 rounded-md text-xs font-semibold transition-all ${
                                timeframeFilter === 'All'
                                    ? 'bg-blue-500 text-white'
                                    : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                            }`}
                        >
                            All
                        </button>
                        {['1m', '5m', '15m', '30m', '1H', '4H', '1D'].map((tf) => (
                            <button
                                key={tf}
                                type="button"
                                onClick={() => setTimeframeFilter(tf)}
                                className={`px-2 py-1.5 rounded-md text-xs font-semibold transition-all ${
                                    timeframeFilter === tf
                                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                        : 'text-gray-500 hover:text-white hover:bg-gray-700/50'
                                }`}
                            >
                                {tf}
                            </button>
                        ))}
                    </div>

                    {/* Date range pills */}
                    <div className="flex items-center gap-1 border-r border-gray-700 pr-3">
                        {([
                            { id: 'all', label: 'All' },
                            { id: 'today', label: 'Today' },
                            { id: '7d', label: '7d' },
                            { id: '30d', label: '30d' },
                            { id: 'custom', label: 'Custom' },
                        ] as const).map((r) => (
                            <button
                                type="button"
                                key={r.id}
                                onClick={() => setDateRange(r.id)}
                                className={`px-2 py-1.5 rounded-md text-xs font-semibold transition-all ${
                                    dateRange === r.id
                                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                        : 'text-gray-500 hover:text-white hover:bg-gray-700/50'
                                }`}
                            >
                                {r.label}
                            </button>
                        ))}
                    </div>

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Assign Strategies */}
                    <button
                        type="button"
                        onClick={() => {
                            if (watchlists.length === 0) {
                                alert('Create a watchlist first before assigning strategies.');
                                return;
                            }
                            setShowAssignModal(true);
                        }}
                        disabled={watchlists.length === 0}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
                            watchlists.length === 0
                                ? 'text-gray-500 cursor-not-allowed'
                                : 'bg-purple-500/15 text-purple-400 border border-purple-500/30 hover:bg-purple-500/25'
                        }`}
                    >
                        Assign Strategies
                    </button>
                </div>

                {/* Row 2: Dropdowns + Search + Sort + View toggle */}
                <div className="px-4 py-2 border-t border-gray-700/50 flex flex-wrap items-center gap-3">
                    {/* Strategy dropdown */}
                    <select
                        title="Strategy"
                        aria-label="Strategy"
                        value={strategyFilter}
                        onChange={(e) => setStrategyFilter(e.target.value)}
                        className="bg-gray-800/50 border border-gray-700 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                        <option value="All">All Strategies</option>
                        {availableStrategies.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                        ))}
                    </select>

                    {/* Market dropdown */}
                    <select
                        title="Market"
                        aria-label="Market"
                        value={marketTypeFilter}
                        onChange={(e) => setMarketTypeFilter(e.target.value)}
                        className="bg-gray-800/50 border border-gray-700 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                        <option value="All">All Markets</option>
                        <option value="Crypto">Crypto</option>
                    </select>

                    {/* Sort dropdown */}
                    <select
                        id="signal-sort"
                        title="Sort"
                        aria-label="Sort"
                        value={sortMode}
                        onChange={(e) => setSortMode(e.target.value as typeof sortMode)}
                        className="bg-gray-800/50 border border-gray-700 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                        <option value="newest">Newest first</option>
                        <option value="oldest">Oldest first</option>
                        <option value="pnl_desc">P&L high → low</option>
                        <option value="pnl_asc">P&L low → high</option>
                    </select>

                    {/* Symbol search */}
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search symbol..."
                            value={symbolSearch}
                            onChange={(e) => setSymbolSearch(e.target.value)}
                            className="bg-gray-800/50 border border-gray-700 rounded-md pl-7 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-40"
                        />
                        <SearchIcon className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                        {symbolSearch && (
                            <button
                                type="button"
                                onClick={() => setSymbolSearch('')}
                                title="Clear search"
                                aria-label="Clear search"
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                            >
                                <CloseIcon className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Custom date pickers */}
                    {dateRange === 'custom' && (
                        <>
                            <input
                                type="date"
                                title="From date"
                                aria-label="From date"
                                value={customDateStart}
                                onChange={(e) => setCustomDateStart(e.target.value)}
                                className="bg-gray-800/50 border border-gray-700 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <input
                                type="date"
                                title="To date"
                                aria-label="To date"
                                value={customDateEnd}
                                onChange={(e) => setCustomDateEnd(e.target.value)}
                                className="bg-gray-800/50 border border-gray-700 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                        </>
                    )}

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* View mode toggle */}
                    <ViewModeToggle mode={viewMode} onChange={setViewMode} />
                </div>
            </div>

            {renderContent()}

            {/* Full Chart Modal */}
            {openChartSignal && (
                <SignalChartModal
                    signal={openChartSignal}
                    onClose={() => setOpenChartSignal(null)}
                />
            )}

            {/* Add to Watchlist Modal */}
            {addToWatchlistPair && (
                <AddToWatchlistModal
                    pair={addToWatchlistPair}
                    watchlists={applicableWatchlists}
                    existingWatchlistIds={Array.from(addedToWatchlistPairs)}
                    onClose={() => setAddToWatchlistPair(null)}
                    onSelectWatchlist={handleAddToWatchlist}
                    onCreateWatchlist={() => navigate('/watchlist')}
                />
            )}

            {/* Assign Strategies Modal — writes directly to watchlist_strategies via its own CRUD */}
            {showAssignModal && watchlists.length > 0 && (
                <AssignStrategiesModal
                    watchlists={watchlists}
                    onClose={() => setShowAssignModal(false)}
                />
            )}
        </div>
    );
};

export default Signals;
