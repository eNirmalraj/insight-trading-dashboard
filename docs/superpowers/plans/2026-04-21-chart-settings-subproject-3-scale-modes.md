# Chart Settings Sub-Project 3 — Scale Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4 scale-related features — Logarithmic scale, Percent scale, Reverse scale, Lock price-to-bar ratio — exposed via the Settings modal and a right-click menu on the price (Y) axis.

**Architecture:** Three new fields on `ScalesAndLinesSettings` persisted via Supabase (migration helper pattern from sub-project 1). The centralized `yScale` / `yToPrice` functions become mode-aware — all downstream renders (candles, drawings, labels, crosshair) inherit the new behavior automatically. Lock-to-bar applies via an effect keyed on `xStep` that adjusts `priceRange`. Right-click menu component lives inline in `CandlestickChart.tsx`.

**Tech Stack:** React + TypeScript, HTML Canvas, Vite, Supabase for settings persistence.

**Spec:** `docs/superpowers/specs/2026-04-21-chart-settings-subproject-3-scale-modes.md`

---

## File Map

| File | Change |
|------|--------|
| `src/components/market-chart/types.ts` | Add `ScaleType` union; 3 new fields on `ScalesAndLinesSettings` |
| `src/components/market-chart/CandlestickChart.tsx` | Defaults; rewrite `yScale` / `yToPrice` mode-aware; add `formatScaleLabel` + use in right-axis render; add `lockedRatio` ref + lock-adjustment effect; add `PriceScaleContextMenu`; wire `onContextMenu` on y-axis host; add `lockedRatio` to HistoryState |
| `src/services/marketStateService.ts` | Add `normaliseScalesAndLinesSettings`; wire into existing `normaliseChartSettings` |
| `src/components/market-chart/ChartSettingsModal.tsx` | Add "Scale" subsection in `ScalesAndLinesSettingsComponent` |

---

## Task 1: Types, defaults, and migration helper

**Files:**
- Modify: `src/components/market-chart/types.ts`
- Modify: `src/components/market-chart/CandlestickChart.tsx` (`getDefaultChartSettings` around line 135)
- Modify: `src/services/marketStateService.ts`

After this task the app compiles with new fields in `ChartSettings`. No runtime behavior change because nothing reads them yet.

- [ ] **Step 1: Add `ScaleType` union and extend `ScalesAndLinesSettings` in `types.ts`**

Find the existing `ScalesAndLinesSettings` interface in `src/components/market-chart/types.ts`. Add:

```typescript
export type ScaleType = 'Linear' | 'Logarithmic' | 'Percent';
```

immediately ABOVE the `ScalesAndLinesSettings` interface. Then append three fields at the bottom of that interface:

```typescript
    scaleType: ScaleType;
    reverseScale: boolean;
    lockPriceToBarRatio: boolean;
```

- [ ] **Step 2: Update `getDefaultChartSettings` in `CandlestickChart.tsx`**

Find the `scalesAndLines:` block inside `getDefaultChartSettings` (around line 150). Append three fields:

```typescript
        scalesAndLines: {
            // ...existing fields kept verbatim...
            scaleType: 'Linear',
            reverseScale: false,
            lockPriceToBarRatio: false,
        },
```

Also add `ScaleType` to the existing `import { ... } from './types';` block near the top of the file (same import line that already pulls `ChartType`).

- [ ] **Step 3: Add `normaliseScalesAndLinesSettings` to `marketStateService.ts`**

