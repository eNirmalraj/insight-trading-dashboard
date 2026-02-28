import { CoordinateSystem } from './CoordinateSystem';
import { CandleRenderer } from '../Renderers/CandleRenderer';
import { DrawingRenderer } from '../Renderers/DrawingRenderer';
import { ChartInteraction } from '../Interaction/ChartInteraction';
import { TimeAxisRenderer } from '../Renderers/TimeAxisRenderer';
import { PriceAxisRenderer } from '../Renderers/PriceAxisRenderer';
import { CrosshairRenderer } from '../Renderers/CrosshairRenderer';
import { LineRenderer } from '../Renderers/LineRenderer';
import { HistogramRenderer } from '../Renderers/HistogramRenderer';
import { AreaRenderer } from '../Renderers/AreaRenderer';
import { Candle, ViewState, ChartSettings, PriceRange, Drawing, CurrentDrawingState, Point, SeriesData } from '../types';

export class ChartEngine {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;

    private coordinateSystem: CoordinateSystem | null = null;
    private candleRenderer: CandleRenderer;
    private drawingRenderer: DrawingRenderer;
    private timeAxisRenderer: TimeAxisRenderer;
    private priceAxisRenderer: PriceAxisRenderer;
    private crosshairRenderer: CrosshairRenderer;
    private lineRenderer: LineRenderer;
    private histogramRenderer: HistogramRenderer;
    private areaRenderer: AreaRenderer;
    private interaction: ChartInteraction;
    private interactionCallback: {
        onViewChange?: (view: ViewState) => void;
        onPriceRangeChange?: (range: PriceRange) => void;
        onDrawingComplete?: (drawing: Drawing) => void;
        onDrawingContextMenu?: (e: MouseEvent, drawing: Drawing) => void;
    };

    private data: Candle[] = [];
    private drawings: Drawing[] = [];
    private series: SeriesData[] = [];
    private currentDrawing: CurrentDrawingState = null;
    private activeTool: string | null = null;
    private crosshairPosition: Point | null = null;
    private view: ViewState = { startIndex: 0, visibleCandles: 60 };
    private width: number = 0;
    private height: number = 0;
    private priceRange: PriceRange = { min: 0, max: 100 };

    // Default settings
    private settings: ChartSettings['symbol'] = {
        showBody: true, showBorders: true, showWick: true, bodyUpColor: '#10B981', bodyDownColor: '#EF4444',
        borderUpColor: '#10B981', borderDownColor: '#EF4444', wickUpColor: '#10B981', wickDownColor: '#EF4444',
        colorBarsOnPrevClose: false, precision: 'Default', timezone: 'Etc/UTC',
    };

    constructor(
        canvas: HTMLCanvasElement,
        callbacks?: {
            onViewChange?: (view: ViewState) => void;
            onPriceRangeChange?: (range: PriceRange) => void;
            onDrawingComplete?: (drawing: Drawing) => void;
            onDrawingContextMenu?: (e: MouseEvent, drawing: Drawing) => void;
        }
    ) {
        this.canvas = canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Could not get 2D context");
        this.ctx = ctx;
        this.ctx = ctx;
        this.candleRenderer = new CandleRenderer(ctx);
        this.drawingRenderer = new DrawingRenderer(ctx);
        this.timeAxisRenderer = new TimeAxisRenderer(ctx);
        this.priceAxisRenderer = new PriceAxisRenderer(ctx);
        this.crosshairRenderer = new CrosshairRenderer(ctx);
        this.lineRenderer = new LineRenderer(ctx);
        this.histogramRenderer = new HistogramRenderer(ctx);
        this.areaRenderer = new AreaRenderer(ctx);
        this.interaction = new ChartInteraction(this, canvas, callbacks);
        this.interactionCallback = callbacks || {};

        // Initial setup
        this.updateCoordinateSystem();
    }

    public setData(data: Candle[]) {
        this.data = data;
        this.render();
    }

    public getData(): Candle[] {
        return this.data;
    }

    public setDrawings(drawings: Drawing[]) {
        this.drawings = drawings;
        this.render();
    }

    public addDrawing(drawing: Drawing) {
        this.drawings.push(drawing);
        this.render();
        this.interactionCallback.onDrawingComplete?.(drawing);
    }

    public updateDrawing(drawing: Drawing) {
        const index = this.drawings.findIndex(d => d.id === drawing.id);
        if (index !== -1) {
            this.drawings[index] = drawing;
            this.render();
        }
    }

    public setCurrentDrawing(drawing: CurrentDrawingState) {
        this.currentDrawing = drawing;
        this.render();
    }

    public getCurrentDrawing(): CurrentDrawingState {
        return this.currentDrawing;
    }

    public addSeries(series: SeriesData) {
        this.series.push(series);
        this.render();
    }

    public clearSeries() {
        this.series = [];
        this.render();
    }

    public setActiveTool(tool: string | null) {
        this.activeTool = tool;
        if (tool) {
            this.interaction.setInteractionType({ type: 'drawing', tool });
        } else {
            this.interaction.setInteractionType({ type: 'none' });
        }
    }

