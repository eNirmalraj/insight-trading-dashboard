// src/services/marketDataService.ts
import { Candle } from '../types/market';
import { getCachedCandles, saveCandles, persistToSupabase, loadFromSupabase } from './marketCacheService';

const BINANCE_API_URL = '/api/binance/v3/klines';

// In-memory cache (short-lived, for within-session deduplication)
interface CacheEntry {
    timestamp: number;
    data: Candle[];
}
const cache: Record<string, CacheEntry> = {};
const CACHE_TTL = 60000; // 1 minute for in-memory (IndexedDB handles longer persistence)

/**
 * Normalizes symbol to Binance format (e.g., "BTC/USDT" -> "BTCUSDT")
 */
export const normalizeSymbol = (symbol: string): string => {
    return symbol.replace('/', '').toUpperCase();
};

/**
 * Normalizes timeframe to Binance format (e.g., "1H" -> "1h")
 */
export const normalizeTimeframe = (tf: string): string => {
    // Map standard timeframes
    const mapping: Record<string, string> = {
        '1m': '1m',
        '3m': '3m',
        '5m': '5m',
        '15m': '15m',
        '30m': '30m',
        '45m': '1h', // Fallback for unsupported 45m
        '1H': '1h',
        '2H': '2h',
        '3H': '4h', // Fallback for unsupported 3H
        '4H': '4h',
        '1D': '1d',
        '1W': '1w',
        '1M': '1M'
    };
    return mapping[tf] || '1h'; // Default to 1h if unknown
};

/**
 * Fetches candlestick data from Binance API
 */
const MAX_CACHE_SIZE = 50;

/**
 * Fetches candlestick data from Binance API
 */
