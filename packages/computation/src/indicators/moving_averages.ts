
/**
 * Simple Moving Average (SMA)
 * Calculates the arithmetic mean of `source` over the last `period` bars.
 */
export function sma(source: number[] | Float64Array, period: number): Float64Array {
    const result = new Float64Array(source.length).fill(NaN);
    if (!source || source.length < period || period <= 0) return result;

    let sum = 0;
    for (let i = 0; i < period; i++) {
        if (Number.isNaN(source[i])) return result;
        sum += source[i];
    }
    result[period - 1] = sum / period;

    for (let i = period; i < source.length; i++) {
        sum += source[i] - source[i - period];
        result[i] = sum / period;
    }
    return result;
}

/**
 * Exponential Moving Average (EMA)
 * Calculates the exponential moving average of `source` over `period` bars.
 */
export function ema(source: number[] | Float64Array, period: number): Float64Array {
    const result = new Float64Array(source.length).fill(NaN);
    if (!source || source.length < period || period <= 0) return result;

    const k = 2 / (period + 1);
    let sum = 0;
    for (let j = 0; j < period; j++) sum += source[j];
    let prevEma = sum / period;
    result[period - 1] = prevEma;

    for (let i = period; i < source.length; i++) {
        const val = source[i] * k + prevEma * (1 - k);
        result[i] = val;
        prevEma = val;
    }
    return result;
}

/**
 * Weighted Moving Average (WMA)
 * Calculates the weighted moving average of `source` over `period` bars.
 */
export function wma(source: number[] | Float64Array, period: number): Float64Array {
    const result = new Float64Array(source.length).fill(NaN);
    if (!source || source.length < period || period <= 0) return result;

    const weightSum = (period * (period + 1)) / 2;
    for (let i = period - 1; i < source.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += source[i - j] * (period - j);
        }
        result[i] = sum / weightSum;
    }
    return result;
}

/**
 * Volume Weighted Moving Average (VWMA)
 * Calculates the moving average of `source` weighted by `volume`.
 * Dependent on SMA.
 */
export function vwma(source: number[] | Float64Array, volume: number[] | Float64Array, period: number): Float64Array {
    const result = new Float64Array(source.length).fill(NaN);
    if (!source || !volume || source.length < period || period <= 0) return result;

    const pv = new Float64Array(source.length);
    for (let i = 0; i < source.length; i++) pv[i] = source[i] * volume[i];

    const pvSma = sma(pv, period);
    const vSma = sma(volume, period);

    for (let i = 0; i < source.length; i++) {
        if (!Number.isNaN(pvSma[i]) && !Number.isNaN(vSma[i]) && vSma[i] !== 0) {
            result[i] = pvSma[i] / vSma[i];
        }
    }
    return result;
}

/**
 * Hull Moving Average (HMA)
 */
export function hma(source: number[] | Float64Array, period: number): Float64Array {
    const result = new Float64Array(source.length).fill(NaN);
    if (!source || source.length < period || period <= 0) return result;

    const halfLen = Math.floor(period / 2);
    const sqrtLen = Math.floor(Math.sqrt(period));

    const wmaHalf = wma(source, halfLen);
    const wmaFull = wma(source, period);

    const diff = new Float64Array(source.length);
    for (let i = 0; i < source.length; i++) {
        if (!Number.isNaN(wmaHalf[i]) && !Number.isNaN(wmaFull[i])) {
            diff[i] = (2 * wmaHalf[i]) - wmaFull[i];
        } else {
            diff[i] = NaN;
        }
    }

    return wma(diff, sqrtLen);
}

/**
 * Relative Moving Average (RMA) / Running Moving Average
 */
export function rma(source: number[] | Float64Array, period: number): Float64Array {
    const result = new Float64Array(source.length).fill(NaN);
    if (!source || source.length < period || period <= 0) return result;

    const alpha = 1 / period;
    let sum = 0;
    for (let i = 0; i < period; i++) sum += source[i];
    let prevRma = sum / period;
    result[period - 1] = prevRma;

    for (let i = period; i < source.length; i++) {
        const val = alpha * source[i] + (1 - alpha) * prevRma;
        result[i] = val;
        prevRma = val;
    }
    return result;
}

