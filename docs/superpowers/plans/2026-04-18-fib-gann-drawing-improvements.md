# Fibonacci & Gann Box Drawing Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve Fibonacci Retracement and Gann Box drawing tools — same visual language, better labels, extension levels, dual-side labels, and 8-point resize handles.

**Architecture:** All changes are confined to the SVG rendering switch-cases and hit-detection blocks inside `CandlestickChart.tsx`, plus one settings default update in `DrawingSettingsModal.tsx`. No new files, no new types.

**Tech Stack:** React, TypeScript, SVG rendering inside canvas component, Vite dev server

---

## File Map

| File | Lines | Change |
|------|-------|--------|
| `src/components/market-chart/DrawingSettingsModal.tsx` | ~56–75 | Add −0.618, −0.272, 1.272 extension levels to `DefaultFibSettings` |
| `src/components/market-chart/CandlestickChart.tsx` | 3649–3669 | Fibonacci hit detection — add midpoint handle |
| `src/components/market-chart/CandlestickChart.tsx` | 3753–3780 | Gann Box hit detection — add 4 edge-midpoint handles |
| `src/components/market-chart/CandlestickChart.tsx` | 5155–5285 | Resize handler — add `'mid'`, `'top'`, `'bottom'`, `'left'`, `'right'` cases |
| `src/components/market-chart/CandlestickChart.tsx` | 5993–6149 | Rewrite Fibonacci rendering block |
| `src/components/market-chart/CandlestickChart.tsx` | 6150–6363 | Rewrite Gann Box rendering block |

---

## Task 1: Add Extension Levels to Fibonacci Settings Defaults

**Files:**
- Modify: `src/components/market-chart/DrawingSettingsModal.tsx` (~line 56)

- [ ] **Step 1: Locate and update `DefaultFibSettings`**

Find the `const DefaultFibSettings` object (around line 56). Replace the `levels` array so it includes negative extension levels and 1.272:

```typescript
const DefaultFibSettings: FibSettings = {
    trendLine: { visible: true, color: '#787B86', width: 1, style: 'dashed' },
    levels: [
        { level: -0.618, color: '#E91E63', visible: false },
        { level: -0.272, color: '#9C27B0', visible: false },
        { level: 0,      color: '#787B86', visible: true  },
        { level: 0.236,  color: '#F44336', visible: true  },
        { level: 0.382,  color: '#FF9800', visible: true  },
        { level: 0.5,    color: '#4CAF50', visible: true  },
        { level: 0.618,  color: '#2196F3', visible: true  },
        { level: 0.786,  color: '#3F51B5', visible: true  },
        { level: 1,      color: '#787B86', visible: true  },
        { level: 1.272,  color: '#00BCD4', visible: false },
        { level: 1.618,  color: '#9C27B0', visible: false },
        { level: 2.618,  color: '#E91E63', visible: false },
    ],
    extendLines: false,
    showBackground: true,
    backgroundTransparency: 0.85,
    useLogScale: false,
};
```

- [ ] **Step 2: Verify TypeScript accepts the change**

```bash
cd "My Project" && pnpm build 2>&1 | grep -E "error|warning" | head -20
```

Expected: no TypeScript errors about `DefaultFibSettings`.

- [ ] **Step 3: Commit**

```bash
git add src/components/market-chart/DrawingSettingsModal.tsx
git commit -m "feat: add fibonacci extension levels to default settings"
```

---

## Task 2: Rewrite Fibonacci Retracement Rendering

**Files:**
- Modify: `src/components/market-chart/CandlestickChart.tsx` lines 5993–6149

**What changes:**
- Dual labels: ratio text on left side (`textAnchor="end"` at `x_min - 4`), price on right side (`textAnchor="start"` at `x_max + 4`)
- Extension levels (level < 0 or > 1) rendered with `strokeDasharray="3 3"` and `strokeOpacity=0.55`
- Fills only between core levels (0–1 range)
- Midpoint handle rendered at center of trend line (for Task 3)
- Pixel-aligned Y coordinates via `Math.round()`

- [ ] **Step 1: Replace the entire `case 'Fibonacci Retracement'` block**

