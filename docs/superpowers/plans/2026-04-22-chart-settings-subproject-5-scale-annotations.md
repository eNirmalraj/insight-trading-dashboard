# Chart Settings Sub-Project 5 — Scale Annotations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 3 opt-in chart annotations — prev-day close line (dashed at yesterday's UTC close), average-close line (mean of visible closes), and high/low markers (▲▼ at visible-range extremes) — all toggled from the Settings modal.

**Architecture:** Same sub-project pattern used 1–4: add 3 boolean fields to `ScalesAndLinesSettings`, extend `normaliseScalesAndLinesSettings` with guards, add 3 `useMemo` computations in `CandlestickChart.tsx`, gate 3 new Canvas draw blocks on the flags. Y-axis labels for prev-day and average stack-avoid against the existing last-price label. Defaults are all `false` (opt-in).

**Tech Stack:** React + TypeScript, HTML Canvas, Vite, Supabase settings persistence.

**Spec:** `docs/superpowers/specs/2026-04-21-chart-settings-subproject-5-scale-annotations.md`

---

## File Map

| File | Change |
|------|--------|
| `src/components/market-chart/types.ts` | Add 3 booleans to `ScalesAndLinesSettings` |
| `src/components/market-chart/CandlestickChart.tsx` | Defaults; 3 `useMemo` computations; 3 draw blocks + Y-axis label stacking |
| `src/services/marketStateService.ts` | Extend `normaliseScalesAndLinesSettings` with 3 guards |
| `src/components/market-chart/ChartSettingsModal.tsx` | Add 3 `CheckboxSettingRow`s to Scales-and-lines tab |

---

## Task 1: Types + defaults + migration

**Files:**
- Modify: `src/components/market-chart/types.ts`
- Modify: `src/components/market-chart/CandlestickChart.tsx` (`getDefaultChartSettings` around line 135)
- Modify: `src/services/marketStateService.ts`

After this task: types compile, defaults present, migration helper accepts the new fields. No runtime behavior change.

- [ ] **Step 1: Extend `ScalesAndLinesSettings` in `types.ts`**

Find the `ScalesAndLinesSettings` interface (around line 449 — it already has `scaleType`, `reverseScale`, `lockPriceToBarRatio` from sub-project 3). Append three new boolean fields at the bottom:

```typescript
    showPrevDayCloseLine: boolean;
    showAverageCloseLine: boolean;
    showHighLowMarkers: boolean;
```

- [ ] **Step 2: Update `getDefaultChartSettings` in `CandlestickChart.tsx`**

Find the `scalesAndLines:` block inside `getDefaultChartSettings` (around line 165). Append three fields at the bottom of that block (before the closing `},`):

```typescript
        scaleType: 'Linear',
        reverseScale: false,
        lockPriceToBarRatio: false,
        showPrevDayCloseLine: false,
        showAverageCloseLine: false,
        showHighLowMarkers: false,
```

The first three lines above are unchanged (already present from sub-project 3). The last three are new.

- [ ] **Step 3: Extend `normaliseScalesAndLinesSettings` in `marketStateService.ts`**

Find the existing `normaliseScalesAndLinesSettings`. Its body currently returns an object with `scaleType`, `reverseScale`, `lockPriceToBarRatio` guards. Append three more lines before the closing `};`:

```typescript
        showPrevDayCloseLine: typeof raw.showPrevDayCloseLine === 'boolean'
            ? raw.showPrevDayCloseLine
            : defaults.showPrevDayCloseLine,
        showAverageCloseLine: typeof raw.showAverageCloseLine === 'boolean'
            ? raw.showAverageCloseLine
            : defaults.showAverageCloseLine,
        showHighLowMarkers: typeof raw.showHighLowMarkers === 'boolean'
            ? raw.showHighLowMarkers
            : defaults.showHighLowMarkers,
```

- [ ] **Step 4: Verify build**

```bash
cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm build 2>&1 | grep -E "error TS" | head -10
```

Expected: no errors.

- [ ] **Step 5: Verify scope**

```bash
git status --short
```

Expected: only the 3 files touched.

