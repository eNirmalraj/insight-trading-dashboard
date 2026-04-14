import WebSocket from 'ws';
import { Candle } from '../engine/indicators';
import { eventBus } from '../utils/eventBus';

export interface KlineMessage {
    e: string; // Event type
    E: number; // Event time
    s: string; // Symbol
    k: {
        t: number; // Kline start time
        T: number; // Kline close time
        s: string; // Symbol
        i: string; // Interval
        o: string; // Open price
        c: string; // Close price
        h: string; // High price
        l: string; // Low price
        v: string; // Base asset volume
        x: boolean; // Is this kline closed?
    };
}

type CandleCloseCallback = (symbol: string, timeframe: string, candle: Candle) => void;

interface StreamShard {
    id: number;
    ws: WebSocket | null;
    streams: string[];
    isConnected: boolean;
    reconnectTimer: NodeJS.Timeout | null;
    reconnectAttempts: number;
}

export class BinanceStreamManager {
    // Configuration
    private baseUrl = 'wss://fstream.binance.com/stream?streams=';
    private readonly STREAMS_PER_CONNECTION = 200;
    private readonly MAX_RECONNECT_DELAY = 60000; // 60 seconds max backoff

    // State
    private shards: StreamShard[] = [];
    private subscriptions: Map<string, Set<string>> = new Map(); // symbol -> Set<timeframe>
    private onCandleCloseCallback: CandleCloseCallback | null = null;

    // Dedicated bookTicker shard — managed independently from kline shards.
    // Rebuilt whenever the set of tracked symbols changes (add/remove), but
    // rebuilds are debounced to coalesce bursts of subscribe/unsubscribe calls
    // (e.g. during cold-start scans that emit dozens of signals back-to-back).
    private tickerShard: StreamShard | null = null;
    private bookTickerSymbols: Set<string> = new Set(); // canonical symbols e.g. 'BTCUSDT'
    private tickerRebuildTimer: NodeJS.Timeout | null = null;
    private readonly TICKER_REBUILD_DEBOUNCE_MS = 250;

    // Watchdog
    private lastMessageTime: number = Date.now();
    private watchdogInterval: NodeJS.Timeout | null = null;

    /**
     * Set the region for Binance Stream (US or Global)
     */
    public setRegion(isUS: boolean): void {
        if (isUS) {
            console.warn(
                '[BinanceStream] Warning: Binance US Futures stream not fully configured, using global fstream as fallback'
            );
            this.baseUrl = 'wss://stream.binance.us:9443/stream?streams=';
        } else {
            this.baseUrl = 'wss://fstream.binance.com/stream?streams=';
            console.log('[BinanceStream] Switched to Binance Global Futures WebSocket');
        }
    }

    /**
     * Set the callback for candle close events
     */
    public onCandleClose(callback: CandleCloseCallback): void {
        this.onCandleCloseCallback = callback;
    }

    /**
     * Subscribe to symbols and timeframes
     */
    public async subscribe(symbols: string[], timeframes: string[]): Promise<void> {
        // 1. Store subscriptions
        for (const symbol of symbols) {
            if (!this.subscriptions.has(symbol)) {
                this.subscriptions.set(symbol, new Set());
            }
            for (const tf of timeframes) {
                this.subscriptions.get(symbol)!.add(tf);
            }
        }

        // 2. Build complete list of streams
        const allStreams: string[] = [];
        this.subscriptions.forEach((tfs, symbol) => {
            // Symbols are already Binance-native (BTCUSDT) post migration 051.
            // Only lowercase for the WS stream name.
            const cleanSymbol = symbol.toLowerCase();
            tfs.forEach((tf) => {
                const stream = `${cleanSymbol}@kline_${tf.toLowerCase()}`;
                allStreams.push(stream);
            });
        });

        if (allStreams.length === 0) {
            console.log('[BinanceStream] No subscriptions to connect');
            return;
        }

        console.log(`[BinanceStream] Preparing to connect ${allStreams.length} streams...`);

        // 3. Create Shards
        this.disconnect(); // Close existing first

        const chunkedStreams = this.chunkArray(allStreams, this.STREAMS_PER_CONNECTION);

        this.shards = chunkedStreams.map((streams, index) => ({
            id: index + 1,
            ws: null,
            streams: streams,
            isConnected: false,
            reconnectTimer: null,
            reconnectAttempts: 0,
        }));

        console.log(`[BinanceStream] Created ${this.shards.length} connection shards`);

        // 4. Connect all shards
        this.shards.forEach((shard) => this.connectShard(shard));

        // 5. Start Watchdog
        this.startWatchdog();
    }

