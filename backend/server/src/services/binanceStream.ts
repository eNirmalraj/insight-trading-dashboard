import WebSocket from 'ws';
import { Candle } from '../engine/indicators';
import { eventBus } from '../utils/eventBus';

export interface KlineMessage {
    e: string;      // Event type
    E: number;      // Event time
    s: string;      // Symbol
    k: {
        t: number;  // Kline start time
        T: number;  // Kline close time
        s: string;  // Symbol
        i: string;  // Interval
        o: string;  // Open price
        c: string;  // Close price
        h: string;  // High price
        l: string;  // Low price
        v: string;  // Base asset volume
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
    private readonly STREAMS_PER_CONNECTION = 50;
    private readonly MAX_RECONNECT_DELAY = 60000; // 60 seconds max backoff

    // State
    private shards: StreamShard[] = [];
    private subscriptions: Map<string, Set<string>> = new Map(); // symbol -> Set<timeframe>
    private onCandleCloseCallback: CandleCloseCallback | null = null;

    // Watchdog
    private lastMessageTime: number = Date.now();
    private watchdogInterval: NodeJS.Timeout | null = null;

    /**
     * Set the region for Binance Stream (US or Global)
     */
    public setRegion(isUS: boolean): void {
        if (isUS) {
            console.warn('[BinanceStream] Warning: Binance US Futures stream not fully configured, using global fstream as fallback');
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
            // Sanitize symbol: BTC/USDT.P -> btcusdt
            const cleanSymbol = symbol.replace('.P', '').replace('/', '').toLowerCase();
            tfs.forEach(tf => {
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
            reconnectAttempts: 0
        }));

        console.log(`[BinanceStream] Created ${this.shards.length} connection shards`);

        // 4. Connect all shards
        this.shards.forEach(shard => this.connectShard(shard));

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
            try { shard.ws.terminate(); } catch (e) { }
        }

        const url = this.baseUrl + shard.streams.join('/');
        console.log(`[BinanceStream] [Shard ${shard.id}] Connecting to ${shard.streams.length} streams...`);

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

        console.log(`[BinanceStream] [Shard ${shard.id}] Reconnecting in ${delay / 1000}s (Attempt ${shard.reconnectAttempts})...`);

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

            // Combined stream format: { stream: "btcusdt@kline_1h", data: {...} }
            if (parsed.data && parsed.data.e === 'kline') {
                const kline = parsed.data as KlineMessage;
                let symbol = kline.s.toUpperCase();

                // Normalize Futures symbols to match system format: BTC/USDT.P
                if (this.baseUrl.includes('fstream') && symbol.endsWith('USDT')) {
                    const base = symbol.substring(0, symbol.length - 4);
                    symbol = `${base}/USDT.P`;
                }

                const timeframe = kline.k.i;
                const currentPrice = parseFloat(kline.k.c);

                // Emit tick event for real-time monitoring
                eventBus.emitPriceTick(symbol, currentPrice);

                // Only process if candle is closed
                if (kline.k.x) {
                    const candle: Candle = {
                        time: Math.floor(kline.k.t / 1000),
                        open: parseFloat(kline.k.o),
                        high: parseFloat(kline.k.h),
                        low: parseFloat(kline.k.l),
                        close: currentPrice,
                        volume: parseFloat(kline.k.v)
                    };

                    console.log(`[BinanceStream] 🕯️ Candle closed: ${symbol} ${timeframe} @ ${candle.close}`);
                    // TRACE LOG
                    console.log(`[TRACE] Candle closed:`, symbol, timeframe, candle.time);

                    // Emit event via eventBus
                    eventBus.emitCandleClosed(symbol, timeframe, candle);

                    if (this.onCandleCloseCallback) {
                        this.onCandleCloseCallback(symbol, timeframe, candle);
                    }
                }
            }
        } catch (error) {
            console.error('[BinanceStream] Error parsing message:', error);
        }
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
                console.error(`[BinanceStream] ⚠️ Global Watchdog Timeout: No data for ${Math.floor(silenceDuration / 1000)}s. Resetting all connections...`);

                // Force reconnect all
                this.shards.forEach(shard => {
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
     * Disconnect all shards
     */
    public disconnect(): void {
        this.stopWatchdog();
        this.shards.forEach(shard => {
            if (shard.reconnectTimer) clearTimeout(shard.reconnectTimer);
            if (shard.ws) {
                shard.ws.removeAllListeners(); // Prevent reconnect triggers
                shard.ws.terminate();
            }
        });
        this.shards = [];
    }

    /**
     * Get connection status
     */
    public getStatus(): { connected: boolean; subscriptionCount: number; shards: number } {
        let count = 0;
        let connectedShards = 0;

        this.subscriptions.forEach(tfs => count += tfs.size);
        this.shards.forEach(s => {
            if (s.isConnected) connectedShards++;
        });

        return {
            connected: connectedShards > 0 && connectedShards === this.shards.length,
            subscriptionCount: count,
            shards: this.shards.length
        };
    }
}

// Singleton instance
export const binanceStream = new BinanceStreamManager();
