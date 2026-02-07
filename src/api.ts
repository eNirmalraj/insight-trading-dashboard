// api.ts
// Thin interface layer - routes to mock or real backend based on environment

import { supabase, isSupabaseConfigured } from './services/supabaseClient';
import * as watchlistService from './services/watchlistService';
import * as positionService from './services/positionService';
import * as signalService from './services/signalService';
import * as accountService from './services/accountService';
import * as marketDataService from './services/marketDataService';
import * as authService from './services/authService';
import {
    Metric, Signal, Watchlist, Alert, Position, UpcomingInfo, Suggestion,
    PositionStatus, TradeDirection, AlertStatus, WatchlistItem
} from './types';

// Re-export all API functions - these route REAL services.
// Mock API Mode is DELETED.

// --- Overview Page ---
// Legacy individual metric getters - redirected to account service equivalent or stubs
export const getForexMetrics = async (): Promise<Metric[]> => accountService.getAccountMetrics('Forex');
export const getBinanceMetrics = async (): Promise<Metric[]> => accountService.getAccountMetrics('Binance');
export const getPerformanceChartData = async (): Promise<any[]> => []; // TODO: Implement Performance Service
export const getUpcomingInfo = async (): Promise<UpcomingInfo[]> => [];
export const getSuggestions = async (): Promise<Suggestion[]> => [];

// --- Market Page ---
export const getHistoricalData = (symbol: string, timeframe: string) =>
    marketDataService.getCandles(symbol, timeframe);

// --- Signals Page ---
// --- Signals Page ---
export const getSignals = () => signalService.getSignals();
export const toggleSignalPin = (signalId: string, isPinned: boolean) => signalService.toggleSignalPin(signalId, isPinned);

// --- Watchlist API ---
export const getWatchlists = () => watchlistService.getWatchlists();
export const createWatchlist = (name: string, accountType: 'Forex' | 'Crypto', strategyType: string) =>
    watchlistService.createWatchlist(name, accountType, strategyType);
export const updateWatchlist = (id: string, data: { name: string, strategyType?: string }) =>
    watchlistService.updateWatchlist(id, data);
export const deleteWatchlist = (id: string) => watchlistService.deleteWatchlist(id);
export const addSymbolToWatchlist = (watchlistId: string, symbol: string) =>
    watchlistService.addSymbol(watchlistId, symbol);
export const removeSymbolFromWatchlist = (watchlistId: string, symbolId: string) =>
    watchlistService.removeSymbol(watchlistId, symbolId);
export const toggleAutoTrade = (payload: { watchlistId: string; itemId?: string; isEnabled: boolean }) =>
    watchlistService.toggleAutoTrade({ scriptId: payload.watchlistId, itemId: payload.itemId, isEnabled: payload.isEnabled });

// --- Scripts API (routed through watchlistService) ---
export const getScripts = () => watchlistService.getWatchlists();
export const createScript = (name: string, accountType: 'Forex' | 'Crypto', strategyType: string) =>
    watchlistService.createWatchlist(name, accountType, strategyType);
export const updateScript = (id: string, data: { name: string, strategyType?: string }) =>
    watchlistService.updateWatchlist(id, data);
export const deleteScript = (id: string) => watchlistService.deleteWatchlist(id);
export const addSymbolToScript = (scriptId: string, symbol: string) =>
    watchlistService.addSymbol(scriptId, symbol);
export const removeSymbolFromScript = (scriptId: string, symbolId: string) =>
    watchlistService.removeSymbol(scriptId, symbolId);
export const toggleScriptAutoTrade = (payload: { scriptId: string; itemId?: string; isEnabled: boolean }) =>
    watchlistService.toggleAutoTrade(payload);

// --- Positions API (routed through positionService) ---
export const getPositions = () => positionService.getPositions();
export const updatePosition = (id: string, data: { sl: number; tp: number }) =>
    positionService.updatePosition(id, data);
export const closePosition = (id: string, closingPrice: number) =>
    positionService.closePosition(id, closingPrice);
export const cancelPosition = (id: string) => positionService.cancelPosition(id);
export const reversePosition = (id: string, closingPrice: number) =>
    positionService.reversePosition(id, closingPrice);
export const createPosition = (position: Omit<Position, 'id'>) =>
    positionService.createPosition(position);

// --- Alerts API ---
export const getAlerts = async (): Promise<Alert[]> => []; // TODO: Implement AlertService
export const createPriceAlert = async (alertData: Omit<Alert, 'id' | 'timestamp'>) => { console.log('Create Alert:', alertData); };

// --- Account Metrics API ---
export const getAccountMetrics = (accountType: 'Forex' | 'Binance') =>
    accountService.getAccountMetrics(accountType);
export const getDetailedMetrics = (accountType: 'Forex' | 'Binance') =>
    accountService.getDetailedMetrics(accountType);
export const getBalanceHistory = (accountType: 'Forex' | 'Binance') =>
    accountService.getBalanceHistory(accountType);
export const getTradeHistory = () => accountService.getTradeHistory();
export const getStrategyPerformanceData = () => accountService.getStrategyPerformanceData();

// --- Education API ---
export const getEducationContent = async () => [];

// --- Settings API ---
// --- Settings API ---
export const getSettings = async (): Promise<any> => ({});
export const saveSettings = async (settings: any) => { console.log('Save Settings:', settings); };
export const getUserSettings = () => authService.getUserSettings();
export const updateUserSettings = (settings: any) => authService.updateUserSettings(settings);




export const getPaperTrades = async () => {
    if (!isSupabaseConfigured()) return [];

    const { data, error } = await supabase
        .from('paper_trades')
        .select('*')
        .order('filled_at', { ascending: false });

    if (error) {
        console.error("Error fetching paper trades:", error);
        return [];
    }
    return data;
};
