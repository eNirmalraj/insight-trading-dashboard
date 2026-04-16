# Indicator Bug Fix Report — Antigravity Kuri Integration

> Complete audit of all indicator-related changes across the Kuri Script integration.
> Covers initial implementation + 3 bug fix rounds.

---

## Bug 1: MA/EMA Indicators Not Appearing on Chart

**Problem:** When adding MA (20), EMA (20), or MA Ribbon from the Indicator Picker, empty panes appeared below the chart with Y-axis scales (14, 38, 62, 86) but no lines were drawn. Overlay indicators should render ON the candlestick chart, not in separate panes.

**Root Cause:** The overlay/pane routing filter in CandlestickChart.tsx had broken dead code from a previous `kuriOverlay` property removal:

```typescript
// BROKEN — false !== undefined is always TRUE, so return fires for EVERY indicator
const overlayIndicators = allActiveIndicators.filter((i) => {
    if (false /* removed kuriOverlay */ !== undefined)
        return false /* removed kuriOverlay */;   // ← always reached!
    return OVERLAY_TYPES.includes(i.type);         // ← dead code
});
```

This caused `overlayIndicators` to always be empty and `panelIndicators` to contain everything.

**Files Changed:**
- `src/components/market-chart/CandlestickChart.tsx` — Removed broken `kuriOverlay` dead code from both `overlayIndicators` and `panelIndicators` filters. Cleaned up `UNKNOWN_REMOVED` entries from `OVERLAY_TYPES`.

**Fix:**
```typescript
const overlayIndicators = allActiveIndicators.filter(i => OVERLAY_TYPES.includes(i.type));
const panelIndicators = allActiveIndicators.filter(i => !OVERLAY_TYPES.includes(i.type));
```

---

## Bug 2: WMA, ATR, Ichimoku, Donchian, HMA, VWMA Not Working

**Problem:** After the overlay fix, MA and EMA rendered correctly but WMA, HMA, VWMA, ATR, ADR, Donchian, and Ichimoku did not appear at all when added from the picker.

**Root Cause:** A three-link type mismatch chain was broken at every link:

1. **IndicatorType union** (types.ts) was missing `WMA`, `HMA`, `VWMA`, `ADR`, `Donchian`, `Ichimoku`
2. **REGISTRY_TO_TYPE mapping** (IndicatorPickerModal.tsx) had missing entries and wrong mappings (e.g., `vwma` mapped to `'VWAP'` instead of `'VWMA'`)
3. **calculateIndicatorData switch** (CandlestickChart.tsx) had no cases for `WMA`, `HMA`, `VWMA`, `ADR`, `Donchian`, `Ichimoku`
4. **getDefaultIndicatorSettings** had no entries for the new types
5. **Renderers** — Donchian renderer didn't match `'Donchian'` type string, read `data.basis` instead of `data.middle`, MA Ribbon renderer checked `key.startsWith('ma_')` but core-ta returns keys `ma1`, `ma2`

**Files Changed:**

- `src/components/market-chart/types.ts` — Added `WMA`, `HMA`, `VWMA`, `ADR`, `Donchian`, `Ichimoku` to IndicatorType union.

- `src/components/market-chart/IndicatorPickerModal.tsx` — Added missing REGISTRY_TO_TYPE entries: `wma → 'WMA'`, `hma → 'HMA'`, `adr → 'ADR'`, `donchian → 'Donchian'`, `ichimoku → 'Ichimoku'`, `mfi → 'MFI'`. Fixed `vwma → 'VWMA'` (was incorrectly `'VWAP'`).

- `src/components/market-chart/CandlestickChart.tsx`:
  - Added `calculateIndicatorData` cases for: `WMA`, `HMA`, `VWMA`, `ADR`, `Donchian`, `Ichimoku`
  - Added `getDefaultIndicatorSettings` entries for: `WMA`, `HMA`, `VWMA`, `ADR`, `KC`, `Donchian`, `Ichimoku`, `ADX`
  - Added `'Donchian'` to OVERLAY_TYPES list
  - Fixed Donchian renderer to match `indicator.type === 'Donchian'`
  - Fixed both Donchian and KC renderers to check `data.middle` before `data.basis`
  - Fixed MA Ribbon renderer: `key.startsWith('ma_')` → `key.startsWith('ma')`

**Fix:** Complete type chain for every indicator:
```
Picker ID → REGISTRY_TO_TYPE → IndicatorType → calculateIndicatorData case → core-ta function → Renderer match
```

---

## Bug 3: RSI, OBV, and All Pane Indicators Not Working

**Problem:** Overlay indicators worked after Bug 1+2 fixes, but pane indicators (RSI, OBV, CCI, MFI, ATR, ADR, ADX, Volume) showed empty panels with no lines drawn.

**Root Cause:** Data key mismatch between `calculateIndicatorData` and the pane canvas renderer.

