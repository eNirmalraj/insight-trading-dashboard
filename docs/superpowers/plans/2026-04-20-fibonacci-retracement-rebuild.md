# Fibonacci Retracement Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the current Fibonacci Retracement drawing tool entirely and rebuild it from scratch as a dedicated module at `src/components/market-chart/drawings/fibonacciRetracement.tsx` with a lavender visual theme and an expanded TradingView-style feature set (snap-to-swing, log scale, tri-state extendLines, reverse, hover feedback, 5-handle drag).

**Architecture:** All Fibonacci-specific render, hit-test, and resize logic moves out of `CandlestickChart.tsx` into a single new module exporting three pure functions (`renderFibonacci`, `hitTestFibonacci`, `applyFibonacciResize`). `CandlestickChart.tsx` invokes them from the existing render/hit-test/resize dispatch points.

**Tech Stack:** React + TypeScript + SVG rendering inside `CandlestickChart.tsx`, Vite (`pnpm dev` / `pnpm build`).

**Spec:** `docs/superpowers/specs/2026-04-20-fibonacci-retracement-rebuild-design.md`

---

## File Map

| File | Change |
|------|--------|
| `src/components/market-chart/drawings/fibonacciRetracement.tsx` | **Create** — owns all Fib render + hit-test + resize + snap/log helpers |
| `src/components/market-chart/types.ts` | **Modify** — extend `FibSettings` with `extendLines: 'both' \| 'right' \| 'none'`, `snapToSwing: boolean`, `reverse: boolean` |
| `src/components/market-chart/CandlestickChart.tsx` | **Modify** — delete inline Fib blocks; call new module; add `hoveredLevel` state and snap-to-swing hook |
| `src/components/market-chart/DrawingSettingsModal.tsx` | **Modify** — replace `DefaultFibSettings` and the Fibonacci settings section |

---

## Task 1: Scaffold the new Fibonacci module

**Files:**
- Create: `src/components/market-chart/drawings/fibonacciRetracement.tsx`
- Modify: `src/components/market-chart/types.ts`

This task produces a compiling stub module and extends the `FibSettings` type. The tool is NOT wired in yet — this task only creates the shape.

- [ ] **Step 1: Extend `FibSettings` in `types.ts`**

Find the existing `FibSettings` interface at `src/components/market-chart/types.ts:54-66`. Replace it with:

```typescript
export type FibExtendMode = 'both' | 'right' | 'none';

export interface FibSettings {
    trendLine: {
        visible: boolean;
        color: string;
        width: number;
        style: LineStyle;
    };
    levels: FibLevel[];
    extendLines: FibExtendMode;
    showBackground: boolean;
    backgroundTransparency: number;
    useLogScale: boolean;
    snapToSwing: boolean;
    reverse: boolean;
}
```

- [ ] **Step 2: Create the new module**

Create `src/components/market-chart/drawings/fibonacciRetracement.tsx` with the full skeleton:

```tsx
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
```

- [ ] **Step 3: Verify TypeScript compiles**

Run:
```bash
cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm build 2>&1 | grep -E "error TS|error:" | head -10
```

Expected: no TypeScript errors. If `FibonacciRetracementDrawing` isn't exported from types, use this command to find its export name:
```bash
grep -n "FibonacciRetracement" src/components/market-chart/types.ts
```

And update the import accordingly.

- [ ] **Step 4: Commit**

```bash
git add src/components/market-chart/drawings/fibonacciRetracement.tsx src/components/market-chart/types.ts
git commit -m "feat(fib): scaffold new fibonacci module + extend FibSettings type"
```

---

## Task 2: Wire CandlestickChart to the new module + delete old Fibonacci code

**Files:**
- Modify: `src/components/market-chart/CandlestickChart.tsx`

After this task the tool renders via the new module (only the trend line, matching the stub). All old inline Fibonacci render/hit-test/resize code is gone. The DrawingSettingsModal still uses the old boolean `extendLines` — we handle that in Task 6.

- [ ] **Step 1: Add imports at the top of `CandlestickChart.tsx`**

Find the imports section (near top of file). Add:

```typescript
import {
    renderFibonacci,
    hitTestFibonacci,
    applyFibonacciResize,
    isFibHandle,
    type DrawingRenderContext,
    type DrawingHitContext,
} from './drawings/fibonacciRetracement';
```

