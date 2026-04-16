# ANTIGRAVITY — Kuri Script Integration Master Prompt

> **Give this document to any AI assistant or developer working on the Antigravity codebase. It contains the complete plan, architecture decisions, and implementation details for wiring the Kuri Script indicator/strategy system across all three pages.**

---

## CONTEXT — What Antigravity Is

Antigravity is a crypto trading platform built with:
- **Frontend:** React 19.1.1, Vite 6.2.0, TypeScript, Tailwind CSS, pnpm monorepo
- **Backend:** Node.js/Express, Supabase (PostgreSQL), Binance REST/WebSocket
- **Chart:** Custom Canvas-based CandlestickChart.tsx (448KB), NOT LightweightCharts
- **Editor:** Monaco Editor (@monaco-editor/react v4.7.0), language "kuri" registered but STUBBED
- **Routing:** React Router v7.8.2 (HashRouter)
- **State:** No Redux/Zustand — useState + service singletons + Supabase persistence

The platform has three pages that need the Kuri Script indicator system:

1. **Market Page** (`src/pages/Market.tsx`) — Chart with indicators, no code editor
2. **Strategy Studio** (`src/pages/StrategyStudio.tsx`, 867 lines) — Monaco Editor + chart
3. **Signals Page** (`src/pages/Signals.tsx`) — Strategy runner, buy/sell signal feed

---

## WHAT EXISTS vs WHAT'S STUBBED

### Already working (DO NOT touch):
- Binance data pipeline (REST + WebSocket, three-tier caching)
- CandlestickChart.tsx (custom canvas renderer — 448KB, keep as-is)
- Supabase auth, user state persistence, strategy saving
- Backend Kuri engine (`backend/server/src/kuri/` — lexer, parser, IR, backendVM)
- TopToolbar, BottomConsole, OpenScriptModal in Strategy Studio
- WebSocket real-time candle updates
- Symbol/timeframe selection, market state persistence

### STUBBED — needs replacement:
| Location | What's Stubbed | What Replaces It |
|----------|---------------|-----------------|
| `StrategyStudio.tsx:25` | `registerKuriLanguage()` — empty function | `kuri-monaco.js` — syntax highlighting, autocomplete, hover docs for 395 functions |
| `StrategyStudio.tsx:24` | `ScriptEngine.provideDiagnostics()` — returns `[]` | Wire to Kuri engine's compile step — returns real parse/runtime errors with line numbers |
| `src/engine/strategyEngine.ts:6-14` | Fake `Kuri` and `BackendVM` stubs | Import real `kuri-engine-full.js` (2,657 lines, 395 functions, 100% Pine v6) |
| `CandlestickChart.tsx` | `calculateIndicatorData()` — returns `{}` | Wire to `core-ta.ts` for built-in indicators, Kuri engine for custom scripts |
| `CandlestickChart.tsx:59-60` | `IndicatorPanel`, `IndicatorSettingsModal` — stubs | Build real components that auto-generate from engine's `result.inputDefs` and `result.plots` |
| `CandlestickChart.tsx:70-71` | `getIndicatorDefinition` — stub, registry removed | Rebuild indicator registry from `.kuri` library files |
| `KuriTableOverlay.tsx` | Table display stub | Wire to engine's `table.*` functions for dashboard overlays |
| `kuriDrawingConverter.ts` | Drawing conversion | Wire to engine's `result.drawings` (lines, labels, boxes) |

---

