# Chart Settings — Sub-Project 1: Symbol Display Controls

**Date:** 2026-04-20
**Status:** Approved

## Goal

Add settings infrastructure (type extension + Supabase migration) for the larger Chart Settings expansion, plus two new Symbol-tab controls (candle body width, last-price line toggle) wired to existing Canvas render code.

## Context

This is sub-project **1 of 6** in a larger effort to bring the chart's settings panel to full TradingView feature parity. The remaining sub-projects (2–6) cover bar/chart type switcher, scale modes, status line, scale annotations, and canvas customization. This sub-project lays the foundation (settings persistence + migration helper) and ships two quick wins on the Symbol tab.

Current state in `src/components/market-chart/CandlestickChart.tsx`:
- Settings stored in Supabase table `user_chart_settings` via `loadChartSettings` / `saveChartSettings` in `src/services/marketStateService.ts`
- Defaults live in `getDefaultChartSettings(symbol)` at line 134
- The chart render is **HTML Canvas** (not SVG)
- The dashed last-price horizontal line and the right-axis price label are both gated by the SAME existing flag `chartSettings.scalesAndLines.showLastPriceLabel` (line 2576 for the line, line 2629 for the label)
- Candle body width is computed at line 2538: `const bodyWidth = Math.round(xStep * 0.7);`

---

## Type Changes

File: `src/components/market-chart/types.ts`

Extend the existing `SymbolSettings` interface (line 419) with two new fields:

```typescript
export interface SymbolSettings {
    // ...existing 12 fields unchanged...
    candleBodyWidth: number;     // 0.5–2.0 multiplier on existing 0.7 ratio; default 1.0
    showLastPriceLine: boolean;  // default true (preserves current behavior)
}
```

The dashed last-price line was previously coupled to `scalesAndLines.showLastPriceLabel` (which also controls the y-axis price label). After this change, the LINE is gated by the new `symbol.showLastPriceLine`, while the LABEL remains gated by the existing `scalesAndLines.showLastPriceLabel`. Users can now toggle them independently.

---

## Default Values

File: `src/components/market-chart/CandlestickChart.tsx`, function `getDefaultChartSettings` (line 134).

Add to the `symbol:` block:

```typescript
candleBodyWidth: 1.0,
showLastPriceLine: true,
```

Defaults preserve current behavior — opt-out, not opt-in.

---

## Migration

File: `src/services/marketStateService.ts`

Add a `normaliseSymbolSettings(raw, defaults): SymbolSettings` helper at module scope (similar to `normaliseFibSettings` in `DrawingSettingsModal.tsx`):

```typescript
export function normaliseSymbolSettings(raw: any, defaults: SymbolSettings): SymbolSettings {
    if (!raw) return { ...defaults };
    return {
        ...raw,
        candleBodyWidth: typeof raw.candleBodyWidth === 'number'
            ? raw.candleBodyWidth
            : defaults.candleBodyWidth,
        showLastPriceLine: typeof raw.showLastPriceLine === 'boolean'
            ? raw.showLastPriceLine
            : defaults.showLastPriceLine,
    };
}
```

Wire into `loadChartSettings` (line 82): after the Supabase fetch returns settings, transform the `symbol` field through `normaliseSymbolSettings(data.symbol, defaults.symbol)` where `defaults` comes from a call to `getDefaultChartSettings(symbol)`. Existing rows without these fields will get default values in-memory; the next `saveChartSettings` persists the normalised shape.

If `loadChartSettings` doesn't have access to `getDefaultChartSettings` at call site, accept that the migration helper takes a `defaults` object as its second argument — the caller passes the right defaults.

---

## Render Wiring

File: `src/components/market-chart/CandlestickChart.tsx`

This file uses HTML Canvas (`chartContext.fillRect`, `chartContext.stroke`), not SVG. Changes are inside imperative draw blocks.

### Candle body width (line 2538)

Change:
```typescript
const bodyWidth = Math.round(xStep * 0.7);
```
to:
```typescript
const widthMultiplier = chartSettings.symbol.candleBodyWidth ?? 1.0;
const bodyWidth = Math.max(1, Math.min(xStep, Math.round(xStep * 0.7 * widthMultiplier)));
```

The `Math.max(1, ...)` clamp prevents the body from disappearing at low multipliers; `Math.min(xStep, ...)` prevents adjacent candles from overlapping at high multipliers.

### Last-price line (line 2576)

Change the gate condition from:
```typescript
if (chartSettings.scalesAndLines.showLastPriceLabel && data.length > 0) {
```
to:
```typescript
if (chartSettings.symbol.showLastPriceLine && data.length > 0) {
```

This decouples the dashed line from the y-axis label. The existing block (lines 2577–2592) drawing the dashed line stays unchanged inside.

### Y-axis price label (line 2629)

No change. Continues to be gated by `chartSettings.scalesAndLines.showLastPriceLabel`. The user already has this control in the Scales and lines tab.

---

## UI Changes

File: `src/components/market-chart/ChartSettingsModal.tsx`

In `SymbolSettingsComponent` (line 182), insert a new "Display" subsection between the existing "Candles" section and "Data Modification" section:

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

Existing styling helpers (`SectionTitle`, `CheckboxSettingRow`) are reused — no new visual style introduced.

---

## Out of Scope

These belong to later sub-projects in the same series and are explicitly NOT in this one:

- **Sub-project 2** (Bar/chart style switcher): Bars, Hollow Candles, Heikin Ashi, Line, Area, Baseline render modes
- **Sub-project 3** (Scale modes): logarithmic scale, percent scale, reverse, lock price-to-bar ratio
- **Sub-project 4** (Status line): symbol name/description/last value, indicator titles/values/arguments, market status, buy/sell buttons
- **Sub-project 5** (Scale annotations): prev-day close line, average-close line, bid/ask labels, high/low markers, pre/post-market shading (if applicable)
- **Sub-project 6** (Canvas): independent V/H grid colors, full crosshair customization, watermark text/font

Also out of scope:
- Sub-project 7 (dividend / contract-change adjustments) — confirmed N/A for crypto
- Any restyling of the modal's existing visual design — user explicitly preserved current look
- The `showPriceMarkerOnScale` control originally proposed — dropped because `scalesAndLines.showLastPriceLabel` already provides this exact toggle in the Scales tab

---

## Files Affected

| File | Change |
|------|--------|
| `src/components/market-chart/types.ts` | Add 2 fields to `SymbolSettings` (line 419) |
| `src/components/market-chart/CandlestickChart.tsx` | Update `getDefaultChartSettings` (line 134); apply width multiplier (line 2538); change last-price line gate (line 2576) |
| `src/services/marketStateService.ts` | Add `normaliseSymbolSettings`; wire into `loadChartSettings` (line 82) |
| `src/components/market-chart/ChartSettingsModal.tsx` | Add "Display" subsection in `SymbolSettingsComponent` (line 182) with 2 controls |

---

## Migration / Backward Compatibility

Existing Supabase rows have `symbol` JSON without the two new fields. `loadChartSettings` runs `normaliseSymbolSettings`, which fills missing fields with defaults that match current behavior (line visible, width unchanged). On the user's next settings save, the normalised shape is persisted. No data loss; no manual migration needed.

The change to the last-price line gate (from `scalesAndLines.showLastPriceLabel` to `symbol.showLastPriceLine`) is also safe: the new field defaults to `true`, matching the previous coupling for any user who had the label visible. Users who had previously hidden the label (turned `showLastPriceLabel` off) will now see the line return — they can hide it via the new toggle in the Symbol tab if desired.
