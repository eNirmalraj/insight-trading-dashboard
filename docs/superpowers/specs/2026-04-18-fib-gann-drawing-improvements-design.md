# Fibonacci Retracement & Gann Box Drawing Improvements

**Date:** 2026-04-18  
**Status:** Approved

## Scope

Improve the rendering, labelling, and interaction of the two existing drawing tools while preserving their current visual language (horizontal lines + fills for Fibonacci; grid for Gann Box).

---

## Fibonacci Retracement

### Rendering
- All level lines drawn pixel-aligned (integer Y coordinates) to avoid sub-pixel blur.
- Fills between consecutive visible levels use the upper level's color at low opacity.
- Extension levels (−0.618, −0.272, 1.272, 1.618, 2.618) rendered as dashed lines at 60% opacity; hidden by default in settings but togglable.
- Trend line drawn from `start` point to `end` point in the drawing's primary color, dashed.

### Labels
- **Left side**: level ratio text (e.g. `0.618`) right-aligned, colored per level.
- **Right side**: actual price at that level (e.g. `42381.50`) left-aligned, colored per level.
- Labels clamp to canvas bounds so they never clip off screen.
- Direction-aware: when drawn bottom→top the 0 level is at the bottom; when top→bottom the 0 level is at the top. Labels and fills adapt accordingly.

### Levels
Core levels (always in settings): 0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0  
Extension levels (off by default): −0.618, −0.272, 1.272, 1.618, 2.618

### Handles (when selected)
- 4 corner handles at `(x_start, y_0)`, `(x_end, y_0)`, `(x_start, y_1)`, `(x_end, y_1)`.
- 1 midpoint handle at center of the trend line — dragging it translates both endpoints by the same delta (move without resize).
- Existing resize behaviour for corner handles preserved.

### Hit Detection
- Each visible level line: `|mouseY − lineY| < HITBOX_WIDTH` within X range.
- Trend line segment.
- Corner and midpoint handles within `HANDLE_RADIUS`.

---

## Gann Box

### Rendering
- Same grid layout: horizontal price lines + vertical time lines forming a grid.
- Grid cells filled with per-level color at very low opacity (keep existing pattern).
- Outer border drawn last so it sits on top of fills.
- All lines pixel-aligned.

### Labels
- **Price labels** (left of box): actual price value at each horizontal level, right-aligned, colored per level.
- **Time labels** (bottom of box): formatted date/time at each vertical level, centered, colored per level. Format: `MMM DD HH:mm` derived from the canvas X→time mapping.
- Top/right labels remain (existing `useTopLabels`, `useRightLabels` flags respected).

### Handles (when selected)
- **8 handles**: 4 corners + 4 edge midpoints (top-center, right-center, bottom-center, left-center).
- Cursors: corners → diagonal resize; edge midpoints → axis-constrained resize.
- Edge midpoint drag: top/bottom midpoints change only Y (price range); left/right midpoints change only X (time range).

### Hit Detection
- Interior click → move the whole box.
- Any edge (`distToSegment < HITBOX_WIDTH`) → resize from that edge.
- Corner handles (enlarged radius) → diagonal resize.
- Edge midpoint handles → axis-constrained resize.

---

## Files Affected

| File | Changes |
|------|---------|
| `src/components/market-chart/CandlestickChart.tsx` | Rewrite Fibonacci (~lines 5993–6149) and Gann Box (~lines 6150–6363) rendering blocks; update hit detection blocks (~lines 3649–3669, 3753–3780); add midpoint handle to Fibonacci resize handling |
| `src/components/market-chart/constants.ts` | Add extension level definitions for Fibonacci |
| `src/components/market-chart/DrawingSettingsModal.tsx` | Add extension levels to Fibonacci settings defaults (off by default) |

## Out of Scope
- True Gann fan/angle lines (diagonal lines from origin).
- Log scale for Fibonacci.
- Custom level add/remove UI.
- Undo/redo for settings changes.
