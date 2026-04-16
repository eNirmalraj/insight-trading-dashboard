/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  Kuri Script Bridge (TypeScript)                             ║
 * ║  For Antigravity's custom Canvas-based CandlestickChart      ║
 * ║  Converts Kuri engine output → existing Indicator interface  ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 *  This bridges LAYER 2 (Kuri engine) to the chart system.
 *  It does NOT replace CandlestickChart.tsx — it plugs into it.
 *
 *  USAGE:
 *    import { KuriBridge } from '@/src/lib/kuri/kuri-bridge';
 *    const bridge = new KuriBridge();
 *
 *    // Run a .kuri script and get chart-ready data:
 *    const result = bridge.run(kuriScript, candles);
 *    const indicatorData = bridge.toIndicatorData(result);
 *    // → { value: [number | null][] } or { upper: [...], middle: [...], lower: [...] }
 *
 *    // Re-run with user-changed settings:
 *    const updated = bridge.run(kuriScript, candles, { "Length": 20 });
 */

// @ts-ignore — kuri-engine-full.js is a UMD module (cache-bust v2)
import * as KuriModule from './kuri-engine-full.js';
// Handle ESM default, CJS module.exports, and Vite's various wrapping strategies
const _mod: any = KuriModule;
const Kuri: any =
    // Vite CJS interop: default export is the module.exports object
    (_mod.default?.KuriEngine ? _mod.default : null) ||
    // Direct namespace has KuriEngine (unlikely but safe)
    (_mod.KuriEngine ? _mod : null) ||
    // globalThis fallback — UMD IIFE sets globalThis.Kuri
    (typeof globalThis !== 'undefined' && (globalThis as any).Kuri?.KuriEngine
        ? (globalThis as any).Kuri
        : null) ||
    // Last resort: whatever we got
    _mod.default ||
    _mod;

if (!Kuri?.KuriEngine) {
    console.error('[KuriBridge] Failed to resolve KuriEngine from module:', {
        moduleKeys: Object.keys(_mod),
        defaultKeys: _mod.default ? Object.keys(_mod.default) : 'no default',
        globalKuri: typeof (globalThis as any).Kuri,
    });
}
import type {
    KuriResult,
    KuriError,
    InputDef,
    PlotData,
    HlineData,
    AlertData,
    DrawingLine,
    DrawingLabel,
    DrawingBox,
} from './types';

// ═══════════════════════════════════════════════════════
// CANDLE INTERFACE — matches existing Antigravity format
// ═══════════════════════════════════════════════════════

export interface Candle {
    time: number; // Unix timestamp in SECONDS
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
}

// Existing Indicator interface from CandlestickChart types.ts
export interface IndicatorChartData {
    data: Record<string, (number | null)[]>;
}

// ═══════════════════════════════════════════════════════
// SIGNAL — extracted from alertcondition() / strategy.*()
// ═══════════════════════════════════════════════════════

export interface KuriSignal {
    type: 'alert' | 'entry' | 'exit';
    title: string;
    message: string;
    direction?: 'BUY' | 'SELL';
    barIndex: number;
    time: number;
    price: number;
}

// ═══════════════════════════════════════════════════════
// LOG ENTRY — maps to existing BottomConsole LogEntry
// ═══════════════════════════════════════════════════════

export interface KuriLogEntry {
    type: 'info' | 'warning' | 'error' | 'success';
    message: string;
    timestamp: number;
    line?: number;
}

// ═══════════════════════════════════════════════════════
// BRIDGE CLASS
// ═══════════════════════════════════════════════════════

export class KuriBridge {
    private engine: any;
    private worker: Worker | null = null;
    private pendingRequests = new Map<string, { resolve: Function; reject: Function }>();

    constructor() {
        this.engine = new Kuri.KuriEngine();
    }

