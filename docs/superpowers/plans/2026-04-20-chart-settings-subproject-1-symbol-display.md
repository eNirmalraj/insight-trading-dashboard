# Chart Settings Sub-Project 1 — Symbol Display Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new Symbol-tab controls (candle body width, last price line toggle) plus the migration infrastructure for future sub-projects 2–6, wired to existing Canvas render code.

**Architecture:** Two new fields on `SymbolSettings` persisted via Supabase. A `normaliseSymbolSettings` helper backfills missing fields on load for forward-compatibility with older stored rows. Render code in `CandlestickChart.tsx` (Canvas-based) reads the new fields and gates / scales existing draw calls. UI adds a "Display" subsection to the Symbol tab of `ChartSettingsModal.tsx`.

**Tech Stack:** React + TypeScript, Vite (`pnpm dev` / `pnpm build`), HTML Canvas for chart render, Supabase for settings persistence.

**Spec:** `docs/superpowers/specs/2026-04-20-chart-settings-subproject-1-symbol-display.md`

---

## File Map

| File | Change |
|------|--------|
| `src/components/market-chart/types.ts` | Add `candleBodyWidth`, `showLastPriceLine` to `SymbolSettings` |
| `src/components/market-chart/CandlestickChart.tsx` | Extend `getDefaultChartSettings`; apply width multiplier at line ~2538; change last-price line gate at line ~2576 |
| `src/services/marketStateService.ts` | Export `normaliseSymbolSettings`; call it inside `loadChartSettings` |
| `src/components/market-chart/ChartSettingsModal.tsx` | Add "Display" subsection with 2 controls in `SymbolSettingsComponent` |

---

## Task 1: Extend `SymbolSettings` type and defaults

**Files:**
- Modify: `src/components/market-chart/types.ts` (around line 419)
- Modify: `src/components/market-chart/CandlestickChart.tsx` (around line 134)

This task only changes the type shape and default values. The app still compiles and renders exactly as before; the new fields are defaulted but not yet consumed.

- [ ] **Step 1: Add fields to `SymbolSettings` in `types.ts`**

Find the interface at line 419:

```typescript
export interface SymbolSettings {
    showBody: boolean;
    showBorders: boolean;
    showWick: boolean;
    bodyUpColor: string;
    bodyDownColor: string;
    borderUpColor: string;
    borderDownColor: string;
    wickUpColor: string;
    wickDownColor: string;
    colorBarsOnPrevClose: boolean;
    precision: string;
    timezone: string;
}
```

Replace it with (two new fields appended):

```typescript
export interface SymbolSettings {
    showBody: boolean;
    showBorders: boolean;
    showWick: boolean;
    bodyUpColor: string;
    bodyDownColor: string;
    borderUpColor: string;
    borderDownColor: string;
    wickUpColor: string;
    wickDownColor: string;
    colorBarsOnPrevClose: boolean;
    precision: string;
    timezone: string;
    candleBodyWidth: number;     // 0.5–2.0 multiplier on default 0.7 body-to-slot ratio
    showLastPriceLine: boolean;  // dashed horizontal line at last close
}
```

- [ ] **Step 2: Update `getDefaultChartSettings` in `CandlestickChart.tsx`**

Find `getDefaultChartSettings` at line 134. Its `symbol` block ends at line 148 with `timezone: 'Etc/UTC',`. Add two fields after `timezone`:

```typescript
    symbol: {
        showBody: true,
        showBorders: true,
        showWick: true,
        bodyUpColor: '#089981',
        bodyDownColor: '#f23645',
        borderUpColor: '#089981',
        borderDownColor: '#f23645',
        wickUpColor: '#089981',
        wickDownColor: '#f23645',
        colorBarsOnPrevClose: false,
        precision: 'Default',
        timezone: 'Etc/UTC',
        candleBodyWidth: 1.0,
        showLastPriceLine: true,
    },
```

- [ ] **Step 3: Verify build**

```bash
cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm build 2>&1 | grep -E "error TS" | head -10
```

Expected: no TypeScript errors. If errors appear referencing `SymbolSettings` at other call sites, they point at places that construct `SymbolSettings` literals without the new fields — those need to be added there as well (unlikely in this codebase, but check).

- [ ] **Step 4: Commit**

```bash
git add src/components/market-chart/types.ts src/components/market-chart/CandlestickChart.tsx
git commit -m "feat(chart-settings): add candleBodyWidth + showLastPriceLine to SymbolSettings"
```

---

## Task 2: Add migration helper and wire into `loadChartSettings`

**Files:**
- Modify: `src/services/marketStateService.ts`

The helper normalises any persisted `SymbolSettings` payload (from Supabase or mock) by filling in missing fields with defaults. After this task, legacy Supabase rows lacking the new fields continue to load successfully, with the new fields defaulted.

- [ ] **Step 1: Add `normaliseSymbolSettings` helper at module scope**