    public setCrosshairPosition(x: number | null, y: number | null) {
        if (x === null || y === null) {
            this.crosshairPosition = null;
        } else {
            // Convert to logical point or just keep pixel coords?
            // CrosshairRenderer likely takes pixel coords.
            // But Point type is time/price.
            // Let's store pixel coords for pure rendering or convert?
            // "Point" in types.ts is time/price.
            // Let's just use internal state for crosshair pixels.
        }
        // Refactor: crosshairPosition to be {x, y} pixels not Point
        this._crosshairPixels = (x !== null && y !== null) ? { x, y } : null;
        this.render();
    }
    private _crosshairPixels: { x: number, y: number } | null = null;

    public getActiveTool(): string | null {
        return this.activeTool;
    }

    public getDrawings(): Drawing[] {
        return this.drawings;
    }

    public setView(view: ViewState) {
        this.view = view;
        this.updateCoordinateSystem();
        this.render();
    }

    public getView(): ViewState {
        return this.view;
    }

    public setPriceRange(range: PriceRange) {
        this.priceRange = range;
        this.updateCoordinateSystem();
        this.render();
    }

    public getPriceRange(): PriceRange {
        return this.priceRange;
    }

    public setSettings(settings: ChartSettings['symbol']) {
        this.settings = settings;
        this.render();
    }

    public resize(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.canvas.width = width;
        this.canvas.height = height;
        this.updateCoordinateSystem();
        this.render();
    }

    public getCoordinateSystem(): CoordinateSystem | null {
        return this.coordinateSystem;
    }

    public destroy() {
        this.interaction.destroy();
    }

    private updateCoordinateSystem() {
        if (this.width === 0 || this.height === 0) return;
        this.coordinateSystem = new CoordinateSystem(
            this.width,
            this.height,
            this.view,
            this.priceRange
        );
    }

    public render() {
        if (!this.coordinateSystem) return;

        // Clear canvas
        this.ctx.clearRect(0, 0, this.width, this.height);

        // Draw candles
        this.candleRenderer.draw(this.data, this.view, this.coordinateSystem, this.settings);

        // Draw Series
        /*
         this.series.forEach(s => {
            if (!s.visible) return;
            switch (s.type) {
                case 'line':
                    this.lineRenderer.draw(s, this.view, this.coordinateSystem);
                    break;
                case 'histogram':
                    this.histogramRenderer.draw(s, this.view, this.coordinateSystem);
                    break;
                case 'area':
                    this.areaRenderer.draw(s, this.view, this.coordinateSystem);
                    break;
            }
        });
        */
        // Note: Renderers need to handle SeriesData type correctly.
        // Assuming they accept 's' directly or similar.
        // Let's uncomment and verify types if possible, or implement simple dispatch.
        this.drawSeries();

        // Draw Axes
        this.timeAxisRenderer.draw(this.view, this.data, this.coordinateSystem, {
            height: this.height,
            width: this.width,
            textColor: '#555',
            gridColor: '#e0e0e0',
        });
        this.priceAxisRenderer.draw(this.priceRange, this.coordinateSystem, {
            height: this.height,
            width: this.width,
            textColor: '#555',
            gridColor: '#e0e0e0',
            precision: 2
        });

        // Draw drawings
        this.drawingRenderer.drawDrawings(this.drawings, this.coordinateSystem, { width: this.width, height: this.height }, this.data);

        // Draw current (preview) drawing
        if (this.currentDrawing) {
            this.drawingRenderer.drawDrawings([this.currentDrawing as Drawing], this.coordinateSystem, { width: this.width, height: this.height }, this.data);
        }

        // Draw Crosshair
        if (this._crosshairPixels) {
            this.crosshairRenderer.draw(this._crosshairPixels.x, this._crosshairPixels.y, { width: this.width, height: this.height }, {
                color: '#555',
                labelColor: '#fff',
                labelTcp: '#000'
            });
        }
    }

    private drawSeries() {
        this.series.forEach(s => {
            if (!s.visible) return;

            // Map SeriesPoint[] to (number | null)[] aligned with this.data
            // Optimization: If series data is already aligned (same length, same times), we can just map values.
            // But safely, we should map by index if we assume 1:1.
            // Since the Bridge creates SeriesData from output which is 1:1 with input candles,
            // we can assume the index matches.

            const values = s.data.map(p => p.value);

            if (s.type === 'line') {
                this.lineRenderer.draw(values, this.view, this.coordinateSystem as CoordinateSystem, s.color, s.lineWidth || 2);
            }
            else if (s.type === 'histogram') {
                // Determine color based on standard or custom?
                // Renderer takes 'style'.
                this.histogramRenderer.draw(values, this.view, this.coordinateSystem as CoordinateSystem, {
                    upColor: s.color,
                    downColor: s.color
                });
            }
            else if (s.type === 'area') {
                this.areaRenderer.draw(values, this.view, this.coordinateSystem as CoordinateSystem, {
                    lineColor: s.color,
                    topColor: s.areaColor || s.color, // simplified
                    bottomColor: 'rgba(0,0,0,0)',
                    lineWidth: s.lineWidth || 2
                });
            }
        });
    }
}
