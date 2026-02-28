// src/engine/signalEngine.ts
// Automated Signal Generation Engine - Continuously monitors strategies and generates signals

import { getCandles } from '../services/marketDataService';
import { marketRealtimeService } from '../services/marketRealtimeService';
import { loadActiveStrategies, runAllStrategies, RiskSettings } from './strategyEngine';
import { getSignals, updateSignalStatus, cleanupOldSignals } from '../services/signalService';
import { getWatchlists } from '../services/watchlistService';
import { SignalStatus, EntryType } from '../types';
import { evaluateSignalAtPrice, checkEntryTrigger, normalizeSymbol } from '@insight/computation';
import type { SignalInput } from '@insight/computation';

// Engine configuration
const SIGNAL_GENERATION_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const SIGNAL_UPDATE_INTERVAL_MS = 1000; // 1 second (Faster SL/TP Monitoring)
const DEFAULT_CANDLE_COUNT = 200; // Number of candles to fetch for strategy evaluation

// Engine state
let signalGenerationTimerId: NodeJS.Timeout | null = null;
let signalUpdateTimerId: NodeJS.Timeout | null = null;
let isRunning = false;
let lastRunTime: Date | null = null;
let lastRunResult: EngineRunStats | null = null;

export interface EngineRunStats {
    timestamp: Date;
    signalsGenerated: number;
    strategiesEvaluated: number;
    symbolsProcessed: number;
    errors: string[];
    executionTimeMs: number;
}

export interface EngineStatus {
    isRunning: boolean;
    lastRunTime: Date | null;
    lastRunResult: EngineRunStats | null;
    nextRunTime: Date | null;
}

// Default symbols and timeframes to monitor
const DEFAULT_MONITOR_CONFIG = {
    symbols: ['BTCUSDT', 'EURUSD', 'GBPUSD', 'ETHUSD'],
    timeframes: ['1H', '4H'] // Fallback if no favorites set
};

/**
 * Get favorite timeframes from localStorage
 * Falls back to defaults if not set
 */
export const getFavoriteTimeframes = (): string[] => {
    try {
        const stored = localStorage.getItem('favoriteTimeframes');
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
                console.log(`[SignalEngine] Using favorite timeframes: ${parsed.join(', ')}`);
                return parsed;
            }
        }
    } catch (e) {
        console.error('[SignalEngine] Error reading favorite timeframes:', e);
    }
    console.log(`[SignalEngine] Using default timeframes: ${DEFAULT_MONITOR_CONFIG.timeframes.join(', ')}`);
    return DEFAULT_MONITOR_CONFIG.timeframes;
};

/**
 * Start the Signal Engine
 * Begins automated signal generation at regular intervals
 */
export const startSignalEngine = (): void => {
    if (isRunning) {
        console.log('[SignalEngine] Already running');
        return;
    }

    console.log('[SignalEngine] Starting...');
    isRunning = true;

    // Ensure real-time data connection
    marketRealtimeService.ensureConnection();

    // Run automated cleanup of old signals (Retention: 7 Days)
    cleanupOldSignals().catch(console.error);

    // Run immediately on start
    runSignalGeneration();

    // Schedule recurring runs
    signalGenerationTimerId = setInterval(() => {
        runSignalGeneration();
    }, SIGNAL_GENERATION_INTERVAL_MS);

    // Schedule signal status updates (more frequent)
    signalUpdateTimerId = setInterval(() => {
        updateSignalStatuses();
    }, SIGNAL_UPDATE_INTERVAL_MS);

    console.log('[SignalEngine] Started successfully');
};

/**
 * Stop the Signal Engine
 */
export const stopSignalEngine = (): void => {
    if (!isRunning) {
        console.log('[SignalEngine] Already stopped');
        return;
    }

    console.log('[SignalEngine] Stopping...');

    if (signalGenerationTimerId) {
        clearInterval(signalGenerationTimerId);
        signalGenerationTimerId = null;
    }

    if (signalUpdateTimerId) {
        clearInterval(signalUpdateTimerId);
        signalUpdateTimerId = null;
    }

    isRunning = false;
    console.log('[SignalEngine] Stopped');
};

