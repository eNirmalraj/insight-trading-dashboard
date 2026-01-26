import { Candle } from './types';

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
    // Default fallback
    return { r: 0, g: 0, b: 0, a: 1 };
};

export const calculateSMA = (data: (number | null)[], period: number): (number | null)[] => {
    const validData = data.filter(d => d !== null) as number[];
    if (period > validData.length || period <= 0) return Array(data.length).fill(null);

    const sma: (number | null)[] = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            sma.push(null);
            continue;
        }
        let sum = 0;
        let count = 0;
        for (let j = 0; j < period; j++) {
            const val = data[i - j];
            if (val !== null) {
                sum += val;
                count++;
            }
        }
        if (count === period) {
            sma.push(sum / period);
        } else {
            sma.push(null);
        }
    }
    return sma;
};

export const calculateEMA = (data: (number | null)[], period: number): (number | null)[] => {
    if (period > data.length || period <= 0) return Array(data.length).fill(null);

    const ema: (number | null)[] = [];
    const multiplier = 2 / (period + 1);
    let prevEma: number | null = null;

    for (let i = 0; i < data.length; i++) {
        const price = data[i];
        if (price === null) {
            ema.push(null);
            continue;
        }

        if (prevEma === null) {
            const initialSlice = data.slice(0, i + 1).filter(d => d !== null) as number[];
            if (initialSlice.length >= period) { // Use >= to start EMA calculation sooner
                const sma = initialSlice.slice(-period).reduce((a, b) => a + b, 0) / period;
                prevEma = sma;
                ema.push(prevEma);
            } else {
                ema.push(null);
            }
        } else {
            const currentEma = (price - prevEma) * multiplier + prevEma;
            ema.push(currentEma);
            prevEma = currentEma;
        }
    }
    return ema;
};

export const calculateRSI = (data: Candle[], period: number): Record<string, (number | null)[]> => {
    const prices = data.map(d => d.close);
    if (period >= prices.length || period <= 0) return { main: Array(prices.length).fill(null) };

    const rsi: (number | null)[] = [];
    let avgGain = 0;
    let avgLoss = 0;

    // Initial average for first RSI value
    let gains = 0;
    let losses = 0;
    for (let i = 1; i <= period; i++) {
        const change = prices[i] - prices[i - 1];
        if (change > 0) {
            gains += change;
        } else {
            losses -= change;
        }
    }
    avgGain = gains / period;
    avgLoss = losses / period;

    // Fill null for insufficient data points
    for (let i = 0; i < period; i++) rsi.push(null);

    // Calculate first RSI value with proper edge case handling
    if (avgLoss === 0) {
        // If no losses, RSI = 100
        rsi[period] = avgGain === 0 ? 50 : 100;
    } else if (avgGain === 0) {
        // If no gains, RSI = 0
        rsi[period] = 0;
    } else {
        const rs = avgGain / avgLoss;
        rsi[period] = Math.min(100, Math.max(0, 100 - (100 / (1 + rs))));
    }

    // Subsequent calculations using Wilder's smoothing
    for (let i = period + 1; i < prices.length; i++) {
        const change = prices[i] - prices[i - 1];
        let currentGain = 0;
        let currentLoss = 0;

        if (change > 0) {
            currentGain = change;
        } else {
            currentLoss = -change;
        }

        // Wilder's smoothing method
        avgGain = (avgGain * (period - 1) + currentGain) / period;
        avgLoss = (avgLoss * (period - 1) + currentLoss) / period;

        // Calculate RSI with edge case handling
        if (avgLoss === 0) {
            rsi[i] = avgGain === 0 ? 50 : 100;
        } else if (avgGain === 0) {
            rsi[i] = 0;
        } else {
            const rs = avgGain / avgLoss;
            rsi[i] = Math.min(100, Math.max(0, 100 - (100 / (1 + rs))));
        }
    }

    return { main: rsi };
};


