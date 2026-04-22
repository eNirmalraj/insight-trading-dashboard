# Chart Settings — Sub-project 6: Canvas Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-color grid/crosshair settings with per-axis (vertical / horizontal) color + line-style controls and give the watermark a configurable font size.

**Architecture:** Clean rebuild — delete `gridColor` / `crosshairColor` from `ScalesAndLinesSettings`, add 10 new V/H fields and a `watermarkFontSize` on `CanvasSettings`. A one-shot migration in the normaliser copies legacy values into both V and H fields when it sees pre-rebuild rows. The canvas and SVG render paths are rewired to read the new fields exclusively. The modal grows two new subsections (Grid, Crosshair) and one new slider (Watermark font size).

**Tech Stack:** React 19 + TypeScript, Vite, HTML Canvas (main grid + indicator panels + watermark), SVG overlay (main-chart crosshair), Supabase (`user_chart_settings.settings_json`).

**Testing approach:** No frontend unit-test runner exists in this project (only `tsx`-based Kuri parity tests). Verification uses `pnpm build` for strict TypeScript + manual visual QA on `pnpm dev`, matching the pattern used by sub-projects 1–5.

**Spec:** [docs/superpowers/specs/2026-04-22-chart-settings-subproject-6-canvas-customization.md](../specs/2026-04-22-chart-settings-subproject-6-canvas-customization.md)

---

## File Structure

**Modify:**
- `src/components/market-chart/types.ts` — add/remove fields on `ScalesAndLinesSettings` + `CanvasSettings`
- `src/components/market-chart/CandlestickChart.tsx` — defaults (line 164-190), main-chart grid canvas block (line 2790-2805), indicator-panel grid (line 3506), watermark block (line 2777-2788), indicator-panel crosshair (line 4000-4040), main-chart SVG crosshair (line 10015-10042)
- `src/services/marketStateService.ts` — extend `normaliseScalesAndLinesSettings`, add `normaliseCanvasSettings`, wire into `normaliseChartSettings`
- `src/components/market-chart/ChartSettingsModal.tsx` — replace Grid/Crosshair `ToggleableColorRow` with subsections; add Watermark font size row

**Create:**
- `src/components/market-chart/LineStyleSelect.tsx` — shared 3-option select (Solid / Dashed / Dotted)

**Optionally add to `helpers.ts`** (only if the implementer judges it belongs there — otherwise inline at top of the draw function):
- `applyLineStyle(ctx, style)` helper

---

## Task 1: Types + defaults + normaliser migration

**Files:**
- Modify: `src/components/market-chart/types.ts`
- Modify: `src/components/market-chart/CandlestickChart.tsx:164-190` (defaults only — renderer still references the old fields, will break build; Task 2 fixes)
- Modify: `src/services/marketStateService.ts`

### - [ ] Step 1.1: Delete `gridColor` + `crosshairColor` from `ScalesAndLinesSettings`

Open `src/components/market-chart/types.ts`. In the `ScalesAndLinesSettings` interface (around line 448), delete the two lines:

```ts
gridColor: string;
crosshairColor: string;
```

### - [ ] Step 1.2: Add 10 new V/H fields to `ScalesAndLinesSettings`

In the same interface, add these fields (place them grouped after `showCrosshair` for readability):

```ts
gridColorVertical: string;
gridColorHorizontal: string;
gridStyleVertical: 'solid' | 'dashed' | 'dotted';
gridStyleHorizontal: 'solid' | 'dashed' | 'dotted';

crosshairColorVertical: string;
crosshairColorHorizontal: string;
crosshairStyleVertical: 'solid' | 'dashed' | 'dotted';
crosshairStyleHorizontal: 'solid' | 'dashed' | 'dotted';
crosshairWidthVertical: number;
crosshairWidthHorizontal: number;
```

### - [ ] Step 1.3: Add `watermarkFontSize` to `CanvasSettings`

In the `CanvasSettings` interface (around line 466), add after `watermarkColor`:

```ts
watermarkFontSize: number;
```

### - [ ] Step 1.4: Update `getDefaultChartSettings` in `CandlestickChart.tsx`

Open `src/components/market-chart/CandlestickChart.tsx`. Find `getDefaultChartSettings` (starts at line 138). Replace the `scalesAndLines` block (currently lines 164-180):

```ts
    scalesAndLines: {
        showLastPriceLabel: true,
        showPriceLabels: true,
        gridColorVertical: 'rgba(47, 47, 47, 0.5)',
        gridColorHorizontal: 'rgba(47, 47, 47, 0.5)',
        gridStyleVertical: 'solid',
        gridStyleHorizontal: 'solid',
        crosshairColorVertical: '#A9A9A9',
        crosshairColorHorizontal: '#A9A9A9',
        crosshairStyleVertical: 'dashed',
        crosshairStyleHorizontal: 'dashed',
        crosshairWidthVertical: 1,
        crosshairWidthHorizontal: 1,
        showCountdown: true,
        showGrid: true,
        showCrosshair: true,
        dateFormat: 'DD-MM-YYYY',
        timeFormat: 'hh:mm',
        scaleType: 'Linear',
        reverseScale: false,
        lockPriceToBarRatio: false,
        showPrevDayCloseLine: false,
        showAverageCloseLine: false,
        showHighLowMarkers: false,
    },
```

Replace the `canvas` block (currently lines 181-190):