    private getWorker(): Worker {
        if (!this.worker) {
            this.worker = new Worker(new URL('./kuri-worker.ts', import.meta.url), {
                type: 'module',
            });
            this.worker.onmessage = (e: MessageEvent) => {
                const { id, result, error } = e.data;
                const pending = this.pendingRequests.get(id);
                if (pending) {
                    this.pendingRequests.delete(id);
                    if (error) pending.reject(new Error(error));
                    else pending.resolve(result);
                }
            };
            this.worker.onerror = () => {
                // Reject all pending requests so they fall back to main thread
                for (const [id, pending] of this.pendingRequests) {
                    pending.reject(new Error('Worker error'));
                    this.pendingRequests.delete(id);
                }
                this.worker = null;
            };
        }
        return this.worker;
    }

    // ── Helper: build OHLCV + handle candle trimming ──
    private prepareOHLCV(candles: Candle[]): { ohlcv: any; padLen: number } {
        // Scale max candles based on timeframe so lower TFs have enough
        // data for HTF indicators (e.g. request.security with kuri.atr(20)).
        // ATR(20) on 4H needs 20 completed bars = 80hrs warmup PLUS the
        // visible data, so 1m needs ~7 days = 10080 candles.
        let maxCandles = 2000;
        if (candles.length >= 2) {
            const intervalSec = candles[1].time - candles[0].time;
            if (intervalSec <= 60)
                maxCandles = 10000; // 1m → ~7 days
            else if (intervalSec <= 180)
                maxCandles = 5000; // 3m → ~10 days
            else if (intervalSec <= 300) maxCandles = 3000; // 5m → ~10 days
        }
        const trimmed =
            candles.length > maxCandles ? candles.slice(candles.length - maxCandles) : candles;
        return {
            ohlcv: {
                open: trimmed.map((c) => c.open),
                high: trimmed.map((c) => c.high),
                low: trimmed.map((c) => c.low),
                close: trimmed.map((c) => c.close),
                volume: trimmed.map((c) => c.volume ?? 0),
                time: trimmed.map((c) => c.time),
            },
            padLen: candles.length - trimmed.length,
        };
    }

    // ── Helper: pad plot data to match original candle count ──
    private padResult(result: KuriResult, padLen: number, totalBars: number): KuriResult {
        if (padLen > 0) {
            const dataPad = new Array(padLen).fill(NaN);
            const colorPad = new Array(padLen).fill(null);
            for (const plot of result.plots) {
                const p = plot as any;
                if (Array.isArray(p.data)) p.data = [...dataPad, ...p.data];
                if (Array.isArray(p.colors)) p.colors = [...colorPad, ...p.colors];
                if (Array.isArray(p.linewidths)) p.linewidths = [...colorPad, ...p.linewidths];
            }
        }
        (result as any).barCount = totalBars;
        return result;
    }

    // ── Check if script needs slow bar-by-bar execution ──
    private needsBarByBar(script: string): boolean {
        // Quick text scan for keywords that require bar-by-bar
        return (
            /\bvar\s+\w|varip\s+\w/m.test(script) ||
            // if/else blocks (not ternary — ternary is handled by precompute)
            /^\s*if\s+/m.test(script) ||
            // for/while loops
            /\bfor\s+/m.test(script) ||
            /\bwhile\s+/m.test(script)
        );
    }

    // ── Run via Web Worker (non-blocking) ──
    private runInWorker(
        ohlcv: any,
        script: string,
        inputOverrides?: Record<string, any>
    ): Promise<KuriResult> {
        return new Promise((resolve, reject) => {
            const id = Math.random().toString(36).slice(2) + Date.now();
            this.pendingRequests.set(id, { resolve, reject });
            this.getWorker().postMessage({ id, script, ohlcv, inputOverrides });
        });
    }

    // ── PRIMARY: Run a Kuri script ──
    // Uses Web Worker to avoid blocking the UI thread.
    // Falls back to main thread if worker fails.
    async run(
        script: string,
        candles: Candle[],
        inputOverrides?: Record<string, any>
    ): Promise<KuriResult> {
        const { ohlcv, padLen } = this.prepareOHLCV(candles);
        let result: KuriResult;
        try {
            result = await this.runInWorker(ohlcv, script, inputOverrides);
        } catch {
            // Fallback to main thread if worker fails
            result = this.engine.run(script, ohlcv, inputOverrides);
        }
        return this.padResult(result, padLen, candles.length);
    }

