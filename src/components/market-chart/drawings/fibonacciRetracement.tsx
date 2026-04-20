import React from 'react';
import { FibonacciRetracementDrawing, LineStyle } from '../types';
import { HANDLE_RADIUS, HITBOX_WIDTH } from '../constants';

// Lavender palette (per spec §2). Keys are level.toFixed(3) strings to
// avoid float-key coercion issues (e.g. 0.1 + 0.2 ≠ 0.3).
export const FIB_LAVENDER_PALETTE: Record<string, string> = {
    '-0.618': '#F0ABFC',
    '-0.272': '#F0ABFC',
    '0.000':  '#6366F1',
    '0.236':  '#A78BFA',
    '0.382':  '#8B5CF6',
    '0.500':  '#8B5CF6',
    '0.618':  '#C4B5F0',
    '0.705':  '#8B5CF6',
    '0.786':  '#A78BFA',
    '1.000':  '#6366F1',
    '1.272':  '#D8B4FE',
    '1.618':  '#D8B4FE',
    '2.618':  '#D8B4FE',
};

/**
 * Safe lookup against FIB_LAVENDER_PALETTE that handles floating-point
 * level values by formatting to 3 decimal places before key lookup.
 * Returns the fallback color when the level isn't in the palette.
 */
export function getFibLevelColor(level: number, fallback: string = '#A78BFA'): string {
    return FIB_LAVENDER_PALETTE[level.toFixed(3)] ?? fallback;
}

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
        lineStyle?: LineStyle;
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

function distSq(a: { x: number; y: number }, b: { x: number; y: number }): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
}

function distToSegmentSquared(
    p: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number }
): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return distSq(p, a);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return distSq(p, { x: a.x + t * dx, y: a.y + t * dy });
}

export function renderFibonacci(
    d: FibonacciRetracementDrawing,
    ctx: DrawingRenderContext,
    key: string
): React.ReactElement | null {
    if (!d.start || !d.end) return null;

    const { timeToX, yScale, isSelected, chartDimensions, renderHandle, formatPrice, hoveredLevel } = ctx;

    const x1 = Math.round(timeToX(d.start.time));
    const y1 = Math.round(yScale(d.start.price));
    const x2 = Math.round(timeToX(d.end.time));
    const y2 = Math.round(yScale(d.end.price));

    const settings = d.style.fibSettings;
    if (!settings) return null;

    const startPrice = d.start.price;
    const endPrice = d.end.price;

    const xMin = Math.min(x1, x2);
    const xMax = Math.max(x1, x2);

    // extendLines tri-state
    const lineX1 =
        settings.extendLines === 'both' ? 0 : xMin;
    const lineX2 =
        settings.extendLines === 'none' ? xMax : chartDimensions.width;

    // Label x-positions clamped to canvas bounds so labels don't clip off-screen
    const LABEL_PAD = 4;
    const leftLabelX = Math.max(LABEL_PAD, xMin - LABEL_PAD);
    const rightLabelX = Math.min(chartDimensions.width - LABEL_PAD, xMax + LABEL_PAD);

    const rawTransparency = Number.isFinite(settings.backgroundTransparency)
        ? settings.backgroundTransparency
        : 0;
    const bgOpacity = 1 - Math.max(0, Math.min(1, rawTransparency));

    const allLevels = [...settings.levels]
        .filter((l) => l.visible)
        .sort((a, b) => a.level - b.level);
    const coreLevels = allLevels.filter((l) => l.level >= 0 && l.level <= 1);

    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    const useLog = settings.useLogScale;
    const computeY = (level: number) => {
        const price = priceAtFibLevel(startPrice, endPrice, level, useLog);
        return Math.round(yScale(price));
    };

    const nwse =
        (x1 < x2 && y1 < y2) || (x1 > x2 && y1 > y2) ? 'nwse-resize' : 'nesw-resize';
    const nesw = nwse === 'nwse-resize' ? 'nesw-resize' : 'nwse-resize';

    return (
        <g
            key={key}
            filter={isSelected ? 'url(#selectionGlow)' : 'none'}
            pointerEvents="auto"
        >
            {/* Background fills between consecutive core levels */}
            {settings.showBackground &&
                coreLevels.slice(0, -1).map((l, i) => {
                    const next = coreLevels[i + 1];
                    const ya = computeY(l.level);
                    const yb = computeY(next.level);
                    const fy = Math.min(ya, yb);
                    const fh = Math.abs(ya - yb);
                    return (
                        <rect
                            key={`fill-${i}`}
                            x={lineX1}
                            y={fy}
                            width={lineX2 - lineX1}
                            height={fh}
                            fill={l.color}
                            fillOpacity={bgOpacity * 0.5}
                        />
                    );
                })}

            {/* Trend line */}
            {settings.trendLine.visible && (
                <line
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={settings.trendLine.color}
                    strokeWidth={settings.trendLine.width}
                    strokeDasharray={
                        settings.trendLine.style === 'dashed'
                            ? '4 4'
                            : settings.trendLine.style === 'dotted'
                              ? '1 4'
                              : undefined
                    }
                />
            )}

            {/* Level lines + dual labels */}
            {allLevels.map((l, i) => {
                const price = priceAtFibLevel(startPrice, endPrice, l.level, useLog);
                const ly = Math.round(yScale(price));
                const isExt = l.level < 0 || l.level > 1;
                const isHovered = hoveredLevel !== null && Math.abs(hoveredLevel - l.level) < 1e-9;
                const baseWidth = 1;
                const strokeWidth = isHovered ? baseWidth * 1.2 : baseWidth;
                const lineOpacity = isHovered ? 1 : isExt ? 0.7 : 0.9;

                // Label direction-aware via `reverse` toggle
                const labelLevel = settings.reverse ? 1 - l.level : l.level;
                const ratioText = labelLevel.toFixed(3);

                return (
                    <g key={`lv-${i}`}>
                        <line
                            x1={lineX1} y1={ly} x2={lineX2} y2={ly}
                            stroke={l.color}
                            strokeWidth={strokeWidth}
                            strokeOpacity={lineOpacity}
                            strokeDasharray={isExt ? '3 3' : undefined}
                        />
                        {/* Left label: ratio (clamped) */}
                        <text
                            x={leftLabelX} y={ly - 3}
                            fill={l.color}
                            fillOpacity={lineOpacity}
                            fontSize="10"
                            textAnchor="end"
                            className="pointer-events-none select-none"
                        >
                            {ratioText}
                        </text>
                        {/* Right label: price (clamped) */}
                        <text
                            x={rightLabelX} y={ly - 3}
                            fill={l.color}
                            fillOpacity={lineOpacity}
                            fontSize="10"
                            textAnchor="start"
                            className="pointer-events-none select-none"
                        >
                            {formatPrice(price)}
                        </text>
                    </g>
                );
            })}

            {/* Handles when selected */}
            {isSelected && (
                <>
                    <g key="fh-start">{renderHandle(x1, y1, nwse)}</g>
                    <g key="fh-end">{renderHandle(x2, y2, nwse)}</g>
                    <g key="fh-c3">{renderHandle(x1, y2, nesw)}</g>
                    <g key="fh-c4">{renderHandle(x2, y1, nesw)}</g>
                    <g key="fh-mid">{renderHandle(midX, midY, 'move')}</g>
                </>
            )}
        </g>
    );
}