Open `src/services/marketStateService.ts`. Near the existing `normaliseSymbolSettings` function, add:

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
            raw.scaleType === 'Linear' ||
            raw.scaleType === 'Logarithmic' ||
            raw.scaleType === 'Percent'
                ? raw.scaleType
                : defaults.scaleType,
        reverseScale:
            typeof raw.reverseScale === 'boolean' ? raw.reverseScale : defaults.reverseScale,
        lockPriceToBarRatio:
            typeof raw.lockPriceToBarRatio === 'boolean'
                ? raw.lockPriceToBarRatio
                : defaults.lockPriceToBarRatio,
    };
}
```

Add `ScalesAndLinesSettings` to the existing type-imports block at the top of the file:

```typescript
import type { ChartSettings, SymbolSettings, ScalesAndLinesSettings } from '../components/market-chart/types';
```

Then find the existing `normaliseChartSettings` function. Its body currently looks like:

```typescript
export function normaliseChartSettings(raw: any, defaults: ChartSettings): ChartSettings {
    if (!raw || typeof raw !== 'object') return { ...defaults };
    return {
        ...defaults,
        ...raw,
        symbol: normaliseSymbolSettings(raw.symbol, defaults.symbol),
    };
}
```

Append the `scalesAndLines` line:

```typescript
export function normaliseChartSettings(raw: any, defaults: ChartSettings): ChartSettings {
    if (!raw || typeof raw !== 'object') return { ...defaults };
    return {
        ...defaults,
        ...raw,
        symbol: normaliseSymbolSettings(raw.symbol, defaults.symbol),
        scalesAndLines: normaliseScalesAndLinesSettings(raw.scalesAndLines, defaults.scalesAndLines),
    };
}
```

- [ ] **Step 4: Verify build**

```bash
cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm build 2>&1 | grep -E "error TS" | head -10
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/market-chart/types.ts src/components/market-chart/CandlestickChart.tsx src/services/marketStateService.ts
git commit -m "feat(chart-settings): add ScaleType union + 3 new scale fields + normaliser"
```

---

## Task 2: Mode-aware `yScale` / `yToPrice` + right-axis label format

**Files:**
- Modify: `src/components/market-chart/CandlestickChart.tsx` (around lines 2120 for `yScale`, 2130 for `yToPrice`, and the right-axis label render around line 2611)

After this task: Linear mode renders identically to before. Setting `scaleType` to `'Logarithmic'` or `'Percent'` in Supabase (or via the modal once Task 4 lands) changes rendering immediately. Right-axis labels show `+X.XX%` in Percent mode.

- [ ] **Step 1: Replace `yScale` body with mode-aware logic**

Find the existing `yScale` useMemo around line 2120:

```typescript
const yScale = useMemo(() => {
    return (price: number) => {
        if (priceRange.max === priceRange.min) return chartDimensions.height / 2;
        return (
            chartDimensions.height -
            ((price - priceRange.min) / (priceRange.max - priceRange.min)) *
                chartDimensions.height
        );
    };
}, [chartDimensions.height, priceRange]);
```

Replace the entire block with:

```typescript
const yScale = useMemo(() => {
    const { scaleType, reverseScale } = chartSettings.scalesAndLines;
    const useLog = scaleType === 'Logarithmic' && priceRange.min > 0;
    const effectiveScaleType: ScaleType =
        scaleType === 'Logarithmic' && !useLog ? 'Linear' : scaleType;
    const anchor = visibleData[0]?.close ?? priceRange.min;

    const computeScaled = (p: number): number => {
        if (effectiveScaleType === 'Logarithmic') return Math.log(Math.max(p, Number.EPSILON));
        if (effectiveScaleType === 'Percent' && anchor > 0) return (p / anchor - 1) * 100;
        return p;
    };

    const sMin = computeScaled(priceRange.min);
    const sMax = computeScaled(priceRange.max);

    return (price: number) => {
        if (sMax === sMin) return chartDimensions.height / 2;
        const sP = computeScaled(price);
        const t = (sP - sMin) / (sMax - sMin);
        return reverseScale
            ? t * chartDimensions.height
            : chartDimensions.height - t * chartDimensions.height;
    };
}, [
    chartDimensions.height,
    priceRange,
    chartSettings.scalesAndLines.scaleType,
    chartSettings.scalesAndLines.reverseScale,
    visibleData,
]);
```

- [ ] **Step 2: Replace `yToPrice` body with mode-aware logic**

Find the existing `yToPrice` useMemo around line 2130:

```typescript
const yToPrice = useMemo(
    () =>
        (y: number): number => {
            if (priceRange.max === priceRange.min) return priceRange.min;
            const chartHeight = chartDimensions.height;
            if (chartHeight <= 0) return 0;
            const priceRangeValue = priceRange.max - priceRange.min;
            const price = priceRange.max - (y / chartHeight) * priceRangeValue;
            return price;
        },
    [chartDimensions.height, priceRange]
);
```

Replace the entire block with:

```typescript
const yToPrice = useMemo(() => {
    const { scaleType, reverseScale } = chartSettings.scalesAndLines;
    const useLog = scaleType === 'Logarithmic' && priceRange.min > 0;
    const effectiveScaleType: ScaleType =
        scaleType === 'Logarithmic' && !useLog ? 'Linear' : scaleType;
    const anchor = visibleData[0]?.close ?? priceRange.min;

    const computeScaled = (p: number): number => {
        if (effectiveScaleType === 'Logarithmic') return Math.log(Math.max(p, Number.EPSILON));
        if (effectiveScaleType === 'Percent' && anchor > 0) return (p / anchor - 1) * 100;
        return p;
    };
    const fromScaled = (s: number): number => {
        if (effectiveScaleType === 'Logarithmic') return Math.exp(s);
        if (effectiveScaleType === 'Percent' && anchor > 0) return anchor * (1 + s / 100);
        return s;
    };

    const sMin = computeScaled(priceRange.min);
    const sMax = computeScaled(priceRange.max);

    return (y: number): number => {
        if (priceRange.max === priceRange.min) return priceRange.min;
        const chartHeight = chartDimensions.height;
        if (chartHeight <= 0) return 0;
        const t = reverseScale ? y / chartHeight : 1 - y / chartHeight;
        const sP = sMin + t * (sMax - sMin);
        return fromScaled(sP);
    };
}, [
    chartDimensions.height,
    priceRange,
    chartSettings.scalesAndLines.scaleType,
    chartSettings.scalesAndLines.reverseScale,
    visibleData,
]);
```

- [ ] **Step 3: Add `formatScaleLabel` helper**

Search for the existing `formatPrice` function in `CandlestickChart.tsx` (it's a helper used all over — search `const formatPrice`). Immediately below its definition (or below the `yToPrice` useMemo, whichever is closer to the right-axis render), add:

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

- [ ] **Step 4: Use `formatScaleLabel` in the right-axis render**

Search for `formatPrice(label.price)` around line 2611. The existing loop looks like:

```typescript
yAxisLabels.forEach((label) => {
    yAxisContext.fillText(label.price, 6, label.y + 4);
});
```

Wait — the existing code calls `fillText(label.price, ...)` where `label.price` is already a formatted STRING. Check the surrounding code that builds `yAxisLabels` — it's likely something like `yAxisLabels.push({ price: formatPrice(p), y })`. Find that push site (search `yAxisLabels.push`). Replace the `formatPrice(...)` call there with `formatScaleLabel(...)`. Example:

```typescript
// Before:
yAxisLabels.push({ price: formatPrice(p), y });
// After:
yAxisLabels.push({ price: formatScaleLabel(p), y });
```

Other `formatPrice` call sites (last-price label around line 2647, crosshair label around line 2712, etc.) remain UNCHANGED — per spec, only the right-axis ladder shows percent in Percent mode.

- [ ] **Step 5: Verify build**

```bash
cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm build 2>&1 | grep -E "error TS" | head -10
```

Expected: no errors.

- [ ] **Step 6: Visual smoke test** (optional — skipped if you want to batch verification into Task 4)

Temporarily change the default `scaleType` in `getDefaultChartSettings` from `'Linear'` to `'Logarithmic'`, run `pnpm dev`, open a chart — candles should still render correctly but spacing between prices will be non-linear. Revert the default before committing.

- [ ] **Step 7: Commit**

```bash
git add src/components/market-chart/CandlestickChart.tsx
git commit -m "feat(chart-settings): mode-aware yScale/yToPrice + percent right-axis labels"
```

---

## Task 3: Lock price-to-bar ratio (ref + effect + history snapshot)

**Files:**
- Modify: `src/components/market-chart/CandlestickChart.tsx`

After this task: toggling `lockPriceToBarRatio` (programmatically for now; the UI toggle lands in Task 4) auto-adjusts `priceRange` whenever the user zooms time, preserving the ratio captured at toggle-on.

- [ ] **Step 1: Add `lockedRatio` ref**

In `CandlestickChart.tsx`, find the other `useRef` declarations in the component body (search `useRef<` in the opening ~500 lines of the component). Add:

```typescript
const lockedRatio = useRef<number | null>(null);
```

- [ ] **Step 2: Add `lockedRatio` to HistoryState**

Find the `HistoryState` interface around line 128:

```typescript
interface HistoryState {
    drawings: Drawing[];
    indicators: Indicator[];
    view: { startIndex: number; visibleCandles: number };
    priceRange: { min: number; max: number } | null;
    isAutoScaling: boolean;
    chartType: ChartType;
}
```

Append `lockedRatio: number | null;` as a new field.

- [ ] **Step 3: Capture `lockedRatio` in each snapshot site**

Find the four `HistoryState` construction sites (lines ~1258, 1280, 1300, 1323). Each looks like:

```typescript
const currentState: HistoryState = {
    drawings: JSON.parse(JSON.stringify(drawings)),
    indicators: JSON.parse(JSON.stringify(allActiveIndicators)),
    view: { ...view },
    priceRange: priceRange ? { ...priceRange } : null,
    isAutoScaling,
    chartType,
};
```

Append `lockedRatio: lockedRatio.current,` to each of the four objects.

- [ ] **Step 4: Restore `lockedRatio` in each load site**

Find the three history-load sites (around lines 1289, 1312, 1335). Each has statements like:

```typescript
setDrawings(newState.drawings);
setAllActiveIndicators(newState.indicators);
setView(newState.view);
setPriceRange(newState.priceRange ?? { min: 0, max: 0 });
setIsAutoScaling(newState.isAutoScaling);
setChartType(newState.chartType);
```

After the `setChartType(...)` line in each, add:

```typescript
lockedRatio.current = newState.lockedRatio;
```

(Use the actual variable name from that block — the restore-state variable is called `newState` / `previousState` / `nextState` in the three sites respectively. Match each.)

- [ ] **Step 5: Add the lock-adjustment effect**

Find a good location in the component body, near the existing effects related to `priceRange` or `view` (search `useEffect` in the 2000-3000 line range). Add:

```typescript
// Lock price-to-bar ratio: when time-zoom changes xStep, adjust priceRange to hold the ratio constant.
useEffect(() => {
    if (!chartSettings.scalesAndLines.lockPriceToBarRatio) {
        lockedRatio.current = null;
        return;
    }
    if (chartDimensions.height <= 0 || xStep <= 0) return;
    const currentRatio = ((priceRange.max - priceRange.min) / chartDimensions.height) * xStep;
    if (lockedRatio.current === null) {
        // First observation after lock turned on — capture the current ratio and exit.
        lockedRatio.current = currentRatio;
        return;
    }
    // If xStep changed, adjust priceRange so the ratio stays equal to lockedRatio.
    const targetRangeHeight = (lockedRatio.current / xStep) * chartDimensions.height;
    const currentRangeHeight = priceRange.max - priceRange.min;
    if (Math.abs(targetRangeHeight - currentRangeHeight) < 1e-6) return; // no-op
    const center = (priceRange.min + priceRange.max) / 2;
    setPriceRange({
        min: center - targetRangeHeight / 2,
        max: center + targetRangeHeight / 2,
    });
}, [xStep, chartDimensions.height, chartSettings.scalesAndLines.lockPriceToBarRatio]);
```

Note: this effect does NOT list `priceRange` as a dep — that's intentional. We don't want the effect to re-run when priceRange changes (the effect itself changes priceRange, which would cause a loop). The effect reads the CURRENT priceRange via closure (stale-read tolerated because we only care about the ratio during the moment of xStep change).

- [ ] **Step 6: Effect interaction with autoScale**

The spec says when lock turns ON, auto-scale should turn OFF (they'd fight each other). The UI toggles for lock land in Task 4 (modal) and Task 5 (right-click menu), and each of those tasks' toggle handlers calls `setIsAutoScaling(false)` when turning lock on. The effect in this task does NOT attempt to disable autoscale itself — it just runs, and if the user has autoscale on, the lock's priceRange update and autoscale's priceRange update will race until the user disables one.

(No code change in this step — just documenting that the autoscale-off wiring lives in Task 5 Step 4's menu `onLockToggle` handler and Task 5 Step 5's modal parent wiring.)

- [ ] **Step 7: Verify build**

```bash
cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm build 2>&1 | grep -E "error TS" | head -10
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/market-chart/CandlestickChart.tsx
git commit -m "feat(chart-settings): lock-price-to-bar ratio (ref + effect + history)"
```

---

## Task 4: Settings modal UI — "Scale" subsection

**Files:**
- Modify: `src/components/market-chart/ChartSettingsModal.tsx`

After this task: Scales-and-Lines tab has a new "Scale" section with the 3 controls. Turning Lock on also turns off autoscale.

- [ ] **Step 1: Update imports in `ChartSettingsModal.tsx`**

Find the existing import from `./types` at the top. Add `ScaleType`:

```typescript
import { ... existing types ..., ScaleType } from './types';
```

- [ ] **Step 2: Insert "Scale" subsection into `ScalesAndLinesSettingsComponent`**

Find `ScalesAndLinesSettingsComponent` around line 292. Its return body currently starts with:

```tsx
<div className="space-y-6">
    <div>
        <SectionTitle>Labels</SectionTitle>
        ...