export const calculateBollingerBands = (data: Candle[], period: number, stdDev: number): Record<string, (number | null)[]> => {
    const prices = data.map(d => d.close);
    if (period > prices.length || period <= 0) {
        return { middle: [], upper: [], lower: [] };
    }

    const middle: (number | null)[] = calculateSMA(prices, period);
    const upper: (number | null)[] = [];
    const lower: (number | null)[] = [];

    for (let i = 0; i < prices.length; i++) {
        if (i < period - 1 || middle[i] === null) {
            upper.push(null);
            lower.push(null);
            continue;
        }

        const slice = prices.slice(i - period + 1, i + 1);
        const mean = middle[i]!;

        // Use sample standard deviation (Bessel's correction: n-1)
        // This is more accurate for smaller sample sizes
        const variance = slice.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (period - 1);
        const sd = Math.sqrt(variance);

        upper.push(mean + stdDev * sd);
        lower.push(mean - stdDev * sd);
    }

    return { middle, upper, lower };
};

export const calculateMACD = (data: Candle[], fastPeriod: number, slowPeriod: number, signalPeriod: number): Record<string, (number | null)[]> => {
    const prices = data.map(d => d.close);
    const emaFast = calculateEMA(prices, fastPeriod);
    const emaSlow = calculateEMA(prices, slowPeriod);

    const macdLine = emaFast.map((val, i) => {
        if (val !== null && emaSlow[i] !== null) {
            return val - emaSlow[i]!;
        }
        return null;
    });

    const signalLine = calculateEMA(macdLine, signalPeriod);

    const histogram = macdLine.map((val, i) => {
        if (val !== null && signalLine[i] !== null) {
            return val - signalLine[i]!;
        }
        return null;
    });

    return { macd: macdLine, signal: signalLine, histogram };
};

export const calculateStochastic = (data: Candle[], kPeriod: number, kSlowing: number, dPeriod: number): Record<string, (number | null)[]> => {
    const fullK: (number | null)[] = [];
    for (let i = 0; i < data.length; i++) {
        if (i < kPeriod - 1) {
            fullK.push(null);
            continue;
        }
        const slice = data.slice(i - kPeriod + 1, i + 1);
        const lowestLow = Math.min(...slice.map(c => c.low));
        const highestHigh = Math.max(...slice.map(c => c.high));
        const currentClose = data[i].close;

        if (highestHigh === lowestLow) {
            fullK.push(i > 0 ? fullK[i - 1] : 50);
        } else {
            const kValue = 100 * ((currentClose - lowestLow) / (highestHigh - lowestLow));
            fullK.push(kValue);
        }
    }

    const kLine = calculateSMA(fullK, kSlowing);
    const dLine = calculateSMA(kLine, dPeriod);

    return { k: kLine, d: dLine };
};

const calculateATR = (data: Candle[], period: number): (number | null)[] => {
    if (period > data.length || period <= 0) return Array(data.length).fill(null);

    const trs: number[] = [];
    for (let i = 0; i < data.length; i++) {
        if (!data[i]) continue;
        const high = data[i].high;
        const low = data[i].low;
        if (i === 0) {
            trs.push(high - low);
            continue;
        }
        const prevClose = data[i - 1].close;
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        trs.push(tr);
    }

    const atr: (number | null)[] = [];
    let prevAtr: number | null = null;
    for (let i = 0; i < trs.length; i++) {
        if (i < period - 1) {
            atr.push(null);
        } else if (i === period - 1) {
            const initialSum = trs.slice(0, period).reduce((a, b) => a + b, 0);
            prevAtr = initialSum / period;
            atr.push(prevAtr);
        } else {
            const currentAtr = (prevAtr! * (period - 1) + trs[i]) / period;
            atr.push(currentAtr);
            prevAtr = currentAtr;
        }
    }

    return atr;
};