- [ ] **Step 2: Add `hoveredLevel` state**

Inside the `CandlestickChart` component function, near the other `useState` declarations, add:

```typescript
const [hoveredLevel, setHoveredLevel] = React.useState<number | null>(null);
```

- [ ] **Step 3: Replace the inline Fibonacci render block**

Find `case 'Fibonacci Retracement': {` (around line 5993). Delete the entire block up to and including its closing `}` immediately before `case 'Gann Box':`. Replace with:

```tsx
case 'Fibonacci Retracement': {
    const renderCtx: DrawingRenderContext = {
        timeToX,
        yScale,
        isSelected,
        chartDimensions,
        renderHandle,
        formatPrice,
        hoveredLevel,
        style,
    };
    return renderFibonacci(d, renderCtx, key);
}
```

- [ ] **Step 4: Replace the inline Fibonacci hit-detection block**

Find the block starting `} else if (d.type === 'Fibonacci Retracement') {` in the hit-test loop (search: `d.type === 'Fibonacci Retracement'` inside the hit-test function). Delete the entire `else if` block and replace with:

```typescript
} else if (d.type === 'Fibonacci Retracement') {
    const hitCtx: DrawingHitContext = { timeToX, yScale, selectedDrawingId };
    const hit = hitTestFibonacci(d, p, hitCtx);
    if (hit) return hit;
    continue;
```

- [ ] **Step 5: Replace the inline Fibonacci resize case**

Find the block `} else if (h === 'mid' && resized.type === 'Fibonacci Retracement') {` (around line 5248). Delete the entire block (which currently handles only `'mid'`) up to but not including the next `} else if`. Replace with:

```typescript
} else if (resized.type === 'Fibonacci Retracement' && isFibHandle(h)) {
    resized = applyFibonacciResize(
        resized,
        h,
        snappedPoint,
        interaction.initialDrawing as typeof resized
    );
}
```

Important: this single branch now handles ALL Fib handles (`start`, `end`, `c3`, `c4`, `mid`), intercepting BEFORE the generic `h === 'start' || h === 'end'` branch. Place it above that branch in the chain.

- [ ] **Step 6: Verify the app still renders the trend line**

```bash
pnpm dev
```

Draw a Fibonacci. It should show just the dashed trend line (stub). No levels, no labels yet. The tool shouldn't crash. This is expected — full rendering comes in Task 3.

- [ ] **Step 7: Commit**

```bash
git add src/components/market-chart/CandlestickChart.tsx
git commit -m "feat(fib): wire candlestick chart to new fibonacci module; delete old inline code"
```

---

## Task 3: Implement `renderFibonacci`

**Files:**
- Modify: `src/components/market-chart/drawings/fibonacciRetracement.tsx`

Full visual implementation per spec §2: lavender palette, background fills in 0–1 range, dashed extensions, dual-side labels, 5 handles, direction-aware, pixel-aligned.

- [ ] **Step 1: Replace the stub `renderFibonacci` with the full implementation**

Replace the entire `renderFibonacci` function body with:

```tsx
export function renderFibonacci(
    d: FibonacciRetracementDrawing,
    ctx: DrawingRenderContext,
    key: string
): React.ReactElement | null {
    if (!d.start || !d.end) return null;

    const { timeToX, yScale, isSelected, chartDimensions, renderHandle, formatPrice, hoveredLevel, style } = ctx;

    const x1 = Math.round(timeToX(d.start.time));
    const y1 = Math.round(yScale(d.start.price));
    const x2 = Math.round(timeToX(d.end.time));
    const y2 = Math.round(yScale(d.end.price));

    const settings = d.style.fibSettings;
    if (!settings) return null;

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

    const bgOpacity = 1 - Math.max(0, Math.min(1, settings.backgroundTransparency));

    const allLevels = [...settings.levels]
        .filter((l) => l.visible)
        .sort((a, b) => a.level - b.level);
    const coreLevels = allLevels.filter((l) => l.level >= 0 && l.level <= 1);

    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    // Direction-aware: if drawn top→bottom, ratio 0 is at top; else at bottom.
    // reverse flips the label mapping without moving geometry.
    const useLog = settings.useLogScale;
    const computeY = (level: number) => {
        const price = priceAtFibLevel(d.start!.price, d.end!.price, level, useLog);
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
                const price = priceAtFibLevel(d.start!.price, d.end!.price, l.level, useLog);
                const ly = Math.round(yScale(price));
                const isExt = l.level < 0 || l.level > 1;
                const isHovered = hoveredLevel === l.level;
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
```

