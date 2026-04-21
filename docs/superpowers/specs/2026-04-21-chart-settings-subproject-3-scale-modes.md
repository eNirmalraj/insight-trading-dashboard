# Chart Settings — Sub-Project 3: Scale Modes

**Date:** 2026-04-21
**Status:** Approved

## Goal

Add four scale-related controls to the chart: **Logarithmic** scale, **Percent** scale, **Reverse** scale, and **Lock price-to-bar ratio**. Exposed via the Settings modal (Scales and lines tab) AND a right-click menu on the price scale (Y-axis).

## Context

This is sub-project **3 of 6** in the larger Chart Settings expansion. Sub-projects 1 and 2 shipped Symbol display controls and the chart type switcher.

Current state in `src/components/market-chart/CandlestickChart.tsx`:
- `yScale` (~line 2120) is a centralized linear transform: `(price - min) / (max - min) * height`
- `yToPrice` (~line 2130) is its inverse
- Both are `useMemo`s used by every render path (drawings, candles, indicators, labels, crosshair)
- `priceRange` is component state at line 493; `isAutoScaling` at line 494
- Right-axis labels are rendered via `formatPrice` against the visible-grid prices

Because every consumer flows through `yScale` / `yToPrice`, the new modes are well-bounded: change those two functions and everything downstream renders correctly.

---

## State Model

### `types.ts` additions

Export a `ScaleType` union and extend `ScalesAndLinesSettings`:

```typescript
export type ScaleType = 'Linear' | 'Logarithmic' | 'Percent';

export interface ScalesAndLinesSettings {
    // ...existing fields...
    scaleType: ScaleType;
    reverseScale: boolean;
    lockPriceToBarRatio: boolean;
}
```

### Defaults (in `getDefaultChartSettings`)

```typescript
scaleType: 'Linear',
reverseScale: false,
lockPriceToBarRatio: false,
```

### Migration

Add `normaliseScalesAndLinesSettings(raw, defaults)` next to `normaliseSymbolSettings` in `src/services/marketStateService.ts`. Wire it into the existing `normaliseChartSettings` so old Supabase rows lacking these fields default cleanly.

```typescript
export function normaliseScalesAndLinesSettings(
    raw: any,
    defaults: ScalesAndLinesSettings
): ScalesAndLinesSettings {
    if (!raw || typeof raw !== 'object') return { ...defaults };
    return {
        ...defaults,
        ...raw,
        scaleType:
            raw.scaleType === 'Linear' || raw.scaleType === 'Logarithmic' || raw.scaleType === 'Percent'
                ? raw.scaleType
                : defaults.scaleType,
        reverseScale: typeof raw.reverseScale === 'boolean' ? raw.reverseScale : defaults.reverseScale,
        lockPriceToBarRatio:
            typeof raw.lockPriceToBarRatio === 'boolean'
                ? raw.lockPriceToBarRatio
                : defaults.lockPriceToBarRatio,
    };
}
```

`normaliseChartSettings` already calls `normaliseSymbolSettings`; add a sibling line:

```typescript
scalesAndLines: normaliseScalesAndLinesSettings(raw.scalesAndLines, defaults.scalesAndLines),
```

---

## Scale Transforms (yScale / yToPrice)

Both functions become mode-aware. Anchor for Percent mode = `visibleData[0]?.close` (recomputes as user pans).

### Helper

```typescript
const toScaled = (price: number, anchor: number): number => {
    switch (chartSettings.scalesAndLines.scaleType) {
        case 'Logarithmic':
            // Defensive: if min would be non-positive, this branch isn't entered (see fallback below)
            return Math.log(Math.max(price, Number.EPSILON));
        case 'Percent':
            return anchor > 0 ? (price / anchor - 1) * 100 : 0;
        default:
            return price;
    }
};

const fromScaled = (s: number, anchor: number): number => {
    switch (chartSettings.scalesAndLines.scaleType) {
        case 'Logarithmic':
            return Math.exp(s);
        case 'Percent':
            return anchor > 0 ? anchor * (1 + s / 100) : s;
        default:
            return s;
    }
};
```

### `yScale(price)` (around line 2120)