```ts
    canvas: {
        backgroundType: 'solid',
        backgroundColor: '#0f0f0f',
        gradientStartColor: '#121212',
        gradientEndColor: '#0f0f0f',
        textColor: '#E0E0E0',
        showWatermark: false,
        watermarkText: symbol,
        watermarkColor: 'rgba(156, 163, 175, 0.1)',
        watermarkFontSize: 48,
    },
```

### - [ ] Step 1.5: Verify `types.ts` compiles (no downstream usage checked yet)

Run: `cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | head -80`

Expected: errors like `Property 'gridColor' does not exist on type 'ScalesAndLinesSettings'` coming from `CandlestickChart.tsx` and `ChartSettingsModal.tsx` only. No errors from `types.ts` itself. This is correct — downstream references will be fixed in Tasks 2 and 3.

### - [ ] Step 1.6: Extend `normaliseScalesAndLinesSettings` with migration shim

Open `src/services/marketStateService.ts`. Find `normaliseScalesAndLinesSettings` (line 108). Replace the entire function:

```ts
export function normaliseScalesAndLinesSettings(
    raw: any,
    defaults: ScalesAndLinesSettings
): ScalesAndLinesSettings {
    if (!raw || typeof raw !== 'object') return { ...defaults };

    // One-shot migration for rows written before the grid/crosshair V/H split.
    // Safe to delete once persisted rows have re-saved under the new shape.
    const legacyGrid = typeof raw.gridColor === 'string' ? raw.gridColor : null;
    const legacyCross = typeof raw.crosshairColor === 'string' ? raw.crosshairColor : null;
    const { gridColor: _g, crosshairColor: _c, ...rest } = raw;

    const isLineStyle = (v: unknown): v is 'solid' | 'dashed' | 'dotted' =>
        v === 'solid' || v === 'dashed' || v === 'dotted';
    const isWidth = (v: unknown): v is number =>
        typeof v === 'number' && v >= 1 && v <= 3;

    return {
        ...defaults,
        ...rest,
        scaleType:
            rest.scaleType === 'Linear' ||
            rest.scaleType === 'Logarithmic' ||
            rest.scaleType === 'Percent'
                ? rest.scaleType
                : defaults.scaleType,
        reverseScale:
            typeof rest.reverseScale === 'boolean' ? rest.reverseScale : defaults.reverseScale,
        lockPriceToBarRatio:
            typeof rest.lockPriceToBarRatio === 'boolean'
                ? rest.lockPriceToBarRatio
                : defaults.lockPriceToBarRatio,
        showPrevDayCloseLine:
            typeof rest.showPrevDayCloseLine === 'boolean'
                ? rest.showPrevDayCloseLine
                : defaults.showPrevDayCloseLine,
        showAverageCloseLine:
            typeof rest.showAverageCloseLine === 'boolean'
                ? rest.showAverageCloseLine
                : defaults.showAverageCloseLine,
        showHighLowMarkers:
            typeof rest.showHighLowMarkers === 'boolean'
                ? rest.showHighLowMarkers
                : defaults.showHighLowMarkers,

        gridColorVertical:
            typeof rest.gridColorVertical === 'string'
                ? rest.gridColorVertical
                : (legacyGrid ?? defaults.gridColorVertical),
        gridColorHorizontal:
            typeof rest.gridColorHorizontal === 'string'
                ? rest.gridColorHorizontal
                : (legacyGrid ?? defaults.gridColorHorizontal),
        gridStyleVertical: isLineStyle(rest.gridStyleVertical)
            ? rest.gridStyleVertical
            : defaults.gridStyleVertical,
        gridStyleHorizontal: isLineStyle(rest.gridStyleHorizontal)
            ? rest.gridStyleHorizontal
            : defaults.gridStyleHorizontal,

        crosshairColorVertical:
            typeof rest.crosshairColorVertical === 'string'
                ? rest.crosshairColorVertical
                : (legacyCross ?? defaults.crosshairColorVertical),
        crosshairColorHorizontal:
            typeof rest.crosshairColorHorizontal === 'string'
                ? rest.crosshairColorHorizontal
                : (legacyCross ?? defaults.crosshairColorHorizontal),
        crosshairStyleVertical: isLineStyle(rest.crosshairStyleVertical)
            ? rest.crosshairStyleVertical
            : defaults.crosshairStyleVertical,
        crosshairStyleHorizontal: isLineStyle(rest.crosshairStyleHorizontal)
            ? rest.crosshairStyleHorizontal
            : defaults.crosshairStyleHorizontal,
        crosshairWidthVertical: isWidth(rest.crosshairWidthVertical)
            ? rest.crosshairWidthVertical
            : defaults.crosshairWidthVertical,
        crosshairWidthHorizontal: isWidth(rest.crosshairWidthHorizontal)
            ? rest.crosshairWidthHorizontal
            : defaults.crosshairWidthHorizontal,
    };
}
```

### - [ ] Step 1.7: Add `normaliseCanvasSettings` in `marketStateService.ts`

In the same file, add a new helper **directly above** `normaliseChartSettings` (which lives around line 162):

```ts
export function normaliseCanvasSettings(
    raw: any,
    defaults: CanvasSettings
): CanvasSettings {
    if (!raw || typeof raw !== 'object') return { ...defaults };
    return {
        ...defaults,
        ...raw,
        backgroundType:
            raw.backgroundType === 'solid' || raw.backgroundType === 'gradient'
                ? raw.backgroundType
                : defaults.backgroundType,
        showWatermark:
            typeof raw.showWatermark === 'boolean' ? raw.showWatermark : defaults.showWatermark,
        watermarkFontSize:
            typeof raw.watermarkFontSize === 'number' &&
            raw.watermarkFontSize >= 12 &&
            raw.watermarkFontSize <= 96
                ? raw.watermarkFontSize
                : defaults.watermarkFontSize,
    };
}
```

