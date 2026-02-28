import { sma } from './moving_averages';

/**
 * Linear Regression
 * Plots the values derived from a linear regression of the least squares method.
 */
export function linreg(source: number[] | Float64Array, period: number, offset: number): Float64Array {
    const result = new Float64Array(source.length).fill(NaN);
    if (!source || source.length < period) return result;

    for (let i = period - 1; i < source.length; i++) {
        let sumX = 0;
        let sumY = 0;
        let sumXSq = 0;
        let sumXY = 0;

        for (let j = 0; j < period; j++) {
            const x = j;
            const y = source[i - (period - 1 - j)];
            sumX += x;
            sumY += y;
            sumXSq += x * x;
            sumXY += x * y;
        }

        const slope = (period * sumXY - sumX * sumY) / (period * sumXSq - sumX * sumX);
        const intercept = (sumY - slope * sumX) / period;
        result[i] = intercept + slope * (period - 1 - offset);
    }
    return result;
}

/**
 * Variance
 * Calculates the variance of `source` over `length`.
 */
export function variance(source: number[] | Float64Array, length: number): Float64Array {
    const ma = sma(source, length);
    const result = new Float64Array(source.length).fill(NaN);
    for (let i = length - 1; i < source.length; i++) {
        let sum = 0;
        for (let j = 0; j < length; j++) {
            const diff = source[i - j] - ma[i];
            sum += diff * diff;
        }
        result[i] = sum / length;
    }
    return result;
}

/**
 * Standard Deviation
 */
export function stdev(source: number[] | Float64Array, length: number): Float64Array {
    const v = variance(source, length);
    const result = new Float64Array(source.length);
    for (let i = 0; i < source.length; i++) {
        result[i] = Math.sqrt(v[i]);
    }
    return result;
}

/**
 * Highest value over a given period
 */
export function highest(source: number[] | Float64Array, length: number): Float64Array {
    const result = new Float64Array(source.length).fill(NaN);
    for (let i = length - 1; i < source.length; i++) {
        let max = -Infinity;
        for (let j = 0; j < length; j++) {
            if (source[i - j] > max) max = source[i - j];
        }
        result[i] = max;
    }
    return result;
}

/**
 * Lowest value over a given period
 */
export function lowest(source: number[] | Float64Array, length: number): Float64Array {
    const result = new Float64Array(source.length).fill(NaN);
    for (let i = length - 1; i < source.length; i++) {
        let min = Infinity;
        for (let j = 0; j < length; j++) {
            if (source[i - j] < min) min = source[i - j];
        }
        result[i] = min;
    }
    return result;
}

/**
 * Mode
 * Returns the most frequent value in the `source` over the last `period` bars.
 */
export function mode(source: number[] | Float64Array, period: number): Float64Array {
    const result = new Float64Array(source.length).fill(NaN);
    if (!source || source.length < period) return result;

    for (let i = period - 1; i < source.length; i++) {
        const window = [];
        for (let j = 0; j < period; j++) window.push(source[i - j]);

        const counts = new Map<number, number>();
        let maxCount = 0;
        let modeVal = window[0];

        for (const val of window) {
            const c = (counts.get(val) || 0) + 1;
            counts.set(val, c);
            if (c > maxCount) {
                maxCount = c;
                modeVal = val;
            }
        }
        result[i] = modeVal;
    }
    return result;
}