- [ ] **Step 6: Commit**

```bash
git add src/components/market-chart/types.ts src/components/market-chart/CandlestickChart.tsx src/services/marketStateService.ts
git commit -m "feat(chart-settings): add 3 scale-annotation fields to ScalesAndLinesSettings"
```

---

## Task 2: Settings modal — 3 new checkboxes

**Files:**
- Modify: `src/components/market-chart/ChartSettingsModal.tsx`

After this task: the Scales-and-lines tab has 3 new toggles. They persist via the existing save path but don't render anything in the chart yet (Task 3 + 4 handle that).

- [ ] **Step 1: Find the "Labels" subsection inside `ScalesAndLinesSettingsComponent`**

Open `src/components/market-chart/ChartSettingsModal.tsx` and search for `ScalesAndLinesSettingsComponent`. Its return body contains a "Labels" block with existing `CheckboxSettingRow`s for `Last price label`, `Price labels`, `Countdown to bar close` (around line 303).

- [ ] **Step 2: Append 3 new `CheckboxSettingRow`s inside the Labels block**

At the bottom of the Labels block's inner list (just before its closing `</div>`), add:

```tsx
<CheckboxSettingRow
    label="Prev day close line"
    isChecked={settings.showPrevDayCloseLine}
    onToggle={(v) => onChange('showPrevDayCloseLine', v)}
/>
<CheckboxSettingRow
    label="Average close line"
    isChecked={settings.showAverageCloseLine}
    onToggle={(v) => onChange('showAverageCloseLine', v)}
/>
<CheckboxSettingRow
    label="High/low markers"
    isChecked={settings.showHighLowMarkers}
    onToggle={(v) => onChange('showHighLowMarkers', v)}
/>
```

- [ ] **Step 3: Verify build**

```bash
cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm build 2>&1 | grep -E "error TS" | head -5
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/market-chart/ChartSettingsModal.tsx
git commit -m "feat(chart-settings): add 3 scale-annotation checkboxes to Scales-and-lines tab"
```

---

## Task 3: Compute helpers (3 `useMemo`s)

**Files:**
- Modify: `src/components/market-chart/CandlestickChart.tsx`

After this task: the chart computes prev-day close, visible average close, and visible high/low indices/values on every relevant change. The values aren't rendered yet (Task 4).

- [ ] **Step 1: Add the 3 `useMemo`s near the existing `visibleData` memo**

The existing `visibleData` memo is around line 2202. Just AFTER `visibleData` and BEFORE the `heikinAshiData` memo at line 2208, insert:

```typescript
// Sub-project 5: Scale annotations — computed values gated on their render flags.

const prevDayClose = useMemo<number | null>(() => {
    if (data.length === 0) return null;
    const latest = new Date(data[data.length - 1].time * 1000);
    const todayUtcMidnightSec =
        Math.floor(
            Date.UTC(latest.getUTCFullYear(), latest.getUTCMonth(), latest.getUTCDate()) / 1000
        );
    for (let i = data.length - 1; i >= 0; i--) {
        if (data[i].time < todayUtcMidnightSec) return data[i].close;
    }
    return null;
}, [data]);

const visibleAverageClose = useMemo<number | null>(() => {
    if (visibleData.length === 0) return null;
    let sum = 0;
    for (const c of visibleData) sum += c.close;
    return sum / visibleData.length;
}, [visibleData]);

const visibleHighLow = useMemo<{
    highIdx: number;
    lowIdx: number;
    high: number;
    low: number;
} | null>(() => {
    if (visibleData.length === 0) return null;
    let highIdx = 0;
    let lowIdx = 0;
    let high = visibleData[0].high;
    let low = visibleData[0].low;
    for (let i = 1; i < visibleData.length; i++) {
        if (visibleData[i].high > high) {
            high = visibleData[i].high;
            highIdx = i;
        }
        if (visibleData[i].low < low) {
            low = visibleData[i].low;
            lowIdx = i;
        }
    }
    return { highIdx, lowIdx, high, low };
}, [visibleData]);
```

- [ ] **Step 2: Verify build**

