/**
 * TypeScript type declarations for kuri-engine-full.js
 * Used by kuri-bridge.ts, kuri-monaco.ts, and all integration points.
 */

export interface KuriResult {
    success: boolean;
    errors: KuriError[];
    indicator: { title: string; shorttitle?: string; overlay: boolean } | null;
    inputDefs: InputDef[];
    plots: PlotData[];
    hlines: HlineData[];
    /** Per-bar background colors from bgcolor() calls */
    bgcolors?: Array<{ data: (string | null)[] }>;
    /** Fill regions between two plots from fill() calls */
    fills?: Array<{ plot1: any; plot2: any; color: string }>;
    drawings: { lines: DrawingLine[]; labels: DrawingLabel[]; boxes: DrawingBox[] };
    alerts: AlertData[];
    tables: KuriTable[];
    seriesData: Map<string, number[]>;
    compileTime: number;
    executeTime: number;
    barCount: number;
}

export interface KuriError {
    phase: 'lexer' | 'parser' | 'runtime';
    message: string;
    line?: number;
    col?: number;
}

export interface InputDef {
    title: string;
    type:
        | 'int'
        | 'float'
        | 'bool'
        | 'string'
        | 'color'
        | 'source'
        | 'timeframe'
        | 'session'
        | 'symbol'
        | 'text_area';
    defval: any;
    minval?: number;
    maxval?: number;
    step?: number;
    options?: string[];
    tooltip?: string;
    group?: string;
    /** Inputs with same inline key render side-by-side on one row */
    inline?: string;
    /** If true, show settings dialog immediately when indicator is added */
    confirm?: boolean;
}

export interface PlotData {
    title: string;
    series: (number | null)[];
    color: string;
    /** Per-bar colors (parallel to series). null entries use fallback `color`. */
    colors?: (string | null)[];
    linewidth: number;
    /** Per-bar linewidths (parallel to series). null entries use fallback `linewidth`. */
    linewidths?: (number | null)[];
    style: string; // 'line' | 'histogram' | 'columns' | 'circles' | 'cross'
    kind: string; // 'plot' | 'plotshape' | 'plotchar' | 'plotarrow'
    overlay: boolean;
    /** Controls where the plot is visible: 'all' | 'none' | 'pane' | 'data_window' | 'status_line' | 'price_scale' */
    display?: string;
}

export interface HlineData {
    price: number;
    title: string;
    color: string;
    linestyle?: string;
    editable?: boolean;
}

export interface AlertData {
    title: string;
    message: string;
    condition: boolean[];
}

export interface DrawingLine {
    id: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    color: string;
    width: number;
    style: string;
    extend: string;
    xloc: string;
    deleted: boolean;
}

export interface DrawingLabel {
    id: number;
    x: number;
    y: number;
    text: string;
    textcolor: string;
    color: string;
    style: string;
    size: string;
    xloc: string;
    yloc: string;
    deleted: boolean;
}

export interface DrawingBox {
    id: number;
    left: number;
    top: number;
    right: number;
    bottom: number;
    bgcolor: string;
    border_color: string;
    border_width: number;
    text?: string;
    deleted: boolean;
}

export interface KuriTableCell {
    text: string;
    text_color: string;
    bgcolor: string;
    text_halign: string;
    text_valign: string;
    text_size: string;
}

export interface KuriTable {
    id: number;
    position: string;
    columns: number;
    rows: number;
    cells: (KuriTableCell | null)[][];
    bgcolor: string;
    border_color: string;
    border_width: number;
    deleted: boolean;
}