/**
 * Get current engine status
 */
export const getEngineStatus = (): EngineStatus => {
    const nextRunTime = isRunning && lastRunTime
        ? new Date(lastRunTime.getTime() + SIGNAL_GENERATION_INTERVAL_MS)
        : null;

    return {
        isRunning,
        lastRunTime,
        lastRunResult,
        nextRunTime
    };
};

/**
 * Main signal generation function
 * Loads active strategies and generates signals for configured symbols
 */
export const runSignalGeneration = async (): Promise<EngineRunStats> => {
    const startTime = Date.now();
    const stats: EngineRunStats = {
        timestamp: new Date(),
        signalsGenerated: 0,
        strategiesEvaluated: 0,
        symbolsProcessed: 0,
        errors: [],
        executionTimeMs: 0
    };

    try {
        console.log('[SignalEngine] Running signal generation...');

        // Load all active strategies
        const strategies = await loadActiveStrategies();

        if (strategies.length === 0) {
            console.log('[SignalEngine] No active strategies found');
            stats.executionTimeMs = Date.now() - startTime;
            lastRunTime = stats.timestamp;
            lastRunResult = stats;
            return stats;
        }

        console.log(`[SignalEngine] Found ${strategies.length} active strategies`);
        stats.strategiesEvaluated = strategies.length;

        // Process each symbol/timeframe combination
        // DYNAMIC: Scan Top 150 Crypto pairs by volume (USDT/USD)
        let uniqueSymbols: Set<string> = new Set();

        try {
            const { fetchFuturesSymbols } = await import('../services/marketDataService'); // Dynamic import of Futures specific fetcher
            console.log('[SignalEngine] Fetching FUTURES symbols for market scan...');

            const futuresSymbols = await fetchFuturesSymbols();

            // Filter and Sort
            const topSymbols = futuresSymbols
                .filter(s => {
                    // Double check type (should be Crypto/Futures already)
                    if (s.type !== 'Crypto') return false;
                    if (s.market !== 'Futures') return false;

                    // Must be USDT or USD quote
                    return s.symbol.includes('USDT') || s.symbol.includes('USD');
                })
                .map(s => {
                    // EMERGENCY FIX: Ensure symbol has .P suffix
                    if (!s.symbol.endsWith('.P')) {
                        let base = s.symbol.replace('/', '').replace('USDT', '').replace('.P', '');
                        // Reconstruct standard format: BASE/USDT.P
                        const newSymbol = `${base}/USDT.P`;
                        return { ...s, symbol: newSymbol };
                    }
                    return s;
                })
                .sort((a, b) => b.volume - a.volume) // Sort by volume high to low
                .slice(0, 150); // Top 150 Futures Pairs

            topSymbols.forEach(s => uniqueSymbols.add(s.symbol));

            console.log('[SignalEngine] Top 5 Scan Targets:', Array.from(uniqueSymbols).slice(0, 5));

            if (uniqueSymbols.size === 0) {
                // Fallback to major pairs if fetch fails or returns empty
                ['BTC/USDT.P', 'ETH/USDT.P', 'BNB/USDT.P', 'SOL/USDT.P', 'XRP/USDT.P'].forEach(s => uniqueSymbols.add(s));
            }

        } catch (e) {
            console.error('Failed to load market symbols for engine:', e);
            ['BTC/USDT.P', 'ETH/USDT.P'].forEach(s => uniqueSymbols.add(s));
        }

        const symbols = Array.from(uniqueSymbols);

        // Use FAVORITE TIMEFRAMES from user preferences
        // This allows users to control which timeframes the engine scans
        const favoriteTimeframes = getFavoriteTimeframes();

        // Combine with strategy timeframes for complete coverage
        const activeTimeframes = new Set<string>(favoriteTimeframes);
        strategies.forEach(s => {
            // Only add strategy timeframe if it's in favorites (optional: remove this for strict favorite-only mode)
            if (s.timeframe && favoriteTimeframes.includes(s.timeframe)) {
                activeTimeframes.add(s.timeframe);
            }
        });

        // Fetch all watchlist items to get per-symbol risk settings
        let riskSettingsMap: Record<string, RiskSettings> = {};
        try {
            const allWatchlists = await getWatchlists();
            allWatchlists.forEach(wl => {
                wl.items.forEach(item => {
                    // Only use settings if auto-trade is enabled for this item
                    // Global Risk Settings from Watchlist apply to all items
                    if (item.autoTradeEnabled) {
                        riskSettingsMap[normalizeSymbol(item.symbol)] = {
                            lot_size: wl.lotSize,
                            risk_percent: wl.riskPercent,
                            take_profit_distance: wl.takeProfitDistance,
                            stop_loss_distance: wl.stopLossDistance,
                            trailing_stop_loss_distance: wl.trailingStopLossDistance,
                            leverage: wl.leverage
                        };
                    }
                });
            });
        } catch (e) {
            console.error('[SignalEngine] Failed to fetch risk settings:', e);
        }

        console.log(`[SignalEngine] Scanning ${symbols.length} symbols on FAVORITE timeframes: ${Array.from(activeTimeframes).join(', ')}...`);

        for (const symbol of symbols) {
            for (const timeframe of Array.from(activeTimeframes)) {
                try {
                    // Fetch candle data
                    const candles = await getCandles(symbol, timeframe, DEFAULT_CANDLE_COUNT);

                    if (candles.length === 0) {
                        stats.errors.push(`No candle data for ${symbol} ${timeframe}`);
                        continue;
                    }

                    // Run all strategies against this data
                    const normalizedSymbol = normalizeSymbol(symbol);
                    const riskSettings = riskSettingsMap[normalizedSymbol] || null;

                    const result = await runAllStrategies(symbol, timeframe, candles, strategies, riskSettings);

                    stats.signalsGenerated += result.signalsCreated;
                    stats.errors.push(...result.errors);

                    if (result.signalsCreated > 0) {
                        console.log(`[SignalEngine] Generated ${result.signalsCreated} signals for ${symbol} ${timeframe}`);
                    }

                } catch (error: any) {
                    const errorMsg = `Error processing ${symbol} ${timeframe}: ${error.message}`;
                    console.error(`[SignalEngine] ${errorMsg}`);
                    stats.errors.push(errorMsg);
                }
            }
            stats.symbolsProcessed++;
        }

        stats.executionTimeMs = Date.now() - startTime;
        console.log(`[SignalEngine] Generation complete. Signals created: ${stats.signalsGenerated}, Time: ${stats.executionTimeMs}ms`);

    } catch (error: any) {
        console.error('[SignalEngine] Fatal error:', error);
        stats.errors.push(`Fatal error: ${error.message}`);
        stats.executionTimeMs = Date.now() - startTime;
    }

    lastRunTime = stats.timestamp;
    lastRunResult = stats;
    return stats;
};