    // ── COMPILE ONLY: For diagnostics (no execution) ──
    compile(script: string): { errors: KuriError[] } {
        const { errors } = this.engine.compile(script);
        return { errors };
    }

    // ═══════════════════════════════════════════════════════
    // CHART DATA CONVERSION
    // Converts engine plots → existing Indicator data format
    // ═══════════════════════════════════════════════════════

    /**
     * Convert engine result to the format CandlestickChart.tsx expects:
     * Record<string, (number | null)[]>
     *
     * Examples:
     *   SMA → { value: [null, null, 150.2, 150.5, ...] }
     *   BB  → { upper: [...], middle: [...], lower: [...] }
     *   MACD → { macd: [...], signal: [...], histogram: [...] }
     */
    toIndicatorData(result: KuriResult): Record<string, (number | null)[]> {
        const data: Record<string, (number | null)[]> = {};
        // Deduplicate plots by title (engine may produce dupes across bars)
        const seen = new Set<string>();

        result.plots.forEach((plot) => {
            const title = plot.title || 'value';
            if (seen.has(title)) return;
            seen.add(title);
            // Convert NaN/false to null (chart expects null for missing values)
            // Engine uses .data, TypeScript type says .series — handle both
            // For plotshape/plotarrow, boolean false means "no shape" → null
            const seriesArr = (plot as any).data || plot.series || [];
            const values = seriesArr.map((v: any) =>
                v === undefined || v === null || v === false || (typeof v === 'number' && isNaN(v))
                    ? null
                    : (v as number)
            );
            data[title] = values;

            // Map plot titles → chart-expected data keys
            const lowerTitle = title.toLowerCase();
            if (lowerTitle === 'basis' || lowerTitle === 'middle' || lowerTitle === 'middle band') {
                data['middle'] = values;
            } else if (
                lowerTitle === 'upper' ||
                lowerTitle === 'upper band' ||
                lowerTitle === 'upper bb'
            ) {
                data['upper'] = values;
            } else if (
                lowerTitle === 'lower' ||
                lowerTitle === 'lower band' ||
                lowerTitle === 'lower bb'
            ) {
                data['lower'] = values;
            } else if (lowerTitle === 'macd') {
                data['macd'] = values;
            } else if (lowerTitle === 'signal') {
                data['signal'] = values;
            } else if (lowerTitle === 'histogram') {
                data['histogram'] = values;
            } else if (title === '%K') {
                data['k'] = values;
            } else if (title === '%D') {
                data['d'] = values;
            } else if (lowerTitle === 'supertrend') {
                data['supertrend'] = values;
            } else if (lowerTitle === 'direction') {
                data['direction'] = values;
            } else if (lowerTitle === 'conversion' || lowerTitle === 'conversion line') {
                data['conversion'] = values;
            } else if (lowerTitle === 'base' || lowerTitle === 'base line') {
                data['base'] = values;
            } else if (lowerTitle === 'leading span a' || lowerTitle === 'span a') {
                data['spanA'] = values;
            } else if (lowerTitle === 'leading span b' || lowerTitle === 'span b') {
                data['spanB'] = values;
            } else if (lowerTitle === 'up trend') {
                // SuperTrend: merge up/down into single supertrend + direction arrays
                if (!data['supertrend']) {
                    data['supertrend'] = new Array(values.length).fill(null);
                    data['direction'] = new Array(values.length).fill(null);
                }
                for (let i = 0; i < values.length; i++) {
                    if (values[i] !== null) {
                        data['supertrend'][i] = values[i];
                        data['direction'][i] = -1; // up trend = bullish = -1
                    }
                }
            } else if (lowerTitle === 'down trend') {
                if (!data['supertrend']) {
                    data['supertrend'] = new Array(values.length).fill(null);
                    data['direction'] = new Array(values.length).fill(null);
                }
                for (let i = 0; i < values.length; i++) {
                    if (values[i] !== null) {
                        data['supertrend'][i] = values[i];
                        data['direction'][i] = 1; // down trend = bearish = 1
                    }
                }
            } else if (lowerTitle === 'volume') {
                data['main'] = values;
            }
        });

        // Always provide 'main' and 'value' aliases pointing to the first plot,
        // since the chart rendering looks for indicator.data.main / .value
        if (result.plots.length > 0) {
            const firstKey = Object.keys(data)[0];
            if (firstKey) {
                if (!data['main']) data['main'] = data[firstKey];
                if (!data['value']) data['value'] = data[firstKey];
            }
        }

        return data;
    }

