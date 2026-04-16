# Kuri Script — Antigravity Integration Guide (v2)

> Updated for the actual Antigravity codebase: React 19.1.1, Vite 6, custom Canvas chart, @monaco-editor/react v4.7.0

---

## Files to Drop In

Copy these into `src/lib/kuri/`:

```
src/lib/kuri/
├── kuri-engine-full.js    ← Engine (2,657 lines, 395 fns, 100% Pine v6)
├── kuri-monaco.ts         ← Monaco language (syntax, autocomplete, diagnostics)
├── kuri-bridge.ts         ← Engine ↔ Chart bridge (converts output to Indicator format)
└── types.ts               ← TypeScript interfaces for engine results
```

Copy indicators into `src/indicators/`:

```
src/indicators/
├── sma.kuri, ema.kuri, rsi.kuri, macd.kuri, bb.kuri, atr.kuri
├── supertrend.kuri, ichimoku.kuri, keltner.kuri, stochastic.kuri
├── vwma.kuri, hma.kuri, cci.kuri, obv.kuri, adr.kuri, wma.kuri
├── ma-ribbon.kuri, donchian.kuri
└── index.ts               ← Build this: registry of all indicator metadata + source
```

---

## Step 1: Wire Monaco (replaces stub at StrategyStudio.tsx:25)

**Before** (current stub):
```typescript
// StrategyStudio.tsx line 25
const registerKuriLanguage = () => () => {};  // STUB — does nothing
```

**After:**
```typescript
import { registerKuriLanguage, setKuriDiagnostics, clearKuriDiagnostics } from '@/src/lib/kuri/kuri-monaco';
```

In the Monaco `onMount` callback:
```typescript
function handleEditorDidMount(editor: any, monaco: any) {
  registerKuriLanguage(monaco);  // Activates syntax + autocomplete + theme
  monaco.editor.setTheme('kuri-dark');
  editorRef.current = editor;
}
```

**What you get immediately:** Syntax highlighting for keywords, namespaces, colors, strings. Autocomplete with 395 functions (triggers on `.` after `ta`, `math`, `input`, etc.). Hover docs. `kuri-dark` theme.

---

## Step 2: Wire Diagnostics (replaces stub at StrategyStudio.tsx:24)

**Before** (current stub):
```typescript
// ScriptEngine.provideDiagnostics = () => []
```

**After:**
```typescript
import { getKuriBridge } from '@/src/lib/kuri/kuri-bridge';
import { setKuriDiagnostics } from '@/src/lib/kuri/kuri-monaco';

// In the existing 500ms debounced onChange handler:
function onEditorContentChange(value: string) {
  setScriptContent(value);
  setIsDirty(true);

  // Real diagnostics — red squiggles on parse errors
  const bridge = getKuriBridge();
  const { errors } = bridge.compile(value);
  setKuriDiagnostics(monacoRef.current, editorRef.current, errors);
  setDiagnosticCounts({
    errors: errors.filter(e => e.phase !== 'runtime').length,
    warnings: errors.filter(e => e.phase === 'runtime').length,
  });
}
```

---

## Step 3: Wire Engine (replaces stubs at strategyEngine.ts:6-14)

**Before** (current stub):
```typescript
// src/engine/strategyEngine.ts lines 6-14
const Kuri = { compileIR: (_s: string) => ({ source: _s }) };
class BackendVM {
  constructor(_ctx: any) {}
  run(_ir: any) { return { variables: {} }; }
}
```

**After:**
```typescript
import { getKuriBridge, KuriBridge } from '@/src/lib/kuri/kuri-bridge';
import type { KuriResult, Candle } from '@/src/lib/kuri/kuri-bridge';

export function compileAndRun(
  script: string,
  candles: Candle[],
  inputOverrides?: Record<string, any>
): KuriResult {
  const bridge = getKuriBridge();
  return bridge.run(script, candles, inputOverrides);
}
```

---

## Step 4: Wire "Add to Chart" (TopToolbar.tsx:193-200)

The existing flow saves + navigates. Add real compilation before saving:

```typescript
import { getKuriBridge } from '@/src/lib/kuri/kuri-bridge';

// In handleAddToChart():
const bridge = getKuriBridge();
const result = bridge.run(scriptContent, sampleCandles);
const compileErrors = result.errors.filter(e => e.phase !== 'runtime');

if (compileErrors.length > 0) {
  // Show errors in BottomConsole, block navigation
  compileErrors.forEach(e => addLog('error', `Line ${e.line}: ${e.message}`));
  return;
}

// Existing save + navigate flow continues...
await saveStrategy({ ...strategyData, compiled: true });
navigate(`/market?addScript=${savedId}`);
```

---

## Step 5: Wire Chart Indicators (CandlestickChart.tsx)

Replace `calculateIndicatorData()` which currently returns `{}`:

```typescript
import { getKuriBridge } from '@/src/lib/kuri/kuri-bridge';
import * as ta from '@/src/lib/kuri/core-ta';

function calculateIndicatorData(
  indicator: Indicator,
  candles: Candle[]
): Record<string, (number | null)[]> {
  const close = candles.map(c => c.close);
  const high = candles.map(c => c.high);
  const low = candles.map(c => c.low);
  const vol = candles.map(c => c.volume ?? 0);

  // Fast path — built-in indicators use core-ta.ts directly
  switch (indicator.type) {
    case 'SMA':  return { value: ta.sma(close, indicator.settings.period ?? 20) };
    case 'EMA':  return { value: ta.ema(close, indicator.settings.period ?? 20) };
    case 'WMA':  return { value: ta.wma(close, indicator.settings.period ?? 20) };
    case 'RSI':  return { value: ta.rsi(close, indicator.settings.period ?? 14) };
    case 'ATR':  return { value: ta.atr(high, low, close, indicator.settings.period ?? 14) };
    case 'BB': {
      const r = ta.bb(close, indicator.settings.period ?? 20, indicator.settings.multiplier ?? 2);
      return { upper: r.upper, middle: r.basis, lower: r.lower };
    }
    case 'MACD': {
      const r = ta.macd(close, 12, 26, 9);
      return { macd: r.macd, signal: r.signal, histogram: r.histogram };
    }
    // ... other built-in types use ta.* functions similarly

    // Kuri Script path — custom indicators run through the full engine
    default: {
      if (indicator.settings?.kuriScript) {
        const bridge = getKuriBridge();
        const result = bridge.run(indicator.settings.kuriScript, candles, indicator.settings.overrides);
        return bridge.toIndicatorData(result);
      }
      return {};
    }
  }
}
```

---

## Step 6: Wire BottomConsole (BottomConsole.tsx)

The console already has a `LogEntry[]` array with type filtering. After engine runs:

```typescript
import { getKuriBridge } from '@/src/lib/kuri/kuri-bridge';

// After running a script:
const bridge = getKuriBridge();
const result = bridge.run(scriptContent, candles);
const logs = bridge.toLogs(result);

// Push to existing console system:
logs.forEach(log => {
  addLog(log.type, log.message);
  // If error has line number, user can click to jump:
  // editorRef.current.revealLineInCenter(log.line);
});
```

---

## Step 7: Wire Signal Page (Signals.tsx)

```typescript
import { getKuriBridge } from '@/src/lib/kuri/kuri-bridge';

// Run strategy and extract signals:
const bridge = getKuriBridge();
const result = bridge.run(strategyCode, candles);
const signals = bridge.extractSignals(result, candles);

// For real-time monitoring (on new WebSocket candle):
function onNewCandle(candle: Candle) {
  candles.push(candle);
  const result = bridge.run(strategyCode, candles);
  const latestSignals = bridge.getLatestSignals(result, candles);
  if (latestSignals.length > 0) {
    // Push to signal feed + notify user
    latestSignals.forEach(sig => addSignalToFeed(sig));
  }
}
```

---

## How Data Flows Through the System

```
User writes Kuri Script (or adds built-in indicator)
         │
         ▼
   ┌─────────────┐
   │ KuriBridge   │ ← singleton, shared by all pages
   │  .run()      │
   └──────┬──────┘
          │ returns KuriResult
          │
    ┌─────┼──────────────────┬──────────────────┐
    ▼     ▼                  ▼                  ▼
 .toIndicatorData()   .getInputDefs()    .extractSignals()
    │                  │                  │
    ▼                  ▼                  ▼
 Chart renders      Settings panel     Signal feed
 (Canvas)           auto-generates     shows BUY/SELL
```

---

## Settings Panel — How It Auto-Generates

The bridge's `getInputDefs(result)` returns an array like:

```typescript
[
  { title: "Length",     type: "int",    defval: 9,         minval: 1 },
  { title: "StdDev",    type: "float",  defval: 2.0,       minval: 0.001 },
  { title: "MA Type",   type: "string", defval: "SMA",     options: ["SMA","EMA","WMA"] },
  { title: "Show BB",   type: "bool",   defval: false },
  { title: "Line Color",type: "color",  defval: "#2196F3" },
]
```

Your `IndicatorSettingsPanel` component maps each to a widget:

| `type`   | Widget                    |
|----------|---------------------------|
| `int`    | Number spinner (min/max)  |
| `float`  | Decimal input (step=0.1)  |
| `bool`   | Toggle switch             |
| `string` | Dropdown (if options) or text field |
| `color`  | Color picker              |
| `source` | Dropdown: close/open/high/low/hl2/hlc3/ohlc4 |

When user changes any value → re-run with `bridge.run(script, candles, { "Length": 20 })` → chart updates.

**Same panel appears on both Market page (gear icon) and Strategy Studio (side panel).**

---

## Quick Verification

After wiring steps 1-3, test in browser console:

```javascript
import { getKuriBridge } from '@/src/lib/kuri/kuri-bridge';

const bridge = getKuriBridge();
console.log('Version:', KuriBridge.version);  // "2.1.0"
console.log('Functions:', KuriBridge.getBuiltinList().functions.length);  // 395

// Test with sample data:
const candles = Array.from({ length: 50 }, (_, i) => ({
  time: 1700000000 + i * 3600,
  open: 100 + Math.random() * 10,
  high: 105 + Math.random() * 10,
  low: 95 + Math.random() * 10,
  close: 100 + Math.random() * 10,
  volume: 1000000 + Math.random() * 500000,
}));

const result = bridge.run('indicator("Test", overlay=true)\nplot(ta.sma(close, 20))', candles);
console.log('Success:', result.success);           // true
console.log('Plots:', result.plots.length);         // 1
console.log('SMA[49]:', result.plots[0].series[49]); // number
```
