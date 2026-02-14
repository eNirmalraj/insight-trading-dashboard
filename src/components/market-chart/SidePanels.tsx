import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { AlertStatus, Watchlist, TradeDirection, WatchlistItem, AccountType } from '../../types';
import { Candle, Drawing, Indicator, OrderDetails, PlacingOrderLine } from './types';
import { SearchIcon, CloseIcon, EyeIcon, EyeOffIcon, TrashIcon, TargetIcon, PlusIcon, MinusIcon, ChevronDownIcon, PlusCircleIcon, WatchlistIcon, AlertIcon, DataWindowIcon, OrderPanelIcon, ObjectTreeIcon, CloneIcon, SettingsIcon, SendIcon } from '../IconComponents';
import * as api from '../../api';

import { subscribeToTicker, unsubscribeFromTicker } from "../../services/marketRealtimeService";
import * as priceAlertService from '../../services/alertService';
import { useAuth } from '../../context/AuthContext';

import CreateWatchlistModal from '../CreateWatchlistModal';
import SymbolSearchModal from './SymbolSearchModal';
import ConfirmationModal from '../ConfirmationModal';

// Helper for outside clicks
const useOutsideAlerter = (ref: React.RefObject<HTMLDivElement>, callback: () => void) => {
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                callback();
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [ref, callback]);
};

