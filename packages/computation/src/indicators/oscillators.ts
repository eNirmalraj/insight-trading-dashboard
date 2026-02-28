import { sma, ema, rma } from './moving_averages';

/**
 * Relative Strength Index (RSI)
 */
export function rsi(source: number[] | Float64Array, period: number): Float64Array {
    const result = new Float64Array(source.length).fill(NaN);
    if (!source || source.length <= period) return result;

    let avgGain = 0;
    let avgLoss = 0;

    for (let i = 1; i <= period; i++) {
        const change = source[i] - source[i - 1];
        if (change > 0) avgGain += change;
        else avgLoss += Math.abs(change);
    }
    avgGain /= period;
    avgLoss /= period;

    let rs = avgGain / avgLoss;
    result[period] = 100 - (100 / (1 + rs));

    for (let i = period + 1; i < source.length; i++) {
        const change = source[i] - source[i - 1];
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? Math.abs(change) : 0;

        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;

        if (avgLoss === 0) {
            result[i] = 100;
        } else {
            rs = avgGain / avgLoss;
            result[i] = 100 - (100 / (1 + rs));
        }
    }
    return result;
}

/**
 * Stochastic Oscillator (%K)
 */
export function stoch(source: number[] | Float64Array, high: number[] | Float64Array, low: number[] | Float64Array, length: number): Float64Array {
    const result = new Float64Array(source.length).fill(NaN);
    for (let i = length - 1; i < source.length; i++) {
        let highest = -Infinity;
        let lowest = Infinity;
        for (let j = 0; j < length; j++) {
            if (high[i - j] > highest) highest = high[i - j];
            if (low[i - j] < lowest) lowest = low[i - j];
        }
        result[i] = 100 * (source[i] - lowest) / (highest - lowest);
    }
    return result;
}

/**
 * Commodity Channel Index (CCI)
 */
export function cci(source: number[] | Float64Array, length: number): Float64Array {
    const ma = sma(source, length);
    const result = new Float64Array(source.length).fill(NaN);

    for (let i = length - 1; i < source.length; i++) {
        let sumDev = 0;
        for (let j = 0; j < length; j++) {
            sumDev += Math.abs(source[i - j] - ma[i]);
        }
        const meanDev = sumDev / length;
        result[i] = (source[i] - ma[i]) / (0.015 * meanDev);
    }
    return result;
}

/**
 * Money Flow Index (MFI)
 */
export function mfi(high: number[] | Float64Array, low: number[] | Float64Array, close: number[] | Float64Array, volume: number[] | Float64Array, length: number): Float64Array {
    const tp = new Float64Array(close.length);
    for (let i = 0; i < close.length; i++) tp[i] = (high[i] + low[i] + close[i]) / 3;

    const posMF = new Float64Array(close.length);
    const negMF = new Float64Array(close.length);

    for (let i = 1; i < close.length; i++) {
        const mf = tp[i] * volume[i];
        if (tp[i] > tp[i - 1]) posMF[i] = mf;
        else if (tp[i] < tp[i - 1]) negMF[i] = mf;
    }

    const sumPos = new Float64Array(close.length);
    const sumNeg = new Float64Array(close.length);
    let pSum = 0;
    let nSum = 0;

    for (let i = 0; i < length; i++) {
        pSum += posMF[i];
        nSum += negMF[i];
    }
    sumPos[length - 1] = pSum;
    sumNeg[length - 1] = nSum;

    for (let i = length; i < close.length; i++) {
        pSum += posMF[i] - posMF[i - length];
        nSum += negMF[i] - negMF[i - length];
        sumPos[i] = pSum;
        sumNeg[i] = nSum;
    }

    const result = new Float64Array(close.length).fill(NaN);
    for (let i = length - 1; i < close.length; i++) {
        if (sumNeg[i] === 0) result[i] = 100;
        else result[i] = 100 - (100 / (1 + sumPos[i] / sumNeg[i]));
    }
    return result;
}

/**
 * Average Directional Index (ADX)
 */
export function adx(high: number[] | Float64Array, low: number[] | Float64Array, close: number[] | Float64Array, length: number): Float64Array {
    const tr = new Float64Array(high.length);
    const plusDM = new Float64Array(high.length);
    const minusDM = new Float64Array(high.length);

    for (let i = 1; i < high.length; i++) {
        const up = high[i] - high[i - 1];
        const down = low[i - 1] - low[i];
        plusDM[i] = (up > down && up > 0) ? up : 0;
        minusDM[i] = (down > up && down > 0) ? down : 0;

        const val1 = high[i] - low[i];
        const val2 = Math.abs(high[i] - close[i - 1]);
        const val3 = Math.abs(low[i] - close[i - 1]);
        tr[i] = Math.max(val1, val2, val3);
    }

    const trSmooth = rma(tr, length);
    const plusDMSmooth = rma(plusDM, length);
    const minusDMSmooth = rma(minusDM, length);

    const dx = new Float64Array(high.length);
    for (let i = 0; i < high.length; i++) {
        if (trSmooth[i] === 0 || Number.isNaN(trSmooth[i])) {
            dx[i] = 0;
            continue;
        }
        const diPlus = 100 * plusDMSmooth[i] / trSmooth[i];
        const diMinus = 100 * minusDMSmooth[i] / trSmooth[i];
        const sum = diPlus + diMinus;
        const diff = Math.abs(diPlus - diMinus);
        dx[i] = sum === 0 ? 0 : 100 * diff / sum;
    }
    return rma(dx, length); // ADX is just refined DX
}

/**
 * Moving Average Convergence Divergence (MACD)
 */
export function macd(source: number[] | Float64Array, fastLen: number, slowLen: number, signalLen: number): Float64Array {
    const fastMA = ema(source, fastLen);
    const slowMA = ema(source, slowLen);
    const macdLine = new Float64Array(source.length).fill(NaN);
    for (let i = 0; i < source.length; i++) {
        if (!Number.isNaN(fastMA[i]) && !Number.isNaN(slowMA[i])) macdLine[i] = fastMA[i] - slowMA[i];
    }
    return macdLine;
}
