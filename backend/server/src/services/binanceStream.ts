// backend/server/src/services/binanceStream.ts
// Binance WebSocket Connection for Real-Time Candle Data

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

export class BinanceStreamManager {
    private ws: WebSocket | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 10;
    private reconnectDelay = 5000;
    private isConnected = false;
    private subscriptions: Map<string, Set<string>> = new Map(); // symbol -> Set<timeframe>
    private onCandleCloseCallback: CandleCloseCallback | null = null;
    private candleBuffer: Map<string, Candle[]> = new Map(); // symbol_timeframe -> candles

    private lastMessageTime: number = 0;
    private watchdogInterval: NodeJS.Timeout | null = null;

    private baseUrl = 'wss://stream.binance.com:9443/stream?streams=';

    /**
     * Set the region for Binance Stream (US or Global)
     */
    public setRegion(isUS: boolean): void {
        if (isUS) {
            this.baseUrl = 'wss://stream.binance.us:9443/stream?streams=';
            console.log('[BinanceStream] Switched to Binance US WebSocket');
        } else {
            this.baseUrl = 'wss://stream.binance.com:9443/stream?streams=';
            console.log('[BinanceStream] Switched to Binance Global WebSocket');
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
        // Store subscriptions
        for (const symbol of symbols) {
            if (!this.subscriptions.has(symbol)) {
                this.subscriptions.set(symbol, new Set());
            }
            for (const tf of timeframes) {
                this.subscriptions.get(symbol)!.add(tf);
            }
        }

        // Build stream list
        await this.connect();
    }

    /**
     * Connect to Binance WebSocket
     */
    private async connect(): Promise<void> {
        if (this.isConnected) {
            console.log('[BinanceStream] Already connected');
            return;
        }

        // Build stream names
        const streams: string[] = [];
        this.subscriptions.forEach((timeframes, symbol) => {
            timeframes.forEach(tf => {
                const stream = `${symbol.toLowerCase()}@kline_${tf.toLowerCase()}`;
                streams.push(stream);
            });
        });

        if (streams.length === 0) {
            console.log('[BinanceStream] No subscriptions to connect');
            return;
        }

        // Binance has a limit of 1024 streams per connection
        // For now, we'll use first batch. For production, split into multiple connections.
        const limitedStreams = streams.slice(0, 200);
        const url = this.baseUrl + limitedStreams.join('/');

        console.log(`[BinanceStream] Connecting to ${limitedStreams.length} streams...`);

        try {
            this.ws = new WebSocket(url);

            this.ws.on('open', () => {
                console.log('[BinanceStream] ✅ Connected to Binance WebSocket');
                this.isConnected = true;
                this.reconnectAttempts = 0;

                // Start Watchdog
                this.lastMessageTime = Date.now();
                this.startWatchdog();
            });

            this.ws.on('message', (data: WebSocket.Data) => {
                this.handleMessage(data);
            });

            this.ws.on('close', () => {
                console.log('[BinanceStream] Connection closed');
                this.isConnected = false;
                this.stopWatchdog();
                this.scheduleReconnect();
            });

            this.ws.on('error', (error) => {
                console.error('[BinanceStream] WebSocket error:', error.message);
            });
        } catch (error) {
            console.error('[BinanceStream] Connection error:', error);
            this.scheduleReconnect();
        }
    }

    /**
     * Handle incoming WebSocket message
     */
    private handleMessage(data: WebSocket.Data): void {
        this.lastMessageTime = Date.now(); // Update heartbeat

        try {
            const parsed = JSON.parse(data.toString());

            // Combined stream format: { stream: "btcusdt@kline_1h", data: {...} }
            if (parsed.data && parsed.data.e === 'kline') {
                const kline = parsed.data as KlineMessage;
                const symbol = kline.s.toUpperCase();
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
     * Start the Watchdog Timer to detect zombie connections
     */
    private startWatchdog(): void {
        this.stopWatchdog();

        // Check every 30 seconds
        this.watchdogInterval = setInterval(() => {
            const silenceDuration = Date.now() - this.lastMessageTime;

            // If no message for > 2 minutes (120000ms), assume dead connection
            if (silenceDuration > 120000) {
                console.error(`[BinanceStream] ⚠️ Watchdog Timeout: No data for ${Math.floor(silenceDuration / 1000)}s. Terminating connection...`);
                if (this.ws) {
                    this.ws.terminate(); // Emit 'close' event
                }
            }
        }, 30000);
    }

    /**
     * Stop the Watchdog Timer
     */
    private stopWatchdog(): void {
        if (this.watchdogInterval) {
            clearInterval(this.watchdogInterval);
            this.watchdogInterval = null;
        }
    }

    /**
     * Schedule reconnection attempt
     */
    private scheduleReconnect(): void {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[BinanceStream] Max reconnection attempts reached');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * this.reconnectAttempts;

        console.log(`[BinanceStream] Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})`);

        setTimeout(() => {
            this.connect();
        }, delay);
    }

    /**
     * Disconnect from WebSocket
     */
    public disconnect(): void {
        this.stopWatchdog();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
    }

    /**
     * Get connection status
     */
    public getStatus(): { connected: boolean; subscriptionCount: number } {
        let count = 0;
        this.subscriptions.forEach(tfs => count += tfs.size);

        return {
            connected: this.isConnected,
            subscriptionCount: count
        };
    }
}

// Singleton instance
export const binanceStream = new BinanceStreamManager();
