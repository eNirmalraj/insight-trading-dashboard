import { ChartEngine } from '../Core/ChartEngine';
import { ViewState, PriceRange, InteractionState, Point, Drawing } from '../types';
import { distToSegmentSquared, distSq } from '../Utils/Geometry';

export class ChartInteraction {
    private interaction: InteractionState = { type: 'none' };
    private activePointers = new Map<number, { x: number; y: number }>();

    public setInteractionType(type: InteractionState) {
        this.interaction = type;
    }

    constructor(
        private engine: ChartEngine,
        private container: HTMLElement,
        private callbacks: {
            onViewChange?: (view: ViewState) => void;
            onPriceRangeChange?: (range: PriceRange) => void;
            onDrawingContextMenu?: (e: MouseEvent, drawing: Drawing) => void;
        } = {}
    ) {
        this.attachHandlers();
    }

    private attachHandlers() {
        this.container.addEventListener('wheel', this.handleWheel, { passive: false });
        this.container.addEventListener('pointerdown', this.handlePointerDown);
        this.container.addEventListener('pointermove', this.handlePointerMove);
        this.container.addEventListener('pointerup', this.handlePointerUp);
        this.container.addEventListener('pointercancel', this.handlePointerUp);
        this.container.addEventListener('contextmenu', this.handleContextMenu);
    }

    public destroy() {
        this.container.removeEventListener('wheel', this.handleWheel);
        this.container.removeEventListener('pointerdown', this.handlePointerDown);
        this.container.removeEventListener('pointermove', this.handlePointerMove);
        this.container.removeEventListener('pointerup', this.handlePointerUp);
        this.container.removeEventListener('pointercancel', this.handlePointerUp);
        this.container.removeEventListener('contextmenu', this.handleContextMenu);
    }

    private handleWheel = (e: WheelEvent) => {
        e.preventDefault();

        // Simple zoom implementation
        const zoomSensitivity = 0.0006;
        const factor = Math.exp(e.deltaY * zoomSensitivity);

        const currentView = this.engine.getView();
        let newVisible = currentView.visibleCandles * factor;

        // Clamp
        newVisible = Math.max(10, Math.min(1000, newVisible));

        // Anchor logic (right edge)
        const currentRightEdge = currentView.startIndex + currentView.visibleCandles;
        const newStartIndex = currentRightEdge - newVisible;

        const newView = {
            startIndex: newStartIndex,
            visibleCandles: newVisible
        };

        this.engine.setView(newView);
        this.callbacks.onViewChange?.(newView);
    };

    private handlePointerDown = (e: PointerEvent) => {
        this.container.setPointerCapture(e.pointerId);
        this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (this.activePointers.size === 1) {
            if (this.interaction.type === 'drawing') {
                this.handleDrawingStart(e.clientX, e.clientY);
            } else {
                this.interaction = {
                    type: 'panning',
                    area: 'chart',
                    startX: e.clientX,
                    startY: e.clientY,
                    initialStartIndex: this.engine.getView().startIndex,
                    initialVisibleCandles: this.engine.getView().visibleCandles,
                    initialPriceRange: this.engine.getPriceRange()
                };
            }
        }
    };

    private handlePointerMove = (e: PointerEvent) => {
        const rect = this.container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Update crosshair
        this.engine.setCrosshairPosition(x, y);

        if (!this.activePointers.has(e.pointerId)) return;
        this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (this.interaction.type === 'panning') {
            const dx = e.clientX - this.interaction.startX;
            // const dy = e.clientY - this.interaction.startY; // For Y-axis panning later

            const view = this.engine.getView();
            const coord = this.engine.getCoordinateSystem();
            if (!coord) return;

            const candleWidth = coord.getCandleWidth();
            const candlesShift = dx / candleWidth;

            const newView = {
                ...view,
                startIndex: this.interaction.initialStartIndex - candlesShift
            };

            this.engine.setView(newView);
            this.callbacks.onViewChange?.(newView);
        }
    };

    private handlePointerUp = (e: PointerEvent) => {
        this.container.releasePointerCapture(e.pointerId);
        this.activePointers.delete(e.pointerId);

        if (this.activePointers.size === 0) {
            if (this.interaction.type !== 'drawing') {
                this.interaction = { type: 'none' };
            } else {
                this.handleDrawingEnd(e.clientX, e.clientY);
            }
        }
    };

    private handlePointerLeave = (e: PointerEvent) => {
        this.activePointers.delete(e.pointerId);
        this.engine.setCrosshairPosition(null, null);

        if (this.activePointers.size === 0) {
            this.interaction = { type: 'none' };
        }
    };

    private handleContextMenu = (e: MouseEvent) => {
        e.preventDefault();
        const hit = this.hitTest(e.clientX, e.clientY);
        if (hit) {
            this.callbacks.onDrawingContextMenu?.(e, hit.drawing);
        }
    };

