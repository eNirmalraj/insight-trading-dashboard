// backend/server/src/engine/cryptoEngine.ts
// Main Crypto Signal Engine Orchestrator

import ccxt from 'ccxt';
import { Candle } from '@insight/types';
import { runAllBuiltInStrategies, calculateRiskLevels } from './strategyEngine';
import { saveSignal } from '../services/signalStorage';
import { binanceStream } from '../services/binanceStream';
import { TradeDirection, StrategyCategory } from '../constants/builtInStrategies';
import { eventBus, EngineEvents } from '../utils/eventBus';
import { loadMonitoredSignals, initSignalMonitor, getMonitoredSymbols } from './signalMonitor';

// In-memory candle buffer for each symbol/timeframe
const candleBuffer: Map<string, Candle[]> = new Map();
const BUFFER_SIZE = 200; // Keep last 200 candles for indicator calculations

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Binance exchange instance (can switch to US)
// UPDATED: Default to Futures (Perpetual)
let exchange = new ccxt.binance({
    enableRateLimit: true,
    timeout: 20000, // Fail fast on network blocks
    options: { defaultType: 'future' }
});

/**
 * Fetch all USDT trading pairs from Binance
 */
export const fetchAllCryptoSymbols = async (): Promise<string[]> => {
    try {
        console.log('[CryptoEngine] Connecting to Binance Global Futures...');
        await exchange.loadMarkets();
    } catch (error: any) {
        console.warn(`[CryptoEngine] ⚠️ Connection to Global Futures failed (${error.code || error.message}). Switching to Binance US...`);

        // Switch to Binance US (Fallback)
        exchange = new ccxt.binanceus({
            enableRateLimit: true,
            timeout: 5000
        });

        // Switch WebSocket Stream
        binanceStream.setRegion(true);

        try {
            await exchange.loadMarkets();
            console.log('[CryptoEngine] ✅ Connected to Binance US');
        } catch (usError) {
            console.error('[CryptoEngine] Failed to connect to Binance US:', usError);
            return [];
        }
    }

    try {
        console.log('[CryptoEngine] Fetching 24h Tickers to identify Top 100 by Volume...');

        // 1. Fetch all tickers (contains volume data)
        const tickers = await exchange.fetchTickers();
        const markets = await exchange.loadMarkets();

        // 2. Filter and Sort
        const candidates = Object.keys(tickers)
            .map(symbol => {
                const ticker = tickers[symbol];
                const market = exchange.markets[symbol];

                // Ensure market exists and matches criteria
                if (!market || !market.active) return null;

                // Check for linear swap (USDT settled futures)
                // CCXT 'linear' means USDT-margined usually
                if (!(market.linear || market.swap) || market.quote !== 'USDT') return null;

                return {
                    symbol: symbol,
                    volume: ticker.quoteVolume || 0, // USDT Volume
                    base: market.base,
                    quote: market.quote
                };
            })
            .filter((item): item is NonNullable<typeof item> => item !== null)
            .sort((a, b) => b.volume - a.volume); // Descending Volume

        // 3. Select Top 100
        const top100 = candidates.slice(0, 100);

        // 4. Format for System
        const symbols = top100.map(c => `${c.base}/USDT.P`);

        console.log(`[CryptoEngine] ✅ Selected Top ${symbols.length} USDT Futures pairs by Volume`);
        console.log(`[CryptoEngine] Top 3: ${symbols.slice(0, 3).join(', ')}`);
        console.log(`[CryptoEngine] Volume Range: $${(top100[0].volume / 1e6).toFixed(2)}M - $${(top100[top100.length - 1].volume / 1e6).toFixed(2)}M`);

        return symbols;
    } catch (error) {
        console.error('[CryptoEngine] Error processing markets:', error);
        return [];
    }
    // Redundant return to satisfy TS if try block doesn't return (though it does)
    return [];
};

/**
 * Fetch historical candles for a symbol
 */
