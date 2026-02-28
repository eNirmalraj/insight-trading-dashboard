/**
 * Chart Indicator Adapters
 * 
 * Thin adapter layer that bridges CandlestickChart.tsx (Candle[] based)
 * to @insight/computation indicators (Float64Array / structure-of-arrays).
 * 
 * ALL indicator math lives in @insight/computation/src/indicators/ — this file
 * only converts data formats. Zero duplicate math.
 */

import { Candle, Drawing } from './types';
import {
    sma, ema,
    rsi, stoch, cci, mfi, macd,
    atr, bollinger, supertrend,
    vwap, obv
} from '@insight/computation';

// ─── Utility ───────────────────────────────────────────────────────

/** Convert Float64Array (NaN = missing) → (number | null)[] for chart rendering */
function toNullable(arr: Float64Array): (number | null)[] {
    return Array.from(arr, v => Number.isNaN(v) ? null : v);
}

export const parseRgba = (color: string): { r: number; g: number; b: number; a: number } => {
    if (color.startsWith('rgba')) {
        const parts = color.substring(color.indexOf('(') + 1, color.lastIndexOf(')')).split(/,\s*/);
        return {
            r: parseInt(parts[0], 10),
            g: parseInt(parts[1], 10),
            b: parseInt(parts[2], 10),
            a: parseFloat(parts[3]),
        };
    }
    if (color.startsWith('#')) {
        let hex = color.slice(1);
        if (hex.length === 3) {
            hex = hex.split('').map(char => char + char).join('');
        }
        if (hex.length === 6) {
            const bigint = parseInt(hex, 16);
            return {
                r: (bigint >> 16) & 255,
                g: (bigint >> 8) & 255,
                b: bigint & 255,
                a: 1,
            };
        }
    }
    return { r: 0, g: 0, b: 0, a: 1 };
};

// ─── Indicator Adapters (delegates to @insight/computation) ────────

export function calculateSMA(data: (number | null)[], period: number): (number | null)[] {
    const clean = data.map(v => v ?? NaN);
    return toNullable(sma(clean, period));
}

export function calculateEMA(data: (number | null)[], period: number): (number | null)[] {
    const clean = data.map(v => v ?? NaN);
    return toNullable(ema(clean, period));
}

export function calculateRSI(data: Candle[], period: number): Record<string, (number | null)[]> {
    const close = data.map(c => c.close);
    return { main: toNullable(rsi(close, period)) };
}

export function calculateBollingerBands(data: Candle[], period: number, stdDev: number): Record<string, (number | null)[]> {
    const close = data.map(c => c.close);
    const middle = toNullable(sma(close, period));
    const upper = toNullable(bollinger(close, period, stdDev));
    const lower = toNullable(bollinger(close, period, -stdDev));
    return { middle, upper, lower };
}

export function calculateMACD(
    data: Candle[],
    fastPeriod: number,
    slowPeriod: number,
    signalPeriod: number
): Record<string, (number | null)[]> {
    const close = data.map(c => c.close);
    const macdLine = toNullable(macd(close, fastPeriod, slowPeriod, signalPeriod));

    // Signal line = EMA of MACD line
    const macdClean = macdLine.map(v => v ?? NaN);
    const signal = toNullable(ema(macdClean, signalPeriod));

    // Histogram = MACD - Signal
    const histogram = macdLine.map((v, i) => {
        if (v === null || signal[i] === null) return null;
        return v - signal[i]!;
    });

    return { main: macdLine, signal, histogram };
}

export function calculateStochastic(
    data: Candle[],
    kPeriod: number,
    kSlowing: number,
    dPeriod: number
): Record<string, (number | null)[]> {
    const close = data.map(c => c.close);
    const high = data.map(c => c.high);
    const low = data.map(c => c.low);

    const rawK = toNullable(stoch(close, high, low, kPeriod));

    // Slowed %K = SMA of raw %K
    const kSmoothed = kSlowing > 1
        ? toNullable(sma(rawK.map(v => v ?? NaN), kSlowing))
        : rawK;

    // %D = SMA of slowed %K
    const d = toNullable(sma(kSmoothed.map(v => v ?? NaN), dPeriod));

    return { k: kSmoothed, d };
}

export function calculateATR(data: Candle[], period: number): (number | null)[] {
    const high = data.map(c => c.high);
    const low = data.map(c => c.low);
    const close = data.map(c => c.close);
    return toNullable(atr(high, low, close, period));
}

export function calculateSuperTrend(
    data: Candle[],
    atrPeriod: number,
    factor: number
): Record<string, (number | null)[]> {
    const high = data.map(c => c.high);
    const low = data.map(c => c.low);
    const close = data.map(c => c.close);
    const st = toNullable(supertrend(high, low, close, atrPeriod, factor));

    // Determine direction: if SuperTrend < close → bullish, else bearish
    const direction = st.map((v, i) => {
        if (v === null) return null;
        return close[i] > v ? 1 : -1;
    });

    return { main: st, direction };
}

export function calculateVWAP(data: Candle[]): Record<string, (number | null)[]> {
    const high = data.map(c => c.high);
    const low = data.map(c => c.low);
    const close = data.map(c => c.close);
    const volume = data.map(c => c.volume || 0);
    return { main: toNullable(vwap(high, low, close, volume)) };
}

export function calculateCCI(data: Candle[], period: number): Record<string, (number | null)[]> {
    // CCI uses typical price = (H + L + C) / 3
    const tp = data.map(c => (c.high + c.low + c.close) / 3);
    return { main: toNullable(cci(tp, period)) };
}

export function calculateMFI(data: Candle[], period: number): Record<string, (number | null)[]> {
    const high = data.map(c => c.high);
    const low = data.map(c => c.low);
    const close = data.map(c => c.close);
    const volume = data.map(c => c.volume || 0);
    return { main: toNullable(mfi(high, low, close, volume, period)) };
}

export function calculateOBV(data: Candle[]): Record<string, (number | null)[]> {
    const close = data.map(c => c.close);
    const volume = data.map(c => c.volume || 0);
    return { main: toNullable(obv(close, volume)) };
}

export function calculateMARibbon(
    data: Candle[],
    periodsStr: string = "10,20,30,40,50,60"
): Record<string, (number | null)[]> {
    const close = data.map(c => c.close);
    const periods = periodsStr.split(',').map(Number);
    const result: Record<string, (number | null)[]> = {};
    for (const p of periods) {
        result[`ema_${p}`] = toNullable(ema(close, p));
    }
    return result;
}

// ─── Drawing Geometry (non-indicator utility) ──────────────────────

export function calculateDrawingPriceAtTime(drawing: Drawing, time: number): number | null {
    const d = drawing as any;

    if (d.type === 'horizontal_line') {
        return d.price;
    }
    if (d.type === 'horizontal_ray') {
        return time >= d.startTime ? d.price : null;
    }
    if (d.type === 'trend_line' || d.type === 'ray') {
        const { startTime, startPrice, endTime, endPrice } = d;
        if (endTime === startTime) return null;

        const slope = (endPrice - startPrice) / (endTime - startTime);
        const price = startPrice + slope * (time - startTime);

        if (d.type === 'trend_line') {
            const [tMin, tMax] = startTime < endTime ? [startTime, endTime] : [endTime, startTime];
            return (time >= tMin && time <= tMax) ? price : null;
        }
        if (endTime > startTime) {
            return time >= startTime ? price : null;
        } else {
            return time <= startTime ? price : null;
        }
    }
    return null;
}

