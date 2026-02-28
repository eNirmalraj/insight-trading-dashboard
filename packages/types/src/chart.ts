/**
 * @insight/types — Chart Types
 * Indicator, chart settings, and interaction state types.
 */

import { Drawing } from './drawing';
import { Point, PriceRange, Candle } from './candle';

export interface SeriesPoint {
    time: number;
    value: number;
}

export type SeriesType = 'line' | 'histogram' | 'area';

export interface SeriesData {
    id: string;
    name: string;
    type: SeriesType;
    data: SeriesPoint[];
    color: string;
    visible: boolean;
    // Options specific to types could go here (e.g. lineWidth)
    lineWidth?: number;
    areaColor?: string; // for Area type (fill)
}

// --- Indicator Types ---

export type IndicatorType =
    | 'MA'
    | 'EMA'
    | 'RSI'
    | 'BB'
    | 'MACD'
    | 'Stochastic'
    | 'SuperTrend'
    | 'VWAP'
    | 'MA Ribbon'
    | 'CCI'
    | 'Volume'
    | 'MFI'
    | 'OBV';

export interface IndicatorSettings {
    period?: number;
    color?: string;
    stdDev?: number;
    fastPeriod?: number;
    slowPeriod?: number;
    signalPeriod?: number;
    macdColor?: string;
    signalColor?: string;
    histogramUpColor?: string;
    histogramDownColor?: string;
    kPeriod?: number;
    kSlowing?: number;
    dPeriod?: number;
    kColor?: string;
    dColor?: string;
    atrPeriod?: number;
    factor?: number;
    upColor?: string;
    downColor?: string;
    upperColor?: string;
    middleColor?: string;
    lowerColor?: string;
    ribbonPeriods?: string;
    ribbonBaseColor?: string;
    volumeUpColor?: string;
    volumeDownColor?: string;
}

export interface Indicator {
    id: string;
    type: IndicatorType;
    settings: IndicatorSettings;
    data: Record<string, (number | null)[]>;
    isVisible: boolean;
}

// --- Chart Settings ---

export interface SymbolSettings {
    showBody: boolean;
    showBorders: boolean;
    showWick: boolean;
    bodyUpColor: string;
    bodyDownColor: string;
    borderUpColor: string;
    borderDownColor: string;
    wickUpColor: string;
    wickDownColor: string;
    colorBarsOnPrevClose: boolean;
    precision: string;
    timezone: string;
}

export interface StatusLineSettings {
    showOhlc: boolean;
    showBarChange: boolean;
    showVolume: boolean;
    showIndicatorTitles: boolean;
    showIndicatorValues: boolean;
}

export interface ScalesAndLinesSettings {
    showLastPriceLabel: boolean;
    showPriceLabels: boolean;
    gridColor: string;
    crosshairColor: string;
    showCountdown: boolean;
    showGrid: boolean;
    showCrosshair: boolean;
    dateFormat: string;
    timeFormat: string;
}

export interface CanvasSettings {
    backgroundType: 'solid' | 'gradient';
    backgroundColor: string;
    gradientStartColor: string;
    gradientEndColor: string;
    textColor: string;
    showWatermark: boolean;
    watermarkText: string;
    watermarkColor: string;
}

export interface ChartSettings {
    symbol: SymbolSettings;
    statusLine: StatusLineSettings;
    scalesAndLines: ScalesAndLinesSettings;
    canvas: CanvasSettings;
}

// --- Interaction State ---

export type PlacingOrderLine = 'sl' | 'tp' | null;

export type InteractionState =
    | { type: 'none' }
    | { type: 'crosshair' }
    | { type: 'panning'; area: 'chart' | 'yAxis' | 'xAxis'; startX: number; startY: number; initialStartIndex: number; initialVisibleCandles: number; initialPriceRange: PriceRange }
    | { type: 'pinching'; initialDistance: number; initialVisibleCandles: number; initialStartIndex: number; initialPriceRange: PriceRange; initialCenterIndex: number; initialCenterPrice: number }
    | { type: 'scaling'; area: 'chart' | 'yAxis' | 'xAxis'; startX: number; startY: number; initialVisibleCandles: number; initialStartIndex: number; initialPriceRange: PriceRange; anchorDataIndex?: number }
    | { type: 'drawing'; tool: string }
    | { type: 'moving'; drawingId: string; initialDrawing: Drawing; startMousePos: { x: number; y: number }; startPoint: Point }
    | { type: 'resizing'; drawingId: string; handle: string; initialDrawing: Drawing; startMousePos: { x: number; y: number }; startPoint: Point }
    | { type: 'dragging_position_line'; positionId: string; lineType: 'stopLoss' | 'takeProfit' }
    | { type: 'dragging_order_line'; lineType: 'sl' | 'tp' };
