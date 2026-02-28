import { CoordinateSystem } from '../Core/CoordinateSystem';
import { Drawing, Point, Candle } from '../types';

export class DrawingRenderer {
    constructor(private ctx: CanvasRenderingContext2D) { }

    public drawDrawings(
        drawings: Drawing[],
        coord: CoordinateSystem,
        dimensions: { width: number; height: number },
        data: Candle[]
    ) {
        drawings.forEach(d => {
            if (d.isVisible === false) return;
            this.drawDrawing(d, coord, dimensions, data);
        });
    }

    private drawDrawing(
        d: Drawing,
        coord: CoordinateSystem,
        dim: { width: number; height: number },
        data: Candle[]
    ) {
        this.ctx.save();
        const { style } = d;
        this.ctx.strokeStyle = style.color;
        this.ctx.lineWidth = style.width;

        if (style.lineStyle === 'dashed') {
            this.ctx.setLineDash([8, 4]);
        } else if (style.lineStyle === 'dotted') {
            this.ctx.setLineDash([2, 4]);
        } else {
            this.ctx.setLineDash([]);
        }

        switch (d.type) {
            case 'Trend Line':
            case 'Ray':
                this.drawTrendLine(d as any, coord, dim, data);
                break;
            case 'Horizontal Line':
                this.drawHorizontalLine(d as any, coord, dim);
                break;
            case 'Vertical Line':
                this.drawVerticalLine(d as any, coord, dim, data);
                break;
            case 'Rectangle':
                this.drawRectangle(d as any, coord, dim, data);
                break;
            // Add other types gradually
        }
        this.ctx.restore();
    }

    private drawTrendLine(
        d: { type: string; start: Point; end: Point },
        coord: CoordinateSystem,
        dim: { width: number; height: number },
        data: Candle[]
    ) {
        if (!d.start || !d.end) return;

        const x1 = coord.timeToX(d.start.time, data);
        const y1 = coord.priceToY(d.start.price);
        const x2 = coord.timeToX(d.end.time, data);
        const y2 = coord.priceToY(d.end.price);

        let targetX = x2;
        let targetY = y2;

        if (d.type === 'Ray') {
            const dx = x2 - x1;
            const dy = y2 - y1;
            if (Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6) {
                const len = Math.sqrt(dx * dx + dy * dy);
                const extension = dim.width + dim.height; // Sufficiently large
                targetX = x1 + (dx / len) * extension;
                targetY = y1 + (dy / len) * extension;
            }
        }

        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(targetX, targetY);
        this.ctx.stroke();
    }

    private drawHorizontalLine(
        d: { price: number },
        coord: CoordinateSystem,
        dim: { width: number; height: number }
    ) {
        const y = coord.priceToY(d.price);
        this.ctx.beginPath();
        this.ctx.moveTo(0, y);
        this.ctx.lineTo(dim.width, y);
        this.ctx.stroke();
    }

    private drawVerticalLine(
        d: { time: number },
        coord: CoordinateSystem,
        dim: { width: number; height: number },
        data: Candle[]
    ) {
        const x = coord.timeToX(d.time, data);
        this.ctx.beginPath();
        this.ctx.moveTo(x, 0);
        this.ctx.lineTo(x, dim.height);
        this.ctx.stroke();
    }

    private drawRectangle(
        d: { start: Point; end: Point; style: any },
        coord: CoordinateSystem,
        dim: { width: number; height: number },
        data: Candle[]
    ) {
        if (!d.start || !d.end) return;

        const x1 = coord.timeToX(d.start.time, data);
        const y1 = coord.priceToY(d.start.price);
        const x2 = coord.timeToX(d.end.time, data);
        const y2 = coord.priceToY(d.end.price);

        const x = Math.min(x1, x2);
        const y = Math.min(y1, y2);
        const w = Math.abs(x1 - x2);
        const h = Math.abs(y1 - y2);

        if (d.style.fillColor) {
            this.ctx.fillStyle = d.style.fillColor;
            this.ctx.fillRect(x, y, w, h);
        }

        this.ctx.strokeRect(x, y, w, h);
    }
}