export const calculateSuperTrend = (data: Candle[], atrPeriod: number, factor: number): Record<string, (number | null)[]> => {
    const atr = calculateATR(data, atrPeriod);
    const supertrend: (number | null)[] = [];
    const direction: (number | null)[] = [];
    let upperBand = 0;
    let lowerBand = 0;
    let trend = 1; // 1 for uptrend, -1 for downtrend

    for (let i = 0; i < data.length; i++) {
        if (!data[i]) {
            supertrend.push(null);
            direction.push(null);
            continue;
        }
        if (i < atrPeriod) {
            supertrend.push(null);
            direction.push(null);
            continue;
        }
        const { high, low, close } = data[i];
        const atrValue = atr[i];
        if (atrValue === null) {
            supertrend.push(null);
            direction.push(null);
            continue;
        }

        const newUpperBand = (high + low) / 2 + factor * atrValue;
        const newLowerBand = (high + low) / 2 - factor * atrValue;

        if (i === atrPeriod || !supertrend[i - 1]) { // Initialization or gap in data
            upperBand = newUpperBand;
            lowerBand = newLowerBand;
        } else {
            upperBand = newUpperBand < upperBand || data[i - 1].close > upperBand ? newUpperBand : upperBand;
            lowerBand = newLowerBand > lowerBand || data[i - 1].close < lowerBand ? newLowerBand : lowerBand;
        }

        if (trend === 1 && close < lowerBand) {
            trend = -1;
        } else if (trend === -1 && close > upperBand) {
            trend = 1;
        }

        supertrend.push(trend === 1 ? lowerBand : upperBand);
        direction.push(trend);
    }
    return { supertrend, direction };
};

export const calculateVWAP = (data: Candle[]): Record<string, (number | null)[]> => {
    const vwap: (number | null)[] = [];
    let cumulativeTypicalPriceVolume = 0;
    let cumulativeVolume = 0;
    let lastDate: string | null = null;

    for (let i = 0; i < data.length; i++) {
        const candle = data[i];
        if (!candle) {
            vwap.push(null);
            continue;
        }
        const currentDate = new Date(candle.time * 1000).toDateString();

        if (lastDate !== currentDate) {
            cumulativeTypicalPriceVolume = 0;
            cumulativeVolume = 0;
            lastDate = currentDate;
        }

        const typicalPrice = (candle.high + candle.low + candle.close) / 3;
        const volume = candle.volume || 0;

        cumulativeTypicalPriceVolume += typicalPrice * volume;
        cumulativeVolume += volume;

        if (cumulativeVolume > 0) {
            vwap.push(cumulativeTypicalPriceVolume / cumulativeVolume);
        } else {
            vwap.push(i > 0 ? vwap[i - 1] : null);
        }
    }
    return { main: vwap };
};

export const calculateCCI = (data: Candle[], period: number): Record<string, (number | null)[]> => {
    const cci: (number | null)[] = [];
    for (let i = 0; i < data.length; i++) {
        if (!data[i]) {
            cci.push(null);
            continue;
        }
        if (i < period - 1) {
            cci.push(null);
            continue;
        }
        const slice = data.slice(i - period + 1, i + 1);
        const typicalPrices = slice.map(c => (c.high + c.low + c.close) / 3);
        const sma = typicalPrices.reduce((sum, val) => sum + val, 0) / period;
        const meanDeviation = typicalPrices.reduce((sum, val) => sum + Math.abs(val - sma), 0) / period;

        if (meanDeviation === 0) {
            cci.push(0);
        } else {
            const currentTypicalPrice = (data[i].high + data[i].low + data[i].close) / 3;
            cci.push((currentTypicalPrice - sma) / (0.015 * meanDeviation));
        }
    }
    return { main: cci };
};

