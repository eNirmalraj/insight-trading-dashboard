# Indicator Settings Panel Rebuild

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `indicator.settings` the single source of truth for all user-chosen values (inputs AND styles), eliminating the override/sync pattern that causes style changes to not reach the chart.

**Architecture:** The settings panel reads initial values from `indicator.settings` (falling back to `kuriPlots` defaults), writes directly to `indicator.settings` using keys the chart renderer already understands, and the chart renderer reads from `indicator.settings`. `kuriPlots` becomes read-only engine metadata — never mutated by user choices, never used as a source for user-set colors.

**Tech Stack:** React, TypeScript

---

## Root Cause Analysis

The current system has three disconnects:

1. **Settings panel writes plot colors as camelCase keys** (`smaColor`, `smaLinewidth`) via `buildMergedSettings`, but the chart renderer reads hardcoded keys (`settings.color`, `settings.lineWidth`).

2. **`handleUpdateIndicator` re-runs Kuri engine and overwrites `kuriPlots`** from engine output, discarding user color choices. When the settings panel re-opens, it initializes from `kuriPlots` (engine defaults), not from `settings`.

3. **No single source of truth** — values bounce between `kuriPlots`, `settings`, override maps, and legacy key mappings. Each hop loses information.

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/components/market-chart/IndicatorSettingsPanel.tsx` | **Rewrite** | Read/write directly to `indicator.settings` using plot-indexed keys (`plot_0_color`, `plot_0_linewidth`, `hline_0_color`, `hline_0_linestyle`). No override maps. |
| `src/components/market-chart/CandlestickChart.tsx` | **Modify** | `handleUpdateIndicator`: stop overwriting `kuriPlots` with engine colors. Overlay rendering: read per-plot colors from `settings.plot_N_color` with fallback to `kuriPlots[N].color`. |
| `src/components/market-chart/types.ts` | **No change** | `IndicatorSettings` already allows arbitrary keys via `(settings as any)`. No type change needed. |

## Key Design Decisions

### Plot Style Key Convention

Every plot gets indexed keys in `settings`:
- `plot_0_color`, `plot_0_linewidth`, `plot_0_visible`
- `plot_1_color`, `plot_1_linewidth`, `plot_1_visible`
- `hline_0_color`, `hline_0_linestyle`, `hline_0_visible`

**Why indexed instead of title-based:** Plot titles can have spaces, special chars, and duplicates. Indices are stable and unambiguous. The index matches `kuriPlots` array position.

### Settings Panel Reads From `settings`, Falls Back to `kuriPlots`

```
displayed value = settings[`plot_${i}_color`] ?? kuriPlots[i].color
```

### Chart Renderer Reads From `settings`, Falls Back to `kuriPlots`

Same pattern. Single code path. No sync needed.

### `kuriPlots` Is Read-Only Engine Metadata

`handleUpdateIndicator` still re-runs the Kuri engine and updates `kuriPlots` from engine output. But this is fine — `kuriPlots` only stores engine defaults for fallback. User choices live in `settings` and are never overwritten by engine re-runs.

### Legacy Compatibility

Hardcoded indicator renderers (MACD, Stochastic, BB) already read from specific `settings` keys (`macdColor`, `kColor`, `upperColor`). The settings panel must also write to these legacy keys when the Kuri `titleToLegacy` mapping matches. This is already done for input values — we extend it to style values.

---

## Tasks

### Task 1: Rebuild IndicatorSettingsPanel — Inputs Tab

**Files:**
- Rewrite: `src/components/market-chart/IndicatorSettingsPanel.tsx`

The Inputs tab works correctly today. We keep the same UI but eliminate the `kuriOverrides` state map. Instead, read/write directly to a local copy of `settings`.

- [ ] **Step 1: Replace state model**

Remove the three override state maps (`kuriOverrides`, `plotOverrides`, `hlineOverrides`) and the `buildMergedSettings` helper. Replace with a single `localSettings` state initialized from `indicator.settings`:

```tsx
const [localSettings, setLocalSettings] = useState<IndicatorSettings>(() => ({
    ...indicator.settings,
}));
```

- [ ] **Step 2: Rewrite input change handler**

When a Kuri input changes, write to `localSettings` under both the exact title key AND the legacy key (using the existing `titleToLegacy` map from CandlestickChart):

```tsx
const TITLE_TO_LEGACY: Record<string, string> = {
    Length: 'period',
    'RSI Length': 'period',
    'ATR Period': 'period',
    Source: 'source',
    StdDev: 'stdDev',
    'BB StdDev': 'stdDev',
    'Fast Length': 'fastPeriod',
    'Slow Length': 'slowPeriod',
    'Signal Smoothing': 'signalPeriod',
    '%K Length': 'kPeriod',
    '%K Smoothing': 'kSlowing',
    '%D Smoothing': 'dPeriod',
    Factor: 'factor',
    'ATR Length': 'atrPeriod',
};