const SymbolLogo: React.FC<{ symbol: string }> = ({ symbol }) => {
    const text = symbol.substring(0, 2);
    const colors = ['bg-blue-500/20 text-blue-300', 'bg-green-500/20 text-green-300', 'bg-yellow-500/20 text-yellow-300', 'bg-red-500/20 text-red-300', 'bg-purple-500/20 text-purple-300'];
    const colorClass = colors[text.charCodeAt(0) % colors.length];
    return <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${colorClass}`}>{text}</div>;
};

interface WatchlistPanelProps {
    onClose: () => void;
    onSymbolSelect: (symbol: string) => void;
    symbol: string;
}

const WatchlistPanel: React.FC<WatchlistPanelProps> = ({ onClose, onSymbolSelect, symbol }) => {
    const { user, isLoading: isAuthLoading } = useAuth();
    const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
    // Initialize from localStorage or default to empty
    const [activeWatchlistId, setActiveWatchlistId] = useState(() => {
        return localStorage.getItem('activeWatchlistId') || '';
    });

    // Persist active selection whenever it changes
    useEffect(() => {
        if (activeWatchlistId) {
            localStorage.setItem('activeWatchlistId', activeWatchlistId);
        }
    }, [activeWatchlistId]);

    // Real-time price state: { [symbol]: { price, changePercent, volume, change } }
    const [tickerData, setTickerData] = useState<Record<string, { price: number; changePercent: number; volume: number; change: number }>>({});

    // Column Selection
    type ColumnId = 'symbol' | 'price' | 'change' | 'changePercent' | 'volume';
    const [activeColumns, setActiveColumns] = useState<ColumnId[]>(['price', 'changePercent', 'volume']);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const settingsRef = useRef<HTMLDivElement>(null);
    useOutsideAlerter(settingsRef, () => setIsSettingsOpen(false));

    // Column Widths (resizable) - stored as percentages (0-100)
    const [columnWidths, setColumnWidths] = useState<Record<ColumnId, number>>(() => {
        const saved = localStorage.getItem('watchlistColumnWidthsPercent');
        return saved ? JSON.parse(saved) : {
            symbol: 30,
            price: 25,
            change: 15,
            changePercent: 15,
            volume: 15,
        };
    });

    // Save column widths to localStorage
    useEffect(() => {
        localStorage.setItem('watchlistColumnWidthsPercent', JSON.stringify(columnWidths));
    }, [columnWidths]);

    // Column resizing state
    const [resizingColumn, setResizingColumn] = useState<ColumnId | null>(null);
    const [resizeStartX, setResizeStartX] = useState(0);
    const [resizeStartWidth, setResizeStartWidth] = useState(0);

    const handleResizeStart = (e: React.PointerEvent, columnId: ColumnId) => {
        e.preventDefault();
        e.stopPropagation();
        setResizingColumn(columnId);
        setResizeStartX(e.clientX);
        // Store current percentage width to calculate delta
        setResizeStartWidth(columnWidths[columnId]);
    };

    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(0);

    useEffect(() => {
        if (!containerRef.current) return;
        const ro = new ResizeObserver(entries => {
            for (const entry of entries) {
                setContainerWidth(entry.contentRect.width);
            }
        });
        ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []);



    const availableColumns: { id: ColumnId; label: string }[] = [
        { id: 'price', label: 'Price' },
        { id: 'change', label: 'Change' },
        { id: 'changePercent', label: 'Change %' },
        { id: 'volume', label: 'Volume' },
    ];

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isAddSymbolModalOpen, setIsAddSymbolModalOpen] = useState(false);
    const [confirmModalState, setConfirmModalState] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void; }>({ isOpen: false, title: '', message: '', onConfirm: () => { } });

    const [isWlDropdownOpen, setIsWlDropdownOpen] = useState(false);
    const wlDropdownRef = useRef<HTMLDivElement>(null);
    useOutsideAlerter(wlDropdownRef, () => setIsWlDropdownOpen(false));

    const assetType = useMemo(() => {
        const upperSymbol = symbol.toUpperCase();
        const isCrypto = ['USDT', 'BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LTC', 'BNB'].some(c => upperSymbol.includes(c));
        return isCrypto ? AccountType.CRYPTO : AccountType.FOREX;
    }, [symbol]);

    const fetchWatchlists = useCallback(async () => {
        if (isAuthLoading || !user) return; // Wait for auth

        try {
            const data = await api.getWatchlists();
            setWatchlists(data);

            if (data.length > 0) {
                // If we have a saved ID and it exists in the fetched lists, use it
                // Otherwise, default to the first one
                const savedId = localStorage.getItem('activeWatchlistId');
                const isValidSavedId = savedId && data.some(w => w.id === savedId);

                if (isValidSavedId) {
                    setActiveWatchlistId(savedId!);
                } else if (!activeWatchlistId || !data.some(w => w.id === activeWatchlistId)) {
                    // Fallback if current active is invalid or empty
                    setActiveWatchlistId(data[0].id);
                }
            } else {
                setActiveWatchlistId('');
            }
        } catch (error) {
            console.error("Failed to fetch watchlists:", error);
        }
    }, [activeWatchlistId, isAuthLoading, user]);

    useEffect(() => {
        if (!isAuthLoading && user) {
            fetchWatchlists();
        }
    }, [fetchWatchlists, isAuthLoading, user]);

    const activeWatchlist = watchlists.find(w => w.id === activeWatchlistId);

    const filteredItems = useMemo(() => {
        if (!activeWatchlist) return [];
        return activeWatchlist.items;
    }, [activeWatchlist]);

    // Subscriptions logic
    const activeSubs = useRef<Map<string, (data: any) => void>>(new Map());

    useEffect(() => {
        // Cleanup previous subs
        activeSubs.current.forEach((cb, s) => unsubscribeFromTicker(s, cb));
        activeSubs.current.clear();
        // Keep cached ticker data for instant display - it will update with live data momentarily
        // setTickerData({}); // Don't reset - preserve cached data for instant UX

        if (!activeWatchlist) return;

        activeWatchlist.items.forEach(item => {
            const cb = (data: { price: number; changePercent: number; volume: number; change: number }) => {
                setTickerData(prev => ({
                    ...prev,
                    [item.symbol]: data
                }));
            };
            subscribeToTicker(item.symbol, cb);
            activeSubs.current.set(item.symbol, cb);
        });

        return () => {
            // Cleanup on unmount or change
            activeSubs.current.forEach((cb, s) => unsubscribeFromTicker(s, cb));
            activeSubs.current.clear();
        };
    }, [activeWatchlist]); // Use entire watchlist object instead of items array to prevent unnecessary re-renders


    const handleCreateWatchlist = async (name: string, accountType: AccountType, strategy: string, tradingMode: 'paper' | 'live') => {
        const normalizedName = name.trim().toLowerCase();
        if (watchlists.some(wl => wl.name.trim().toLowerCase() === normalizedName)) {
            alert(`A watchlist with the name "${name}" already exists.`);
            return;
        }

        try {
            const newWatchlist = await api.createWatchlist(name, accountType, strategy, tradingMode);
            await fetchWatchlists();
            setActiveWatchlistId(newWatchlist.id);
            setIsCreateModalOpen(false);
        } catch (e: any) {
            console.error('Failed to create watchlist:', e);
            alert(`Failed to create watchlist: ${e.message}`);
        }
    };

    const handleAddSymbol = async (symbol: string) => {
        if (!activeWatchlist) return;

        // Optimistic Update
        const tempId = `temp-${Date.now()}`;
        const newItem: WatchlistItem = {
            id: tempId,
            symbol: symbol,
            price: tickerData[symbol]?.price || 0,
            change: tickerData[symbol]?.change || 0,
            changePercent: tickerData[symbol]?.changePercent || 0,
            isPositive: (tickerData[symbol]?.changePercent || 0) >= 0,
            autoTradeEnabled: false
        };

        setWatchlists(prev => prev.map(wl => {
            if (wl.id !== activeWatchlist.id) return wl;
            if (wl.items.some(i => i.symbol === symbol)) return wl;
            return { ...wl, items: [...wl.items, newItem] };
        }));

        try {
            await api.addSymbolToWatchlist(activeWatchlist.id, symbol);
            fetchWatchlists();
            // Modal stays open
        } catch (e: any) {
            // Revert on error
            setWatchlists(prev => prev.map(wl => {
                if (wl.id !== activeWatchlist.id) return wl;
                return { ...wl, items: wl.items.filter(i => i.id !== tempId) };
            }));
            alert(e.message);
        }
    };

    const handleRemoveSymbol = async (symbolId: string) => {
        if (!activeWatchlist) return;
        await api.removeSymbolFromWatchlist(activeWatchlist.id, symbolId);
        fetchWatchlists();
    };

    const handleDeleteWatchlist = () => {
        if (!activeWatchlist) return;
        setConfirmModalState({
            isOpen: true,
            title: 'Delete List',
            message: `Are you sure you want to delete "${activeWatchlist.name}"? This action cannot be undone.`,
            onConfirm: async () => {
                await api.deleteWatchlist(activeWatchlist.id);
                fetchWatchlists(); // this will reset active ID if needed
            }
        });
    };

    const handleCopyToScripts = async () => {
        if (!activeWatchlist) return;
        const confirmCopy = window.confirm(`Copy "${activeWatchlist.name}" to My Scripts?`);
        if (!confirmCopy) return;

        try {
            const newScriptName = `${activeWatchlist.name} (Copy)`;
            const newScript = await api.createScript(newScriptName, activeWatchlist.accountType, activeWatchlist.strategyType || 'Manual');

            // Add items concurrently
            await Promise.all(activeWatchlist.items.map(item => api.addSymbolToScript(newScript.id, item.symbol)));

            alert(`Successfully copied to My Scripts as "${newScriptName}"`);
        } catch (e) {
            console.error(e);
            alert("Failed to copy list to My Scripts.");
        }
    };

    const formatVolume = (vol: number) => {
        if (vol >= 1e9) return (vol / 1e9).toFixed(2) + 'B';
        if (vol >= 1e6) return (vol / 1e6).toFixed(2) + 'M';
        if (vol >= 1e3) return (vol / 1e3).toFixed(2) + 'K';
        return vol.toFixed(0);
    };

    const visibleColumns = useMemo(() => {
        const cols = [{ id: 'symbol' as ColumnId, label: 'Symbol' }];
        availableColumns.forEach(c => {
            if (activeColumns.includes(c.id)) cols.push(c);
        });
        return cols;
    }, [activeColumns]);

    const lastColumnId = visibleColumns[visibleColumns.length - 1]?.id;

    useEffect(() => {
        if (!resizingColumn || containerWidth === 0) return;

        const handleMouseMove = (e: MouseEvent) => {
            const diffPx = e.clientX - resizeStartX;
            const diffPercent = (diffPx / containerWidth) * 100;

            // Calculate new width relative to container
            let newWidthInfo = Math.max(5, resizeStartWidth + diffPercent); // Min width 5%

            // Allow max width up to 90% (leaving room for others)
            newWidthInfo = Math.min(newWidthInfo, 90);

            setColumnWidths(prev => ({ ...prev, [resizingColumn]: newWidthInfo }));
        };

        const handleMouseUp = () => {
            setResizingColumn(null);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
        };
    }, [resizingColumn, resizeStartX, resizeStartWidth, containerWidth]);

    return (
        <>
            {resizingColumn && (
                <div className="fixed top-0 left-0 w-full h-full z-[9999] cursor-col-resize" style={{ userSelect: 'none' }} />
            )}
            <div
                className="w-full h-full flex flex-col text-white bg-gray-900"
                onPointerDown={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-2.5 border-b border-gray-700/50">
                    <h3 className="font-semibold">Watchlist</h3>
                    <div className="flex items-center gap-2">
                        <div ref={settingsRef} className="relative">
                            <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 transition-colors">
                                <SettingsIcon className="w-4 h-4" />
                            </button>
                            {isSettingsOpen && (
                                <div className="absolute top-full right-0 mt-2 bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-2 z-50 w-40">
                                    <div className="text-xs font-bold text-gray-500 uppercase px-2 py-1 mb-1">Columns</div>
                                    {availableColumns.map(col => (
                                        <label key={col.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-700 rounded cursor-pointer text-sm">
                                            <input
                                                type="checkbox"
                                                checked={activeColumns.includes(col.id)}
                                                onChange={e => {
                                                    if (e.target.checked) {
                                                        setActiveColumns(prev => [...prev, col.id]);
                                                    } else {
                                                        setActiveColumns(prev => prev.filter(c => c !== col.id));
                                                    }
                                                }}
                                                className="rounded bg-gray-900 border-gray-600 text-blue-500 focus:ring-offset-gray-900"
                                            />
                                            {col.label}
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                        <button onClick={onClose} className="text-gray-400 hover:text-white"><CloseIcon className="w-5 h-5" /></button>
                    </div>
                </div>

                <div className="p-1.5 border-b border-gray-700/50 flex items-center gap-2">
                    <div ref={wlDropdownRef} className="relative flex-1">
                        <button onClick={() => setIsWlDropdownOpen(p => !p)} className="w-full flex justify-between items-center bg-gray-800 p-2 rounded-md text-sm hover:bg-gray-700 transition-colors">
                            <span>{activeWatchlist?.name || 'Select a list'}</span>
                            <ChevronDownIcon className={`w-4 h-4 transition-transform ${isWlDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isWlDropdownOpen && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-10 p-1">
                                {watchlists.map(wl => (
                                    <button
                                        key={wl.id}
                                        onClick={() => { setActiveWatchlistId(wl.id); setIsWlDropdownOpen(false); }}
                                        className={`w-full text-left px-3 py-1.5 text-sm rounded ${activeWatchlistId === wl.id ? 'bg-blue-500/20 text-blue-300' : 'hover:bg-gray-700'}`}
                                    >
                                        {wl.name}
                                    </button>
                                ))}
                                <div className="my-1 border-t border-gray-700" />
                                <button
                                    onClick={() => { if (activeWatchlist) { handleDeleteWatchlist(); setIsWlDropdownOpen(false); } }}
                                    disabled={!activeWatchlist}
                                    className="w-full text-left px-3 py-1.5 text-sm rounded hover:bg-gray-700 text-red-400 flex items-center gap-2 disabled:text-gray-500 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                >
                                    <TrashIcon className="w-4 h-4" />
                                    Delete List
                                </button>
                                <div className="my-1 border-t border-gray-700" />
                                <button
                                    onClick={() => { setIsCreateModalOpen(true); setIsWlDropdownOpen(false); }}
                                    className="w-full text-left px-3 py-1.5 text-sm rounded hover:bg-gray-700 text-blue-400 flex items-center gap-2"
                                >
                                    <PlusCircleIcon className="w-4 h-4" />
                                    Create new list...
                                </button>
                            </div>
                        )}
                    </div>
                    {activeWatchlist && (
                        <>
                            <button
                                onClick={handleCopyToScripts}
                                className="p-2 rounded-md text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700"
                                title="Copy to My Scripts"
                            >
                                <CloneIcon className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setIsAddSymbolModalOpen(true)}
                                className="p-2 rounded-md text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700"
                                title="Add Symbol"
                            >
                                <PlusIcon className="w-4 h-4" />
                            </button>
                        </>
                    )}
                </div>

                <div ref={containerRef} className="flex-1 overflow-hidden">
                    <table className="w-full text-xs md:text-sm table-fixed">
                        <thead className="text-gray-500 text-[10px] uppercase font-bold border-b border-gray-800/50">
                            <tr>
                                {visibleColumns.map(col => {
                                    const isLast = col.id === lastColumnId;
                                    return (
                                        <th
                                            key={col.id}
                                            className="p-2 text-center relative border-r border-gray-800/50 last:border-r-0"
                                            style={{ width: isLast ? 'auto' : `${columnWidths[col.id]}%` }}
                                        >
                                            {col.label}
                                            {!isLast && (
                                                <div
                                                    className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500/50 active:bg-blue-500"
                                                    onPointerDown={(e) => handleResizeStart(e, col.id)}
                                                />
                                            )}
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredItems.map(item => {
                                const data = tickerData[item.symbol] || { price: 0, changePercent: 0, volume: 0, change: 0 };
                                const hasData = data.price !== 0;
                                const displayPrice = hasData ? data.price : (item.price || 0);
                                const displayChangePercent = hasData ? data.changePercent : (item.changePercent || 0);
                                const displayChange = hasData ? data.change : (item.change || 0);
                                const displayVolume = hasData ? data.volume : 0;
                                const isPos = displayChangePercent >= 0;
                                const colorClass = isPos ? 'text-green-400' : 'text-red-400';

                                return (
                                    <tr key={item.id} className="group hover:bg-gray-800 border-b border-gray-800/50 relative">
                                        {visibleColumns.map(col => {
                                            const isLast = col.id === lastColumnId;

                                            // Symbol Cell (Special Case)
                                            if (col.id === 'symbol') {
                                                return (
                                                    <td
                                                        key={col.id}
                                                        onClick={() => onSymbolSelect(item.symbol)}
                                                        className="p-1.5 font-medium cursor-pointer border-r border-gray-800/50 last:border-r-0 text-center"
                                                        style={{ width: isLast ? 'auto' : `${columnWidths.symbol}%` }}
                                                    >
                                                        <div className="flex items-center justify-center gap-2 overflow-hidden">
                                                            <SymbolLogo symbol={item.symbol} />
                                                            <span className="truncate">{item.symbol}</span>
                                                        </div>

                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleRemoveSymbol(item.id);
                                                            }}
                                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-gray-800/80 rounded p-1"
                                                            title="Remove"
                                                        >
                                                            <TrashIcon className="w-3 h-3" />
                                                        </button>
                                                    </td>
                                                );
                                            }

                                            // Computed content for other columns
                                            let content: React.ReactNode = '-';
                                            let cellColor = '';

                                            if (col.id === 'price') {
                                                content = displayPrice > 0 ? displayPrice.toFixed(displayPrice < 1 ? 5 : 2) : '-';
                                                cellColor = colorClass;
                                            } else if (col.id === 'change') {
                                                content = displayPrice > 0 ? `${isPos ? '+' : ''}${displayChange.toFixed(displayPrice < 1 ? 5 : 2)}` : '-';
                                                cellColor = colorClass;
                                            } else if (col.id === 'changePercent') {
                                                content = displayPrice > 0 ? `${isPos ? '+' : ''}${displayChangePercent.toFixed(2)}%` : '-';
                                                cellColor = colorClass;
                                            } else if (col.id === 'volume') {
                                                content = displayVolume > 0 ? formatVolume(displayVolume) : '-';
                                                cellColor = 'text-gray-300';
                                            }

                                            return (
                                                <td
                                                    key={col.id}
                                                    onClick={() => onSymbolSelect(item.symbol)}
                                                    className={`p-1.5 text-center cursor-pointer ${cellColor} border-r border-gray-800/50 last:border-r-0`}
                                                    style={{ width: isLast ? 'auto' : `${columnWidths[col.id]}%` }}
                                                >
                                                    {content}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {activeWatchlist && filteredItems.length === 0 && (
                        <div className="p-4 text-center text-sm text-gray-500">
                            This list is empty.
                        </div>
                    )}
                    {!activeWatchlist && (
                        <div className="p-4 text-center text-sm text-gray-500">
                            Select a list or create a new one.
                        </div>
                    )}
                </div>
            </div>
            {isCreateModalOpen && <CreateWatchlistModal onClose={() => setIsCreateModalOpen(false)} onCreate={handleCreateWatchlist} simple={true} defaultType={assetType} />}
            {isAddSymbolModalOpen && activeWatchlist && (
                <SymbolSearchModal
                    isOpen={isAddSymbolModalOpen}
                    onClose={() => setIsAddSymbolModalOpen(false)}
                    onSymbolSelect={handleAddSymbol}
                    title="Add Symbol to List"
                    existingSymbols={activeWatchlist.items.map(i => i.symbol.replace('/', ''))}
                    defaultTab={
                        activeWatchlist.accountType === AccountType.CRYPTO ? 'Crypto' :
                            activeWatchlist.accountType === AccountType.FOREX ? 'Forex' :
                                activeWatchlist.accountType === AccountType.INDIAN ? 'All' :
                                    'All'
                    }
                    allowedTabs={
                        activeWatchlist.accountType === AccountType.CRYPTO ? ['Crypto'] :
                            activeWatchlist.accountType === AccountType.FOREX ? ['Forex'] :
                                undefined
                    }
                />
            )}
            <ConfirmationModal
                isOpen={confirmModalState.isOpen}
                onClose={() => setConfirmModalState(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmModalState.onConfirm}
                title={confirmModalState.title}
                message={confirmModalState.message}
            />

        </>
    );
};

const AlertsPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [alerts, setAlerts] = useState<any[]>([]);

    useEffect(() => {
        const fetchAlerts = async () => {
            const data = await priceAlertService.getAlerts();
            setAlerts(data);
        };

        fetchAlerts();
        const unsubscribe = priceAlertService.subscribe(() => {
            fetchAlerts();
        });
        return unsubscribe;
    }, []);

    const handleDelete = (id: string) => {
        priceAlertService.deleteAlert(id);
    };

    return (
        <div className="w-full h-full flex flex-col text-white bg-gray-900">
            <div className="flex items-center justify-between p-2.5 border-b border-gray-700/50">
                <h3 className="font-semibold">Alerts</h3>
                <button onClick={onClose} className="text-gray-400 hover:text-white"><CloseIcon className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
                {alerts.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-sm">No active alerts.</div>
                ) : (
                    <ul className="divide-y divide-gray-700/50">
                        {alerts.map((alert: any) => (
                            <li key={alert.id} className="p-2.5 text-xs hover:bg-gray-800 group">
                                <div className="flex justify-between items-center">
                                    <div className="flex-1 pr-2">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${alert.triggered ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                                                {alert.triggered ? 'TRIGGERED' : 'ACTIVE'}
                                            </span>
                                            <button onClick={() => handleDelete(alert.id)} className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <TrashIcon className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                        <p className="font-medium text-gray-300">{alert.message}</p>
                                        <p className="text-gray-500 mt-1 flex justify-between">
                                            <span>{alert.condition} {alert.value}</span>
                                            <span>{new Date(alert.createdAt).toLocaleTimeString()}</span>
                                        </p>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

const DataWindowPanel: React.FC<{ onClose: () => void; hoveredCandle: Candle | null, symbol: string }> = ({ onClose, hoveredCandle, symbol }) => {
    const ohlc = hoveredCandle || { open: 0, high: 0, low: 0, close: 0, time: 0 };
    const format = (p: number) => p.toFixed(5);
    const isPositive = ohlc.close >= ohlc.open;
    const change = ohlc.close - ohlc.open;
    const changePercent = ohlc.open !== 0 ? (change / ohlc.open) * 100 : 0;

    return (
        <div className="w-full h-full flex flex-col text-white bg-gray-900">
            <div className="flex items-center justify-between p-2.5 border-b border-gray-700/50">
                <h3 className="font-semibold">Data Window</h3>
                <button onClick={onClose} className="text-gray-400 hover:text-white"><CloseIcon className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-2.5 space-y-2 text-sm">
                <div className="font-bold text-base mb-2">{symbol}</div>
                <div className="flex justify-between"><span className="text-gray-400">Open</span> <span style={{ color: isPositive ? '#34D399' : '#F87171' }}>{format(ohlc.open)}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">High</span> <span style={{ color: isPositive ? '#34D399' : '#F87171' }}>{format(ohlc.high)}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Low</span> <span style={{ color: isPositive ? '#34D399' : '#F87171' }}>{format(ohlc.low)}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Close</span> <span style={{ color: isPositive ? '#34D399' : '#F87171' }}>{format(ohlc.close)}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Change</span> <span style={{ color: isPositive ? '#34D399' : '#F87171' }}>{change.toFixed(5)} ({changePercent.toFixed(2)}%)</span></div>
            </div>
        </div>
    );
};

const ObjectTreePanel: React.FC<{
    onClose: () => void;
    drawings: Drawing[];
    indicators: Indicator[];
    onDeleteDrawing: (id: string) => void;
    onToggleDrawingVisibility: (id: string) => void;
    onDeleteIndicator: (id: string) => void;
    onToggleIndicatorVisibility: (id: string) => void;
}> = ({ onClose, drawings, indicators, onDeleteDrawing, onToggleDrawingVisibility, onDeleteIndicator, onToggleIndicatorVisibility }) => {
    const getDrawingName = (d: Drawing): string => {
        switch (d.type) {
            case 'Horizontal Line': return `${d.type} (${d.price.toFixed(5)})`;
            case 'Text Note': return `${d.type} ("${d.text.substring(0, 15)}...")`;
            default: return d.type;
        }
    }

    return (
        <div className="w-full h-full flex flex-col text-white bg-gray-900">
            <div className="flex items-center justify-between p-2.5 border-b border-gray-700/50">
                <h3 className="font-semibold">Object Tree</h3>
                <button onClick={onClose} className="text-gray-400 hover:text-white"><CloseIcon className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
                {drawings.length === 0 && indicators.length === 0 ? (
                    <div className="text-center py-16 px-6 text-gray-500">
                        <h3 className="text-sm font-semibold text-gray-400">No Objects on Chart</h3>
                        <p className="mt-2 text-xs">Use the toolbar to add drawings or indicators.</p>
                    </div>
                ) : (
                    <>
                        {drawings.length > 0 && (
                            <section className="mb-4">
                                <h3 className="px-2 text-xs font-semibold text-gray-400 mb-2">Drawings ({drawings.length})</h3>
                                <ul className="space-y-1">
                                    {drawings.map(d => (
                                        <li key={d.id} className="flex items-center justify-between p-2 rounded-md hover:bg-gray-800 group">
                                            <span className="text-sm text-gray-300">{getDrawingName(d)}</span>
                                            <div className="flex items-center gap-3 opacity-100 md:opacity-0 md:group-hover:opacity-100">
                                                <button onClick={() => onToggleDrawingVisibility(d.id)} title={d.isVisible === false ? "Show" : "Hide"}>
                                                    {d.isVisible === false ? <EyeOffIcon className="w-4 h-4 text-gray-400 hover:text-white" /> : <EyeIcon className="w-4 h-4 text-gray-400 hover:text-white" />}
                                                </button>
                                                <button onClick={() => onDeleteDrawing(d.id)} title="Delete">
                                                    <TrashIcon className="w-4 h-4 text-gray-400 hover:text-red-400" />
                                                </button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}
                        {indicators.length > 0 && (
                            <section>
                                <h3 className="px-2 text-xs font-semibold text-gray-400 mb-2">Indicators ({indicators.length})</h3>
                                <ul className="space-y-1">
                                    {indicators.map(i => (
                                        <li key={i.id} className="flex items-center justify-between p-2 rounded-md hover:bg-gray-800 group">
                                            <span className="text-sm" style={{ color: i.isVisible ? i.settings.color : '#6B7280' }}>{i.type}</span>
                                            <div className="flex items-center gap-3 opacity-100 md:opacity-0 md:group-hover:opacity-100">
                                                <button onClick={() => onToggleIndicatorVisibility(i.id)} title={i.isVisible ? "Hide" : "Show"}>
                                                    {i.isVisible ? <EyeIcon className="w-4 h-4 text-gray-400 hover:text-white" /> : <EyeOffIcon className="w-4 h-4 text-gray-400 hover:text-white" />}
                                                </button>
                                                <button onClick={() => onDeleteIndicator(i.id)} title="Delete">
                                                    <TrashIcon className="w-4 h-4 text-gray-400 hover:text-red-400" />
                                                </button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

const OrderInput: React.FC<{
    label: string;
    value: string;
    onChange: (val: string) => void;
    onPlaceLine?: () => void;
    isPlacing?: boolean;
}> = ({ label, value, onChange, onPlaceLine, isPlacing }) => (
    <div className="flex items-center">
        <label className="w-16 text-gray-400 text-xs">{label}</label>
        <div className="relative flex-1">
            <input type="number" value={value} onChange={e => onChange(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-md p-2 text-sm text-right pr-8 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {onPlaceLine && (
                <button
                    onClick={onPlaceLine}
                    className={`absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-full ${isPlacing ? 'bg-blue-500 text-white animate-pulse' : 'text-gray-400 hover:text-white'}`}
                    title="Select on chart"
                >
                    <TargetIcon className="w-4 h-4" />
                </button>
            )}
        </div>
    </div>
);

const ForexOrderPanel: React.FC<{
    symbol: string;
    currentPrice: number;
    order: OrderDetails;
    setOrder: (order: OrderDetails) => void;
    placingOrderLine: PlacingOrderLine;
    onPlaceLine: (line: PlacingOrderLine) => void;
    onExecuteOrder: (side: TradeDirection, orderType: string) => void;
    accountBalance: number;
}> = ({ symbol, currentPrice, order, setOrder, placingOrderLine, onPlaceLine, onExecuteOrder, accountBalance }) => {
    const [activeTab, setActiveTab] = useState<'Market' | 'Limit' | 'Stop'>('Market');

    const handleQuantityChange = (delta: number) => {
        const currentQty = parseFloat(order.quantity) || 0;
        const newQty = Math.max(0.01, parseFloat((currentQty + delta * 0.01).toFixed(2)));
        setOrder({ ...order, quantity: newQty.toString() });
    };

    const calculateLotsFromRisk = () => {
        const riskPercent = parseFloat(order.riskPercent);
        const slPrice = parseFloat(order.sl);
        if (isNaN(riskPercent) || isNaN(slPrice) || slPrice === 0 || currentPrice === 0 || accountBalance <= 0) return;

        const riskAmount = accountBalance * (riskPercent / 100);
        const pipsToSl = Math.abs(currentPrice - slPrice);
        const pipValuePerLot = 10;
        const lots = riskAmount / (pipsToSl * 10000 * pipValuePerLot);
        setOrder({ ...order, quantity: Math.max(0.01, parseFloat(lots.toFixed(2))).toString() });
    };

    return (
        <div className="p-4 space-y-4 text-sm">
            <div className="grid grid-cols-3 gap-1 bg-gray-900 p-1 rounded-md text-xs mb-2">
                {['Market', 'Limit', 'Stop'].map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab as any)} className={`py-1.5 rounded ${activeTab === tab ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700/50'}`}>{tab}</button>
                ))}
            </div>
            <div className="flex items-center justify-center gap-3 py-2">
                <button onClick={() => handleQuantityChange(-1)} className="p-2 bg-gray-800 hover:bg-gray-700 rounded-full"><MinusIcon className="w-4 h-4" /></button>
                <div className="flex flex-col items-center">
                    <input type="number" value={order.quantity} onChange={e => setOrder({ ...order, quantity: e.target.value })} className="w-24 text-center bg-gray-800 border border-gray-700 rounded-md p-1.5 text-base font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    <span className="text-gray-400 text-[10px] uppercase mt-0.5">Lots</span>
                </div>
                <button onClick={() => handleQuantityChange(1)} className="p-2 bg-gray-800 hover:bg-gray-700 rounded-full"><PlusIcon className="w-4 h-4" /></button>
            </div>

            {activeTab !== 'Market' && (
                <OrderInput label="Price" value={order.price} onChange={val => setOrder({ ...order, price: val })} />
            )}

            <div className="space-y-3 pt-2 border-t border-gray-800">
                <OrderInput label="Take Profit" value={order.tp} onChange={val => setOrder({ ...order, tp: val })} onPlaceLine={() => onPlaceLine('tp')} isPlacing={placingOrderLine === 'tp'} />
                <OrderInput label="Stop Loss" value={order.sl} onChange={val => setOrder({ ...order, sl: val })} onPlaceLine={() => onPlaceLine('sl')} isPlacing={placingOrderLine === 'sl'} />

                <div className="flex items-center pt-2">
                    <label className="w-16 text-gray-400 text-xs">Risk %</label>
                    <input type="number" step="0.1" value={order.riskPercent} onChange={e => setOrder({ ...order, riskPercent: e.target.value })} className="flex-1 bg-gray-800 border border-gray-700 rounded-md p-2 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    <button onClick={calculateLotsFromRisk} className="ml-2 text-xs bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-md transition-colors">Calc</button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-4">
                <button onClick={() => onExecuteOrder(TradeDirection.SELL, activeTab)} className="w-full bg-red-500/90 hover:bg-red-500 rounded-lg p-3 text-center transition-colors">
                    <div className="font-bold text-white">Sell</div>
                    <div className="text-xs font-mono text-red-100">{currentPrice.toFixed(5)}</div>
                </button>
                <button onClick={() => onExecuteOrder(TradeDirection.BUY, activeTab)} className="w-full bg-green-500/90 hover:bg-green-500 rounded-lg p-3 text-center transition-colors">
                    <div className="font-bold text-white">Buy</div>
                    <div className="text-xs font-mono text-green-100">{currentPrice.toFixed(5)}</div>
                </button>
            </div>
        </div>
    );
};

const LeverageSelector: React.FC<{
    leverage: number;
    marginMode: 'Cross' | 'Isolated';
    onChange: (leverage: number, marginMode: 'Cross' | 'Isolated') => void;
}> = ({ leverage, marginMode, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useOutsideAlerter(ref, () => setIsOpen(false));

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-1 bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded text-xs text-gray-300 transition-colors border border-gray-700"
            >
                <span className={`font-semibold ${marginMode === 'Cross' ? 'text-yellow-500' : 'text-purple-400'}`}>{marginMode}</span>
                <span className="text-gray-400">|</span>
                <span className="font-bold text-white">{leverage}x</span>
            </button>

            {isOpen && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-4 z-50">
                    <h4 className="text-sm font-bold text-gray-200 mb-3">Adjust Leverage</h4>
                    <div className="flex bg-gray-900 rounded p-1 mb-4">
                        {['Cross', 'Isolated'].map(mode => (
                            <button
                                key={mode}
                                onClick={() => onChange(leverage, mode as any)}
                                className={`flex-1 py-1 text-xs font-semibold rounded ${marginMode === mode ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                {mode}
                            </button>
                        ))}
                    </div>

                    <div className="mb-4">
                        <div className="flex justify-between text-xs text-gray-400 mb-2">
                            <span>1x</span>
                            <span className="text-blue-400 font-bold text-lg">{leverage}x</span>
                            <span>125x</span>
                        </div>
                        <input
                            type="range"
                            min="1"
                            max="125"
                            step="1"
                            value={leverage}
                            onChange={(e) => onChange(parseInt(e.target.value), marginMode)}
                            className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400"
                        />
                    </div>

                    <button
                        onClick={() => setIsOpen(false)}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2 rounded transition-colors"
                    >
                        Confirm
                    </button>
                </div>
            )}
        </div>
    );
};

const CryptoOrderPanel: React.FC<{
    symbol: string;
    currentPrice: number;
    order: OrderDetails;
    setOrder: (order: OrderDetails) => void;
    placingOrderLine: PlacingOrderLine;
    onPlaceLine: (line: PlacingOrderLine) => void;
    onExecuteOrder: (side: TradeDirection, orderType: string) => void;
    accountBalance: number;
}> = ({ symbol, currentPrice, order, setOrder, placingOrderLine, onPlaceLine, onExecuteOrder, accountBalance }) => {
    const [activeTab, setActiveTab] = useState<'Market' | 'Limit' | 'Stop'>('Market');
    const [showTpSl, setShowTpSl] = useState(false);
    const baseAsset = symbol.split('/')[0];
    const quoteAsset = symbol.split('/')[1] || 'USDT';

    // Ensure expanded Type fields exist if undefined (fallback)
    const leverage = order.leverage || 20;
    const marginMode = order.marginMode || 'Cross';

    const handlePercentClick = (percent: number) => {
        if (!currentPrice) return;
        const balanceToUse = accountBalance * (percent / 100);
        // Effective purchasing power = Balance * Leverage
        // Logic: Quantity = (Balance * Leverage * %) / Price
        // Using generic simple logic for now:
        const maxValue = balanceToUse * leverage;
        const qty = maxValue / currentPrice;
        setOrder({ ...order, quantity: qty.toFixed(5) });
    };

    const cost = useMemo(() => {
        const qty = parseFloat(order.quantity) || 0;
        const price = activeTab === 'Market' ? currentPrice : (parseFloat(order.price) || currentPrice);
        if (!price || !qty) return 0;
        // Cost = (Price * Qty) / Leverage
        return (price * qty) / leverage;
    }, [order.quantity, order.price, currentPrice, activeTab, leverage]);

    const isValid = cost > 0 && cost <= accountBalance;

    return (
        <div className="flex flex-col h-full bg-gray-900 text-sm">
            {/* Header: Margin Mode & Leverage */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
                <span className="text-xs font-bold text-gray-500">{activeTab} Order</span>
                <LeverageSelector
                    leverage={leverage}
                    marginMode={marginMode}
                    onChange={(l, m) => setOrder({ ...order, leverage: l, marginMode: m })}
                />
            </div>

            <div className="p-4 space-y-5 overflow-y-auto custom-scrollbar flex-1">
                {/* Tabs */}
                <div className="flex bg-gray-800/50 p-0.5 rounded-lg">
                    {['Limit', 'Market', 'Stop'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab as any)}
                            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${activeTab === tab ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {/* Available Balance */}
                <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-500">Avail.</span>
                    <div className="flex items-center gap-1 text-gray-300">
                        <span>{accountBalance.toLocaleString()} {quoteAsset}</span>
                        <button className="text-blue-500 hover:text-blue-400 bg-blue-500/10 rounded-full p-0.5"><PlusIcon className="w-3 h-3" /></button>
                    </div>
                </div>

                {/* Input Fields */}
                <div className="space-y-3">
                    {/* Price Input (Hidden for Market) */}
                    {activeTab !== 'Market' && (
                        <div className="bg-gray-800 rounded-lg px-3 py-2 flex items-center border border-gray-700 focus-within:border-blue-500 transition-colors">
                            <span className="text-gray-500 text-xs w-12">Price</span>
                            <input
                                type="number"
                                placeholder="Price"
                                value={order.price}
                                onChange={e => setOrder({ ...order, price: e.target.value })}
                                className="bg-transparent flex-1 text-right text-gray-200 focus:outline-none placeholder-gray-600 font-mono"
                            />
                            <span className="text-gray-500 text-xs ml-2">{quoteAsset}</span>
                        </div>
                    )}

                    {/* Quantity Input */}
                    <div className="bg-gray-800 rounded-lg px-3 py-2 flex items-center border border-gray-700 focus-within:border-blue-500 transition-colors">
                        <span className="text-gray-500 text-xs w-12">Size</span>
                        <input
                            type="number"
                            placeholder="Amount"
                            value={order.quantity}
                            onChange={e => setOrder({ ...order, quantity: e.target.value })}
                            className="bg-transparent flex-1 text-right text-gray-200 focus:outline-none placeholder-gray-600 font-mono"
                        />
                        <span className="text-gray-500 text-xs ml-2">{baseAsset}</span>
                    </div>

                    {/* Percent Slider */}
                    <div className="grid grid-cols-4 gap-2">
                        {[25, 50, 75, 100].map(pct => (
                            <button
                                key={pct}
                                onClick={() => handlePercentClick(pct)}
                                className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded py-1 text-[10px] text-gray-400 hover:text-white transition-colors"
                            >
                                {pct}%
                            </button>
                        ))}
                    </div>

                    {/* TP/SL Toggle */}
                    <div className="pt-2">
                        <label className="flex items-center gap-2 cursor-pointer mb-2">
                            <input
                                type="checkbox"
                                checked={showTpSl}
                                onChange={e => setShowTpSl(e.target.checked)}
                                className="rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-0 w-3 h-3"
                            />
                            <span className="text-xs text-gray-400">TP/SL</span>
                        </label>

                        {showTpSl && (
                            <div className="space-y-2 pl-2 border-l-2 border-gray-800 ml-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-gray-500 w-8">TP</span>
                                    <input
                                        type="number"
                                        placeholder="Take Profit"
                                        value={order.tp}
                                        onChange={e => setOrder({ ...order, tp: e.target.value })}
                                        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs flex-1 focus:border-blue-500 focus:outline-none"
                                    />
                                    <button onClick={() => onPlaceLine('tp')} className={`p-1 rounded hover:bg-gray-700 ${placingOrderLine === 'tp' ? 'text-blue-500' : 'text-gray-500'}`}><TargetIcon className="w-3 h-3" /></button>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-gray-500 w-8">SL</span>
                                    <input
                                        type="number"
                                        placeholder="Stop Loss"
                                        value={order.sl}
                                        onChange={e => setOrder({ ...order, sl: e.target.value })}
                                        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs flex-1 focus:border-blue-500 focus:outline-none"
                                    />
                                    <button onClick={() => onPlaceLine('sl')} className={`p-1 rounded hover:bg-gray-700 ${placingOrderLine === 'sl' ? 'text-blue-500' : 'text-gray-500'}`}><TargetIcon className="w-3 h-3" /></button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Advanced Options (Reduce Only) */}
                    {activeTab !== 'Market' && (
                        <div className="flex items-center gap-4 pt-1">
                            <label className="flex items-center gap-1.5 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    checked={order.reduceOnly}
                                    onChange={e => setOrder({ ...order, reduceOnly: e.target.checked })}
                                    className="rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-0 w-3 h-3"
                                />
                                <span className="text-[10px] text-gray-500 group-hover:text-gray-300">Reduce Only</span>
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    checked={order.postOnly}
                                    onChange={e => setOrder({ ...order, postOnly: e.target.checked })}
                                    className="rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-0 w-3 h-3"
                                />
                                <span className="text-[10px] text-gray-500 group-hover:text-gray-300">Post Only</span>
                            </label>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer: Buy/Sell Buttons */}
            <div className="border-t border-gray-800 p-4 bg-gray-900 z-10">
                <div className="flex justify-between text-[10px] text-gray-500 mb-2">
                    <span>Cost</span>
                    <span className="font-mono">{cost.toFixed(2)} {quoteAsset}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <button
                        onClick={() => onExecuteOrder(TradeDirection.BUY, activeTab)}
                        disabled={!isValid}
                        className="w-full bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg py-2.5 transition-colors group relative overflow-hidden"
                    >
                        <span className="relative z-10 font-bold text-white text-sm">Buy / Long</span>
                    </button>
                    <button
                        onClick={() => onExecuteOrder(TradeDirection.SELL, activeTab)}
                        disabled={!isValid}
                        className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg py-2.5 transition-colors group relative overflow-hidden"
                    >
                        <span className="relative z-10 font-bold text-white text-sm">Sell / Short</span>
                    </button>
                </div>
            </div>
        </div>
    );
};


const OrderPanel: React.FC<{
    onClose: () => void;
    symbol: string;
    currentPrice: number;
    order: OrderDetails;
    setOrder: (order: OrderDetails) => void;
    placingOrderLine: PlacingOrderLine;
    onPlaceLine: (line: PlacingOrderLine) => void;
    onExecuteOrder: (side: TradeDirection, orderType: string) => void;
    assetType: 'Forex' | 'Crypto';
    forexAccountBalance: number;
    cryptoAccountBalance: number;
}> = (props) => {
    return (
        <div className="w-full h-full flex flex-col text-white bg-gray-900">
            <div className="flex items-center justify-between p-3 border-b border-gray-700/50">
                <h3 className="font-semibold">Order Panel</h3>
                <button onClick={props.onClose} className="text-gray-400 hover:text-white"><CloseIcon className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
                {props.assetType === 'Forex' ? (
                    <ForexOrderPanel {...props} accountBalance={props.forexAccountBalance} />
                ) : (
                    <CryptoOrderPanel {...props} accountBalance={props.cryptoAccountBalance} />
                )}
            </div>
        </div>
    );
};





export interface SidePanelsProps {
    panel: 'watchlist' | 'alerts' | 'dataWindow' | 'orderPanel' | 'objectTree' | null;
    onClose: () => void;
    hoveredCandle: Candle | null;
    symbol: string;
    onSymbolSelect: (symbol: string) => void;
    drawings: Drawing[];
    indicators: Indicator[];
    onDeleteDrawing: (id: string) => void;
    onToggleDrawingVisibility: (id: string) => void;
    onDeleteIndicator: (id: string) => void;
    onToggleIndicatorVisibility: (id: string) => void;
    currentPrice: number;
    order: OrderDetails;
    setOrder: (order: OrderDetails) => void;
    placingOrderLine: PlacingOrderLine;
    onPlaceLine: (line: PlacingOrderLine) => void;
    onExecuteOrder: (side: TradeDirection, orderType: string) => void;
    assetType: 'Forex' | 'Crypto';
    forexAccountBalance: number;
    cryptoAccountBalance: number;
}


export const SidePanels: React.FC<SidePanelsProps> = (props) => {
    // Wrapper component to handle content selection
    const renderPanel = () => {
        switch (props.panel) {
            case 'watchlist': return <WatchlistPanel onClose={props.onClose} onSymbolSelect={props.onSymbolSelect} symbol={props.symbol} />;
            case 'alerts': return <AlertsPanel onClose={props.onClose} />;
            case 'dataWindow': return <DataWindowPanel onClose={props.onClose} hoveredCandle={props.hoveredCandle} symbol={props.symbol} />;
            case 'objectTree': return <ObjectTreePanel onClose={props.onClose} drawings={props.drawings} indicators={props.indicators} onDeleteDrawing={props.onDeleteDrawing} onToggleDrawingVisibility={props.onToggleDrawingVisibility} onDeleteIndicator={props.onDeleteIndicator} onToggleIndicatorVisibility={props.onToggleIndicatorVisibility} />;
            case 'orderPanel': return <OrderPanel onClose={props.onClose} symbol={props.symbol} currentPrice={props.currentPrice} order={props.order} setOrder={props.setOrder} placingOrderLine={props.placingOrderLine} onPlaceLine={props.onPlaceLine} onExecuteOrder={props.onExecuteOrder} assetType={props.assetType} forexAccountBalance={props.forexAccountBalance} cryptoAccountBalance={props.cryptoAccountBalance} />;

            default: return null;
        }
    };

    return (
        <div className="h-full w-full bg-gray-900 flex flex-col" onWheel={(e) => e.stopPropagation()}>
            {renderPanel()}
        </div>
    );
};
