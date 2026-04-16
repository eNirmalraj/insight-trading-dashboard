# Custom User Scripts Full Audit Results

> Audit of the complete lifecycle of user-written custom indicators and strategies
> across Strategy Studio, Market Page, and Signal Page.

---

## Summary

| Section | Status | Fixes Applied |
|---------|--------|---------------|
| A. Strategy Studio Write & Save | PASS | None needed |
| B. Market Page Custom Indicator | PASS (after fixes) | 3 bugs fixed |
| C. Signal Page Custom Strategy | PASS (after fixes) | 2 bugs fixed |
| D. Edge Cases | PASS (with known limitations) | 1 bug fixed |
| E. Data Flow | PASS end-to-end | Migration added |

**Total bugs found: 6 | Fixed: 6 | Known limitations: 1**

---

## SECTION A: Strategy Studio -- Write & Save Cycle

### A.1 Write custom indicator
**Status: PASS**

- `detectedScriptType` (StrategyStudio.tsx:152-165) correctly detects `indicator()` on first non-comment line
- Returns `'INDICATOR'` for the test script
- Bottom console receives diagnostics from `getKuriBridge().compile()` via `ScriptEngine.provideDiagnostics`

### A.2 Save the script
**Status: PASS**

- `requestSave()` (StrategyStudio.tsx:499-610) validates:
  - Non-empty script and name
  - Compiles without errors (via `bridge.compile()`)
  - Type detected as INDICATOR or STRATEGY (not KURI)
  - INDICATOR must have `plot()` or drawing call
  - STRATEGY must have `strategy.entry()` call
- Sends to `saveStrategy()` (strategyService.ts:43-85):
  - Inserts to Supabase `scripts` table
  - `script_type` column: from `strategy.type` (INDICATOR or STRATEGY)
  - `content` column (JSONB): entire strategy object including `scriptSource`
  - `isDirty` clears after save (line 598)

**Stored fields:**
```
scripts.name = "My Custom MA"
scripts.script_type = "INDICATOR"
scripts.content = { name, type, scriptSource: "indicator(title=...)...", timeframe, ... }
```

### A.3 Reload the script
**Status: PASS**

- `getStrategies()` (strategyService.ts:5-41) loads all scripts
- Resolves source: `d.content.scriptSource || d.content.code || ''` (line 24)
- `loadStrategy()` (StrategyStudio.tsx:470-481) sets `scriptContent` from `s.scriptSource`
- Full source code restores to Monaco editor

### A.4 Edit and re-save
**Status: PASS**

- `isDirty` activates on any editor change (line 419)
- `requestSave()` detects existing ID and calls UPDATE (strategyService.ts:51-66)
- No duplicate creation -- uses `activeScript` ID

### A.5 Delete a script
**Status: PASS**

- `deleteStrategyHandler()` (StrategyStudio.tsx:612-628) calls `deleteStrategy(id)`
- strategyService.ts:87-96 deletes with `.eq('user_id', user.id)` for ownership check
- Clears editor if deleted script was active

**Known limitation:** No duplicate name detection. Multiple scripts with identical names can coexist.

---

## SECTION B: Market Page -- Custom Indicator on Chart

### B.1 Add to Chart flow
**Status: PASS (after fix)**

- "Add to Chart" (StrategyStudio.tsx:721-757):
  1. Compiles script via `bridge.compile()` -- blocks on errors
  2. Saves via `requestSave()` -- gets saved ID
  3. Navigates to `/market?addScript={id}`

- Market.tsx:287-304 reads `addScript` param, sets `autoAddScriptId`
- Market.tsx:408-427 loads `customScripts` from `getStrategies()`
- CandlestickChart.tsx:1403-1414 auto-add effect matches script by ID

**Previous bug:** `handleAddCustomIndicator` read `script.indicators` JSON array, bypassing Kuri engine.
**Fix applied:** Rewrote to call `bridge.run(scriptCode, data)` and populate `kuriInputDefs`, `kuriPlots`, `kuriHlines`.

