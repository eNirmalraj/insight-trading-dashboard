// src/data/builtInIndicators.ts
// Built-in indicator definitions with strict standard alert conditions
// Removed all custom conditions and Price-interaction conditions as requested.

const STANDARD_CONDITIONS = (lineName: string, label: string) => [
    {
        id: `${lineName}_crossing_value`,
        name: `${label} Crossing Value`,
        description: `${label} crosses a specific value`,
        expression: `crosses(${lineName}, {value})`,
        parameters: [{ name: "value", type: "number", default: 0 }]
    },
    {
        id: `${lineName}_crossing_up_value`,
        name: `${label} Crossing Up Value`,
        description: `${label} crosses above a specific value`,
        expression: `crossover(${lineName}, {value})`,
        parameters: [{ name: "value", type: "number", default: 0 }]
    },
    {
        id: `${lineName}_crossing_down_value`,
        name: `${label} Crossing Down Value`,
        description: `${label} crosses below a specific value`,
        expression: `crossunder(${lineName}, {value})`,
        parameters: [{ name: "value", type: "number", default: 0 }]
    },
    {
        id: `${lineName}_gt_value`,
        name: `${label} > Value`,
        description: `${label} is greater than a specific value`,
        expression: `${lineName} > {value}`,
        parameters: [{ name: "value", type: "number", default: 0 }]
    },
    {
        id: `${lineName}_lt_value`,
        name: `${label} < Value`,
        description: `${label} is less than a specific value`,
        expression: `${lineName} < {value}`,
        parameters: [{ name: "value", type: "number", default: 0 }]
    }
];

export const BUILTIN_INDICATORS = {
    RSI: {
        name: "RSI",
        type: "INDICATOR",
        description: "Relative Strength Index",
        outputs: [{ id: "main", color: "#2962FF" }],
        parameters: [{ name: "period", type: "number", default: 14, min: 1, max: 500 }],
        alertConditions: [
            ...STANDARD_CONDITIONS("main", "RSI")
        ]
    },

    MA: {
        name: "MA",
        type: "INDICATOR",
        description: "Simple Moving Average",
        outputs: [{ id: "main", color: "#FF6D00" }],
        parameters: [{ name: "period", type: "number", default: 20, min: 1, max: 500 }],
        alertConditions: STANDARD_CONDITIONS("main", "MA")
    },

    EMA: {
        name: "EMA",
        type: "INDICATOR",
        description: "Exponential Moving Average",
        outputs: [{ id: "main", color: "#00BCD4" }],
        parameters: [{ name: "period", type: "number", default: 20, min: 1, max: 500 }],
        alertConditions: STANDARD_CONDITIONS("main", "EMA")
    },

    BB: {
        name: "Bollinger Bands",
        type: "INDICATOR",
        description: "Bollinger Bands",
        outputs: [
            { id: "upper", color: "#2962FF" },
            { id: "lower", color: "#2962FF" },
            { id: "middle", color: "#FF6D00" }
        ],
        parameters: [
            { name: "period", type: "number", default: 20 },
            { name: "stdDev", type: "number", default: 2 }
        ],
        alertConditions: [
            ...STANDARD_CONDITIONS("upper", "Upper Band"),
            ...STANDARD_CONDITIONS("lower", "Lower Band"),
            ...STANDARD_CONDITIONS("middle", "Basis")
        ]
    },

    MACD: {
        name: "MACD",
        type: "INDICATOR",
        description: "Moving Average Convergence Divergence",
        outputs: [
            { id: "macd", color: "#2962FF" },
            { id: "signal", color: "#FF6D00" },
            { id: "histogram", color: "#26A69A" }
        ],
        parameters: [
            { name: "fastPeriod", type: "number", default: 12 },
            { name: "slowPeriod", type: "number", default: 26 },
            { name: "signalPeriod", type: "number", default: 9 }
        ],
        alertConditions: [
            ...STANDARD_CONDITIONS("macd", "MACD"),
            ...STANDARD_CONDITIONS("signal", "Signal Line"),
            ...STANDARD_CONDITIONS("histogram", "Histogram")
        ]
    },

    Stochastic: {
        name: "Stochastic",
        type: "INDICATOR",
        description: "Stochastic Oscillator",
        outputs: [
            { id: "k", color: "#2962FF" },
            { id: "d", color: "#FF6D00" }
        ],
        alertConditions: [
            ...STANDARD_CONDITIONS("k", "%K"),
            ...STANDARD_CONDITIONS("d", "%D")
        ]
    },

    SuperTrend: {
        name: "SuperTrend",
        type: "INDICATOR",
        description: "SuperTrend",
        outputs: [
            { id: "supertrend", color: "#2962FF" },
            { id: "direction", color: "#FF6D00" }
        ],
        alertConditions: [
            ...STANDARD_CONDITIONS("supertrend", "SuperTrend Line")
        ]
    },

    VWAP: {
        name: "VWAP",
        type: "INDICATOR",
        description: "Volume Weighted Average Price",
        outputs: [{ id: "main", color: "#2962FF" }],
        alertConditions: STANDARD_CONDITIONS("main", "VWAP")
    },

    CCI: {
        name: "CCI",
        type: "INDICATOR",
        description: "Commodity Channel Index",
        outputs: [{ id: "main", color: "#2962FF" }],
        alertConditions: STANDARD_CONDITIONS("main", "CCI")
    },

    MFI: {
        name: "MFI",
        type: "INDICATOR",
        description: "Money Flow Index",
        outputs: [{ id: "main", color: "#2962FF" }],
        alertConditions: STANDARD_CONDITIONS("main", "MFI")
    },

    OBV: {
        name: "OBV",
        type: "INDICATOR",
        description: "On-Balance Volume",
        outputs: [{ id: "main", color: "#2962FF" }],
        alertConditions: STANDARD_CONDITIONS("main", "OBV")
    },

    Volume: {
        name: "Volume",
        type: "INDICATOR",
        description: "Volume",
        outputs: [{ id: "main", color: "#2962FF" }],
        alertConditions: STANDARD_CONDITIONS("main", "Volume")
    }
};

/**
 * Get alert conditions for a built-in indicator type
 */
export const getIndicatorAlertConditions = (indicatorType: string) => {
    const indicator = BUILTIN_INDICATORS[indicatorType as keyof typeof BUILTIN_INDICATORS];
    return indicator?.alertConditions || [];
};

/**
 * Get indicator definition by type
 */
export const getIndicatorDefinition = (indicatorType: string) => {
    return BUILTIN_INDICATORS[indicatorType as keyof typeof BUILTIN_INDICATORS];
};