Open `src/services/marketStateService.ts`. Find the existing imports block and verify `SymbolSettings` is importable from `../components/market-chart/types`. If not already imported, add it:

```typescript
import type { ChartSettings, SymbolSettings } from '../components/market-chart/types';
```

Then add the helper above `loadChartSettings` (before line 82):

```typescript
/**
 * Normalise persisted SymbolSettings by filling in missing fields with defaults.
 * Handles forward-compatibility with rows saved before new fields were added.
 */
export function normaliseSymbolSettings(
    raw: any,
    defaults: SymbolSettings
): SymbolSettings {
    if (!raw || typeof raw !== 'object') return { ...defaults };
    return {
        ...defaults,
        ...raw,
        candleBodyWidth: typeof raw.candleBodyWidth === 'number'
            ? raw.candleBodyWidth
            : defaults.candleBodyWidth,
        showLastPriceLine: typeof raw.showLastPriceLine === 'boolean'
            ? raw.showLastPriceLine
            : defaults.showLastPriceLine,
    };
}

/**
 * Normalise a full ChartSettings payload by running the sub-normalisers.
 * Accepts defaults for the sub-shapes.
 */
export function normaliseChartSettings(
    raw: any,
    defaults: ChartSettings
): ChartSettings {
    if (!raw || typeof raw !== 'object') return { ...defaults };
    return {
        ...defaults,
        ...raw,
        symbol: normaliseSymbolSettings(raw.symbol, defaults.symbol),
    };
}
```

The wrapper `normaliseChartSettings` gives future sub-projects a single call site to extend when they add more sub-normalisers (e.g., `normaliseCanvasSettings`).

- [ ] **Step 2: Wire the helper into `loadChartSettings`**

The load function currently returns raw JSON from Supabase or mock. Because the function has no direct access to default settings, the CALLER (`CandlestickChart.tsx`) will run the normaliser with its local defaults. That keeps `marketStateService` from importing chart-component internals.

Change only the mock-path return value to pass through the raw shape. The function signature is unchanged. Verify the function still looks like this (no edit needed if it already matches):

```typescript
export const loadChartSettings = async (): Promise<ChartSettings | null> => {
    if (USE_MOCK || !isSupabaseConfigured()) {
        return Object.keys(mockChartSettings).length > 0 ? mockChartSettings : null;
    }

    try {
        const {
            data: { user },
        } = await db().auth.getUser();
        if (!user) return null;

        const { data, error } = await db()
            .from('user_chart_settings')
            .select('settings_json')
            .eq('user_id', user.id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null;
            return null;
        }

        return data.settings_json;
    } catch (error) {
        console.error('Error loading chart settings:', error);
        return null;
    }
};
```

No body change is required for this step — we keep normalisation at the call site so defaults stay owned by the chart component.

- [ ] **Step 3: Apply the normaliser at the call site in `CandlestickChart.tsx`**

Search the file for `loadChartSettings`:

```bash
grep -n "loadChartSettings" src/components/market-chart/CandlestickChart.tsx
```

At the place where its result is assigned to state (typically an `async` effect), wrap with `normaliseChartSettings`. Expected pattern:

Before:
```typescript
const stored = await loadChartSettings();
if (stored) setChartSettings(stored);
```

After:
```typescript
import { loadChartSettings, normaliseChartSettings } from '../../services/marketStateService';

const stored = await loadChartSettings();
const defaults = getDefaultChartSettings(props.symbol);
setChartSettings(stored ? normaliseChartSettings(stored, defaults) : defaults);
```

If the existing pattern differs (e.g., the fallback to defaults is somewhere else), preserve that structure and only insert the `normaliseChartSettings(...)` wrapper around `stored`. The critical invariant: when a non-null `stored` comes back, it must pass through `normaliseChartSettings` before reaching `setChartSettings`.

- [ ] **Step 4: Verify build**

```bash
cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm build 2>&1 | grep -E "error TS" | head -10
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/services/marketStateService.ts src/components/market-chart/CandlestickChart.tsx
git commit -m "feat(chart-settings): add normaliseSymbolSettings + wire into load path"
```

---

## Task 3: Render wiring — apply `candleBodyWidth` and split last-price line gate

**Files:**
- Modify: `src/components/market-chart/CandlestickChart.tsx` (around lines 2538 and 2576)

- [ ] **Step 1: Apply `candleBodyWidth` multiplier to the candle body width**

Find line 2538:

```typescript
const bodyWidth = Math.round(xStep * 0.7);
```

Replace with:

```typescript
const widthMultiplier = chartSettings.symbol.candleBodyWidth ?? 1.0;
const bodyWidth = Math.max(
    1,
    Math.min(xStep, Math.round(xStep * 0.7 * widthMultiplier))
);
```

The `Math.max(1, ...)` clamp prevents the body from disappearing at low multipliers; `Math.min(xStep, ...)` prevents adjacent candles from overlapping at high multipliers.