export const fetchHistoricalCandles = async (
    symbol: string,
    timeframe: string,
    limit: number = 200
): Promise<Candle[]> => {
    let formattedSymbol = symbol;
    try {
        // Convert symbol format: BTC/USDT.P -> CCXT format
        // With defaultType='future', 'BTC/USDT' usually works for the perp

        if (symbol.endsWith('.P')) {
            const base = symbol.replace('.P', '').split('/')[0]; // BTC
            formattedSymbol = `${base}/USDT`;
        } else if (symbol.endsWith('USDT')) {
            // Fallback for old symbols
            formattedSymbol = symbol.slice(0, -4) + '/USDT';
        }

        const ohlcv = await exchange.fetchOHLCV(formattedSymbol, timeframe.toLowerCase(), undefined, limit);
        console.log(`[CryptoEngine] fetchHistoricalCandles: ${symbol} -> ${formattedSymbol} | Candles: ${ohlcv.length}`);

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
    if (candles.length % 10 === 0) {
        console.log(`[CryptoEngine] DEBUG: Running strategies for ${symbol} ${timeframe} (Candles: ${candles.length})`);
    }
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
    // Limit initial fetch to avoid rate limits? No, we need data for all.
    // We will fetch in batches to be safe.
    const BATCH_SIZE = 10;
    const TOTAL_SYMBOLS = symbols.length;

    console.log(`[CryptoEngine] Initialization queue: ${TOTAL_SYMBOLS} symbols across ${timeframes.length} timeframes`);

    for (let i = 0; i < TOTAL_SYMBOLS; i += BATCH_SIZE) {
        const batch = symbols.slice(i, i + BATCH_SIZE);

        // Process batch in parallel
        await Promise.all(batch.map(async (symbol) => {
            for (const timeframe of timeframes) {
                try {
                    const candles = await fetchHistoricalCandles(symbol, timeframe, BUFFER_SIZE);
                    if (candles.length > 0) {
                        candleBuffer.set(`${symbol}_${timeframe}`, candles);
                    }
                } catch (error) {
                    console.error(`[CryptoEngine] Error loading ${symbol} ${timeframe}:`, error);
                }
            }
        }));

        // Rate limit delay between batches (e.g., 1 second every 10 symbols * 5 timeframes = 50 requests)
        // Binance weight is usually 1 per request. 50 requests = 50 weight.
        // Limit is often 1200/min. So 50/sec is 3000/min -> too fast.
        // We need 1200/min = 20/sec.
        // 50 requests in a batch -> Wait 2.5s to be safe.
        // Let's be conservative: 2s delay.
        console.log(`[CryptoEngine] Initialized batch ${i / BATCH_SIZE + 1}/${Math.ceil(TOTAL_SYMBOLS / BATCH_SIZE)}`);
        await new Promise(r => setTimeout(r, 2000));
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
        // Fetch all crypto symbols with retry logic
        let symbols: string[] = [];
        let attempts = 0;
        while (symbols.length === 0 && attempts < 5) {
            symbols = await fetchAllCryptoSymbols();
            if (symbols.length === 0) {
                attempts++;
                console.warn(`[CryptoEngine] Failed to fetch symbols (Attempt ${attempts}/5). Retrying in 5s...`);
                await delay(5000);
            }
        }

        if (symbols.length === 0) {
            console.error('[CryptoEngine] ❌ Critical: Failed to fetch symbols after multiple attempts. Engine streaming will not start for new signals.');
            // We should still monitor existing active signals though!
        }

        // Add active signals to the list if they are not present
        // This ensures we continue monitoring open trades even if they fell out of top 100
        const monitoredSymbols = getMonitoredSymbols();
        for (const s of monitoredSymbols) {
            if (!symbols.includes(s)) {
                console.log(`[CryptoEngine] Adding monitored symbol ${s} to subscription list`);
                symbols.push(s);
            }
        }

        if (symbols.length === 0) {
            console.error('[CryptoEngine] No symbols to monitor. Aborting startup.');
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

        // Subscribe to WebSocket streams (ALL symbols)
        await binanceStream.subscribe(symbols, timeframes);

        console.log('[CryptoEngine] ✅ Crypto Signal Engine started successfully');
        console.log(`[CryptoEngine] 📊 Monitoring ${symbols.length} symbols on ${timeframes.length} timeframes`);

    } catch (error) {
        console.error('[CryptoEngine] Failed to start:', error);
        console.log('[CryptoEngine] 🔄 Retrying startup in 10 seconds...');
        await delay(10000);
        return startCryptoEngine();
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
