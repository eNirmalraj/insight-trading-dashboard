/**
 * Core Technical Analysis — Layer 1
 * Pure TypeScript math functions for fast built-in indicator computation.
 * Called directly by CandlestickChart for known indicator types (no Kuri parsing).
 * Formulas match kuri-engine-full.js exactly.
 */

// ═══════════════════════════════════════════════════════
// MOVING AVERAGES
// ═══════════════════════════════════════════════════════

export function sma(source: number[], length: number): (number | null)[] {
    const result: (number | null)[] = new Array(source.length).fill(null);
    if (length < 1 || source.length < length) return result;
    let sum = 0;
    for (let i = 0; i < length; i++) sum += source[i];
    result[length - 1] = sum / length;
    for (let i = length; i < source.length; i++) {
        sum += source[i] - source[i - length];
        result[i] = sum / length;
    }
    return result;
}

export function ema(source: number[], length: number): (number | null)[] {
    const result: (number | null)[] = new Array(source.length).fill(null);
    if (length < 1 || source.length === 0) return result;
    const k = 2 / (length + 1);
    // Seed with SMA
    let sum = 0;
    for (let i = 0; i < Math.min(length, source.length); i++) sum += source[i];
    if (source.length < length) return result;
    let prev = sum / length;
    result[length - 1] = prev;
    for (let i = length; i < source.length; i++) {
        prev = source[i] * k + prev * (1 - k);
        result[i] = prev;
    }
    return result;
}

export function wma(source: number[], length: number): (number | null)[] {
    const result: (number | null)[] = new Array(source.length).fill(null);
    if (length < 1 || source.length < length) return result;
    const denom = (length * (length + 1)) / 2;
    for (let i = length - 1; i < source.length; i++) {
        let num = 0;
        for (let j = 0; j < length; j++) {
            num += source[i - length + 1 + j] * (j + 1);
        }
        result[i] = num / denom;
    }
    return result;
}

export function rma(source: number[], length: number): (number | null)[] {
    const result: (number | null)[] = new Array(source.length).fill(null);
    if (length < 1 || source.length < length) return result;
    const alpha = 1 / length;
    // Seed with SMA
    let sum = 0;
    for (let i = 0; i < length; i++) sum += source[i];
    let prev = sum / length;
    result[length - 1] = prev;
    for (let i = length; i < source.length; i++) {
        prev = alpha * source[i] + (1 - alpha) * prev;
        result[i] = prev;
    }
    return result;
}

export function hma(source: number[], length: number): (number | null)[] {
    if (length < 2 || source.length === 0) return new Array(source.length).fill(null);
    const halfLen = Math.floor(length / 2);
    const sqrtLen = Math.floor(Math.sqrt(length));
    const wmaHalf = wma(source, halfLen);
    const wmaFull = wma(source, length);
    // 2 * wma(half) - wma(full)
    const diff: number[] = source.map((_, i) => {
        const h = wmaHalf[i];
        const f = wmaFull[i];
        if (h === null || f === null) return 0;
        return 2 * h - f;
    });
    return wma(diff, sqrtLen);
}

export function vwma(source: number[], volume: number[], length: number): (number | null)[] {
    const result: (number | null)[] = new Array(source.length).fill(null);
    if (length < 1 || source.length < length) return result;
    for (let i = length - 1; i < source.length; i++) {
        let sumSV = 0;
        let sumV = 0;
        for (let j = 0; j < length; j++) {
            const v = volume[i - j] || 0;
            sumSV += source[i - j] * v;
            sumV += v;
        }
        result[i] = sumV !== 0 ? sumSV / sumV : null;
    }
    return result;
}

// ═══════════════════════════════════════════════════════
// OSCILLATORS
// ═══════════════════════════════════════════════════════