const handleInputChange = useCallback((title: string, value: any) => {
    setLocalSettings(prev => {
        const next = { ...prev } as any;
        // Store by exact title (for Kuri re-runs)
        next[title] = value;
        // Store by camelCase key (for settings panel restore)
        const camelKey = title.replace(/[^a-zA-Z0-9]/g, '').replace(/^./, c => c.toLowerCase());
        next[camelKey] = value;
        // Store by legacy key (for core-ta and chart rendering)
        const legacyKey = TITLE_TO_LEGACY[title];
        if (legacyKey) next[legacyKey] = value;
        return next as IndicatorSettings;
    });
    debouncedEmit();
}, [debouncedEmit]);
```

- [ ] **Step 3: Rewrite live emit**

The debounced emit just sends `localSettings` directly:

```tsx
const debouncedEmit = useCallback(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
        onSave(indicator.id, localSettingsRef.current);
    }, 120);
}, [indicator.id, onSave]);
```

Use a ref to always get the latest settings:

```tsx
const localSettingsRef = useRef(localSettings);
localSettingsRef.current = localSettings;
```

- [ ] **Step 4: Update KuriInputWidget value source**

The `KuriInputWidget` value prop reads from `localSettings` instead of the override map:

```tsx
<KuriInputWidget
    def={def}
    value={restoreInputFromSettings(def, localSettings)}
    onChange={(v) => handleInputChange(def.title, v)}
