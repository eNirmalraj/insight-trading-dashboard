import { Candle } from '../types';

export class CoordinateSystem {
    constructor(
        private width: number,
        private height: number,
        private view: { startIndex: number; visibleCandles: number },
        private priceRange: { min: number; max: number },
        private padding: { top: number; bottom: number } = { top: 20, bottom: 20 }
    ) {}

    public indexToX(index: number): number {
        const candleWidth = this.width / this.view.visibleCandles;
        return (index - this.view.startIndex) * candleWidth + candleWidth / 2;
    }

    public timeToX(time: number, data: Candle[]): number {
        // Binary search for the index of the candle with the given time
        let low = 0;
        let high = data.length - 1;
        let index = -1;

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            if (data[mid].time === time) {
                index = mid;
                break;
            } else if (data[mid].time < time) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        // If exact match not found, estimate or use the closest index
        // For drawing rendering, we often want exact or interpolated.
        // If it's a future time (beyond data), we need to extrapolate.

        if (index === -1) {
            // Handle future times or missing data points by linear extrapolation
            if (data.length < 2) return this.indexToX(0); // Fallback

            const firstTime = data[0].time;
            const lastTime = data[data.length - 1].time;
            const interval = data[1].time - data[0].time; // Estimate interval

            if (time > lastTime) {
                const diff = (time - lastTime) / interval;
                index = data.length - 1 + diff;
            } else if (time < firstTime) {
                const diff = (firstTime - time) / interval;
                index = -diff;
            } else {
                // Interpolate between low and high (which are now neighbors)
                // This handles gaps in data if we want strict time-based positioning
                // But for a candle chart, we usually map time to INDEX.
                // If time doesn't exist, it should map to where it WOULD be.
                // Simple approach: map to nearest index?
                // Let's stick to the binary search result 'low' as insertion point.
                index = low;
            }
        }

        return this.indexToX(index);
    }

    public priceToY(price: number): number {
        const range = this.priceRange.max - this.priceRange.min;
        if (range === 0) return this.height / 2;

        const availableHeight = this.height - (this.padding.top + this.padding.bottom);
        const ratio = (price - this.priceRange.min) / range;

        return this.height - this.padding.bottom - ratio * availableHeight;
    }

    public xToIndex(x: number): number {
        const candleWidth = this.width / this.view.visibleCandles;
        return Math.floor(x / candleWidth) + this.view.startIndex;
    }

    public yToPrice(y: number): number {
        const availableHeight = this.height - (this.padding.top + this.padding.bottom);
        const relativeY = this.height - this.padding.bottom - y;
        const ratio = relativeY / availableHeight;
        const range = this.priceRange.max - this.priceRange.min;
        return this.priceRange.min + ratio * range;
    }

    public getCandleWidth(): number {
        return this.width / this.view.visibleCandles;
    }
}