    // ═══════════════════════════════════════════════════════
    // PLOT STYLE EXTRACTION — for chart rendering config
    // ═══════════════════════════════════════════════════════

    /**
     * Extract plot styles for chart rendering.
     * CandlestickChart uses these to decide color, width, style per series.
     */
    getPlotStyles(result: KuriResult): Array<{
        title: string;
        color: string;
        colors?: (string | null)[];
        linewidth: number;
        style: string; // 'line' | 'histogram' | 'columns' | 'circles'
        kind: string; // 'plot' | 'plotshape' | 'plotchar' | 'plotarrow'
        overlay: boolean;
    }> {
        return result.plots.map((p) => ({
            title: p.title || 'Plot',
            color: p.color || '#2962FF',
            colors: (p as any).colors || undefined,
            linewidth: p.linewidth || 1,
            style: p.style || 'line',
            kind: p.kind || 'plot',
            overlay: result.indicator?.overlay ?? true,
        }));
    }

    // ═══════════════════════════════════════════════════════
    // HLINES — horizontal reference lines
    // ═══════════════════════════════════════════════════════

    getHlines(result: KuriResult): HlineData[] {
        return result.hlines || [];
    }

    // ═══════════════════════════════════════════════════════
    // DRAWINGS — lines, labels, boxes for SVG overlay
    // Wire to existing kuriDrawingConverter.ts
    // ═══════════════════════════════════════════════════════

    getActiveDrawings(result: KuriResult): {
        lines: DrawingLine[];
        labels: DrawingLabel[];
        boxes: DrawingBox[];
    } {
        return {
            lines: (result.drawings?.lines || []).filter((l) => !l.deleted),
            labels: (result.drawings?.labels || []).filter((l) => !l.deleted),
            boxes: (result.drawings?.boxes || []).filter((b) => !b.deleted),
        };
    }

    // ═══════════════════════════════════════════════════════
    // SETTINGS PANEL DATA
    // Auto-generates Input tab + Style tab content
    // ═══════════════════════════════════════════════════════

    /**
     * Get input definitions for the Settings panel Inputs tab.
     * Each inputDef maps to a widget:
     *   type "int"    → number spinner
     *   type "float"  → decimal input
     *   type "bool"   → toggle switch
     *   type "string" → dropdown (if options) or text field
     *   type "color"  → color picker
     *   type "source" → source dropdown (close, open, high, low...)
     */
    getInputDefs(result: KuriResult): InputDef[] {
        return result.inputDefs || [];
    }

    /**
     * Get indicator metadata
     */
    getIndicatorMeta(result: KuriResult): {
        title: string;
        shorttitle: string;
        overlay: boolean;
    } {
        return {
            title: result.indicator?.title || 'Untitled',
            shorttitle: result.indicator?.shorttitle || result.indicator?.title || '',
            overlay: result.indicator?.overlay ?? true,
        };
    }

    // ═══════════════════════════════════════════════════════
    // SIGNAL EXTRACTION — for Signal page
    // ═══════════════════════════════════════════════════════