/>
```

`restoreInputFromSettings` is the existing `restoreOverrideFromSettings` function renamed — it checks exact title, then camelCase, then `def.defval`.

- [ ] **Step 5: Update reset handler**

Reset writes Kuri defaults back into `localSettings`:

```tsx
const handleReset = useCallback(() => {
    setLocalSettings(prev => {
        const next = { ...prev } as any;
        // Reset inputs to Kuri defaults
        if (indicator.kuriInputDefs) {
            for (const def of indicator.kuriInputDefs) {
                next[def.title] = def.defval;
                const camelKey = def.title.replace(/[^a-zA-Z0-9]/g, '').replace(/^./, c => c.toLowerCase());
                next[camelKey] = def.defval;
                const legacyKey = TITLE_TO_LEGACY[def.title];
                if (legacyKey) next[legacyKey] = def.defval;
            }
        }
        // Reset plot styles to engine defaults
        if (indicator.kuriPlots) {
            indicator.kuriPlots.forEach((p, i) => {
                next[`plot_${i}_color`] = p.color;
                next[`plot_${i}_linewidth`] = p.linewidth;
                next[`plot_${i}_visible`] = true;
            });
            // Sync first plot color to legacy color key
            if (indicator.kuriPlots.length > 0) {
                next.color = indicator.kuriPlots[0].color;
            }
        }
        // Reset hline styles to engine defaults
        if (indicator.kuriHlines) {
            indicator.kuriHlines.forEach((h, i) => {
                next[`hline_${i}_color`] = h.color;
                next[`hline_${i}_linestyle`] = 'solid';
                next[`hline_${i}_visible`] = true;
            });
        }
        return next as IndicatorSettings;
    });
    setTimeout(debouncedEmit, 0);
}, [indicator, debouncedEmit]);
```

- [ ] **Step 6: Commit**

```bash
git add src/components/market-chart/IndicatorSettingsPanel.tsx
git commit -m "refactor(settings-panel): replace override maps with direct settings read/write for inputs"
```

---

### Task 2: Rebuild IndicatorSettingsPanel — Style Tab

**Files:**
- Modify: `src/components/market-chart/IndicatorSettingsPanel.tsx`

- [ ] **Step 1: Rewrite plot style rendering**

Read plot colors from `localSettings` with fallback to `kuriPlots` defaults:

```tsx
{hasKuriPlots && (indicator.kuriPlots || []).map((plot, plotIndex) => {
    const currentColor = (localSettings as any)[`plot_${plotIndex}_color`] ?? plot.color;
    const currentLinewidth = (localSettings as any)[`plot_${plotIndex}_linewidth`] ?? plot.linewidth;
    const isVisible = (localSettings as any)[`plot_${plotIndex}_visible`] ?? true;

    return (
        <div key={plot.title} className={`flex items-center justify-between gap-3 py-1.5 ${!isVisible ? 'opacity-40' : ''}`}>
            {/* visibility toggle */}
            <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
                <button
                    type="button"
                    title={`Toggle ${plot.title} visibility`}
                    onClick={() => handlePlotStyleChange(plotIndex, { visible: !isVisible })}
                    className={`w-3.5 h-3.5 rounded-sm border flex-shrink-0 ${isVisible ? 'bg-[#2962FF] border-[#2962FF]' : 'bg-transparent border-[#555]'}`}
                />
                <span className="text-xs text-gray-400 truncate max-w-[100px]">{plot.title}</span>
            </div>
            {/* color picker + linewidth */}
            <div className="flex items-center gap-2">
                <input
                    type="color"
                    title={`${plot.title} color`}
                    value={currentColor}
                    onChange={(e) => handlePlotStyleChange(plotIndex, { color: e.target.value })}
                    className="w-5 h-5 rounded border border-[#333] cursor-pointer bg-transparent"
                />
                <select
                    title={`${plot.title} line width`}
                    value={currentLinewidth}
                    onChange={(e) => handlePlotStyleChange(plotIndex, { linewidth: parseInt(e.target.value) })}
                    className="bg-[#0f0f0f] border border-[#333] rounded px-1 py-0.5 text-xs text-white w-14"
                >
                    {[1, 2, 3, 4].map(w => <option key={w} value={w}>{w}px</option>)}
                </select>
            </div>
        </div>
    );
})}
```

- [ ] **Step 2: Implement `handlePlotStyleChange`**

Writes indexed keys plus syncs to legacy keys the chart renderer reads:

```tsx
// Map plot titles to the legacy IndicatorSettings keys that the chart renderer reads
const PLOT_TITLE_TO_LEGACY_COLOR: Record<string, string> = {
    SMA: 'color',
    EMA: 'color',
    WMA: 'color',
    HMA: 'color',
    VWMA: 'color',
    RSI: 'color',
    ATR: 'color',
    ADR: 'color',
    CCI: 'color',
    OBV: 'color',
    MFI: 'color',
    MACD: 'macdColor',
    Signal: 'signalColor',
    Upper: 'upperColor',
    'Upper Band': 'upperColor',
    'Upper BB': 'upperColor',
    Middle: 'middleColor',
    'Middle Band': 'middleColor',
    Basis: 'middleColor',
    Lower: 'lowerColor',
    'Lower Band': 'lowerColor',
    'Lower BB': 'lowerColor',
    '%K': 'kColor',
    '%D': 'dColor',
};