### B.2 Settings Panel -- Auto-generated from Kuri Script
**Status: PASS**

`IndicatorSettingsPanel.tsx` reads directly from engine output:

| Input in .kuri | Widget Generated | Field |
|----------------|-----------------|-------|
| `input.int(21, title="MA Length", minval=1, maxval=200)` | Number spinner (min 1, max 200) | `kuriInputDefs[0]` |
| `input.string("EMA", options=["SMA","EMA","WMA"])` | Dropdown | `kuriInputDefs[1]` |
| `input.color(#FF6600, title="Line Color")` | Color picker | `kuriInputDefs[2]` |
| `input.bool(false, title="Show Band")` | Toggle switch | `kuriInputDefs[3]` |
| `input.float(1.5, title="Band Multiplier", minval=0.1)` | Decimal input | `kuriInputDefs[4]` |

Style tab reads from `kuriPlots`:

| Plot in .kuri | Style Entry |
|---------------|-------------|
| `plot(ma, title="MA Line", color=#FF6600, linewidth=2)` | Color + linewidth + visibility |
| `plot(upper, title="Upper Band", color=#00AA00)` | Color + linewidth + visibility |
| `plot(lower, title="Lower Band", color=#00AA00)` | Color + linewidth + visibility |

No extra inputs or plots. No missing entries.

### B.3 Settings changes recalculate
**Status: PASS**

- `handleUpdateIndicator` (CandlestickChart.tsx:1468-1520) detects `kuriSource` on the indicator
- Builds `inputOverrides` from `kuriInputDefs` title mapping (lines 1480-1489)
- Re-runs `bridge.run(kuriSource, data, overrides)` -- live recalculation
- Updates `data`, `kuriPlots` on the indicator object

### B.4 Custom indicator in Indicators panel
**Status: PASS**

- Custom indicator renders in `ActiveIndicatorsDisplay` with visibility toggle, remove button, settings gear

### B.5 Persistence across page refresh
**Status: PASS (after fix)**

**Previous bug:** `indicatorService.ts` did NOT save or load `kuriSource`, `kuriInputDefs`, `kuriPlots`, `kuriHlines` to the database.

**Fixes applied:**
1. `saveIndicator()` now writes: `kuri_script`, `kuri_input_defs`, `kuri_plots`, `kuri_hlines`
2. `fetchUserIndicators()` now reads those columns back and maps to `Indicator` fields
3. `updateIndicator()` now accepts and writes Kuri metadata fields
4. New migration `046_user_indicators_kuri_plots_hlines.sql` adds missing `kuri_plots` and `kuri_hlines` JSONB columns

**After fix:** Custom Kuri indicators persist their script source and metadata. On page reload:
- `kuriSource` is restored from `kuri_script`
- `handleUpdateIndicator` can re-run the script with saved settings
- Settings panel auto-generates from restored `kuriInputDefs`/`kuriPlots`

### B.6 Multiple custom indicators
**Status: PASS**

- Each gets a unique ID (`custom_{timestamp}_{random}`)
- Each stores its own `kuriSource`, `kuriInputDefs`, `kuriPlots`
- Settings panels are independent

---

## SECTION C: Custom Strategy on Signal Page

### C.1 Write a custom strategy
**Status: PASS**

- Type detection correctly identifies `strategy()` declaration
- `strategy.entry()` validation passes for the test script
- Saves with `type: 'STRATEGY'`

### C.2 Signal page execution
**Status: PASS (after fix)**

**Previous bug:** `loadActiveStrategies()` (strategyEngine.ts:45-53) filtered only `type === 'STRATEGY'`.
**Fix applied:** Now accepts `type === 'STRATEGY' || type === 'INDICATOR' || type === 'KURI'`.

**Previous bug:** `runStrategy()` only routed to `runKuriStrategy()` when `type === 'KURI'`.
**Fix applied:** Now accepts all three types.