Find the block starting at `case 'Fibonacci Retracement': {` (line 5993) and ending at `}` just before `case 'Gann Box':` (line 6149). Replace it entirely with:

```tsx
case 'Fibonacci Retracement': {
    if (!d.start || !d.end) return null;
    const x1 = Math.round(timeToX(d.start.time));
    const y1 = Math.round(yScale(d.start.price));
    const x2 = Math.round(timeToX(d.end.time));
    const y2 = Math.round(yScale(d.end.price));
    const priceDiff = d.end.price - d.start.price;

    const settings = d.style.fibSettings || {
        trendLine: { visible: true, color: style.color, width: 1, style: 'dashed' as const },
        levels: FIB_LEVELS.map((l, i) => ({
            level: l,
            color: FIB_LEVEL_COLORS[i] || style.color,
            visible: true,
        })),
        extendLines: false,
        showBackground: true,
        backgroundTransparency: 0.85,
        useLogScale: false,
    };

    const x_min = Math.min(x1, x2);
    const x_max = Math.max(x1, x2);
    const lineX1 = settings.extendLines ? 0 : x_min;
    const lineX2 = settings.extendLines ? chartDimensions.width : x_max;
    const bgOpacity = 1 - Math.max(0, Math.min(1, settings.backgroundTransparency));

    const allLevels = settings.levels
        .filter((l) => l.visible)
        .sort((a, b) => a.level - b.level);
    // Core levels (0–1) used for background fills
    const coreLevels = allLevels.filter((l) => l.level >= 0 && l.level <= 1);

    // Midpoint of trend line in pixel space
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    const nwse = (x1 < x2 && y1 < y2) || (x1 > x2 && y1 > y2) ? 'nwse-resize' : 'nesw-resize';
    const nesw = nwse === 'nwse-resize' ? 'nesw-resize' : 'nwse-resize';

    return (
        <g
            key={key}
            filter={isSelected ? 'url(#selectionGlow)' : 'none'}
            pointerEvents="auto"
        >
            {/* Background fills between core levels only */}
            {settings.showBackground &&
                coreLevels.slice(0, -1).map((l, i) => {
                    const next = coreLevels[i + 1];
                    const ya = yScale(d.start.price + priceDiff * l.level);
                    const yb = yScale(d.start.price + priceDiff * next.level);
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
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
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
                const price = d.start.price + priceDiff * l.level;
                const ly = Math.round(yScale(price));
                const isExt = l.level < 0 || l.level > 1;
                const lineOpacity = isExt ? 0.55 : 1;
                return (
                    <g key={`lv-${i}`}>
                        <line
                            x1={lineX1}
                            y1={ly}
                            x2={lineX2}
                            y2={ly}
                            stroke={l.color}
                            strokeWidth={style.width}
                            strokeOpacity={lineOpacity}
                            strokeDasharray={isExt ? '3 3' : undefined}
                        />
                        {/* Left label: ratio */}
                        <text
                            x={x_min - 4}
                            y={ly - 3}
                            fill={l.color}
                            fillOpacity={lineOpacity}
                            fontSize="10"
                            textAnchor="end"
                            className="pointer-events-none select-none"
                        >
                            {l.level.toFixed(3)}
                        </text>
                        {/* Right label: price */}
                        <text
                            x={x_max + 4}
                            y={ly - 3}
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
                    {renderHandle(x1, y1, nwse)}
                    {renderHandle(x2, y2, nwse)}
                    {renderHandle(x1, y2, nesw)}
                    {renderHandle(x2, y1, nesw)}
                    {/* Midpoint handle — drags entire drawing */}
                    {renderHandle(midX, midY, 'move')}
                </>
            )}
        </g>
    );
}
```

- [ ] **Step 2: Start dev server and verify visually**

```bash
pnpm dev
```

Open the chart, draw a Fibonacci Retracement. Verify:
- Left side shows ratios (0, 0.236, 0.382 …)
- Right side shows prices
- A 5th handle appears at the midpoint of the trend line when selected
- No TypeScript errors in console

- [ ] **Step 3: Commit**

```bash
git add src/components/market-chart/CandlestickChart.tsx
git commit -m "feat: rewrite fibonacci rendering — dual labels, extension levels, midpoint handle"
```

---