/**
 * Update status of existing signals based on current market prices
 * Phase 1: Check PENDING signals for entry triggers
 * Phase 2: Check ACTIVE signals for TP/SL hits
 */
export const updateSignalStatuses = async (): Promise<void> => {
    try {
        const signals = await getSignals();

        // Helper: fetch latest price for a symbol (Real-Time WebSocket > HTTP Cache)
        const fetchPrice = async (pair: string, timeframe: string): Promise<number | null> => {
            const realtimePrice = marketRealtimeService.getLastPrice(pair);
            if (realtimePrice) return realtimePrice;
            const candles = await getCandles(pair, timeframe, 1);
            return candles.length > 0 ? candles[0].close : null;
        };

        // ----- PHASE 1: Check PENDING signals for entry trigger -----
        const pendingSignals = signals.filter(s => s.status === SignalStatus.PENDING);

        if (pendingSignals.length > 0) {
            console.log(`[SignalEngine] Checking ${pendingSignals.length} pending signals for entry triggers...`);

            for (const signal of pendingSignals) {
                try {
                    const currentPrice = await fetchPrice(signal.pair, signal.timeframe);
                    if (currentPrice === null) continue;

                    // Use shared computation for entry trigger checking
                    const signalInput: SignalInput = {
                        id: signal.id,
                        symbol: signal.pair,
                        direction: signal.direction as 'BUY' | 'SELL',
                        entry_price: signal.entry,
                        stop_loss: signal.stopLoss,
                        take_profit: signal.takeProfit,
                        status: 'Pending',
                        entryType: (signal.entryType || 'MARKET').toString().toUpperCase() as 'MARKET' | 'LIMIT' | 'STOP',
                    };

                    const entryTriggered = checkEntryTrigger(signalInput, currentPrice);

                    if (entryTriggered) {
                        console.log(`[SignalEngine] 🎯 Entry triggered: ${signal.pair} ${signal.direction} @ ${currentPrice.toFixed(2)} (Entry: ${signal.entry.toFixed(2)})`);
                        await updateSignalStatus(signal.id, SignalStatus.ACTIVE);
                    }
                } catch (error: any) {
                    console.error(`[SignalEngine] Error checking pending signal ${signal.id}:`, error.message);
                }
            }
        }

        // ----- PHASE 2: Check ACTIVE signals for TP/SL hits -----
        const activeSignals = signals.filter(s => s.status === SignalStatus.ACTIVE);

        if (activeSignals.length === 0) return;

        console.log(`[SignalEngine] Monitoring ${activeSignals.length} active signals for TP/SL...`);

        for (const signal of activeSignals) {
            try {
                const currentPrice = await fetchPrice(signal.pair, signal.timeframe);
                if (currentPrice === null) continue;

                // Use shared computation for TP/SL + trailing SL evaluation
                const signalInput: SignalInput = {
                    id: signal.id,
                    symbol: signal.pair,
                    direction: signal.direction as 'BUY' | 'SELL',
                    entry_price: signal.entry,
                    stop_loss: signal.stopLoss,
                    take_profit: signal.takeProfit,
                    status: 'Active',
                    trailing_stop_loss: signal.trailingStopLoss,
                };

                const result = evaluateSignalAtPrice(signalInput, currentPrice);

                if (result.action === 'CLOSE_TP') {
                    console.log(`[SignalEngine] ✅ Take Profit hit for ${signal.pair} signal ${signal.id}`);
                    const { closeSignal } = await import('../services/signalService');
                    await closeSignal(signal.id, 'TP', result.profitLoss || 0);
                } else if (result.action === 'CLOSE_SL') {
                    console.log(`[SignalEngine] ❌ Stop Loss hit for ${signal.pair} signal ${signal.id}`);
                    const { closeSignal } = await import('../services/signalService');
                    await closeSignal(signal.id, 'SL', result.profitLoss || 0);
                } else if (result.action === 'TRAIL_SL' && result.newStopLoss !== undefined) {
                    console.log(`[SignalEngine] 🛡️ Trailing SL adjusted for ${signal.pair} from ${signal.stopLoss.toFixed(2)} to ${result.newStopLoss.toFixed(2)}`);
                    const { updateSignalRiskLevels } = await import('../services/signalService');
                    await updateSignalRiskLevels(signal.id, { stopLoss: result.newStopLoss });
                }
            } catch (error: any) {
                console.error(`[SignalEngine] Error updating signal ${signal.id}:`, error.message);
            }
        }

    } catch (error: any) {
        console.error('[SignalEngine] Error updating signal statuses:', error);
    }
};

/**
 * Manual trigger for signal generation (for testing or immediate refresh)
 */
export const triggerSignalGeneration = async (): Promise<EngineRunStats> => {
    console.log('[SignalEngine] Manual trigger initiated');
    return await runSignalGeneration();
};

/**
 * Reset engine state (for testing)
 */
export const resetEngineState = (): void => {
    lastRunTime = null;
    lastRunResult = null;
    console.log('[SignalEngine] State reset');
};