```

Insert a new `<div>` block for "Scale" BEFORE the `<SectionTitle>Labels</SectionTitle>` block. The final return structure should be:

```tsx
<div className="space-y-6">
    <div>
        <SectionTitle>Scale</SectionTitle>
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <label htmlFor="scaleType" className="text-gray-300">
                    Scale type
                </label>
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
    <div>
        <SectionTitle>Labels</SectionTitle>
        {/* ...existing Labels block kept verbatim... */}
    </div>
    <div>
        <SectionTitle>Appearance</SectionTitle>
        {/* ...existing Appearance block kept verbatim... */}
    </div>
</div>
```

The existing Labels and Appearance blocks stay exactly as they were — only the new Scale block is added at the top.

- [ ] **Step 3: Verify build**

```bash
cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm build 2>&1 | grep -E "error TS" | head -10
```

Expected: no errors.

- [ ] **Step 4: Visual test**

```bash
pnpm dev
```

- Open the chart settings modal → Scales and lines tab. Confirm the new Scale section is at the top with 3 controls (Scale type dropdown, Reverse scale checkbox, Lock price-to-bar checkbox).
- Change Scale type to **Logarithmic** → chart re-renders with log scaling (candles near the top of the visible range are closer together; bottom ones spread out).
- Change to **Percent** → right-axis labels now show `+X.XX%` / `-X.XX%` format.
- Toggle **Reverse scale** → Y axis flips (highs at bottom, lows at top).
- Toggle **Lock price-to-bar ratio** → subsequent time-zoom (scroll/pinch) auto-adjusts vertical price range. Note the Task 3 header note: if autoscale is on, it may fight the lock. This is addressed when the right-click menu's Lock toggle also calls `setIsAutoScaling(false)` in Task 5.

- [ ] **Step 5: Commit**

```bash
git add src/components/market-chart/ChartSettingsModal.tsx
git commit -m "feat(chart-settings): Scale subsection in Scales and lines tab (modal UI)"
```

---

## Task 5: Right-click menu on the price scale

**Files:**
- Modify: `src/components/market-chart/CandlestickChart.tsx`

After this task: right-clicking the Y-axis opens a popup menu with Auto-scale radio, 3 scale-type radios, and 2 toggle checkboxes. Same settings as the modal but faster to reach.

- [ ] **Step 1: Add menu state**

In the `CandlestickChart` component body, near the other `useState` hooks, add:

```typescript
const [priceScaleMenu, setPriceScaleMenu] = useState<{ x: number; y: number } | null>(null);
```

(null = closed; when set, rendered at the given client coords.)

- [ ] **Step 2: Define `PriceScaleContextMenu` component**

Above the `CandlestickChart` component declaration (near where `normaliseChartType` / `hexToRgba` live from sub-project 2), add this inline component:

```tsx
interface PriceScaleContextMenuProps {
    x: number;
    y: number;
    isAutoScaling: boolean;
    scaleType: ScaleType;
    reverseScale: boolean;
    lockPriceToBarRatio: boolean;
    onAutoScaleToggle: () => void;
    onScaleTypeChange: (next: ScaleType) => void;
    onReverseToggle: () => void;
    onLockToggle: () => void;
    onClose: () => void;
}