## Task 3: Fibonacci Midpoint Handle Interaction

**Files:**
- Modify: `src/components/market-chart/CandlestickChart.tsx` (hit detection ~3649, resize handler ~5242)

- [ ] **Step 1: Add midpoint handle to Fibonacci hit detection**

Find the Fibonacci hit-detection block starting at line 3649:
```typescript
} else if (d.type === 'Fibonacci Retracement') {
    if (!d.start || !d.end) continue;
    const start = { x: timeToX(d.start.time), y: yScale(d.start.price) };
    const end = { x: timeToX(d.end.time), y: yScale(d.end.price) };

    if (distSq(p, start) < HANDLE_RADIUS ** 2) return { drawing: d, handle: 'start' };
    if (distSq(p, end) < HANDLE_RADIUS ** 2) return { drawing: d, handle: 'end' };

    // Check trendline
    if (distToSegmentSquared(p, start, end) < HITBOX_WIDTH ** 2) return { drawing: d };
```

Add the midpoint check between the `end` handle check and the trendline check:

```typescript
} else if (d.type === 'Fibonacci Retracement') {
    if (!d.start || !d.end) continue;
    const start = { x: timeToX(d.start.time), y: yScale(d.start.price) };
    const end = { x: timeToX(d.end.time), y: yScale(d.end.price) };

    if (distSq(p, start) < HANDLE_RADIUS ** 2) return { drawing: d, handle: 'start' };
    if (distSq(p, end) < HANDLE_RADIUS ** 2) return { drawing: d, handle: 'end' };

    // Midpoint handle — check before trendline so it takes priority
    const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    if (distSq(p, mid) < HANDLE_RADIUS ** 2) return { drawing: d, handle: 'mid' };

    // Check trendline
    if (distToSegmentSquared(p, start, end) < HITBOX_WIDTH ** 2) return { drawing: d };
```

- [ ] **Step 2: Add 'mid' resize case to the resize handler**

Find the resize handler block (around line 5242) with this pattern:
```typescript
} else if (h === 'start' || h === 'end') {
    // All range tools: update full point (both time + price)
    if (h === 'start') resized.start = snappedPoint;
    else resized.end = snappedPoint;
} else if (h === 'c3') {
```

Add the `'mid'` case BEFORE the `'start' || 'end'` case:

```typescript
} else if (h === 'mid' && resized.type === 'Fibonacci Retracement') {
    // Translate both endpoints by the same delta relative to initial midpoint
    const init = interaction.initialDrawing as any;
    const initMidTime = (init.start.time + init.end.time) / 2;
    const initMidPrice = (init.start.price + init.end.price) / 2;
    const dTime = snappedPoint.time - initMidTime;
    const dPrice = snappedPoint.price - initMidPrice;
    resized.start = { time: init.start.time + dTime, price: init.start.price + dPrice };
    resized.end = { time: init.end.time + dTime, price: init.end.price + dPrice };
} else if (h === 'start' || h === 'end') {
    if (h === 'start') resized.start = snappedPoint;
    else resized.end = snappedPoint;
} else if (h === 'c3') {
```

- [ ] **Step 3: Test midpoint handle**

With `pnpm dev` running:
1. Draw a Fibonacci Retracement
2. Click to select it — 5 handles appear
3. Drag the **center** handle → entire drawing moves, proportions preserved
4. Drag a **corner** handle → stretches, other corner stays fixed

- [ ] **Step 4: Commit**

```bash
git add src/components/market-chart/CandlestickChart.tsx
git commit -m "feat: fibonacci midpoint handle — drag moves entire drawing"
```

---

## Task 4: Rewrite Gann Box Rendering (Better Labels + 8 Handles)

**Files:**
- Modify: `src/components/market-chart/CandlestickChart.tsx` lines 6150–6363

**What changes:**
- Left labels on horizontal levels show actual price (not decimal ratio)
- Bottom labels on vertical levels show formatted date (not decimal ratio)
- 8 resize handles (4 corners + 4 edge midpoints) rendered when selected

- [ ] **Step 1: Replace the entire `case 'Gann Box'` block**

Find the block starting at `case 'Gann Box': {` (line 6150) and ending just before `case 'Parallel Channel':` (line 6364). Replace entirely with:

```tsx
case 'Gann Box': {
    if (!d.start || !d.end) return null;
    const x1 = Math.round(timeToX(d.start.time));
    const y1 = Math.round(yScale(d.start.price));
    const x2 = Math.round(timeToX(d.end.time));
    const y2 = Math.round(yScale(d.end.price));

    const bx = Math.min(x1, x2);
    const by = Math.min(y1, y2);
    const bw = Math.abs(x1 - x2);
    const bh = Math.abs(y1 - y2);

    const settings = d.style.gannSettings || {
        priceLevels: GANN_LEVELS.map((l, i) => ({
            level: l,
            color: GANN_LEVEL_COLORS[i] || d.style.color,
            visible: true,
        })),
        timeLevels: GANN_LEVELS.map((l, i) => ({
            level: l,
            color: GANN_LEVEL_COLORS[i] || d.style.color,
            visible: true,
        })),
        useLeftLabels: true,
        useRightLabels: true,
        useTopLabels: true,
        useBottomLabels: true,
        showBackground: true,
        backgroundTransparency: 0.9,
    };

    const activeTimeLevels = settings.timeLevels
        .filter((l) => l.visible)
        .sort((a, b) => a.level - b.level);
    const activePriceLevels = settings.priceLevels
        .filter((l) => l.visible)
        .sort((a, b) => a.level - b.level);

    const bgOpacity = 1 - Math.max(0, Math.min(1, settings.backgroundTransparency));

    // Price helpers — top of box = max price, bottom = min price
    const topPrice = Math.max(d.start.price, d.end.price);
    const botPrice = Math.min(d.start.price, d.end.price);
    const priceAtLevel = (level: number) => topPrice - (topPrice - botPrice) * level;

    // Time helpers
    const leftTime = Math.min(d.start.time, d.end.time);
    const rightTime = Math.max(d.start.time, d.end.time);
    const timeAtLevel = (level: number) => leftTime + (rightTime - leftTime) * level;
    const formatGannDate = (unixSecs: number) =>
        new Date(unixSecs * 1000).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
        });

    // 8 handle positions
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const topY = by;
    const botY = by + bh;
    const leftX = bx;
    const rightX = bx + bw;

    return (
        <g
            key={key}
            filter={isSelected ? 'url(#selectionGlow)' : 'none'}
            pointerEvents="auto"
        >
            {/* Background fills */}
            {settings.showBackground && (
                <>
                    {activeTimeLevels.slice(0, -1).map((l, i) => {
                        const next = activeTimeLevels[i + 1];
                        const vx = bx + bw * l.level;
                        const vw = bw * (next.level - l.level);
                        if (vw <= 0) return null;
                        return (
                            <rect
                                key={`t-fill-${i}`}
                                x={vx}
                                y={by}
                                width={vw}
                                height={bh}
                                fill={l.color}
                                fillOpacity={bgOpacity * 0.5}
                            />
                        );
                    })}
                    {activePriceLevels.slice(0, -1).map((l, i) => {
                        const next = activePriceLevels[i + 1];
                        const hy = by + bh * l.level;
                        const hh = bh * (next.level - l.level);
                        if (hh <= 0) return null;
                        return (
                            <rect
                                key={`p-fill-${i}`}
                                x={bx}
                                y={hy}
                                width={bw}
                                height={hh}
                                fill={l.color}
                                fillOpacity={bgOpacity * 0.5}
                            />
                        );
                    })}
                </>
            )}

            {/* Vertical time lines */}
            {activeTimeLevels.map((l, i) => {
                const lx = Math.round(bx + bw * l.level);
                const dateStr = formatGannDate(timeAtLevel(l.level));
                return (
                    <g key={`t-grid-${i}`}>
                        <line
                            x1={lx} y1={by} x2={lx} y2={by + bh}
                            stroke={l.color}
                            strokeWidth={1}
                            strokeOpacity={0.8}
                        />
                        {settings.useTopLabels && l.level >= 0 && l.level <= 1 && (
                            <text
                                x={lx} y={by - 5}
                                fill={l.color} fontSize={10} textAnchor="middle"
                                className="pointer-events-none select-none"
                            >
                                {l.level.toFixed(3)}
                            </text>
                        )}
                        {settings.useBottomLabels && l.level >= 0 && l.level <= 1 && (
                            <text
                                x={lx} y={by + bh + 12}
                                fill={l.color} fontSize={9} textAnchor="middle"
                                className="pointer-events-none select-none"
                            >
                                {dateStr}
                            </text>
                        )}
                    </g>
                );
            })}

            {/* Horizontal price lines */}
            {activePriceLevels.map((l, i) => {
                const ly = Math.round(by + bh * l.level);
                const priceLabel = formatPrice(priceAtLevel(l.level));
                return (
                    <g key={`p-grid-${i}`}>
                        <line
                            x1={bx} y1={ly} x2={bx + bw} y2={ly}
                            stroke={l.color}
                            strokeWidth={1}
                            strokeOpacity={0.8}
                        />
                        {settings.useLeftLabels && l.level >= 0 && l.level <= 1 && (
                            <text
                                x={bx - 5} y={ly + 3}
                                fill={l.color} fontSize={10} textAnchor="end"
                                className="pointer-events-none select-none"
                            >
                                {priceLabel}
                            </text>
                        )}
                        {settings.useRightLabels && l.level >= 0 && l.level <= 1 && (
                            <text
                                x={bx + bw + 5} y={ly + 3}
                                fill={l.color} fontSize={10} textAnchor="start"
                                className="pointer-events-none select-none"
                            >
                                {l.level.toFixed(3)}
                            </text>
                        )}
                    </g>
                );
            })}

            {/* Outer border */}
            <rect
                x={bx} y={by} width={bw} height={bh}
                fill="none"
                stroke={style.color}
                strokeWidth={style.width}
            />

            {/* 8-point resize handles when selected */}
            {isSelected && (() => {
                const nwse =
                    (x1 < x2 && y1 < y2) || (x1 > x2 && y1 > y2)
                        ? 'nwse-resize'
                        : 'nesw-resize';
                const nesw = nwse === 'nwse-resize' ? 'nesw-resize' : 'nwse-resize';
                return (
                    <>
                        {/* Corners */}
                        {renderHandle(x1, y1, nwse)}
                        {renderHandle(x2, y2, nwse)}
                        {renderHandle(x1, y2, nesw)}
                        {renderHandle(x2, y1, nesw)}
                        {/* Edge midpoints */}
                        {renderHandle(midX, topY, 'n-resize')}
                        {renderHandle(midX, botY, 's-resize')}
                        {renderHandle(leftX, midY, 'w-resize')}
                        {renderHandle(rightX, midY, 'e-resize')}
                    </>
                );
            })()}
        </g>
    );
}
```

