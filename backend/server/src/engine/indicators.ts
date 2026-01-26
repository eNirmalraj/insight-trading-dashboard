// backend/server/src/engine/indicators.ts
// Technical Indicator Calculations for Strategy Engine

export interface Candle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

/**
 * Calculate Simple Moving Average
 */
export const calculateSMA = (data: number[], period: number): (number | null)[] => {
    if (period > data.length || period <= 0) return Array(data.length).fill(null);

    const sma: (number | null)[] = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            sma.push(null);
            continue;
        }
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += data[i - j];
        }
        sma.push(sum / period);
    }
    return sma;
};

/**
 * Calculate Exponential Moving Average
 */
export const calculateEMA = (data: number[], period: number): (number | null)[] => {
    if (period > data.length || period <= 0) return Array(data.length).fill(null);

    const ema: (number | null)[] = [];
    const multiplier = 2 / (period + 1);
    let prevEma: number | null = null;

    for (let i = 0; i < data.length; i++) {
        const price = data[i];

        if (prevEma === null) {
            if (i >= period - 1) {
                // Initialize with SMA
                const sma = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
                prevEma = sma;
                ema.push(prevEma);
            } else {
                ema.push(null);
            }
        } else {
            const currentEma: number = (price - (prevEma as number)) * multiplier + (prevEma as number);
            ema.push(currentEma);
            prevEma = currentEma;
        }
    }
    return ema;
};

/**
 * Calculate RSI
 */
export const calculateRSI = (candles: Candle[], period: number): (number | null)[] => {
    const prices = candles.map(d => d.close);
    if (period >= prices.length || period <= 0) return Array(prices.length).fill(null);

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

    return rsi;
};

/**
 * Calculate Bollinger Bands
 */
export const calculateBollingerBands = (
    data: number[],
    period: number,
    stdDev: number
): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } => {
    const sma = calculateSMA(data, period);
    const upper: (number | null)[] = [];
    const lower: (number | null)[] = [];

    for (let i = 0; i < data.length; i++) {
        if (sma[i] === null) {
            upper.push(null);
            lower.push(null);
            continue;
        }

        let sumSqDiff = 0;
        for (let j = 0; j < period; j++) {
            sumSqDiff += Math.pow(data[i - j] - (sma[i] as number), 2);
        }

        const sd = Math.sqrt(sumSqDiff / period);
        upper.push((sma[i] as number) + (sd * stdDev));
        lower.push((sma[i] as number) - (sd * stdDev));
    }

    return { upper, middle: sma, lower };
};

/**
 * Detect crossover between two series
 */
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

    if (prev1 < prev2 && current1 > current2) return 'up';
    if (prev1 > prev2 && current1 < current2) return 'down';

    return null;
};

/**
 * Calculate indicator by type
 */
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
            return { main: calculateRSI(candles, parameters.period || 14) };

        case 'BOLLINGER_BANDS':
            return calculateBollingerBands(prices, parameters.period || 20, parameters.stdDev || 2);

        case 'CLOSE':
            return { main: prices };

        default:
            console.warn(`Unknown indicator type: ${type}`);
            return { main: Array(candles.length).fill(null) };
    }
};