const PriceScaleContextMenu: React.FC<PriceScaleContextMenuProps> = ({
    x,
    y,
    isAutoScaling,
    scaleType,
    reverseScale,
    lockPriceToBarRatio,
    onAutoScaleToggle,
    onScaleTypeChange,
    onReverseToggle,
    onLockToggle,
    onClose,
}) => {
    const ref = useRef<HTMLDivElement>(null);
    useOutsideAlerter(ref, onClose);
    const radio = (active: boolean) => (active ? '●' : '○');
    const check = (active: boolean) => (active ? '☑' : '☐');
    const rowClass =
        'flex items-center w-full px-3 py-2 text-sm text-left text-gray-300 hover:bg-gray-800 transition-colors';
    return (
        <div
            ref={ref}
            style={{ position: 'fixed', top: y, left: x, zIndex: 50 }}
            className="bg-[#1f1f1f] border border-gray-700 rounded-lg shadow-lg py-1 min-w-[220px]"
        >
            <button
                className={rowClass}
                onClick={() => {
                    onAutoScaleToggle();
                    onClose();
                }}
            >
                <span className="w-5 text-[#c4b5f0]">{radio(isAutoScaling)}</span>
                Auto-scale
            </button>
            <div className="my-1 h-px bg-gray-700" />
            {(['Linear', 'Logarithmic', 'Percent'] as ScaleType[]).map((t) => (
                <button
                    key={t}
                    className={rowClass}
                    onClick={() => {
                        onScaleTypeChange(t);
                        onClose();
                    }}
                >
                    <span className="w-5 text-[#c4b5f0]">{radio(scaleType === t)}</span>
                    {t} scale
                </button>
            ))}
            <div className="my-1 h-px bg-gray-700" />
            <button
                className={rowClass}
                onClick={() => {
                    onReverseToggle();
                    onClose();
                }}
            >
                <span className="w-5 text-[#c4b5f0]">{check(reverseScale)}</span>
                Reverse scale
            </button>
            <button
                className={rowClass}
                onClick={() => {
                    onLockToggle();
                    onClose();
                }}
            >
                <span className="w-5 text-[#c4b5f0]">{check(lockPriceToBarRatio)}</span>
                Lock price-to-bar
            </button>
        </div>
    );
};
```

If `useOutsideAlerter` isn't already imported in `CandlestickChart.tsx`, add it:

```typescript
import { useOutsideAlerter } from './hooks';
```

- [ ] **Step 3: Add an `onContextMenu` handler for the Y-axis host**

Find the element wrapping the `yAxisCanvas` (search `yAxisCanvasRef`). The canvas itself can't receive context menu events reliably in some browsers — the containing `<div>` is the target. Add `onContextMenu` and `style` to that wrapper. Example JSX:

```tsx
<div
    className="..." // existing classes unchanged
    onContextMenu={(e) => {
        e.preventDefault();
        setPriceScaleMenu({ x: e.clientX, y: e.clientY });
    }}
