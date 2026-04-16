/**
 * @insight/types — Drawing Types
 * Chart drawing tool definitions (trendlines, fibonacci, channels, etc.)
 */

import { Point } from './candle';

export type LineStyle = 'solid' | 'dashed' | 'dotted';

export interface DrawingStyle {
    color: string;
    width: number;
    lineStyle: LineStyle;
    fillColor?: string;
    fontSize?: number;
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

export interface FibSettings {
    trendLine: {
        visible: boolean;
        color: string;
        width: number;
        style: LineStyle;
    };
    levels: FibLevel[];
    extendLines: boolean;
    showBackground: boolean;
    backgroundTransparency: number;
    useLogScale: boolean;
}

// --- Drawing type definitions ---

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

export interface FibonacciRetracementDrawing extends BaseDrawing {
    type: 'Fibonacci Retracement';
    start: Point;
    end: Point;
}

/** Union of all drawing types */
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
    | FibonacciRetracementDrawing;

export type CurrentDrawing = Drawing & { step?: number };
export type CurrentDrawingState = CurrentDrawing | null;
