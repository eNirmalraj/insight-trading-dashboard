/**
 * @insight/types — Candle & Market Data Types
 * Universal OHLCV data structures used across all packages.
 */

/** OHLCV candlestick bar */
export interface Candle {
    time: number; // Unix timestamp in seconds
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
}

/** A coordinate on the chart (time + price) */
export interface Point {
    time: number;
    price: number;
}

/** Supported chart timeframes */
export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1H' | '4H' | '1D';

/** View state for chart scrolling/zooming */
export interface ViewState {
    startIndex: number;
    visibleCandles: number;
}

/** Price range visible on the y-axis */
export interface PriceRange {
    min: number;
    max: number;
}

/** Tooltip data for crosshair */
export interface TooltipData {
    visible: boolean;
    x: number;
    y: number;
    data: Candle | null;
}