Add `CanvasSettings` to the import at the top of the file — find the type import block (line 3-8) and add `CanvasSettings` to the list.

### - [ ] Step 1.8: Wire `normaliseCanvasSettings` into `normaliseChartSettings`

Still in `marketStateService.ts`, find `normaliseChartSettings` (around line 162). Replace the return block:

```ts
    return {
        ...defaults,
        ...raw,
        symbol: normaliseSymbolSettings(raw.symbol, defaults.symbol),
        scalesAndLines: normaliseScalesAndLinesSettings(raw.scalesAndLines, defaults.scalesAndLines),
        statusLine: normaliseStatusLineSettings(raw.statusLine, defaults.statusLine),
        canvas: normaliseCanvasSettings(raw.canvas, defaults.canvas),
    };
```

### - [ ] Step 1.9: Type-check `marketStateService.ts` in isolation

Run: `cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "(marketStateService|types\.ts)" | head -30`

Expected: no errors referring to `marketStateService.ts` or `types.ts`. Only errors remaining should be in `CandlestickChart.tsx` (renderer uses old fields) and `ChartSettingsModal.tsx` (modal uses old fields) — these are Tasks 2 and 3.

### - [ ] Step 1.10: Commit

```bash
git add src/components/market-chart/types.ts src/components/market-chart/CandlestickChart.tsx src/services/marketStateService.ts
git commit -m "feat(chart-settings): add V/H grid+crosshair fields and watermark font size to settings shape

Delete gridColor/crosshairColor; add 10 new V/H fields on ScalesAndLinesSettings
and watermarkFontSize on CanvasSettings. Extend normaliseScalesAndLinesSettings
with a one-shot legacy migration that copies pre-rebuild gridColor/crosshairColor
into both V and H fields on first load. Add normaliseCanvasSettings wired into
normaliseChartSettings.

Renderer/modal references updated in follow-up commits (intentional transient
build break isolated to this sub-project's feature branch)."
```

---

## Task 2: Canvas + SVG render wiring

**Files:**
- Modify: `src/components/market-chart/CandlestickChart.tsx`
  - Watermark block (line 2777-2788)
  - Main-chart canvas grid block (line 2790-2805)
  - Indicator-panel canvas grid (line 3506, 3507, 3512)
  - Indicator-panel canvas crosshair (line 4031-4040)
  - Main-chart SVG crosshair (line 10015-10042)
  - New `applyLineStyle` helper (near top of the main render function, before the grid block)

### - [ ] Step 2.1: Add `applyLineStyle` helper inline near the top of `CandlestickChart.tsx`

Scroll to the top of the file (around line 190, right after the closing `});` of `getDefaultChartSettings`). Add **at module scope**, outside any component:

```ts
const applyLineStyle = (
    ctx: CanvasRenderingContext2D,
    style: 'solid' | 'dashed' | 'dotted'
) => {
    switch (style) {
        case 'solid':
            ctx.setLineDash([]);
            break;
        case 'dashed':
            ctx.setLineDash([6, 4]);
            break;
        case 'dotted':
            ctx.setLineDash([2, 3]);
            break;
    }
};

const lineStyleToDashArray = (style: 'solid' | 'dashed' | 'dotted'): string => {
    switch (style) {
        case 'solid':
            return '0';
        case 'dashed':
            return '6 4';
        case 'dotted':
            return '2 3';
    }
};
```

### - [ ] Step 2.2: Rewrite the watermark font size (line 2777-2788)

Find the block:

```ts
                if (chartSettings.canvas.showWatermark) {
                    chartContext.font = 'bold 48px Inter, sans-serif';
                    chartContext.fillStyle = chartSettings.canvas.watermarkColor;
```

Replace the second line (font) with:

```ts
                    chartContext.font = `bold ${chartSettings.canvas.watermarkFontSize}px Inter, sans-serif`;
```

### - [ ] Step 2.3: Rewrite the main-chart grid canvas block (line 2790-2805)

Find the block:

```ts
                if (chartSettings.scalesAndLines.showGrid) {
                    chartContext.strokeStyle = chartSettings.scalesAndLines.gridColor;
                    chartContext.lineWidth = 0.5;
                    yAxisLabels.forEach((label) => {
                        chartContext.beginPath();
                        chartContext.moveTo(0, label.y);
                        chartContext.lineTo(chartDimensions.width, label.y);
                        chartContext.stroke();
                    });
                    xAxisLabels.forEach((label) => {
                        chartContext.beginPath();
                        chartContext.moveTo(label.x, 0);
                        chartContext.lineTo(label.x, chartDimensions.height);
                        chartContext.stroke();
                    });
                }
```

Replace with:

```ts
                if (chartSettings.scalesAndLines.showGrid) {
                    chartContext.lineWidth = 0.5;

                    // Horizontal grid lines (along the price axis)
                    chartContext.strokeStyle = chartSettings.scalesAndLines.gridColorHorizontal;
                    applyLineStyle(chartContext, chartSettings.scalesAndLines.gridStyleHorizontal);
                    yAxisLabels.forEach((label) => {
                        chartContext.beginPath();
                        chartContext.moveTo(0, label.y);
                        chartContext.lineTo(chartDimensions.width, label.y);
                        chartContext.stroke();
                    });

                    // Vertical grid lines (along the time axis)
                    chartContext.strokeStyle = chartSettings.scalesAndLines.gridColorVertical;
                    applyLineStyle(chartContext, chartSettings.scalesAndLines.gridStyleVertical);
                    xAxisLabels.forEach((label) => {
                        chartContext.beginPath();
                        chartContext.moveTo(label.x, 0);
                        chartContext.lineTo(label.x, chartDimensions.height);
                        chartContext.stroke();
                    });

                    chartContext.setLineDash([]);
                }
```

### - [ ] Step 2.4: Rewrite the indicator-panel grid (around line 3506)

Find the `for (let i = 1; i < numLabels; i++)` block around line 3498. Inside it, find:

```ts
                // Grid line on main chart
                ctx.strokeStyle = chartSettings.scalesAndLines.gridColor;
                ctx.globalAlpha = 0.5;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();
                ctx.globalAlpha = 1;
```

Replace with (indicator-panel grid lines are horizontal price lines — wire to `gridColorHorizontal` + `gridStyleHorizontal`):

```ts
                // Grid line on indicator panel — horizontal price lines only
                ctx.strokeStyle = chartSettings.scalesAndLines.gridColorHorizontal;
                applyLineStyle(ctx, chartSettings.scalesAndLines.gridStyleHorizontal);
                ctx.globalAlpha = 0.5;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();
                ctx.globalAlpha = 1;
                ctx.setLineDash([]);
```

### - [ ] Step 2.5: Rewrite the indicator-panel crosshair (lines 4031-4040)

Find the block that draws both crosshair lines together:

```ts
                    // Crosshair line on panel
                    ctx.beginPath();
                    ctx.strokeStyle = '#E0E0E0';
                    ctx.setLineDash([4, 4]);
                    ctx.moveTo(timeX, 0);
                    ctx.lineTo(timeX, height);
                    ctx.moveTo(0, y);
                    ctx.lineTo(width, y);
                    ctx.stroke();
                    ctx.setLineDash([]);
```

Replace with:

```ts
                    // Vertical crosshair line on panel
                    ctx.beginPath();
                    ctx.strokeStyle = chartSettings.scalesAndLines.crosshairColorVertical;
                    ctx.lineWidth = chartSettings.scalesAndLines.crosshairWidthVertical;
                    applyLineStyle(ctx, chartSettings.scalesAndLines.crosshairStyleVertical);
                    ctx.moveTo(timeX, 0);
                    ctx.lineTo(timeX, height);
                    ctx.stroke();

                    // Horizontal crosshair line on panel
                    ctx.beginPath();
                    ctx.strokeStyle = chartSettings.scalesAndLines.crosshairColorHorizontal;
                    ctx.lineWidth = chartSettings.scalesAndLines.crosshairWidthHorizontal;
                    applyLineStyle(ctx, chartSettings.scalesAndLines.crosshairStyleHorizontal);
                    ctx.moveTo(0, y);
                    ctx.lineTo(width, y);
                    ctx.stroke();

                    ctx.setLineDash([]);
                    ctx.lineWidth = 1;
```

### - [ ] Step 2.6: Rewrite the main-chart SVG crosshair (line 10015-10042)

Find the JSX block:

```tsx
                                        {tooltip.visible &&
                                            chartSettings.scalesAndLines.showCrosshair && (
                                                <g className="pointer-events-none">
                                                    <line
                                                        x1={0}
                                                        y1={tooltip.y}
                                                        x2={chartDimensions.width}
                                                        y2={tooltip.y}
                                                        stroke={
                                                            chartSettings.scalesAndLines
                                                                .crosshairColor
                                                        }
                                                        strokeWidth="1"
                                                        strokeDasharray="4 4"
                                                    />
                                                    <line
                                                        x1={tooltip.x}
                                                        y1={0}
                                                        x2={tooltip.x}
                                                        y2={chartDimensions.height}
                                                        stroke={
                                                            chartSettings.scalesAndLines
                                                                .crosshairColor
                                                        }
                                                        strokeWidth="1"
                                                        strokeDasharray="4 4"
                                                    />
                                                </g>
                                            )}
```

Replace with:

```tsx
                                        {tooltip.visible &&
                                            chartSettings.scalesAndLines.showCrosshair && (
                                                <g className="pointer-events-none">
                                                    <line
                                                        x1={0}
                                                        y1={tooltip.y}
                                                        x2={chartDimensions.width}
                                                        y2={tooltip.y}
                                                        stroke={
                                                            chartSettings.scalesAndLines
                                                                .crosshairColorHorizontal
                                                        }
                                                        strokeWidth={
                                                            chartSettings.scalesAndLines
                                                                .crosshairWidthHorizontal
                                                        }
                                                        strokeDasharray={lineStyleToDashArray(
                                                            chartSettings.scalesAndLines
                                                                .crosshairStyleHorizontal
                                                        )}
                                                    />
                                                    <line
                                                        x1={tooltip.x}
                                                        y1={0}
                                                        x2={tooltip.x}
                                                        y2={chartDimensions.height}
                                                        stroke={
                                                            chartSettings.scalesAndLines
                                                                .crosshairColorVertical
                                                        }
                                                        strokeWidth={
                                                            chartSettings.scalesAndLines
                                                                .crosshairWidthVertical
                                                        }
                                                        strokeDasharray={lineStyleToDashArray(
                                                            chartSettings.scalesAndLines
                                                                .crosshairStyleVertical
                                                        )}
                                                    />
                                                </g>
                                            )}
```

