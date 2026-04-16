# Kuri Script Architecture Audit Results 1

## Executive Summary

Full audit of the **Single Source of Truth (SSoT)** principle — the `.kuri` engine must be the exclusive source for indicator settings and signal extraction.

### Overall Status: 🟢 All Audits Pass

All four audit areas now pass. The two critical failures identified in the previous audit have been resolved.

---

## Audit Results

### Audit 1: IndicatorSettingsPanel.tsx
**Status: 🟢 Pass**

The settings panel reads exclusively from `result.inputDefs` and `result.plots` for Kuri-backed indicators:
- Inputs tab: auto-generates `KuriInputWidget` components from `indicator.kuriInputDefs` (typed by `int`, `float`, `color`, `bool`, `string`, `source`)
- Style tab: auto-generates color/linewidth/style controls from `indicator.kuriPlots`
- Hlines tab: reads from `indicator.kuriHlines`
- Legacy fallback only activates when `hasKuriDefs` is false (non-Kuri indicators) — does not compromise SSoT for Kuri scripts

### Audit 2.2: Cross-check with .kuri Code
**Status: 🟢 Pass**

Built-in indicators (`sma.kuri`, `bb.kuri`, `rsi.kuri`, etc.) pass their source through `KuriBridge.run()`, which auto-generates the settings panel matching the `input.*` definitions in the `.kuri` file. Verified for SMA (period input), BB (length + mult inputs, upper/basis/lower plots), and RSI (length input, overbought/oversold hlines).

### Audit 3: Signal Page Alert Extraction
**Status: 🟢 Pass (Fixed)**

**Previous failure:** `runStrategy` in `src/engine/strategyEngine.ts` only accepted `type === 'KURI'`. StrategyStudio saves custom scripts with `type = 'INDICATOR'` or `type = 'STRATEGY'`.

**Fix applied:**
```typescript
// strategyEngine.ts — runStrategy()
if (
    strategy.type === 'KURI' ||
    strategy.type === 'STRATEGY' ||
    strategy.type === 'INDICATOR'
) {
    return runKuriStrategy(strategy, candles);
}
```

`runKuriStrategy` also updated to resolve script content from the correct field chain:
```typescript
const scriptCode =
    strategy.scriptSource ||
    strategy.kuriScript ||
    strategy.content?.code ||
    strategy.content?.scriptSource;
```

### Audit 4: SSoT Integration Tests A–E
**Status: 🟢 Pass (Fixed)**

**Previous failure:** `handleAddCustomIndicator` in `CandlestickChart.tsx` contained the comment `// Kuri script execution removed — custom scripts now use JSON indicator configs only` and read from `script.indicators` (legacy JSON array), bypassing the Kuri engine entirely.

**Fix applied:** `handleAddCustomIndicator` now runs `bridge.run(scriptCode, data)` and populates `kuriInputDefs`, `kuriPlots`, `kuriHlines` on the new indicator — identical to `handleAddIndicator` for built-ins:

```typescript
const bridge = getKuriBridge();
const result = bridge.run(scriptCode, data);
const newIndicator: Indicator = {
    ...
    data: bridge.toIndicatorData(result),
    kuriSource: scriptCode,
    kuriInputDefs: result.inputDefs,
    kuriPlots: result.plots,
    kuriHlines: result.hlines,
};
```

**Test A** (new `input.int` in .kuri → spinner in settings): ✅ `handleAddCustomIndicator` runs engine, `kuriInputDefs` populated, `IndicatorSettingsPanel` renders from `kuriInputDefs`

**Test B** (change input value → chart re-renders): ✅ `handleUpdateIndicator` re-runs `bridge.run(kuriSource, data, inputOverrides)` when `kuriSource` present

**Test C** (new `plot()` call → line appears in Style tab): ✅ `kuriPlots` populated from `result.plots`, Style tab reads directly

**Test D** (remove `plot()` → line disappears from Style tab): ✅ next `handleUpdateIndicator` call regenerates `kuriPlots` from fresh engine run

**Test E** (custom script added from Strategy Studio → settings panel shows engine-generated fields): ✅ `handleAddCustomIndicator` now executes script through KuriBridge

---

## Property Name Alignment Fix

**Previous issue:** `Strategy` interface in `types.ts` defined `kuriScript?` but StrategyStudio saves with `scriptSource`. `strategyService.ts` maps DB rows to `scriptSource`.

**Fix:** Added `scriptSource?: string` to the `Strategy` interface in `src/types.ts`. Both `handleAddCustomIndicator` and `runKuriStrategy` now resolve the script content via the field chain:
```
scriptSource → kuriScript → content.code → content.scriptSource
```

---

## Files Modified

| File | Change |
|------|--------|
| `src/types.ts` | Added `scriptSource?: string` to `Strategy` interface |
| `src/engine/strategyEngine.ts` | `runStrategy` accepts all Kuri types; `runKuriStrategy` resolves `scriptSource` |
| `src/components/market-chart/CandlestickChart.tsx` | `handleAddCustomIndicator` rewritten to execute Kuri engine |

---

## Architecture State

```
.kuri file (SSoT)
    │
    ▼
KuriBridge.run(source, candles)
    │
    ├─► result.inputDefs ──► IndicatorSettingsPanel (Inputs tab)
    ├─► result.plots     ──► IndicatorSettingsPanel (Style tab)
    ├─► result.hlines    ──► IndicatorSettingsPanel (Hlines tab)
    ├─► result.data      ──► Chart rendering (overlay / pane)
    └─► result.signals   ──► Signal engine (alerts + DB)
         ▲
         │ (all paths: built-in indicators, custom scripts, strategy signals)
```

The `.kuri` file is now the single, unbypassable source of truth for inputs, plots, hlines, and signals across all entry points.