export function rsi(source: number[], length: number): (number | null)[] {
    const result: (number | null)[] = new Array(source.length).fill(null);
    if (length < 1 || source.length < length + 1) return result;
    const changes: number[] = [];
    for (let i = 1; i < source.length; i++) changes.push(source[i] - source[i - 1]);
    const gains: number[] = changes.map((c) => Math.max(c, 0));
    const losses: number[] = changes.map((c) => Math.max(-c, 0));
    const avgGain = rma(gains, length);
    const avgLoss = rma(losses, length);
    for (let i = 0; i < changes.length; i++) {
        const g = avgGain[i];
        const l = avgLoss[i];
        if (g === null || l === null) continue;
        if (l === 0) result[i + 1] = 100;
        else if (g === 0) result[i + 1] = 0;
        else result[i + 1] = 100 - 100 / (1 + g / l);
    }
    return result;
}

export function macd(
    source: number[],
    fastLen: number,
    slowLen: number,
    signalLen: number
): { macd: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] } {
    const fastEma = ema(source, fastLen);
    const slowEma = ema(source, slowLen);
    const macdLine: number[] = source.map((_, i) => {
        const f = fastEma[i];
        const s = slowEma[i];
        if (f === null || s === null) return NaN;
        return f - s;
    });
    const validMacd = macdLine.map((v) => (isNaN(v) ? 0 : v));
    const signalLine = ema(validMacd, signalLen);
    const histogram: (number | null)[] = source.map((_, i) => {
        const m = isNaN(macdLine[i]) ? null : macdLine[i];
        const s = signalLine[i];
        if (m === null || s === null) return null;
        return m - s;
    });
    return {
        macd: macdLine.map((v) => (isNaN(v) ? null : v)),
        signal: signalLine,
        histogram,
    };
}

export function stochastic(
    high: number[],
    low: number[],
    close: number[],
    periodK: number,
    smoothK: number,
    periodD: number
): { k: (number | null)[]; d: (number | null)[] } {
    const len = close.length;
    const rawK: number[] = new Array(len).fill(0);
    for (let i = periodK - 1; i < len; i++) {
        let hh = -Infinity;
        let ll = Infinity;
        for (let j = 0; j < periodK; j++) {
            hh = Math.max(hh, high[i - j]);
            ll = Math.min(ll, low[i - j]);
        }
        rawK[i] = hh - ll !== 0 ? ((close[i] - ll) / (hh - ll)) * 100 : 50;
    }
    const k = sma(rawK, smoothK);
    const kForD = k.map((v) => (v === null ? 0 : v));
    const d = sma(kForD, periodD);
    return { k, d };
}

export function cci(source: number[], length: number): (number | null)[] {
    const result: (number | null)[] = new Array(source.length).fill(null);
    if (length < 1 || source.length < length) return result;
    for (let i = length - 1; i < source.length; i++) {
        let sum = 0;
        for (let j = 0; j < length; j++) sum += source[i - j];
        const mean = sum / length;
        let madSum = 0;
        for (let j = 0; j < length; j++) madSum += Math.abs(source[i - j] - mean);
        const mad = madSum / length;
        result[i] = mad !== 0 ? (source[i] - mean) / (0.015 * mad) : 0;
    }
    return result;
}

export function mfi(
    high: number[],
    low: number[],
    close: number[],
    volume: number[],
    length: number
): (number | null)[] {
    const len = close.length;
    const result: (number | null)[] = new Array(len).fill(null);
    if (length < 1 || len < length + 1) return result;
    const tp: number[] = close.map((c, i) => (high[i] + low[i] + c) / 3);
    for (let i = length; i < len; i++) {
        let posFlow = 0;
        let negFlow = 0;
        for (let j = 0; j < length; j++) {
            const idx = i - j;
            const mf = tp[idx] * (volume[idx] || 0);
            if (tp[idx] > tp[idx - 1]) posFlow += mf;
            else if (tp[idx] < tp[idx - 1]) negFlow += mf;
        }
        result[i] = negFlow === 0 ? 100 : 100 - 100 / (1 + posFlow / negFlow);
    }
    return result;
}

// ═══════════════════════════════════════════════════════
// VOLATILITY
// ═══════════════════════════════════════════════════════

