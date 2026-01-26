// backend/server/src/engine/cryptoEngine.ts
// Main Crypto Signal Engine Orchestrator

import ccxt from 'ccxt';
import { Candle } from './indicators';
import { runAllBuiltInStrategies, calculateRiskLevels } from './strategyEngine';
import { saveSignal } from '../services/signalStorage';
import { binanceStream } from '../services/binanceStream';
import { TradeDirection, StrategyCategory } from '../constants/builtInStrategies';
import { eventBus, EngineEvents } from '../utils/eventBus';
import { loadMonitoredSignals, initSignalMonitor } from './signalMonitor';

// In-memory candle buffer for each symbol/timeframe
const candleBuffer: Map<string, Candle[]> = new Map();
const BUFFER_SIZE = 200; // Keep last 200 candles for indicator calculations

// Binance exchange instance for fetching historical data
const exchange = new ccxt.binance({ enableRateLimit: true });

/**
 * Fetch all USDT trading pairs from Binance
 */
export const fetchAllCryptoSymbols = async (): Promise<string[]> => {
    try {
        await exchange.loadMarkets();

        const symbols = Object.keys(exchange.markets)
            .filter(symbol => {
                const market = exchange.markets[symbol];
                return market.active &&
                    market.spot &&
                    (symbol.endsWith('/USDT') || symbol.endsWith('/USD'));
            })
            .map(symbol => symbol.replace('/', '')); // BTCUSDT format

        console.log(`[CryptoEngine] Found ${symbols.length} USDT/USD pairs`);
        return symbols;
    } catch (error) {
        console.error('[CryptoEngine] Error fetching symbols:', error);
        return [];
    }
};

/**
 * Fetch historical candles for a symbol
 */
export const fetchHistoricalCandles = async (
    symbol: string,
    timeframe: string,
    limit: number = 200
): Promise<Candle[]> => {
    try {
        // Convert symbol format: BTCUSDT -> BTC/USDT
        let formattedSymbol = symbol;
        if (symbol.endsWith('USDT')) {
            formattedSymbol = symbol.slice(0, -4) + '/USDT';
        } else if (symbol.endsWith('USD')) {
            formattedSymbol = symbol.slice(0, -3) + '/USD';
        }

        const ohlcv = await exchange.fetchOHLCV(formattedSymbol, timeframe.toLowerCase(), undefined, limit);

        return ohlcv.map((candle: any) => ({
            time: Math.floor(candle[0] / 1000),
            open: candle[1],
            high: candle[2],
            low: candle[3],
            close: candle[4],
            volume: candle[5]
        }));
    } catch (error) {
        console.error(`[CryptoEngine] Error fetching candles for ${symbol}:`, error);
        return [];
    }
};

/**
 * Process a new closed candle
 */
const processCandle = async (symbol: string, timeframe: string, candle: Candle): Promise<void> => {
    const bufferKey = `${symbol}_${timeframe}`;

    // Get or initialize buffer
    let candles = candleBuffer.get(bufferKey) || [];

    // Add new candle
    candles.push(candle);

    // Trim to buffer size
    if (candles.length > BUFFER_SIZE) {
        candles = candles.slice(-BUFFER_SIZE);
    }

    candleBuffer.set(bufferKey, candles);

    // Need at least 50 candles for most indicators
    if (candles.length < 50) {
        console.log(`[CryptoEngine] Buffering ${symbol} ${timeframe}: ${candles.length}/${BUFFER_SIZE}`);
        return;
    }

    // Run strategies
    const signals = runAllBuiltInStrategies(candles);

    // Process each signal
    for (const signal of signals) {
        if (!signal.wouldSignal || !signal.direction) continue;

        const entryPrice = candle.close;
        const { stopLoss, takeProfit } = calculateRiskLevels(entryPrice, signal.direction, signal.exitRules);

        // Save to database
        await saveSignal({
            symbol: symbol,
            strategy: signal.strategyName,
            strategyId: signal.strategyId,
            strategyCategory: StrategyCategory.TREND_FOLLOWING,
            direction: signal.direction,
            entryPrice: entryPrice,
            stopLoss: stopLoss,
            takeProfit: takeProfit,
            timeframe: timeframe.endsWith('m') ? timeframe : timeframe.toUpperCase(),
            status: 'Active' // Market signals activate immediately
        });
    }
};

/**
 * Initialize candle buffers with historical data
 */
const initializeBuffers = async (symbols: string[], timeframes: string[]): Promise<void> => {
    console.log('[CryptoEngine] Initializing candle buffers...');

    // Limit initial fetch to avoid rate limits
    const limitedSymbols = symbols.slice(0, 50); // Start with top 50

    for (const symbol of limitedSymbols) {
        for (const timeframe of timeframes) {
            try {
                const candles = await fetchHistoricalCandles(symbol, timeframe, BUFFER_SIZE);
                if (candles.length > 0) {
                    candleBuffer.set(`${symbol}_${timeframe}`, candles);
                }
                // Small delay to respect rate limits
                await new Promise(r => setTimeout(r, 100));
            } catch (error) {
                console.error(`[CryptoEngine] Error loading ${symbol} ${timeframe}:`, error);
            }
        }
    }

    console.log(`[CryptoEngine] Initialized ${candleBuffer.size} buffers`);
};

/**
 * Start the Crypto Signal Engine
 */
export const startCryptoEngine = async (): Promise<void> => {
    console.log('[CryptoEngine] 🚀 Starting Crypto Signal Engine (Event-Driven)...');

    try {
        // Load active signals to monitor initially
        await loadMonitoredSignals();

        // Fetch all crypto symbols
        const symbols = await fetchAllCryptoSymbols();

        if (symbols.length === 0) {
            console.error('[CryptoEngine] No symbols found, engine not started');
            return;
        }

        const timeframes = ['1m', '5m', '15m', '1h', '4h'];

        // Initialize historical data buffers
        await initializeBuffers(symbols, timeframes);

        // Initialize optimized monitoring
        initSignalMonitor();

        // ═══════════════════════════════════════════
        // EVENT-DRIVEN PROCESSING
        // ═══════════════════════════════════════════

        // 1. Handle Candle Closures (Strategy Evaluation)
        eventBus.on(EngineEvents.CANDLE_CLOSED, async ({ symbol, timeframe, candle }) => {
            await processCandle(symbol, timeframe, candle);
        });

        // 💡 Note: Monitoring (TP/SL) is now handled automatically 
        // by SignalMonitor which listens directly to PRICE_TICK events.

        // Subscribe to WebSocket streams (limited for now)
        const limitedSymbols = symbols.slice(0, 100); // Start with top 100
        await binanceStream.subscribe(limitedSymbols, timeframes);

        console.log('[CryptoEngine] ✅ Crypto Signal Engine started successfully');
        console.log(`[CryptoEngine] 📊 Monitoring ${limitedSymbols.length} symbols on ${timeframes.length} timeframes`);

    } catch (error) {
        console.error('[CryptoEngine] Failed to start:', error);
    }
};

/**
 * Stop the Crypto Signal Engine
 */
export const stopCryptoEngine = (): void => {
    console.log('[CryptoEngine] Stopping...');
    binanceStream.disconnect();
    candleBuffer.clear();
    console.log('[CryptoEngine] Stopped');
};

/**
 * Get engine status
 */
export const getCryptoEngineStatus = (): object => {
    const streamStatus = binanceStream.getStatus();
    return {
        running: streamStatus.connected,
        bufferedPairs: candleBuffer.size,
        subscriptions: streamStatus.subscriptionCount
    };
};