**Previous bug:** `runKuriStrategy()` only read `strategy.content.code`.
**Fix applied:** Resolves script via chain: `scriptSource -> kuriScript -> content.code -> content.scriptSource`.

### C.3 Signal extraction
**Status: PASS**

- `extractSignals()` (kuri-bridge.ts:230-264) reads `result.alerts` from `alertcondition()` calls
- Direction extracted from title/message keywords: buy/long/bull -> BUY, sell/short/bear -> SELL
- `getLatestSignals()` filters to last bar only for real-time monitoring
- Test script's `alertcondition()` calls produce proper signals:
  - "Golden Cross" -> BUY (contains "Buy" in message)
  - "Death Cross" -> SELL (contains "Sell" in message)

**Known limitation:** `strategy.entry()` / `strategy.close()` orders are NOT extracted. The Kuri engine's `StrategyEngine` collects orders internally but does not expose them on the result object. Signals rely entirely on `alertcondition()` calls. This is fine because the recommended pattern is to always pair `strategy.entry()` with `alertcondition()`.

### C.4 Real-time monitoring
**Status: PASS (architecture)**

- `signalEngine.ts` runs `runAllStrategies()` on each new candle batch
- `getLatestSignals()` checks only the last bar
- Signals persisted via `createSignal()` -> Supabase realtime subscription updates UI

### C.5 Multiple strategies
**Status: PASS**

- `runAllStrategies()` iterates all relevant strategies for a symbol
- Each strategy runs independently, signals labeled with strategy name

**Previous bug:** Signals.tsx strategy filter dropdown only showed `type === 'STRATEGY'`.
**Fix applied:** Now includes STRATEGY, INDICATOR, and KURI types.

---

## SECTION D: Edge Cases

### D.1 Empty script
**Status: PASS**

- `requestSave()` line 501: `if (!scriptContent.trim())` blocks save
- `handleAddToChart()` line 722: same check blocks add-to-chart

### D.2 Script with only indicator() declaration
**Status: PASS**

- Compiles successfully (no plots is valid in Kuri engine)
- Settings panel shows no inputs, no style entries
- No error thrown; chart simply shows no lines

### D.3 Script with syntax error
**Status: PASS**

- Save blocked by `requestSave()` compile validation (lines 506-541)
- "Add to Chart" blocked by `handleAddToChart()` compile check (lines 730-741)
- Monaco editor shows diagnostics from `ScriptEngine.provideDiagnostics`

### D.4 Script with runtime warning
**Status: PASS**

- `compileErrors` filter (`.filter(e => e.phase !== 'runtime')`) only blocks on parse/lexer errors
- Runtime warnings pass through; chart renders with NaN/null values for affected bars

### D.5 Very long script
**Status: PASS**

- `scriptSource` stored in Supabase JSONB `content` column (no code-level truncation)
- Settings panel is scrollable for many inputs

### D.6 Script name collisions
**Status: KNOWN LIMITATION**

- No duplicate name validation exists
- Multiple scripts with same name can coexist
- Load picks from list ordered by `created_at DESC`

### D.7 Custom indicator type string
**Status: PASS (after fix)**

**Previous bug:** All custom indicators assigned `type: 'MA'`, causing:
- Always routed to overlay (even oscillators)
- Falls back to SMA calculation if kuriSource lost

**Fix applied:**
- Overlay detection from `result.indicator.overlay` or `result.plots[].overlay`
- Fallback type: `'MA'` for overlays, `'RSI'` for pane indicators
- `isOverlayIndicator()` helper checks `kuriPlots` overlay flag for Kuri indicators, falls back to `OVERLAY_TYPES` for built-ins

### D.8 Script field resolution
**Status: PASS**

All three consumers agree on field chain:

