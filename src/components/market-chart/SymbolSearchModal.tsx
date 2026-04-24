import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useOutsideAlerter } from './hooks';
import {
    SearchIcon,
    CloseIcon,
    PlusCircleIcon,
    MarketIcon,
    CheckCircleIcon,
} from '../IconComponents';
import { fetchAllCryptoSymbols, SearchSymbol } from '../../services/marketDataService';
import { useFavorites } from '../../context/FavoritesContext';
import CoinAvatar from './CoinAvatar';
import { deriveTags } from './symbolSearchTags';

type SymbolTab = 'All' | 'Stocks' | 'Forex' | 'Crypto' | 'Indian' | 'Favorites';

interface SymbolSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSymbolSelect: (symbol: string) => void;
    title?: string;
    defaultTab?: string;
    allowedTabs?: string[];
    existingSymbols?: string[];
    marketType?: 'spot' | 'futures'; // NEW: Enforce market type
}

const SymbolSearchModal: React.FC<SymbolSearchModalProps> = ({
    isOpen,
    onClose,
    onSymbolSelect,
    title,
    defaultTab = 'All',
    allowedTabs,
    existingSymbols = [],
    marketType,
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<SymbolTab>(defaultTab as SymbolTab);

    // Initialize filter based on prop (capitalize first letter)
    const initialMarketFilter = marketType
        ? ((marketType.charAt(0).toUpperCase() + marketType.slice(1)) as 'Spot' | 'Futures')
        : 'All';

    const [marketFilter, setMarketFilter] = useState<'All' | 'Spot' | 'Futures'>(
        initialMarketFilter
    );
    const [rankFilter, setRankFilter] = useState<'All' | 'Top 10' | 'Top 50' | 'Top 100'>('All');
    const [cryptoSymbols, setCryptoSymbols] = useState<SearchSymbol[]>([]);
    const [displayLimit, setDisplayLimit] = useState(50);
    const [loading, setLoading] = useState(false);
    const [focusedIndex, setFocusedIndex] = useState<number>(-1);
    const [enterError, setEnterError] = useState<string | null>(null);
    const modalRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const resultsListRef = useRef<HTMLDivElement>(null);

    useOutsideAlerter(modalRef, () => {
        if (isOpen) onClose();
    });

    const { favorites, isFavorite, toggleFavorite } = useFavorites();

    // Ensure filter updates if prop changes
    useEffect(() => {
        if (marketType) {
            setMarketFilter(
                (marketType.charAt(0).toUpperCase() + marketType.slice(1)) as 'Spot' | 'Futures'
            );
        } else {
            setMarketFilter('All');
        }
    }, [marketType]);

    // Load symbols on mount
    useEffect(() => {
        if (isOpen && cryptoSymbols.length === 0) {
            setLoading(true);
            fetchAllCryptoSymbols().then((data) => {
                setCryptoSymbols(data);
                setLoading(false);
            });
        }
    }, [isOpen]);

    // Focus input on open
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 50);
            if (defaultTab) {
                setActiveTab(defaultTab as SymbolTab);
            }
        } else {
            setSearchTerm('');
        }
    }, [isOpen, defaultTab]);

    // Mock other categories
    const mockSymbols: Record<string, SearchSymbol[]> = {
        Forex: [
            {
                symbol: 'EUR/USD',
                description: 'Euro / U.S. Dollar',
                price: 1.0855,
                change: 0.003,
                changePercent: 0.28,
                volume: 0,
                type: 'Forex',
                exchange: 'FXCM',
                market: 'Spot',
            },
            {
                symbol: 'GBP/USD',
                description: 'British Pound / U.S. Dollar',
                price: 1.254,
                change: -0.0015,
                changePercent: -0.12,
                volume: 0,
                type: 'Forex',
                exchange: 'FXCM',
                market: 'Spot',
            },
            {
                symbol: 'USD/JPY',
                description: 'U.S. Dollar / Japanese Yen',
                price: 155.8,
                change: 0.5,
                changePercent: 0.32,
                volume: 0,
                type: 'Forex',
                exchange: 'FXCM',
                market: 'Spot',
            },
        ],
        Stocks: [],
        Futures: [],
        Indices: [],
    };

    const allTabs: SymbolTab[] = ['All', 'Stocks', 'Forex', 'Crypto', 'Indian', 'Favorites'];
    const tabs = allowedTabs ? allTabs.filter((tab) => allowedTabs.includes(tab)) : allTabs;

    const COMING_SOON_TABS: SymbolTab[] = ['Stocks', 'Forex', 'Indian'];
    const isComingSoonTab = (t: SymbolTab) => COMING_SOON_TABS.includes(t);

    const filteredSymbols = useMemo(() => {
        let source: SearchSymbol[] = [];

        if (activeTab === 'Favorites') {
            source = cryptoSymbols.filter((s) =>
                favorites.has(s.symbol.replace('/', ''))
            );
        } else if (isComingSoonTab(activeTab)) {
            source = [];
        } else if (activeTab === 'All' || activeTab === 'Crypto') {
            source = cryptoSymbols;
        }

        // Filter by Market (Spot/Futures)
        if (marketFilter !== 'All' && activeTab === 'Crypto') {
            source = source.filter((s) => s.market === marketFilter);
        }

        let result = source;

        // Apply Search Filter
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            result = result.filter(
                (s) =>
                    s.symbol.toLowerCase().replace('/', '').includes(lower) ||
                    s.description.toLowerCase().includes(lower)
            );
        }

        // 4. Rank Filter (Top X by Volume)
        if (rankFilter !== 'All') {
            result.sort((a, b) => (b.volume || 0) - (a.volume || 0));
            if (rankFilter === 'Top 10') result = result.slice(0, 10);
            else if (rankFilter === 'Top 50') result = result.slice(0, 50);
            else if (rankFilter === 'Top 100') result = result.slice(0, 100);
        }

        return result;
    }, [searchTerm, activeTab, cryptoSymbols, marketFilter, rankFilter, favorites]);

    // Reset limit when filters change
    useEffect(() => {
        setDisplayLimit(50);
        setFocusedIndex(-1);
        setEnterError(null);
    }, [searchTerm, activeTab, marketFilter, rankFilter]);

    const visibleSymbols = useMemo(() => {
        return filteredSymbols.slice(0, displayLimit);
    }, [filteredSymbols, displayLimit]);

    useEffect(() => {
        if (focusedIndex < 0 || !resultsListRef.current) return;
        const row = resultsListRef.current.querySelector<HTMLElement>(
            `[data-focused="true"]`
        );
        row?.scrollIntoView({ block: 'nearest' });
    }, [focusedIndex]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        if (scrollTop + clientHeight >= scrollHeight - 50) {
            if (displayLimit < filteredSymbols.length) {
                setDisplayLimit((prev) => Math.min(prev + 50, filteredSymbols.length));
            }
        }
    };

    const handleResizePointerDown = (e: React.PointerEvent) => {
        if (!modalRef.current) return;
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.closest('button'))
            return;

        e.preventDefault();
        const startX = e.clientX;
        const startY = e.clientY;
        const startRect = modalRef.current.getBoundingClientRect();

        modalRef.current.style.transform = 'none';
        modalRef.current.style.left = `${startRect.left}px`;
        modalRef.current.style.top = `${startRect.top}px`;

        let top = startRect.top;
        let left = startRect.left;

        const handlePointerMove = (moveEvent: PointerEvent) => {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;
            top = startRect.top + dy;
            left = startRect.left + dx;
            if (modalRef.current) {
                modalRef.current.style.top = `${top}px`;
                modalRef.current.style.left = `${left}px`;
            }
        };

        const handlePointerUp = () => {
            document.removeEventListener('pointermove', handlePointerMove);
            document.removeEventListener('pointerup', handlePointerUp);
        };

        document.addEventListener('pointermove', handlePointerMove);
        document.addEventListener('pointerup', handlePointerUp);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 pt-20 backdrop-blur-sm">
            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #374151;
                    border-radius: 3px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #4B5563;
                }
            `}</style>
            <div
                ref={modalRef}
                className="bg-gray-800/90 backdrop-blur-sm border border-gray-700 rounded-xl shadow-2xl w-full max-w-[800px] flex flex-col h-[600px] absolute overflow-hidden text-[#D1D4DC]"
                style={{ top: '15%', left: '50%', transform: 'translateX(-50%)' }}
                onPointerDown={(e) => e.stopPropagation()}
            >
                {/* Drag handle / title bar (ONLY drag surface) */}
                <div
                    className="flex items-center justify-between px-4 py-3 bg-black/40 border-b border-gray-700/50 cursor-move select-none"
                    onPointerDown={handleResizePointerDown}
                >
                    <div className="flex items-center gap-2">
                        <div className="flex gap-[3px]">
                            <div className="w-[3px] h-3 bg-gray-600 rounded-sm" />
                            <div className="w-[3px] h-3 bg-gray-600 rounded-sm" />
                        </div>
                        <h2 className="text-sm font-semibold text-white pl-1">
                            {title || 'Symbol Search'}
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onClose();
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="text-gray-400 hover:text-white transition-colors"
                        aria-label="Close"
                    >
                        <CloseIcon className="w-5 h-5" />
                    </button>
                </div>

                {/* Search input (NOT a drag surface) */}
                <div className="p-4 border-b border-gray-700/50">
                    <div className="relative group">
                        <SearchIcon className="w-5 h-5 absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="Symbol, ISIN, or CUSIP"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'ArrowDown') {
                                    e.preventDefault();
                                    setFocusedIndex((prev) => {
                                        if (visibleSymbols.length === 0) return -1;
                                        return (prev + 1) % visibleSymbols.length;
                                    });
                                } else if (e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    setFocusedIndex((prev) => {
                                        if (visibleSymbols.length === 0) return -1;
                                        return (prev - 1 + visibleSymbols.length) % visibleSymbols.length;
                                    });
                                } else if (e.key === 'Enter') {
                                    e.preventDefault();
                                    // Smart Enter: prefer focused row; fall back to exact match.
                                    if (focusedIndex >= 0 && focusedIndex < visibleSymbols.length) {
                                        const item = visibleSymbols[focusedIndex];
                                        const normalised = item.symbol.replace('/', '');
                                        if (!existingSymbols.includes(normalised)) {
                                            onSymbolSelect(normalised);
                                        }
                                    } else if (searchTerm) {
                                        const needle = searchTerm.toUpperCase().replace('/', '');
                                        const exact = visibleSymbols.find(
                                            (s) => s.symbol.replace('/', '').toUpperCase() === needle
                                        );
                                        if (exact) {
                                            const normalised = exact.symbol.replace('/', '');
                                            if (!existingSymbols.includes(normalised)) {
                                                onSymbolSelect(normalised);
                                            }
                                        } else {
                                            setEnterError(`No symbol matches "${searchTerm}"`);
                                        }
                                    }
                                } else if (e.key === 'Escape') {
                                    onClose();
                                }
                            }}
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-10 pr-12 py-3 text-base text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                        />
                        <div className="absolute top-1/2 right-3 -translate-y-1/2 flex items-center gap-1">
                            {searchTerm &&
                                (() => {
                                    const isAlreadyAdded = existingSymbols.includes(
                                        searchTerm.toUpperCase().replace('/', '')
                                    );
                                    return (
                                        <>
                                            <button
                                                onClick={() =>
                                                    !isAlreadyAdded &&
                                                    onSymbolSelect(
                                                        searchTerm.toUpperCase().replace('/', '')
                                                    )
                                                }
                                                className={`p-1.5 rounded transition-colors ${isAlreadyAdded ? 'text-green-500 cursor-default' : 'text-blue-500 hover:text-blue-400 hover:bg-blue-500/10'}`}
                                                title={
                                                    isAlreadyAdded
                                                        ? `${searchTerm} already added`
                                                        : `Add ${searchTerm}`
                                                }
                                                disabled={isAlreadyAdded}
                                            >
                                                {isAlreadyAdded ? (
                                                    <CheckCircleIcon className="w-5 h-5" />
                                                ) : (
                                                    <PlusCircleIcon className="w-5 h-5" />
                                                )}
                                            </button>
                                            <button
                                                onClick={() => setSearchTerm('')}
                                                className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-700 rounded transition-colors"
                                            >
                                                <CloseIcon className="w-4 h-4" />
                                            </button>
                                        </>
                                    );
                                })()}
                        </div>
                        {!searchTerm && (
                            <div className="absolute top-1/2 right-3 -translate-y-1/2 text-[10px] text-gray-600 border border-gray-700 rounded px-1.5 py-0.5 font-mono pointer-events-none">
                                ↑↓ ↵
                            </div>
                        )}
                    </div>
                    {enterError && (
                        <div className="mt-2 text-xs text-red-400 flex items-center gap-1.5">
                            <span>⚠</span>
                            <span>{enterError}</span>
                        </div>
                    )}
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-700/50 bg-gray-800/90 overflow-x-auto scrollbar-hide">
                    {tabs.filter((t) => t !== 'Favorites').map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            onClick={() => setActiveTab(tab as SymbolTab)}
                            className={`whitespace-nowrap px-3.5 py-1.5 text-sm rounded-full transition-colors ${
                                activeTab === tab
                                    ? 'bg-gray-700 text-white font-medium'
                                    : 'text-gray-400 hover:text-gray-200'
                            }`}
                        >
                            {tab}
                        </button>
                    ))}
                    {tabs.includes('Favorites') && (
                        <>
                            <div className="flex-1" />
                            <button
                                type="button"
                                onClick={() => setActiveTab('Favorites')}
                                className={`whitespace-nowrap px-3.5 py-1.5 text-sm rounded-full transition-colors flex items-center gap-1.5 ${
                                    activeTab === 'Favorites'
                                        ? 'bg-amber-500/15 text-amber-400 font-medium'
                                        : 'text-amber-500/80 hover:text-amber-400'
                                }`}
                            >
                                <span>★</span>
                                <span>Favorites</span>
                                {favorites.size > 0 && (
                                    <span className="text-[10px] text-gray-500 font-mono">
                                        {favorites.size}
                                    </span>
                                )}
                            </button>
                        </>
                    )}
                </div>

                {/* Filters */}
                {(activeTab === 'Crypto' || activeTab === 'All') && (
                    <div className="px-4 py-2 border-b border-gray-700/50 bg-gray-800/90 flex items-center gap-6 text-xs overflow-x-auto">
                        {/* Market Filter (Spot/Futures) - Only show buttons if marketType NOT enforced */}
                        {activeTab === 'Crypto' && !marketType && (
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500 mr-1">Market:</span>
                                {(['All', 'Spot', 'Futures'] as const).map((m) => (
                                    <button
                                        key={m}
                                        type="button"
                                        onClick={() => setMarketFilter(m)}
                                        className={`px-2 py-1 rounded transition-colors ${marketFilter === m ? 'bg-gray-700 text-blue-400 font-medium' : 'text-gray-400 hover:text-gray-200'}`}
                                    >
                                        {m === 'Futures' ? 'USDT.P' : m}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Show Active Market Type Label if Enforced */}
                        {activeTab === 'Crypto' && marketType && (
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500 mr-1">Market:</span>
                                <span className="px-2 py-1 rounded bg-gray-700 text-blue-400 font-medium border border-blue-500/30">
                                    {marketType === 'futures' ? 'USDT.P (Futures)' : 'Spot'}
                                </span>
                            </div>
                        )}

                        {/* Rank Filter - NEW */}
                        {activeTab === 'Crypto' && (
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500 mr-1">Rank:</span>
                                <select
                                    value={rankFilter}
                                    onChange={(e) => setRankFilter(e.target.value as any)}
                                    aria-label="Rank filter"
                                    className="bg-gray-700 text-gray-200 text-xs rounded px-2 py-1 border-none outline-none cursor-pointer hover:bg-gray-600 transition-colors"
                                >
                                    <option value="All">All Items</option>
                                    <option value="Top 10">Top 10 Monthly</option>
                                    <option value="Top 50">Top 50 Monthly</option>
                                    <option value="Top 100">Top 100 Monthly</option>
                                </select>
                            </div>
                        )}
                    </div>
                )}

                {/* Results List */}
                <div
                    ref={resultsListRef}
                    className="flex-1 overflow-y-auto custom-scrollbar bg-gray-800/90"
                    onScroll={handleScroll}
                >
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                            Loading items...
                        </div>
                    ) : isComingSoonTab(activeTab) ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500 px-6 text-center">
                            <div className="text-5xl opacity-30 mb-3">🔜</div>
                            <p className="text-sm font-medium text-gray-300 mb-1">
                                {activeTab} coming soon
                            </p>
                            <p className="text-xs">
                                For now, browse{' '}
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('Crypto')}
                                    className="text-indigo-400 hover:text-indigo-300 underline-offset-2 hover:underline"
                                >
                                    Crypto
                                </button>
                                {' '}or your{' '}
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('Favorites')}
                                    className="text-amber-400 hover:text-amber-300 underline-offset-2 hover:underline"
                                >
                                    Favorites
                                </button>
                                .
                            </p>
                        </div>
                    ) : filteredSymbols.length === 0 ? (
                        activeTab === 'Favorites' ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-500 px-6 text-center">
                                <div className="text-5xl opacity-30 mb-3">☆</div>
                                <p className="text-sm font-medium text-gray-300 mb-1">
                                    No favorites yet
                                </p>
                                <p className="text-xs">
                                    Click the ☆ next to any symbol on other tabs to pin it here.
                                </p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                <MarketIcon className="w-16 h-16 opacity-20 mb-4" />
                                <p>No symbols match your criteria</p>
                            </div>
                        )
                    ) : (
                        <div className="divide-y divide-gray-800/60">
                            {visibleSymbols.map((item, idx) => {
                                const normalised = item.symbol.replace('/', '');
                                const tags = deriveTags(item.symbol);
                                const favorited = isFavorite(normalised);
                                const alreadyAdded = existingSymbols.includes(normalised);
                                const isFocused = idx === focusedIndex;
                                return (
                                    <div
                                        key={item.symbol + idx}
                                        data-focused={isFocused ? 'true' : undefined}
                                        onClick={() => {
                                            if (alreadyAdded) return;
                                            onSymbolSelect(normalised);
                                        }}
                                        onMouseEnter={() => setFocusedIndex(idx)}
                                        className={`flex items-center gap-3.5 px-4 py-3 transition-colors ${
                                            isFocused
                                                ? 'bg-indigo-500/10 shadow-[inset_3px_0_0_0_#6366f1]'
                                                : alreadyAdded
                                                  ? 'opacity-50'
                                                  : 'hover:bg-gray-700/50'
                                        } ${alreadyAdded ? 'cursor-default' : 'cursor-pointer'}`}
                                    >
                                        <CoinAvatar symbol={item.symbol} size={32} />
                                        <div className="flex-none w-[180px] min-w-0">
                                            <div className="font-semibold text-white text-sm truncate">
                                                {item.symbol}
                                            </div>
                                            <div className="text-xs text-gray-500 truncate">
                                                {item.description}
                                            </div>
                                        </div>
                                        <div className="flex-1 flex gap-1.5 flex-wrap">
                                            {tags.map((t) => (
                                                <span
                                                    key={t}
                                                    className="text-[10px] uppercase tracking-wider text-gray-400 bg-gray-800/80 border border-gray-700/50 rounded px-1.5 py-0.5"
                                                >
                                                    {t}
                                                </span>
                                            ))}
                                        </div>
                                        {alreadyAdded ? (
                                            <span className="text-[10px] uppercase tracking-wider text-green-500 bg-green-500/10 border border-green-500/30 rounded px-2 py-1">
                                                ✓ added
                                            </span>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleFavorite(normalised);
                                                }}
                                                className={`p-1.5 rounded transition-colors ${
                                                    favorited
                                                        ? 'text-amber-400 hover:text-amber-300'
                                                        : 'text-gray-600 hover:text-gray-400'
                                                }`}
                                                aria-label={
                                                    favorited ? 'Remove from favorites' : 'Add to favorites'
                                                }
                                            >
                                                <span className="text-base">
                                                    {favorited ? '★' : '☆'}
                                                </span>
                                            </button>
                                        )}
                                        <div className="flex items-center gap-1.5 min-w-[80px] justify-end">
                                            <span className="text-[11px] text-gray-400 font-medium">
                                                {item.exchange === 'BINANCE' ? 'Binance' : item.exchange}
                                            </span>
                                            <div className="w-3.5 h-3.5 rounded-sm bg-[#f3ba2f] flex-shrink-0" />
                                        </div>
                                        {isFocused && (
                                            <div className="text-indigo-400 text-xs pl-1 border-l border-gray-700 ml-1">
                                                ↵
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-4 py-2 border-t border-gray-700/50 bg-black/30 flex items-center justify-between text-[11px] text-gray-500">
                    <span>
                        {filteredSymbols.length.toLocaleString()} symbols · powered by Binance
                    </span>
                    <span className="flex items-center gap-1">
                        <kbd className="border border-gray-700 rounded px-1.5 py-0.5 font-mono text-[9px]">esc</kbd>
                        <span>to close</span>
                    </span>
                </div>
            </div>
        </div>
    );
};

export default SymbolSearchModal;
