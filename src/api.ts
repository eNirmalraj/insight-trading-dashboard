// api.ts
// Thin interface layer - routes to mock or real backend based on environment

import { GoogleGenAI, Chat } from "@google/genai";
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


// --- AI Assistant API ---
// Note: This stays in api.ts as it uses external service (Gemini) directly

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

let chatSession: Chat | null = null;

const getChatSession = () => {
    if (!chatSession) {
        chatSession = ai.chats.create({
            model: 'gemini-2.5-flash',
            config: {
                systemInstruction: `You are the 'Insight Assistant', a helpful guide for the 'Insight Trading' web application. Your sole purpose is to assist users in understanding and using the platform's features.

You are an expert on:
- The Overview dashboard and its metrics.
- The Market chart, including its drawing tools and indicators.
- Creating and managing Watchlists and adding symbols.
- Understanding and executing trading Signals.
- Using the Market Screener to find assets.
- Interpreting data on the Account Metrics and Position Monitoring pages.
- Setting up and managing Alerts.
- Configuring user Settings, including API keys.

You MUST NOT provide any financial advice, market analysis, predictions, or general information outside of the website's functionality. If asked, politely decline and redirect the user to a feature on the platform.

Your responses should be concise, clear, and action-oriented. Guide users on where to click and what to look for. Use markdown for lists and to emphasize feature names or button texts.`,
            },
        });
    }
    return chatSession;
}

export const getAssistantResponse = async (message: string): Promise<string> => {
    try {
        const chat = getChatSession();
        const result = await chat.sendMessage({ message });
        return result.text;
    } catch (error) {
        console.error("Gemini API Error:", error);
        chatSession = null;
        return "I'm having trouble connecting to my brain right now. Please try again in a moment.";
    }
};

export const getStrategyAssistantResponse = async (userPrompt: string, currentJson: string): Promise<string> => {
    try {
        const strategyChat = ai.chats.create({
            model: 'gemini-2.0-flash',
            config: {
                systemInstruction: `You are a specialized Trading Strategy AI.
Your task is to generate or modify trading strategy JSON configurations based on user language.
Input: User Prompt + Current JSON (if any).
Output: PURE JSON ONLY. No explanation text outside the JSON. The JSON must adhere to this structure:
{
  "name": string,
  "description": string,
  "timeframe": string (5m, 15m, 1H, 4H, 1D),
  "symbolScope": string[] (e.g. ["EURUSD", "BTCUSDT"]),
  "indicators": [{ "id": string, "type": string, "parameters": object }],
  "entryRules": [{ "condition": string, "type": "BUY"|"SELL" }],
  "exitRules": [{ "condition": string, "type": "stop_loss"|"take_profit"|"signal" }],
  "isActive": boolean
}
Modify the input JSON if provided, or create new. Ensure the logic makes sense. Use valid technical indicators (RSI, SMA, EMA, MACD, Bollinger).`
            }
        });

        const message = `User Request: ${userPrompt}\n\nCurrent JSON:\n${currentJson}`;
        const result = await strategyChat.sendMessage({ message });
        // Clean up markdown code blocks if present
        let cleanText = result.text.trim();
        if (cleanText.startsWith('```json')) {
            cleanText = cleanText.replace(/^```json/, '').replace(/```$/, '');
        } else if (cleanText.startsWith('```')) {
            cleanText = cleanText.replace(/^```/, '').replace(/```$/, '');
        }
        return cleanText.trim();
    } catch (error) {
        console.error("Strategy AI Error:", error);
        throw new Error("Failed to generate strategy.");
    }
};
