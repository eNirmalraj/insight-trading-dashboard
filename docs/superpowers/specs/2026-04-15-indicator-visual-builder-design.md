---
title: Indicator Visual Builder (MFL-capable)
date: 2026-04-15
status: approved
---

# Indicator Visual Builder

A no-code visual builder for creating `.kuri` indicator scripts, targeting non-technical traders (same audience as the Strategy Visual Builder). Scoped to the "level + pattern" archetype in v1, with a reusable shell that can host additional archetypes (Moving Average, Oscillator, Trend Follower) later.

## Goal

Let users build advanced indicators in the style of Money Flow Levels (MFL) — HTF-anchored levels, OHLC-based level math, pattern detection, and alerts — without writing Kuri code.

## Target archetype (v1)

"Level & Pattern" indicators: compute N named levels from OHLC on a chosen timeframe, draw them, detect patterns (false rejection, false breakout, two-wick, breakout+follow-through, single rejection) on each level, and emit alerts.

Covers: MFL, session highs/lows, pivots, support/resistance bands, prev-session OHLC anchors.
Does not cover (v1): moving averages, oscillators, trend followers. Those are future archetypes sharing the same shell.

## Where it lives

- [IndicatorEditorPanel.tsx](../../../src/components/market-chart/IndicatorEditorPanel.tsx) gets a Visual/Code toggle mirroring Strategy Studio.
- Visual builder stays mounted on toggle (state preserved).
- Monaco editor auto-updates from the visual builder's codegen, same pattern as Strategy Studio.

## Wizard steps

1. **Info** — name, shortname, overlay vs pane.
2. **Parameters** — add user-adjustable inputs (int / float / source / bool) with title, min, max, default. Lock toggle: locked params get hardcoded in generated code, unlocked become `param.*` calls.
3. **Data Source** — HTF picker (`Current / Daily / Weekly / Monthly / Prev Session / Custom`) + anchor type (`This window's open` / `Previous window's close` / `Rolling N bars`). Codegen wires up HTF time tracking / `request.security` boilerplate.
4. **Levels** — add N named levels. Each level:
   - Preset dropdown (*Above Open ATR*, *Below Open ATR*, *Session High*, *Prev Close + %*, *Pivot*, *Custom*) auto-fills the recipe fields.
   - Recipe: `[base: O/H/L/C] [+/−] [multiplier: number or param] × [offset source: ATR / Range / Points / %]`.
   - Color + line style pickers.
5. **Patterns** — matrix: levels down the side, 5 patterns across the top (FR / FB / TW / BF / SR) with buy+sell variants togglable per cell. Each enabled cell produces a `kuri.alert()` + `plotshape()` marker.
6. **Alerts** — auto-generated rows from Step 5 (editable title/message, not deletable here) plus custom alerts via "+ Add Alert":
   - *Price crosses level* (crosses above / below / touches)
   - *Level breakout + close* (break then close beyond)
   - *New HTF window starts*
   - Title + message template supports `{level}`, `{price}`, `{symbol}` placeholders.
7. **Review** — code preview (live Monaco readonly) + save button.

## Codegen

Assembles a `.kuri` file with four sections:
1. Header + params (from Step 2)
2. HTF boilerplate (from Step 3)
3. Level calculations (from Step 4) — each level becomes a variable assignment + `mark.level()` or `line.new()` depending on archetype
4. Pattern helpers + `kuri.alert()` + `plotshape()` (from Steps 5 & 6). Helper functions (`f_falseRejBuy`, `f_falseRejSell`, `f_falseBrkBuy`, etc.) are injected only when used — same pattern as the Strategy Visual Builder.

## Parser round-trip

Reuses existing [kuriSourceParser.ts](../../../src/components/strategy-studio/visual-builder/kuriSourceParser.ts) to round-trip edited code back into the builder. Builder state is authoritative when visual is the active mode; parser hydrates from existing `.kuri` sources when opening a saved indicator.

## Shell reuse

The wizard shell (stepper, navigation, code preview pane, save flow) is a generic component. Future archetypes drop in as new step sets without rewriting navigation.

## Files

```
src/components/market-chart/visual-indicator-builder/
  IndicatorVisualBuilder.tsx     — main wizard shell
  codegen.ts                     — .kuri generator
  patterns.ts                    — pattern helper templates (FR/FB/TW/BF/SR)
  steps/
    StepInfo.tsx
    StepParameters.tsx
    StepDataSource.tsx
    StepLevels.tsx
    StepPatterns.tsx
    StepAlerts.tsx
    StepReview.tsx
```

Plus wiring in [IndicatorEditorPanel.tsx](../../../src/components/market-chart/IndicatorEditorPanel.tsx) for the Visual/Code toggle.

## Out of scope (v1)

- Free-form math expression builder
- Archetypes other than Level & Pattern
- Label position customization beyond defaults
- Plotshape customization beyond pattern markers
- Custom timeframe anchors beyond the three listed