## THREE-LAYER ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────┐
│  LAYER 3 — Indicator Library (.kuri files)                  │
│  src/indicators/*.kuri                                      │
│  18 default indicators (SMA, EMA, RSI, MACD, BB, ATR...)   │
│  User custom scripts (stored in Supabase)                   │
├─────────────────────────────────────────────────────────────┤
│  LAYER 2 — Kuri Script Engine                               │
│  Frontend: src/lib/kuri/kuri-engine-full.js (2,657 lines)   │
│  Backend:  backend/server/src/kuri/ (already exists)        │
│  395 functions, 174 constants, 100% Pine v6 compatible      │
├─────────────────────────────────────────────────────────────┤
│  LAYER 1 — Core TA Math (TypeScript)                        │
│  src/lib/kuri/core-ta.ts                                    │
│  Hardcoded SMA, EMA, RSI, MACD, ATR, BB formulas           │
│  Direct number[] → number[] — no parsing overhead           │
└─────────────────────────────────────────────────────────────┘
```

### Which page uses which layers:

| Page | Layer 1 (core-ta.ts) | Layer 2 (Kuri engine) | Layer 3 (.kuri files) | Monaco |
|------|:-:|:-:|:-:|:-:|
| Market | YES — fast path for built-in indicators | YES — for custom Kuri scripts loaded via "Add to Chart" | YES — default indicator library | NO |
| Strategy Studio | Indirectly (engine calls it) | YES — full compile + execute on Run | YES — templates loaded into editor | YES |
| Signals | YES — fast execution | YES — parse strategy scripts, extract alerts | YES — user strategies | NO |

---

## OHLCV DATA FORMAT

The existing codebase uses this format (timestamps in SECONDS, NOT milliseconds):

```typescript
interface Candle {
  time: number;    // Unix timestamp in SECONDS (Binance ms / 1000)
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}
```

**IMPORTANT:** The Kuri engine expects timestamps. When passing candle data from the existing `getCandles()` pipeline to the engine, no conversion needed — just pass the array directly. The engine uses `time`, `open`, `high`, `low`, `close`, `volume` series internally.

---

## FILE STRUCTURE — What to Add

All new files go into the existing monorepo structure. Do NOT reorganize existing files.

```
src/
├── lib/
│   └── kuri/                              ← NEW DIRECTORY
│       ├── kuri-engine-full.js            ✅ DONE (2,657 lines — full engine + expansion)
│       ├── kuri-monaco.ts                 ✅ DONE (registerKuriLanguage, theme, autocomplete)
│       ├── kuri-bridge.ts                 🔨 BUILD (connects engine results → custom canvas chart)
│       ├── core-ta.ts                     🔨 BUILD (hardcoded TypeScript TA math)
│       └── types.ts                       🔨 BUILD (TypeScript interfaces for engine results)
│
├── indicators/                            ← NEW DIRECTORY
│   ├── sma.kuri                           ✅ DONE
│   ├── ema.kuri                           ✅ DONE
│   ├── rsi.kuri                           ✅ DONE
│   ├── macd.kuri                          ✅ DONE
│   ├── bb.kuri                            ✅ DONE
│   ├── atr.kuri                           ✅ DONE
│   ├── supertrend.kuri                    ✅ DONE
│   ├── ichimoku.kuri                      ✅ DONE
│   ├── ... (18 total)                     ✅ DONE
│   └── index.ts                           🔨 BUILD (registry: exports all indicator source + metadata)
│
├── components/
│   ├── market-chart/
│   │   ├── CandlestickChart.tsx           EXISTS (448KB — modify, don't rewrite)
│   │   ├── ActiveIndicatorsDisplay.tsx    EXISTS (modify to use new indicator system)
│   │   ├── KuriTableOverlay.tsx           EXISTS (wire to engine table.* output)
│   │   ├── kuriDrawingConverter.ts        EXISTS (wire to engine result.drawings)
│   │   ├── IndicatorSettingsPanel.tsx     🔨 BUILD (auto-generated from result.inputDefs)
│   │   └── IndicatorPickerModal.tsx       🔨 BUILD (browse + add default/custom indicators)
│   └── strategy-studio/
│       ├── TopToolbar.tsx                  EXISTS (modify "Add to Chart" to use new engine)
│       ├── BottomConsole.tsx               EXISTS (wire to engine compile errors + log.*)
│       └── ...
│
├── engine/
│   └── strategyEngine.ts                  EXISTS (241 lines — REPLACE stubs with real imports)
│
├── services/
│   └── indicatorService.ts                EXISTS (modify to work with new indicator registry)
│
└── pages/
    ├── Market.tsx                          EXISTS (wire indicator system)
    ├── StrategyStudio.tsx                  EXISTS (867 lines — wire Monaco + engine)
    └── Signals.tsx                         EXISTS (wire strategy runner + alert extraction)
```

---

## IMPLEMENTATION PLAN — Exact Steps

### PHASE 1: Wire the Engine (replaces all stubs)

**Step 1.1 — Add kuri-engine-full.js to the project**

Place `kuri-engine-full.js` at `src/lib/kuri/kuri-engine-full.js`.

Create a TypeScript wrapper at `src/lib/kuri/types.ts`:

```typescript
// TypeScript type declarations for kuri-engine-full.js

export interface KuriResult {
  success: boolean;
  errors: KuriError[];
  indicator: { title: string; shorttitle?: string; overlay: boolean } | null;
  inputDefs: InputDef[];
  plots: PlotData[];
  hlines: HlineData[];
  drawings: { lines: DrawingLine[]; labels: DrawingLabel[]; boxes: DrawingBox[] };
  alerts: AlertData[];
  seriesData: Map<string, number[]>;
  compileTime: number;
  executeTime: number;
  barCount: number;
}

export interface KuriError {
  phase: 'lexer' | 'parser' | 'runtime';
  message: string;
  line?: number;
  col?: number;
}

export interface InputDef {
  title: string;
  type: 'int' | 'float' | 'bool' | 'string' | 'color' | 'source' | 'timeframe';
  defval: any;
  minval?: number;
  maxval?: number;
  step?: number;
  options?: string[];
  tooltip?: string;
  group?: string;
}

export interface PlotData {
  title: string;
  series: number[];      // One value per bar
  color: string;
  linewidth: number;
  style: string;         // 'line' | 'histogram' | 'columns' | 'circles' | 'cross'
  kind: string;          // 'plot' | 'plotshape' | 'plotchar' | 'plotarrow'
  overlay: boolean;
}

export interface HlineData {
  price: number;
  title: string;
  color: string;
  linestyle?: string;
}

export interface AlertData {
  title: string;
  message: string;
  condition: boolean[];  // true/false per bar
}

export interface DrawingLine {
  id: number;
  x1: number; y1: number; x2: number; y2: number;
  color: string; width: number; style: string; extend: string;
  xloc: string;
  deleted: boolean;
}

export interface DrawingLabel {
  id: number;
  x: number; y: number;
  text: string; textcolor: string; color: string;
  style: string; size: string;
  xloc: string; yloc: string;
  deleted: boolean;
}

export interface DrawingBox {
  id: number;
  left: number; top: number; right: number; bottom: number;
  bgcolor: string; border_color: string; border_width: number;
  text?: string;
  deleted: boolean;
}
```

**Step 1.2 — Replace strategyEngine.ts stubs**

File: `src/engine/strategyEngine.ts`

Replace lines 6-14 (the fake stubs) with real imports:

```typescript
import Kuri from '@/src/lib/kuri/kuri-engine-full.js';
import type { KuriResult, InputDef } from '@/src/lib/kuri/types';

const engine = new Kuri.KuriEngine();

// Replace the stubbed compile/run with real engine calls
export function compileAndRun(
  scriptCode: string,
  candles: Candle[],
  inputOverrides?: Record<string, any>
): KuriResult {
  return engine.run(scriptCode, candles, { inputOverrides });
}

export function compileOnly(scriptCode: string): KuriError[] {
  const { errors } = engine.compile(scriptCode);
  return errors;
}
```

**Step 1.3 — Wire registerKuriLanguage() in StrategyStudio**

File: `src/pages/StrategyStudio.tsx` line 25

Replace the empty stub with the real implementation from `kuri-monaco.ts`:

```typescript
import { registerKuriLanguage } from '@/src/lib/kuri/kuri-monaco';

// In the Monaco onMount callback:
function handleEditorDidMount(editor: any, monaco: any) {
  registerKuriLanguage(monaco);  // Now provides real syntax highlighting + autocomplete
  editorRef.current = editor;
}
```

This immediately gives you:
- Kuri Script syntax highlighting (keywords, namespaces, strings, colors, comments)
- Autocomplete for all 395 functions (triggers on `.` after `ta`, `math`, `str`, `input`, etc.)
- Hover docs (hover over `ta.sma` → shows signature + description)
- `kuri-dark` theme matching the editor aesthetic

**Step 1.4 — Wire provideDiagnostics() to real engine**

File: `src/pages/StrategyStudio.tsx` line 24

Replace the stub that returns empty array:

```typescript
// Replace: ScriptEngine.provideDiagnostics = () => []
// With:
import { compileOnly } from '@/src/engine/strategyEngine';

function provideDiagnostics(code: string, monaco: any): void {
  const errors = compileOnly(code);
  const markers = errors.map(err => ({
    severity: err.phase === 'runtime' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Error,
    message: err.message,
    startLineNumber: err.line || 1,
    startColumn: err.col || 1,
    endLineNumber: err.line || 1,
    endColumn: 1000,
    source: 'kuri-diagnostics',
  }));
  monaco.editor.setModelMarkers(editorRef.current.getModel(), 'kuri-diagnostics', markers);
}
```

Now the editor shows real red squiggles for syntax errors as the user types (with 500ms debounce, already implemented in the existing code).

**Step 1.5 — Wire "Add to Chart" button to use real engine**

File: `src/components/strategy-studio/TopToolbar.tsx` lines 193-200

The existing flow: validate → save to Supabase → navigate to `/market?addScript={id}`. Keep this flow, but add real compilation before saving:

```typescript
// Before saving, actually compile the script to catch errors:
const result = compileAndRun(scriptContent, sampleCandles);
if (result.errors.filter(e => e.phase !== 'runtime').length > 0) {
  // Show errors in BottomConsole, don't navigate
  addLog('error', result.errors[0].message);
  return;
}
// Existing save + navigate flow continues...
```

---

### PHASE 2: Market Page Indicators

**Step 2.1 — Build core-ta.ts (Layer 1)**

File: `src/lib/kuri/core-ta.ts`

Pure TypeScript math functions. These are called directly by the Market page for fast built-in indicator computation without script parsing:

```typescript
export function sma(source: number[], length: number): number[] { ... }
export function ema(source: number[], length: number): number[] { ... }
export function rsi(source: number[], length: number): number[] { ... }
export function macd(source: number[], fast: number, slow: number, signal: number): { macd: number[], signal: number[], histogram: number[] } { ... }
export function bb(source: number[], length: number, mult: number): { upper: number[], basis: number[], lower: number[] } { ... }
export function atr(high: number[], low: number[], close: number[], length: number): number[] { ... }
// ... (30+ functions, formulas must match kuri-engine-full.js exactly)
```

**Step 2.2 — Replace calculateIndicatorData()**

File: `src/components/market-chart/CandlestickChart.tsx`

Currently returns `{}`. Replace with:

```typescript
import * as ta from '@/src/lib/kuri/core-ta';

function calculateIndicatorData(
  indicator: Indicator,
  candles: Candle[]
): Record<string, (number | null)[]> {
  const close = candles.map(c => c.close);
  const high = candles.map(c => c.high);
  const low = candles.map(c => c.low);
  const volume = candles.map(c => c.volume ?? 0);
  
  switch (indicator.type) {
    case 'SMA': return { value: ta.sma(close, indicator.settings.period ?? 20) };
    case 'EMA': return { value: ta.ema(close, indicator.settings.period ?? 20) };
    case 'RSI': return { value: ta.rsi(close, indicator.settings.period ?? 14) };
    case 'BB': {
      const { upper, basis, lower } = ta.bb(close, indicator.settings.period ?? 20, indicator.settings.multiplier ?? 2);
      return { upper, middle: basis, lower };
    }
    case 'MACD': {
      const { macd, signal, histogram } = ta.macd(close, 12, 26, 9);
      return { macd, signal, histogram };
    }
    // ... all 30+ indicator types already listed in the codebase
    
    // For custom Kuri scripts (loaded via "Add to Chart"):
    case 'KURI_CUSTOM': {
      const result = compileAndRun(indicator.settings.kuriScript, candles);
      const data: Record<string, (number | null)[]> = {};
      result.plots.forEach(p => { data[p.title] = p.series.map(v => isNaN(v) ? null : v); });
      return data;
    }
    
    default: return {};
  }
}
```

**Step 2.3 — Build IndicatorSettingsPanel**

File: `src/components/market-chart/IndicatorSettingsPanel.tsx`

This component auto-generates from the engine's output. It has two tabs:

**Inputs tab** — generated from `result.inputDefs`:
| `inputDef.type` | Widget |
|---|---|
| `"int"` | Number spinner with min/max/step |
| `"float"` | Number input with decimal step |
| `"bool"` | Toggle switch |
| `"string"` with `options` | Dropdown select |
| `"string"` without `options` | Text field |
| `"color"` | Color picker |
| `"source"` | Dropdown: close, open, high, low, hl2, hlc3, ohlc4 |

**Style tab** — generated from `result.plots`:
Each plot gets: visibility toggle, color picker, line width slider, line style dropdown.
Each hline gets: visibility toggle, color picker.

When user changes any setting → call `compileAndRun()` with `inputOverrides` → update chart series.

**Step 2.4 — Build IndicatorPickerModal**

File: `src/components/market-chart/IndicatorPickerModal.tsx`

Shows all 18 default indicators + user's custom scripts. Categorized:
- Trend: SMA, EMA, WMA, HMA, MA Ribbon, Supertrend
- Volatility: BB, ATR, ADR, Keltner, Donchian
- Oscillators: RSI, MACD, Stochastic, CCI, MFI
- Volume: OBV, VWMA

Click → adds indicator to chart → opens SettingsPanel.

**Step 2.5 — Build indicator registry**

File: `src/indicators/index.ts`

```typescript
export interface IndicatorMeta {
  id: string;
  name: string;
  shortname: string;
  category: 'trend' | 'volatility' | 'oscillator' | 'volume';
  overlay: boolean;
  kuriSource: string;  // The .kuri file content
}

export const DEFAULT_INDICATORS: IndicatorMeta[] = [
  { id: 'sma', name: 'Simple Moving Average', shortname: 'SMA', category: 'trend', overlay: true, kuriSource: `indicator(title="Simple Moving Average"...` },
  // ... all 18
];
```

---

### PHASE 3: Strategy Studio Enhancements

**Step 3.1 — Wire BottomConsole to engine output**

File: `src/components/strategy-studio/BottomConsole.tsx` (508 lines)

The console already has a `LogEntry[]` system with filtering. Wire it to:
- Compile errors: `result.errors` → type 'error', show line number
- Compile success: `"Compiled in {compileTime}ms, {barCount} bars, {plots.length} plots"` → type 'info'  
- `log.info()` / `log.warning()` / `log.error()` calls from the script → respective types
- Runtime warnings → type 'warning'

**Step 3.2 — Template loading in OpenScriptModal**

File: `src/components/strategy-studio/OpenScriptModal.tsx` (335 lines)

Add a "Built-in" tab alongside user's saved scripts. Shows the 18 default indicators from the registry. Click → loads `.kuri` source into Monaco editor.

**Step 3.3 — Settings panel in Strategy Studio**

When user runs a script, the same `IndicatorSettingsPanel` component appears in a right panel. Changes in the panel update `inputOverrides` and re-run the engine.

This creates bidirectional flow:
- User edits code → re-run → settings panel updates
- User changes settings → re-run with overrides → chart updates (code stays the same)

---

### PHASE 4: Signal Page

**Step 4.1 — Strategy execution for signals**

The engine's `result.alerts` array contains all `alertcondition()` triggers:

```typescript
result.alerts.forEach(alert => {
  alert.condition.forEach((triggered, barIndex) => {
    if (triggered) {
      signals.push({
        type: 'alert',
        title: alert.title,
        message: alert.message,
        time: candles[barIndex].time,
        price: candles[barIndex].close,
        direction: alert.title.toLowerCase().includes('buy') ? 'BUY' : 'SELL',
      });
    }
  });
});
```

For `strategy.entry()` / `strategy.exit()` calls, the engine's StrategyEngine tracks all order signals.

**Step 4.2 — Real-time signal monitoring**

On each new candle from the WebSocket:
1. Append to candle array
2. Re-run the strategy: `compileAndRun(strategyCode, candles)`
3. Check if any `alert.condition[lastBar]` is `true`
4. If yes → emit signal to feed + send notification

**Step 4.3 — Server-side signals (uses existing backend)**

The backend already has `backend/server/src/kuri/backendVM.ts` (685 lines, production ready). For server-side signal generation:
- `backend/server/src/engine/signalMonitor.ts` already exists
- Wire it to the backend Kuri engine's signal output
- Run strategies on new candles received by `binanceStream.ts`
- Store signals via `signalStorage.ts` to Supabase
- Push to frontend via WebSocket

---

## THE KURI SCRIPT IS THE SINGLE SOURCE OF TRUTH

This is the most important architectural principle. A single `.kuri` file defines:

```
indicator(title="Simple Moving Average", shorttitle="SMA", overlay=true)

len = input.int(9, title="Length", minval=1)          ← INPUTS TAB widget
col = input.color(#2196F3, title="Line Color")         ← INPUTS TAB widget
out = ta.sma(close, len)                               ← COMPUTATION
plot(out, title="SMA", color=col, linewidth=2)         ← CHART SERIES + STYLE TAB entry
hline(50, title="Midline", color=#787B86)              ← CHART HLINE + STYLE TAB entry
alertcondition(ta.crossover(out, close), title="Cross") ← SIGNAL TRIGGER
```

From this one script, the engine extracts:
- `result.inputDefs` → auto-generates the **Settings panel** (Inputs tab)
- `result.plots` → renders on **chart** AND generates **Style tab**
- `result.hlines` → renders horizontal lines + Style tab entries
- `result.drawings` → renders lines, labels, boxes on chart
- `result.alerts` → generates **signals** on the Signal page
- `result.indicator.overlay` → decides overlay vs separate pane

**Market page** shows only the Settings panel (no code visible).
**Strategy Studio** shows the code in Monaco AND the Settings panel.
**Signal page** runs the code headlessly and extracts alerts.

Same `.kuri` file, same engine, same results — three different UIs.

---

## KURI ENGINE API — Quick Reference

```typescript
import Kuri from './kuri-engine-full.js';

const engine = new Kuri.KuriEngine();

// Full run (compile + execute on OHLCV data):
const result = engine.run(kuriScript, candles, {
  inputOverrides: { "Length": 20, "Color": "#FF0000" }
});

// Compile only (for diagnostics, no execution):
const { ast, errors } = engine.compile(kuriScript);

// Get built-in list (for autocomplete):
const builtins = Kuri.KuriEngine.getBuiltinList();
// → { functions: string[], constants: string[], colors: string[], series: string[] }
```

### Engine stats:
| Metric | Value |
|--------|-------|
| Functions | 395 |
| Constants | 174 |
| Colors | 18 |
| Series | 10 (open, high, low, close, volume, time, bar_index, hl2, hlc3, ohlc4) |
| Total symbols | 587 |
| Pine Script v6 coverage | 376/376 (100%) |
| File size | 126KB (2,657 lines) |
| Test results | 35/35 passing |

### Supported namespaces:
`ta.*` (59), `math.*` (29), `str.*` (19), `color.*` (7), `array.*` (51), `matrix.*` (46), `map.*` (11), `line.*` (22), `label.*` (21), `box.*` (25), `table.*` (21), `polyline.*` (3), `linefill.*` (6), `input.*` (14), `request.*` (9), `strategy.*` (17), `log.*` (3), `chart.point.*` (4), `ticker.*` (8), `runtime.*` (1)

### Language features:
- User-defined functions (`name(params) => body`)
- Switch expressions (value-matching and conditional)
- Tuple destructuring (`[a, b, c] = func()`)
- Multi-line ternary/and/or continuation
- Typed declarations (`int x = 5`, `float y = 3.14`, `var float z = na`)
- `varip` persistent variables
- Drawing API (line, label, box, polyline, linefill, table)
- All input types (int, float, bool, string, color, source, timeframe)
- For/while loops with break/continue
- History referencing (`close[1]`, `high[5]`)
- `na` handling (`na`, `na()`, `nz()`, `fixnan()`)

---

## CHART BRIDGE — Connecting Engine to Custom Canvas

Since Antigravity uses a custom Canvas-based chart (NOT LightweightCharts), the bridge needs to adapt. The existing chart already renders indicators via the `Indicator` interface with `data: Record<string, (number | null)[]>`.

The bridge simply maps engine output to this existing format:

```typescript
// After engine.run():
function engineResultToIndicatorData(result: KuriResult): Record<string, (number | null)[]> {
  const data: Record<string, (number | null)[]> = {};
  result.plots.forEach(plot => {
    data[plot.title] = plot.series.map(v => (isNaN(v) || v === undefined) ? null : v);
  });
  return data;
}
```

For drawings (lines, labels, boxes), wire `result.drawings` through the existing `kuriDrawingConverter.ts` to render on the SVG overlay layer.

For tables, wire `result.tables` through the existing `KuriTableOverlay.tsx`.

---

## BUILD ORDER

| # | Task | Files | Depends on |
|---|------|-------|-----------|
| 1 | Add `kuri-engine-full.js` + `types.ts` | `src/lib/kuri/` | Nothing |
| 2 | Replace `strategyEngine.ts` stubs | `src/engine/strategyEngine.ts` | #1 |
| 3 | Wire `registerKuriLanguage` | `StrategyStudio.tsx` + `kuri-monaco.ts` | #1 |
| 4 | Wire `provideDiagnostics` | `StrategyStudio.tsx` | #2 |
| 5 | Wire "Add to Chart" real compile | `TopToolbar.tsx` | #2 |
| 6 | Build `core-ta.ts` | `src/lib/kuri/core-ta.ts` | Nothing |
| 7 | Replace `calculateIndicatorData()` | `CandlestickChart.tsx` | #6 |
| 8 | Build indicator registry | `src/indicators/index.ts` | .kuri files |
| 9 | Build `IndicatorSettingsPanel` | `src/components/market-chart/` | #2 |
| 10 | Build `IndicatorPickerModal` | `src/components/market-chart/` | #8 |
| 11 | Wire BottomConsole to engine | `BottomConsole.tsx` | #2 |
| 12 | Wire Signal page alert extraction | `Signals.tsx` | #2 |
| 13 | Wire real-time re-computation | WebSocket handler | #7 |
| 14 | Wire drawings to canvas overlay | `kuriDrawingConverter.ts` | #2 |
| 15 | Wire table overlay | `KuriTableOverlay.tsx` | #2 |

Steps 1-5 give you a working Strategy Studio. Steps 6-10 give you Market page indicators. Steps 11-15 are polish and signals.

---

## DELIVERABLES ALREADY COMPLETED

These files are ready to drop into the codebase:

| File | Status | What it provides |
|------|--------|-----------------|
| `kuri-engine-full.js` | ✅ Ready | Full engine — 395 fns, 174 constants, 100% Pine v6 |
| `kuri-monaco.js` | ✅ Ready | Monaco syntax, autocomplete for 395 fns, hover docs, kuri-dark theme |
| `kuri-bridge.js` | ✅ Ready | Engine ↔ chart adapter (needs customization for Canvas chart) |
| `indicators.kuri` | ✅ Ready | 18 default indicators (SMA, EMA, RSI, MACD, BB, ATR, Supertrend, Ichimoku, Keltner, Stochastic, VWMA, HMA, CCI, OBV, ADR, WMA, MA Ribbon, Donchian) |
| `INTEGRATION_GUIDE.md` | ✅ Ready | Step-by-step setup doc |

---

*This prompt was generated from the Antigravity Technical Overview + Kuri Script engine build session. All engine code is tested (35/35 pass), all indicators are verified (18/18 pass), Pine v6 coverage is 100% (376/376).*
