# Chart Settings — Sub-Project 2: Chart Type Switcher

**Date:** 2026-04-20
**Status:** Approved

## Goal

Expand the chart's type switcher from the current 2 modes (Candle, Line) to all 7 TradingView-equivalent types: **Bars, Candles, Hollow Candles, Heikin Ashi, Line, Area, Baseline**. Switcher lives in the chart header (existing location) — replaces the toggle button with a dropdown menu.

## Context

This is sub-project **2 of 6** in the larger Chart Settings expansion (sub-project 1 shipped Symbol display controls). Out of scope here: anything in Sub-projects 3–6 (scale modes, status line, scale annotations, canvas customization).

Current state in `src/components/market-chart/CandlestickChart.tsx`:
- `chartType` is component-local state at line 647: `useState<'Candle' | 'Line'>('Candle')`
- Render dispatch is `if (chartType === 'Candle') { ... } else if (chartType === 'Line') { ... }` at line 2503
- `chartType` is included in undo/redo history snapshots (lines 1235, 1257, 1277, 1289, 1300)
- Persisted to localStorage as part of saved chart state (line 1222 reads it)
- ChartHeader (line 338) renders a single toggle button calling `onToggleChartType`

---

## Type Definition

File: `src/components/market-chart/types.ts`

Export a new union type:

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

Note: existing literal `'Candle'` (singular) is renamed to `'Candles'` (plural) to match TradingView's convention. Migration of stored values is handled at load.

---

## State Changes

File: `src/components/market-chart/CandlestickChart.tsx`

- Line 647: change `useState<'Candle' | 'Line'>('Candle')` → `useState<ChartType>('Candles')`
- Line 131 (HistoryState): change `chartType: 'Candle' | 'Line'` → `chartType: ChartType`
- Lines 1235, 1257, 1277, 1289, 1300 (history snapshots): no logic change — they already capture and restore the variable
- Line 1222 (localStorage migration): replace the boolean validity check with a normalizer that handles legacy `'Candle'` and unknown values:

```typescript
const normaliseChartType = (raw: unknown): ChartType => {
    if (raw === 'Candle' || raw === 'Candles') return 'Candles';
    if (raw === 'Line') return 'Line';
    if (raw === 'Bars' || raw === 'Hollow Candles' || raw === 'Heikin Ashi'
        || raw === 'Area' || raw === 'Baseline') return raw;
    return 'Candles';
};

if (savedType !== undefined) {
    setChartType(normaliseChartType(savedType));
}
```

`chartType` does NOT move into `chartSettings.symbol` for this sub-project (deferred — would be a cross-cutting refactor with no user-visible value today).

---

## Heikin Ashi Pre-Computation

A `useMemo` keyed on `data` produces the transformed array. Defined inside `CandlestickChart` near the other memo hooks:

```typescript
const heikinAshiData = useMemo<Candle[]>(() => {
    if (data.length === 0) return [];
    const out: Candle[] = new Array(data.length);
    let prevHaOpen = (data[0].open + data[0].close) / 2;
    let prevHaClose = (data[0].open + data[0].high + data[0].low + data[0].close) / 4;
    out[0] = {
        ...data[0],
        open: prevHaOpen,
        close: prevHaClose,
        high: Math.max(data[0].high, prevHaOpen, prevHaClose),
        low:  Math.min(data[0].low,  prevHaOpen, prevHaClose),
    };
    for (let i = 1; i < data.length; i++) {
        const c = data[i];
        const haClose = (c.open + c.high + c.low + c.close) / 4;
        const haOpen = (prevHaOpen + prevHaClose) / 2;
        const haHigh = Math.max(c.high, haOpen, haClose);
        const haLow  = Math.min(c.low,  haOpen, haClose);
        out[i] = { ...c, open: haOpen, close: haClose, high: haHigh, low: haLow };
        prevHaOpen = haOpen;
        prevHaClose = haClose;
    }
    return out;
}, [data]);
```

Interpretation: when `chartType === 'Heikin Ashi'`, the candle render path consumes `heikinAshiData` instead of `data` for the per-bar OHLC values. All other concerns (color, body-toggle, wick-toggle, borders, width multiplier) reuse the existing candle code path unchanged.

---

## Render Dispatch

File: `src/components/market-chart/CandlestickChart.tsx` around line 2503

Replace the existing `if (chartType === 'Candle') { ... } else if (chartType === 'Line') { ... }` with a `switch (chartType)` over all 7 cases. Each case stays inline in the same draw function (preserves the lexical scope of `chartContext`, `xStep`, `yScale`, `indexToX`, etc.).

### Case `'Candles'` (existing)
Identical to current `'Candle'` branch.

### Case `'Hollow Candles'`
Same as Candles, but the body-fill draw is gated on `!isBullish`:
- Down candle: filled body rect + borders (as today)
- Up candle: borders only, no fill (hollow)
The wick and border code paths are unchanged.

### Case `'Bars'` (OHLC)
Per visible candle, draw 3 line segments using the up/down candle color:
- Vertical: `(x, yScale(d.high)) → (x, yScale(d.low))` — 1px stroke
- Left tick: `(x - tickLen, yScale(d.open)) → (x, yScale(d.open))`
- Right tick: `(x, yScale(d.close)) → (x + tickLen, yScale(d.close))`

Where `tickLen = bodyWidth / 2` using the same `bodyWidth` formula (with `candleBodyWidth` multiplier) from sub-project 1. No body fill, no border, no separate wick toggle (the vertical line IS the bar; suppressing it would leave just the ticks).

