// src/services/marketRealtimeService.ts
import { Candle } from '../types/market';
import { normalizeSymbol, normalizeTimeframe } from './marketDataService';

const BINANCE_WS_URL = 'wss://stream.binance.com:9443/ws';
const BINANCE_FUTURES_WS_URL = 'wss://fstream.binance.com/ws';
const USE_MOCK = import.meta.env.VITE_USE_MOCK_API === 'true';

// --- Types ---
type TickCallback = (candle: Candle) => void;
type TickerCallback = (data: { price: number; changePercent: number; volume: number; change: number }) => void;

class MarketRealtimeService {
    // Top-level Chart Socket State
    private chartSocket: WebSocket | null = null;
    private activeSubscription: string | null = null;
    private activeSymbol: string = '';
    private activeCallback: TickCallback | null = null;
    private reconnectTimer: any = null;
    private isIntentionalClose: boolean = false;

    // Watchlist Ticker State (Separate connections)
    private tickerSocketSpot: WebSocket | null = null;
    private tickerSocketFutures: WebSocket | null = null;
    private tickerCallbacks = new Map<string, Set<TickerCallback>>();
    private tickerUpdateTimeout: any = null;
    private tickerReconnectTimerSpot: any = null;
    private tickerReconnectTimerFutures: any = null;
    private lastPrices = new Map<string, number>(); // Cache of latest prices

    private connectTimer: any = null;

    // --- Chart Subscription (Single Instance Rule) ---

    /**
     * Connects to the Binance WebSocket for a specific symbol/timeframe.
     * Ensures only ONE chart socket is active at a time.
     */
    public connect(symbol: string, timeframe: string, onTick: TickCallback): void {
        if (USE_MOCK) {
            console.log('[Realtime] Mock mode enabled, skipping WebSocket connection');
            return;
        }

        // Clear any pending connection attempt
        if (this.connectTimer) clearTimeout(this.connectTimer);

        // Debounce connection to prevent "Ping after close" race conditions on rapid switching
        this.connectTimer = setTimeout(() => {
            const cleanSymbol = normalizeSymbol(symbol).toLowerCase();
            const cleanTf = normalizeTimeframe(timeframe);
            const subscription = `${cleanSymbol}@kline_${cleanTf}`;

            // If already connected to this EXACT subscription, just update the callback
            if (this.chartSocket && this.chartSocket.readyState === WebSocket.OPEN && this.activeSubscription === subscription) {
                this.activeCallback = onTick;
                return;
            }

            // Otherwise, full reconnect required
            this.disconnect(); // Safe cleanup of existing

            this.activeSymbol = symbol;
            this.activeSubscription = subscription;
            this.activeCallback = onTick;
            this.isIntentionalClose = false;

            this._initChartSocket();
        }, 300); // 300ms debounce
    }

    /**
     * Fully disconnects the active chart WebSocket and cleans up state.
     */
    public disconnect(): void {
        this.isIntentionalClose = true;
        this.activeSubscription = null;
        this.activeCallback = null;
        this.activeSymbol = '';

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.connectTimer) {
            clearTimeout(this.connectTimer);
            this.connectTimer = null;
        }