- [ ] **Step 2: Change the last-price line gate from `showLastPriceLabel` to `showLastPriceLine`**

Find line 2576:

```typescript
if (chartSettings.scalesAndLines.showLastPriceLabel && data.length > 0) {
```

Replace with:

```typescript
if (chartSettings.symbol.showLastPriceLine && data.length > 0) {
```

The block inside (lines 2577–2592) is unchanged — it draws the dashed horizontal line at the last close. The y-axis price label at line 2629 remains gated by `chartSettings.scalesAndLines.showLastPriceLabel` (no change), so the line and label are now independently toggleable.

- [ ] **Step 3: Verify build**

```bash
cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm build 2>&1 | grep -E "error TS" | head -5
```

Expected: no errors.

- [ ] **Step 4: Visual verification**

```bash
pnpm dev
```

Open a chart. With a fresh settings load (or after clearing the Supabase `user_chart_settings` row for your user), the candle body width should be the same as before (multiplier defaults to 1.0) and the dashed last-price line should still be visible (default `showLastPriceLine: true`). This confirms no regression.

- [ ] **Step 5: Commit**

```bash
git add src/components/market-chart/CandlestickChart.tsx
git commit -m "feat(chart-settings): apply candle width multiplier + split last-price-line gate"
```

---

## Task 4: Add "Display" subsection to Symbol tab in `ChartSettingsModal`

**Files:**
- Modify: `src/components/market-chart/ChartSettingsModal.tsx` (inside `SymbolSettingsComponent`, line 182)

- [ ] **Step 1: Insert the Display subsection between Candles and Data Modification**

Find `SymbolSettingsComponent` at line 182. The component currently returns a `<div className="space-y-6">` with two child `<div>` blocks: Candles (line 187) and Data Modification (line 224). Insert a third `<div>` block for "Display" BETWEEN them.

After the closing `</div>` of the Candles section (around line 223), and before the opening `<div>` of Data Modification (line 224), add:

```tsx
        <div>
            <SectionTitle>Display</SectionTitle>
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <label htmlFor="candleBodyWidth" className="text-gray-300">
                        Candle width
                    </label>
                    <select
                        id="candleBodyWidth"
                        value={settings.candleBodyWidth}
                        onChange={(e) => onChange('candleBodyWidth', Number(e.target.value))}
                        className="bg-gray-700 border border-gray-600 rounded-md py-1 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                        <option value={0.5}>Thin (0.5×)</option>
                        <option value={1.0}>Default (1.0×)</option>
                        <option value={1.5}>Wide (1.5×)</option>
                        <option value={2.0}>Extra wide (2.0×)</option>
                    </select>
                </div>
                <CheckboxSettingRow
                    label="Last price line"
                    isChecked={settings.showLastPriceLine}
                    onToggle={(checked) => onChange('showLastPriceLine', checked)}
                />
            </div>
        </div>
```

`SectionTitle` and `CheckboxSettingRow` are existing helpers in the same file (lines 46 and 76). No new imports needed.

- [ ] **Step 2: Verify build**

```bash
cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm build 2>&1 | grep -E "error TS" | head -5
```

Expected: no errors.

- [ ] **Step 3: Visual verification**

```bash
pnpm dev
```

Open the chart settings modal (gear icon in the chart toolbar). On the Symbol tab, a new "Display" subsection should appear between "Candles" and "Data Modification", containing:

- A "Candle width" select with four options (Thin/Default/Wide/Extra wide)
- A "Last price line" checkbox toggle

Test each:
1. Toggle "Last price line" off → the dashed horizontal last-price line disappears; the right-axis price label still shows (if `showLastPriceLabel` is on in Scales tab)
2. Switch "Candle width" to "Thin" → candle bodies become narrower; "Extra wide" → wider. Both should look clean at all zoom levels.

- [ ] **Step 4: Save settings and reload to verify persistence + migration**

1. Set Candle width to "Wide"; toggle "Last price line" off
2. Click "Ok" to save
3. Refresh the page (`F5`)
4. Open settings again → the Symbol tab should show your changes preserved
5. Verify the chart still reflects those settings

This confirms the Supabase save + `normaliseChartSettings` load path works end-to-end.

- [ ] **Step 5: Commit**

```bash
git add src/components/market-chart/ChartSettingsModal.tsx
git commit -m "feat(chart-settings): add Display subsection (candle width, last-price line) to Symbol tab"
```

---

## Out of Scope

Per the spec (§"Out of Scope"), these belong to later sub-projects and are NOT in this plan:

- Sub-project 2 (chart-style switcher: Bars, Hollow Candles, Heikin Ashi, Line, Area)
- Sub-project 3 (scale modes: log / percent / reverse)
- Sub-project 4 (status line full feature set)
- Sub-project 5 (scale annotations: prev-day close, bid/ask, high/low markers)
- Sub-project 6 (canvas: independent V/H grids, crosshair customization, watermark)
- Any restyling of the modal's visual design