- [ ] **Step 2: Visual verification**

```bash
pnpm dev
```

Draw a Fibonacci Retracement. Verify:
- All 8 core levels render in lavender shades
- Background fills between core levels are faint
- Extension levels render dashed (but you need Task 6 defaults to see them properly; for now use whatever the old defaults produce)
- Left labels show ratios, right labels show prices
- When selected, 5 handles appear

If the drawing looks nearly-invisible, that's expected: the old `DefaultFibSettings` still has the OLD colors. Task 6 replaces them.

- [ ] **Step 3: Commit**

```bash
git add src/components/market-chart/drawings/fibonacciRetracement.tsx
git commit -m "feat(fib): implement renderFibonacci with lavender palette + dual labels"
```

---

## Task 4: Implement `hitTestFibonacci`

**Files:**
- Modify: `src/components/market-chart/drawings/fibonacciRetracement.tsx`

- [ ] **Step 1: Add distance helpers at the top of the module**

Below the `FIB_LAVENDER_PALETTE` constant, add:

```typescript
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
```

- [ ] **Step 2: Replace the stub `hitTestFibonacci` with full logic**

Replace the function body with:

```typescript
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

    // Corner handles (always tested, like Rectangle)
    if (distSq(p, startPt) < hRadiusSq) return { drawing: d, handle: 'start' };
    if (distSq(p, endPt) < hRadiusSq) return { drawing: d, handle: 'end' };
    if (distSq(p, c3) < hRadiusSq) return { drawing: d, handle: 'c3' };
    if (distSq(p, c4) < hRadiusSq) return { drawing: d, handle: 'c4' };

    // Midpoint handle — only when active (selected)
    if (isActive) {
        const mid = { x: (startPt.x + endPt.x) / 2, y: (startPt.y + endPt.y) / 2 };
        if (distSq(p, mid) < HANDLE_RADIUS ** 2) return { drawing: d, handle: 'mid' };
    }

    // Trend line segment
    if (distToSegmentSquared(p, startPt, endPt) < HITBOX_WIDTH ** 2) {
        return { drawing: d };
    }

    // Visible level lines within x-range
    const settings = d.style.fibSettings;
    if (settings) {
        const xMin = Math.min(startPt.x, endPt.x);
        const xMax = Math.max(startPt.x, endPt.x);
        // Respect extendLines for hit range
        const testXMin = settings.extendLines === 'both' ? -Infinity : xMin;
        const testXMax = settings.extendLines === 'none' ? xMax : Infinity;

        for (const l of settings.levels) {
            if (!l.visible) continue;
            const price = priceAtFibLevel(d.start.price, d.end.price, l.level, settings.useLogScale);
            const ly = yScale(price);
            if (Math.abs(p.y - ly) < HITBOX_WIDTH && p.x >= testXMin && p.x <= testXMax) {
                return { drawing: d };
            }
        }
    }

    return null;
}
```

- [ ] **Step 3: Visual verification**

```bash
pnpm dev
```

Draw a Fibonacci. Click near a level line or the trend line — the drawing should select (glow). Click far from anything — no selection.

- [ ] **Step 4: Commit**

```bash
git add src/components/market-chart/drawings/fibonacciRetracement.tsx
git commit -m "feat(fib): implement hit-test (corners + mid + trend + level lines)"
```

---

## Task 5: Implement `applyFibonacciResize`

**Files:**
- Modify: `src/components/market-chart/drawings/fibonacciRetracement.tsx`

- [ ] **Step 1: Replace the stub `applyFibonacciResize` with full logic**

Replace the function body with:

```typescript
export function applyFibonacciResize(
    d: FibonacciRetracementDrawing,
    handle: FibHandle,
    snappedPoint: { time: number; price: number },
    initial: FibonacciRetracementDrawing
): FibonacciRetracementDrawing {
    if (!d.start || !d.end || !initial.start || !initial.end) return d;
    const resized = { ...d, start: { ...d.start }, end: { ...d.end } };

    switch (handle) {
        case 'start':
            resized.start = snappedPoint;
            return resized;
        case 'end':
            resized.end = snappedPoint;
            return resized;
        case 'c3':
            // (xStart, y1) → drag updates start.time + end.price
            resized.start = { ...resized.start, time: snappedPoint.time };
            resized.end = { ...resized.end, price: snappedPoint.price };
            return resized;
        case 'c4':
            // (xEnd, y0) → drag updates end.time + start.price
            resized.end = { ...resized.end, time: snappedPoint.time };
            resized.start = { ...resized.start, price: snappedPoint.price };
            return resized;
        case 'mid': {
            const initMidTime = (initial.start.time + initial.end.time) / 2;
            const initMidPrice = (initial.start.price + initial.end.price) / 2;
            const dTime = snappedPoint.time - initMidTime;
            const dPrice = snappedPoint.price - initMidPrice;
            resized.start = {
                time: initial.start.time + dTime,
                price: initial.start.price + dPrice,
            };
            resized.end = {
                time: initial.end.time + dTime,
                price: initial.end.price + dPrice,
            };
            return resized;
        }
    }
}
```

- [ ] **Step 2: Visual verification**

```bash
pnpm dev
```

Draw a Fibonacci, select it, test each handle:
- Corner handles (start/end/c3/c4) resize the drawing
- Middle handle translates the whole drawing, proportions preserved

- [ ] **Step 3: Commit**

```bash
git add src/components/market-chart/drawings/fibonacciRetracement.tsx
git commit -m "feat(fib): implement resize (start, end, c3, c4, mid)"
```

---

## Task 6: Rebuild DrawingSettingsModal Fibonacci section + migrate old settings

**Files:**
- Modify: `src/components/market-chart/DrawingSettingsModal.tsx`

After this task the drawing renders in the new palette by default, and old saved drawings with `extendLines: boolean` continue to work via a normalisation helper.

- [ ] **Step 1: Replace `DefaultFibSettings`**

Find `const DefaultFibSettings` (around line 56). Replace with:

```typescript
const DefaultFibSettings: FibSettings = {
    trendLine: { visible: true, color: '#A78BFA', width: 1, style: 'dashed' },
    levels: [
        { level: -0.618, color: '#F0ABFC', visible: false },
        { level: -0.272, color: '#F0ABFC', visible: false },
        { level: 0,      color: '#6366F1', visible: true  },
        { level: 0.236,  color: '#A78BFA', visible: true  },
        { level: 0.382,  color: '#8B5CF6', visible: true  },
        { level: 0.5,    color: '#8B5CF6', visible: true  },
        { level: 0.618,  color: '#C4B5F0', visible: true  },
        { level: 0.705,  color: '#8B5CF6', visible: true  },
        { level: 0.786,  color: '#A78BFA', visible: true  },
        { level: 1,      color: '#6366F1', visible: true  },
        { level: 1.272,  color: '#D8B4FE', visible: true  },
        { level: 1.618,  color: '#D8B4FE', visible: true  },
        { level: 2.618,  color: '#D8B4FE', visible: true  },
    ],
    extendLines: 'right',
    showBackground: true,
    backgroundTransparency: 0.92,
    useLogScale: false,
    snapToSwing: false,
    reverse: false,
};
```

- [ ] **Step 2: Add a settings-normaliser helper at module scope**

Near the top of `DrawingSettingsModal.tsx` (below imports, above the component), add:

```typescript
/**
 * Normalise persisted FibSettings shapes. Handles migration from older schemas
 * where `extendLines` was a boolean and `snapToSwing` / `reverse` didn't exist.
 */
function normaliseFibSettings(raw: any): FibSettings {
    if (!raw) return DefaultFibSettings;
    const extendLines: FibExtendMode =
        raw.extendLines === true ? 'both'
        : raw.extendLines === false ? 'none'
        : raw.extendLines === 'both' || raw.extendLines === 'right' || raw.extendLines === 'none'
            ? raw.extendLines
            : DefaultFibSettings.extendLines;
    return {
        trendLine: raw.trendLine ?? DefaultFibSettings.trendLine,
        levels: Array.isArray(raw.levels) && raw.levels.length > 0
            ? raw.levels
            : DefaultFibSettings.levels,
        extendLines,
        showBackground: raw.showBackground ?? DefaultFibSettings.showBackground,
        backgroundTransparency: raw.backgroundTransparency ?? DefaultFibSettings.backgroundTransparency,
        useLogScale: raw.useLogScale ?? false,
        snapToSwing: raw.snapToSwing ?? false,
        reverse: raw.reverse ?? false,
    };
}
```

