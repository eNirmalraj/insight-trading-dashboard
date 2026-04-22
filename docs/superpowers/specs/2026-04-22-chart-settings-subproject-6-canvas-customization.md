# Chart Settings — Sub-project 6: Canvas Customization (Design)

**Status:** Approved 2026-04-22. Ready for implementation plan.

## Goal

Bring the chart's **grid**, **crosshair**, and **watermark** controls to full TradingView-style parity without changing the lavender-themed visual identity. Replace the single-color grid and crosshair settings with per-axis (vertical / horizontal) controls for color, style, and (crosshair only) width. Give the watermark a configurable font size.

## Scope

**In scope (11 new fields, 1 sub-project):**

1. Grid — separate vertical / horizontal color + line style (width stays shared).
2. Crosshair — separate vertical / horizontal color, line style, and line width.
3. Watermark — add font size control.

**Explicitly out of scope:**

- Grid width per axis (current shared 1px is fine).
- Multiple watermarks, watermark image upload, watermark position presets.
- Background gradient angle, noise, multi-stop gradients (already covered by sub-project 6's existing `CanvasSettings`).
- Any change to the existing `showGrid`, `showCrosshair`, `showWatermark` toggles — these remain as parent guards.

## Clean Rebuild, No Back-compat Zombies

Old fields `gridColor` and `crosshairColor` on `ScalesAndLinesSettings` are **deleted**. The normaliser in `marketStateService.ts` performs a **one-shot migration**: when it sees the legacy keys on a persisted Supabase row and the new V/H fields are absent, it copies the legacy value into both the vertical and horizontal new fields. After the next save, the legacy keys vanish from `settings_json`. The migration branch is marked as disposable — delete in a future release once all rows have re-saved.

## State Model

### `types.ts` — `ScalesAndLinesSettings`

```ts
// DELETE
gridColor: string;
crosshairColor: string;

// ADD
gridColorVertical: string;
gridColorHorizontal: string;
gridStyleVertical: 'solid' | 'dashed' | 'dotted';
gridStyleHorizontal: 'solid' | 'dashed' | 'dotted';

crosshairColorVertical: string;
crosshairColorHorizontal: string;
crosshairStyleVertical: 'solid' | 'dashed' | 'dotted';
crosshairStyleHorizontal: 'solid' | 'dashed' | 'dotted';
crosshairWidthVertical: number;   // 1–3
crosshairWidthHorizontal: number; // 1–3
```

### `types.ts` — `CanvasSettings`

```ts
// ADD
watermarkFontSize: number; // 12–96, default 48
```

### Defaults (inside `getDefaultChartSettings()` in `CandlestickChart.tsx`)

| Field | Default |
|---|---|
| `gridColorVertical` | current `gridColor` default |
| `gridColorHorizontal` | current `gridColor` default |
| `gridStyleVertical` | `'solid'` |
| `gridStyleHorizontal` | `'solid'` |
| `crosshairColorVertical` | current `crosshairColor` default |
| `crosshairColorHorizontal` | current `crosshairColor` default |
| `crosshairStyleVertical` | `'dashed'` |
| `crosshairStyleHorizontal` | `'dashed'` |
| `crosshairWidthVertical` | `1` |
| `crosshairWidthHorizontal` | `1` |
| `watermarkFontSize` | `48` |

### Normaliser migration — `marketStateService.ts`

```ts
export function normaliseScalesAndLinesSettings(raw, defaults) {
    if (!raw || typeof raw !== 'object') return { ...defaults };

    // One-shot migration for pre-rebuild rows.
    // Safe to delete once persisted rows have re-saved under the new shape.
    const legacyGrid = typeof raw.gridColor === 'string' ? raw.gridColor : null;
    const legacyCross = typeof raw.crosshairColor === 'string' ? raw.crosshairColor : null;

    const { gridColor: _g, crosshairColor: _c, ...rest } = raw;

    return {
        ...defaults,
        ...rest,
        scaleType: /* unchanged existing guard */,
        reverseScale: /* unchanged existing guard */,
        lockPriceToBarRatio: /* unchanged existing guard */,
        showPrevDayCloseLine: /* unchanged existing guard */,
        showAverageCloseLine: /* unchanged existing guard */,
        showHighLowMarkers: /* unchanged existing guard */,

        gridColorVertical: typeof rest.gridColorVertical === 'string'
            ? rest.gridColorVertical
            : (legacyGrid ?? defaults.gridColorVertical),
        gridColorHorizontal: typeof rest.gridColorHorizontal === 'string'
            ? rest.gridColorHorizontal
            : (legacyGrid ?? defaults.gridColorHorizontal),

        gridStyleVertical: isLineStyle(rest.gridStyleVertical)
            ? rest.gridStyleVertical
            : defaults.gridStyleVertical,
        gridStyleHorizontal: isLineStyle(rest.gridStyleHorizontal)
            ? rest.gridStyleHorizontal
            : defaults.gridStyleHorizontal,

        crosshairColorVertical: typeof rest.crosshairColorVertical === 'string'
            ? rest.crosshairColorVertical
            : (legacyCross ?? defaults.crosshairColorVertical),
        crosshairColorHorizontal: typeof rest.crosshairColorHorizontal === 'string'
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

const isLineStyle = (v: unknown): v is 'solid' | 'dashed' | 'dotted' =>
    v === 'solid' || v === 'dashed' || v === 'dotted';

const isWidth = (v: unknown): v is number =>
    typeof v === 'number' && v >= 1 && v <= 3;
```

Extend `normaliseCanvasSettings` (new helper if it doesn't exist yet — matches the pattern of the others):

```ts
export function normaliseCanvasSettings(raw, defaults) {
    if (!raw || typeof raw !== 'object') return { ...defaults };
    return {
        ...defaults,
        ...raw,
        watermarkFontSize: typeof raw.watermarkFontSize === 'number'
            && raw.watermarkFontSize >= 12
            && raw.watermarkFontSize <= 96
            ? raw.watermarkFontSize
            : defaults.watermarkFontSize,
    };
}
```

Wire `normaliseCanvasSettings` into `normaliseChartSettings` alongside the existing sub-normalisers.

## Canvas Render Wiring (`CandlestickChart.tsx`)

### New helper (top of draw function, or in `helpers.ts`)

```ts
function applyLineStyle(ctx: CanvasRenderingContext2D, style: 'solid' | 'dashed' | 'dotted') {
    switch (style) {
        case 'solid':  ctx.setLineDash([]); break;
        case 'dashed': ctx.setLineDash([6, 4]); break;
        case 'dotted': ctx.setLineDash([2, 3]); break;
    }
}
```

### Grid draw block — split into V and H passes

```ts
if (scalesAndLines.showGrid) {
    // Vertical grid lines
    ctx.strokeStyle = scalesAndLines.gridColorVertical;
    applyLineStyle(ctx, scalesAndLines.gridStyleVertical);
    ctx.beginPath();
    // ... existing vertical-line geometry ...
    ctx.stroke();

    // Horizontal grid lines
    ctx.strokeStyle = scalesAndLines.gridColorHorizontal;
    applyLineStyle(ctx, scalesAndLines.gridStyleHorizontal);
    ctx.beginPath();
    // ... existing horizontal-line geometry ...
    ctx.stroke();

    ctx.setLineDash([]);
}
```

### Crosshair draw block — split into V and H passes

```ts
if (scalesAndLines.showCrosshair && mousePos) {
    // Vertical crosshair line
    ctx.strokeStyle = scalesAndLines.crosshairColorVertical;
    ctx.lineWidth = scalesAndLines.crosshairWidthVertical;
    applyLineStyle(ctx, scalesAndLines.crosshairStyleVertical);
    ctx.beginPath();
    ctx.moveTo(snappedX, 0);
    ctx.lineTo(snappedX, chartHeight);
    ctx.stroke();

    // Horizontal crosshair line
    ctx.strokeStyle = scalesAndLines.crosshairColorHorizontal;
    ctx.lineWidth = scalesAndLines.crosshairWidthHorizontal;
    applyLineStyle(ctx, scalesAndLines.crosshairStyleHorizontal);
    ctx.beginPath();
    ctx.moveTo(0, mouseY);
    ctx.lineTo(chartWidth, mouseY);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.lineWidth = 1;
}
```

### Watermark draw block

Replace the hardcoded font-size value:

```ts
ctx.font = `bold ${canvas.watermarkFontSize}px sans-serif`;
```

## Modal UI (`ChartSettingsModal.tsx`)

### Scales and lines tab — add two new subsections

Placement: after the existing "Labels" subsection, insert in order:

**Grid subsection** (disabled when `!showGrid`):

```
Grid
├─ Vertical lines
│   ├─ Color  [ColorPicker]
│   └─ Style  [LineStyleSelect: Solid / Dashed / Dotted]
└─ Horizontal lines
    ├─ Color  [ColorPicker]
    └─ Style  [LineStyleSelect]
```

**Crosshair subsection** (disabled when `!showCrosshair`):

```
Crosshair
├─ Vertical line
│   ├─ Color  [ColorPicker]
│   ├─ Style  [LineStyleSelect]
│   └─ Width  [Segmented 1 / 2 / 3]
└─ Horizontal line
    ├─ Color  [ColorPicker]
    ├─ Style  [LineStyleSelect]
    └─ Width  [Segmented 1 / 2 / 3]
```

### Canvas tab — extend Watermark row

One new control after watermark color, disabled when `!showWatermark`:

```
Font size  [Slider 12–96]  [numeric readout]
```

### New shared component — `LineStyleSelect`

Small dropdown (or button trio) with three options: Solid / Dashed / Dotted. Reused 4× in Grid + Crosshair subsections. Minimal styling — matches the existing modal's dropdown/segmented visual language.

### Color pickers and segmented controls

Reuse existing `<ColorPicker>` component (same one used for `bodyUpColor`, `bodyDownColor`, etc.) and the existing width-segmented pattern from the drawing toolbar's line-width picker.

## Task Decomposition (for writing-plans)

1. **Types + defaults + migration shim** — `types.ts`, `marketStateService.ts`, `CandlestickChart.tsx` defaults. Builds, renderer/modal still reference deleted fields — Task 2 fixes.
2. **Canvas render wiring** — `CandlestickChart.tsx` grid/crosshair/watermark draw blocks, `applyLineStyle` helper. Visual QA with defaults.
3. **Modal: Grid + Crosshair subsections** — `ChartSettingsModal.tsx`, new `LineStyleSelect.tsx`. Disabled-state wiring.
4. **Modal: Watermark font size** — `ChartSettingsModal.tsx` Canvas tab slider + readout.
5. **End-to-end QA** — legacy row migration, save/reload round-trip, every new control verified live.

## Testing Checklist (Task 5)

- [ ] Load chart with a Supabase row containing only legacy `gridColor` / `crosshairColor` → verify values migrate into both V and H fields.
- [ ] Save settings → verify `settings_json` no longer contains `gridColor` / `crosshairColor`.
- [ ] Change vertical grid color → only vertical lines update.
- [ ] Change horizontal grid style to dotted → only horizontal lines switch to dotted.
- [ ] Change crosshair vertical width to 3 → only vertical crosshair line thickens.
- [ ] Change crosshair horizontal style to solid → only horizontal crosshair line becomes solid.
- [ ] Change watermark font size → watermark text resizes live.
- [ ] Toggle `showGrid` off → Grid subsection controls disable/grey out.
- [ ] Toggle `showCrosshair` off → Crosshair subsection disables.
- [ ] Toggle `showWatermark` off → font-size slider disables.

## Files Touched

- `src/components/market-chart/types.ts`
- `src/services/marketStateService.ts`
- `src/components/market-chart/CandlestickChart.tsx`
- `src/components/market-chart/ChartSettingsModal.tsx`
- `src/components/market-chart/LineStyleSelect.tsx` (new)
- Optionally `src/components/market-chart/helpers.ts` (for `applyLineStyle`)

## Non-goals

- No visual theme changes to existing controls.
- No changes to the existing `showGrid` / `showCrosshair` / `showWatermark` toggles.
- No change to the `ColorPicker` component itself.
- No background-gradient changes.
