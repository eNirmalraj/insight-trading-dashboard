// Fix: Define Candle interface here to break circular dependency with root types.ts.
export interface Candle {
    time: number; // Unix timestamp in seconds
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
}

export interface Point {
    time: number;
    price: number;
}

export type LineStyle = 'solid' | 'dashed' | 'dotted';

export interface DrawingStyle {
    color: string;
    width: number;
    lineStyle: LineStyle;
    fillColor?: string;
    fontSize?: number;
    // Fix: Add optional properties for Fibonacci levels and colors to provide strong typing.
    levels?: number[];
    levelColors?: string[];
    gannSettings?: GannSettings;
    fibSettings?: FibSettings;
}

export interface GannLevel {
    level: number;
    color: string;
    visible: boolean;
}

export interface GannSettings {
    priceLevels: GannLevel[];
    timeLevels: GannLevel[];
    useLeftLabels: boolean;
    useRightLabels: boolean;
    useTopLabels: boolean;
    useBottomLabels: boolean;
    showBackground: boolean;
    backgroundTransparency: number;
}

export interface FibLevel {
    level: number;
    color: string;
    visible: boolean;
}

export type FibExtendMode = 'both' | 'right' | 'none';

export interface FibSettings {
    trendLine: {
        visible: boolean;
        color: string;
        width: number;
        style: LineStyle;
    };
    levels: FibLevel[];
    extendLines: FibExtendMode;
    showBackground: boolean;
    backgroundTransparency: number;
    useLogScale: boolean;
    snapToSwing: boolean;
    reverse: boolean;
    lineWidth: number;
}

interface BaseDrawing {
    id: string;
    style: DrawingStyle;
    isVisible?: boolean;
}

export interface TrendLineDrawing extends BaseDrawing {
    type: 'Trend Line';
    start: Point;
    end: Point;
}

export interface RayDrawing extends BaseDrawing {
    type: 'Ray';
    start: Point;
    end: Point;
}

export interface HorizontalLineDrawing extends BaseDrawing {
    type: 'Horizontal Line';
    price: number;
}

export interface RectangleDrawing extends BaseDrawing {
    type: 'Rectangle';
    start: Point;
    end: Point;
}

export interface ParallelChannelDrawing extends BaseDrawing {
    type: 'Parallel Channel';
    start: Point;
    end: Point;
    p2: Point;
}

export interface TextNoteDrawing extends BaseDrawing {
    type: 'Text Note';
    point: Point;
    text: string;
}

export interface LongPositionDrawing extends BaseDrawing {
    type: 'Long Position';
    entry: Point;
    profit: Point;
    stop: Point;
}

export interface ShortPositionDrawing extends BaseDrawing {
    type: 'Short Position';
    entry: Point;
    profit: Point;
    stop: Point;
}

export interface PathDrawing extends BaseDrawing {
    type: 'Path';
    points: Point[];
}

export interface BrushDrawing extends BaseDrawing {
    type: 'Brush';
    points: Point[];
}

export interface VerticalLineDrawing extends BaseDrawing {
    type: 'Vertical Line';
    time: number;
}

export interface ArrowDrawing extends BaseDrawing {
    type: 'Arrow';
    start: Point;
    end: Point;
}

export interface CalloutDrawing extends BaseDrawing {
    type: 'Callout';
    anchor: Point;
    label: Point;
    text: string;
}

export interface PriceRangeDrawing extends BaseDrawing {
    type: 'Price Range';
    start: Point;
    end: Point;
}

export interface DateRangeDrawing extends BaseDrawing {
    type: 'Date Range';
    start: Point;
    end: Point;
}

export interface DatePriceRangeDrawing extends BaseDrawing {
    type: 'Date & Price Range';
    start: Point;
    end: Point;
}

export interface HorizontalRayDrawing extends BaseDrawing {
    type: 'Horizontal Ray';
    start: Point;
    end: Point;
}

export interface GannBoxDrawing extends BaseDrawing {
    type: 'Gann Box';
    start: Point;
    end: Point;
}

// FIX: Add FibonacciRetracementDrawing type to resolve comparison error in FloatingDrawingToolbar.
export interface FibonacciRetracementDrawing extends BaseDrawing {
    type: 'Fibonacci Retracement';
    start: Point;
    end: Point;
}

export interface CircleDrawing extends BaseDrawing {
    type: 'Circle';
    center: Point;
    edge: Point;
}

export interface EllipseDrawing extends BaseDrawing {
    type: 'Ellipse';
    start: Point;
    end: Point;
}

export interface TriangleDrawing extends BaseDrawing {
    type: 'Triangle';
    p1: Point;
    p2: Point;
    p3: Point;
}

