import { CoordinateSystem } from '../Core/CoordinateSystem';

export class LineRenderer {
    constructor(private mainCtx: CanvasRenderingContext2D) {}

    public draw(
        data: (number | null)[],
        view: { startIndex: number; visibleCandles: number },
        coord: CoordinateSystem,
        color: string = '#2962FF',
        lineWidth: number = 2,
        lineStyle: 'solid' | 'dashed' | 'dotted' = 'solid'
    ) {
        if (!data || data.length === 0) return;

        this.mainCtx.beginPath();
        this.mainCtx.strokeStyle = color;
        this.mainCtx.lineWidth = lineWidth;

        if (lineStyle === 'dashed') {
            this.mainCtx.setLineDash([5, 5]);
        } else if (lineStyle === 'dotted') {
            this.mainCtx.setLineDash([2, 2]);
        } else {
            this.mainCtx.setLineDash([]);
        }

        let isPathStarted = false;

        for (let i = view.startIndex - 1; i < view.startIndex + view.visibleCandles + 1; i++) {
            if (i < 0 || i >= data.length) continue;

            const value = data[i];

            if (value === null || value === undefined || isNaN(value)) {
                isPathStarted = false; // Break path on nulls
                continue;
            }

            const x = coord.indexToX(i);
            const y = coord.priceToY(value);

            if (!isPathStarted) {
                this.mainCtx.moveTo(x, y);
                isPathStarted = true;
            } else {
                this.mainCtx.lineTo(x, y);
            }
        }

        this.mainCtx.stroke();
        this.mainCtx.setLineDash([]);
    }
}