        if (this.chartSocket) {
            // Remove listeners to prevent zombie events
            this.chartSocket.onclose = null;
            this.chartSocket.onerror = null;
            this.chartSocket.onmessage = null;
            this.chartSocket.onopen = null;

            this.chartSocket.close();
            this.chartSocket = null;
        }
    }

    private _initChartSocket(): void {
        if (!this.activeSubscription) return;

        try {
            const isFutures = this.activeSymbol.toUpperCase().endsWith('.P');
            const wsPfx = isFutures ? BINANCE_FUTURES_WS_URL : BINANCE_WS_URL;
            const url = `${wsPfx}/${this.activeSubscription}`;

            console.log(`[Chart] Connecting: ${url}`);
            this.chartSocket = new WebSocket(url);

            this.chartSocket.onopen = () => {
                console.log('[Chart] Connected');
                if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
            };

            let lastTickTime = 0;
            const THROTTLE_MS = 100; // Cap updates at 10fps

            this.chartSocket.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (this.activeCallback && msg.e === 'kline') {
                        const now = Date.now();
                        if (now - lastTickTime < THROTTLE_MS) return; // Drop frame

                        lastTickTime = now;
                        const k = msg.k;
                        this.activeCallback({
                            time: Math.floor(k.t / 1000),
                            open: parseFloat(k.o),
                            high: parseFloat(k.h),
                            low: parseFloat(k.l),
                            close: parseFloat(k.c),
                            volume: parseFloat(k.v)
                        });
                    }
                } catch (err) {
                    console.error('[Chart] Parse error:', err);
                }
            };

            this.chartSocket.onerror = (err) => {
                console.error('[Chart] Error:', err);
            };

            this.chartSocket.onclose = () => {
                if (!this.isIntentionalClose) {
                    console.warn('[Chart] Unexpected close, reconnecting in 2s...');
                    this.reconnectTimer = setTimeout(() => this._initChartSocket(), 2000);
                } else {
                    console.log('[Chart] Disconnected cleanly');
                }
            };

        } catch (err) {
            console.error('[Chart] Init failed:', err);
            // Retry safety
            if (!this.isIntentionalClose) {
                this.reconnectTimer = setTimeout(() => this._initChartSocket(), 5000);
            }
        }
    }

    // --- Watchlist/Ticker Logic (Preserved & Cleaned) ---

    public subscribeToTicker(symbol: string, callback: TickerCallback): void {
        if (USE_MOCK) return;

        const cleanSymbol = normalizeSymbol(symbol).toLowerCase();

        if (!this.tickerCallbacks.has(cleanSymbol)) {
            this.tickerCallbacks.set(cleanSymbol, new Set());
        }
        this.tickerCallbacks.get(cleanSymbol)?.add(callback);

        this.scheduleTickerUpdate();
    }

    public unsubscribeFromTicker(symbol: string, callback: TickerCallback): void {
        const cleanSymbol = normalizeSymbol(symbol).toLowerCase();
        const callbacks = this.tickerCallbacks.get(cleanSymbol);

        if (callbacks) {
            callbacks.delete(callback);
            if (callbacks.size === 0) {
                this.tickerCallbacks.delete(cleanSymbol);
                this.scheduleTickerUpdate();
            }
        }
    }

    private scheduleTickerUpdate(): void {
        if (this.tickerUpdateTimeout) clearTimeout(this.tickerUpdateTimeout);
        // Debounce connection reconstruction to 500ms
        this.tickerUpdateTimeout = setTimeout(() => this._connectTickerStreams(), 500);
    }

    public ensureConnection(): void {
        this._connectTickerStreams();
    }

    private _connectTickerStreams(): void {
        // We now use GLOBAL STREAMS for all symbols to avoid reconnecting and URL limits
        // 1. Ensure Spot Global Socket is open
        if (!this.tickerSocketSpot || this.tickerSocketSpot.readyState !== WebSocket.OPEN) {
            // Combined stream format: stream name is !miniTicker@arr
            const url = `wss://stream.binance.com:9443/stream?streams=!miniTicker@arr`;
            this._createTickerSocket(url, 'SPOT', (socket) => this.tickerSocketSpot = socket);
        }

        // 2. Ensure Futures Global Socket is open
        if (!this.tickerSocketFutures || this.tickerSocketFutures.readyState !== WebSocket.OPEN) {
            const url = `wss://fstream.binance.com/stream?streams=!miniTicker@arr`;
            this._createTickerSocket(url, 'FUTURES', (socket) => this.tickerSocketFutures = socket);
        }
    }

    private _createTickerSocket(url: string, type: 'SPOT' | 'FUTURES', setSocket: (s: WebSocket) => void) {
        try {
            console.log(`[Ticker ${type}] Connecting global stream...`);
            const ws = new WebSocket(url);
            setSocket(ws);

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);

                    // Handle Combined Stream format: { stream: "...", data: [...] }
                    if (msg.stream && msg.stream.endsWith('miniTicker@arr')) {
                        const tickerList = msg.data;
                        if (Array.isArray(tickerList)) {
                            tickerList.forEach((tickerData: any) => {
                                this._processTickerData(tickerData, type);
                            });
                        }
                    }
                } catch (e) {
                    console.error(`[Ticker ${type}] Parse error`, e);
                }
            };

            ws.onclose = () => {
                console.warn(`[Ticker ${type}] Closed, reconnecting...`);
                // Simple reconnect logic
                setTimeout(() => this._connectTickerStreams(), 5000);
            };

            ws.onerror = (e) => console.error(`[Ticker ${type}] Error`, e);

        } catch (e) {
            console.error(`[Ticker ${type}] Connection Failed`, e);
        }
    }

    private _processTickerData(data: any, type: 'SPOT' | 'FUTURES') {
        let symbol = data.s.toLowerCase();
        if (type === 'FUTURES') symbol += '.p'; // Check if futures symbols need .p? 
        // Note: Binance Futures stream sends symbol as "BTCUSDT". 
        // Our app expects "btcusdt.p" for futures to distinguish.
        // Yes, we append .p manually for internal mapping.

        // Update Global Cache
        this.lastPrices.set(symbol, parseFloat(data.c));

        const callbacks = this.tickerCallbacks.get(symbol);
        if (callbacks && callbacks.size > 0) {
            const price = parseFloat(data.c);
            const open = parseFloat(data.o);
            const baseVolume = parseFloat(data.v);
            const change = price - open;
            const changePercent = open !== 0 ? (change / open) * 100 : 0;

            callbacks.forEach(cb => cb({ price, changePercent, volume: baseVolume, change }));
        }
    }

    public getLastPrice(symbol: string): number | undefined {
        return this.lastPrices.get(normalizeSymbol(symbol).toLowerCase());
    }
}

export const marketRealtimeService = new MarketRealtimeService();

// Legacy adapter exports for existing code (if any other files needed them)
// But ideally we replace usages.
export const subscribeToSymbol = (s: string, tf: string, cb: TickCallback) => marketRealtimeService.connect(s, tf, cb);
export const unsubscribe = () => marketRealtimeService.disconnect();
export const subscribeToTicker = (s: string, cb: TickerCallback) => marketRealtimeService.subscribeToTicker(s, cb);
export const unsubscribeFromTicker = (s: string, cb: TickerCallback) => marketRealtimeService.unsubscribeFromTicker(s, cb);