Import `FibExtendMode` at the top of the file (alongside existing `FibSettings` imports).

- [ ] **Step 3: Export the normaliser so CandlestickChart can apply it on load**

Add `export` to the `normaliseFibSettings` function and `export` to `DefaultFibSettings`. The render path in `fibonacciRetracement.tsx` reads `d.style.fibSettings` directly — legacy boolean `extendLines` would make that render incorrectly, so the migration must run when drawings are loaded.

- [ ] **Step 4: Run the normaliser on drawings load in CandlestickChart**

Find where drawings are loaded / hydrated in `CandlestickChart.tsx` (search for `setDrawings(` or wherever drawings are read from persistence). Add a pass-through that normalises any Fibonacci drawing's settings:

```typescript
// Import at top:
import { normaliseFibSettings } from './DrawingSettingsModal';

// When setting drawings (one-time on load), map them:
const hydrated = loadedDrawings.map((d) => {
    if (d.type === 'Fibonacci Retracement' && d.style.fibSettings) {
        return {
            ...d,
            style: {
                ...d.style,
                fibSettings: normaliseFibSettings(d.style.fibSettings),
            },
        };
    }
    return d;
});
setDrawings(hydrated);
```

Adapt to the exact load signature. If drawings are loaded in multiple places, apply the same pattern.

- [ ] **Step 5: Rebuild the Fibonacci settings-modal UI section**

Find the section that renders Fib-specific settings (search for `fibSettings` inside `DrawingSettingsModal.tsx`). Replace it with the expanded controls:

```tsx
{drawing.type === 'Fibonacci Retracement' && drawing.style.fibSettings && (
    <div className="space-y-4">
        {/* Trend line */}
        <fieldset className="rounded border border-neutral-700 p-3">
            <legend className="px-1 text-xs font-medium text-neutral-400">Trend line</legend>
            <label className="flex items-center gap-2 text-sm">
                <input
                    type="checkbox"
                    checked={drawing.style.fibSettings.trendLine.visible}
                    onChange={(e) => updateFib({ trendLine: { ...drawing.style.fibSettings!.trendLine, visible: e.target.checked } })}
                />
                Show trend line
            </label>
            <div className="mt-2 grid grid-cols-3 gap-2">
                <label className="text-xs">
                    Color
                    <input
                        type="color"
                        value={drawing.style.fibSettings.trendLine.color}
                        onChange={(e) => updateFib({ trendLine: { ...drawing.style.fibSettings!.trendLine, color: e.target.value } })}
                        className="mt-1 block h-8 w-full"
                    />
                </label>
                <label className="text-xs">
                    Width
                    <select
                        value={drawing.style.fibSettings.trendLine.width}
                        onChange={(e) => updateFib({ trendLine: { ...drawing.style.fibSettings!.trendLine, width: Number(e.target.value) } })}
                        className="mt-1 block h-8 w-full rounded bg-neutral-800 px-1"
                    >
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                        <option value={3}>3</option>
                    </select>
                </label>
                <label className="text-xs">
                    Style
                    <select
                        value={drawing.style.fibSettings.trendLine.style}
                        onChange={(e) => updateFib({ trendLine: { ...drawing.style.fibSettings!.trendLine, style: e.target.value as any } })}
                        className="mt-1 block h-8 w-full rounded bg-neutral-800 px-1"
                    >
                        <option value="solid">Solid</option>
                        <option value="dashed">Dashed</option>
                        <option value="dotted">Dotted</option>
                    </select>
                </label>
            </div>
        </fieldset>

        {/* Behaviour */}
        <fieldset className="rounded border border-neutral-700 p-3">
            <legend className="px-1 text-xs font-medium text-neutral-400">Behaviour</legend>
            <label className="mb-2 flex items-center justify-between text-sm">
                <span>Extend lines</span>
                <select
                    value={drawing.style.fibSettings.extendLines}
                    onChange={(e) => updateFib({ extendLines: e.target.value as FibExtendMode })}
                    className="h-8 rounded bg-neutral-800 px-2"
                >
                    <option value="none">None</option>
                    <option value="right">Right only</option>
                    <option value="both">Both</option>
                </select>
            </label>
            <label className="mb-2 flex items-center gap-2 text-sm">
                <input
                    type="checkbox"
                    checked={drawing.style.fibSettings.useLogScale}
                    onChange={(e) => updateFib({ useLogScale: e.target.checked })}
                />
                Log scale
            </label>
            <label className="mb-2 flex items-center gap-2 text-sm">
                <input
                    type="checkbox"
                    checked={drawing.style.fibSettings.snapToSwing}
                    onChange={(e) => updateFib({ snapToSwing: e.target.checked })}
                />
                Snap to swing on draw
            </label>
            <label className="flex items-center gap-2 text-sm">
                <input
                    type="checkbox"
                    checked={drawing.style.fibSettings.reverse}
                    onChange={(e) => updateFib({ reverse: e.target.checked })}
                />
                Reverse labels
            </label>
        </fieldset>

        {/* Background */}
        <fieldset className="rounded border border-neutral-700 p-3">
            <legend className="px-1 text-xs font-medium text-neutral-400">Background</legend>
            <label className="mb-2 flex items-center gap-2 text-sm">
                <input
                    type="checkbox"
                    checked={drawing.style.fibSettings.showBackground}
                    onChange={(e) => updateFib({ showBackground: e.target.checked })}
                />
                Show fills
            </label>
            <label className="block text-xs">
                Transparency
                <input
                    type="range"
                    min={0} max={1} step={0.01}
                    value={drawing.style.fibSettings.backgroundTransparency}
                    onChange={(e) => updateFib({ backgroundTransparency: Number(e.target.value) })}
                    className="mt-1 block w-full"
                />
            </label>
        </fieldset>

        {/* Levels */}
        <fieldset className="rounded border border-neutral-700 p-3">
            <legend className="px-1 text-xs font-medium text-neutral-400">Levels</legend>
            <div className="space-y-1">
                {drawing.style.fibSettings.levels.map((lv, idx) => (
                    <div key={lv.level} className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={lv.visible}
                            onChange={(e) => {
                                const next = [...drawing.style.fibSettings!.levels];
                                next[idx] = { ...lv, visible: e.target.checked };
                                updateFib({ levels: next });
                            }}
                        />
                        <span className="w-16 font-mono text-xs">{lv.level.toFixed(3)}</span>
                        <input
                            type="color"
                            value={lv.color}
                            onChange={(e) => {
                                const next = [...drawing.style.fibSettings!.levels];
                                next[idx] = { ...lv, color: e.target.value };
                                updateFib({ levels: next });
                            }}
                            className="h-6 w-10"
                        />
                    </div>
                ))}
            </div>
        </fieldset>
    </div>
)}
```

Where `updateFib(patch)` is a helper inside the modal component that merges the patch into `drawing.style.fibSettings`. If no such helper exists yet, add it near the top of the component body:

```typescript
const updateFib = (patch: Partial<FibSettings>) => {
    if (!drawing || drawing.type !== 'Fibonacci Retracement') return;
    const current = drawing.style.fibSettings ?? DefaultFibSettings;
    onUpdate({
        ...drawing,
        style: {
            ...drawing.style,
            fibSettings: { ...current, ...patch },
        },
    });
};
```

(`onUpdate` is the existing prop used by the modal to propagate drawing changes. If the prop name differs in your file, use the actual name.)

- [ ] **Step 6: Visual verification**

```bash
pnpm dev
```

- Draw a new Fibonacci → it renders in lavender by default
- Open its settings modal → all new controls (extendLines dropdown, log scale, snap, reverse, per-level color/visibility) appear
- Toggle `reverse` → left-side labels flip 0↔1

- [ ] **Step 7: Commit**

```bash
git add src/components/market-chart/DrawingSettingsModal.tsx src/components/market-chart/CandlestickChart.tsx
git commit -m "feat(fib): rebuild settings modal section + migrate legacy extendLines"
```

---

## Task 7: Hover state + feedback

**Files:**
- Modify: `src/components/market-chart/CandlestickChart.tsx`

- [ ] **Step 1: Update mousemove to compute `hoveredLevel`**

Find the existing chart-canvas `onMouseMove` handler (where `setHoveredPoint` or similar is called). Add a block that sets `hoveredLevel`:

