# Chart Settings — Sub-Project 5: Scale Annotations

**Date:** 2026-04-21
**Status:** Approved

## Goal

Add three opt-in visual annotations to the chart: a **previous-day close line** (dashed horizontal at yesterday's UTC close), an **average-close line** (horizontal at the mean of visible closes), and **high/low markers** (triangles at the highest and lowest candles in the visible range). Exposed via the Settings modal (Scales-and-lines tab). All default OFF to avoid cluttering the chart.

## Context

Sub-project 5 of 6 in the Chart Settings expansion. Sub-projects 1–4 shipped Symbol display controls, the chart-type switcher, scale modes, and the status-line feature set.

Out of scope per brainstorming:
- **Bid/ask labels** — would require a new `@bookTicker` WebSocket subscription (the prior one was removed in the 2026-04 signal-engine refactor); meaningful infrastructure work, deferred
- **Pre/post-market session shading** — not applicable to 24/7 crypto markets

The 3 features in scope all compute from `data` + `visibleData` that already exist in `CandlestickChart.tsx`. No new data sources.

---

## State Model

### `types.ts` additions

Extend `ScalesAndLinesSettings`:

```typescript
export interface ScalesAndLinesSettings {
    // ...existing fields...
    showPrevDayCloseLine: boolean;   // horizontal dashed line at yesterday's UTC close
    showAverageCloseLine: boolean;   // horizontal line at mean of visible-range closes
    showHighLowMarkers: boolean;     // ▲ at visible-high candle, ▼ at visible-low candle
}
```

### Defaults (in `getDefaultChartSettings`)

All three default to `false`. Users opt in via the settings modal. Rationale: these annotations each add visual noise; users should choose which they want rather than the chart starting cluttered.

```typescript
showPrevDayCloseLine: false,
showAverageCloseLine: false,
showHighLowMarkers: false,
```

### Migration

Extend the existing `normaliseScalesAndLinesSettings(raw, defaults)` in `src/services/marketStateService.ts` with three lines:

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

No changes to `normaliseChartSettings` (it already delegates to `normaliseScalesAndLinesSettings`).

---

## Render Mechanics

All three render inside the existing HTML-Canvas draw block in `src/components/market-chart/CandlestickChart.tsx`, after the candles and before the crosshair. They use the already-mode-aware `yScale` (from sub-project 3), so they inherit log/percent/reverse behaviour automatically.

### Prev-day close line

Computation helper (memoised):

```typescript
const prevDayClose = useMemo<number | null>(() => {
    if (data.length === 0) return null;
    const latestTime = data[data.length - 1].time;
    const nowUtc = new Date(latestTime * 1000);
    // "Today's UTC midnight" as a unix seconds boundary
    const todayUtcMidnightSec = Math.floor(
        Date.UTC(
            nowUtc.getUTCFullYear(),
            nowUtc.getUTCMonth(),
            nowUtc.getUTCDate()
        ) / 1000
    );
    // Walk backwards: the last candle whose time is strictly BEFORE today's UTC midnight
    for (let i = data.length - 1; i >= 0; i--) {
        if (data[i].time < todayUtcMidnightSec) return data[i].close;
    }
    return null;
}, [data]);
```

Render (inside the canvas draw block):

```typescript
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
```

Y-axis label: inside the right-axis label draw loop (around line 2611), after the existing last-price label, draw a neutral-gray badge at `y = yScale(prevDayClose)` with text `PD ${formatPrice(prevDayClose)}`. Stack-avoidance rule: if `|yPD − yLastPrice| < 12`, shift the PD label's Y by `sign(yPD − yLastPrice) * 14` (moves it further away from the last-price label — above if PD was above, below if PD was below). Clamp the shifted Y to `[0, chartDimensions.height − labelHeight]`.

### Average-close line

Computation helper (memoised on `visibleData` — recomputes as the user pans):

```typescript
const visibleAverageClose = useMemo<number | null>(() => {
    if (visibleData.length === 0) return null;
    let sum = 0;
    for (const c of visibleData) sum += c.close;
    return sum / visibleData.length;
}, [visibleData]);
```

Render:

```typescript
if (chartSettings.scalesAndLines.showAverageCloseLine && visibleAverageClose !== null) {
    const y = Math.round(yScale(visibleAverageClose)) + 0.5;
    chartContext.save();
    chartContext.strokeStyle = '#A78BFA'; // app lavender
    chartContext.lineWidth = 1;
    chartContext.beginPath();
    chartContext.moveTo(0, y);
    chartContext.lineTo(chartDimensions.width, y);
    chartContext.stroke();
    chartContext.restore();
}
```

Y-axis label: `Avg ${formatPrice(visibleAverageClose)}` with the same stack-avoidance rule (both against last-price label and against PD label if both visible).

### High/low markers

Computation helper (memoised on `visibleData`):

```typescript
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

Render (inside canvas draw block, after candle bodies so markers sit on top):

```typescript
if (chartSettings.scalesAndLines.showHighLowMarkers && visibleHighLow) {
    const { highIdx, lowIdx, high, low } = visibleHighLow;
    const highX = indexToX(highIdx + (startIdx - view.startIndex));
    const lowX  = indexToX(lowIdx  + (startIdx - view.startIndex));
    const highY = Math.round(yScale(high));
    const lowY  = Math.round(yScale(low));
    const upColor = chartSettings.symbol.bodyUpColor;
    const downColor = chartSettings.symbol.bodyDownColor;

    // ▲ above the high
    chartContext.fillStyle = upColor;
    chartContext.beginPath();
    chartContext.moveTo(highX, highY - 12);      // apex
    chartContext.lineTo(highX - 5, highY - 4);    // bottom-left
    chartContext.lineTo(highX + 5, highY - 4);    // bottom-right
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

    // Numeric labels (skipped when near canvas edges to avoid clipping)
    const PAD = 4;
    chartContext.fillStyle = '#D1D4DC';
    chartContext.font = '10px "Geist", "Inter", sans-serif';
    chartContext.textAlign = 'center';
    if (highY - 18 >= PAD) {
        chartContext.fillText(formatPrice(high), highX, highY - 16);
    }
    if (lowY + 22 <= chartDimensions.height - PAD) {
        chartContext.fillText(formatPrice(low), lowX, lowY + 22);
    }
}
```

The `(startIdx - view.startIndex)` offset accounts for the existing `indexToX(effectiveIndexInView)` convention used by the candle render loop.

---

## UI (Settings Modal)

In `src/components/market-chart/ChartSettingsModal.tsx`, inside `ScalesAndLinesSettingsComponent`, append three `CheckboxSettingRow`s under the existing "Labels" subsection (around line 303, alongside `Last price label`, `Price labels`, `Countdown to bar close`):

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

No new UI primitives. `CheckboxSettingRow` is the existing helper defined near the top of the file.

Toggles appear in the modal only — NOT in the right-click price-scale context menu (from sub-project 3). That menu stays focused on scale type, reverse, and lock toggles; mixing annotation toggles there would muddy its purpose.

---

## Files Affected

| File | Change |
|------|--------|
| `src/components/market-chart/types.ts` | Add 3 boolean fields to `ScalesAndLinesSettings` |
| `src/components/market-chart/CandlestickChart.tsx` | Defaults; 3 `useMemo` computations; 3 canvas draw blocks gated on flags; Y-axis stack-avoidance for PD + Avg labels |
| `src/services/marketStateService.ts` | Extend `normaliseScalesAndLinesSettings` with 3 new guards |
| `src/components/market-chart/ChartSettingsModal.tsx` | Add 3 `CheckboxSettingRow`s to Scales-and-lines tab |

---

## Migration / Backward Compatibility

Existing Supabase `scalesAndLines` rows lack the 3 new fields. `normaliseScalesAndLinesSettings` returns `false` for each missing field (matching the defaults). On first save, the normalised shape is persisted. No user-visible change for legacy rows — they continue to render as before until the user explicitly toggles an annotation on.

---

## Edge Cases

- **Empty `data`**: all three memos return `null`; render blocks skip cleanly.
- **Symbol switch**: `data` becomes `[]` momentarily during reload; memos re-run on new data; no stale values leak across symbols because `data` is the memo dep.
- **Timezone boundary**: prev-day close uses UTC explicitly. A user in a non-UTC timezone sees the same prev-day as everyone else, which is correct for crypto (markets don't observe local timezones).
- **Candle at exact UTC midnight**: the strict `<` comparison (`data[i].time < todayUtcMidnightSec`) means the first candle of today is NOT treated as yesterday. Correct.
- **Single visible candle**: `visibleAverageClose = close`, `visibleHighLow = { highIdx: 0, lowIdx: 0, high, low }`. Both annotations render at the same price row — not useful but not broken.
- **Markers near canvas edges**: numeric labels are suppressed if they'd clip (pad = 4px). Triangles themselves can clip; acceptable since they're small.
- **Last-price label stacking**: when PD and Avg labels are both visible and close in price, they may partially overlap. A 12-px proximity check against the last-price label is implemented; a full 3-way resolver across all labels (last-price, PD, Avg, crosshair) is out of scope — the common case (one or two labels within 12px) is handled.

---

## Out of Scope

- Bid/ask labels (requires a new `@bookTicker` subscription)
- Pre/post-market session shading (N/A for 24/7 crypto)
- Configurable colors for the 3 annotations (uses fixed palette: `#787B86` for PD, `#A78BFA` for Avg, `bodyUpColor` / `bodyDownColor` for markers)
- User-adjustable N-window or anchor for the average line (always visible range)
- Toggles in the right-click price-scale menu (modal only)
- Sub-project 6 (Canvas customization: independent V/H grid colors, full crosshair customization, watermark)
