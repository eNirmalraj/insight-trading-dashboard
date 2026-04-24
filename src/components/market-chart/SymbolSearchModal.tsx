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
import CoinAvatar from './CoinAvatar';
import ExchangeAvatar from './ExchangeAvatar';
import { deriveTags } from './symbolSearchTags';

type SymbolTab = 'All' | 'Stocks' | 'Forex' | 'Crypto' | 'Indian';

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
    const modalRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useOutsideAlerter(modalRef, () => {
        if (isOpen) onClose();
    });

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

    const allTabs: SymbolTab[] = ['All', 'Stocks', 'Forex', 'Crypto', 'Indian'];
    const tabs = allowedTabs ? allTabs.filter((tab) => allowedTabs.includes(tab)) : allTabs;

    const COMING_SOON_TABS: SymbolTab[] = ['Stocks', 'Forex', 'Indian'];
    const isComingSoonTab = (t: SymbolTab) => COMING_SOON_TABS.includes(t);

    const filteredSymbols = useMemo(() => {
        let source: SearchSymbol[] = [];

        if (isComingSoonTab(activeTab)) {
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
    }, [searchTerm, activeTab, cryptoSymbols, marketFilter, rankFilter]);

    // Reset limit when filters change
    useEffect(() => {
        setDisplayLimit(50);
    }, [searchTerm, activeTab, marketFilter, rankFilter]);

    const visibleSymbols = useMemo(() => {
        return filteredSymbols.slice(0, displayLimit);
    }, [filteredSymbols, displayLimit]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        if (scrollTop + clientHeight >= scrollHeight - 50) {
            if (displayLimit < filteredSymbols.length) {
                setDisplayLimit((prev) => Math.min(prev + 50, filteredSymbols.length));
            }
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
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
                className="bg-gray-800/90 backdrop-blur-sm border border-gray-700 rounded-xl shadow-2xl w-full max-w-[800px] flex flex-col h-[600px] overflow-hidden text-[#D1D4DC]"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-black/40 border-b border-gray-700/50">
                    <h2 className="text-sm font-semibold text-white">
                        {title || 'Symbol Search'}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors"
                        aria-label="Close"
                    >
                        <CloseIcon className="w-5 h-5" />
                    </button>
                </div>

                {/* Search input */}
                <div className="p-4 border-b border-gray-700/50">
                    <div className="relative group">
                        <SearchIcon className="w-5 h-5 absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="Symbol, ISIN, or CUSIP"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
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
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-700/50 bg-gray-800/90 overflow-x-auto scrollbar-hide">
                    {tabs.map((tab) => (
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
                                .
                            </p>
                        </div>
                    ) : filteredSymbols.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <MarketIcon className="w-16 h-16 opacity-20 mb-4" />
                            <p>No symbols match your criteria</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-800/60">
                            {visibleSymbols.map((item, idx) => {
                                const normalised = item.symbol.replace('/', '');
                                const tags = deriveTags(item.symbol);
                                const alreadyAdded = existingSymbols.includes(normalised);
                                return (
                                    <div
                                        key={item.symbol + idx}
                                        onClick={() => {
                                            if (alreadyAdded) return;
                                            onSymbolSelect(normalised);
                                        }}
                                        className={`flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                                            alreadyAdded
                                                ? 'opacity-50 cursor-default'
                                                : 'hover:bg-gray-700/50 cursor-pointer'
                                        }`}
                                    >
                                        <CoinAvatar symbol={item.symbol} size={28} />
                                        <span className="font-semibold text-white whitespace-nowrap">
                                            {item.symbol}
                                        </span>
                                        <span className="text-gray-600">·</span>
                                        <span className="text-gray-400 truncate min-w-0">
                                            {item.description}
                                        </span>
                                        <span className="text-gray-600 hidden md:inline">·</span>
                                        <div className="hidden md:flex gap-1 flex-shrink-0">
                                            {tags.map((t) => (
                                                <span
                                                    key={t}
                                                    className="text-[10px] uppercase tracking-wider text-gray-400 bg-gray-800/80 border border-gray-700/50 rounded px-1.5 py-0.5"
                                                >
                                                    {t}
                                                </span>
                                            ))}
                                        </div>
                                        <div className="flex-1" />
                                        {alreadyAdded && (
                                            <span className="text-[10px] uppercase tracking-wider text-green-500 bg-green-500/10 border border-green-500/30 rounded px-2 py-0.5 flex-shrink-0">
                                                ✓ added
                                            </span>
                                        )}
                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                            <span className="text-[11px] text-gray-400 font-medium">
                                                {item.exchange === 'BINANCE' ? 'Binance' : item.exchange}
                                            </span>
                                            <ExchangeAvatar exchange={item.exchange} size={14} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-4 py-2 border-t border-gray-700/50 bg-black/30 text-[11px] text-gray-500 text-center">
                    {filteredSymbols.length.toLocaleString()} symbols · powered by Binance
                </div>
            </div>
        </div>
    );
};

export default SymbolSearchModal;
