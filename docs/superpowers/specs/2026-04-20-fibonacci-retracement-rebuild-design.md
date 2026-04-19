# Fibonacci Retracement — Full Rebuild

**Date:** 2026-04-20
**Status:** Approved

## Goal

Delete the current Fibonacci Retracement tool entirely and rebuild it from scratch as a dedicated module with a distinctive lavender visual theme and a TradingView-style feature set.

## Scope

A full replacement of the Fibonacci Retracement drawing tool: rendering, hit detection, resize logic, default settings, and visual treatment. The type definitions (`FibSettings`, `FibLevel`) remain — extended as needed — so saved drawings in persisted state continue to deserialize.

---

## 1. Feature Scope

### Levels

**Core (visible by default):** 0, 0.236, 0.382, 0.5, 0.618, 0.705, 0.786, 1.0
**Positive extensions (visible by default):** 1.272, 1.618, 2.618
**Negative extensions (hidden by default):** −0.272, −0.618

### Interaction

- Click-drag on chart to draw (mouse-down = anchor, mouse-up = end)
- Once placed, 5 handles appear when the drawing is selected:
  - 4 corners: `(xStart, y0)`, `(xEnd, y0)`, `(xStart, y1)`, `(xEnd, y1)` — resize; opposite corner stays fixed
  - 1 midpoint at center of trend line — translate the whole drawing, proportions preserved
- Hover feedback: the level line under the cursor brightens to 1.2× its normal stroke width for the duration of the hover

### Labels

- Left side: ratio text (e.g. `0.618`), `textAnchor="end"` positioned at `xStart - 4`
- Right side: formatted price at that level, `textAnchor="start"` positioned at `xEnd + 4`
- Both labels colored per level at 0.9 opacity
- Labels clamped to canvas bounds so they never clip off-screen

### Settings (exposed in DrawingSettingsModal)

- **Extend lines**: `both` / `right` / `none`
- **Log scale**: when true, levels are calculated in log price space — level price = `exp(log(startPrice) + (log(endPrice) − log(startPrice)) * level)`
- **Snap to swing**: when true, the anchor and end auto-snap to the nearest swing high/low within ±20 bars of the mouse position on mouse-down and mouse-up
- **Reverse**: flips label direction (0 ↔ 1) without moving geometry
- **Per-level** (one row per level, all 13 levels): visibility toggle + color picker
- **Trend line**: visible toggle, color, width (1/2/3), style (solid / dashed / dotted)
- **Background fill**: showBackground toggle, backgroundTransparency slider

### Direction-aware

When drawn bottom→top (end price > start price): 0 at bottom, 1.0 at top. When drawn top→bottom (end price < start price): 0 at top, 1.0 at bottom. Extensions render outside the 0↔1 span in both cases. The **Reverse** toggle flips this after the fact.

---

## 2. Visual Design (Lavender Theme)

All levels treated equally — no bolded/emphasized level. Monochromatic lavender palette distinguishes levels by hue shift rather than weight.

### Palette

| Level | Color | Stroke | Dash |
|-------|-------|--------|------|
| 0, 1.0 (anchors) | `#6366F1` deep indigo | 1px | solid |
| 0.236, 0.786 | `#A78BFA` light lavender | 1px | solid |
| 0.382, 0.705 | `#8B5CF6` medium lavender | 1px | solid |
| 0.5 | `#8B5CF6` medium lavender | 1px | solid |
| 0.618 | `#C4B5F0` app lavender | 1px | solid |
| 1.272, 1.618, 2.618 (pos. ext.) | `#D8B4FE` | 1px | dashed `3 3` |
| −0.272, −0.618 (neg. ext.) | `#F0ABFC` pink-lavender | 1px | dashed `3 3` |

### Other visuals

- **Background fill** between consecutive core levels (0–1 range only): uses the upper level's color at 4% opacity
- **Trend line**: `#A78BFA`, 1px, dashed `4 4`
- **Labels**: 10px sans, colored per their level, 0.9 opacity, `pointer-events-none select-none`
- **Selection glow**: existing `url(#selectionGlow)` filter (already uses `#C4B5F0`)
- **Handles**: dark fill `#1f1f1f`, 2px `#C4B5F0` border, `HANDLE_RADIUS` from constants
- **Hover**: level under cursor brightens to 1.2× stroke width; reverts on mouse-out. Not persistent.
- **All lines pixel-aligned** via `Math.round()` on Y coordinates to avoid sub-pixel blur

---

## 3. Architecture

Extract all Fibonacci-specific logic out of `CandlestickChart.tsx` into a dedicated module.

### New file: `src/components/market-chart/drawings/fibonacciRetracement.tsx`

Exports three pure functions:

```ts
export function renderFibonacci(
    d: FibonacciDrawing,
    ctx: DrawingRenderContext
): JSX.Element;

export function hitTestFibonacci(
    d: FibonacciDrawing,
    p: { x: number; y: number },
    ctx: DrawingHitContext
): HitResult | null;

export function applyFibonacciResize(
    d: FibonacciDrawing,
    handle: string,
    snappedPoint: { time: number; price: number },
    initial: FibonacciDrawing
): FibonacciDrawing;
```

### DrawingRenderContext shape

```ts
interface DrawingRenderContext {
    timeToX: (time: number) => number;
    yScale: (price: number) => number;
    isSelected: boolean;
    chartDimensions: { width: number; height: number };
    renderHandle: (cx: number, cy: number, cursor?: string) => JSX.Element;
    formatPrice: (price: number) => string;
    hoveredLevel: number | null;  // which level the user is hovering, or null
    style: DrawingStyle;           // effective style (with in-progress override applied)
}
```

### DrawingHitContext shape