const handlePlotStyleChange = useCallback((plotIndex: number, changes: { color?: string; linewidth?: number; visible?: boolean }) => {
    setLocalSettings(prev => {
        const next = { ...prev } as any;
        if (changes.color !== undefined) {
            next[`plot_${plotIndex}_color`] = changes.color;
            // Sync to legacy color key
            const plotTitle = indicator.kuriPlots?.[plotIndex]?.title;
            if (plotTitle) {
                const legacyKey = PLOT_TITLE_TO_LEGACY_COLOR[plotTitle];
                if (legacyKey) next[legacyKey] = changes.color;
            }
            // First plot always syncs to settings.color
            if (plotIndex === 0) next.color = changes.color;
        }
        if (changes.linewidth !== undefined) {
            next[`plot_${plotIndex}_linewidth`] = changes.linewidth;
        }
        if (changes.visible !== undefined) {
            next[`plot_${plotIndex}_visible`] = changes.visible;
        }
        return next as IndicatorSettings;
    });
    setTimeout(debouncedEmit, 0);
}, [indicator.kuriPlots, debouncedEmit]);
```

- [ ] **Step 3: Rewrite hline style rendering and handler**

Same pattern — read from `localSettings` with fallback to `kuriHlines` defaults:

```tsx
const handleHlineStyleChange = useCallback((hlineIndex: number, changes: { color?: string; linestyle?: string; visible?: boolean }) => {
    setLocalSettings(prev => {
        const next = { ...prev } as any;
        if (changes.color !== undefined) next[`hline_${hlineIndex}_color`] = changes.color;
        if (changes.linestyle !== undefined) next[`hline_${hlineIndex}_linestyle`] = changes.linestyle;
        if (changes.visible !== undefined) next[`hline_${hlineIndex}_visible`] = changes.visible;
        return next as IndicatorSettings;
    });
    setTimeout(debouncedEmit, 0);
}, [debouncedEmit]);
```

Render hlines using index:

```tsx
{(indicator.kuriHlines || []).map((hline, hlineIndex) => {
    const currentColor = (localSettings as any)[`hline_${hlineIndex}_color`] ?? hline.color;
    const currentLinestyle = (localSettings as any)[`hline_${hlineIndex}_linestyle`] ?? 'solid';
    const isVisible = (localSettings as any)[`hline_${hlineIndex}_visible`] ?? true;
    const label = hline.title || `Level ${hline.price}`;
    // ... render same UI as current, using currentColor/currentLinestyle/isVisible
})}
```

- [ ] **Step 4: Remove dead code**

Delete: `buildMergedSettings`, `restoreOverrideFromSettings` (renamed in Task 1), `PlotStyleOverride` interface, `HlineStyleOverride` interface. These are no longer needed.

- [ ] **Step 5: Commit**

```bash
git add src/components/market-chart/IndicatorSettingsPanel.tsx
git commit -m "refactor(settings-panel): rebuild style tab with indexed plot keys, single source of truth"
```

---

### Task 3: Fix `handleAddIndicator` — Sync Plot Styles to Settings on First Add

**Files:**
- Modify: `src/components/market-chart/CandlestickChart.tsx`

When an indicator is first added, `kuriPlots` are extracted from the engine. We need to write the initial plot style values into `settings` using the indexed keys, so the settings panel and chart renderer have values to read.

- [ ] **Step 1: Add plot style initialization after Kuri engine run**

In `handleAddIndicator`, after `kuriPlots` and `kuriHlines` are set (around line 1478), add:

```tsx
// Write initial plot/hline styles into settings (single source of truth)
if (newIndicator.kuriPlots) {
    newIndicator.kuriPlots.forEach((p, i) => {
        (newIndicator.settings as any)[`plot_${i}_color`] = p.color;
        (newIndicator.settings as any)[`plot_${i}_linewidth`] = p.linewidth;
        (newIndicator.settings as any)[`plot_${i}_visible`] = true;
    });
}
if (newIndicator.kuriHlines) {
    newIndicator.kuriHlines.forEach((h, i) => {
        (newIndicator.settings as any)[`hline_${i}_color`] = h.color;
        (newIndicator.settings as any)[`hline_${i}_linestyle`] = 'solid';
        (newIndicator.settings as any)[`hline_${i}_visible`] = true;
    });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/market-chart/CandlestickChart.tsx
git commit -m "feat(chart): initialize plot style keys in settings on indicator add"
```

---

### Task 4: Fix `handleUpdateIndicator` — Don't Let Kuri Re-run Overwrite User Styles

**Files:**
- Modify: `src/components/market-chart/CandlestickChart.tsx`

- [ ] **Step 1: Preserve user plot styles after Kuri re-run**

In `handleUpdateIndicator` (around line 1754), after `updated.kuriPlots` is rebuilt from the engine, apply user's style overrides from `newSettings` back onto `kuriPlots` so the settings panel sees correct values if it re-reads from `kuriPlots`:

Actually — with the new model, `kuriPlots` is engine-only metadata. The settings panel reads from `settings`, not `kuriPlots`. So we do NOT need to patch `kuriPlots`. But we DO need to make sure the engine re-run doesn't clear the `plot_N_color` keys from `settings`.

The current code does `const updated = { ...i, settings: newSettings }`. Since `newSettings` comes from the settings panel (which already has `plot_N_color` keys), they're preserved. No change needed here.

However, the code at line 1521 that syncs `settings.color = kuriPlots[0].color` on first add now conflicts — on re-run, it would overwrite the user's color choice. Remove this line from `handleUpdateIndicator`'s Kuri re-run path:

In the `handleUpdateIndicator` function, after `updated.kuriPlots = plots.map(...)`, do NOT sync `kuriPlots[0].color` back to `settings.color`. The settings already has the user's color.

Find and verify there is no such sync in `handleUpdateIndicator`. If there is, remove it.

- [ ] **Step 2: Commit**

```bash
git add src/components/market-chart/CandlestickChart.tsx
git commit -m "fix(chart): preserve user plot styles across Kuri engine re-runs"
```

---

### Task 5: Update Chart Renderer — Read Plot Colors from Settings

**Files:**
- Modify: `src/components/market-chart/CandlestickChart.tsx`

The chart renderer (overlay rendering around line 8143) must read plot colors from `settings` using both the legacy keys (which already work for MACD, BB, Stochastic) and the new indexed keys for single-plot indicators.

- [ ] **Step 1: Fix single-plot overlay color reading**

The current rendering for single-plot indicators (around line 8290) reads:
```tsx
stroke={(indicator.settings as any)?.valueColor || indicator.settings.color || '#2962FF'}
```

This already works if `settings.color` is correct. Since the settings panel now writes to `settings.color` (via `PLOT_TITLE_TO_LEGACY_COLOR` and "first plot syncs to color"), this should work. But add `plot_0_color` as an additional fallback:

```tsx
stroke={
    (indicator.settings as any)?.plot_0_color ||
    (indicator.settings as any)?.valueColor ||
    indicator.settings.color ||
    indicator.kuriPlots?.[0]?.color ||
    '#2962FF'
}
```

- [ ] **Step 2: Fix linewidth reading**

The current rendering reads `settings.lineWidth` (camelCase). Add `plot_0_linewidth`:

```tsx
const indLineWidth = (indicator.settings as any)?.plot_0_linewidth
    || (indicator.settings as any)?.lineWidth
    || indicator.kuriPlots?.[0]?.linewidth
    || 2;
```

- [ ] **Step 3: Commit**

```bash
git add src/components/market-chart/CandlestickChart.tsx
git commit -m "fix(chart): read plot colors and linewidth from indexed settings keys"
```

---

### Task 6: Manual Verification

- [ ] **Step 1: Build and verify no type errors**

```bash
cd "c:/Users/nirma/OneDrive/Desktop/My Project" && npx tsc --noEmit 2>&1 | grep "IndicatorSettingsPanel\|CandlestickChart"
```

Expected: No errors in these files.

- [ ] **Step 2: Run dev server and test**

```bash
pnpm dev
```

Test checklist:
1. Add SMA indicator — verify it plots with period 9 (not 20)
2. Open SMA settings — verify Length shows 9
3. Change Length to 14 — verify chart updates
4. Switch to Style tab — verify SMA line color matches chart
5. Change SMA color to red — verify chart line turns red immediately
6. Close and reopen settings — verify red color is preserved
7. Add BB indicator — change upper/lower colors — verify chart updates
8. Add MACD — change MACD/Signal colors — verify chart updates
9. Add RSI — change color — verify chart updates

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat(settings-panel): complete rebuild with single source of truth for indicator styles"
```
