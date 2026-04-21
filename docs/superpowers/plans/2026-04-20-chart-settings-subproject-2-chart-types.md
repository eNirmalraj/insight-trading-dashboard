# Chart Type Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the chart type switcher from 2 modes (Candle, Line) to all 7 TradingView-equivalent types (Bars, Candles, Hollow Candles, Heikin Ashi, Line, Area, Baseline) with a dropdown menu in the chart header.

**Architecture:** `chartType` stays as component-local state in `CandlestickChart.tsx` — the union widens from `'Candle' | 'Line'` to a 7-value `ChartType` union exported from `types.ts`. Rendering switches across 7 cases inside the existing canvas draw block (preserves lexical scope). Heikin Ashi gets a `useMemo` pre-computation pass keyed on `data`. The header replaces its toggle button with a dropdown menu.

**Tech Stack:** React + TypeScript, HTML Canvas (via `chartContext`), Vite (`pnpm build`).

**Spec:** `docs/superpowers/specs/2026-04-20-chart-settings-subproject-2-chart-types.md`

---

## File Map

| File | Change |
|------|--------|
| `src/components/market-chart/types.ts` | Add and export `ChartType` union |
| `src/components/market-chart/CandlestickChart.tsx` | Widen `chartType` state; rename `'Candle'` → `'Candles'`; add `normaliseChartType` + `heikinAshiData` memo; replace render branch with switch over 7 cases; pass `onChartTypeChange` to `<ChartHeader>` |
| `src/components/market-chart/ChartHeader.tsx` | Replace `onToggleChartType` prop with `onChartTypeChange`; render dropdown picker |
| `src/components/IconComponents.tsx` | Add 5 new icons (`BarsIcon`, `HollowCandlesIcon`, `HeikinAshiIcon`, `AreaIcon`, `BaselineIcon`) |

---

## Task 1: Type widening + state + localStorage migration

**Files:**
- Modify: `src/components/market-chart/types.ts`
- Modify: `src/components/market-chart/CandlestickChart.tsx` (state declaration, HistoryState interface, all `'Candle'` literal references, localStorage load effect)

After this task the app compiles and renders identically. The state is wider but new values aren't reachable from any UI yet.

- [ ] **Step 1: Add `ChartType` union to `types.ts`**

Append at the bottom of `src/components/market-chart/types.ts`:

```typescript
export type ChartType =
    | 'Bars'
    | 'Candles'
    | 'Hollow Candles'
    | 'Heikin Ashi'
    | 'Line'
    | 'Area'
    | 'Baseline';
```

- [ ] **Step 2: Update HistoryState interface in `CandlestickChart.tsx`**

Find around line 131:

```typescript
interface HistoryState {
    drawings: Drawing[];
    indicators: Indicator[];
    view: { startIndex: number; visibleCandles: number };
    priceRange: { min: number; max: number } | null;
    isAutoScaling: boolean;
    chartType: 'Candle' | 'Line';
}
```

Change the `chartType` line to:

```typescript
    chartType: ChartType;
```

Add `ChartType` to the existing import from `./types` at the top of the file (find the existing `import { ... } from './types';` block and append `ChartType`).

- [ ] **Step 3: Widen the useState and rename default**

Find around line 647:

```typescript
const [chartType, setChartType] = useState<'Candle' | 'Line'>('Candle');
```

Replace with:

```typescript
const [chartType, setChartType] = useState<ChartType>('Candles');
```

- [ ] **Step 4: Update localStorage load effect**

Find around line 1219:

```typescript
// Load Chart Type from local storage
useEffect(() => {
    const savedType = localStorage.getItem('chart_type_preference');
    if (savedType === 'Candle' || savedType === 'Line') {
        setChartType(savedType);
    }
}, []);
```

Replace with:

```typescript
// Load Chart Type from local storage (with migration for legacy 'Candle' value)
useEffect(() => {
    const savedType = localStorage.getItem('chart_type_preference');
    setChartType(normaliseChartType(savedType));
}, []);
```

Then add a module-local `normaliseChartType` helper above the `CandlestickChart` component declaration (search for `const CandlestickChart: React.FC` and put the helper just before it):

