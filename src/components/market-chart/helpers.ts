/**
 * Chart Indicator Helpers
 * Integrated with the centralized Indicator Registry system
 */

import { Candle, Drawing } from './types';
import { registry } from '@/src/core';
import { getImplementation } from '@/src/core/implementations/typescript';

// ─── Utility ───────────────────────────────────────────────────────

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
            hex = hex
                .split('')
                .map((char) => char + char)
                .join('');
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

// ─── Discriminated Union for Indicator Results ──────────────────────

export type IndicatorResult =
    | { ok: true; data: Record<string, (number | null)[]> }
    | { ok: false; error: string };

// ─── Centralized Indicator Calculation ──────────────────────────────

/**
 * Calculate any indicator using the centralized registry system
 * @param type - Indicator type/ID (e.g., 'SMA', 'RSI', 'BB')
 * @param candles - Array of candlestick data
 * @param settings - Indicator settings/parameters
 * @returns IndicatorResult discriminated union
 */
export const calculateIndicator = (
    type: string,
    candles: Candle[],
    settings: any
): IndicatorResult => {
    if (!candles || candles.length === 0)
        return { ok: false, error: `No candle data for indicator ${type}` };

    // Extract OHLCV arrays once — many indicators need these
    const open = candles.map((c) => c.open);
    const high = candles.map((c) => c.high);
    const low = candles.map((c) => c.low);
    const close = candles.map((c) => c.close);
    const vol = candles.map((c) => c.volume || 0);

    const resolveSrc = (src: string | undefined) => {
        switch (src) {
            case 'open':
                return open;
            case 'high':
                return high;
            case 'low':
                return low;
            case 'hl2':
                return candles.map((c) => (c.high + c.low) / 2);
            case 'hlc3':
                return candles.map((c) => (c.high + c.low + c.close) / 3);
            case 'ohlc4':
                return candles.map((c) => (c.open + c.high + c.low + c.close) / 4);
            case 'volume':
                return vol;
            default:
                return close;
        }
    };

    const wrapOk = (d: any): IndicatorResult => ({ ok: true, data: d });

    try {
        // ── Direct calculations for indicators that need OHLCV context ──
        // These bypass the registry because the registry doesn't pass OHLCV context properly.

        // MACD: needs (source, fast, slow, signal)
        if (type === 'MACD') {
            const impl = getImplementation('macd');
            if (impl) {
                const src = resolveSrc(settings.source);
                return wrapOk(
                    impl(
                        src,
                        settings.fastPeriod || 12,
                        settings.slowPeriod || 26,
                        settings.signalPeriod || 9
                    )
                );
            }
        }

        // RSI: needs (source, period)
        if (type === 'RSI') {
            const impl = getImplementation('rsi');
            if (impl) {
                const src = resolveSrc(settings.source);
                return wrapOk({ main: impl(src, settings.period || 14) });
            }
        }

        // ADX: needs (high, low, close, length)
        if (type === 'ADX') {
            const impl = getImplementation('adx');
            if (impl) {
                const result = impl(high, low, close, settings.length || settings.period || 14);
                if (result && typeof result === 'object' && result.adx) {
                    return wrapOk({ main: result.adx });
                }
                return wrapOk({ main: result });
            }
        }

        // CCI: inline calculation (hlc3-based)
        if (type === 'CCI') {
            const period = settings.length || settings.period || 20;
            const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
            const smaImpl = getImplementation('sma');
            if (smaImpl) {
                const smaTP = smaImpl(tp, period) as (number | null)[];
                const result: (number | null)[] = [];
                for (let i = 0; i < tp.length; i++) {
                    if (i < period - 1 || smaTP[i] == null) {
                        result.push(null);
                        continue;
                    }
                    let sumAbsDev = 0;
                    for (let j = 0; j < period; j++)
                        sumAbsDev += Math.abs(tp[i - j] - (smaTP[i] as number));
                    const meanDev = sumAbsDev / period;
                    result.push(
                        meanDev === 0 ? 0 : (tp[i] - (smaTP[i] as number)) / (0.015 * meanDev)
                    );
                }
                return wrapOk({ main: result });
            }
        }

        // MFI: needs (high, low, close, volume, length)
        if (type === 'MFI') {
            const impl = getImplementation('mfi');
            if (impl)
                return wrapOk({
                    main: impl(high, low, close, vol, settings.length || settings.period || 14),
                });
        }

        // VWAP: needs (high, low, close, volume)
        if (type === 'VWAP') {
            const impl = getImplementation('vwap');
            if (impl) return wrapOk({ main: impl(high, low, close, vol) });
        }

        // OBV: needs (close, volume)
        if (type === 'OBV') {
            const impl = getImplementation('obv');
            if (impl) return wrapOk({ main: impl(close, vol) });
        }

        // Stochastic: impl expects StochInput object
        if (type === 'Stochastic') {
            const impl = getImplementation('stochastic');
            if (impl) {
                const result = impl({
                    close,
                    high,
                    low,
                    periodK: settings.length || settings.kPeriod || 14,
                    smoothK: settings.smoothK || 1,
                    periodD: settings.periodD || settings.dPeriod || 3,
                });
                return wrapOk(result); // returns { k: [], d: [] }
            }
        }

        // SuperTrend: needs (high, low, close, period, multiplier)
        if (type === 'SuperTrend') {
            const impl = getImplementation('supertrend');
            if (impl) {
                return wrapOk(
                    impl(
                        high,
                        low,
                        close,
                        settings.period || settings.atrPeriod || 10,
                        settings.multiplier || settings.factor || 3
                    )
                );
            }
        }

        // ATR: needs (high, low, close, period)
        if (type === 'ATR') {
            const impl = getImplementation('atr');
            if (impl) return wrapOk({ main: impl(high, low, close, settings.period || 14) });
        }

        // Bollinger Bands: needs (source, period, stdDevMultiplier)
        if (type === 'BB' || type === 'Bollinger Bands' || type === 'BOLLINGER_BANDS') {
            const impl = getImplementation('bollinger_bands');
            if (impl) {
                const src = resolveSrc(settings.source);
                return wrapOk(impl(src, settings.period || 20, settings.stdDev || 2));
            }
        }

        // ── Donchian Channels: highest high / lowest low ──
        if (type === 'DONCHIAN' || type === 'DC' || type === 'Donchian Channels') {
            const period = settings.period || 20;
            const upper: (number | null)[] = [];
            const lower: (number | null)[] = [];
            const basis: (number | null)[] = [];
            for (let i = 0; i < candles.length; i++) {
                if (i < period - 1) {
                    upper.push(null);
                    lower.push(null);
                    basis.push(null);
                    continue;
                }
                let hi = -Infinity,
                    lo = Infinity;
                for (let j = i - period + 1; j <= i; j++) {
                    hi = Math.max(hi, high[j]);
                    lo = Math.min(lo, low[j]);
                }
                upper.push(hi);
                lower.push(lo);
                basis.push((hi + lo) / 2);
            }
            return wrapOk({ upper, lower, basis });
        }

        // ── Ichimoku Cloud ──
        if (type === 'ICHIMOKU' || type === 'Ichimoku' || type === 'Ichimoku Cloud') {
            const convP = settings.conversionPeriod || settings.period || 9;
            const baseP = settings.basePeriod || 26;
            const spanBP = settings.spanBPeriod || 52;

            const donchian = (len: number, idx: number) => {
                if (idx < len - 1) return null;
                let hi = -Infinity,
                    lo = Infinity;
                for (let j = idx - len + 1; j <= idx; j++) {
                    hi = Math.max(hi, high[j]);
                    lo = Math.min(lo, low[j]);
                }
                return (hi + lo) / 2;
            };

            const conversion: (number | null)[] = [];
            const base: (number | null)[] = [];
            const spanA: (number | null)[] = [];
            const spanB: (number | null)[] = [];

            for (let i = 0; i < candles.length; i++) {
                const conv = donchian(convP, i);
                const bas = donchian(baseP, i);
                conversion.push(conv);
                base.push(bas);
                spanA.push(conv !== null && bas !== null ? (conv + bas) / 2 : null);
                spanB.push(donchian(spanBP, i));
            }
            return wrapOk({ conversion, base, spanA, spanB });
        }

        // ── Keltner Channels ──
        if (type === 'KELTNER' || type === 'KC' || type === 'Keltner Channels') {
            const period = settings.period || 20;
            const mult = settings.multiplier || 2;
            const atrLen = settings.atrLength || 10;
            const src = resolveSrc(settings.source);

            const emaImpl = getImplementation('ema');
            const atrImpl = getImplementation('atr');
            if (emaImpl && atrImpl) {
                const emaBasis = emaImpl(src, period);
                const atrVal = atrImpl(high, low, close, atrLen);
                const upper: (number | null)[] = [];
                const lower: (number | null)[] = [];
                const basisArr: (number | null)[] = [];
                for (let i = 0; i < candles.length; i++) {
                    const e = emaBasis[i];
                    const a = atrVal[i];
                    if (e == null || a == null) {
                        upper.push(null);
                        lower.push(null);
                        basisArr.push(null);
                    } else {
                        basisArr.push(e);
                        upper.push(e + a * mult);
                        lower.push(e - a * mult);
                    }
                }
                return wrapOk({ upper, lower, basis: basisArr });
            }
        }

        // ── ADR: SMA of (high - low) ──
        if (type === 'ADR' || type === 'Average Daily Range') {
            const period = settings.period || 14;
            const range = candles.map((c) => c.high - c.low);
            const smaImpl = getImplementation('sma');
            if (smaImpl) return wrapOk({ main: smaImpl(range, period) });
        }

        // ── Standard registry path for simple indicators (SMA, EMA, etc.) ──
        const indicator = registry.getIndicator(type);
        if (!indicator) {
            console.warn(`Unknown indicator: ${type}`);
            return { ok: false, error: `Unknown indicator: ${type}` };
        }

        const params: Record<string, any> = { ...settings };
        indicator.parameters.forEach((param) => {
            if (param.type === 'series') {
                params[param.name] = resolveSrc(settings[param.name] || param.default);
            }
        });

        const result = registry.calculate(indicator.id, params);

        if (indicator.outputs.length === 1) {
            const outputName =
                indicator.outputs[0].name === 'value' ? 'main' : indicator.outputs[0].name;
            return wrapOk({ [outputName]: result });
        } else if (typeof result === 'object' && result !== null && !Array.isArray(result)) {
            return wrapOk(result);
        } else {
            return wrapOk({ main: result });
        }
    } catch (error) {
        console.error(`Error calculating indicator ${type}:`, error);
        return {
            ok: false,
            error: `Error calculating indicator ${type}: ${(error as Error).message}`,
        };
    }
};

