// src/data/indicatorAlertConditions.ts

export interface AlertConditionParameter {
    name: string;
    default: number;
    min?: number;
    max?: number;
}

export interface AlertConditionDef {
    id: string;
    name: string;
    expression: string;
    parameters: AlertConditionParameter[];
}

export const indicatorAlertConditions: Record<string, AlertConditionDef[]> = {
    RSI: [
        {
            id: 'rsi-crosses-above',
            name: 'RSI crosses above level',
            expression: 'crossover(rsi_line, {level})',
            parameters: [{ name: 'level', default: 70, min: 0, max: 100 }],
        },
        {
            id: 'rsi-crosses-below',
            name: 'RSI crosses below level',
            expression: 'crossunder(rsi_line, {level})',
            parameters: [{ name: 'level', default: 30, min: 0, max: 100 }],
        },
        {
            id: 'rsi-above',
            name: 'RSI above level',
            expression: 'rsi_line > {level}',
            parameters: [{ name: 'level', default: 70, min: 0, max: 100 }],
        },
        {
            id: 'rsi-below',
            name: 'RSI below level',
            expression: 'rsi_line < {level}',
            parameters: [{ name: 'level', default: 30, min: 0, max: 100 }],
        },
    ],
    MA: [
        {
            id: 'ma-cross-above-price',
            name: 'Price crosses above MA',
            expression: 'crossover(close, ma_line)',
            parameters: [],
        },
        {
            id: 'ma-cross-below-price',
            name: 'Price crosses below MA',
            expression: 'crossunder(close, ma_line)',
            parameters: [],
        },
    ],
    EMA: [
        {
            id: 'ema-cross-above-price',
            name: 'Price crosses above EMA',
            expression: 'crossover(close, ema_line)',
            parameters: [],
        },
        {
            id: 'ema-cross-below-price',
            name: 'Price crosses below EMA',
            expression: 'crossunder(close, ema_line)',
            parameters: [],
        },
    ],
    MACD: [
        {
            id: 'macd-cross-signal',
            name: 'MACD crosses above Signal',
            expression: 'crossover(macd_line, signal_line)',
            parameters: [],
        },
        {
            id: 'macd-cross-below-signal',
            name: 'MACD crosses below Signal',
            expression: 'crossunder(macd_line, signal_line)',
            parameters: [],
        },
        {
            id: 'macd-hist-above-zero',
            name: 'Histogram crosses above zero',
            expression: 'crossover(histogram, 0)',
            parameters: [],
        },
        {
            id: 'macd-hist-below-zero',
            name: 'Histogram crosses below zero',
            expression: 'crossunder(histogram, 0)',
            parameters: [],
        },
    ],
    BB: [
        {
            id: 'bb-price-above-upper',
            name: 'Price crosses above upper band',
            expression: 'crossover(close, upper_band)',
            parameters: [],
        },
        {
            id: 'bb-price-below-lower',
            name: 'Price crosses below lower band',
            expression: 'crossunder(close, lower_band)',
            parameters: [],
        },
    ],
    STOCH: [
        {
            id: 'stoch-k-above',
            name: '%K crosses above level',
            expression: 'crossover(k_line, {level})',
            parameters: [{ name: 'level', default: 80, min: 0, max: 100 }],
        },
        {
            id: 'stoch-k-below',
            name: '%K crosses below level',
            expression: 'crossunder(k_line, {level})',
            parameters: [{ name: 'level', default: 20, min: 0, max: 100 }],
        },
    ],
    ATR: [
        {
            id: 'atr-above',
            name: 'ATR above level',
            expression: 'atr_line > {level}',
            parameters: [{ name: 'level', default: 1.0 }],
        },
        {
            id: 'atr-below',
            name: 'ATR below level',
            expression: 'atr_line < {level}',
            parameters: [{ name: 'level', default: 0.5 }],
        },
    ],
};

/** Get conditions for an indicator type, with fallback. */
export function getAlertConditions(indicatorType: string): AlertConditionDef[] {
    return indicatorAlertConditions[indicatorType] || [];
}
