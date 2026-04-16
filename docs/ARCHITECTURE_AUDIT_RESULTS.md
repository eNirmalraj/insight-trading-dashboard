# Kuri Script Architecture Audit Results

## Executive Summary
An architecture audit was conducted to verify that the **Single Source of Truth (SSoT)** principle is maintained across the application, specifically ensuring that the `.kuri` engine remains the exclusive source for indicator settings and signal extraction.

### Overall Status: 🔴 Fails for Custom Scripts, 🟢 Passes for Built-ins

While the architecture for built-in indicators correctly parses `.kuri` source code and dynamically yields inputs/plots for the `IndicatorSettingsPanel`, the integration with **Strategy Studio (Custom Scripts)** and the **Signal Engine** is severely broken. Legacy bypasses are preventing custom `.kuri` scripts from being executed upon chart addition or signal generation.

---

## Detailed Findings

### Audit 1: IndicatorSettingsPanel.tsx
**Status: 🟢 Pass (with Legacy Fallback)**
- The settings panel correctly reads from `result.inputDefs` and `result.plots`. 
- Inputs dynamically map to `KuriInputWidget`s based on `int`, `float`, `color`, `bool`, etc. 
- *Note:* A legacy fallback exists for non-Kuri indicators (`legacySettings`), but this does not compromise the SSoT for Kuri scripts because `hasKuriDefs` properly routes the UI to the engine’s dynamic fields.

### Audit 2.2: Cross-check with .kuri Code
**Status: 🟢 Pass**
- Built-in indicators (`sma.kuri`, `bb.kuri`, etc.) correctly pass their source code through `KuriBridge.run()`, which auto-generates the settings panel accurately matching the `input.*` definitions.

### Audit 3: Signal Page Alert Extraction
**Status: 🔴 Fail**
- **Issue:** In `src/engine/strategyEngine.ts`, `runStrategy` explicitly rejects any strategy where `type !== 'KURI'`. However, `StrategyStudio` saves custom scripts with `type = 'INDICATOR'` or `type = 'STRATEGY'`. 
- **Consequence:** Custom `.kuri` scripts created in Strategy Studio will **never** generate signals because the engine skips them.

### Audit 4: SSoT Integration Tests (A through E)
**Status: 🔴 Complete Failure for Custom Scripts**
- **Issue:** In `src/components/market-chart/CandlestickChart.tsx`, `handleAddCustomIndicator` receives the script from Strategy Studio but contains the explicitly hardcoded comment: `// Kuri script execution removed — custom scripts now use JSON indicator configs only`. 
- **Consequence:** When adding a custom script from the Strategy Studio to the chart, the system attempts to read a legacy JSON `script.indicators` array entirely bypassing the `.kuri` source code (`scriptSource`). Therefore, **Tests A, B, C, D** silently fail because modified inputs/plots will never appear on the chart Settings Panel, and no plot data is drawn.

---

## Required Fixes

To achieve a true Single Source of Truth architecture:

1. **`CandlestickChart.tsx`:** Rewrite `handleAddCustomIndicator` to run `bridge.run(script.scriptSource)` to extract `inputDefs`, `plots`, and `data` and feed them into the `IndicatorSettingsPanel` (just like built-in indicators).
2. **`strategyEngine.ts`:** Update `runStrategy` to accept `type === 'STRATEGY' || type === 'INDICATOR' || type === 'KURI'` so that the Signal engine evaluates custom Kuri scripts.
3. **`types.ts` & `strategyService.ts`:** Align the property name containing the `.kuri` script content. StrategyStudio relies on `scriptSource` but `types.ts` defines `kuriScript` and `content`. Ensure `handleAddCustomIndicator` reads the correct property.