    private chunkArray<T>(array: T[], size: number): T[][] {
        const result: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
            result.push(array.slice(i, i + size));
        }
        return result;
    }

    /**
     * Connect a specific shard
     */
    private connectShard(shard: StreamShard): void {
        if (shard.ws) {
            try {
                shard.ws.terminate();
            } catch (e) {}
        }

        const url = this.baseUrl + shard.streams.join('/');
        console.log(
            `[BinanceStream] [Shard ${shard.id}] Connecting to ${shard.streams.length} streams...`
        );

        try {
            shard.ws = new WebSocket(url);

            shard.ws.on('open', () => {
                console.log(`[BinanceStream] [Shard ${shard.id}] ✅ Connected`);
                shard.isConnected = true;
                shard.reconnectAttempts = 0; // Reset backoff on success
                this.lastMessageTime = Date.now();
            });

            shard.ws.on('message', (data: WebSocket.Data) => {
                this.handleMessage(data);
            });

            shard.ws.on('close', () => {
                console.log(`[BinanceStream] [Shard ${shard.id}] Connection closed`);
                shard.isConnected = false;
                this.scheduleReconnect(shard);
            });

            shard.ws.on('error', (error) => {
                console.error(`[BinanceStream] [Shard ${shard.id}] Error:`, error.message);
                console.error(`[BinanceStream] DEBUG: Connection Error Details:`, error);
                // 'close' event usually follows error, so we rely on that for reconnect
            });
        } catch (error) {
            console.error(`[BinanceStream] [Shard ${shard.id}] Valid connection error:`, error);
            this.scheduleReconnect(shard);
        }
    }

    /**
     * Schedule reconnection for a shard with exponential backoff
     */
    private scheduleReconnect(shard: StreamShard): void {
        if (shard.reconnectTimer) return; // Already scheduled

        // Exponential backoff: 5s, 10s, 20s... max 60s
        const baseDelay = 5000;
        let delay = baseDelay * Math.pow(2, shard.reconnectAttempts);
        if (delay > this.MAX_RECONNECT_DELAY) delay = this.MAX_RECONNECT_DELAY;

        shard.reconnectAttempts++;

        console.log(
            `[BinanceStream] [Shard ${shard.id}] Reconnecting in ${delay / 1000}s (Attempt ${shard.reconnectAttempts})...`
        );

        shard.reconnectTimer = setTimeout(() => {
            shard.reconnectTimer = null;
            this.connectShard(shard);
        }, delay);
    }

    /**
     * Handle incoming WebSocket message (from any shard)
     */
    private handleMessage(data: WebSocket.Data): void {
        this.lastMessageTime = Date.now();

        try {
            const parsed = JSON.parse(data.toString());
            if (!parsed.data) return;

            // Kline event: { stream: "btcusdt@kline_1h", data: { e:'kline', k: {...} } }
            if (parsed.data.e === 'kline') {
                const kline = parsed.data as KlineMessage;
                // Symbols are now Binance-native (BTCUSDT). No slash, no .P.
                const symbol = kline.s.toUpperCase();
                const timeframe = kline.k.i;

                // Only process if candle is closed
                if (kline.k.x) {
                    const candle: Candle = {
                        time: Math.floor(kline.k.t / 1000),
                        open: parseFloat(kline.k.o),
                        high: parseFloat(kline.k.h),
                        low: parseFloat(kline.k.l),
                        close: parseFloat(kline.k.c),
                        volume: parseFloat(kline.k.v),
                    };

                    console.log(
                        `[BinanceStream] 🕯️ Candle closed: ${symbol} ${timeframe} @ ${candle.close}`
                    );

                    eventBus.emitCandleClosed(symbol, timeframe, candle);

                    if (this.onCandleCloseCallback) {
                        this.onCandleCloseCallback(symbol, timeframe, candle);
                    }
                }
                return;
            }

            // BookTicker event: { stream: "btcusdt@bookTicker", data: { s, b, a, B, A, ... } }
            // Binance @bookTicker does NOT have an `e` field; we identify by stream suffix.
            if (parsed.stream && typeof parsed.stream === 'string' && parsed.stream.endsWith('@bookTicker')) {
                const tick = parsed.data;
                const symbol = String(tick.s || '').toUpperCase();
                const bid = parseFloat(tick.b);
                const ask = parseFloat(tick.a);
                if (!symbol || Number.isNaN(bid) || Number.isNaN(ask)) return;
                eventBus.emitPriceTick(symbol, bid, ask);
                return;
            }
        } catch (error) {
            console.error('[BinanceStream] Error parsing message:', error);
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  BookTicker subscriptions (for tick-level SL/TP monitoring)
    // ──────────────────────────────────────────────────────────────

    /**
     * Subscribe to the @bookTicker stream for a symbol.
     * Idempotent: calling twice for the same symbol is a no-op.
     * Rebuilds are debounced — bursts of calls within 250 ms coalesce into
     * a single teardown + rebuild with the final set.
     */
    public async subscribeBookTicker(symbol: string): Promise<void> {
        const canonical = symbol.toUpperCase();
        if (this.bookTickerSymbols.has(canonical)) return;
        this.bookTickerSymbols.add(canonical);
        console.log(
            `[BinanceStream] + bookTicker ${canonical} (pending rebuild, set size: ${this.bookTickerSymbols.size})`,
        );
        this.scheduleTickerRebuild();
    }

    /**
     * Unsubscribe from the @bookTicker stream for a symbol.
     * Debounced the same way as subscribe. If the set becomes empty after
     * the debounce window, the shard is torn down entirely.
     */
    public async unsubscribeBookTicker(symbol: string): Promise<void> {
        const canonical = symbol.toUpperCase();
        if (!this.bookTickerSymbols.has(canonical)) return;
        this.bookTickerSymbols.delete(canonical);
        console.log(
            `[BinanceStream] - bookTicker ${canonical} (pending rebuild, set size: ${this.bookTickerSymbols.size})`,
        );
        this.scheduleTickerRebuild();
    }

    /**
     * Debounce helper. Multiple subscribe/unsubscribe calls within 250 ms
     * collapse into a single rebuild with the final symbol set. Prevents the
     * cold-start race where 18 rapid calls torn down and re-created the
     * WebSocket 18 times, crashing the worker when terminate() was called on
     * a socket still in the CONNECTING state.
     */
    private scheduleTickerRebuild(): void {
        if (this.tickerRebuildTimer) return; // Already scheduled — next rebuild picks up the latest set.
        this.tickerRebuildTimer = setTimeout(() => {
            this.tickerRebuildTimer = null;
            this.rebuildTickerShard();
        }, this.TICKER_REBUILD_DEBOUNCE_MS);
    }

    private rebuildTickerShard(): void {
        this.tearDownTickerShard();

        const streams = Array.from(this.bookTickerSymbols).map(
            (s) => `${s.toLowerCase()}@bookTicker`,
        );

        if (streams.length === 0) {
            console.log('[BinanceStream] Ticker shard: no symbols, skipping connect');
            return;
        }

        console.log(
            `[BinanceStream] Ticker shard: rebuilding with ${streams.length} symbols`,
        );

        this.tickerShard = {
            id: 9999, // distinct id for logs
            ws: null,
            streams,
            isConnected: false,
            reconnectTimer: null,
            reconnectAttempts: 0,
        };

        this.connectShard(this.tickerShard);
    }

    /**
     * Safely tear down the ticker shard.
     * Uses `close()` instead of `terminate()` when the WebSocket is still in
     * the CONNECTING state, because terminate() on a CONNECTING socket throws
     * in recent versions of the `ws` library and was crashing the worker.
     */
    private tearDownTickerShard(): void {
        if (!this.tickerShard) return;

        if (this.tickerShard.reconnectTimer) {
            clearTimeout(this.tickerShard.reconnectTimer);
            this.tickerShard.reconnectTimer = null;
        }

        const ws = this.tickerShard.ws;
        if (ws) {
            // Remove listeners first so a graceful close doesn't trigger
            // the reconnect handler.
            try {
                ws.removeAllListeners();
            } catch {}

            try {
                if (ws.readyState === WebSocket.CONNECTING) {
                    // terminate() on a CONNECTING socket throws in some ws versions.
                    // close() is the safe way to abort a pending connection.
                    ws.close();
                } else if (
                    ws.readyState === WebSocket.OPEN ||
                    ws.readyState === WebSocket.CLOSING
                ) {
                    ws.terminate();
                }
                // CLOSED sockets need no action.
            } catch (err) {
                console.warn('[BinanceStream] Ignored error while tearing down ticker shard:', err);
            }
        }

        this.tickerShard = null;
    }

    /**
     * Watchdog: Monitor global data flow
     */
    private startWatchdog(): void {
        this.stopWatchdog();

        this.watchdogInterval = setInterval(() => {
            const silenceDuration = Date.now() - this.lastMessageTime;

            // If no message from ANY shard for > 2 mins (120s), something is wrong globally
            // Or we check individual shards?
            // For simplicity, if global silence > 120s, reconnect ALL shards
            if (silenceDuration > 120000 && this.shards.length > 0) {
                console.error(
                    `[BinanceStream] ⚠️ Global Watchdog Timeout: No data for ${Math.floor(silenceDuration / 1000)}s. Resetting all connections...`
                );

                // Force reconnect all
                this.shards.forEach((shard) => {
                    if (shard.ws) shard.ws.terminate();
                });

                // Reset timer to avoid double-triggering before they reconnect
                this.lastMessageTime = Date.now();
            }
        }, 30000); // Check every 30s
    }

    private stopWatchdog(): void {
        if (this.watchdogInterval) {
            clearInterval(this.watchdogInterval);
            this.watchdogInterval = null;
        }
    }

    /**
     * Disconnect all shards (including the ticker shard)
     */
    public disconnect(): void {
        this.stopWatchdog();
        if (this.tickerRebuildTimer) {
            clearTimeout(this.tickerRebuildTimer);
            this.tickerRebuildTimer = null;
        }
        this.shards.forEach((shard) => {
            if (shard.reconnectTimer) clearTimeout(shard.reconnectTimer);
            if (shard.ws) {
                shard.ws.removeAllListeners(); // Prevent reconnect triggers
                try {
                    if (shard.ws.readyState === WebSocket.CONNECTING) {
                        shard.ws.close();
                    } else {
                        shard.ws.terminate();
                    }
                } catch {}
            }
        });
        this.shards = [];
        this.tearDownTickerShard();
        this.bookTickerSymbols.clear();
    }

    /**
     * Get connection status
     */
    public getStatus(): { connected: boolean; subscriptionCount: number; shards: number } {
        let count = 0;
        let connectedShards = 0;

        this.subscriptions.forEach((tfs) => (count += tfs.size));
        this.shards.forEach((s) => {
            if (s.isConnected) connectedShards++;
        });

        return {
            connected: connectedShards > 0 && connectedShards === this.shards.length,
            subscriptionCount: count,
            shards: this.shards.length,
        };
    }
}

// Singleton instance
export const binanceStream = new BinanceStreamManager();