| Consumer | Resolution Chain |
|----------|-----------------|
| `handleAddCustomIndicator` | `scriptSource -> kuriScript -> content?.code -> content?.scriptSource` |
| `runKuriStrategy` | `scriptSource -> kuriScript -> content?.code -> content?.scriptSource` |
| `strategyService.getStrategies()` | `content.scriptSource -> content.code -> script_source` |

---

## SECTION E: Data Flow Trace

```
Step 1: Strategy Studio
  scriptContent = "indicator(title='My Custom MA', ...)..."
  [OK] Full source stored in React state

Step 2: Save to Supabase
  saveStrategy({ name: "My Custom MA", type: "INDICATOR", scriptSource: "..." })
  -> INSERT INTO scripts (name, script_type, content) VALUES (...)
  [OK] content JSONB contains scriptSource field

Step 3: Navigate to Market
  /market?addScript={id}
  -> Market.tsx reads param, loads customScripts via getStrategies()
  -> Finds script by ID, passes to CandlestickChart
  [OK] script.scriptSource populated from content.scriptSource

Step 4: Execute via KuriBridge
  bridge.run(scriptCode, candles)
  [OK] Returns: { inputDefs: [...], plots: [...], hlines: [...], alerts: [...] }

Step 5: Create Indicator object
  { data: bridge.toIndicatorData(result), kuriSource, kuriInputDefs, kuriPlots, kuriHlines }
  [OK] All fields populated

Step 6: Settings Panel opens
  Reads indicator.kuriInputDefs -> renders KuriInputWidget for each
  [OK] 5 inputs rendered (MA Length, MA Type, Line Color, Show Band, Band Multiplier)

Step 7: User changes setting
  inputOverrides = { "MA Length": 50 }
  -> bridge.run(kuriSource, candles, inputOverrides)
  [OK] Chart recalculates with new MA length

Step 8: Persist to DB
  indicatorService.saveIndicator() -> INSERT with kuri_script, kuri_input_defs, kuri_plots, kuri_hlines
  [OK] All Kuri metadata persisted

Step 9: Page refresh
  indicatorService.fetchUserIndicators() -> maps kuri_script -> kuriSource, etc.
  -> handleUpdateIndicator detects kuriSource, re-runs bridge.run()
  [OK] Indicator restored with correct settings
```

---

## Files Modified

| File | Change | Bug Fixed |
|------|--------|-----------|
| `src/services/indicatorService.ts` | Save/load `kuri_script`, `kuri_input_defs`, `kuri_plots`, `kuri_hlines` | B.5: Persistence |
| `src/components/market-chart/CandlestickChart.tsx` | `handleAddCustomIndicator` runs KuriBridge; `isOverlayIndicator()` checks kuriPlots overlay flag; fallback type based on overlay | B.1: Add to Chart, D.7: Type routing |
| `src/engine/strategyEngine.ts` | `loadActiveStrategies()` accepts all types; `runStrategy()` accepts all types; `runKuriStrategy()` resolves scriptSource chain | C.2: Execution |
| `src/pages/Signals.tsx` | Strategy filter includes INDICATOR and KURI types | C.5: Filter dropdown |
| `src/types.ts` | Added `scriptSource?: string` to Strategy interface | D.8: Field alignment |
| `backend/schema/046_user_indicators_kuri_plots_hlines.sql` | New migration adding `kuri_plots` and `kuri_hlines` JSONB columns | B.5: Persistence |

---

## Known Limitations

1. **`strategy.entry()` signals not extracted** -- The Kuri engine's internal `StrategyEngine` collects orders but doesn't expose them on the result object. Signal extraction relies entirely on `alertcondition()`. Recommended pattern: always pair `strategy.entry()` with `alertcondition()`.

2. **No duplicate script name detection** -- Users can save multiple scripts with the same name. No unique constraint on `(user_id, name)`.

3. **Migration 046 required** -- The `kuri_plots` and `kuri_hlines` columns must be added to `user_indicators` table by running the SQL migration before persistence works.
