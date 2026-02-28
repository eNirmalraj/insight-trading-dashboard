export * from './moving_averages';
export * from './statistics';
export * from './oscillators';
export * from './volatility';
export * from './volume';
export * from './common';

import { sma, ema, wma, vwma, hma, rma, alma, swma, kama, dema, tema, zlema, smma } from './moving_averages';
import { rsi, stoch, cci, mfi, adx, macd } from './oscillators';

/**
 * Legacy support for StrategyEngine's builder-based indicator calculation.
 */
export function calculateIndicator(
    type: string,
    candles: { open: number[], high: number[], low: number[], close: number[], volume: number[] } | any[],
    parameters: any
): Record<string, (number | null)[]> {
    const source = Array.isArray(candles) ? candles.map(c => c.close) : candles.close;
    const highs = Array.isArray(candles) ? candles.map(c => c.high) : (candles as any).high;
    const lows = Array.isArray(candles) ? candles.map(c => c.low) : (candles as any).low;
    const volumes = Array.isArray(candles) ? candles.map(c => c.volume) : (candles as any).volume;

    const period = parameters.period || 14;
    let res: Float64Array;

    switch (type.toUpperCase()) {
        case 'SMA': res = sma(source, period); break;
        case 'EMA': res = ema(source, period); break;
        case 'WMA': res = wma(source, period); break;
        case 'RSI': res = rsi(source, period); break;
        case 'HMA': res = hma(source, period); break;
        case 'VWMA': res = vwma(source, volumes, period); break;
        case 'SMA_VOLUME': res = sma(volumes, period); break;
        default:
            console.warn(`Unsupported indicator in calculateIndicator: ${type}`);
            return { main: new Array(source.length).fill(null) };
    }

    // Convert Float64Array to (number | null)[]
    const main = Array.from(res).map(v => isNaN(v) ? null : v);
    return { main };
}

/**
 * Legacy support for StrategyEngine's crossover detection.
 */
export function detectCrossover(series1: (number | null)[], series2: (number | null)[], index: number): 'up' | 'down' | null {
    if (index <= 0) return null;
    const prev1 = series1[index - 1];
    const prev2 = series2[index - 1];
    const curr1 = series1[index];
    const curr2 = series2[index];

    if (prev1 === null || prev2 === null || curr1 === null || curr2 === null) return null;

    if (prev1 <= prev2 && curr1 > curr2) return 'up';
    if (prev1 >= prev2 && curr1 < curr2) return 'down';
    return null;
}
