
/**
 * Volume Weighted Average Price (VWAP)
 * Calculates the volume-weighted average price.
 */
export function vwap(high: number[] | Float64Array, low: number[] | Float64Array, close: number[] | Float64Array, volume: number[] | Float64Array): Float64Array {
    const result = new Float64Array(close.length);
    let cumVol = 0;
    let cumVolPrice = 0;
    for (let i = 0; i < close.length; i++) {
        const typPrice = (high[i] + low[i] + close[i]) / 3;
        cumVol += volume[i];
        cumVolPrice += typPrice * volume[i];
        result[i] = cumVol === 0 ? NaN : cumVolPrice / cumVol;
    }
    return result;
}

/**
 * On Balance Volume (OBV)
 */
export function obv(close: number[] | Float64Array, volume: number[] | Float64Array): Float64Array {
    const result = new Float64Array(close.length);
    let currentObv = 0;

    // OBV usually starts from 0 or first volume. Standard is cumulative.
    // Logic: if close > prev_close, +vol; else if close < prev_close, -vol.
    // First bar is 0?
    result[0] = 0; // or volume[0]? Standard is 0 or base.

    for (let i = 1; i < close.length; i++) {
        if (close[i] > close[i - 1]) currentObv += volume[i];
        else if (close[i] < close[i - 1]) currentObv -= volume[i];
        result[i] = currentObv;
    }
    return result;
}