export function hitTestFibonacci(
    d: FibonacciRetracementDrawing,
    p: { x: number; y: number },
    ctx: DrawingHitContext
): { drawing: FibonacciRetracementDrawing; handle?: FibHandle } | null {
    if (!d.start || !d.end) return null;
    const { timeToX, yScale, selectedDrawingId } = ctx;

    const startPt = { x: timeToX(d.start.time), y: yScale(d.start.price) };
    const endPt = { x: timeToX(d.end.time), y: yScale(d.end.price) };
    const c3 = { x: startPt.x, y: endPt.y };
    const c4 = { x: endPt.x, y: startPt.y };

    const isActive = selectedDrawingId === d.id;
    const hRadiusSq = (HANDLE_RADIUS + 6) ** 2;

    // Corner handles (always tested, like Rectangle/Gann Box)
    if (distSq(p, startPt) < hRadiusSq) return { drawing: d, handle: 'start' };
    if (distSq(p, endPt) < hRadiusSq) return { drawing: d, handle: 'end' };
    if (distSq(p, c3) < hRadiusSq) return { drawing: d, handle: 'c3' };
    if (distSq(p, c4) < hRadiusSq) return { drawing: d, handle: 'c4' };

    // Midpoint handle — only when active (selected), matches render behavior
    if (isActive) {
        const mid = { x: (startPt.x + endPt.x) / 2, y: (startPt.y + endPt.y) / 2 };
        if (distSq(p, mid) < HANDLE_RADIUS ** 2) return { drawing: d, handle: 'mid' };
    }

    // Trend line segment (body-click selects the drawing without a handle)
    if (distToSegmentSquared(p, startPt, endPt) < HITBOX_WIDTH ** 2) {
        return { drawing: d };
    }

    // Visible level lines within x-range (respects extendLines tri-state)
    const settings = d.style.fibSettings;
    if (settings) {
        const xMin = Math.min(startPt.x, endPt.x);
        const xMax = Math.max(startPt.x, endPt.x);
        const testXMin = settings.extendLines === 'both' ? -Infinity : xMin;
        const testXMax = settings.extendLines === 'none' ? xMax : Infinity;

        for (const l of settings.levels) {
            if (!l.visible) continue;
            const price = priceAtFibLevel(
                d.start.price,
                d.end.price,
                l.level,
                settings.useLogScale
            );
            const ly = yScale(price);
            if (Math.abs(p.y - ly) < HITBOX_WIDTH && p.x >= testXMin && p.x <= testXMax) {
                return { drawing: d };
            }
        }
    }

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