- `calculateIndicatorData` returned `{ value: ta.rsi(...) }` (key: `value`)
- The pane canvas renderer at line ~2437 read `indicator.data.main` (key: `main`)
- The overlay SVG renderer read `indicator.data[dataKeys[0]]` (first key, any name) — so overlays worked fine

The pane renderer consistently uses `main` for:
- Auto-scaling (line 2437): `indicator.data.main?.[dataIndex]`
- RSI drawing (line 2765): `const main = indicator.data.main`
- CCI drawing (line 2626): `const main = indicator.data.main`
- MFI drawing (line 2665): `const main = indicator.data.main`
- OBV drawing (line 2684): `const main = indicator.data.main`
- ADX drawing (line 2646): `const main = indicator.data.main`
- Crosshair tooltip (line 2807): `indicator.data.main`

**Files Changed:**
- `src/components/market-chart/CandlestickChart.tsx` — Changed all pane indicator return keys from `value` to `main`:

**Fix:**

| Indicator | Before (broken) | After (fixed) |
|-----------|-----------------|---------------|
| RSI | `{ value: ta.rsi(...) }` | `{ main: ta.rsi(...) }` |
| CCI | `{ value: ta.cci(...) }` | `{ main: ta.cci(...) }` |
| MFI | `{ value: ta.mfi(...) }` | `{ main: ta.mfi(...) }` |
| ATR | `{ value: ta.atr(...) }` | `{ main: ta.atr(...) }` |
| ADR | `{ value: ta.adr(...) }` | `{ main: ta.adr(...) }` |
| OBV | `{ value: ta.obv(...) }` | `{ main: ta.obv(...) }` |
| ADX | `{ value: ta.atr(...) }` | `{ main: ta.atr(...) }` |
| Volume | `{ value: vol... }` | `{ main: vol... }` |

Overlay indicators (MA, EMA, WMA, HMA, VWMA, VWAP) kept `value` key since the SVG renderer reads by first key. Multi-series indicators (MACD, Stochastic, BB, KC, Donchian, Ichimoku, SuperTrend) kept their specific keys.

---

## Complete File Inventory

### New Files Created (6)

| File | Purpose | Lines |
|------|---------|-------|
| `src/lib/kuri/types.ts` | TypeScript interfaces for KuriResult, KuriError, InputDef, PlotData, drawings, tables | ~115 |
| `src/lib/kuri/core-ta.ts` | Layer 1 pure TypeScript TA math (31 exported functions) | ~380 |
| `src/indicators/index.ts` | Indicator registry with 18 defaults + metadata, Vite `?raw` imports | ~80 |
| `src/components/market-chart/IndicatorPickerModal.tsx` | Searchable indicator browser with categories | ~250 |
| `src/components/market-chart/IndicatorSettingsPanel.tsx` | Auto-generated settings panel (numbers, colors, strings) | ~190 |
| `src/components/market-chart/KuriTableOverlay.tsx` | Kuri table.* overlay renderer (9 positions, per-cell styling) | ~80 |

### Existing Files Modified (7)

| File | What Changed |
|------|-------------|
| `src/components/market-chart/types.ts` | Added `WMA`, `HMA`, `VWMA`, `ADR`, `Donchian`, `Ichimoku` to IndicatorType union |
| `src/components/market-chart/CandlestickChart.tsx` | Replaced stub imports, built `calculateIndicatorData` (22 cases), fixed overlay/pane routing, fixed renderers (Donchian, MA Ribbon, data key alignment) |
| `src/components/market-chart/kuriDrawingConverter.ts` | Replaced stub with typed converter for lines/labels/boxes |
| `src/engine/strategyEngine.ts` | Replaced fake Kuri/BackendVM stubs with KuriBridge, added `compileAndRun`/`compileOnly` exports, wired `runAllStrategies` |
| `src/pages/StrategyStudio.tsx` | Replaced `registerKuriLanguage` stub + `ScriptEngine.provideDiagnostics` stub with real Kuri imports, added compile-before-save to Add to Chart |
| `src/components/strategy-studio/OpenScriptModal.tsx` | Wired Built-in Indicators tab to DEFAULT_INDICATORS registry |
| `src/lib/kuri/kuri-bridge.ts` | Fixed UMD import for Vite/Rollup (`import * as` instead of default import) |

---

## Functions Added to core-ta.ts