export function trueRange(high: number[], low: number[], close: number[]): number[] {
    const len = high.length;
    const tr: number[] = new Array(len).fill(0);
    tr[0] = high[0] - low[0];
    for (let i = 1; i < len; i++) {
        tr[i] = Math.max(
            high[i] - low[i],
            Math.abs(high[i] - close[i - 1]),
            Math.abs(low[i] - close[i - 1])
        );
    }
    return tr;
}

export function atr(
    high: number[],
    low: number[],
    close: number[],
    length: number
): (number | null)[] {
    return rma(trueRange(high, low, close), length);
}

export function bb(
    source: number[],
    length: number,
    mult: number
): { upper: (number | null)[]; basis: (number | null)[]; lower: (number | null)[] } {
    const basis = sma(source, length);
    const upper: (number | null)[] = new Array(source.length).fill(null);
    const lower: (number | null)[] = new Array(source.length).fill(null);
    for (let i = length - 1; i < source.length; i++) {
        const b = basis[i];
        if (b === null) continue;
        let sumSq = 0;
        for (let j = 0; j < length; j++) {
            const diff = source[i - j] - b;
            sumSq += diff * diff;
        }
        const stddev = Math.sqrt(sumSq / length);
        upper[i] = b + mult * stddev;
        lower[i] = b - mult * stddev;
    }
    return { upper, basis, lower };
}

export function keltnerChannels(
    source: number[],
    high: number[],
    low: number[],
    close: number[],
    length: number,
    atrLength: number,
    mult: number,
    useEma: boolean
): { upper: (number | null)[]; basis: (number | null)[]; lower: (number | null)[] } {
    const basis = useEma ? ema(source, length) : sma(source, length);
    const atrValues = atr(high, low, close, atrLength);
    const upper: (number | null)[] = source.map((_, i) => {
        const b = basis[i];
        const a = atrValues[i];
        if (b === null || a === null) return null;
        return b + a * mult;
    });
    const lower: (number | null)[] = source.map((_, i) => {
        const b = basis[i];
        const a = atrValues[i];
        if (b === null || a === null) return null;
        return b - a * mult;
    });
    return { upper, basis, lower };
}

export function donchianChannels(
    high: number[],
    low: number[],
    length: number
): { upper: (number | null)[]; basis: (number | null)[]; lower: (number | null)[] } {
    const len = high.length;
    const upper: (number | null)[] = new Array(len).fill(null);
    const lower: (number | null)[] = new Array(len).fill(null);
    const basis: (number | null)[] = new Array(len).fill(null);
    for (let i = length - 1; i < len; i++) {
        let hh = -Infinity;
        let ll = Infinity;
        for (let j = 0; j < length; j++) {
            hh = Math.max(hh, high[i - j]);
            ll = Math.min(ll, low[i - j]);
        }
        upper[i] = hh;
        lower[i] = ll;
        basis[i] = (hh + ll) / 2;
    }
    return { upper, basis, lower };
}

// ═══════════════════════════════════════════════════════
// TREND
// ═══════════════════════════════════════════════════════

export function supertrend(
    high: number[],
    low: number[],
    close: number[],
    atrPeriod: number,
    factor: number
): { supertrend: (number | null)[]; direction: (number | null)[] } {
    const len = close.length;
    const atrValues = atr(high, low, close, atrPeriod);
    const st: (number | null)[] = new Array(len).fill(null);
    const dir: (number | null)[] = new Array(len).fill(null);
    const upperBand: number[] = new Array(len).fill(0);
    const lowerBand: number[] = new Array(len).fill(0);

    for (let i = 0; i < len; i++) {
        const a = atrValues[i];
        if (a === null) continue;
        const hl2 = (high[i] + low[i]) / 2;
        upperBand[i] = hl2 + factor * a;
        lowerBand[i] = hl2 - factor * a;

        if (i > 0 && lowerBand[i - 1] !== 0) {
            if (lowerBand[i] > lowerBand[i - 1] || close[i - 1] < lowerBand[i - 1]) {
                // keep lowerBand[i]
            } else {
                lowerBand[i] = lowerBand[i - 1];
            }
        }
        if (i > 0 && upperBand[i - 1] !== 0) {
            if (upperBand[i] < upperBand[i - 1] || close[i - 1] > upperBand[i - 1]) {
                // keep upperBand[i]
            } else {
                upperBand[i] = upperBand[i - 1];
            }
        }

        if (i === 0 || atrValues[i - 1] === null) {
            dir[i] = 1;
        } else {
            const prevSt = st[i - 1] ?? upperBand[i];
            if (prevSt === upperBand[i - 1]) {
                dir[i] = close[i] > upperBand[i] ? -1 : 1;
            } else {
                dir[i] = close[i] < lowerBand[i] ? 1 : -1;
            }
        }

        st[i] = dir[i] === -1 ? lowerBand[i] : upperBand[i];
    }
    return { supertrend: st, direction: dir };
}

