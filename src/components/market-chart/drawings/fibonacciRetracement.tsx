import React from 'react';
import { FibonacciRetracementDrawing } from '../types';
import { HANDLE_RADIUS, HITBOX_WIDTH } from '../constants';

// Lavender palette (per spec §2)
export const FIB_LAVENDER_PALETTE: Record<number, string> = {
    [-0.618]: '#F0ABFC',
    [-0.272]: '#F0ABFC',
    0:       '#6366F1',
    0.236:   '#A78BFA',
    0.382:   '#8B5CF6',
    0.5:     '#8B5CF6',
    0.618:   '#C4B5F0',
    0.705:   '#8B5CF6',
    0.786:   '#A78BFA',
    1:       '#6366F1',
    1.272:   '#D8B4FE',
    1.618:   '#D8B4FE',
    2.618:   '#D8B4FE',
};

export interface DrawingRenderContext {
    timeToX: (time: number) => number;
    yScale: (price: number) => number;
    isSelected: boolean;
    chartDimensions: { width: number; height: number };
    renderHandle: (cx: number, cy: number, cursor?: string) => React.ReactElement;
    formatPrice: (price: number) => string;
    hoveredLevel: number | null;
    style: {
        color: string;
        width: number;
        lineStyle?: string;
    };
}

export interface DrawingHitContext {
    timeToX: (time: number) => number;
    yScale: (price: number) => number;
    selectedDrawingId: string | null;
}

export type FibHandle = 'start' | 'end' | 'c3' | 'c4' | 'mid';

export function isFibHandle(h: string | undefined): h is FibHandle {
    return h === 'start' || h === 'end' || h === 'c3' || h === 'c4' || h === 'mid';
}

// Level price in linear or log space
export function priceAtFibLevel(
    startPrice: number,
    endPrice: number,
    level: number,
    useLogScale: boolean
): number {
    if (useLogScale && startPrice > 0 && endPrice > 0) {
        const ls = Math.log(startPrice);
        const le = Math.log(endPrice);
        return Math.exp(ls + (le - ls) * level);
    }
    return startPrice + (endPrice - startPrice) * level;
}

export function renderFibonacci(
    d: FibonacciRetracementDrawing,
    ctx: DrawingRenderContext,
    key: string
): React.ReactElement | null {
    if (!d.start || !d.end) return null;
    // Stub — real implementation in Task 3
    const x1 = Math.round(ctx.timeToX(d.start.time));
    const y1 = Math.round(ctx.yScale(d.start.price));
    const x2 = Math.round(ctx.timeToX(d.end.time));
    const y2 = Math.round(ctx.yScale(d.end.price));
    return (
        <g key={key}>
            <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="#A78BFA"
                strokeWidth={1}
                strokeDasharray="4 4"
            />
        </g>
    );
}

export function hitTestFibonacci(
    d: FibonacciRetracementDrawing,
    _p: { x: number; y: number },
    _ctx: DrawingHitContext
): { drawing: FibonacciRetracementDrawing; handle?: FibHandle } | null {
    if (!d.start || !d.end) return null;
    // Stub — real implementation in Task 4
    return null;
}

export function applyFibonacciResize(
    d: FibonacciRetracementDrawing,
    _handle: FibHandle,
    _snappedPoint: { time: number; price: number },
    _initial: FibonacciRetracementDrawing
): FibonacciRetracementDrawing {
    // Stub — real implementation in Task 5
    return d;
}