```typescript
const yScale = useMemo(() => {
    return (price: number) => {
        const { scaleType, reverseScale } = chartSettings.scalesAndLines;
        // Defensive fallback: log scale requires positive prices
        const useLog = scaleType === 'Logarithmic' && priceRange.min > 0;
        const effectiveScaleType: ScaleType = scaleType === 'Logarithmic' && !useLog ? 'Linear' : scaleType;
        const anchor = visibleData[0]?.close ?? priceRange.min;

        const sMin = effectiveScaleType === 'Logarithmic'
            ? Math.log(priceRange.min)
            : effectiveScaleType === 'Percent' && anchor > 0
                ? (priceRange.min / anchor - 1) * 100
                : priceRange.min;
        const sMax = effectiveScaleType === 'Logarithmic'
            ? Math.log(priceRange.max)
            : effectiveScaleType === 'Percent' && anchor > 0
                ? (priceRange.max / anchor - 1) * 100
                : priceRange.max;
        if (sMax === sMin) return chartDimensions.height / 2;

        const sP = effectiveScaleType === 'Logarithmic'
            ? Math.log(Math.max(price, Number.EPSILON))
            : effectiveScaleType === 'Percent' && anchor > 0
                ? (price / anchor - 1) * 100
                : price;

        const t = (sP - sMin) / (sMax - sMin);
        return reverseScale
            ? t * chartDimensions.height
            : chartDimensions.height - t * chartDimensions.height;
    };
}, [chartDimensions.height, priceRange, chartSettings.scalesAndLines, visibleData]);
```

### `yToPrice(y)` (around line 2130)

Inverse of the above. Reads the same settings; computes `t` from `y`, inverts the scale transform.

### Memo deps

The dep array gains `chartSettings.scalesAndLines` and `visibleData`. The `visibleData` dep means `yScale` reidentifies when the user pans (since the percent anchor changes) — acceptable; affects only the leftmost-visible-anchor case.

### Defensive fallback

If `priceRange.min <= 0` and `scaleType === 'Logarithmic'`, fall back silently to Linear. Crypto prices are always positive; this is a safety net for future asset types.

---

## Y-Axis Label Format

In **Percent** mode, the right-axis grid-label ladder shows percent values (e.g. `+12.34%`). All other on-chart price labels (last-price label, crosshair, drawing labels, indicator badges) keep showing raw price — common TradingView behavior.

Add a helper near the existing `formatPrice` call site:

```typescript
const formatScaleLabel = (price: number): string => {
    if (chartSettings.scalesAndLines.scaleType !== 'Percent') return formatPrice(price);
    const anchor = visibleData[0]?.close ?? 0;
    if (anchor <= 0) return formatPrice(price);
    const pct = (price / anchor - 1) * 100;
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(2)}%`;
};
```

In the right-axis label render loop (around line 2611), replace `formatPrice(label.price)` with `formatScaleLabel(label.price)`. Other `formatPrice(...)` call sites (last-price label, crosshair tooltip, etc.) remain unchanged.

---

## Lock Price-to-Bar Ratio

When ON, zooming time auto-adjusts `priceRange` to maintain a constant ratio `pricePerBar = priceRangeHeight / chartDimensions.height × xStep`.

### State

`lockedRatio` lives in a `useRef<number | null>(null)`. When the user toggles lock ON, capture the current ratio:

```typescript
const handleToggleLock = (next: boolean) => {
    if (next) {
        const range = priceRange.max - priceRange.min;
        lockedRatio.current = (range / chartDimensions.height) * xStep;
        setIsAutoScaling(false); // auto-scale would fight the lock
    } else {
        lockedRatio.current = null;
    }
    updateChartSettings({
        scalesAndLines: { ...chartSettings.scalesAndLines, lockPriceToBarRatio: next },
    });
};
```

### Application in time-zoom handlers

Search for places that call `setXStep(...)` or change `view.visibleCandles` (the existing time-zoom paths). After each, if `lockPriceToBarRatio` is true and `lockedRatio.current != null`:

```typescript
if (chartSettings.scalesAndLines.lockPriceToBarRatio && lockedRatio.current != null) {
    const newRangeHeight = (lockedRatio.current / newXStep) * chartDimensions.height;
    const center = (priceRange.min + priceRange.max) / 2;
    setPriceRange({
        min: center - newRangeHeight / 2,
        max: center + newRangeHeight / 2,
    });
}
```

### Snapshot in HistoryState

Add `lockedRatio: number | null` to the `HistoryState` interface. Snapshot logic at lines 1258, 1280, 1300, 1323 captures `lockedRatio.current`. Restore logic at 1289, 1312, 1335 sets `lockedRatio.current = restored.lockedRatio`.

### Out of scope

- Reciprocal coupling (zooming PRICE adjusting xStep). One-way only: time → price.
- Lock+autoscale combined: the toggle handler turns autoscale off when lock turns on. User can manually re-enable autoscale, which effectively un-locks.

---

## UI Surfaces

### A. Settings Modal — Scales and Lines tab

In `ChartSettingsModal.tsx`, add a new "Scale" subsection above the existing "Labels" / "Appearance" sections in `ScalesAndLinesSettingsComponent` (~line 292):

```tsx
<div>
    <SectionTitle>Scale</SectionTitle>
    <div className="space-y-4">
        <div className="flex items-center justify-between">
            <label htmlFor="scaleType" className="text-gray-300">Scale type</label>
            <select
                id="scaleType"
                value={settings.scaleType}
                onChange={(e) => onChange('scaleType', e.target.value as ScaleType)}
                className="bg-gray-700 border border-gray-600 rounded-md py-1 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
                <option value="Linear">Linear</option>
                <option value="Logarithmic">Logarithmic</option>
                <option value="Percent">Percent</option>
            </select>
        </div>
        <CheckboxSettingRow
            label="Reverse scale"
            isChecked={settings.reverseScale}
            onToggle={(v) => onChange('reverseScale', v)}
        />
        <CheckboxSettingRow
            label="Lock price-to-bar ratio"
            isChecked={settings.lockPriceToBarRatio}
            onToggle={(v) => onChange('lockPriceToBarRatio', v)}
        />
    </div>
