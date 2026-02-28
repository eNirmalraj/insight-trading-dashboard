import { sma, rma } from './moving_averages';

/**
 * Average True Range (ATR)
 */
export function atr(high: number[] | Float64Array, low: number[] | Float64Array, close: number[] | Float64Array, period: number): Float64Array {
    const result = new Float64Array(high.length).fill(NaN);
    if (!high || !low || !close || high.length < period) return result;

    const tr = new Float64Array(high.length);
    // True Range logic
    // TR[0] is undefined (no previous close) unless strictly handled. usually treated as high[0]-low[0] or 0.
    // TradingView starts from index 1.
    tr[0] = high[0] - low[0];

    for (let i = 1; i < high.length; i++) {
        const val1 = high[i] - low[i];
        const val2 = Math.abs(high[i] - close[i - 1]);
        const val3 = Math.abs(low[i] - close[i - 1]);
        tr[i] = Math.max(val1, val2, val3);
    }
    return rma(tr, period);
}

/**
 * Bollinger Band (Single line calculation)
 * Calculates the line: SMA + (stdev * mult)
 */
export function bollinger(source: number[] | Float64Array, period: number, stdDevMult: number): Float64Array {
    const ma = sma(source, period);
    const result = new Float64Array(source.length).fill(NaN);

    for (let i = period - 1; i < source.length; i++) {
        let sumSqDiff = 0;
        for (let j = 0; j < period; j++) {
            const diff = source[i - j] - ma[i];
            sumSqDiff += diff * diff;
        }
        const stdev = Math.sqrt(sumSqDiff / period);
        result[i] = ma[i] + stdev * stdDevMult;
    }
    return result;
}

/**
 * Supertrend
 */
export function supertrend(high: number[] | Float64Array, low: number[] | Float64Array, close: number[] | Float64Array, period: number, multiplier: number): Float64Array {
    const atrSeries = atr(high, low, close, period);
    const result = new Float64Array(close.length).fill(NaN);

    let trend = 1;
    let upperBand = 0;
    let lowerBand = 0;

    for (let i = 0; i < close.length; i++) {
        if (Number.isNaN(atrSeries[i])) continue;

        const hl2 = (high[i] + low[i]) / 2;
        const upperBandBasic = hl2 + multiplier * atrSeries[i];
        const lowerBandBasic = hl2 - multiplier * atrSeries[i];

        if (i > 0) {
            upperBand = (upperBandBasic < upperBand || close[i - 1] > upperBand) ? upperBandBasic : upperBand;
            lowerBand = (lowerBandBasic > lowerBand || close[i - 1] < lowerBand) ? lowerBandBasic : lowerBand;

            if (trend === 1 && close[i] < lowerBand) trend = -1;
            else if (trend === -1 && close[i] > upperBand) trend = 1;
        } else {
            upperBand = upperBandBasic;
            lowerBand = lowerBandBasic;
        }
        result[i] = trend === 1 ? lowerBand : upperBand;
    }
    return result;
}
