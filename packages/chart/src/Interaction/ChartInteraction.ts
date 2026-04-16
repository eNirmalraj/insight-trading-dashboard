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
            visibleCandles: newVisible,
        };

        this.engine.setView(newView);
        this.callbacks.onViewChange?.(newView);
    };

    private handlePointerDown = (e: PointerEvent) => {
        this.container.setPointerCapture(e.pointerId);
        this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (this.activePointers.size === 1) {
            // Always check for existing drawings first (higher priority)
            const hit = this.hitTest(e.clientX, e.clientY);

            if (hit) {
                // User clicked on an existing drawing - enter modify mode
                const point = this.getPoint(e.clientX, e.clientY);
                this.interaction = {
                    type: 'modifying',
                    drawingId: hit.drawing.id,
                    handle: hit.handle,
                    startPoint: point,
                    originalDrawing: { ...hit.drawing },
                };
                // Set as selected
                this.engine.setSelectedDrawing(hit.drawing.id);
                // Set cursor to grabbing while dragging
                this.container.style.cursor = 'grabbing';
            } else if (this.interaction.type === 'drawing') {
                // No existing drawing hit, and we're in drawing mode - create new drawing
                this.handleDrawingStart(e.clientX, e.clientY);
            } else {
                // Clear selection when clicking elsewhere
                this.engine.setSelectedDrawing(null);

                // Start panning
                this.interaction = {
                    type: 'panning',
                    area: 'chart',
                    startX: e.clientX,
                    startY: e.clientY,
                    initialStartIndex: this.engine.getView().startIndex,
                    initialVisibleCandles: this.engine.getView().visibleCandles,
                    initialPriceRange: this.engine.getPriceRange(),
                };
                this.container.style.cursor = 'grabbing';
            }
        }
    };

    private handlePointerMove = (e: PointerEvent) => {
        const rect = this.container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Update crosshair
        this.engine.setCrosshairPosition(x, y);

        // Update cursor and hover state (only when not actively dragging)
        if (
            this.interaction.type === 'none' ||
            (!this.activePointers.has(e.pointerId) && this.interaction.type !== 'modifying')
        ) {
            const hit = this.hitTest(e.clientX, e.clientY);
            if (hit) {
                // Update hovered drawing
                this.engine.setHoveredDrawing(hit.drawing.id);

                // Show appropriate cursor for draggable elements
                if (hit.handle) {
                    this.container.style.cursor = 'ns-resize'; // Vertical resize for handles
                } else {
                    this.container.style.cursor = 'move'; // Move cursor for whole object
                }
            } else {
                // Clear hover state
                this.engine.setHoveredDrawing(null);
                this.container.style.cursor = 'crosshair'; // Default chart cursor
            }
        }

        // Update drawing preview if in drawing mode
        if (this.interaction.type === 'drawing') {
            this.handleDrawingMove(e.clientX, e.clientY);
        }

        // Handle drawing modification (dragging)
        if (this.interaction.type === 'modifying') {
            this.handleDrawingModify(e.clientX, e.clientY);
        }

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
                startIndex: this.interaction.initialStartIndex - candlesShift,
            };

            this.engine.setView(newView);
            this.callbacks.onViewChange?.(newView);
        }
    };

    private handlePointerUp = (e: PointerEvent) => {
        this.container.releasePointerCapture(e.pointerId);
        this.activePointers.delete(e.pointerId);

        if (this.activePointers.size === 0) {
            if (this.interaction.type === 'drawing') {
                this.handleDrawingEnd(e.clientX, e.clientY);
            } else if (this.interaction.type === 'modifying') {
                // Finish modifying
                this.interaction = { type: 'none' };
                // Reset cursor after dragging
                this.container.style.cursor = 'crosshair';
            } else {
                this.interaction = { type: 'none' };
                this.container.style.cursor = 'crosshair';
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
            const style = {
                color: '#2962FF',
                width: 2,
                lineStyle: 'solid' as const,
                fillColor: 'rgba(41, 98, 255, 0.1)',
            };

            if (tool === 'Trend Line' || tool === 'Ray' || tool === 'Arrow') {
                this.engine.setCurrentDrawing({
                    id,
                    type: tool,
                    start: point,
                    end: point,
                    style: style as any,
                    step: 1,
                });
            } else if (
                tool === 'Price Range' ||
                tool === 'Date Range' ||
                tool === 'Date & Price Range'
            ) {
                this.engine.setCurrentDrawing({
                    id,
                    type: tool,
                    start: point,
                    end: point,
                    style: style as any,
                    step: 1,
                });
            } else if (tool === 'Long Position' || tool === 'Short Position') {
                // Multi-step drawing: entry -> profit -> stop
                this.engine.setCurrentDrawing({
                    id,
                    type: tool,
                    entry: point,
                    profit: point,
                    stop: point,
                    style: style as any,
                    step: 1,
                });
            }
        } else {
            // Continue drawing (e.g. step 2, 3 for position tools)
            if (tool === 'Long Position' || tool === 'Short Position') {
                if (current.step === 1) {
                    // Set profit target
                    this.engine.setCurrentDrawing({
                        ...current,
                        profit: point,
                        step: 2,
                    } as any);
                } else if (current.step === 2) {
                    // Set stop loss and complete
                    const { step, ...finalDrawing } = {
                        ...current,
                        stop: point,
                    };
                    this.engine.addDrawing(finalDrawing as any);
                    this.engine.setCurrentDrawing(null);
                    this.engine.setActiveTool(null);
                }
            } else if (current.step === 1) {
                // Two-point drawings (ranges, lines, etc.)
                const { step, ...finalDrawing } = current;
                this.engine.addDrawing(finalDrawing as any);
                this.engine.setCurrentDrawing(null);
                this.engine.setActiveTool(null);
            }
        }
    }

    private handleDrawingMove(x: number, y: number) {
        if (this.interaction.type !== 'drawing') return;
        const current = this.engine.getCurrentDrawing();
        if (!current) return;

        const point = this.getPoint(x, y);
        if (!point) return;

        if (current.type === 'Long Position' || current.type === 'Short Position') {
            // Update the point being drawn based on step
            if (current.step === 1) {
                this.engine.setCurrentDrawing({
                    ...current,
                    profit: point,
                } as any);
            } else if (current.step === 2) {
                this.engine.setCurrentDrawing({
                    ...current,
                    stop: point,
                } as any);
            }
        } else if (current.step === 1) {
            // For two-point drawings, update the end point
            this.engine.setCurrentDrawing({
                ...current,
                end: point,
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

    private hitTest(x: number, y: number): { drawing: Drawing; handle?: string } | null {
        const drawings = this.engine.getDrawings();
        const coord = this.engine.getCoordinateSystem();
        const data = this.engine.getData();
        if (!coord) return null;

        const rect = this.container.getBoundingClientRect();
        const mouseP = { x: x - rect.left, y: y - rect.top };
        const HITBOX = 10;

        for (let i = drawings.length - 1; i >= 0; i--) {
            const d = drawings[i];

            // Handle Position drawings (Long/Short)
            if (d.type === 'Long Position' || d.type === 'Short Position') {
                const dPos = d as any;
                const entryP = {
                    x: coord.timeToX(dPos.entry.time, data),
                    y: coord.priceToY(dPos.entry.price),
                };
                const profitP = {
                    x: coord.timeToX(dPos.profit.time, data),
                    y: coord.priceToY(dPos.profit.price),
                };
                const stopP = {
                    x: coord.timeToX(dPos.stop.time, data),
                    y: coord.priceToY(dPos.stop.price),
                };

                // Larger hitbox for handles (12px radius)
                const HANDLE_HITBOX = 12;
                if (distSq(mouseP, entryP) < HANDLE_HITBOX * HANDLE_HITBOX)
                    return { drawing: d, handle: 'entry' };
                if (distSq(mouseP, profitP) < HANDLE_HITBOX * HANDLE_HITBOX)
                    return { drawing: d, handle: 'profit' };
                if (distSq(mouseP, stopP) < HANDLE_HITBOX * HANDLE_HITBOX)
                    return { drawing: d, handle: 'stop' };

                // Check if clicking on any of the horizontal lines (wider hitbox - 15px)
                const LINE_HITBOX = 15;
                if (Math.abs(mouseP.y - entryP.y) < LINE_HITBOX) return { drawing: d };
                if (Math.abs(mouseP.y - profitP.y) < LINE_HITBOX) return { drawing: d };
                if (Math.abs(mouseP.y - stopP.y) < LINE_HITBOX) return { drawing: d };
                continue;
            }

            // Handle range drawings
            if (
                d.type === 'Price Range' ||
                d.type === 'Date Range' ||
                d.type === 'Date & Price Range'
            ) {
                const dRange = d as any;
                const p1 = {
                    x: coord.timeToX(dRange.start.time, data),
                    y: coord.priceToY(dRange.start.price),
                };
                const p2 = {
                    x: coord.timeToX(dRange.end.time, data),
                    y: coord.priceToY(dRange.end.price),
                };

                // Check handles
                if (distSq(mouseP, p1) < HITBOX * HITBOX) return { drawing: d, handle: 'start' };
                if (distSq(mouseP, p2) < HITBOX * HITBOX) return { drawing: d, handle: 'end' };

                // Check if inside the range box
                const minX = Math.min(p1.x, p2.x);
                const maxX = Math.max(p1.x, p2.x);
                const minY = Math.min(p1.y, p2.y);
                const maxY = Math.max(p1.y, p2.y);

                if (d.type === 'Price Range') {
                    // Full width, check Y range
                    if (mouseP.y >= minY && mouseP.y <= maxY) return { drawing: d };
                } else if (d.type === 'Date Range') {
                    // Full height, check X range
                    if (mouseP.x >= minX && mouseP.x <= maxX) return { drawing: d };
                } else {
                    // Date & Price Range - check both
                    if (
                        mouseP.x >= minX &&
                        mouseP.x <= maxX &&
                        mouseP.y >= minY &&
                        mouseP.y <= maxY
                    ) {
                        return { drawing: d };
                    }
                }
                continue;
            }

            // Handle line-based drawings (Trend Line, Ray, Arrow, etc.)
            if ('start' in d && 'end' in d) {
                const dLine = d as any;
                const p1 = {
                    x: coord.timeToX(dLine.start.time, data),
                    y: coord.priceToY(dLine.start.price),
                };
                const p2 = {
                    x: coord.timeToX(dLine.end.time, data),
                    y: coord.priceToY(dLine.end.price),
                };

                // Check handles
                if (distSq(mouseP, p1) < HITBOX * HITBOX) return { drawing: d, handle: 'start' };
                if (distSq(mouseP, p2) < HITBOX * HITBOX) return { drawing: d, handle: 'end' };

                // Check segment
                if (d.type === 'Trend Line' || d.type === 'Ray' || d.type === 'Arrow') {
                    if (distToSegmentSquared(mouseP, p1, p2) < HITBOX * HITBOX)
                        return { drawing: d };
                }
            }
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
        const d = drawings.find((dr) => dr.id === drawingId);
        if (!d) return;

        const newDrawing = { ...d } as any;

        // Handle Long/Short Position drawings
        if (d.type === 'Long Position' || d.type === 'Short Position') {
            const originalPos = originalDrawing as any;

            if (handle === 'entry') {
                // Move only entry point (price only, keep time)
                newDrawing.entry = { time: originalPos.entry.time, price: point.price };
            } else if (handle === 'profit') {
                // Move only profit point (price only, keep time)
                newDrawing.profit = { time: originalPos.profit.time, price: point.price };
            } else if (handle === 'stop') {
                // Move only stop point (price only, keep time)
                newDrawing.stop = { time: originalPos.stop.time, price: point.price };
            } else if (!handle) {
                // Move entire position (all three points by same delta)
                const priceDelta = point.price - startPoint!.price;
                const timeDelta = point.time - startPoint!.time;

                newDrawing.entry = {
                    time: originalPos.entry.time + timeDelta,
                    price: originalPos.entry.price + priceDelta,
                };
                newDrawing.profit = {
                    time: originalPos.profit.time + timeDelta,
                    price: originalPos.profit.price + priceDelta,
                };
                newDrawing.stop = {
                    time: originalPos.stop.time + timeDelta,
                    price: originalPos.stop.price + priceDelta,
                };
            }
        }
        // Handle range drawings (Price Range, Date Range, Date & Price Range)
        else if (
            d.type === 'Price Range' ||
            d.type === 'Date Range' ||
            d.type === 'Date & Price Range'
        ) {
            const originalRange = originalDrawing as any;

            if (handle === 'start') {
                newDrawing.start = point;
            } else if (handle === 'end') {
                newDrawing.end = point;
            } else if (!handle) {
                // Move entire range
                const priceDelta = point.price - startPoint!.price;
                const timeDelta = point.time - startPoint!.time;

                newDrawing.start = {
                    time: originalRange.start.time + timeDelta,
                    price: originalRange.start.price + priceDelta,
                };
                newDrawing.end = {
                    time: originalRange.end.time + timeDelta,
                    price: originalRange.end.price + priceDelta,
                };
            }
        }
        // Handle two-point drawings (Trend Line, Ray, Arrow, etc.)
        else if ('start' in d && 'end' in d) {
            const originalLine = originalDrawing as any;

            if (handle === 'start') {
                newDrawing.start = point;
            } else if (handle === 'end') {
                newDrawing.end = point;
            } else if (!handle) {
                // Move entire line
                const priceDelta = point.price - startPoint!.price;
                const timeDelta = point.time - startPoint!.time;

                newDrawing.start = {
                    time: originalLine.start.time + timeDelta,
                    price: originalLine.start.price + priceDelta,
                };
                newDrawing.end = {
                    time: originalLine.end.time + timeDelta,
                    price: originalLine.end.price + priceDelta,
                };
            }
        }

        this.engine.updateDrawing(newDrawing);
    }
}
