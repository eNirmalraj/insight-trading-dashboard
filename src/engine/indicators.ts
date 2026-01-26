// src/engine/indicators.ts
// Indicator calculation utilities for strategy engine
// Reuses calculations from market-chart/helpers.ts

import { Candle } from '../types/market';

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
            if (initialSlice.length >= period) {
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

    // Initial average
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

    for (let i = 0; i < period; i++) rsi.push(null);

    let rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    rsi[period] = 100 - (100 / (1 + rs));

    // Subsequent calculations
    for (let i = period + 1; i < prices.length; i++) {
        const change = prices[i] - prices[i - 1];
        let currentGain = 0;
        let currentLoss = 0;

        if (change > 0) {
            currentGain = change;
        } else {
            currentLoss = -change;
        }

        avgGain = (avgGain * (period - 1) + currentGain) / period;
        avgLoss = (avgLoss * (period - 1) + currentLoss) / period;

        rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
        rsi[i] = 100 - (100 / (1 + rs));
    }

    return { main: rsi };
};

// Detect crossover between two series
export const detectCrossover = (
    series1: (number | null)[],
    series2: (number | null)[],
    index: number
): 'up' | 'down' | null => {
    if (index < 1) return null;

    const current1 = series1[index];
    const current2 = series2[index];
    const prev1 = series1[index - 1];
    const prev2 = series2[index - 1];

    if (current1 === null || current2 === null || prev1 === null || prev2 === null) {
        return null;
    }

    // Crossover up: series1 was below series2, now above
    if (prev1 < prev2 && current1 > current2) {
        return 'up';
    }

    // Crossover down: series1 was above series2, now below
    if (prev1 > prev2 && current1 < current2) {
        return 'down';
    }

    return null;
};

// Calculate Bollinger Bands
export const calculateBollingerBands = (data: (number | null)[], period: number, stdDev: number): Record<string, (number | null)[]> => {
    const sma = calculateSMA(data, period);
    const upper: (number | null)[] = [];
    const lower: (number | null)[] = [];
    const middle: (number | null)[] = sma; // Middle band is just SMA

    for (let i = 0; i < data.length; i++) {
        if (sma[i] === null) {
            upper.push(null);
            lower.push(null);
            continue;
        }

        // Calculate Standard Deviation
        let sumSqDiff = 0;
        let count = 0;
        for (let j = 0; j < period; j++) {
            const val = data[i - j];
            if (val !== null) {
                sumSqDiff += Math.pow(val - (sma[i] as number), 2);
                count++;
            }
        }

        if (count === period) {
            const sd = Math.sqrt(sumSqDiff / period);
            upper.push((sma[i] as number) + (sd * stdDev));
            lower.push((sma[i] as number) - (sd * stdDev));
        } else {
            upper.push(null);
            lower.push(null);
        }
    }

    return { upper, middle, lower };
};


// Calculate indicator based on type and parameters
export const calculateIndicator = (
    type: string,
    candles: Candle[],
    parameters: Record<string, any>
): Record<string, (number | null)[]> => {
    const prices = candles.map(c => c.close);

    switch (type.toUpperCase()) {
        case 'MA':
        case 'SMA':
            return { main: calculateSMA(prices, parameters.period || 20) };

        case 'EMA':
            return { main: calculateEMA(prices, parameters.period || 20) };

        case 'RSI':
            return calculateRSI(candles, parameters.period || 14);

        case 'BOLLINGER_BANDS':
            return calculateBollingerBands(prices, parameters.period || 20, parameters.stdDev || 2);

        case 'CLOSE': // Special helper to access raw price data as an indicator
            return { main: prices };

        default:
            console.warn(`Unknown indicator type: ${type}`);
            return { main: Array(candles.length).fill(null) };
    }
};
