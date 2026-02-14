import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useOutsideAlerter } from './hooks';
import { SearchIcon, CloseIcon, PlusCircleIcon, MarketIcon, CheckCircleIcon } from '../IconComponents';
import { fetchAllCryptoSymbols, SearchSymbol } from '../../services/marketDataService';

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
    marketType
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState(defaultTab);

    // Initialize filter based on prop (capitalize first letter)
    const initialMarketFilter = marketType
        ? (marketType.charAt(0).toUpperCase() + marketType.slice(1) as 'Spot' | 'Futures')
        : 'All';

    const [marketFilter, setMarketFilter] = useState<'All' | 'Spot' | 'Futures'>(initialMarketFilter);
    const [rankFilter, setRankFilter] = useState<'All' | 'Top 10' | 'Top 50' | 'Top 100'>('All');
    const [cryptoSymbols, setCryptoSymbols] = useState<SearchSymbol[]>([]);
    const [displayLimit, setDisplayLimit] = useState(50);
    const [loading, setLoading] = useState(false);
    const modalRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useOutsideAlerter(modalRef, () => { if (isOpen) onClose(); });

    // Ensure filter updates if prop changes
    useEffect(() => {
        if (marketType) {
            setMarketFilter(marketType.charAt(0).toUpperCase() + marketType.slice(1) as 'Spot' | 'Futures');
        } else {
            setMarketFilter('All');
        }
    }, [marketType]);

    // Load symbols on mount
    useEffect(() => {
        if (isOpen && cryptoSymbols.length === 0) {
            setLoading(true);
            fetchAllCryptoSymbols().then(data => {
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
                setActiveTab(defaultTab);
            }
        } else {
            setSearchTerm('');
        }
    }, [isOpen, defaultTab]);

    // Mock other categories
    const mockSymbols: Record<string, SearchSymbol[]> = {
        'Forex': [
            { symbol: 'EUR/USD', description: 'Euro / U.S. Dollar', price: 1.0855, change: 0.0030, changePercent: 0.28, volume: 0, type: 'Forex', exchange: 'FXCM', market: 'Spot' },
            { symbol: 'GBP/USD', description: 'British Pound / U.S. Dollar', price: 1.2540, change: -0.0015, changePercent: -0.12, volume: 0, type: 'Forex', exchange: 'FXCM', market: 'Spot' },
            { symbol: 'USD/JPY', description: 'U.S. Dollar / Japanese Yen', price: 155.80, change: 0.50, changePercent: 0.32, volume: 0, type: 'Forex', exchange: 'FXCM', market: 'Spot' },
        ],
        'Stocks': [],
        'Futures': [],
        'Indices': [],
    };

    const allTabs = ['All', 'Stocks', 'Forex', 'Crypto', 'Indian'];
    const tabs = allowedTabs
        ? allTabs.filter(tab => allowedTabs.includes(tab))
        : allTabs;

    const filteredSymbols = useMemo(() => {
        let source: SearchSymbol[] = [];

        if (activeTab === 'All') {
            source = [...cryptoSymbols, ...mockSymbols['Forex']];
        } else if (activeTab === 'Crypto') {
            source = cryptoSymbols;
        } else if (activeTab === 'Forex') {
            source = mockSymbols['Forex'];
        } else {
            source = [];
        }

        // Filter by Market (Spot/Futures)
        if (marketFilter !== 'All' && activeTab === 'Crypto') {
            source = source.filter(s => s.market === marketFilter);
        }

        let result = source;

        // Apply Search Filter
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            result = result.filter(s =>
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
                setDisplayLimit(prev => Math.min(prev + 50, filteredSymbols.length));
            }
        }
    };

    const handleResizePointerDown = (e: React.PointerEvent) => {
        if (!modalRef.current) return;
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.closest('button')) return;

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
                onPointerDown={e => e.stopPropagation()}
            >
                {/* Header / Search Area */}
                <div className="p-4 border-b border-gray-700/50" onPointerDown={handleResizePointerDown}>
                    <div className="flex justify-between items-center mb-4 cursor-move">
                        <h2 className="text-lg font-medium text-white">{title || 'Symbol Search'}</h2>
                        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                            <CloseIcon className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="relative group">
                        <SearchIcon className="w-5 h-5 absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="Symbol, ISIN, or CUSIP"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && searchTerm) {
                                    onSymbolSelect(searchTerm.toUpperCase().replace('/', ''));
                                }
                            }}
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-10 pr-12 py-3 text-base text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                        />
                        <div className="absolute top-1/2 right-3 -translate-y-1/2 flex items-center gap-1">
                            {searchTerm && (
                                (() => {
                                    const isAlreadyAdded = existingSymbols.includes(searchTerm.toUpperCase().replace('/', ''));
                                    return (
                                        <>
                                            <button
                                                onClick={() => !isAlreadyAdded && onSymbolSelect(searchTerm.toUpperCase().replace('/', ''))}
                                                className={`p-1.5 rounded transition-colors ${isAlreadyAdded ? 'text-green-500 cursor-default' : 'text-blue-500 hover:text-blue-400 hover:bg-blue-500/10'}`}
                                                title={isAlreadyAdded ? `${searchTerm} already added` : `Add ${searchTerm}`}
                                                disabled={isAlreadyAdded}
                                            >
                                                {isAlreadyAdded ? <CheckCircleIcon className="w-5 h-5" /> : <PlusCircleIcon className="w-5 h-5" />}
                                            </button>
                                            <button
                                                onClick={() => setSearchTerm('')}
                                                className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-700 rounded transition-colors"
                                            >
                                                <CloseIcon className="w-4 h-4" />
                                            </button>
                                        </>
                                    );
                                })()
                            )}
                        </div>
                    </div>
                </div>

                {/* Tabs & Filters */}
                <div className="flex flex-col border-b border-gray-700/50 bg-gray-800/90">
                    <div className="flex items-center overflow-x-auto scrollbar-hide px-2">
                        {tabs.map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`whitespace-nowrap px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-blue-500 text-blue-500' : 'border-transparent text-gray-400 hover:text-gray-300'}`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Filters */}
                <div className="px-4 py-2 border-b border-gray-700/50 bg-gray-800/90 flex items-center gap-6 text-xs overflow-x-auto">
                    {/* Market Filter (Spot/Futures) - Only show buttons if marketType NOT enforced */}
                    {activeTab === 'Crypto' && !marketType && (
                        <div className="flex items-center gap-2">
                            <span className="text-gray-500 mr-1">Market:</span>
                            {(['All', 'Spot', 'Futures'] as const).map(m => (
                                <button
                                    key={m}
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
                    ) : filteredSymbols.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <MarketIcon className="w-16 h-16 opacity-20 mb-4" />
                            <p>No symbols match your criteria</p>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <tbody>
                                {visibleSymbols.map((item, idx) => (
                                    <tr
                                        key={item.symbol + idx}
                                        onClick={() => onSymbolSelect(item.symbol.replace('/', ''))}
                                        className="group hover:bg-gray-700/50 cursor-pointer transition-colors border-b border-gray-800/50 last:border-b-0"
                                    >
                                        <td className="p-3 pl-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-gray-700/30 flex items-center justify-center text-[10px] font-bold text-gray-400 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                                    {item.symbol.substring(0, 1)}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-white text-sm flex items-center gap-2">
                                                        {item.symbol}
                                                        {/* Optional badges could go here */}
                                                    </div>
                                                    <div className="text-xs text-gray-500 group-hover:text-gray-400">{item.description}</div>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Price Info (Hidden on very small screens if needed, but keeping for utility) */}
                                        <td className="p-3 text-right hidden sm:table-cell">
                                            <div className={`text-sm font-mono ${item.changePercent >= 0 ? 'text-[#00C076]' : 'text-[#FF6838]'}`}>
                                                {item.price > 100 ? item.price.toFixed(2) : item.price.toFixed(5)}
                                            </div>
                                            <div className="text-xs text-gray-500">
                                                {item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
                                            </div>
                                        </td>

                                        {/* Exchange Badge */}
                                        <td className="p-3 text-right w-24">
                                            <div className="flex flex-col items-end">
                                                <span className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider group-hover:text-gray-300">{item.type}</span>
                                                <div className="flex items-center gap-1 mt-0.5">
                                                    <img src="https://cryptologos.cc/logos/binance-coin-bnb-logo.png?v=026" className="w-3 h-3 opacity-50 group-hover:opacity-100" alt="" />
                                                    <span className="text-[10px] text-gray-400 font-medium group-hover:text-white uppercase">{item.exchange}</span>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Add Action */}
                                        <td className="p-3 pr-6 text-right w-12">
                                            {(() => {
                                                const isAlreadyAdded = existingSymbols.includes(item.symbol.replace('/', ''));
                                                return (
                                                    <button
                                                        className={`p-2 rounded-full transition-all ${isAlreadyAdded ? 'text-green-500 cursor-default' : 'text-gray-500 hover:text-blue-500 bg-gray-700/0 hover:bg-blue-500/10'}`}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (!isAlreadyAdded) onSymbolSelect(item.symbol.replace('/', ''));
                                                        }}
                                                        disabled={isAlreadyAdded}
                                                        title={isAlreadyAdded ? "Already Added" : "Add to list"}
                                                    >
                                                        {isAlreadyAdded ? <CheckCircleIcon className="w-5 h-5" /> : <PlusCircleIcon className="w-5 h-5" />}
                                                    </button>
                                                );
                                            })()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer */}
                <div className="p-2 border-t border-gray-700/50 bg-gray-800/90 text-[10px] text-center text-gray-500">
                    Search powered by Binance API
                </div>
            </div>
        </div>
    );
};

export default SymbolSearchModal;