// ─── Backward Compatibility Functions ──────────────────────────────

/**
 * Calculate EMA - backward compatibility wrapper
 * @deprecated Use calculateIndicator('EMA', candles, { period }) instead
 */
export const calculateEMA = (values: number[], period: number): (number | null)[] => {
    try {
        return registry.calculate('EMA', { source: values, period }) as (number | null)[];
    } catch (error) {
        console.error('Error calculating EMA:', error);
        // Fallback to simple implementation
        const result: (number | null)[] = new Array(values.length).fill(null);
        const k = 2 / (period + 1);
        result[0] = values[0];
        for (let i = 1; i < values.length; i++) {
            result[i] = values[i] * k + ((result[i - 1] ?? values[i]) as number) * (1 - k);
        }
        return result;
    }
};

/**
 * Calculate RSI - backward compatibility wrapper
 * @deprecated Use calculateIndicator('RSI', candles, { period }) instead
 */
export const calculateRSI = (candles: Candle[], period: number): { main: (number | null)[] } => {
    try {
        const closes = candles.map((c) => c.close);
        const result = registry.calculate('RSI', { source: closes, period }) as (number | null)[];
        return { main: result };
    } catch (error) {
        console.error('Error calculating RSI:', error);
        // Fallback to simple implementation
        if (!candles || candles.length < period + 1) return { main: [] };
        const closes = candles.map((c) => c.close);
        const result: (number | null)[] = new Array(closes.length).fill(null);
        let avgGain = 0,
            avgLoss = 0;
        for (let i = 1; i <= period; i++) {
            const diff = closes[i] - closes[i - 1];
            if (diff > 0) avgGain += diff;
            else avgLoss += Math.abs(diff);
        }
        avgGain /= period;
        avgLoss /= period;
        result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
        for (let i = period + 1; i < closes.length; i++) {
            const diff = closes[i] - closes[i - 1];
            avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
            avgLoss = (avgLoss * (period - 1) + (diff < 0 ? Math.abs(diff) : 0)) / period;
            result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
        }
        return { main: result };
    }
};

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
            return time >= tMin && time <= tMax ? price : null;
        }
        if (endTime > startTime) {
            return time >= startTime ? price : null;
        } else {
            return time <= startTime ? price : null;
        }
    }
    return null;
}