>
    <canvas ref={yAxisCanvasRef} ... />
</div>
```

If the existing wrapper already has an `onContextMenu`, chain onto it (don't clobber).

- [ ] **Step 4: Render the menu + wire the callbacks**

In the CandlestickChart return JSX, near the bottom (alongside other floating panels / modals), add:

```tsx
{priceScaleMenu && (
    <PriceScaleContextMenu
        x={priceScaleMenu.x}
        y={priceScaleMenu.y}
        isAutoScaling={isAutoScaling}
        scaleType={chartSettings.scalesAndLines.scaleType}
        reverseScale={chartSettings.scalesAndLines.reverseScale}
        lockPriceToBarRatio={chartSettings.scalesAndLines.lockPriceToBarRatio}
        onAutoScaleToggle={() => setIsAutoScaling((v) => !v)}
        onScaleTypeChange={(next) => {
            setChartSettings((prev) => ({
                ...prev,
                scalesAndLines: { ...prev.scalesAndLines, scaleType: next },
            }));
        }}
        onReverseToggle={() => {
            setChartSettings((prev) => ({
                ...prev,
                scalesAndLines: {
                    ...prev.scalesAndLines,
                    reverseScale: !prev.scalesAndLines.reverseScale,
                },
            }));
        }}
        onLockToggle={() => {
            setChartSettings((prev) => {
                const nextLock = !prev.scalesAndLines.lockPriceToBarRatio;
                return {
                    ...prev,
                    scalesAndLines: { ...prev.scalesAndLines, lockPriceToBarRatio: nextLock },
                };
            });
            // Turning lock ON — disable autoscale to prevent conflict (per spec §"Lock Price-to-Bar Ratio")
            if (!chartSettings.scalesAndLines.lockPriceToBarRatio) {
                setIsAutoScaling(false);
            }
        }}
        onClose={() => setPriceScaleMenu(null)}
    />
)}
```

Note: `setChartSettings` is the existing state setter; verify it's in scope. If settings live under a different state name, use that (search `setChartSettings(` in the file to confirm).

- [ ] **Step 5: Also disable autoscale when Lock is turned ON via the modal**

Go back to `ChartSettingsModal.tsx`'s `ScalesAndLinesSettingsComponent` (from Task 4). The `CheckboxSettingRow` for "Lock price-to-bar ratio" currently does:

```tsx
onToggle={(v) => onChange('lockPriceToBarRatio', v)}
```

The modal doesn't have direct access to `setIsAutoScaling` — but `ChartSettingsModal` receives `settings: ChartSettings` and `onSave: (next: ChartSettings) => void`. It does NOT control top-level component state beyond settings. So the modal can't toggle autoscale directly.

Solution: handle the autoscale-off side-effect at the PARENT (the place that owns `isAutoScaling`). Find where the modal's changes land — search the file for the `ChartSettingsModal` JSX usage. Its `onSave` or equivalent callback receives the new settings. Before calling `setChartSettings(newSettings)`, check:

```typescript
if (
    newSettings.scalesAndLines.lockPriceToBarRatio &&
    !chartSettings.scalesAndLines.lockPriceToBarRatio
) {
    setIsAutoScaling(false);
}
```

If the modal uses a per-field `onChange` (the simpler pattern), wire this at the `onChange` handler site instead.

- [ ] **Step 6: Verify build**

```bash
cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm build 2>&1 | grep -E "error TS" | head -10
```

Expected: no errors.

- [ ] **Step 7: Visual test**

```bash
pnpm dev
```

- Right-click on the Y axis (price scale) → menu appears at cursor
- Click "Logarithmic scale" → menu closes; chart switches to log scale. Reopen the menu → "Logarithmic scale" row shows the filled ● radio
- Click "Linear scale" → back to linear
- Toggle "Reverse scale" → Y axis flips
- Toggle "Lock price-to-bar" → lock turns on; auto-scale turns off automatically. Zoom time (scroll horizontally) → price range adjusts proportionally
- Click outside the menu → menu closes
- All three controls stay in sync with the modal's controls (open settings → same values shown)

- [ ] **Step 8: Commit**

```bash
git add src/components/market-chart/CandlestickChart.tsx src/components/market-chart/ChartSettingsModal.tsx
git commit -m "feat(chart-settings): right-click menu on price scale (log/percent/reverse/lock)"
```

---

## Out of Scope

Per the spec (§"Out of Scope"):

- User-configurable Percent anchor (always first visible close)
- Reciprocal lock coupling (zooming PRICE adjusting xStep)
- Indicator value labels shown in % during Percent mode (only right-axis ladder changes)
- Y-axis drag-to-scale interactions (existing wheel/drag kept; work within whichever mode is active)
- Sub-projects 4-6