export interface ArcDrawing extends BaseDrawing {
    type: 'Arc';
    start: Point;
    end: Point;
    control: Point;
}

export interface PolygonDrawing extends BaseDrawing {
    type: 'Polygon';
    points: Point[];
}

export interface HighlightZoneDrawing extends BaseDrawing {
    type: 'Highlight Zone';
    start: Point;
    end: Point;
}

export interface MeasureToolDrawing extends BaseDrawing {
    type: 'Measure Tool';
    start: Point;
    end: Point;
}

export interface PriceLabelDrawing extends BaseDrawing {
    type: 'Price Label';
    point: Point;
}

export interface SignalMarkerDrawing extends BaseDrawing {
    type: 'Signal Marker';
    point: Point;
}

export interface NoteFlagDrawing extends BaseDrawing {
    type: 'Note Flag';
    point: Point;
}

export interface EmojiStickerDrawing extends BaseDrawing {
    type: 'Emoji Sticker';
    point: Point;
}

export type Drawing =
    | TrendLineDrawing
    | RayDrawing
    | HorizontalLineDrawing
    | RectangleDrawing
    | ParallelChannelDrawing
    | TextNoteDrawing
    | LongPositionDrawing
    | ShortPositionDrawing
    | PathDrawing
    | BrushDrawing
    | VerticalLineDrawing
    | ArrowDrawing
    | CalloutDrawing
    | PriceRangeDrawing
    | DateRangeDrawing
    | DatePriceRangeDrawing
    | HorizontalRayDrawing
    | GannBoxDrawing
    // FIX: Add FibonacciRetracementDrawing to the Drawing union type.
    | FibonacciRetracementDrawing
    | CircleDrawing
    | EllipseDrawing
    | TriangleDrawing
    | ArcDrawing
    | PolygonDrawing
    | HighlightZoneDrawing
    | MeasureToolDrawing
    | PriceLabelDrawing
    | SignalMarkerDrawing
    | NoteFlagDrawing
    | EmojiStickerDrawing;

export type CurrentDrawing = Drawing & { step?: number };
export type CurrentDrawingState = CurrentDrawing | null;

export type AlertConditionType =
    | 'Crossing'
    | 'Crossing Up'
    | 'Crossing Down'
    | 'Greater Than'
    | 'Less Than'
    | 'Entering Channel'
    | 'Exiting Channel'
    | 'Time Reached';

export interface PriceAlert {
    id: string;
    symbol: string; // The symbol this alert belongs to
    drawingId?: string; // Optional link to a drawing

    // Indicator Alert Fields
    indicatorId?: string; // Reference to indicator instance from Strategy Studio
    alertConditionId?: string; // Which alertCondition from indicator's JSON
    conditionParameters?: Record<string, any>; // User params like {level: 70}

    condition: AlertConditionType;
    value?: number; // Used for single-price comparisons
    fibLevel?: number; // Used for Fibonacci alerts
    message: string;
    triggered: boolean;
    createdAt: number;
    notifyApp: boolean;
    playSound: boolean;
    triggerFrequency: 'Only Once' | 'Once Per Bar' | 'Once Per Bar Close' | 'Once Per Minute';
    /** Timeframe for bar-close detection (e.g. '1m', '5m', '15m', '1h', '4h', '1d'). Defaults to '1m'. */
    timeframe?: string;
    lastTriggeredAt?: number;
}

export interface TooltipData {
    visible: boolean;
    x: number;
    y: number;
    data: Candle | null;
}

export interface ViewState {
    startIndex: number;
    visibleCandles: number;
}

export interface PriceRange {
    min: number;
    max: number;
}

// Fix: Add all missing Indicator, ChartSettings, and OrderDetails types and export them.
export type IndicatorType =
    | 'MA'
    | 'EMA'
    | 'WMA'
    | 'HMA'
    | 'VWMA'
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
    | 'OBV'
    | 'ATR'
    | 'ADR'
    | 'ADX'
    | 'KC'
    | 'Donchian'
    | 'Ichimoku'
    | 'KURI';

export interface IndicatorSettings {
    /** First plot color — used as general fallback */
    color?: string;
    /** Dynamic keys: Kuri input titles (e.g. "Length", "Fast Length"),
     *  plot styles (plot_N_color, plot_N_linewidth, plot_N_visible),
     *  hline styles (hline_N_color, hline_N_linestyle, hline_N_visible) */
    [key: string]: any;
}

