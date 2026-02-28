import { PriceRange, ChartSettings } from '../types';
import { CoordinateSystem } from '../Core/CoordinateSystem';

export class PriceAxisRenderer {
    constructor(private ctx: CanvasRenderingContext2D) { }

    public draw(
        range: PriceRange,
        coord: CoordinateSystem,
        options: {
            width: number;
            height: number;
            textColor: string;
            gridColor: string;
            precision: number;
        }
    ) {
        const { min, max } = range;
        const diff = max - min;
        if (diff === 0) return;

        // Calculate nice steps
        const pixelsPerLabel = 50;
        const maxLabels = Math.floor(options.height / pixelsPerLabel);

        // Determine step size (rough)
        const rawStep = diff / maxLabels;
        // Round to nice number (1, 2, 5, 10...)
        const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
        let step = Math.ceil(rawStep / mag) * mag;

        // Adjust step to be 1, 2, 5, or 10 * mag
        if (rawStep / mag > 5) step = 10 * mag;
        else if (rawStep / mag > 2) step = 5 * mag;
        else if (rawStep / mag > 1) step = 2 * mag;
        else step = mag;

        this.ctx.fillStyle = options.textColor;
        this.ctx.font = '11px sans-serif';
        this.ctx.textAlign = 'right';
        this.ctx.textBaseline = 'middle';
        this.ctx.strokeStyle = options.gridColor;
        this.ctx.lineWidth = 1;

        // Start from first nice number above min
        const startPrice = Math.ceil(min / step) * step;

        for (let p = startPrice; p <= max; p += step) {
            const y = coord.priceToY(p);

            // Draw Grid Line
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(options.width, y);
            this.ctx.stroke();

            // Draw Label (right side usually)
            // But if we draw on main canvas, maybe right edge minus padding
            this.ctx.fillText(p.toFixed(options.precision), options.width - 5, y);
        }
    }
}
