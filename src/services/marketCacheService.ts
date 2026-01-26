// src/services/marketCacheService.ts
// Persistent cache service for market data using IndexedDB (primary) and Supabase (fallback)

import { Candle } from '../types/market';
import { supabase, isSupabaseConfigured } from './supabaseClient';

const DB_NAME = 'InsightMarketCache';
const DB_VERSION = 1;
const STORE_NAME = 'candles';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes for stale check

interface CacheMetadata {
    symbol: string;
    timeframe: string;
    cachedAt: number;
    candleCount: number;
}

interface CachedData {
    candles: Candle[];
    metadata: CacheMetadata;
}

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Initialize IndexedDB
 */
const getDB = (): Promise<IDBDatabase> => {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;

            // Store candles with composite key
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
                store.createIndex('symbol_timeframe', ['symbol', 'timeframe'], { unique: true });
            }
        };
    });

    return dbPromise;
};

/**
 * Generate cache key for symbol+timeframe
 */
const getCacheKey = (symbol: string, timeframe: string): string => {
    return `${symbol.toUpperCase()}_${timeframe}`;
};

/**
 * Get cached candles from IndexedDB (fast local cache)
 */
export const getCachedCandles = async (
    symbol: string,
    timeframe: string
): Promise<{ data: Candle[] | null; isStale: boolean; cachedAt: number | null }> => {
    try {
        const db = await getDB();
        const key = getCacheKey(symbol, timeframe);

        return new Promise((resolve) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(key);

            request.onsuccess = () => {
                const result = request.result as CachedData | undefined;

                if (!result) {
                    resolve({ data: null, isStale: true, cachedAt: null });
                    return;
                }

                const age = Date.now() - result.metadata.cachedAt;
                const isStale = age > CACHE_TTL;

                resolve({
                    data: result.candles,
                    isStale,
                    cachedAt: result.metadata.cachedAt
                });
            };

            request.onerror = () => {
                console.warn('IndexedDB read error, falling back to null');
                resolve({ data: null, isStale: true, cachedAt: null });
            };
        });
    } catch (error) {
        console.warn('IndexedDB not available:', error);
        return { data: null, isStale: true, cachedAt: null };
    }
};

/**
 * Save candles to IndexedDB
 */
export const saveCandles = async (
    symbol: string,
    timeframe: string,
    candles: Candle[]
): Promise<void> => {
    try {
        const db = await getDB();
        const key = getCacheKey(symbol, timeframe);

        const data: CachedData = {
            candles,
            metadata: {
                symbol: symbol.toUpperCase(),
                timeframe,
                cachedAt: Date.now(),
                candleCount: candles.length
            }
        };

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put({ key, ...data });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.warn('Failed to save to IndexedDB:', error);
    }
};

/**
 * Persist candles to Supabase (background, for cross-device sync)
 * Only stores most recent candles to avoid quota issues
 */
export const persistToSupabase = async (
    symbol: string,
    timeframe: string,
    candles: Candle[]
): Promise<void> => {
    if (!isSupabaseConfigured() || !supabase) return;

    try {
        // Only persist the last 500 candles to Supabase (most recent data)
        const recentCandles = candles.slice(-500);
        const normalizedSymbol = symbol.replace('/', '').toUpperCase();

        // Use upsert with ON CONFLICT
        const rows = recentCandles.map(c => ({
            symbol: normalizedSymbol,
            timeframe: timeframe.toLowerCase(),
            candle_time: c.time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
            cached_at: new Date().toISOString()
        }));

        // Batch insert in chunks of 100
        const BATCH_SIZE = 100;
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const batch = rows.slice(i, i + BATCH_SIZE);

            const { error } = await supabase
                .from('market_data_cache')
                .upsert(batch, {
                    onConflict: 'symbol,timeframe,candle_time',
                    ignoreDuplicates: false
                });

            if (error) {
                console.warn('Supabase cache write error:', error.message);
                break;
            }
        }
    } catch (error) {
        console.warn('Failed to persist to Supabase:', error);
    }
};

/**
 * Load candles from Supabase (fallback when IndexedDB is empty)
 */
export const loadFromSupabase = async (
    symbol: string,
    timeframe: string,
    limit: number = 1000
): Promise<Candle[]> => {
    if (!isSupabaseConfigured() || !supabase) return [];

    try {
        const normalizedSymbol = symbol.replace('/', '').toUpperCase();

        const { data, error } = await supabase
            .from('market_data_cache')
            .select('candle_time, open, high, low, close, volume')
            .eq('symbol', normalizedSymbol)
            .eq('timeframe', timeframe.toLowerCase())
            .order('candle_time', { ascending: true })
            .limit(limit);

        if (error) {
            console.warn('Supabase cache read error:', error.message);
            return [];
        }

        return (data || []).map(row => ({
            time: row.candle_time,
            open: parseFloat(row.open),
            high: parseFloat(row.high),
            low: parseFloat(row.low),
            close: parseFloat(row.close),
            volume: parseFloat(row.volume)
        }));
    } catch (error) {
        console.warn('Failed to load from Supabase:', error);
        return [];
    }
};

/**
 * Preload common symbols into cache (called on app init)
 */
export const preloadCommonSymbols = async (
    fetchFn: (symbol: string, timeframe: string) => Promise<Candle[]>,
    symbols: string[] = ['BTCUSDT', 'ETHUSDT'],
    timeframes: string[] = ['1H', '4H', '1D']
): Promise<void> => {
    // Preload in background without blocking
    for (const symbol of symbols) {
        for (const timeframe of timeframes) {
            const cached = await getCachedCandles(symbol, timeframe);

            // Only preload if cache is empty or very stale (> 1 hour)
            const veryStale = cached.cachedAt && (Date.now() - cached.cachedAt > 60 * 60 * 1000);

            if (!cached.data || veryStale) {
                try {
                    const candles = await fetchFn(symbol, timeframe);
                    if (candles.length > 0) {
                        await saveCandles(symbol, timeframe, candles);
                    }
                } catch (error) {
                    // Ignore preload errors
                }
            }
        }
    }
};

/**
 * Clear all cached data (useful for debugging or user request)
 */
export const clearCache = async (): Promise<void> => {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.warn('Failed to clear cache:', error);
    }
};
