import { CoordinateSystem } from '../Core/CoordinateSystem';

export interface HistogramStyle {
    upColor: string;
    downColor: string;
    barWidthPercentage: number; // 0 to 1, relative to candle width
    baseValue: number; // usually 0
}

export class HistogramRenderer {
    constructor(private ctx: CanvasRenderingContext2D) { }

    public draw(
        data: (number | null)[],
        view: { startIndex: number; visibleCandles: number },
        coord: CoordinateSystem,
        style: Partial<HistogramStyle> = {}
    ) {
        if (!data || data.length === 0) return;

        const {
            upColor = '#26a69a',
            downColor = '#ef5350',
            barWidthPercentage = 0.8,
            baseValue = 0
        } = style;

        const candleWidth = coord.getCandleWidth();
        const barWidth = candleWidth * barWidthPercentage;

        // Zero/Base Y
        const zeroY = coord.priceToY(baseValue);

        // Optimize loop range
        const start = Math.floor(view.startIndex);
        const end = Math.ceil(view.startIndex + view.visibleCandles);

        for (let i = start; i <= end; i++) {
            if (i < 0 || i >= data.length) continue;

            const val = data[i];
            // Skip nulls
            if (val === null || val === undefined || isNaN(val)) continue;

            const x = coord.indexToX(i);
            const y = coord.priceToY(val);

            // Calculate height. If val > base, y is smaller (higher on screen) than zeroY.
            // Rect height must be positive, so we use abs.
            // Top Y is min(y, zeroY).

            const top = Math.min(y, zeroY);
            const height = Math.abs(y - zeroY);

            // Use upColor if value >= baseValue (usually 0)
            this.ctx.fillStyle = val >= baseValue ? upColor : downColor;

            // Center bar: x is center of candle.
            this.ctx.fillRect(x - barWidth / 2, top, barWidth, height);
        }
    }
}
