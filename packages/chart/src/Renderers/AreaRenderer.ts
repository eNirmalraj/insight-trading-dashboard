import { CoordinateSystem } from '../Core/CoordinateSystem';

export interface AreaStyle {
    lineColor: string;
    topColor: string;
    bottomColor: string;
    lineWidth: number;
    baseValue?: number; // defaults to bottom of chart or 0
}

export class AreaRenderer {
    constructor(private ctx: CanvasRenderingContext2D) {}

    public draw(
        data: (number | null)[],
        view: { startIndex: number; visibleCandles: number },
        coord: CoordinateSystem,
        style: Partial<AreaStyle> = {}
    ) {
        if (!data || data.length === 0) return;

        const {
            lineColor = '#2962FF',
            topColor = 'rgba(41, 98, 255, 0.4)',
            bottomColor = 'rgba(41, 98, 255, 0.0)',
            lineWidth = 2,
            baseValue,
        } = style;

        const start = Math.floor(view.startIndex) - 1;
        const end = Math.ceil(view.startIndex + view.visibleCandles) + 1;

        // Path Construction
        this.ctx.beginPath();

        let firstPoint: { x: number; y: number } | null = null;
        let lastPoint: { x: number; y: number } | null = null;
        let isPathStarted = false;

        // Draw Line Top
        for (let i = start; i <= end; i++) {
            if (i < 0 || i >= data.length) continue;
            const val = data[i];
            if (val === null || val === undefined) {
                // If we encounter a gap, we must close the current shape and start new?
                // For simplicity, let's treat gaps as breaks in visualization.
                // Reset path
                continue;
            }

            const x = coord.indexToX(i);
            const y = coord.priceToY(val);

            if (!isPathStarted) {
                this.ctx.moveTo(x, y);
                firstPoint = { x, y };
                isPathStarted = true;
            } else {
                this.ctx.lineTo(x, y);
            }
            lastPoint = { x, y };
        }

        if (!firstPoint || !lastPoint) return;

        // Gradient Fill
        // We need to close the path down to base.
        const baseY = baseValue !== undefined ? coord.priceToY(baseValue) : this.ctx.canvas.height;

        this.ctx.lineTo(lastPoint.x, baseY);
        this.ctx.lineTo(firstPoint.x, baseY);
        this.ctx.closePath();

        // Create Gradient
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.ctx.canvas.height);
        gradient.addColorStop(0, topColor);
        gradient.addColorStop(1, bottomColor);

        this.ctx.fillStyle = gradient;
        this.ctx.fill();

        // Draw Top Line (Stroke) on top
        this.ctx.beginPath();
        isPathStarted = false;
        for (let i = start; i <= end; i++) {
            if (i < 0 || i >= data.length) continue;
            const val = data[i];
            if (val === null || val === undefined) {
                isPathStarted = false;
                continue;
            }

            const x = coord.indexToX(i);
            const y = coord.priceToY(val);

            if (!isPathStarted) {
                this.ctx.moveTo(x, y);
                isPathStarted = true;
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        this.ctx.lineWidth = lineWidth;
        this.ctx.strokeStyle = lineColor;
        this.ctx.stroke();
    }
}
