import { CoordinateSystem } from '../Core/CoordinateSystem';
import { Candle, ChartSettings } from '../types';

export class CandleRenderer {
    constructor(private mainCtx: CanvasRenderingContext2D) { }

    public draw(
        candles: Candle[],
        view: { startIndex: number; visibleCandles: number },
        coord: CoordinateSystem,
        settings: ChartSettings['symbol']
    ) {
        if (!candles || candles.length === 0) return;

        const candleWidth = coord.getCandleWidth();
        const halfWidth = candleWidth / 2;
        const wickWidth = Math.max(1, candleWidth * 0.1);
        const candleBodyWidth = candleWidth * 0.8; // 80% width

        this.mainCtx.lineWidth = 1;

        for (let i = view.startIndex; i < view.startIndex + view.visibleCandles; i++) {
            if (i >= candles.length) break;
            const candle = candles[i];
            const x = coord.indexToX(i);
            const openY = coord.priceToY(candle.open);
            const closeY = coord.priceToY(candle.close);
            const highY = coord.priceToY(candle.high);
            const lowY = coord.priceToY(candle.low);

            const isUp = candle.close >= candle.open;
            const color = isUp ? settings.bodyUpColor : settings.bodyDownColor;
            const wickColor = isUp ? settings.wickUpColor : settings.wickDownColor;
            const borderColor = isUp ? settings.borderUpColor : settings.borderDownColor;

            // Draw wick
            if (settings.showWick) {
                this.mainCtx.beginPath();
                this.mainCtx.strokeStyle = wickColor;
                this.mainCtx.moveTo(x, highY);
                this.mainCtx.lineTo(x, lowY);
                this.mainCtx.stroke();
            }

            // Draw body
            if (settings.showBody) {
                this.mainCtx.fillStyle = color;
                this.mainCtx.strokeStyle = settings.showBorders ? borderColor : color;

                const bodyTop = Math.min(openY, closeY);
                const bodyHeight = Math.abs(closeY - openY);
                const drawHeight = Math.max(1, bodyHeight); // Ensure at least 1px height

                this.mainCtx.fillRect(x - candleBodyWidth / 2, bodyTop, candleBodyWidth, drawHeight);
                if (settings.showBorders) {
                    this.mainCtx.strokeRect(x - candleBodyWidth / 2, bodyTop, candleBodyWidth, drawHeight);
                }
            }
        }
    }
}