```typescript
const normaliseChartType = (raw: unknown): ChartType => {
    if (raw === 'Candle' || raw === 'Candles') return 'Candles';
    if (
        raw === 'Bars' ||
        raw === 'Hollow Candles' ||
        raw === 'Heikin Ashi' ||
        raw === 'Line' ||
        raw === 'Area' ||
        raw === 'Baseline'
    ) {
        return raw;
    }
    return 'Candles';
};
```

Make sure `ChartType` is in scope (added in Step 2's import). If `normaliseChartType` reports `setChartType('Candles')` when there's no stored value, that overwrites the default (also `'Candles'`) — no functional change.

- [ ] **Step 5: Update render branch to use renamed value**

Find around line 2503:

```typescript
if (chartType === 'Candle') {
```

Replace with:

```typescript
if (chartType === 'Candles') {
```

(Task 5 will fully replace this `if/else if` with a switch — for now just rename.)

- [ ] **Step 6: Update existing toggle handler in `CandlestickChart.tsx`**

Search the file for any place that toggles between `'Candle'` and `'Line'`:

```bash
grep -n "'Candle'" src/components/market-chart/CandlestickChart.tsx
```

Each remaining `'Candle'` literal must be replaced with `'Candles'`. Common locations:
- A `setChartType(prev => prev === 'Candle' ? 'Line' : 'Candle')` toggle handler — change both literals to `'Candles'`
- Any `chartType === 'Candle'` comparisons elsewhere — change to `'Candles'`

Also search for any `localStorage.setItem('chart_type_preference', ...)` calls — they should be writing whatever the current `chartType` is, which after this change will be `'Candles'`. No code change needed if it uses the variable directly.

- [ ] **Step 7: Update ChartHeader prop type to keep build green**

Find around line 54 of `src/components/market-chart/ChartHeader.tsx`:

```typescript
chartType: 'Candle' | 'Line';
```

Change to:

```typescript
chartType: ChartType;
```

Add `ChartType` to the existing import from `./types` (or the appropriate types module — check the existing import in ChartHeader.tsx). If the file doesn't import from `./types`, add:

```typescript
import type { ChartType } from './types';
```

The existing `chartType === 'Candle'` comparison at line 339 also needs updating to `'Candles'`. Task 3 will fully replace this region with the dropdown — the rename is just to keep the build green for now.

- [ ] **Step 8: Verify build**

```bash
cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm build 2>&1 | grep -E "error TS" | head -10
```

Expected: no errors. If errors appear about other files comparing against `'Candle'`, grep for them and apply the same rename.

- [ ] **Step 9: Commit**

```bash
git add src/components/market-chart/types.ts src/components/market-chart/CandlestickChart.tsx src/components/market-chart/ChartHeader.tsx
git commit -m "feat(chart-types): widen ChartType union; rename 'Candle' to 'Candles'; add migration"
```

---

## Task 2: Add 5 new chart-type icons

**Files:**
- Modify: `src/components/IconComponents.tsx`

After this task the new icons exist as exports but aren't rendered anywhere. No visual change.

- [ ] **Step 1: Locate the existing icon pattern**

Open `src/components/IconComponents.tsx` and find an existing icon like `CandlesIcon` or `LineChartIcon` for reference. The pattern is `React.FC<{ className?: string }>` returning an `<svg>` with `stroke="currentColor"` so the parent can color it via Tailwind classes.

- [ ] **Step 2: Add the 5 new icons at the bottom of the file**

Append these to `src/components/IconComponents.tsx`:

```tsx
export const BarsIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <line x1="10" y1="3" x2="10" y2="17" />
        <line x1="6" y1="6" x2="10" y2="6" />
        <line x1="10" y1="14" x2="14" y2="14" />
    </svg>
);

export const HollowCandlesIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <line x1="6" y1="3" x2="6" y2="17" />
        <rect x="3.5" y="6" width="5" height="8" fill="none" />
        <line x1="14" y1="3" x2="14" y2="17" />
        <rect x="11.5" y="8" width="5" height="6" fill="none" />
    </svg>
);

export const HeikinAshiIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <line x1="4" y1="4" x2="4" y2="16" />
        <rect x="2.5" y="6" width="3" height="6" fill="currentColor" />
        <line x1="10" y1="3" x2="10" y2="17" />
        <rect x="8.5" y="5" width="3" height="8" fill="currentColor" />
        <line x1="16" y1="5" x2="16" y2="15" />
        <rect x="14.5" y="7" width="3" height="6" fill="currentColor" />
    </svg>
);

export const AreaIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 14 L7 9 L11 12 L18 5 L18 17 L2 17 Z" fill="currentColor" fillOpacity="0.25" />
        <path d="M2 14 L7 9 L11 12 L18 5" />
    </svg>
);

export const BaselineIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="2" y1="10" x2="18" y2="10" strokeDasharray="2 2" />
        <path d="M2 13 L7 8 L11 11 L18 4" />
    </svg>
);
```

- [ ] **Step 3: Verify build**

```bash
cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm build 2>&1 | grep -E "error TS" | head -5
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/IconComponents.tsx
git commit -m "feat(chart-types): add Bars, Hollow Candles, Heikin Ashi, Area, Baseline icons"
```

---

## Task 3: Heikin Ashi pre-computation + 7-case render dispatch

**Files:**
- Modify: `src/components/market-chart/CandlestickChart.tsx` (add `heikinAshiData` memo near other memos; replace render branch around line 2503 with switch)

After this task all 7 chart types render correctly when `chartType` is set programmatically. The header still only toggles between `'Candles'` and `'Line'` (Task 4 fixes that).

- [ ] **Step 1: Add `heikinAshiData` useMemo**

Find an existing `useMemo` block in `CandlestickChart.tsx` (e.g., `visibleData`, around line 2036) and add this above or below it:

```typescript
const heikinAshiData = useMemo<Candle[]>(() => {
    if (data.length === 0) return [];
    const out: Candle[] = new Array(data.length);
    let prevHaOpen = (data[0].open + data[0].close) / 2;
    let prevHaClose =
        (data[0].open + data[0].high + data[0].low + data[0].close) / 4;
    out[0] = {
        ...data[0],
        open: prevHaOpen,
        close: prevHaClose,
        high: Math.max(data[0].high, prevHaOpen, prevHaClose),
        low: Math.min(data[0].low, prevHaOpen, prevHaClose),
    };
    for (let i = 1; i < data.length; i++) {
        const c = data[i];
        const haClose = (c.open + c.high + c.low + c.close) / 4;
        const haOpen = (prevHaOpen + prevHaClose) / 2;
        const haHigh = Math.max(c.high, haOpen, haClose);
        const haLow = Math.min(c.low, haOpen, haClose);
        out[i] = { ...c, open: haOpen, close: haClose, high: haHigh, low: haLow };
        prevHaOpen = haOpen;
        prevHaClose = haClose;
    }
    return out;
}, [data]);
```

If `Candle` isn't imported from `./types` already in this file, add it to the existing types import.

- [ ] **Step 2: Add `hexToRgba` helper at module scope**

Above the `CandlestickChart` component (next to `normaliseChartType` from Task 1), add:

```typescript
const hexToRgba = (hex: string, alpha: number): string => {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
```

- [ ] **Step 3: Replace the render branch with a switch over 7 cases**

Find the existing block that currently looks like this (after Task 1's rename):

```typescript
if (chartType === 'Candles') {
    visibleData.forEach((d, i) => {
        // ... existing candle render code ...
    });
} else if (chartType === 'Line') {
    chartContext.strokeStyle = '#3B82F6';
    chartContext.lineWidth = 1.5;
    chartContext.beginPath();
    let firstPoint = true;
    visibleData.forEach((d, i) => {
        // ... existing line render code ...
    });
    chartContext.stroke();
}
```

This block sits inside a draw function (likely an effect or memoized callback) where `chartContext`, `xStep`, `yScale`, `indexToX`, `view.startIndex`, `chartSettings`, `startIdx`, and `chartDimensions` are all in lexical scope.

Replace the whole `if/else if` with the following switch. **Keep the existing Candle-case body and Line-case body verbatim — do not retype the candle math; just paste the existing code into the corresponding case block.** The new cases (Bars, Hollow Candles, Heikin Ashi, Area, Baseline) use shared helpers.

```typescript
const renderCandlesLikePass = (renderData: Candle[], hollow: boolean) => {
    renderData.forEach((d, i) => {
        const dataIndex = startIdx + i;
        const effectiveIndexInView = dataIndex - view.startIndex;
        const x = indexToX(effectiveIndexInView);
        const prevCandle = dataIndex > 0 ? renderData[i - 1] ?? data[dataIndex - 1] : null;
        const isBullish =
            chartSettings.symbol.colorBarsOnPrevClose && prevCandle
                ? d.close >= prevCandle.close
                : d.close >= d.open;

        const bodyColor = isBullish ? chartSettings.symbol.bodyUpColor : chartSettings.symbol.bodyDownColor;
        const borderColor = isBullish ? chartSettings.symbol.borderUpColor : chartSettings.symbol.borderDownColor;
        const wickColor = isBullish ? chartSettings.symbol.wickUpColor : chartSettings.symbol.wickDownColor;

        if (chartSettings.symbol.showWick) {
            const wx = Math.round(x) + 0.5;
            chartContext.beginPath();
            chartContext.strokeStyle = wickColor;
            chartContext.lineWidth = 1;
            chartContext.moveTo(wx, Math.round(yScale(d.high)));
            chartContext.lineTo(wx, Math.round(yScale(d.low)));
            chartContext.stroke();
        }

        const bodyY = Math.round(isBullish ? yScale(d.close) : yScale(d.open));
        const bodyHeight = Math.max(
            1,
            Math.abs(Math.round(yScale(d.open)) - Math.round(yScale(d.close)))
        );
        const widthMultiplier = chartSettings.symbol.candleBodyWidth ?? 1.0;
        const bodyWidth = Math.max(
            1,
            Math.min(Math.max(1, xStep - 1), Math.round(xStep * 0.7 * widthMultiplier))
        );
        const bodyX = Math.round(x - bodyWidth / 2);

        if (chartSettings.symbol.showBody) {
            // Hollow candles: only fill DOWN candles; up candles remain hollow
            if (!hollow || !isBullish) {
                chartContext.fillStyle = bodyColor;
                chartContext.fillRect(bodyX, bodyY, bodyWidth, bodyHeight);
            }
        }

        if (chartSettings.symbol.showBorders) {
            chartContext.strokeStyle = borderColor;
            chartContext.lineWidth = 1;
            chartContext.strokeRect(bodyX + 0.5, bodyY + 0.5, bodyWidth - 1, bodyHeight - 1);
        }
    });
};

const renderBarsPass = () => {
    const widthMultiplier = chartSettings.symbol.candleBodyWidth ?? 1.0;
    const bodyWidth = Math.max(
        1,
        Math.min(Math.max(1, xStep - 1), Math.round(xStep * 0.7 * widthMultiplier))
    );
    const tickLen = Math.max(1, Math.round(bodyWidth / 2));
    visibleData.forEach((d, i) => {
        const dataIndex = startIdx + i;
        const x = Math.round(indexToX(dataIndex - view.startIndex)) + 0.5;
        const prevCandle = dataIndex > 0 ? data[dataIndex - 1] : null;
        const isBullish =
            chartSettings.symbol.colorBarsOnPrevClose && prevCandle
                ? d.close >= prevCandle.close
                : d.close >= d.open;
        const color = isBullish ? chartSettings.symbol.bodyUpColor : chartSettings.symbol.bodyDownColor;
        chartContext.strokeStyle = color;
        chartContext.lineWidth = 1;

        chartContext.beginPath();
        // vertical
        chartContext.moveTo(x, Math.round(yScale(d.high)));
        chartContext.lineTo(x, Math.round(yScale(d.low)));
        // left tick (open)
        const openY = Math.round(yScale(d.open)) + 0.5;
        chartContext.moveTo(x - tickLen, openY);
        chartContext.lineTo(x, openY);
        // right tick (close)
        const closeY = Math.round(yScale(d.close)) + 0.5;
        chartContext.moveTo(x, closeY);
        chartContext.lineTo(x + tickLen, closeY);
        chartContext.stroke();
    });
};

const renderLinePass = () => {
    chartContext.strokeStyle = '#3B82F6';
    chartContext.lineWidth = 1.5;
    chartContext.beginPath();
    let firstPoint = true;
    visibleData.forEach((d, i) => {
        const dataIndex = startIdx + i;
        const effectiveIndexInView = dataIndex - view.startIndex;
        const x = indexToX(effectiveIndexInView);
        const y = yScale(d.close);
        if (firstPoint) {
            chartContext.moveTo(x, y);
            firstPoint = false;
        } else {
            chartContext.lineTo(x, y);
        }
    });
    chartContext.stroke();
};

const renderAreaPass = () => {
    if (visibleData.length === 0) return;
    const fillColor = chartSettings.symbol.bodyUpColor;
    const points: { x: number; y: number }[] = visibleData.map((d, i) => {
        const dataIndex = startIdx + i;
        const effectiveIndexInView = dataIndex - view.startIndex;
        return { x: indexToX(effectiveIndexInView), y: yScale(d.close) };
    });
    const chartBottomY = chartDimensions.height;

    // Filled area
    chartContext.beginPath();
    chartContext.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) chartContext.lineTo(points[i].x, points[i].y);
    chartContext.lineTo(points[points.length - 1].x, chartBottomY);
    chartContext.lineTo(points[0].x, chartBottomY);
    chartContext.closePath();
    const grad = chartContext.createLinearGradient(0, points[0].y, 0, chartBottomY);
    grad.addColorStop(0, hexToRgba(fillColor, 0.3));
    grad.addColorStop(1, hexToRgba(fillColor, 0));
    chartContext.fillStyle = grad;
    chartContext.fill();

    // Stroke the line on top
    chartContext.strokeStyle = fillColor;
    chartContext.lineWidth = 1.5;
    chartContext.beginPath();
    chartContext.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) chartContext.lineTo(points[i].x, points[i].y);
    chartContext.stroke();
};

const renderBaselinePass = () => {
    if (visibleData.length === 0) return;
    const baselinePrice = visibleData[0].close;
    const baselineY = yScale(baselinePrice);
    const upColor = chartSettings.symbol.bodyUpColor;
    const downColor = chartSettings.symbol.bodyDownColor;

    const points: { x: number; y: number }[] = visibleData.map((d, i) => {
        const dataIndex = startIdx + i;
        const effectiveIndexInView = dataIndex - view.startIndex;
        return { x: indexToX(effectiveIndexInView), y: yScale(d.close) };
    });

    // Fill segment trapezoids — split crossings at the baseline
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const aAbove = a.y < baselineY; // y grows downward → smaller y = higher price = "above" baseline
        const bAbove = b.y < baselineY;

        const fillTrap = (p1: { x: number; y: number }, p2: { x: number; y: number }, color: string) => {
            chartContext.beginPath();
            chartContext.moveTo(p1.x, p1.y);
            chartContext.lineTo(p2.x, p2.y);
            chartContext.lineTo(p2.x, baselineY);
            chartContext.lineTo(p1.x, baselineY);
            chartContext.closePath();
            chartContext.fillStyle = hexToRgba(color, 0.25);
            chartContext.fill();
        };

        if (aAbove === bAbove) {
            fillTrap(a, b, aAbove ? upColor : downColor);
        } else {
            // crossing — find intersection
            const t = (baselineY - a.y) / (b.y - a.y);
            const xCross = a.x + t * (b.x - a.x);
            const cross = { x: xCross, y: baselineY };
            fillTrap(a, cross, aAbove ? upColor : downColor);
            fillTrap(cross, b, bAbove ? upColor : downColor);
        }
    }

    // Dashed baseline reference
    chartContext.save();
    chartContext.setLineDash([4, 4]);
    chartContext.strokeStyle = '#787B86';
    chartContext.lineWidth = 1;
    chartContext.beginPath();
    chartContext.moveTo(0, baselineY);
    chartContext.lineTo(chartDimensions.width, baselineY);
    chartContext.stroke();
    chartContext.restore();

    // Connecting line on top
    chartContext.strokeStyle = '#787B86';
    chartContext.lineWidth = 1.5;
    chartContext.beginPath();
    chartContext.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) chartContext.lineTo(points[i].x, points[i].y);
    chartContext.stroke();
};

switch (chartType) {
    case 'Candles':
        renderCandlesLikePass(visibleData, false);
        break;
    case 'Hollow Candles':
        renderCandlesLikePass(visibleData, true);
        break;
    case 'Bars':
        renderBarsPass();
        break;
    case 'Heikin Ashi': {
        // visibleData is the raw slice; we need the matching slice of HA data
        const haVisible = heikinAshiData.slice(startIdx, startIdx + visibleData.length);
        renderCandlesLikePass(haVisible, false);
        break;
    }
    case 'Line':
        renderLinePass();
        break;
    case 'Area':
        renderAreaPass();
        break;
    case 'Baseline':
        renderBaselinePass();
        break;
}
```

**Important** — the `renderCandlesLikePass` function is a faithful translation of the existing Candle render block. Compare it line-by-line to the existing block to verify nothing changed except:
- Hollow handling (`hollow` parameter gates the body fill for up candles only)
- Iteration over a parameterized `renderData` array (so HA can pass `haVisible`)
- The `prevCandle` calculation falls back to `data[dataIndex - 1]` when iterating HA data (since HA's first bar's `prevCandle` would otherwise be undefined inside the slice)

If the existing candle render block has any extras (e.g., crosshair-related branches), preserve them inside `renderCandlesLikePass`.

- [ ] **Step 4: Verify build**

```bash
cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm build 2>&1 | grep -E "error TS" | head -10
```

Expected: no errors.

- [ ] **Step 5: Visual smoke test (optional)**

```bash
pnpm dev
```

In the browser console, set the chart type manually:
```javascript
// Find the React fiber and call setChartType — easier: just edit the default in code temporarily
```

Or temporarily change the `useState` default in `CandlestickChart.tsx` from `'Candles'` to `'Bars'`, refresh, verify Bars renders. Then to `'Heikin Ashi'`, etc. Restore default to `'Candles'` before commit. (Skip this if you don't want to touch dev — Task 4 will expose all types via UI.)

- [ ] **Step 6: Commit**

```bash
git add src/components/market-chart/CandlestickChart.tsx
git commit -m "feat(chart-types): render dispatch for all 7 types + Heikin Ashi memo + helpers"
```

---

## Task 4: ChartHeader dropdown picker

**Files:**
- Modify: `src/components/market-chart/ChartHeader.tsx`
- Modify: `src/components/market-chart/CandlestickChart.tsx` (just the prop passed to `<ChartHeader>`)

After this task users can pick any of the 7 types from the chart header.

- [ ] **Step 1: Update ChartHeader prop interface and imports**

Open `src/components/market-chart/ChartHeader.tsx`. At the top, ensure these are imported (add the missing icons to the existing import from `../IconComponents`):

```typescript
import {
    // ...existing icons...
    CandlesIcon,
    LineChartIcon,
    BarsIcon,
    HollowCandlesIcon,
    HeikinAshiIcon,
    AreaIcon,
    BaselineIcon,
} from '../IconComponents';
import { useOutsideAlerter } from './hooks';
import { useState, useRef } from 'react'; // if not already imported
import type { ChartType } from './types';
```

Find the props interface (search for `chartType:` or the existing props). Replace the line:

```typescript
chartType: 'Candle' | 'Line';
onToggleChartType: () => void;
```

with:

```typescript
chartType: ChartType;
onChartTypeChange: (next: ChartType) => void;
```

(After Task 1 the `chartType:` line should already say `ChartType`. The Task-1 step kept `onToggleChartType` since it was still used. Now we're replacing `onToggleChartType` with `onChartTypeChange`.)

Also update the destructure inside the component (search for `chartType,` or `onToggleChartType` — both are likely destructured from props).

- [ ] **Step 2: Add the picker component above the main `ChartHeader` export**

Above the `const ChartHeader: React.FC<...>` declaration, add:

```tsx
const CHART_TYPE_OPTIONS: { type: ChartType; label: string; Icon: React.FC<{ className?: string }> }[] = [
    { type: 'Bars',           label: 'Bars',            Icon: BarsIcon },
    { type: 'Candles',        label: 'Candles',         Icon: CandlesIcon },
    { type: 'Hollow Candles', label: 'Hollow Candles',  Icon: HollowCandlesIcon },
    { type: 'Heikin Ashi',    label: 'Heikin Ashi',     Icon: HeikinAshiIcon },
    { type: 'Line',           label: 'Line',            Icon: LineChartIcon },
    { type: 'Area',           label: 'Area',            Icon: AreaIcon },
    { type: 'Baseline',       label: 'Baseline',        Icon: BaselineIcon },
];

const ChartTypePickerMenu: React.FC<{
    current: ChartType;
    onSelect: (next: ChartType) => void;
    onClose: () => void;
}> = ({ current, onSelect, onClose }) => {
    const ref = useRef<HTMLDivElement>(null);
    useOutsideAlerter(ref, onClose);
    return (
        <div
            ref={ref}
            className="absolute top-full left-0 mt-1 z-50 bg-[#1f1f1f] border border-gray-700 rounded-lg shadow-lg py-1 min-w-[180px]"
        >
            {CHART_TYPE_OPTIONS.map(({ type, label, Icon }) => (
                <button
                    key={type}
                    onClick={() => {
                        onSelect(type);
                        onClose();
                    }}
                    className={`flex items-center w-full px-3 py-2 text-sm text-left transition-colors ${
                        type === current
                            ? 'bg-[#c4b5f0]/10 text-[#c4b5f0]'
                            : 'text-gray-300 hover:bg-gray-800'
                    }`}
                >
                    <Icon className="w-4 h-4 mr-3" />
                    {label}
                </button>
            ))}
        </div>
    );
};
```

- [ ] **Step 3: Replace the toggle button with the picker trigger**

Inside the `ChartHeader` component body, near the top (before the return), add:

```typescript
const [chartTypeMenuOpen, setChartTypeMenuOpen] = useState(false);
```

Find the existing chart-type button around line 338:

```tsx
<HeaderButton onClick={onToggleChartType} title="Chart Type">
    {chartType === 'Candles' ? (
        <CandlesIcon className="w-5 h-5" />
    ) : (
        <LineChartIcon className="w-5 h-5" />
    )}
</HeaderButton>
```

Replace it with:

```tsx
<div className="relative">
    <HeaderButton
        onClick={() => setChartTypeMenuOpen((v) => !v)}
        title="Chart type"
    >
        {(() => {
            const opt = CHART_TYPE_OPTIONS.find((o) => o.type === chartType);
            const Icon = opt?.Icon ?? CandlesIcon;
            return <Icon className="w-5 h-5" />;
        })()}
    </HeaderButton>
    {chartTypeMenuOpen && (
        <ChartTypePickerMenu
            current={chartType}
            onSelect={onChartTypeChange}
            onClose={() => setChartTypeMenuOpen(false)}
        />
    )}
</div>
```

- [ ] **Step 4: Update the call site in `CandlestickChart.tsx`**

Find where `<ChartHeader>` is rendered (search for `<ChartHeader`). The current prop passes `onToggleChartType={...}`. Replace it with `onChartTypeChange={setChartType}`.

If a wrapper handler was also doing localStorage save (e.g., `onToggleChartType={() => { setChartType(...); localStorage.setItem(...) }}`), refactor to:

```tsx
onChartTypeChange={(next) => {
    setChartType(next);
    localStorage.setItem('chart_type_preference', next);
    commitCurrentState(); // if the existing toggle did this — preserve the call
}}
```

Search the existing `onToggleChartType` definition to see what side effects it had, and preserve them in the new arrow.

- [ ] **Step 5: Verify build**

```bash
cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm build 2>&1 | grep -E "error TS" | head -10
```

Expected: no errors.

- [ ] **Step 6: Visual verification**

```bash
pnpm dev
```

- Open the chart. Click the chart-type icon in the header.
- Dropdown menu appears with all 7 options.
- Click each one in turn. Verify each renders correctly:
  - **Bars**: vertical bars with side ticks
  - **Candles**: filled candles (existing look)
  - **Hollow Candles**: down candles filled, up candles outlined only
  - **Heikin Ashi**: smoothed candle pattern (each candle continues the previous color trend longer than raw candles)
  - **Line**: blue line of closes
  - **Area**: line with gradient fill below
  - **Baseline**: line with green/red regions split by a dashed horizontal at the leftmost visible candle's close
- Refresh the page; the last selection persists (via localStorage).

- [ ] **Step 7: Commit**

```bash
git add src/components/market-chart/ChartHeader.tsx src/components/market-chart/CandlestickChart.tsx
git commit -m "feat(chart-types): dropdown picker in ChartHeader exposes all 7 types"
```

---

## Out of Scope

Per the spec (§"Out of Scope"), these belong to later sub-projects and are NOT in this plan:

- Sub-projects 3-6 (scale modes, status line, scale annotations, canvas customization)
- Moving `chartType` into `chartSettings.symbol`
- User-configurable baseline price (auto-set to first visible close)
- Separate color settings for Line / Area / Baseline (reuses `bodyUpColor` / `bodyDownColor`)
- Showing the chart-type picker in the settings modal (header-only)