/**
 * Arnaud Legoux Moving Average (ALMA)
 */
export function alma(source: number[] | Float64Array, length: number, offset: number, sigma: number): Float64Array {
    const result = new Float64Array(source.length).fill(NaN);
    if (!source || source.length < length || length <= 0) return result;

    const m = offset * (length - 1);
    const s = length / sigma;

    for (let i = length - 1; i < source.length; i++) {
        let norm = 0;
        let sum = 0;
        for (let j = 0; j < length; j++) {
            const weight = Math.exp(-1 * Math.pow(j - m, 2) / (2 * Math.pow(s, 2)));
            sum += source[i - (length - 1 - j)] * weight;
            norm += weight;
        }
        result[i] = sum / norm;
    }
    return result;
}

/**
 * Symmetrically Weighted Moving Average (SWMA)
 */
export function swma(source: number[] | Float64Array): Float64Array {
    const result = new Float64Array(source.length).fill(NaN);
    if (!source || source.length < 4) return result;

    for (let i = 3; i < source.length; i++) {
        result[i] = (source[i] * 1 / 6) + (source[i - 1] * 2 / 6) + (source[i - 2] * 2 / 6) + (source[i - 3] * 1 / 6);
    }
    return result;
}

/**
 * Kaufman's Adaptive Moving Average (KAMA)
 */
export function kama(source: number[] | Float64Array, period: number): Float64Array {
    const result = new Float64Array(source.length).fill(NaN);
    if (!source || source.length < period) return result;

    let currentKama = source[period - 1];
    result[period - 1] = currentKama;

    const fastSC = 2 / (2 + 1);
    const slowSC = 2 / (30 + 1);

    for (let i = period; i < source.length; i++) {
        let diffSum = 0;
        for (let j = 0; j < period; j++) {
            diffSum += Math.abs(source[i - j] - source[i - j - 1]);
        }
        const signal = Math.abs(source[i] - source[i - period]);
        const er = diffSum === 0 ? 0 : signal / diffSum;
        const sc = Math.pow(er * (fastSC - slowSC) + slowSC, 2);
        currentKama = currentKama + sc * (source[i] - currentKama);
        result[i] = currentKama;
    }
    return result;
}

/**
 * Double Exponential Moving Average (DEMA)
 */
export function dema(source: number[] | Float64Array, period: number): Float64Array {
    const e1 = ema(source, period);
    const e2 = ema(e1, period);
    const result = new Float64Array(source.length).fill(NaN);
    for (let i = 0; i < source.length; i++) {
        result[i] = 2 * e1[i] - e2[i];
    }
    return result;
}

/**
 * Triple Exponential Moving Average (TEMA)
 */
export function tema(source: number[] | Float64Array, period: number): Float64Array {
    const e1 = ema(source, period);
    const e2 = ema(e1, period);
    const e3 = ema(e2, period);
    const result = new Float64Array(source.length).fill(NaN);
    for (let i = 0; i < source.length; i++) {
        result[i] = 3 * e1[i] - 3 * e2[i] + e3[i];
    }
    return result;
}

/**
 * Zero-Lag Exponential Moving Average (ZLEMA)
 */
export function zlema(source: number[] | Float64Array, period: number): Float64Array {
    const lag = Math.floor((period - 1) / 2);
    const dataPrime = new Float64Array(source.length);
    for (let i = 0; i < source.length; i++) {
        const val = source[i];
        const prev = i >= lag ? source[i - lag] : val;
        dataPrime[i] = val + (val - prev);
    }
    return ema(dataPrime, period);
}

/**
 * Smoothed Moving Average (SMMA)
 */
export function smma(source: number[] | Float64Array, period: number): Float64Array {
    const result = new Float64Array(source.length).fill(NaN);
    if (!source || source.length < period) return result;

    let sum = 0;
    for (let i = 0; i < period; i++) sum += source[i];
    let prevSmma = sum / period;
    result[period - 1] = prevSmma;

    for (let i = period; i < source.length; i++) {
        const val = (prevSmma * (period - 1) + source[i]) / period;
        result[i] = val;
        prevSmma = val;
    }
    return result;
}