    private getPoint(x: number, y: number): Point | null {
        const rect = this.container.getBoundingClientRect();
        const localX = x - rect.left;
        const localY = y - rect.top;
        const coord = this.engine.getCoordinateSystem();
        if (!coord) return null;

        // Fix: CoordinateSystem needs xToIndex and yToPrice
        // We added indexToX, need xToIndex inverse. 
        // CoordinateSystem already has xToIndex and yToPrice.
        const index = coord.xToIndex(localX);
        // Need indexToTime? Or just use index?
        // We need TIME for drawing points.
        // ChartEngine has data.
        // We need access to data or a helper in Engine.
        // Let's assume Engine has a public method or property, oh wait data is private.
        // I should add `getTimeAtIndex(index)` to ChartEngine.
        // For now, I'll cheat and access private `data` via `(this.engine as any).data`.
        // TODO: Add public accessor.
        const data = this.engine.getData();
        if (!data || index < 0 || index >= data.length) {
            // Handle out of bounds or missing data
            // If out of bounds, extrapolate time?
            // Simple fallback:
            return null;
        }

        const time = data[index].time;
        const price = coord.yToPrice(localY);
        return { time, price };
    }

    private handleDrawingStart(x: number, y: number) {
        if (this.interaction.type !== 'drawing') return;
        const point = this.getPoint(x, y);
        if (!point) return;

        const tool = this.interaction.tool;
        const current = this.engine.getCurrentDrawing();

        if (!current) {
            // specific logic for tools
            const id = `d_${Date.now()}`;
            const style = { color: '#2962FF', width: 2, lineStyle: 'solid' };

            if (tool === 'Trend Line' || tool === 'Ray') {
                this.engine.setCurrentDrawing({
                    id,
                    type: tool,
                    start: point,
                    end: point,
                    style: style as any,
                    step: 1
                });
            }
        } else {
            // Continue drawing (e.g. step 2)
            // Check if click confirms end
            if (current.step === 1) {
                // Remove step and add to persisted drawings
                const { step, ...finalDrawing } = current;
                this.engine.addDrawing(finalDrawing as any);
                this.engine.setCurrentDrawing(null);
                // Reset tool or keep it? TradingView keeps it if Lock Mode. 
                // For now reset.
                this.engine.setActiveTool(null);
            }
        }
    }

    private handleDrawingMove(x: number, y: number) {
        if (this.interaction.type !== 'drawing') return;
        const current = this.engine.getCurrentDrawing();
        if (current && current.step === 1) {
            const point = this.getPoint(x, y);
            if (!point) return;

            this.engine.setCurrentDrawing({
                ...current,
                end: point
            } as any);
        }
    }

    private handleDrawingEnd(x: number, y: number) {
        // For TrendLine, we Click-Drag-Release style? 
        // Or Click-Click?
        // Legacy code supported both. 
        // Simple Click-Click for now. 
        // If we want Drag-Release, we check distance.
    }

    private hitTest(x: number, y: number): { drawing: Drawing, handle?: string } | null {
        const drawings = this.engine.getDrawings();
        const coord = this.engine.getCoordinateSystem();
        const data = this.engine.getData();
        if (!coord) return null;

        const rect = this.container.getBoundingClientRect();
        const mouseP = { x: x - rect.left, y: y - rect.top };
        const HITBOX = 10;

        for (let i = drawings.length - 1; i >= 0; i--) {
            const d = drawings[i];
            if (!('start' in d) || !('end' in d)) continue;
            // TS now knows d has start/end if we cast or assertion, but 'in' guard is runtime;
            // ideally we cast to a type that has them.
            const dLine = d as any; // Quick fix for now to avoid checking every type

            const p1 = { x: coord.timeToX(dLine.start.time, data), y: coord.priceToY(dLine.start.price) };
            const p2 = { x: coord.timeToX(dLine.end.time, data), y: coord.priceToY(dLine.end.price) };

            // Check handles
            if (distSq(mouseP, p1) < HITBOX * HITBOX) return { drawing: d, handle: 'start' };
            if (distSq(mouseP, p2) < HITBOX * HITBOX) return { drawing: d, handle: 'end' };

            // Check segment
            if (d.type === 'Trend Line') {
                if (distToSegmentSquared(mouseP, p1, p2) < HITBOX * HITBOX) return { drawing: d };
            }
            if (d.type === 'Ray') {
                // Ray hit test logic... simplistic for now, use segment
                if (distToSegmentSquared(mouseP, p1, p2) < HITBOX * HITBOX) return { drawing: d };
            }
            // Add other types...
        }
        return null;
    }

    private handleDrawingModify(x: number, y: number) {
        if (this.interaction.type !== 'modifying') return;
        const { drawingId, handle, startPoint, originalDrawing } = this.interaction;

        const point = this.getPoint(x, y);
        if (!point) return;

        // Find drawing
        const drawings = this.engine.getDrawings();
        const d = drawings.find(dr => dr.id === drawingId);
        if (!d) return;

        let newDrawing = { ...d } as any; // Cast to allow mutation of union parts

        if (handle === 'start') {
            newDrawing.start = point;
        } else if (handle === 'end') {
            newDrawing.end = point;
        } else {
            // Moving the whole line
            // Calculate delta from startPoint (pixels) to current (pixels)
            // Then apply to time/price? 
            // Better: Calculate delta in Time/Price from originalDrawing.
            // This is tricky because Time is index-based often.

            // Simplest: Drag start handle or end handle. 
            // For whole object drag, we need to shift both points by (dx, dy).
            // Let's implement handle drag first.
        }

        this.engine.updateDrawing(newDrawing);
        this.engine.setCurrentDrawing(null); // Ensure no preview is messing up
    }
}