### - [ ] Step 2.7: Verify no remaining references to the deleted fields

Run: `cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm exec grep -nR "scalesAndLines\.gridColor\|scalesAndLines\.crosshairColor" src/ 2>/dev/null`

Expected: no output (no lines match). If any match, open the referenced file and update it to use the new V/H fields per the pattern above.

### - [ ] Step 2.8: TypeScript build must pass

Run: `cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm build 2>&1 | tail -30`

Expected: `✓ built in <N>s` at the bottom, no TypeScript errors. The modal (`ChartSettingsModal.tsx`) **will still error** — that is Task 3. To check only `CandlestickChart.tsx`:

Run: `cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "CandlestickChart" | head -20`

Expected: no errors from `CandlestickChart.tsx`.

### - [ ] Step 2.9: Manual visual QA (dev server)

Run: `cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm dev`

Open the Market page in the browser. With defaults in place (solid grid, dashed 1px crosshair, 48px watermark):

- [ ] Grid renders with identical appearance to pre-change state.
- [ ] Crosshair on main chart renders dashed at 1px in `#A9A9A9`.
- [ ] Crosshair on indicator panels renders dashed at 1px in `#A9A9A9` (this is a behavior change from hardcoded `#E0E0E0` — expected).
- [ ] Watermark (enable it from the Canvas tab once Task 4 is done, or via devtools) renders at 48px.
- [ ] No console errors.

### - [ ] Step 2.10: Commit

```bash
git add src/components/market-chart/CandlestickChart.tsx
git commit -m "feat(chart-settings): wire canvas + SVG render to V/H grid and crosshair fields

Main-chart grid splits into horizontal (gridColorHorizontal + style) and
vertical (gridColorVertical + style) passes. Indicator-panel grid maps to
gridColorHorizontal (panel grid is horizontal-only). Main-chart SVG crosshair
and indicator-panel canvas crosshair both draw V and H separately using the
new per-axis color/style/width fields. Watermark font size now reads from
canvas.watermarkFontSize.

Adds module-scope applyLineStyle (canvas setLineDash) and lineStyleToDashArray
(SVG strokeDasharray) helpers. Indicator-panel crosshair color changes from
hardcoded #E0E0E0 to the user-configurable crosshair colors; this is
intentional — panel crosshairs should follow the main-chart setting."
```

---

## Task 3: Modal — Grid + Crosshair subsections

**Files:**
- Create: `src/components/market-chart/LineStyleSelect.tsx`
- Modify: `src/components/market-chart/ChartSettingsModal.tsx` (replace old Grid/Crosshair `ToggleableColorRow` rows with new subsections)

### - [ ] Step 3.1: Create the `LineStyleSelect` component

Create file `src/components/market-chart/LineStyleSelect.tsx`:

```tsx
import React from 'react';

export type LineStyleOption = 'solid' | 'dashed' | 'dotted';

interface LineStyleSelectProps {
    value: LineStyleOption;
    onChange: (value: LineStyleOption) => void;
    disabled?: boolean;
}

const LineStyleSelect: React.FC<LineStyleSelectProps> = ({ value, onChange, disabled }) => (
    <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as LineStyleOption)}
        className="bg-gray-700 border border-gray-600 rounded-md py-1 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
    >
        <option value="solid">Solid</option>
        <option value="dashed">Dashed</option>
        <option value="dotted">Dotted</option>
    </select>
);

export default LineStyleSelect;
```

### - [ ] Step 3.2: Open `ChartSettingsModal.tsx` and import `LineStyleSelect`

Add to the import block near the top of `src/components/market-chart/ChartSettingsModal.tsx`:

```ts
import LineStyleSelect from './LineStyleSelect';
```

### - [ ] Step 3.3: Remove the old Grid + Crosshair `ToggleableColorRow` rows

Find lines 405-418 inside `ScalesAndLinesSettingsComponent` (the `<SectionTitle>Appearance</SectionTitle>` block). Delete the two `<ToggleableColorRow>` blocks for "Grid lines" and "Crosshair":

```tsx
                <ToggleableColorRow
                    label="Grid lines"
                    isChecked={settings.showGrid}
                    onToggle={(checked) => onChange('showGrid', checked)}
                    color={settings.gridColor}
                    onColorChange={(color) => onChange('gridColor', color)}
                />
                <ToggleableColorRow
                    label="Crosshair"
                    isChecked={settings.showCrosshair}
                    onToggle={(checked) => onChange('showCrosshair', checked)}
                    color={settings.crosshairColor}
                    onColorChange={(color) => onChange('crosshairColor', color)}
                />
```

Leave the Date Format and Time Format `<SelectSettingRow>` rows in place — they stay in Appearance.

### - [ ] Step 3.4: Add a "Grid" subsection after the Labels subsection

Inside `ScalesAndLinesSettingsComponent`, between the closing `</div>` of the "Labels" subsection (just after line 401) and the opening `<div>` of the "Appearance" subsection (currently line 402), insert:

