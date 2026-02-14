import React, { useState, useEffect, useCallback } from 'react';
import { Watchlist, WatchlistItem, AccountType } from '../types';
import { PencilIcon, WatchlistIcon, TrashIcon, PlusCircleIcon } from '../components/IconComponents';
import CreatePriceAlertModal from '../components/CreatePriceAlertModal';
import CreateScriptInline from '../components/CreateScriptInline';
import EditWatchlistNameModal from '../components/EditWatchlistNameModal';
import SymbolSearchModal from '../components/market-chart/SymbolSearchModal'; // Replaced AddSymbolModal
import ConfirmationModal from '../components/ConfirmationModal';

// import { PaperTradesPanel } from '../components/PaperTradesPanel'; // Removed
import * as api from '../api';
import { updateWatchlistItemRiskSettings } from '../services/watchlistService';
import Loader from '../components/Loader';


const WatchlistPage: React.FC = () => {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal States
  const [alertModalInfo, setAlertModalInfo] = useState<{ visible: boolean; symbol: string; price: number } | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingWatchlist, setEditingWatchlist] = useState<Watchlist | null>(null);
  const [addingToWatchlist, setAddingToWatchlist] = useState<Watchlist | null>(null);
  const [confirmModalState, setConfirmModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => { } });

  const fetchWatchlists = useCallback(async () => {
    try {
      setIsLoading(true);
      // Fetch SCRIPTS instead of Watchlists
      const data = await api.getScripts();
      setWatchlists(data);
      setError(null);
    } catch (err) {
      setError("Failed to load scripts.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWatchlists();
  }, [fetchWatchlists]);

  const handleConfirmCreateWatchlist = async (name: string, accountType: AccountType | 'Forex' | 'Crypto', strategy: string, tradingMode: 'paper' | 'live') => {
    const normalizedName = name.trim().toLowerCase();
    if (watchlists.some(wl => wl.name.trim().toLowerCase() === normalizedName)) {
      alert(`A script with the name "${name}" already exists. Please choose a different name.`);
      return;
    }

    try {
      await api.createScript(name, accountType, strategy, tradingMode);
      fetchWatchlists();
      setIsCreateModalOpen(false);
    } catch (err) {
      alert("Error creating script. Please try again.");
    }
  };

  const handleEditWatchlist = (watchlistId: string) => {
    const watchlistToEdit = watchlists.find(wl => wl.id === watchlistId);
    if (watchlistToEdit) {
      setEditingWatchlist(watchlistToEdit);
    }
  };

  const handleConfirmEditWatchlist = async (
    newName: string,
    newStrategy: string,
    newTradingMode: 'paper' | 'live',
    riskSettings: {
      lotSize: number;
      riskPercent: number;
      leverage: number;
      stopLossDistance: number;
      takeProfitDistance: number;
      trailingStopLossDistance: number;
    },
    executionTimeframes?: string[],
    manualRiskEnabled?: boolean,
    marketType?: 'spot' | 'futures',
    riskMethod?: 'fixed' | 'percent',
    autoLeverageEnabled?: boolean
  ) => {
    if (!editingWatchlist) return;
    try {
      await api.updateScript(editingWatchlist.id, {
        name: newName,
        strategyType: newStrategy,
        tradingMode: newTradingMode,
        executionTimeframes,
        manualRiskEnabled,
        marketType,
        riskMethod,
        autoLeverageEnabled,
        ...riskSettings
      });
      fetchWatchlists();
      setEditingWatchlist(null);
    } catch (err) {
      alert("Error updating script. Please try again.");
    }
  };

  const handleAddSymbol = (watchlistId: string) => {
    const watchlistToAdd = watchlists.find(wl => wl.id === watchlistId);
    if (watchlistToAdd) {
      setAddingToWatchlist(watchlistToAdd);
    }
  };

  const handleConfirmAddSymbol = async (symbol: string) => {
    if (!addingToWatchlist) return;

    // Optimistic Update
    const tempId = `temp-${Date.now()}`;
    const newItem: WatchlistItem = {
      id: tempId,
      symbol: symbol,
      price: 0,
      change: 0,
      changePercent: 0,
      isPositive: true,
      autoTradeEnabled: false
    };

    setWatchlists(prev => prev.map(wl => {
      if (wl.id !== addingToWatchlist.id) return wl;
      // Prevent duplicates in state if user clicks fast
      if (wl.items.some(i => i.symbol === symbol)) return wl;
      return { ...wl, items: [...wl.items, newItem] };
    }));

    try {
      await api.addSymbolToScript(addingToWatchlist.id, symbol);
      fetchWatchlists();
      // NOTE: We no longer setAddingToWatchlist(null) here to keep modal open
    } catch (err: any) {
      // Revert on error
      setWatchlists(prev => prev.map(wl => {
        if (wl.id !== addingToWatchlist.id) return wl;
        return { ...wl, items: wl.items.filter(i => i.id !== tempId) };
      }));
      alert(`Error: ${err.message || 'Could not add symbol.'}`);
    }
  };


  const handleRemoveSymbol = (watchlistId: string, symbolId: string, symbolName: string) => {
    setConfirmModalState({
      isOpen: true,
      title: 'Remove Symbol',
      message: `Are you sure you want to remove ${symbolName} from this script?`,
      onConfirm: async () => {
        try {
          await api.removeSymbolFromScript(watchlistId, symbolId);
          fetchWatchlists();
        } catch (err) {
          alert("Error removing symbol. Please try again.");
        }
      }
    });
  };

  const handleDeleteWatchlist = (watchlistId: string, watchlistName: string) => {
    setConfirmModalState({
      isOpen: true,
      title: 'Delete Script',
      message: `Are you sure you want to delete the "${watchlistName}" script? This action cannot be undone.`,
      onConfirm: async () => {
        try {
          await api.deleteScript(watchlistId);
          fetchWatchlists();
        } catch (err) {
          alert("Error deleting script. Please try again.");
        }
      }
    });
  };



  const handleToggleAutoTrade = async (watchlistId: string, itemId?: string) => {
    const watchlist = watchlists.find(wl => wl.id === watchlistId);
    if (!watchlist) return;

    let isEnabled;
    if (itemId) {
      const item = watchlist.items.find(i => i.id === itemId);
      if (!item) return;
      isEnabled = !(item.autoTradeEnabled ?? false);
    } else {
      isEnabled = !(watchlist.isMasterAutoTradeEnabled ?? false);
    }

    try {
      await api.toggleScriptAutoTrade({ scriptId: watchlistId, itemId, isEnabled });
      // Optimistic update for better UX, then refetch
      setWatchlists(prev => prev.map(wl => {
        if (wl.id !== watchlistId) return wl;
        if (itemId) {
          return {
            ...wl,
            items: wl.items.map(i => i.id === itemId ? { ...i, autoTradeEnabled: isEnabled } : i),
          };
        }
        return { ...wl, isMasterAutoTradeEnabled: isEnabled };
      }));
      fetchWatchlists();
    } catch (err) {
      alert("Error updating auto-trade status.");
      fetchWatchlists(); // Revert optimistic update on error
    }
  };

  if (isLoading) return <Loader />;
  if (error) return <div className="p-6 text-center text-red-400">{error}</div>;

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-end">
        <button
          onClick={() => setIsCreateModalOpen(!isCreateModalOpen)}
          className="bg-blue-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-600 transition-colors">
          {isCreateModalOpen ? 'Cancel' : '+ Create New Script'}
        </button>
      </div>

      {/* Inline Create Form */}
      {isCreateModalOpen && (
        <CreateScriptInline
          onCreate={handleConfirmCreateWatchlist}
          onCancel={() => setIsCreateModalOpen(false)}
        />
      )}

      <div className="space-y-8">
        {watchlists.length > 0 ? (
          watchlists.map((watchlist) => {
            const isMasterOn = watchlist.isMasterAutoTradeEnabled ?? false;
            const totalPnl = watchlist.items.reduce((acc, item) => acc + (item.pnl || 0), 0);
            const totalPnlSign = totalPnl >= 0 ? '+' : '';

            return (
              <div key={watchlist.id} className="bg-card-bg rounded-xl overflow-hidden">
                <div className="p-4 border-b border-gray-700 flex justify-between items-center flex-wrap gap-y-2 gap-x-4">
                  {/* Left Side */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="text-lg md:text-xl font-semibold text-white">{watchlist.name}</h2>
                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full text-white ${watchlist.accountType === AccountType.CRYPTO ? 'bg-yellow-500' :
                      watchlist.accountType === AccountType.INDIAN ? 'bg-orange-500' :
                        'bg-blue-500'
                      }`}>
                      {watchlist.accountType}
                    </span>
                    {watchlist.strategyType && (
                      <span className="px-2.5 py-1 text-xs font-medium rounded-full text-gray-300 bg-gray-600">
                        {watchlist.strategyType}
                      </span>
                    )}
                    {/* Trading Mode Badge */}
                    <span className={`px-2.5 py-1 text-xs font-bold rounded-full border ${watchlist.tradingMode === 'live'
                      ? 'bg-red-500/10 text-red-500 border-red-500/50'
                      : 'bg-blue-500/10 text-blue-400 border-blue-500/50'
                      }`}>
                      {watchlist.tradingMode === 'live' ? 'LIVE' : 'PAPER'}
                    </span>
                    <button
                      onClick={() => handleEditWatchlist(watchlist.id)}
                      className="text-gray-400 hover:text-blue-400 transition-colors p-1"
                      title="Edit script name and strategy"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </button>
                  </div>
                  {/* Right Side */}
                  <div className="flex items-center gap-4 flex-wrap justify-end">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-400">Total P/L</span>
                      <div className={`px-2.5 py-1 rounded-full text-sm font-semibold ${totalPnl >= 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                        {totalPnlSign}${totalPnl.toFixed(2)}
                      </div>
                    </div>
                    <div className="w-px h-6 bg-gray-700 hidden sm:block"></div>
                    <button
                      onClick={() => handleAddSymbol(watchlist.id)}
                      className="flex items-center gap-1.5 bg-gray-700 text-blue-400 font-semibold py-1.5 px-3 rounded-lg hover:bg-gray-600 transition-colors text-sm">
                      <PlusCircleIcon className="w-4 h-4" />
                      Add Symbol
                    </button>
                    <button
                      onClick={() => handleDeleteWatchlist(watchlist.id, watchlist.name)}
                      className="p-1.5 rounded-md text-red-400 hover:bg-red-500/20"
                      title="Delete script"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-gray-300">Master Auto Trade:</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={isMasterOn} onChange={() => handleToggleAutoTrade(watchlist.id)} className="sr-only peer" />
                        <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                      </label>
                    </div>
                  </div>
                </div>
                {/* Desktop Table */}
                <div className="overflow-x-auto hidden md:block">
                  <table className="w-full text-sm text-left min-w-[720px]">
                    <thead className="text-xs text-gray-400 uppercase bg-card-bg/50">
                      <tr>
                        <th scope="col" className="px-6 py-3">Symbol</th>
                        <th scope="col" className="px-6 py-3">Price</th>
                        <th scope="col" className="px-6 py-3">Change</th>
                        <th scope="col" className="px-6 py-3">% Change</th>
                        <th scope="col" className="px-6 py-3">P/L</th>
                        <th scope="col" className="px-6 py-3 text-center">Auto Trade</th>
                        <th scope="col" className="px-6 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {watchlist.items.length > 0 ? (
                        watchlist.items.map((item) => (
                          <tr key={item.id} className="border-b border-gray-700 last:border-b-0 hover:bg-gray-700/50">
                            <td className="px-6 py-4 font-medium text-white">{item.symbol}</td>
                            <td className={`px-6 py-4 font-medium ${item.isPositive ? 'text-green-400' : 'text-red-400'}`}>{item.price}</td>
                            <td className={`px-6 py-4 ${item.isPositive ? 'text-green-400' : 'text-red-400'}`}>{typeof item.change === 'number' ? item.change.toFixed(4) : 'N/A'}</td>
                            <td className={`px-6 py-4 ${item.isPositive ? 'text-green-400' : 'text-red-400'}`}>{typeof item.changePercent === 'number' ? item.changePercent.toFixed(2) : 'N/A'}%</td>
                            <td className="px-6 py-4 font-medium">
                              {item.pnl != null ? (
                                <span className={`inline-block px-2.5 py-0.5 text-xs font-semibold rounded-full ${item.pnl >= 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                                  {item.pnl >= 0 ? '+' : ''}${item.pnl.toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-gray-500">—</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <label className={`relative inline-flex items-center ${isMasterOn ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                                <input
                                  type="checkbox"
                                  checked={item.autoTradeEnabled ?? false}
                                  onChange={() => handleToggleAutoTrade(watchlist.id, item.id)}
                                  className="sr-only peer"
                                  disabled={!isMasterOn}
                                />
                                <div className="w-9 h-5 bg-gray-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500 peer-disabled:bg-gray-700 peer-disabled:after:bg-gray-500"></div>
                              </label>
                            </td>
                            <td className="px-6 py-4">

                              <button onClick={() => setAlertModalInfo({ visible: true, symbol: item.symbol, price: item.price })} className="text-blue-500 hover:text-blue-400 mr-4 font-medium">Alert</button>
                              <button onClick={() => handleRemoveSymbol(watchlist.id, item.id, item.symbol)} className="text-red-500 hover:text-red-400 font-medium">Remove</button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="text-center py-8 text-gray-500">
                            This script is empty. Add a symbol to get started.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {/* Mobile Cards */}
                <div className="md:hidden p-4 space-y-3">
                  {watchlist.items.length > 0 ? (
                    watchlist.items.map(item => (
                      <div key={item.id} className="bg-gray-800 rounded-lg p-3">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h3 className="font-bold text-white">{item.symbol}</h3>
                            <p className={`font-medium ${item.isPositive ? 'text-green-400' : 'text-red-400'}`}>{item.price}</p>
                          </div>
                          <div className="text-right">
                            <p className={`font-medium ${item.isPositive ? 'text-green-400' : 'text-red-400'}`}>{typeof item.changePercent === 'number' ? item.changePercent.toFixed(2) : 'N/A'}%</p>
                            <p className={`text-xs ${item.isPositive ? 'text-green-400' : 'text-red-400'}`}>{typeof item.change === 'number' ? item.change.toFixed(4) : 'N/A'}</p>
                          </div>
                        </div>
                        <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-700">
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">P/L:</span>
                              {item.pnl != null ? (
                                <span className={`text-xs font-semibold ${item.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {item.pnl >= 0 ? '+' : ''}${item.pnl.toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-gray-500 text-xs">—</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">Auto:</span>
                              <label className={`relative inline-flex items-center ${isMasterOn ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                                <input type="checkbox" checked={item.autoTradeEnabled ?? false} onChange={() => handleToggleAutoTrade(watchlist.id, item.id)} className="sr-only peer" disabled={!isMasterOn} />
                                <div className="w-9 h-5 bg-gray-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                              </label>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-xs">

                            <button onClick={() => setAlertModalInfo({ visible: true, symbol: item.symbol, price: item.price })} className="text-blue-500 hover:text-blue-400 font-medium">Alert</button>
                            <button onClick={() => handleRemoveSymbol(watchlist.id, item.id, item.symbol)} className="text-red-500 hover:text-red-400 font-medium">Remove</button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500 text-sm">
                      This script is empty. Add a symbol to get started.
                    </div>
                  )}
                </div>
              </div>
            )
          })
        ) : (
          <div className="text-center py-16 px-6 bg-card-bg rounded-xl border border-dashed border-gray-700">
            <WatchlistIcon className="w-12 h-12 mx-auto text-gray-600" />
            <h3 className="mt-4 text-base md:text-lg font-semibold text-white">No Scripts Yet</h3>
            <p className="mt-2 text-sm text-gray-400">
              Create a script to manage your trading strategies and symbols.
            </p>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="mt-6 bg-blue-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-600 transition-colors">
              Create Your First Script
            </button>
          </div>
        )}
      </div>

      {/* Paper Trades Section Removed per user request */}

      {/* --- MODALS --- */}
      {alertModalInfo && (
        <CreatePriceAlertModal
          symbol={alertModalInfo.symbol}
          price={alertModalInfo.price}
          onClose={() => setAlertModalInfo(null)}
        />
      )}


      {editingWatchlist && (
        <EditWatchlistNameModal
          currentName={editingWatchlist.name}
          currentStrategy={editingWatchlist.strategyType}
          currentTradingMode={editingWatchlist.tradingMode}
          accountType={editingWatchlist.accountType as AccountType}
          currentRiskSettings={{
            lotSize: editingWatchlist.lotSize ?? 0.01,
            riskPercent: editingWatchlist.riskPercent ?? 1.0,
            leverage: editingWatchlist.leverage ?? 1,
            stopLossDistance: editingWatchlist.stopLossDistance ?? 0,
            takeProfitDistance: editingWatchlist.takeProfitDistance ?? 0,
            trailingStopLossDistance: editingWatchlist.trailingStopLossDistance ?? 0
          }}
          currentExecutionTimeframes={editingWatchlist.executionTimeframes}
          onClose={() => setEditingWatchlist(null)}
          onSave={handleConfirmEditWatchlist}
        />
      )}
      {addingToWatchlist && (
        <SymbolSearchModal
          isOpen={true}
          title={`Add Symbol to ${addingToWatchlist.name}`}
          onClose={() => setAddingToWatchlist(null)}
          onSymbolSelect={(symbol) => handleConfirmAddSymbol(symbol)}
          existingSymbols={addingToWatchlist?.items.map(i => i.symbol.replace('/', '')) || []}
          marketType={addingToWatchlist.marketType}
          defaultTab={
            addingToWatchlist.accountType === AccountType.CRYPTO ? 'Crypto' :
              addingToWatchlist.accountType === AccountType.FOREX ? 'Forex' :
                addingToWatchlist.accountType === AccountType.INDIAN ? 'All' : // Indian stocks map to 'All' or 'Stocks' if available
                  'All'
          }
          allowedTabs={
            addingToWatchlist.accountType === AccountType.CRYPTO ? ['Crypto'] :
              addingToWatchlist.accountType === AccountType.FOREX ? ['Forex'] :
                // For Indian, we might want to restrict or allow All. Letting 'All' be default for now.
                undefined
          }
        />
      )}
      <ConfirmationModal
        isOpen={confirmModalState.isOpen}
        onClose={() => setConfirmModalState({ ...confirmModalState, isOpen: false })}
        onConfirm={confirmModalState.onConfirm}
        title={confirmModalState.title}
        message={confirmModalState.message}
      />
    </div>
  );
};

export default WatchlistPage;