```bash
cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm build 2>&1 | grep -E "error TS" | head -5
```

Expected: no errors (the memos aren't consumed yet, which is fine — TypeScript accepts unused locals).

- [ ] **Step 3: Commit**

```bash
git add src/components/market-chart/CandlestickChart.tsx
git commit -m "feat(chart-settings): add prevDayClose / visibleAverageClose / visibleHighLow memos"
```

---

## Task 4: Render — lines + markers + Y-axis labels

**Files:**
- Modify: `src/components/market-chart/CandlestickChart.tsx`

After this task: all 3 annotations render on the chart when their respective flag is on. Y-axis labels for prev-day close and average-close stack-avoid against the last-price label.

### Step 1: Render the prev-day close dashed line and the average-close solid line

Find the existing last-price dashed line render block (around line 2588):

```typescript
if (chartSettings.symbol.showLastPriceLine && data.length > 0) {
    const lastCandle = data[data.length - 1];
    // ...existing dashed line draw...
}
```

Immediately AFTER this block (before the right-axis label render that starts a few lines later), insert:

```typescript
// Sub-project 5: Prev-day close dashed horizontal line
if (chartSettings.scalesAndLines.showPrevDayCloseLine && prevDayClose !== null) {
    const y = Math.round(yScale(prevDayClose)) + 0.5;
    chartContext.save();
    chartContext.setLineDash([4, 4]);
    chartContext.strokeStyle = '#787B86';
    chartContext.lineWidth = 1;
    chartContext.beginPath();
    chartContext.moveTo(0, y);
    chartContext.lineTo(chartDimensions.width, y);
    chartContext.stroke();
    chartContext.restore();
}

// Sub-project 5: Average-close solid horizontal line
if (chartSettings.scalesAndLines.showAverageCloseLine && visibleAverageClose !== null) {
    const y = Math.round(yScale(visibleAverageClose)) + 0.5;
    chartContext.save();
    chartContext.strokeStyle = '#A78BFA';
    chartContext.lineWidth = 1;
    chartContext.beginPath();
    chartContext.moveTo(0, y);
    chartContext.lineTo(chartDimensions.width, y);
    chartContext.stroke();
    chartContext.restore();
}
```

### Step 2: Render high/low markers (▲▼) inside the main candle draw loop

Find the end of the candle render switch (after the `case 'Baseline':` block, around line 2795). Just AFTER the closing `}` of that switch and BEFORE the last-price dashed line block added by sub-project 1, insert:

```typescript
// Sub-project 5: High/low markers
if (
    chartSettings.scalesAndLines.showHighLowMarkers &&
    visibleHighLow !== null &&
    visibleData.length > 0
) {
    const { highIdx, lowIdx, high, low } = visibleHighLow;
    const highCandleIndexInData = startIdx + highIdx;
    const lowCandleIndexInData = startIdx + lowIdx;
    const highX = indexToX(highCandleIndexInData - view.startIndex);
    const lowX = indexToX(lowCandleIndexInData - view.startIndex);
    const highY = Math.round(yScale(high));
    const lowY = Math.round(yScale(low));
    const upColor = chartSettings.symbol.bodyUpColor;
    const downColor = chartSettings.symbol.bodyDownColor;

    // ▲ above the high
    chartContext.fillStyle = upColor;
    chartContext.beginPath();
    chartContext.moveTo(highX, highY - 12);
    chartContext.lineTo(highX - 5, highY - 4);
    chartContext.lineTo(highX + 5, highY - 4);
    chartContext.closePath();
    chartContext.fill();

    // ▼ below the low
    chartContext.fillStyle = downColor;
    chartContext.beginPath();
    chartContext.moveTo(lowX, lowY + 12);
    chartContext.lineTo(lowX - 5, lowY + 4);
    chartContext.lineTo(lowX + 5, lowY + 4);
    chartContext.closePath();
    chartContext.fill();

    // Numeric labels (suppressed near canvas edges)
    const PAD = 4;
    chartContext.save();
    chartContext.fillStyle = '#D1D4DC';
    chartContext.font = '10px "Geist", "Inter", sans-serif';
    chartContext.textAlign = 'center';
    if (highY - 18 >= PAD) {
        chartContext.fillText(formatPrice(high), highX, highY - 16);
    }
    if (lowY + 22 <= chartDimensions.height - PAD) {
        chartContext.fillText(formatPrice(low), lowX, lowY + 22);
    }
    chartContext.restore();
}
```

`startIdx`, `indexToX`, `view.startIndex`, `formatPrice` are all in scope inside the draw block (same as the existing candle render uses them).

### Step 3: Render Y-axis labels for prev-day close and average-close with stack-avoidance

Find the right-axis label render loop (around line 2611 — the `yAxisLabels.forEach((label) => { yAxisContext.fillText(label.price, 6, label.y + 4); })` block). After this forEach, the existing last-price label renders (around line 2629). AFTER the last-price label render block ends, insert:

```typescript
// Sub-project 5: Y-axis badges for prev-day close and average-close with stack-avoidance
const lastLabelY =
    data.length > 0 && chartSettings.scalesAndLines.showLastPriceLabel
        ? yScale(data[data.length - 1].close)
        : null;

const drawAxisBadge = (price: number, text: string, textColor: string) => {
    let y = yScale(price);
    // Stack-avoidance against last-price label
    if (lastLabelY !== null && Math.abs(y - lastLabelY) < 12) {
        y = lastLabelY + Math.sign(y - lastLabelY || 1) * 14;
    }
    // Clamp within canvas
    y = Math.max(9, Math.min(yAxisDimensions.height - 11, y));
    yAxisContext.fillStyle = '#2A2E39';
    yAxisContext.fillRect(0, y - 9, yAxisDimensions.width, 18);
    yAxisContext.fillStyle = textColor;
    yAxisContext.textAlign = 'left';
    yAxisContext.font = 'bold 11px "Geist", "Inter", sans-serif';
    yAxisContext.fillText(text, 4, y + 3);
};

if (chartSettings.scalesAndLines.showPrevDayCloseLine && prevDayClose !== null) {
    drawAxisBadge(prevDayClose, `PD ${formatPrice(prevDayClose)}`, '#D1D4DC');
}
if (chartSettings.scalesAndLines.showAverageCloseLine && visibleAverageClose !== null) {
    drawAxisBadge(visibleAverageClose, `Avg ${formatPrice(visibleAverageClose)}`, '#C4B5F0');
}
```

### Step 4: Verify build

```bash
cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm build 2>&1 | grep -E "error TS" | head -10
```

Expected: no errors.

### Step 5: Visual smoke test

```bash
pnpm dev
```

Open the chart:
1. Open settings → Scales and lines tab → scroll to "Labels" section → toggle **Prev day close line** ON.  
   Expected: thin dashed gray horizontal line appears at yesterday's close; a `PD <price>` badge appears on the right y-axis (stacking below or above the last-price label).
2. Toggle **Average close line** ON.  
   Expected: thin lavender horizontal line at the mean of the visible closes; recomputes when panning; `Avg <price>` badge on right axis.
3. Toggle **High/low markers** ON.  
   Expected: small green ▲ above the highest candle in view with its high price above it; small red ▼ below the lowest candle with its low price below it. Markers update as you scroll.
4. Toggle each OFF — the corresponding element disappears cleanly.
5. Refresh the page — toggles persist via Supabase + localStorage.

### Step 6: Commit

```bash
git add src/components/market-chart/CandlestickChart.tsx
git commit -m "feat(chart-settings): render prev-day close + avg-close lines + high/low markers + axis badges"
```

---

## Out of Scope

Per the spec (§"Out of Scope"):

- Bid/ask labels (would require a new `@bookTicker` subscription)
- Pre/post-market session shading (N/A for 24/7 crypto)
- Configurable colors for the 3 annotations (fixed palette: `#787B86` PD, `#A78BFA` Avg, up/down colors for markers)
- User-adjustable N-window or anchor for the average line (always visible range)
- Toggles in the right-click price-scale menu (modal only)
- Sub-project 6 (Canvas customization)