```tsx
        <div>
            <SectionTitle>Grid</SectionTitle>
            <div className="space-y-4">
                <CheckboxSettingRow
                    label="Show grid"
                    isChecked={settings.showGrid}
                    onToggle={(checked) => onChange('showGrid', checked)}
                />
                <div className={settings.showGrid ? '' : 'opacity-50 pointer-events-none'}>
                    <div className="text-xs text-gray-400 uppercase tracking-wide mt-2 mb-2">
                        Vertical lines
                    </div>
                    <div className="space-y-2">
                        <ColorRow
                            label="Color"
                            color={settings.gridColorVertical}
                            onChange={(color) => onChange('gridColorVertical', color)}
                        />
                        <div className="flex items-center justify-between">
                            <label className="text-gray-300">Style</label>
                            <LineStyleSelect
                                value={settings.gridStyleVertical}
                                onChange={(v) => onChange('gridStyleVertical', v)}
                                disabled={!settings.showGrid}
                            />
                        </div>
                    </div>
                    <div className="text-xs text-gray-400 uppercase tracking-wide mt-4 mb-2">
                        Horizontal lines
                    </div>
                    <div className="space-y-2">
                        <ColorRow
                            label="Color"
                            color={settings.gridColorHorizontal}
                            onChange={(color) => onChange('gridColorHorizontal', color)}
                        />
                        <div className="flex items-center justify-between">
                            <label className="text-gray-300">Style</label>
                            <LineStyleSelect
                                value={settings.gridStyleHorizontal}
                                onChange={(v) => onChange('gridStyleHorizontal', v)}
                                disabled={!settings.showGrid}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
```

### - [ ] Step 3.5: Add a "Crosshair" subsection directly after the "Grid" subsection

Immediately after the closing `</div>` of the Grid subsection added in Step 3.4, insert:

```tsx
        <div>
            <SectionTitle>Crosshair</SectionTitle>
            <div className="space-y-4">
                <CheckboxSettingRow
                    label="Show crosshair"
                    isChecked={settings.showCrosshair}
                    onToggle={(checked) => onChange('showCrosshair', checked)}
                />
                <div className={settings.showCrosshair ? '' : 'opacity-50 pointer-events-none'}>
                    <div className="text-xs text-gray-400 uppercase tracking-wide mt-2 mb-2">
                        Vertical line
                    </div>
                    <div className="space-y-2">
                        <ColorRow
                            label="Color"
                            color={settings.crosshairColorVertical}
                            onChange={(color) => onChange('crosshairColorVertical', color)}
                        />
                        <div className="flex items-center justify-between">
                            <label className="text-gray-300">Style</label>
                            <LineStyleSelect
                                value={settings.crosshairStyleVertical}
                                onChange={(v) => onChange('crosshairStyleVertical', v)}
                                disabled={!settings.showCrosshair}
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <label className="text-gray-300">Width</label>
                            <div className="flex gap-1">
                                {[1, 2, 3].map((w) => (
                                    <button
                                        key={w}
                                        type="button"
                                        disabled={!settings.showCrosshair}
                                        onClick={() => onChange('crosshairWidthVertical', w)}
                                        className={`px-3 py-1 text-sm rounded-md border ${
                                            settings.crosshairWidthVertical === w
                                                ? 'bg-blue-600 border-blue-500 text-white'
                                                : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                                    >
                                        {w}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="text-xs text-gray-400 uppercase tracking-wide mt-4 mb-2">
                        Horizontal line
                    </div>
                    <div className="space-y-2">
                        <ColorRow
                            label="Color"
                            color={settings.crosshairColorHorizontal}
                            onChange={(color) => onChange('crosshairColorHorizontal', color)}
                        />
                        <div className="flex items-center justify-between">
                            <label className="text-gray-300">Style</label>
                            <LineStyleSelect
                                value={settings.crosshairStyleHorizontal}
                                onChange={(v) => onChange('crosshairStyleHorizontal', v)}
                                disabled={!settings.showCrosshair}
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <label className="text-gray-300">Width</label>
                            <div className="flex gap-1">
                                {[1, 2, 3].map((w) => (
                                    <button
                                        key={w}
                                        type="button"
                                        disabled={!settings.showCrosshair}
                                        onClick={() => onChange('crosshairWidthHorizontal', w)}
                                        className={`px-3 py-1 text-sm rounded-md border ${
                                            settings.crosshairWidthHorizontal === w
                                                ? 'bg-blue-600 border-blue-500 text-white'
                                                : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                                    >
                                        {w}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
```

### - [ ] Step 3.6: Check `ColorRow` is already imported / exists in this file

Run: `cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm exec grep -n "ColorRow" src/components/market-chart/ChartSettingsModal.tsx | head -5`

Expected: multiple matches (already used elsewhere in this file — `CanvasSettingsComponent` uses it for background/watermark). No import needed if it's defined at module scope in this same file.

### - [ ] Step 3.7: TypeScript check — modal + types must be clean

Run: `cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "ChartSettingsModal|LineStyleSelect|types\.ts" | head -20`

Expected: no errors.

### - [ ] Step 3.8: Full build

Run: `cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm build 2>&1 | tail -20`

Expected: `✓ built in <N>s` with no errors. (If any Task 4 field is referenced it will fail — Task 4 is next; skip this step if so and run it after Task 4.)

### - [ ] Step 3.9: Manual QA on dev server

Run: `cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm dev`

Open the Market page → Chart settings → "Scales and lines" tab. Confirm:

- [ ] New "Grid" subsection is visible between "Labels" and "Appearance", with Show grid toggle + V/H color + V/H style.
- [ ] New "Crosshair" subsection is visible after "Grid", with Show crosshair toggle + V/H color + V/H style + V/H width segmented.
- [ ] Toggling "Show grid" off greys out all four Grid controls (color swatches and style dropdowns visibly disabled).
- [ ] Toggling "Show crosshair" off greys out all six Crosshair controls.
- [ ] Changing vertical grid color updates only vertical gridlines on the chart live.
- [ ] Changing horizontal grid style to dotted updates only horizontal gridlines live.
- [ ] Changing vertical crosshair width to 3 thickens only the vertical crosshair line.
- [ ] Changing horizontal crosshair color updates only the horizontal crosshair line.

### - [ ] Step 3.10: Commit

```bash
git add src/components/market-chart/LineStyleSelect.tsx src/components/market-chart/ChartSettingsModal.tsx
git commit -m "feat(chart-settings): add Grid and Crosshair subsections to Scales-and-lines tab

Replace single-color Grid lines / Crosshair ToggleableColorRows with two new
subsections offering per-axis (vertical, horizontal) color and line style plus
per-axis line width for the crosshair. Both subsections grey out when their
parent Show toggle is off. Introduces LineStyleSelect — a shared three-option
(Solid / Dashed / Dotted) dropdown."
```

---

## Task 4: Modal — Watermark font size

**Files:**
- Modify: `src/components/market-chart/ChartSettingsModal.tsx` — `CanvasSettingsComponent` Watermark row (around line 494-508)

### - [ ] Step 4.1: Add the font-size slider below the watermark color row

Find the conditional block inside `CanvasSettingsComponent` (line 494-508):

```tsx
                {settings.showWatermark && (
                    <>
                        <TextSettingRow
                            label="Text"
                            value={settings.watermarkText}
                            onChange={(text) => onChange('watermarkText', text)}
                            placeholder="e.g. EURUSD, 15m"
                        />
                        <ColorRow
                            label="Watermark color"
                            color={settings.watermarkColor}
                            onChange={(color) => onChange('watermarkColor', color)}
                        />
                    </>
                )}
```

Replace with:

```tsx
                {settings.showWatermark && (
                    <>
                        <TextSettingRow
                            label="Text"
                            value={settings.watermarkText}
                            onChange={(text) => onChange('watermarkText', text)}
                            placeholder="e.g. EURUSD, 15m"
                        />
                        <ColorRow
                            label="Watermark color"
                            color={settings.watermarkColor}
                            onChange={(color) => onChange('watermarkColor', color)}
                        />
                        <div className="flex items-center justify-between">
                            <label htmlFor="watermarkFontSize" className="text-gray-300">
                                Font size
                            </label>
                            <div className="flex items-center gap-3 w-1/2">
                                <input
                                    id="watermarkFontSize"
                                    type="range"
                                    min={12}
                                    max={96}
                                    step={1}
                                    value={settings.watermarkFontSize}
                                    onChange={(e) =>
                                        onChange(
                                            'watermarkFontSize',
                                            Number.parseInt(e.target.value, 10)
                                        )
                                    }
                                    className="flex-1 accent-blue-500"
                                />
                                <span className="text-gray-400 text-sm tabular-nums w-10 text-right">
                                    {settings.watermarkFontSize}px
                                </span>
                            </div>
                        </div>
                    </>
                )}
```

### - [ ] Step 4.2: TypeScript build must pass

Run: `cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm build 2>&1 | tail -20`

Expected: `✓ built in <N>s` with no errors.

### - [ ] Step 4.3: Manual QA

Run `pnpm dev` if not already running. Open Market page → Chart settings → "Canvas" tab:

- [ ] Enable "Watermark" — Text input, color, and Font size slider all appear.
- [ ] Disable "Watermark" — all three rows hide (existing behavior preserved by the `settings.showWatermark` gate).
- [ ] Slider reads 48 at first load, displays "48px" readout on the right.
- [ ] Dragging the slider updates the watermark size on the chart live.
- [ ] Slider clamps at 12 and 96.

### - [ ] Step 4.4: Commit

```bash
git add src/components/market-chart/ChartSettingsModal.tsx
git commit -m "feat(chart-settings): add watermark font-size slider to Canvas tab

Adds a 12–96 px range input with live numeric readout beneath the watermark
color row. Only visible when Watermark is enabled. Updates canvas rendering
live via the existing chart-settings live-preview pipeline."
```

---

## Task 5: End-to-end QA + legacy-row migration verification

**Files:** none (verification-only)

### - [ ] Step 5.1: Type-check and build once more

Run: `cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm build 2>&1 | tail -10`

Expected: `✓ built in <N>s`. Capture any warnings.

### - [ ] Step 5.2: Legacy row migration — manual Supabase check

**Only if you have access to the Supabase dashboard for this project.** Open `public.user_chart_settings` for the logged-in user. Before touching the UI, inspect the row's `settings_json`. If it contains `"gridColor"` and/or `"crosshairColor"` at the `scalesAndLines.*` path, the migration fixture is live.

Alternative (no Supabase access) — in devtools Console on the Market page before opening settings:

```js
// Read the persisted JSON via the existing service
import('/src/services/marketStateService.ts').then(m => m.loadChartSettings()).then(console.log);
```

- [ ] Record whether `gridColor` / `crosshairColor` appear in the stored row.

### - [ ] Step 5.3: Verify migration copies legacy into V and H

Reload the Market page and open Chart Settings → Scales and lines. Expected:

- [ ] If the row had `gridColor: '#custom'` previously, both Grid Vertical and Grid Horizontal color swatches show `#custom`.
- [ ] If the row had `crosshairColor: '#custom'` previously, both Crosshair Vertical and Horizontal color swatches show that value.
- [ ] If the row had neither, both V and H default to `'rgba(47, 47, 47, 0.5)'` (grid) and `'#A9A9A9'` (crosshair).

### - [ ] Step 5.4: Verify save drops the legacy keys

Change any setting (any control — just enough to trigger `saveChartSettings`). Then re-read the row:

```js
import('/src/services/marketStateService.ts').then(m => m.loadChartSettings()).then(s => console.log(JSON.stringify(s.scalesAndLines, null, 2)));
```

- [ ] `scalesAndLines` no longer contains `gridColor` or `crosshairColor` keys.
- [ ] `scalesAndLines` contains all 10 new V/H fields.
- [ ] `canvas` contains `watermarkFontSize`.

### - [ ] Step 5.5: Functional matrix

Open Chart settings and exercise every new control. Confirm live preview:

- [ ] Grid V color change → only vertical gridlines repaint.
- [ ] Grid H color change → only horizontal gridlines repaint.
- [ ] Grid V style → dashed → only vertical gridlines dash.
- [ ] Grid H style → dotted → only horizontal gridlines dot.
- [ ] Crosshair V color → only vertical crosshair line changes.
- [ ] Crosshair H color → only horizontal crosshair line changes.
- [ ] Crosshair V style → dotted → only vertical crosshair dots.
- [ ] Crosshair H style → solid → only horizontal crosshair solid.
- [ ] Crosshair V width 3 → only vertical crosshair thickens.
- [ ] Crosshair H width 2 → only horizontal crosshair thickens.
- [ ] Watermark font 96 → watermark resizes large live.
- [ ] Watermark font 12 → watermark resizes small live.

### - [ ] Step 5.6: Cross-cutting regression checks

- [ ] Toggle "Show grid" off → entire grid disappears on main chart and indicator panels.
- [ ] Toggle "Show grid" on → grid reappears with current V/H styles.
- [ ] Toggle "Show crosshair" off → no crosshair renders anywhere on hover.
- [ ] Toggle "Show crosshair" on → crosshair renders per current V/H settings.
- [ ] Toggle "Watermark" off → no watermark rendered.
- [ ] Toggle "Watermark" on → watermark at current font size.
- [ ] Close and reopen the modal → all values persist as configured.
- [ ] Reload the page → all values persist (Supabase round-trip works).
- [ ] Switch to another symbol and back → settings still apply (settings are global, not per-symbol).
- [ ] Switch timeframe → grid/crosshair/watermark all repaint correctly on each redraw.

### - [ ] Step 5.7: Console error scan

Open browser devtools → Console while running all Step 5.5 interactions.

- [ ] No red errors.
- [ ] No warnings referencing `gridColor`, `crosshairColor`, `undefined is not a function`, or property access on `undefined`.

### - [ ] Step 5.8: Final commit (if any cleanup needed) and hand-off

If nothing needed cleanup, no commit. Otherwise stage the fix and commit:

```bash
git commit -m "fix(chart-settings): <specific issue found during QA>"
```

When QA is fully green, the sub-project is complete. Follow up with `superpowers:finishing-a-development-branch` if the repo requires PR/merge steps; otherwise the feature is shipped.

---

## Self-Review

**1. Spec coverage**

| Spec requirement | Task covering it |
|---|---|
| Delete `gridColor` + `crosshairColor` on `ScalesAndLinesSettings` | Task 1, Step 1.1 |
| Add 10 new V/H fields on `ScalesAndLinesSettings` | Task 1, Step 1.2 |
| Add `watermarkFontSize` on `CanvasSettings` | Task 1, Step 1.3 |
| Update `getDefaultChartSettings` | Task 1, Step 1.4 |
| Migration shim in `normaliseScalesAndLinesSettings` | Task 1, Step 1.6 |
| Create `normaliseCanvasSettings` and wire into `normaliseChartSettings` | Task 1, Steps 1.7–1.8 |
| `applyLineStyle` helper | Task 2, Step 2.1 |
| Main-chart grid V/H render split | Task 2, Step 2.3 |
| Main-chart crosshair V/H render split (SVG) | Task 2, Step 2.6 |
| Watermark font-size wiring | Task 2, Step 2.2 |
| `LineStyleSelect` shared component | Task 3, Step 3.1 |
| Grid subsection in modal | Task 3, Step 3.4 |
| Crosshair subsection in modal | Task 3, Step 3.5 |
| Watermark font-size slider in modal | Task 4, Step 4.1 |
| Legacy row migration verified | Task 5, Steps 5.2–5.4 |
| Full functional matrix | Task 5, Step 5.5 |

Gap found: indicator-panel grid + indicator-panel crosshair aren't in the spec but they reference the deleted fields. Task 2, Steps 2.4 + 2.5 cover them.

**2. Placeholder scan** — no `TBD`, no `implement later`, no "add error handling" without specifics. Every code step contains complete copy-paste-ready code.

**3. Type consistency** — `'solid' | 'dashed' | 'dotted'` is used identically everywhere; `LineStyleOption` in `LineStyleSelect.tsx` is a structural alias of the same union; `crosshairWidthVertical` / `crosshairWidthHorizontal` are `number` bounded 1–3 in both the normaliser guard and the modal buttons. `watermarkFontSize` is bounded 12–96 in both the normaliser and the slider.
