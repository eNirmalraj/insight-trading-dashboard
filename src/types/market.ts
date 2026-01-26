export interface Candle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
}

export type ChartSettings = Record<string, any>;
export type Drawing = any;
