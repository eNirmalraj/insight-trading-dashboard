// backend/server/src/services/symbolService.ts
// Canonical Symbol type for cross-boundary consistency.
// Internal format: { symbol: 'BTCUSDT', market: 'spot' | 'futures' }

import { Market } from '../constants/enums';

export interface Symbol {
    symbol: string;      // 'BTCUSDT' — Binance-native, no slash, no .P
    market: Market;      // 'spot' or 'futures'
}

/**
 * Parse any legacy or external symbol format into canonical Symbol.
 * Accepts: 'BTC/USDT.P', 'BTCUSDT.P', 'BTC/USDT', 'BTCUSDT', 'btcusdt'
 */
export function parseSymbol(input: string, fallbackMarket: Market = Market.FUTURES): Symbol {
    if (!input) throw new Error('parseSymbol: empty input');

    let raw = input.trim().toUpperCase();

    // Detect market from .P suffix (legacy futures marker)
    let market: Market = fallbackMarket;
    if (raw.endsWith('.P')) {
        market = Market.FUTURES;
        raw = raw.slice(0, -2);
    }

    // Strip CCXT slash: BTC/USDT -> BTCUSDT
    raw = raw.replace('/', '');

    return { symbol: raw, market };
}

/**
 * Convert canonical Symbol to CCXT slash format: BTC/USDT
 * Assumes USDT quote currency (most common on Binance).
 */
export function toCCXT(sym: Symbol): string {
    const s = sym.symbol;
    const quotes = ['USDT', 'BUSD', 'USDC', 'BTC', 'ETH'];
    for (const q of quotes) {
        if (s.endsWith(q)) {
            const base = s.slice(0, -q.length);
            return `${base}/${q}`;
        }
    }
    return s;
}

/**
 * Convert canonical Symbol to Binance WebSocket lowercase stream name.
 */
export function toBinanceWS(sym: Symbol): string {
    return sym.symbol.toLowerCase();
}

/**
 * Convert canonical Symbol to display string.
 */
export function toDisplay(sym: Symbol): string {
    return sym.symbol;
}

/**
 * Serialize to DB: returns { symbol, market } — callers persist as two columns.
 */
export function toDB(sym: Symbol): { symbol: string; market: string } {
    return { symbol: sym.symbol, market: sym.market };
}

/**
 * Equality check (market-aware).
 */
export function equals(a: Symbol, b: Symbol): boolean {
    return a.symbol === b.symbol && a.market === b.market;
}