```ts
interface DrawingHitContext {
    timeToX: (time: number) => number;
    yScale: (price: number) => number;
    selectedDrawingId: string | null;
}
```

### Changes to `CandlestickChart.tsx`

- Delete the current `case 'Fibonacci Retracement':` render block (lines ~5993–6149)
- Delete the current Fibonacci hit-detection block (lines ~3649–3669)
- Delete the current `h === 'mid' && resized.type === 'Fibonacci Retracement'` resize case
- At the render switch: `case 'Fibonacci Retracement': return renderFibonacci(d, renderCtx);`
- At the hit-test dispatch: `if (d.type === 'Fibonacci Retracement') { const hit = hitTestFibonacci(d, p, hitCtx); if (hit) return hit; continue; }`
- At the resize dispatch: `if (resized.type === 'Fibonacci Retracement' && isFibHandle(h)) { resized = applyFibonacciResize(resized, h, snappedPoint, init); }`

### Changes to `DrawingSettingsModal.tsx`

- Replace `DefaultFibSettings` with new defaults matching the lavender palette and all 13 levels (core + 3 pos ext visible, 2 neg ext hidden)
- Replace the Fibonacci section layout with the expanded controls listed in §1 Settings

### Files that do NOT change

- `src/components/market-chart/constants.ts` — existing `FIB_LEVELS` / `FIB_LEVEL_COLORS` can remain as legacy constants; the new module owns its own level definitions
- `src/types` — `FibSettings`, `FibLevel` types stay. If a new field is needed (e.g. `extendLines: 'both' | 'right' | 'none'` replacing the boolean), extend the type with a migration-safe union.

### Hover state

`hoveredLevel` lives in `CandlestickChart.tsx` as local state. The existing mousemove handler updates it when the cursor is within `HITBOX_WIDTH` of a level line. Passed into `renderCtx`.

---

## 4. Interaction Details

### Drawing flow

1. User picks Fibonacci tool → cursor becomes crosshair
2. Mouse-down on chart at point A = anchor candidate
3. On drag: preview drawing renders from A to current cursor
4. Mouse-up at point B = end; drawing commits into the drawings array
5. If **Snap to Swing** is enabled: both A and B are adjusted on commit to the nearest swing high/low within a 20-bar window of the mouse position. Swing defined as a candle whose high/low is the extreme over a 5-bar window centered on it. If no swing is found within the window, the raw mouse position is used (no snap). Snapping applies only on commit — the in-flight preview tracks the cursor freely.

### Handles (when selected)

- 4 corners with diagonal-resize cursors:
  - `start` at `(xStart, y0)` — drag updates `start.time` and `start.price` together
  - `end` at `(xEnd, y1)` — drag updates `end.time` and `end.price` together
  - `c3` at `(xStart, y1)` — drag updates `start.time` AND `end.price` (stretches time at the 0-level while moving the 1-level price)
  - `c4` at `(xEnd, y0)` — drag updates `end.time` AND `start.price` (stretches time at the 1-level while moving the 0-level price)
- 1 midpoint at `((xStart + xEnd) / 2, (y0 + y1) / 2)` with `move` cursor. Handle ID: `mid`. Dragging translates both endpoints by the same delta (proportions preserved).

Note: `c3` and `c4` are **new** for Fibonacci in this rebuild — the previous version exposed only `start` and `end`. The names match the existing Rectangle / Gann Box convention.

### Hit detection order (first match wins)

1. Corner handles — radius `HANDLE_RADIUS + 6`
2. Midpoint handle — radius `HANDLE_RADIUS` (only when `selectedDrawingId === d.id`)
3. Trend line segment — `distToSegmentSquared < HITBOX_WIDTH²`
4. Any visible level line — `|p.y − levelY| < HITBOX_WIDTH` within the level's x-range (respects `extendLines` setting)

### Resize behaviour

- Corner drag: updates the dragged corner's time AND price. Opposite corner stays fixed. (Same as current.)
- Midpoint drag: translates both endpoints by the same delta (uses `initial.start` / `initial.end` to avoid drift).

### Hover feedback

- `hoveredLevel` is set to the level number under the cursor (or `null`) on every mousemove
- `renderFibonacci` boosts the stroke width of the hovered level to `1.2 * baseWidth` and raises its opacity to 1.0
- Cursor changes to `move` over the trend line body, to resize cursors over handles, to default otherwise

### Keyboard

- `Delete` / `Backspace` with the drawing selected removes it (existing behaviour)
- `Esc` during in-progress placement aborts (existing behaviour)

---

## Out of Scope

- True Gann fan / angle lines (separate tool, separate spec)
- Custom level add / remove UI (only visibility and color editable)
- Undo / redo for drawing actions
- Multi-drawing selection
- Presets / templates
- Any Gann Box changes (separate rebuild, separate spec)

## Files Affected

| File | Change |
|------|--------|
| `src/components/market-chart/drawings/fibonacciRetracement.tsx` | **Create** — new module with `renderFibonacci`, `hitTestFibonacci`, `applyFibonacciResize` |
| `src/components/market-chart/CandlestickChart.tsx` | Delete inline Fibonacci render / hit-test / resize blocks; wire in calls to the new module; add `hoveredLevel` state |
| `src/components/market-chart/DrawingSettingsModal.tsx` | Replace `DefaultFibSettings` and Fibonacci settings section |
| `src/components/market-chart/constants.ts` | No change (legacy `FIB_LEVELS` / `FIB_LEVEL_COLORS` may remain unused; clean up if unreferenced after the rebuild) |

## Migration / Backward Compatibility

Persisted drawings with the old `FibSettings` shape continue to render: the render function falls back to the new defaults for any setting field not present in the stored drawing. If `extendLines` changes from `boolean` to `'both' | 'right' | 'none'`, the loader normalises: `true → 'both'`, `false → 'none'`.