export interface Indicator {
    id: string;
    type: IndicatorType;
    settings: IndicatorSettings;
    data: Record<string, (number | null)[]>;
    isVisible: boolean;
    registryId?: string;
    /** Kuri source code — set when indicator is added from registry */
    kuriSource?: string;
    /** Full indicator title from Kuri engine result.indicator.title (e.g. "Simple Moving Average") */
    kuriTitle?: string;
    /** Auto-generated input definitions from Kuri engine result.inputDefs */
    kuriInputDefs?: import('../../lib/kuri/types').InputDef[];
    /** Auto-generated plot styles from Kuri engine result.plots */
    kuriPlots?: Array<{
        title: string;
        color: string;
        colors?: (string | null)[];
        linewidth: number;
        linewidths?: (number | null)[];
        style: string;
        kind?: string;
        display?: string;
    }>;
    /** Auto-generated hlines from Kuri engine result.hlines */
    kuriHlines?: Array<{ price: number; title: string; color: string; editable?: boolean }>;
    /** Per-bar background colors from bgcolor() calls */
    kuriBgcolors?: Array<{ data: (string | null)[] }>;
    /** Fill regions between two plot titles */
    kuriFills?: Array<{ plot1: string; plot2: string; color: string }>;
    /** Whether the indicator is an overlay (on main chart) or separate pane */
    kuriOverlay?: boolean;
    /** Kuri engine drawings (lines, labels, boxes) for SVG overlay rendering */
    kuriDrawings?: {
        lines: import('./kuriDrawingConverter').ChartDrawingLine[];
        labels: import('./kuriDrawingConverter').ChartDrawingLabel[];
        boxes: import('./kuriDrawingConverter').ChartDrawingBox[];
    };
}

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
    candleBodyWidth: number;     // 0.5–2.0 multiplier on default 0.7 body-to-slot ratio
    showLastPriceLine: boolean;  // dashed horizontal line at last close
}

export interface StatusLineSettings {
    showOhlc: boolean;
    showBarChange: boolean;
    showVolume: boolean;
    showIndicatorTitles: boolean;
    showIndicatorValues: boolean;
    showBarChangePercent: boolean;
    showMarketStatus: boolean;
}

export type ScaleType = 'Linear' | 'Logarithmic' | 'Percent';

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
    scaleType: ScaleType;
    reverseScale: boolean;
    lockPriceToBarRatio: boolean;
    showPrevDayCloseLine: boolean;
    showAverageCloseLine: boolean;
    showHighLowMarkers: boolean;
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

export interface OrderDetails {
    quantity: string;
    sl: string;
    tp: string;
    price: string;
    riskPercent: string;
    // New Binance-style fields
    leverage: number; // e.g., 20
    marginMode: 'Cross' | 'Isolated';
    reduceOnly: boolean;
    postOnly: boolean; // Only for Limit orders
}

export type PlacingOrderLine = 'sl' | 'tp' | null;

// Fix: Add 'crosshair' to InteractionState.
export type InteractionState =
    | { type: 'none' }
    | { type: 'crosshair' }
    | {
          type: 'panning';
          area: 'chart' | 'yAxis' | 'xAxis';
          startX: number;
          startY: number;
          initialStartIndex: number;
          initialVisibleCandles: number;
          initialPriceRange: PriceRange;
      }
    | {
          type: 'pinching';
          initialDistance: number;
          initialVisibleCandles: number;
          initialStartIndex: number;
          initialPriceRange: PriceRange;
          initialCenterIndex: number;
          initialCenterPrice: number;
      }
    | {
          type: 'scaling';
          area: 'chart' | 'yAxis' | 'xAxis';
          startX: number;
          startY: number;
          initialVisibleCandles: number;
          initialStartIndex: number;
          initialPriceRange: PriceRange;
          anchorDataIndex?: number;
      }
    | { type: 'drawing'; tool: string }
    | {
          type: 'moving';
          drawingId: string;
          initialDrawing: Drawing;
          startMousePos: { x: number; y: number };
          startPoint: Point;
      }
    | {
          type: 'resizing';
          drawingId: string;
          handle: string;
          initialDrawing: Drawing;
          startMousePos: { x: number; y: number };
          startPoint: Point;
      }
    | { type: 'dragging_position_line'; positionId: string; lineType: 'stopLoss' | 'takeProfit' }
    | { type: 'dragging_order_line'; lineType: 'sl' | 'tp' };

export interface ConsoleLog {
    id: string;
    level: 'info' | 'warn' | 'error';
    source: string;
    message: string;
    details?: string;
    timestamp: Date;
}

export type ChartType =
    | 'Bars'
    | 'Candles'
    | 'Hollow Candles'
    | 'Heikin Ashi'
    | 'Line'
    | 'Area'
    | 'Baseline';