export function ichimoku(
    high: number[],
    low: number[],
    conversionPeriod: number,
    basePeriod: number,
    spanBPeriod: number
): {
    conversion: (number | null)[];
    base: (number | null)[];
    spanA: (number | null)[];
    spanB: (number | null)[];
} {
    const len = high.length;
    const donchianMid = (h: number[], l: number[], period: number): (number | null)[] => {
        const result: (number | null)[] = new Array(len).fill(null);
        for (let i = period - 1; i < len; i++) {
            let hh = -Infinity;
            let ll = Infinity;
            for (let j = 0; j < period; j++) {
                hh = Math.max(hh, h[i - j]);
                ll = Math.min(ll, l[i - j]);
            }
            result[i] = (hh + ll) / 2;
        }
        return result;
    };

    const conversion = donchianMid(high, low, conversionPeriod);
    const base = donchianMid(high, low, basePeriod);
    const spanA: (number | null)[] = conversion.map((c, i) => {
        const b = base[i];
        if (c === null || b === null) return null;
        return (c + b) / 2;
    });
    const spanB = donchianMid(high, low, spanBPeriod);
    return { conversion, base, spanA, spanB };
}

// ═══════════════════════════════════════════════════════
// VOLUME
// ═══════════════════════════════════════════════════════

export function obv(close: number[], volume: number[]): (number | null)[] {
    const len = close.length;
    const result: (number | null)[] = new Array(len).fill(null);
    if (len === 0) return result;
    result[0] = 0;
    let cumOBV = 0;
    for (let i = 1; i < len; i++) {
        const v = volume[i] || 0;
        if (close[i] > close[i - 1]) cumOBV += v;
        else if (close[i] < close[i - 1]) cumOBV -= v;
        result[i] = cumOBV;
    }
    return result;
}

export function vwap(
    high: number[],
    low: number[],
    close: number[],
    volume: number[]
): (number | null)[] {
    const len = close.length;
    const result: (number | null)[] = new Array(len).fill(null);
    let cumTPV = 0;
    let cumV = 0;
    for (let i = 0; i < len; i++) {
        const tp = (high[i] + low[i] + close[i]) / 3;
        const v = volume[i] || 0;
        cumTPV += tp * v;
        cumV += v;
        result[i] = cumV !== 0 ? cumTPV / cumV : null;
    }
    return result;
}

// ═══════════════════════════════════════════════════════
// MA RIBBON
// ═══════════════════════════════════════════════════════

export function maRibbon(
    source: number[],
    periods: number[],
    maType: 'SMA' | 'EMA' = 'SMA'
): Record<string, (number | null)[]> {
    const fn = maType === 'EMA' ? ema : sma;
    const result: Record<string, (number | null)[]> = {};
    periods.forEach((p, i) => {
        result[`ma${i + 1}`] = fn(source, p);
    });
    return result;
}

// ═══════════════════════════════════════════════════════
// ADR — Average Daily Range
// ═══════════════════════════════════════════════════════

export function adr(high: number[], low: number[], length: number): (number | null)[] {
    const range = high.map((h, i) => h - low[i]);
    return sma(range, length);
}
