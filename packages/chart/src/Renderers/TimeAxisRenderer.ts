import { ViewState, Candle } from '../types';
import { CoordinateSystem } from '../Core/CoordinateSystem';

export class TimeAxisRenderer {
    constructor(private ctx: CanvasRenderingContext2D) {}

    public draw(
        view: ViewState,
        data: Candle[],
        coord: CoordinateSystem,
        options: {
            height: number;
            width: number;
            textColor: string;
            gridColor: string;
            timeFormat?: string;
        }
    ) {
        const { startIndex, visibleCandles } = view;
        const candleWidth = coord.getCandleWidth();

        // Dynamic interval calculation to avoid clutter
        // Aim for ~100px per label
        const pixelsPerLabel = 100;
        const totalWidth = options.width;
        const maxLabels = Math.ceil(totalWidth / pixelsPerLabel);
        const skip = Math.ceil(visibleCandles / maxLabels);

        this.ctx.fillStyle = options.textColor;
        this.ctx.font = '11px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.strokeStyle = options.gridColor; // Grid line color
        this.ctx.lineWidth = 1;

        // Iterate through visible candles
        for (let i = 0; i < visibleCandles; i += skip) {
            const dataIndex = startIndex + i;
            if (dataIndex < 0 || dataIndex >= data.length) continue;

            const candle = data[dataIndex];
            const x = coord.indexToX(dataIndex);

            // Draw Grid Line
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, options.height);
            this.ctx.stroke();

            // Draw Label
            const date = new Date(candle.time * 1000);
            const label = this.formatDate(date, options.timeFormat || 'HH:mm');
            this.ctx.fillText(label, x, options.height - 5);
        }
    }

    private formatDate(date: Date, format: string): string {
        // Simple formatter suitable for now. Kuri might have logic.
        // For intraday: HH:mm. For daily: MM-DD.
        // Let's autoswitch based on format or just use small logic.
        const d = date.getDate().toString().padStart(2, '0');
        const m = (date.getMonth() + 1).toString().padStart(2, '0');
        const h = date.getHours().toString().padStart(2, '0');
        const min = date.getMinutes().toString().padStart(2, '0');

        // If minutes are 00 and hours 00, maybe show date?
        return `${h}:${min}`;
    }
}
