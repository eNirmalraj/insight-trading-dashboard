import { Drawing } from './types';

export const parseRgba = (color: string): { r: number; g: number; b: number; a: number } => {
    if (color.startsWith('rgba')) {
        const parts = color.substring(color.indexOf('(') + 1, color.lastIndexOf(')')).split(/,\s*/);
        return {
            r: parseInt(parts[0], 10),
            g: parseInt(parts[1], 10),
            b: parseInt(parts[2], 10),
            a: parseFloat(parts[3]),
        };
    }
    if (color.startsWith('#')) {
        let hex = color.slice(1);
        if (hex.length === 3) {
            hex = hex
                .split('')
                .map((char) => char + char)
                .join('');
        }
        if (hex.length === 6) {
            const bigint = parseInt(hex, 16);
            return {
                r: (bigint >> 16) & 255,
                g: (bigint >> 8) & 255,
                b: bigint & 255,
                a: 1,
            };
        }
    }
    return { r: 0, g: 0, b: 0, a: 1 };
};

export function calculateDrawingPriceAtTime(drawing: Drawing, time: number): number | null {
    const d = drawing as any;

    if (d.type === 'horizontal_line') {
        return d.price;
    }
    if (d.type === 'horizontal_ray') {
        return time >= d.startTime ? d.price : null;
    }
    if (d.type === 'trend_line' || d.type === 'ray') {
        const { startTime, startPrice, endTime, endPrice } = d;
        if (endTime === startTime) return null;

        const slope = (endPrice - startPrice) / (endTime - startTime);
        const price = startPrice + slope * (time - startTime);

        if (d.type === 'trend_line') {
            const [tMin, tMax] = startTime < endTime ? [startTime, endTime] : [endTime, startTime];
            return time >= tMin && time <= tMax ? price : null;
        }
        if (endTime > startTime) {
            return time >= startTime ? price : null;
        } else {
            return time <= startTime ? price : null;
        }
    }
    return null;
}