| Function | Signature | Category |
|----------|-----------|----------|
| `sma` | `(source[], length) → (number\|null)[]` | Moving Average |
| `ema` | `(source[], length) → (number\|null)[]` | Moving Average |
| `wma` | `(source[], length) → (number\|null)[]` | Moving Average |
| `rma` | `(source[], length) → (number\|null)[]` | Moving Average |
| `hma` | `(source[], length) → (number\|null)[]` | Moving Average |
| `vwma` | `(source[], volume[], length) → (number\|null)[]` | Moving Average |
| `rsi` | `(source[], length) → (number\|null)[]` | Oscillator |
| `macd` | `(source[], fast, slow, signal) → { macd, signal, histogram }` | Oscillator |
| `stochastic` | `(high[], low[], close[], periodK, smoothK, periodD) → { k, d }` | Oscillator |
| `cci` | `(source[], length) → (number\|null)[]` | Oscillator |
| `mfi` | `(high[], low[], close[], volume[], length) → (number\|null)[]` | Oscillator |
| `trueRange` | `(high[], low[], close[]) → number[]` | Volatility |
| `atr` | `(high[], low[], close[], length) → (number\|null)[]` | Volatility |
| `bb` | `(source[], length, mult) → { upper, basis, lower }` | Volatility |
| `keltnerChannels` | `(source[], high[], low[], close[], length, atrLen, mult, useEma) → { upper, basis, lower }` | Volatility |
| `donchianChannels` | `(high[], low[], length) → { upper, basis, lower }` | Volatility |
| `supertrend` | `(high[], low[], close[], atrPeriod, factor) → { supertrend, direction }` | Trend |
| `ichimoku` | `(high[], low[], convPeriod, basePeriod, spanBPeriod) → { conversion, base, spanA, spanB }` | Trend |
| `obv` | `(close[], volume[]) → (number\|null)[]` | Volume |
| `vwap` | `(high[], low[], close[], volume[]) → (number\|null)[]` | Volume |
| `maRibbon` | `(source[], periods[], maType) → Record<string, (number\|null)[]>` | Utility |
| `adr` | `(high[], low[], length) → (number\|null)[]` | Utility |

---

## Cases Added to calculateIndicatorData()

| Type String | Return Keys | Renderer Target |
|-------------|-------------|-----------------|
| `'MA'` | `{ value }` | Overlay SVG line |
| `'EMA'` | `{ value }` | Overlay SVG line |
| `'WMA'` | `{ value }` | Overlay SVG line |
| `'HMA'` | `{ value }` | Overlay SVG line |
| `'VWMA'` | `{ value }` | Overlay SVG line |
| `'MA Ribbon'` | `{ ma1, ma2, ma3, ... }` | Overlay SVG multi-line |
| `'RSI'` | `{ main }` | Pane canvas + hlines 30/70 |
| `'MACD'` | `{ macd, signal, histogram }` | Pane canvas (histogram bars + 2 lines) |
| `'Stochastic'` | `{ k, d }` | Pane canvas + hlines 20/50/80 |
| `'CCI'` | `{ main }` | Pane canvas + hlines -100/0/+100 |
| `'MFI'` | `{ main }` | Pane canvas + hlines 20/80 |
| `'BB'` | `{ upper, middle, lower }` | Overlay SVG band with fill |
| `'ATR'` | `{ main }` | Pane canvas single line |
| `'ADR'` | `{ main }` | Pane canvas single line |
| `'KC'` | `{ upper, middle, lower }` | Overlay SVG band |
| `'Donchian'` | `{ upper, middle, lower }` | Overlay SVG band with fill |
| `'SuperTrend'` | `{ supertrend, direction }` | Overlay SVG directional line |
| `'Ichimoku'` | `{ conversion, base, spanA, spanB }` | Overlay SVG cloud + lines |
| `'OBV'` | `{ main }` | Pane canvas single line |
| `'VWAP'` | `{ value }` | Overlay SVG line |
| `'Volume'` | `{ main }` | Pane canvas bars |
| `'ADX'` | `{ main }` | Pane canvas + hlines 25/50 |

---

## Rendering Pipeline Changes

### Overlay (SVG on main chart canvas)
- Single-line indicators: read `data[dataKeys[0]]` — works with any key name
- BB: reads `data.upper`, `data.middle`, `data.lower` + polygon fill
- KC: reads `data.upper`, `data.middle`, `data.lower` (fixed to check `middle` before `basis`)
- Donchian: reads `data.upper`, `data.middle`, `data.lower` (fixed to match `'Donchian'` type + check `middle`)
- Ichimoku: reads `data.conversion`, `data.base`, `data.spanA`, `data.spanB` + cloud fill
- SuperTrend: reads `data.supertrend`, `data.direction` for color switching
- MA Ribbon: iterates all keys starting with `'ma'` (fixed from `'ma_'`)

### Pane (Canvas below main chart)
- All single-series indicators: read `data.main` (key alignment fix from Bug 3)
- MACD: reads `data.macd`, `data.signal`, `data.histogram` (histogram as bars)
- Stochastic: reads `data.k`, `data.d`
- Auto-scaling: bounded indicators (RSI, Stochastic, MFI) use fixed 0-100 range; CCI uses padded range around -100/+100; others auto-scale from visible data

---

*Report generated from audit of all indicator changes across the Kuri Script integration sessions.*