export const getCandles = async (
    symbol: string,
    timeframe: string,
    limit: number = 1000
): Promise<Candle[]> => {
    const cleanSymbol = normalizeSymbol(symbol);
    const cleanTf = normalizeTimeframe(timeframe);
    const cacheKey = `${cleanSymbol}_${cleanTf}_${limit}`;

    // Check cache
    const now = Date.now();
    if (cache[cacheKey] && (now - cache[cacheKey].timestamp < CACHE_TTL)) {
        return cache[cacheKey].data;
    }

    // Simple cache cleanup if too large
    const cacheKeys = Object.keys(cache);
    if (cacheKeys.length > MAX_CACHE_SIZE) {
        // delete oldest or random? Simple FIFO or random is fine for now
        delete cache[cacheKeys[0]];
    }

    try {
        // Detect if this is a Futures symbol (.P suffix)
        const isFutures = symbol.toUpperCase().endsWith('.P');
        const apiSymbol = isFutures ? cleanSymbol.replace('.P', '').replace('.p', '') : cleanSymbol;

        // Use Futures API for .P symbols, Spot API for others
        const baseUrl = isFutures
            ? '/fapi/binance/v1/klines'
            : BINANCE_API_URL;

        const chunks: Candle[][] = [];
        let remaining = limit;
        let endTime: number | undefined;

        console.log(`[Chart] Fetching ${limit} ${isFutures ? 'FUTURES' : 'SPOT'} candles for ${apiSymbol}`);

        while (remaining > 0) {
            const batchLimit = Math.min(remaining, 1000); // Binance max limit is 1000
            let url = `${baseUrl}?symbol=${apiSymbol}&interval=${cleanTf}&limit=${batchLimit}`;
            if (endTime) {
                url += `&endTime=${endTime}`;
            }

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Binance API error: ${response.statusText}`);
            }

            const rawData = await response.json();

            if (!Array.isArray(rawData) || rawData.length === 0) {
                break;
            }

            // Normalize data
            const candles: Candle[] = rawData.map((d: any[]) => ({
                time: Math.floor(d[0] / 1000), // Convert ms to seconds
                open: parseFloat(d[1]),
                high: parseFloat(d[2]),
                low: parseFloat(d[3]),
                close: parseFloat(d[4]),
                volume: parseFloat(d[5])
            }));

            // Store chunk - we are fetching backwards, so this chunk comes BEFORE the previous chunks
            chunks.push(candles);

            // Prepare for next batch (older data)
            const firstCandleTimeMs = rawData[0][0];
            endTime = firstCandleTimeMs - 1;

            remaining -= candles.length;

            // Safety break if we got fewer than requested
            if (candles.length < batchLimit) break;
        }

        // Combine chunks correctly. 
        // We pushed: [LatestBatch, OlderBatch, OldestBatch] 
        // But inside each batch, data is Oldest -> Newest.
        // Wait, if we fetch without endTime, we get [OldestInBatch ... NewestInBatch] (representing Latest time window)
        // Next batch (with endTime) gets [OldestInBatch ... NewestInBatch] (representing Older time window)
        // So `chunks` is [LatestWindow, OlderWindow, OldestWindow]
        // We want final result to be [OldestWindow ... LatestWindow]
        // So we need to reverse the chunks, then flat.

        const allCandles = chunks.reverse().flat();

        // Update cache
        cache[cacheKey] = {
            timestamp: now,
            data: allCandles
        };

        return allCandles;

    } catch (error) {
        console.error('Failed to fetch real market data:', error);
        return [];
    }
};
/**
 * Fetches all crypto symbols from Binance (ticker/24hr)
 * Used for Symbol Search
 */
export interface BinanceTicker {
    symbol: string;
    lastPrice: string;
    priceChange: string;
    priceChangePercent: string;
    volume: string;
    quoteVolume: string;
}

export interface SearchSymbol {
    symbol: string;
    description: string;
    price: number;
    change: number;
    changePercent: number;
    volume: number;
    type: 'Crypto' | 'Forex';
    exchange: string;
    market: 'Spot' | 'Futures';  // NEW: Distinguish between Spot and Futures
}

const ALL_SYMBOLS_CACHE_KEY = 'all_binance_symbols';
const ALL_SYMBOLS_TTL = 60000; // 1 minute

/**
 * Fetch Binance Futures symbols with status filtering
 */
export const fetchFuturesSymbols = async (): Promise<SearchSymbol[]> => {
    try {
        // Fetch Futures exchange info to get symbol status
        const exchangeInfoResponse = await fetch('/fapi/binance/v1/exchangeInfo');
        if (!exchangeInfoResponse.ok) throw new Error('Failed to fetch futures exchange info');

        const exchangeInfo = await exchangeInfoResponse.json();

        // Create Set of actively trading futures symbols
        const activeSymbols = new Set<string>();
        exchangeInfo.symbols.forEach((symbolInfo: any) => {
            if (symbolInfo.status === 'TRADING' && symbolInfo.contractType === 'PERPETUAL') {
                activeSymbols.add(symbolInfo.symbol);
            }
        });

        // Fetch 24hr ticker data for Futures
        const tickerResponse = await fetch('/fapi/binance/v1/ticker/24hr');
        if (!tickerResponse.ok) throw new Error('Failed to fetch futures tickers');

        const data = await tickerResponse.json();

        // Filter for USDT pairs (most common for futures)
        const symbols: SearchSymbol[] = data
            .filter((t: any) => {
                // Must be USDT pair and actively trading
                if (!t.symbol.endsWith('USDT')) return false;
                if (!activeSymbols.has(t.symbol)) return false;
                return true;
            })
            .map((t: any) => {
                const base = t.symbol.replace('USDT', '');
                return {
                    symbol: `${base}/USDT.P`,  // .P suffix for Perpetual Futures
                    description: `${base} / USDT Perpetual`,
                    price: parseFloat(t.lastPrice),
                    change: parseFloat(t.priceChange),
                    changePercent: parseFloat(t.priceChangePercent),
                    volume: parseFloat(t.quoteVolume || t.volume),
                    type: 'Crypto' as const,
                    exchange: 'BINANCE',
                    market: 'Futures' as const
                };
            });

        return symbols;
    } catch (err) {
        console.error('Failed to fetch futures symbols:', err);
        return [];
    }
};

export const fetchAllCryptoSymbols = async (): Promise<SearchSymbol[]> => {
    const now = Date.now();
    if (cache[ALL_SYMBOLS_CACHE_KEY] && (now - cache[ALL_SYMBOLS_CACHE_KEY].timestamp < ALL_SYMBOLS_TTL)) {
        return cache[ALL_SYMBOLS_CACHE_KEY].data as any;
    }

    try {
        // First, fetch exchange info to get symbol status (TRADING, BREAK, etc.)
        const exchangeInfoResponse = await fetch('/api/binance/v3/exchangeInfo');
        if (!exchangeInfoResponse.ok) throw new Error('Failed to fetch exchange info');

        const exchangeInfo = await exchangeInfoResponse.json();

        // Create a Set of actively trading symbols for fast lookup
        const activeSymbols = new Set<string>();
        exchangeInfo.symbols.forEach((symbolInfo: any) => {
            // Only include symbols that are actively TRADING
            if (symbolInfo.status === 'TRADING') {
                activeSymbols.add(symbolInfo.symbol);
            }
        });

        // Then fetch 24hr ticker data
        const response = await fetch(`${BINANCE_API_URL.replace('/klines', '')}/ticker/24hr`);
        if (!response.ok) throw new Error('Failed to fetch tickers');

        const data: BinanceTicker[] = await response.json();

        // Filter valid symbols (e.g. ending in USDT for simplicity/relevance, or take all?)
        // Taking all might be too many (2000+). Let's prioritize USDT pairs for cleaner search
        // or just return all and let UI filter.
        // Let's filter for major quote assets to keep it relevant: USDT, BTC, ETH, BNB, USDC
        const validQuotes = ['USDT', 'BTC', 'ETH', 'BNB', 'USDC'];

        const spotSymbols: SearchSymbol[] = data
            .filter(t => {
                // Filter 1: Must end with valid quote currency
                if (!validQuotes.some(q => t.symbol.endsWith(q))) return false;

                // Filter 2: Must be actively TRADING (not delisted or paused)
                if (!activeSymbols.has(t.symbol)) return false;

                return true;
            })
            .map(t => {
                let quote = validQuotes.find(q => t.symbol.endsWith(q)) || '';
                let base = t.symbol.replace(quote, '');

                return {
                    symbol: `${base}/${quote}`,
                    description: `${base} / ${quote === 'USDT' || quote === 'USDC' ? 'Tether' : quote}`,
                    price: parseFloat(t.lastPrice),
                    change: parseFloat(t.priceChange),
                    changePercent: parseFloat(t.priceChangePercent),
                    volume: parseFloat(t.quoteVolume),
                    type: 'Crypto',
                    exchange: 'BINANCE',
                    market: 'Spot' as const
                };
            });

        // Fetch FUTURES symbols
        const futuresSymbols = await fetchFuturesSymbols();

        // Combine Spot + Futures
        const allSymbols = [...spotSymbols, ...futuresSymbols];

        cache[ALL_SYMBOLS_CACHE_KEY] = {
            timestamp: now,
            data: allSymbols as any
        };

        return allSymbols;
    } catch (err) {
        console.error('Failed to fetch all symbols:', err);
        return [];
    }
};

/**
 * Result from getCandlesWithCache
 */
export interface CandleResult {
    data: Candle[];
    isStale: boolean;
    source: 'cache' | 'network' | 'supabase';
}

/**
 * Stale-while-revalidate pattern for instant data loading
 * Returns cached data immediately (if available) while fetching fresh data in background
 * 
 * @param symbol - Trading pair symbol
 * @param timeframe - Chart timeframe
 * @param limit - Number of candles to fetch
 * @param onFreshData - Callback when fresh data is available (for background updates)
 * @returns Immediate result with cached data (or network fetch if no cache)
 */
export const getCandlesWithCache = async (
    symbol: string,
    timeframe: string,
    limit: number = 1000,
    onFreshData?: (candles: Candle[]) => void
): Promise<CandleResult> => {
    const cleanSymbol = normalizeSymbol(symbol);
    const cleanTf = normalizeTimeframe(timeframe);

    // 1. Try IndexedDB cache first (instant)
    const cached = await getCachedCandles(cleanSymbol, cleanTf);

    if (cached.data && cached.data.length > 0) {
        // We have cached data - return it immediately
        console.log(`[Cache] HIT for ${cleanSymbol}/${cleanTf} (${cached.data.length} candles, stale: ${cached.isStale})`);

        // If stale or callback provided, fetch fresh data in background
        if (cached.isStale || onFreshData) {
            // Background fetch - don't await
            fetchAndCacheFreshData(symbol, timeframe, limit, onFreshData);
        }

        return {
            data: cached.data,
            isStale: cached.isStale,
            source: 'cache'
        };
    }

    // 2. No IndexedDB cache - try Supabase as fallback
    const supabaseData = await loadFromSupabase(cleanSymbol, cleanTf, limit);

    if (supabaseData.length > 0) {
        console.log(`[Cache] Supabase HIT for ${cleanSymbol}/${cleanTf} (${supabaseData.length} candles)`);

        // Save to IndexedDB for next time
        await saveCandles(cleanSymbol, cleanTf, supabaseData);

        // Still fetch fresh data in background
        fetchAndCacheFreshData(symbol, timeframe, limit, onFreshData);

        return {
            data: supabaseData,
            isStale: true, // Supabase data may be outdated
            source: 'supabase'
        };
    }

    // 3. No cache at all - must fetch from network (blocking)
    console.log(`[Cache] MISS for ${cleanSymbol}/${cleanTf} - fetching from network`);
    const freshData = await getCandles(symbol, timeframe, limit);

    // Save to cache for next time
    if (freshData.length > 0) {
        await saveCandles(cleanSymbol, cleanTf, freshData);
        // Persist to Supabase in background (don't await)
        persistToSupabase(cleanSymbol, cleanTf, freshData);
    }

    return {
        data: freshData,
        isStale: false,
        source: 'network'
    };
};

/**
 * Background fetch and cache update
 */
const fetchAndCacheFreshData = async (
    symbol: string,
    timeframe: string,
    limit: number,
    onFreshData?: (candles: Candle[]) => void
): Promise<void> => {
    try {
        const freshData = await getCandles(symbol, timeframe, limit);

        if (freshData.length > 0) {
            const cleanSymbol = normalizeSymbol(symbol);
            const cleanTf = normalizeTimeframe(timeframe);

            // Update IndexedDB cache
            await saveCandles(cleanSymbol, cleanTf, freshData);

            // Persist to Supabase (background)
            persistToSupabase(cleanSymbol, cleanTf, freshData);

            // Notify caller of fresh data
            if (onFreshData) {
                console.log(`[Cache] Fresh data ready for ${cleanSymbol}/${cleanTf} (${freshData.length} candles)`);
                onFreshData(freshData);
            }
        }
    } catch (error) {
        console.warn('Background fetch failed:', error);
    }
};