- [ ] **Step 2: Verify visually**

With `pnpm dev` running, draw a Gann Box. Verify:
- Left of each horizontal line shows a price value (e.g. `47500.00`)
- Bottom of each vertical line shows a date (e.g. `Apr 10`)
- When selected, 8 handles appear (4 corners + 4 edge midpoints)
- Right labels still show decimal ratios (0.25, 0.382 …)

- [ ] **Step 3: Commit**

```bash
git add src/components/market-chart/CandlestickChart.tsx
git commit -m "feat: gann box — price/date labels, 8 resize handles"
```

---

## Task 5: Gann Box Edge-Midpoint Handle Interaction

**Files:**
- Modify: `src/components/market-chart/CandlestickChart.tsx` (hit detection ~3753, resize handler ~5242)

- [ ] **Step 1: Add edge-midpoint handle checks to Gann Box hit detection**

Find the Gann Box hit-detection block starting at line 3753:
```typescript
if (d.type === 'Rectangle' || d.type === 'Gann Box') {
    const c3 = { x: start.x, y: end.y };
    const c4 = { x: end.x, y: start.y };

    const hRadiusSq = (HANDLE_RADIUS + 6) ** 2;
    if (distSq(p, start) < hRadiusSq) return { drawing: d, handle: 'start' };
    if (distSq(p, end) < hRadiusSq) return { drawing: d, handle: 'end' };
    if (distSq(p, c3) < hRadiusSq) return { drawing: d, handle: 'c3' };
    if (distSq(p, c4) < hRadiusSq) return { drawing: d, handle: 'c4' };
```

