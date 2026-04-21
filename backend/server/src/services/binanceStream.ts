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


interface StreamShard {
    id: number;
    ws: WebSocket | null;
    streams: string[];
    isConnected: boolean;
    reconnectTimer: NodeJS.Timeout | null;
    reconnectAttempts: number;
    lastMessageTime: number; // per-shard silence detection
}

export class BinanceStreamManager {
    // Configuration
    private baseUrl = 'wss://fstream.binance.com/stream?streams=';
    private readonly STREAMS_PER_CONNECTION = 200;
    private readonly MAX_RECONNECT_DELAY = 60000; // 60 seconds max backoff

    // State
    private shards: StreamShard[] = [];
    private subscriptions: Map<string, Set<string>> = new Map(); // symbol -> Set<timeframe>

    // Watchdog and Debounce
    private lastMessageTime: number = Date.now();
    private watchdogInterval: NodeJS.Timeout | null = null;

    // Log throttling — aggregate candle-close counts, flush once per minute.
    private candleCloseCounts: Map<string, number> = new Map();
    private candleLogFlusher: NodeJS.Timeout | null = null;

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
            lastMessageTime: Date.now(),
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
                shard.lastMessageTime = Date.now();
                this.lastMessageTime = Date.now();
            });

            shard.ws.on('message', (data: WebSocket.Data) => {
                shard.lastMessageTime = Date.now();
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

            // SUBSCRIBE/UNSUBSCRIBE ack: {"result":null,"id":<n>} on success,
            // or {"error":{...},"id":<n>} on failure. Log failures — silent
            // failures would leave the stream tracked but not delivering.
            if ('result' in parsed && 'id' in parsed) {
                if (parsed.error) {
                    console.error(
                        `[BinanceStream] SUBSCRIBE request ${parsed.id} failed:`,
                        parsed.error,
                    );
                }
                return;
            }

            if (!parsed.data) return;

            // Kline event: { stream: "btcusdt@kline_1h", data: { e:'kline', k: {...} } }
            if (parsed.data.e === 'kline') {
                const kline = parsed.data as KlineMessage;
                // Symbols are now Binance-native (BTCUSDT). No slash, no .P.
                const symbol = kline.s.toUpperCase();
                const timeframe = kline.k.i;

                // Emit live price tick on EVERY kline update for SL/TP monitoring.
                // kline.k.c is the current close price = last trade price.
                const livePrice = parseFloat(kline.k.c);
                if (!Number.isNaN(livePrice)) {
                    eventBus.emitPriceTick(symbol, livePrice, livePrice);
                }

                // Process candle close for signal generation
                if (kline.k.x) {
                    const candle: Candle = {
                        time: Math.floor(kline.k.t / 1000),
                        open: parseFloat(kline.k.o),
                        high: parseFloat(kline.k.h),
                        low: parseFloat(kline.k.l),
                        close: livePrice,
                        volume: parseFloat(kline.k.v),
                    };

                    // Aggregate per-timeframe counts; flush summary once a minute.
                    const key = timeframe;
                    this.candleCloseCounts.set(key, (this.candleCloseCounts.get(key) || 0) + 1);

                    eventBus.emitCandleClosed(symbol, timeframe, candle);
                }
                return;
            }
        } catch (error) {
            console.error('[BinanceStream] Error parsing message:', error);
        }
    }

    /**
     * Watchdog: Per-shard silence detection. Each shard tracks its own
     * last-message time — a single silent shard gets reconnected without
     * disturbing the others.
     */
    private startWatchdog(): void {
        this.stopWatchdog();
        const SILENCE_THRESHOLD = 120_000; // 2 minutes

        // Candle-close log flusher: summary every 60s instead of per-candle spam.
        this.candleLogFlusher = setInterval(() => {
            if (this.candleCloseCounts.size === 0) return;
            const parts: string[] = [];
            for (const [tf, count] of this.candleCloseCounts) parts.push(`${tf}×${count}`);
            console.log(`[BinanceStream] 🕯️ Candles closed (last 60s): ${parts.join(', ')}`);
            this.candleCloseCounts.clear();
        }, 60_000);

        this.watchdogInterval = setInterval(() => {
            const now = Date.now();
            for (const shard of this.shards) {
                if (!shard.isConnected) continue; // already in reconnect flow
                const silence = now - shard.lastMessageTime;
                if (silence > SILENCE_THRESHOLD) {
                    console.error(
                        `[BinanceStream] ⚠️ Shard ${shard.id} silent for ${Math.floor(silence / 1000)}s — reconnecting`,
                    );
                    shard.lastMessageTime = now; // prevent re-trigger before reconnect
                    try {
                        if (shard.ws) shard.ws.terminate();
                    } catch {}
                }
            }
        }, 30_000); // Check every 30s
    }

    private stopWatchdog(): void {
        if (this.watchdogInterval) {
            clearInterval(this.watchdogInterval);
            this.watchdogInterval = null;
        }
        if (this.candleLogFlusher) {
            clearInterval(this.candleLogFlusher);
            this.candleLogFlusher = null;
        }
    }

    /**
     * Disconnect all shards
     */
    public disconnect(): void {
        this.stopWatchdog();
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
    }

    /**
     * Ensure a symbol has at least a 1m kline stream for live price ticks.
     * Used by the execution engine to guarantee SL/TP monitoring coverage
     * for symbols that might not have an active strategy assignment.
     *
     * Uses Binance's dynamic SUBSCRIBE WebSocket op so we DO NOT tear down
     * an existing shard (which would lose ticks for every other symbol on
     * that shard for ~5s during reconnect). Awaits the socket 'open' event
     * before returning so the caller has the guarantee that ticks can flow.
     */
    public async ensureKlineStream(symbol: string): Promise<void> {
        const canonical = symbol.toUpperCase();
        if (this.subscriptions.has(canonical) && this.subscriptions.get(canonical)!.size > 0) {
            return; // Already has kline coverage
        }
        console.log(`[BinanceStream] Adding 1m kline for ${canonical} (SL/TP monitoring)`);
        if (!this.subscriptions.has(canonical)) {
            this.subscriptions.set(canonical, new Set());
        }
        this.subscriptions.get(canonical)!.add('1m');

        const stream = `${canonical.toLowerCase()}@kline_1m`;
        const lastShard = this.shards[this.shards.length - 1];

        if (lastShard && lastShard.streams.length < this.STREAMS_PER_CONNECTION) {
            // Add to the last shard. Track the stream in the shard's list
            // for reconnect-replay, but use dynamic SUBSCRIBE to avoid a
            // full teardown.
            lastShard.streams.push(stream);

            if (lastShard.ws && lastShard.ws.readyState === WebSocket.OPEN) {
                // Send SUBSCRIBE frame — Binance adds the stream without
                // dropping existing subscriptions.
                lastShard.ws.send(JSON.stringify({
                    method: 'SUBSCRIBE',
                    params: [stream],
                    id: Date.now(),
                }));
                return;
            }
            // Socket is CONNECTING or CLOSED. The original connect URL was
            // built BEFORE we pushed the new stream, so we need to send
            // SUBSCRIBE once it opens to pick up the newly-added stream.
            await this.waitForShardOpen(lastShard);
            if (lastShard.ws && lastShard.ws.readyState === WebSocket.OPEN) {
                lastShard.ws.send(JSON.stringify({
                    method: 'SUBSCRIBE',
                    params: [stream],
                    id: Date.now(),
                }));
            }
            return;
        }

        // Need a fresh shard (last one full, or none exist yet).
        const newShard: StreamShard = {
            id: this.shards.length + 1,
            ws: null,
            streams: [stream],
            isConnected: false,
            reconnectTimer: null,
            reconnectAttempts: 0,
            lastMessageTime: Date.now(),
        };
        this.shards.push(newShard);
        this.connectShard(newShard);
        await this.waitForShardOpen(newShard);
    }

    /**
     * Await a shard's 'open' event, with a timeout so we never block forever.
     * Resolves immediately if already open.
     */
    private waitForShardOpen(shard: StreamShard, timeoutMs = 10_000): Promise<void> {
        return new Promise((resolve) => {
            if (shard.ws && shard.ws.readyState === WebSocket.OPEN) {
                resolve();
                return;
            }
            const timer = setTimeout(() => {
                console.warn(`[BinanceStream] [Shard ${shard.id}] waitForOpen timeout after ${timeoutMs}ms`);
                resolve();
            }, timeoutMs);
            const check = () => {
                if (shard.ws && shard.ws.readyState === WebSocket.OPEN) {
                    clearTimeout(timer);
                    resolve();
                } else {
                    setTimeout(check, 100);
                }
            };
            check();
        });
    }

    /**
     * Check if a symbol has any active kline subscription.
     */
    public hasKlineStream(symbol: string): boolean {
        const canonical = symbol.toUpperCase();
        const tfs = this.subscriptions.get(canonical);
        return !!tfs && tfs.size > 0;
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