### Case `'Heikin Ashi'`
Same as Candles, but iterate `heikinAshiData` instead of `data`. All other rules (body/borders/wick toggles, colors based on isBullish, width multiplier) apply identically.

### Case `'Line'` (existing)
Identical to current `'Line'` branch.

### Case `'Area'`
1. Build the same path as Line (`moveTo`/`lineTo` through `(x, yScale(d.close))` for each visible candle).
2. Continue the path to `(lastX, chartBottomY)` then `(firstX, chartBottomY)` then `closePath()`.
3. Create a `linearGradient` from `(0, top of plot)` to `(0, chartBottomY)`:
   - Stop 0: `bodyUpColor` at alpha 0.3
   - Stop 1: `bodyUpColor` at alpha 0
   Use `chartContext.createLinearGradient()` and `addColorStop` with rgba/hex+alpha conversion (helper inline).
4. Fill the closed path with the gradient.
5. Re-stroke the line on top with `bodyUpColor` solid, lineWidth 1.5.

### Case `'Baseline'`
1. Compute `baselinePrice = visibleData[0].close`. (If `visibleData` is empty, skip render.)
2. Compute `baselineY = yScale(baselinePrice)`.
3. For each consecutive pair of points `(x1, y1)` and `(x2, y2)`:
   - Determine each side relative to baseline (above means `y < baselineY` since y grows downward, which corresponds to price ABOVE baseline)
   - Both above → fill polygon `[(x1,y1), (x2,y2), (x2, baselineY), (x1, baselineY)]` with `bodyUpColor` at alpha 0.25
   - Both below → same polygon shape, `bodyDownColor` at alpha 0.25
   - Crossing (one above, one below) → compute intersection point on `y = baselineY`, split into two trapezoids, each filled with the appropriate color
4. Draw the connecting line over the fill in a neutral color (`#787B86`, lineWidth 1.5)
5. Draw a horizontal dashed reference line at `baselineY` across the full visible width: `#787B86`, lineWidth 1, dash pattern `[4, 4]`.

Helpers used in Area and Baseline (`hexToRgba(hex, alpha)`, segment-baseline intersection) live as module-local functions just above `CandlestickChart` to keep the draw block compact.

---

## ChartHeader UI

File: `src/components/market-chart/ChartHeader.tsx`

### Prop signature change

```typescript
chartType: ChartType;
onChartTypeChange: (next: ChartType) => void;
```

The previous `onToggleChartType: () => void` prop is removed. The wrapper at the call site (`CandlestickChart.tsx` around line 9375) passes `onChartTypeChange={setChartType}` directly.

### Picker menu

Replace the existing single-icon `<HeaderButton>` at line 338 with a dropdown menu. New inline component `ChartTypePickerMenu` defined at the top of `ChartHeader.tsx`:

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
                    onClick={() => { onSelect(type); onClose(); }}
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

The trigger button at line 338 becomes:

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

State `const [chartTypeMenuOpen, setChartTypeMenuOpen] = useState(false);` lives in `ChartHeader`.

---

## New Icons

File: `src/components/IconComponents.tsx`

Add 5 new SVG icon components, all following the existing pattern (`React.FC<{ className?: string }>` with `currentColor` stroke):

- `BarsIcon` — vertical line with two short ticks (left near top, right near bottom)
- `HollowCandlesIcon` — outline rectangle (no fill) with wick line through it
- `HeikinAshiIcon` — three small candle outlines in a row (or a stylized "HA" mark)
- `AreaIcon` — line over a partly-filled area
- `BaselineIcon` — line crossing a horizontal dashed midline; small fills above and below

Existing `CandlesIcon` and `LineChartIcon` are reused as-is.

---

## Files Affected

| File | Change |
|------|--------|
| `src/components/market-chart/types.ts` | Add and export `ChartType` union |
| `src/components/market-chart/CandlestickChart.tsx` | Widen `chartType` state; rename `'Candle'` → `'Candles'`; add `normaliseChartType` for localStorage; add `heikinAshiData` useMemo; replace render branch with switch over 7 cases (5 new render paths); update prop passed to `<ChartHeader>` |
| `src/components/market-chart/ChartHeader.tsx` | Replace `onToggleChartType` prop with `onChartTypeChange`; add `ChartTypePickerMenu` component + open-state; render dropdown |
| `src/components/IconComponents.tsx` | Add `BarsIcon`, `HollowCandlesIcon`, `HeikinAshiIcon`, `AreaIcon`, `BaselineIcon` |

---

## Migration / Backward Compatibility

The localStorage-saved `chartType` field had value `'Candle'` (singular). The new union uses `'Candles'` (plural). The `normaliseChartType` helper maps:
- `'Candle' → 'Candles'`
- `'Candles' → 'Candles'` (idempotent for any future re-saves)
- `'Line' → 'Line'` (unchanged)
- Any of the 5 new values → pass through
- Anything else → `'Candles'` (safe default)

Users with previously saved Line charts continue to load as Line. Users with saved Candle charts load as Candles (visually identical). On their next interaction the renamed value is persisted.

No Supabase migration needed — chart type is stored in browser localStorage, not in `user_chart_settings`.

---

## Out of Scope

- Moving `chartType` into `chartSettings.symbol` (deferred)
- User-configurable baseline price (auto-set to first visible close; no UI to edit)
- Separate color settings for Line / Area / Baseline (reuses `bodyUpColor` / `bodyDownColor` from `SymbolSettings`; a future sub-project may add dedicated colors)
- Showing the chart-type picker in the settings modal (header-only per scope decision)
- Sub-projects 3–6 (scale modes, status line, scale annotations, canvas customization)