After the four corner checks AND only for Gann Box (not Rectangle), add the edge-midpoint checks:

```typescript
if (d.type === 'Rectangle' || d.type === 'Gann Box') {
    const c3 = { x: start.x, y: end.y };
    const c4 = { x: end.x, y: start.y };

    const hRadiusSq = (HANDLE_RADIUS + 6) ** 2;
    if (distSq(p, start) < hRadiusSq) return { drawing: d, handle: 'start' };
    if (distSq(p, end) < hRadiusSq) return { drawing: d, handle: 'end' };
    if (distSq(p, c3) < hRadiusSq) return { drawing: d, handle: 'c3' };
    if (distSq(p, c4) < hRadiusSq) return { drawing: d, handle: 'c4' };

    // Edge midpoint handles — Gann Box only
    if (d.type === 'Gann Box') {
        const mx = (start.x + end.x) / 2;
        const my = (start.y + end.y) / 2;
        const topY = Math.min(start.y, end.y);
        const botY = Math.max(start.y, end.y);
        const leftX = Math.min(start.x, end.x);
        const rightX = Math.max(start.x, end.x);
        if (distSq(p, { x: mx, y: topY }) < hRadiusSq) return { drawing: d, handle: 'top' };
        if (distSq(p, { x: mx, y: botY }) < hRadiusSq) return { drawing: d, handle: 'bottom' };
        if (distSq(p, { x: leftX, y: my }) < hRadiusSq) return { drawing: d, handle: 'left' };
        if (distSq(p, { x: rightX, y: my }) < hRadiusSq) return { drawing: d, handle: 'right' };
    }
```

- [ ] **Step 2: Add 'top', 'bottom', 'left', 'right' cases to the resize handler**

Find the resize handler block (around line 5246) with:
```typescript
} else if (h === 'c3') {
    resized.start = { ...resized.start, time: snappedPoint.time };
    resized.end = { ...resized.end, price: snappedPoint.price };
} else if (h === 'c4') {
    resized.end = { ...resized.end, time: snappedPoint.time };
    resized.start = { ...resized.start, price: snappedPoint.price };
}
```

Append after the `'c4'` case:

```typescript
} else if (h === 'top') {
    // Move the high-price edge
    const init = interaction.initialDrawing as any;
    if (init.start.price >= init.end.price) {
        resized.start = { ...resized.start, price: snappedPoint.price };
    } else {
        resized.end = { ...resized.end, price: snappedPoint.price };
    }
} else if (h === 'bottom') {
    // Move the low-price edge
    const init = interaction.initialDrawing as any;
    if (init.start.price <= init.end.price) {
        resized.start = { ...resized.start, price: snappedPoint.price };
    } else {
        resized.end = { ...resized.end, price: snappedPoint.price };
    }
} else if (h === 'left') {
    // Move the earliest-time edge
    const init = interaction.initialDrawing as any;
    if (init.start.time <= init.end.time) {
        resized.start = { ...resized.start, time: snappedPoint.time };
    } else {
        resized.end = { ...resized.end, time: snappedPoint.time };
    }
} else if (h === 'right') {
    // Move the latest-time edge
    const init = interaction.initialDrawing as any;
    if (init.start.time >= init.end.time) {
        resized.start = { ...resized.start, time: snappedPoint.time };
    } else {
        resized.end = { ...resized.end, time: snappedPoint.time };
    }
}
```

- [ ] **Step 3: Test all 8 handles**

With `pnpm dev` running, draw a Gann Box and select it:
1. Drag **top-center** handle → only the top (high-price) edge moves, time unchanged
2. Drag **bottom-center** handle → only the bottom (low-price) edge moves, time unchanged
3. Drag **left-center** handle → only the left (early-time) edge moves, price unchanged
4. Drag **right-center** handle → only the right (late-time) edge moves, price unchanged
5. Drag any **corner** handle → diagonal resize (existing behaviour unchanged)

- [ ] **Step 4: Commit**

```bash
git add src/components/market-chart/CandlestickChart.tsx
git commit -m "feat: gann box 8-point handle interaction — axis-constrained edge resize"
```
