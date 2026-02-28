/**
 * @insight/types — Strategy Types
 * Strategy definitions, parameters, and indicator configurations.
 */

import { StrategyCategory, TradeDirection } from './signal';

export interface StrategyIndicatorConfig {
    type: string; // 'MA', 'EMA', 'RSI', etc.
    parameters: {
        period?: number;
        [key: string]: any;
    };
}

export interface StrategyEntryRule {
    condition: 'crossover' | 'crossunder' | 'greater_than' | 'less_than';
    indicator1: string;
    indicator2?: string;
    value?: number;
    direction: TradeDirection;
}

export interface StrategyParameter {
    id: string;
    strategyId?: string;
    name: string;
    value: string;
    type: 'number' | 'string' | 'boolean';
}

export interface Strategy {
    id: string;
    name: string;
    description?: string;
    category?: StrategyCategory;
    tradingMode?: 'paper' | 'live';
    timeframe: string;
    symbolScope: string[];
    entryRules: StrategyEntryRule[];
    exitRules: any[];
    indicators: StrategyIndicatorConfig[];
    isActive: boolean;
    parameters?: StrategyParameter[];
    type: 'STRATEGY' | 'INDICATOR';
    content?: any;
}

export interface Metric {
    title: string;
    value: string;
    change: string;
    isPositive: boolean;
}

export interface FeatureMetric {
    'Avg Win': string;
    'Avg Loss': string;
    'Max Drawdown': string;
    'Profit Factor': string;
    [key: string]: string;
}

export interface ChartDataPoint {
    time: string;
    value: number;
}

export interface DailyTradeSummary {
    date: string;
    trades: number;
    pnl: number;
    winRate?: number;
}