export const calculateMFI = (data: Candle[], period: number): Record<string, (number | null)[]> => {
    const mfi: (number | null)[] = [];
    const rawMoneyFlows: { positive: number; negative: number }[] = [];

    for (let i = 0; i < data.length; i++) {
        if (!data[i]) {
            if (i > 0) rawMoneyFlows.push(rawMoneyFlows[i - 1]); // Fallback
            else rawMoneyFlows.push({ positive: 0, negative: 0 });
            continue;
        }
        if (i === 0) {
            rawMoneyFlows.push({ positive: 0, negative: 0 });
            continue;
        }
        const typicalPrice = (data[i].high + data[i].low + data[i].close) / 3;
        const prevTypicalPrice = (data[i - 1].high + data[i - 1].low + data[i - 1].close) / 3;
        const rawMoneyFlow = typicalPrice * (data[i].volume || 0);

        if (typicalPrice > prevTypicalPrice) {
            rawMoneyFlows.push({ positive: rawMoneyFlow, negative: 0 });
        } else if (typicalPrice < prevTypicalPrice) {
            rawMoneyFlows.push({ positive: 0, negative: rawMoneyFlow });
        } else {
            rawMoneyFlows.push({ positive: 0, negative: 0 });
        }
    }

    for (let i = 0; i < data.length; i++) {
        if (i < period) {
            mfi.push(null);
            continue;
        }
        const slice = rawMoneyFlows.slice(i - period + 1, i + 1);
        const positiveFlow = slice.reduce((sum, val) => sum + val.positive, 0);
        const negativeFlow = slice.reduce((sum, val) => sum + val.negative, 0);

        // Handle edge cases properly
        if (positiveFlow === 0 && negativeFlow === 0) {
            // No money flow - neutral at 50
            mfi.push(50);
        } else if (negativeFlow === 0) {
            // All positive flow - MFI = 100
            mfi.push(100);
        } else if (positiveFlow === 0) {
            // All negative flow - MFI = 0
            mfi.push(0);
        } else {
            const moneyFlowRatio = positiveFlow / negativeFlow;
            const mfiValue = 100 - (100 / (1 + moneyFlowRatio));
            // Clamp between 0-100
            mfi.push(Math.min(100, Math.max(0, mfiValue)));
        }
    }
    return { main: mfi };
};

export const calculateOBV = (data: Candle[]): Record<string, (number | null)[]> => {
    const obv: (number | null)[] = [];
    let cumulativeOBV = 0;

    for (let i = 0; i < data.length; i++) {
        if (!data[i]) {
            obv.push(cumulativeOBV);
            continue;
        }
        const volume = data[i].volume || 0;
        if (i === 0) {
            obv.push(0);
            continue;
        }

        const prevClose = data[i - 1].close;
        const currentClose = data[i].close;

        if (currentClose > prevClose) {
            cumulativeOBV += volume;
        } else if (currentClose < prevClose) {
            cumulativeOBV -= volume;
        }
        obv.push(cumulativeOBV);
    }
    return { main: obv };
};

export const calculateMARibbon = (data: Candle[], periodsStr: string = "10,20,30,40,50,60"): Record<string, (number | null)[]> => {
    const periods = periodsStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0);
    const result: Record<string, (number | null)[]> = {};
    const closePrices = data.map(d => d.close);

    periods.forEach(period => {
        result[`ma_${period}`] = calculateSMA(closePrices, period);
    });

    return result;
};

// Geometry Helper for Alerts & Rendering
import { Drawing, HorizontalLineDrawing, HorizontalRayDrawing, TrendLineDrawing, RayDrawing } from './types';

export const calculateDrawingPriceAtTime = (drawing: Drawing, time: number): number | null => {
    if (!drawing) return null;

    if (drawing.type === 'Horizontal Line') {
        return (drawing as HorizontalLineDrawing).price;
    }

    if (drawing.type === 'Horizontal Ray') {
        const d = drawing as HorizontalRayDrawing;
        if (!d.start) return null;
        if (time >= d.start.time) return d.start.price;
        return null;
    }

    if (drawing.type === 'Trend Line' || drawing.type === 'Ray') {
        const d = drawing as TrendLineDrawing | RayDrawing;
        if (!d.start || !d.end) return null;

        // Validity Checks
        if (drawing.type === 'Trend Line') {
            const minTime = Math.min(d.start.time, d.end.time);
            const maxTime = Math.max(d.start.time, d.end.time);
            if (time < minTime || time > maxTime) return null;
        } else {
            // Ray
            if (time < d.start.time) return null;
        }

        const dt = d.end.time - d.start.time;
        const dp = d.end.price - d.start.price;

        if (dt === 0) return null; // Vertical line

        const slope = dp / dt;
        const timeDelta = time - d.start.time;
        return d.start.price + (slope * timeDelta);
    }

    // Fallback for unsupported types
    return null;
};