```typescript
// Determine which visible Fib level (if any) is under the cursor
let hovered: number | null = null;
for (const d of drawings) {
    if (d.type !== 'Fibonacci Retracement' || !d.start || !d.end) continue;
    const settings = d.style.fibSettings;
    if (!settings) continue;
    const xS = timeToX(d.start.time);
    const xE = timeToX(d.end.time);
    const xMin = Math.min(xS, xE);
    const xMax = Math.max(xS, xE);
    const extendTo =
        settings.extendLines === 'both' ? -Infinity
        : settings.extendLines === 'none' ? xMax
        : Infinity;
    const extendFrom = settings.extendLines === 'both' ? -Infinity : xMin;
    if (p.x < extendFrom || p.x > extendTo) continue;
    for (const l of settings.levels) {
        if (!l.visible) continue;
        const price =
            settings.useLogScale && d.start.price > 0 && d.end.price > 0
                ? Math.exp(Math.log(d.start.price) + (Math.log(d.end.price) - Math.log(d.start.price)) * l.level)
                : d.start.price + (d.end.price - d.start.price) * l.level;
        const ly = yScale(price);
        if (Math.abs(p.y - ly) < HITBOX_WIDTH) {
            hovered = l.level;
            break;
        }
    }
    if (hovered !== null) break;
}
if (hovered !== hoveredLevel) setHoveredLevel(hovered);
```

Where `p` is the computed mouse position `{ x, y }` already in scope. `HITBOX_WIDTH` is the existing constant.

- [ ] **Step 2: Visual verification**

```bash
pnpm dev
```

Hover over a Fibonacci level line — the line should brighten (1.2× stroke width, full opacity) while the cursor is near it. Move away — it dims back.

- [ ] **Step 3: Commit**

```bash
git add src/components/market-chart/CandlestickChart.tsx
git commit -m "feat(fib): hover state — brighten level under cursor"
```

---

## Task 8: Snap-to-swing on draw commit

**Files:**
- Modify: `src/components/market-chart/drawings/fibonacciRetracement.tsx`
- Modify: `src/components/market-chart/CandlestickChart.tsx`

- [ ] **Step 1: Add a swing-finder helper in the module**

Add at the bottom of `src/components/market-chart/drawings/fibonacciRetracement.tsx`:

```typescript
import type { KlineData } from '../types';

/**
 * Find the candle with the most-extreme high or low within ±windowBars of
 * `anchorTime`. Returns the candle's high (if nearer) or low (if nearer) and
 * its time. Returns null if no candle is within the window.
 *
 * A candle is a "swing" if its high or low is the extreme across a
 * 5-bar window centred on it.
 */
export function findNearestSwing(
    candles: KlineData[],
    anchorTime: number,
    windowBars: number
): { time: number; price: number } | null {
    if (candles.length === 0) return null;
    // Find index nearest to anchorTime
    let nearestIdx = 0;
    let bestDelta = Math.abs(candles[0].time - anchorTime);
    for (let i = 1; i < candles.length; i++) {
        const delta = Math.abs(candles[i].time - anchorTime);
        if (delta < bestDelta) {
            bestDelta = delta;
            nearestIdx = i;
        }
    }
    const lo = Math.max(0, nearestIdx - windowBars);
    const hi = Math.min(candles.length - 1, nearestIdx + windowBars);

    // Candidate swings: local extrema over 5-bar windows
    let best: { time: number; price: number; score: number } | null = null;
    for (let i = lo; i <= hi; i++) {
        const wLo = Math.max(0, i - 2);
        const wHi = Math.min(candles.length - 1, i + 2);
        let isSwingHigh = true;
        let isSwingLow = true;
        for (let j = wLo; j <= wHi; j++) {
            if (j === i) continue;
            if (candles[j].high >= candles[i].high) isSwingHigh = false;
            if (candles[j].low <= candles[i].low) isSwingLow = false;
        }
        if (isSwingHigh) {
            const score = -Math.abs(candles[i].time - anchorTime);
            if (!best || score > best.score) {
                best = { time: candles[i].time, price: candles[i].high, score };
            }
        }
        if (isSwingLow) {
            const score = -Math.abs(candles[i].time - anchorTime);
            if (!best || score > best.score) {
                best = { time: candles[i].time, price: candles[i].low, score };
            }
        }
    }
    if (!best) return null;
    return { time: best.time, price: best.price };
}
```