</div>
```

Reuses existing `SectionTitle` and `CheckboxSettingRow` helpers — no new visual style.

### B. Right-click menu on the price scale (Y-axis)

The Y-axis renders to its own canvas (`yAxisCanvas` — search for the name in `CandlestickChart.tsx`). The host element wrapping it needs an `onContextMenu` handler that opens a popup at the click position.

Menu items (flat list, no submenus):

```
○ Auto-scale          (radio)
─────────────────────
○ Linear scale        (radio — group with the next two)
○ Logarithmic scale   (radio)
○ Percent scale       (radio)
─────────────────────
☐ Reverse scale       (toggle)
☐ Lock price-to-bar   (toggle)
```

Behavior:
- Top "Auto-scale" radio reflects `isAutoScaling` state — clicking toggles it. Note: this is independent of scale-type (autoscale = whether the visible price range auto-fits to data; scale-type = how that range maps to pixels).
- Next 3 radios reflect `chartSettings.scalesAndLines.scaleType`. Click sets the chosen type (calls the same `updateChartSettings` path as the modal).
- Two checkboxes flip `reverseScale` / `lockPriceToBarRatio`. The "Lock" item routes through `handleToggleLock` (capture/release logic from §"Lock Price-to-Bar Ratio").

**Implementation:** new inline component `PriceScaleContextMenu` in `CandlestickChart.tsx` — has access to all relevant state via closure. Uses `useOutsideAlerter` for click-outside-to-close. Position: `style={{ top: e.clientY, left: e.clientX }}` on a `position: fixed` container. Default browser context menu suppressed via `e.preventDefault()` in the host's `onContextMenu`.

---

## Files Affected

| File | Change |
|------|--------|
| `src/components/market-chart/types.ts` | Add `ScaleType` union; extend `ScalesAndLinesSettings` with 3 fields |
| `src/components/market-chart/CandlestickChart.tsx` | Update `getDefaultChartSettings`; modify `yScale` / `yToPrice`; add `formatScaleLabel` and use it in right-axis render; add `lockedRatio` ref + lock logic in time-zoom handlers; add `PriceScaleContextMenu` + onContextMenu wiring; add `lockedRatio` to HistoryState snapshots |
| `src/services/marketStateService.ts` | Add `normaliseScalesAndLinesSettings`; wire into `normaliseChartSettings` |
| `src/components/market-chart/ChartSettingsModal.tsx` | Add "Scale" subsection in `ScalesAndLinesSettingsComponent` |

---

## Migration / Backward Compatibility

Existing Supabase rows have `scalesAndLines` JSON without the three new fields. After this change, `normaliseChartSettings` runs `normaliseScalesAndLinesSettings` which fills missing fields with defaults (`Linear`, `false`, `false`) — preserves current behavior. Next save persists the normalised shape.

The `lockedRatio` ref is in-memory only; not persisted across sessions. If `lockPriceToBarRatio` is `true` on a fresh load, the ref starts as `null`; the first time-zoom handler invocation observes `lockedRatio.current === null`, captures the current ratio (`(priceRange.max - priceRange.min) / chartDimensions.height * xStep`) BEFORE applying the new xStep, then proceeds with the lock-adjustment math against that just-captured ratio. This means the lock effectively anchors to whatever ratio existed at the moment the user first zoomed after loading.

---

## Out of Scope

- User-configurable Percent anchor (always first visible close)
- Reciprocal lock coupling (price-zoom adjusting xStep)
- Indicator label values shown in % during Percent mode (only right-axis ladder changes)
- Y-axis drag-to-scale interactions (existing behavior preserved within whichever mode is active)
- Sub-projects 4–6
