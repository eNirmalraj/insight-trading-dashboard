// Built-in Indicator Definitions
// These are pre-built indicators available to all users in Strategy Studio

export interface BuiltInIndicator {
    id: string;
    name: string;
    type: 'INDICATOR';
    description: string;
    category: 'Trend' | 'Momentum' | 'Volatility' | 'Volume';
    parameters: Record<string, any>;
    outputs: Array<{ id: string; color: string; label: string }>;
}

export const BUILT_IN_INDICATORS: BuiltInIndicator[] = [
    {
        id: 'sma',
        name: 'Simple Moving Average (SMA)',
        type: 'INDICATOR',
        description: 'Average price over a specified period',
        category: 'Trend',
        parameters: {
            period: 20,
            source: 'close'
        },
        outputs: [
            { id: 'main', color: '#2962FF', label: 'SMA' }
        ]
    },
    {
        id: 'ema',
        name: 'Exponential Moving Average (EMA)',
        type: 'INDICATOR',
        description: 'Weighted average giving more importance to recent prices',
        category: 'Trend',
        parameters: {
            period: 20,
            source: 'close'
        },
        outputs: [
            { id: 'main', color: '#E91E63', label: 'EMA' }
        ]
    },
    {
        id: 'rsi',
        name: 'Relative Strength Index (RSI)',
        type: 'INDICATOR',
        description: 'Momentum oscillator measuring speed and change of price movements',
        category: 'Momentum',
        parameters: {
            period: 14
        },
        outputs: [
            { id: 'main', color: '#9C27B0', label: 'RSI' }
        ]
    },
    {
        id: 'macd',
        name: 'MACD',
        type: 'INDICATOR',
        description: 'Moving Average Convergence Divergence - trend-following momentum indicator',
        category: 'Momentum',
        parameters: {
            fastPeriod: 12,
            slowPeriod: 26,
            signalPeriod: 9
        },
        outputs: [
            { id: 'macd', color: '#2196F3', label: 'MACD' },
            { id: 'signal', color: '#FF9800', label: 'Signal' },
            { id: 'histogram', color: '#9E9E9E', label: 'Histogram' }
        ]
    },
    {
        id: 'bollinger_bands',
        name: 'Bollinger Bands',
        type: 'INDICATOR',
        description: 'Volatility bands placed above and below a moving average',
        category: 'Volatility',
        parameters: {
            period: 20,
            stdDev: 2
        },
        outputs: [
            { id: 'upper', color: '#2962FF', label: 'Upper Band' },
            { id: 'middle', color: '#FF6D00', label: 'Middle Band' },
            { id: 'lower', color: '#2962FF', label: 'Lower Band' }
        ]
    },
    {
        id: 'stochastic',
        name: 'Stochastic Oscillator',
        type: 'INDICATOR',
        description: 'Momentum indicator comparing closing price to price range',
        category: 'Momentum',
        parameters: {
            kPeriod: 14,
            dPeriod: 3,
            kSlowing: 3
        },
        outputs: [
            { id: 'k', color: '#2196F3', label: '%K' },
            { id: 'd', color: '#FF5722', label: '%D' }
        ]
    },
    {
        id: 'supertrend',
        name: 'SuperTrend',
        type: 'INDICATOR',
        description: 'Trend-following indicator using ATR',
        category: 'Trend',
        parameters: {
            atrPeriod: 10,
            multiplier: 3
        },
        outputs: [
            { id: 'trend', color: '#4CAF50', label: 'SuperTrend' }
        ]
    },
    {
        id: 'vwap',
        name: 'VWAP',
        type: 'INDICATOR',
        description: 'Volume Weighted Average Price',
        category: 'Volume',
        parameters: {},
        outputs: [
            { id: 'main', color: '#FF9800', label: 'VWAP' }
        ]
    },
    {
        id: 'cci',
        name: 'Commodity Channel Index (CCI)',
        type: 'INDICATOR',
        description: 'Momentum oscillator identifying cyclical trends',
        category: 'Momentum',
        parameters: {
            period: 20
        },
        outputs: [
            { id: 'main', color: '#00BCD4', label: 'CCI' }
        ]
    },
    {
        id: 'mfi',
        name: 'Money Flow Index (MFI)',
        type: 'INDICATOR',
        description: 'Volume-weighted RSI',
        category: 'Volume',
        parameters: {
            period: 14
        },
        outputs: [
            { id: 'main', color: '#673AB7', label: 'MFI' }
        ]
    },
    {
        id: 'obv',
        name: 'On-Balance Volume (OBV)',
        type: 'INDICATOR',
        description: 'Cumulative volume-based indicator',
        category: 'Volume',
        parameters: {},
        outputs: [
            { id: 'main', color: '#795548', label: 'OBV' }
        ]
    },
    {
        id: 'ma_ribbon',
        name: 'Moving Average Ribbon',
        type: 'INDICATOR',
        description: 'Multiple moving averages to identify trend strength',
        category: 'Trend',
        parameters: {
            periods: [5, 10, 20, 50, 100, 200]
        },
        outputs: [
            { id: 'ma_5', color: '#F44336', label: 'MA 5' },
            { id: 'ma_10', color: '#E91E63', label: 'MA 10' },
            { id: 'ma_20', color: '#9C27B0', label: 'MA 20' },
            { id: 'ma_50', color: '#2196F3', label: 'MA 50' },
            { id: 'ma_100', color: '#4CAF50', label: 'MA 100' },
            { id: 'ma_200', color: '#FF9800', label: 'MA 200' }
        ]
    }
];

/**
 * Get a built-in indicator by ID
 */
export const getBuiltInIndicator = (id: string): BuiltInIndicator | undefined => {
    return BUILT_IN_INDICATORS.find(ind => ind.id === id);
};

/**
 * Get all built-in indicators for a category
 */
export const getIndicatorsByCategory = (category: 'Trend' | 'Momentum' | 'Volatility' | 'Volume'): BuiltInIndicator[] => {
    return BUILT_IN_INDICATORS.filter(ind => ind.category === category);
};

/**
 * Convert a built-in indicator to JSON format for Strategy Studio
 */
export const indicatorToJSON = (indicator: BuiltInIndicator): string => {
    return JSON.stringify({
        name: indicator.name,
        type: indicator.type,
        description: indicator.description,
        category: indicator.category,
        parameters: indicator.parameters,
        outputs: indicator.outputs
    }, null, 2);
};