(If `KlineData` has different field names — `open`, `close`, etc. — adjust `high`/`low`/`time` references. Check the type definition before writing tests.)

- [ ] **Step 2: Apply snap on mouse-down and mouse-up when drawing a Fib**

Find the handler where a new Fibonacci drawing is committed (search for `'Fibonacci Retracement'` in the mouse-down/mouse-up handlers of `CandlestickChart.tsx`, typically near where `addDrawing` is called).

Import at the top:
```typescript
import { findNearestSwing } from './drawings/fibonacciRetracement';
```

Before the drawing is committed, apply the snap:

```typescript
if (newDrawing.type === 'Fibonacci Retracement' && newDrawing.style.fibSettings?.snapToSwing) {
    const snappedStart = findNearestSwing(candles, newDrawing.start.time, 20);
    const snappedEnd = findNearestSwing(candles, newDrawing.end.time, 20);
    if (snappedStart) newDrawing.start = snappedStart;
    if (snappedEnd) newDrawing.end = snappedEnd;
}
```

Where `candles` is the variable holding the current kline array (likely `props.klines` or `klineData` — use whatever the file uses).

- [ ] **Step 3: Visual verification**

```bash
pnpm dev
```

- Open settings for a Fib drawing, enable `Snap to swing`
- Draw a new Fib near a visible swing high — the anchor should snap to that swing's high on mouse-up
- Disable the toggle — new drawings use raw cursor positions

- [ ] **Step 4: Commit**

```bash
git add src/components/market-chart/drawings/fibonacciRetracement.tsx src/components/market-chart/CandlestickChart.tsx
git commit -m "feat(fib): snap-to-swing on draw commit within ±20 bars"
```

---

## Task 9: End-to-end verification

**Files:**
- No code changes — manual browser test + type-check

- [ ] **Step 1: Type-check the whole project**

```bash
cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm build 2>&1 | grep -E "error TS|error:" | head -20
```

Expected: no TypeScript errors.

- [ ] **Step 2: Run dev server and walk through every feature**

```bash
pnpm dev
```

Check each spec requirement:

**Rendering:**
- [ ] Lavender palette by default (no red/orange/green like the old palette)
- [ ] All 13 levels toggleable (3 negative-ext hidden by default, 3 positive-ext visible by default, 8 core visible)
- [ ] Extension levels render dashed at reduced opacity
- [ ] Background fills appear only between core (0–1) levels
- [ ] Dual labels: ratio left, price right
- [ ] All level lines pixel-aligned (no sub-pixel blur)

**Interaction:**
- [ ] Click-drag creates a drawing
- [ ] Selected drawing shows 5 handles (4 corners + midpoint)
- [ ] Each corner handle resizes; midpoint translates the whole drawing
- [ ] Clicking a level line selects the drawing
- [ ] Clicking the trend line selects the drawing
- [ ] Hover over a level → it brightens

**Settings:**
- [ ] `Extend lines` dropdown has both / right / none and they work visually
- [ ] `Log scale` moves levels into log space
- [ ] `Snap to swing` snaps on commit
- [ ] `Reverse` flips labels (geometry unchanged)
- [ ] Per-level visibility and color pickers work
- [ ] Trend line controls (visibility, color, width, style) work

**Migration:**
- [ ] An older drawing with `extendLines: true` renders as `'both'`
- [ ] An older drawing with `extendLines: false` renders as `'none'`
- [ ] An older drawing missing `snapToSwing` / `reverse` still renders

- [ ] **Step 3: Commit verification notes if anything was fixed**

If Step 2 surfaced fixes, commit them as separate targeted commits. Otherwise, no commit needed.

---

## Files NOT touched

- `src/components/market-chart/constants.ts` — `FIB_LEVELS` / `FIB_LEVEL_COLORS` are left alone. They may no longer be referenced; if a follow-up finds them unreferenced they can be deleted, but that's out of scope for this plan.
- Gann Box — out of scope entirely; will be a separate plan.

## Out of Scope

- True Gann fan / angle lines
- Custom level add / remove UI (only visibility and color editable per level)
- Undo / redo for settings changes
- Multi-drawing selection
- Presets / templates
