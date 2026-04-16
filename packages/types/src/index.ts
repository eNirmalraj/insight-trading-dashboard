/**
 * @insight/types — Barrel Export
 * Single entry point for all shared types across the Insight platform.
 */

// Market data
export type { Candle, Point, Timeframe, ViewState, PriceRange, TooltipData } from './candle';

// Signals
export { SignalStatus, TradeDirection, EntryType, StrategyCategory } from './signal';
export type { Signal } from './signal';

// Alerts
export { AlertStatus } from './alert';
export type {
    AlertConditionType,
    AlertType,
    AlertFrequency,
    AlertDef,
    AlertTrigger,
    AlertConditionOutput,
    PriceAlert,
    Alert,
} from './alert';

// Strategies
export type {
    Strategy,
    StrategyIndicatorConfig,
    StrategyEntryRule,
    StrategyParameter,
    Metric,
    FeatureMetric,
    ChartDataPoint,
    DailyTradeSummary,
} from './strategy';

// Trading
export { AccountType, PositionStatus } from './trading';
export type { WatchlistItem, Watchlist, Position, RecentTrade, OrderDetails } from './trading';

// Drawings
export type {
    LineStyle,
    DrawingStyle,
    GannLevel,
    GannSettings,
    FibLevel,
    FibSettings,
    TrendLineDrawing,
    RayDrawing,
    HorizontalLineDrawing,
    RectangleDrawing,
    ParallelChannelDrawing,
    TextNoteDrawing,
    LongPositionDrawing,
    ShortPositionDrawing,
    PathDrawing,
    BrushDrawing,
    VerticalLineDrawing,
    ArrowDrawing,
    CalloutDrawing,
    PriceRangeDrawing,
    DateRangeDrawing,
    DatePriceRangeDrawing,
    HorizontalRayDrawing,
    GannBoxDrawing,
    FibonacciRetracementDrawing,
    Drawing,
    CurrentDrawing,
    CurrentDrawingState,
} from './drawing';

// Chart
export type {
    IndicatorType,
    IndicatorSettings,
    Indicator,
    SymbolSettings,
    StatusLineSettings,
    ScalesAndLinesSettings,
    CanvasSettings,
    ChartSettings,
    PlacingOrderLine,
    InteractionState,
    SeriesPoint,
    SeriesType,
    SeriesData,
} from './chart';

// User
export type { Suggestion, UpcomingInfo } from './user';