    /**
     * Extract all signals from alertcondition() calls.
     * Returns an array of signals with bar index, time, price, direction.
     */
    extractSignals(result: KuriResult, candles: Candle[]): KuriSignal[] {
        const signals: KuriSignal[] = [];

        (result.alerts || []).forEach((alert) => {
            if (!alert.condition || !Array.isArray(alert.condition)) return;
            alert.condition.forEach((triggered, barIndex) => {
                if (triggered && barIndex < candles.length) {
                    const titleLower = (alert.title || '').toLowerCase();
                    const messageLower = (alert.message || '').toLowerCase();
                    const isBuy =
                        titleLower.includes('buy') ||
                        titleLower.includes('long') ||
                        titleLower.includes('bull') ||
                        messageLower.includes('buy');
                    const isSell =
                        titleLower.includes('sell') ||
                        titleLower.includes('short') ||
                        titleLower.includes('bear') ||
                        messageLower.includes('sell');

                    signals.push({
                        type: 'alert',
                        title: alert.title,
                        message: alert.message,
                        direction: isBuy ? 'BUY' : isSell ? 'SELL' : undefined,
                        barIndex,
                        time: candles[barIndex].time,
                        price: candles[barIndex].close,
                    });
                }
            });
        });

        return signals;
    }

    /**
     * Check if any signal fired on the LAST bar.
     * Used for real-time monitoring on Signal page.
     */
    getLatestSignals(result: KuriResult, candles: Candle[]): KuriSignal[] {
        const allSignals = this.extractSignals(result, candles);
        const lastBar = candles.length - 1;
        return allSignals.filter((s) => s.barIndex === lastBar);
    }

    // ═══════════════════════════════════════════════════════
    // LOG EXTRACTION — for BottomConsole
    // ═══════════════════════════════════════════════════════

    /**
     * Convert engine errors + compile info into LogEntry format
     * that matches BottomConsole.tsx's existing LogEntry[] system.
     */
    toLogs(result: KuriResult): KuriLogEntry[] {
        const logs: KuriLogEntry[] = [];
        const now = Date.now();

        // Compile errors
        result.errors
            .filter((e) => e.phase !== 'runtime')
            .forEach((e) => {
                logs.push({
                    type: 'error',
                    message: `Line ${e.line || '?'}: ${e.message}`,
                    timestamp: now,
                    line: e.line,
                });
            });

        // Runtime warnings
        result.errors
            .filter((e) => e.phase === 'runtime')
            .forEach((e) => {
                logs.push({
                    type: 'warning',
                    message: e.message,
                    timestamp: now,
                    line: e.line,
                });
            });

        // Success message
        if (result.errors.filter((e) => e.phase !== 'runtime').length === 0) {
            const plotCount = result.plots?.length || 0;
            const drawCount =
                (result.drawings?.lines?.filter((l) => !l.deleted).length || 0) +
                (result.drawings?.labels?.filter((l) => !l.deleted).length || 0);
            const alertCount = result.alerts?.length || 0;
            const inputCount = result.inputDefs?.length || 0;

            logs.push({
                type: 'success',
                message: `Compiled in ${result.compileTime?.toFixed(1)}ms, executed in ${result.executeTime?.toFixed(1)}ms — ${result.barCount} bars, ${plotCount} plots, ${drawCount} drawings, ${inputCount} inputs, ${alertCount} alerts`,
                timestamp: now,
            });
        }

        return logs;
    }

    // ═══════════════════════════════════════════════════════
    // STATIC HELPERS
    // ═══════════════════════════════════════════════════════

    /** Get the full list of built-in functions (for autocomplete etc.) */
    static getBuiltinList(): {
        functions: string[];
        constants: string[];
        colors: string[];
        series: string[];
    } {
        return Kuri.KuriEngine.getBuiltinList();
    }

    /** Get engine version */
    static get version(): string {
        return Kuri.VERSION;
    }
}

// ═══════════════════════════════════════════════════════
// SINGLETON — shared across Market page + Strategy Studio
// ═══════════════════════════════════════════════════════

let _bridgeInstance: KuriBridge | null = null;

export function getKuriBridge(): KuriBridge {
    if (!_bridgeInstance) _bridgeInstance = new KuriBridge();
    return _bridgeInstance;
}

// HMR: recreate singleton so updated engine code takes effect
if (import.meta.hot) {
    import.meta.hot.accept(() => {
        _bridgeInstance = null;
    });
}
