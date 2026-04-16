# FIX: Settings Panel Showing Legacy View Despite Kuri Data Being Available

## Context from Audit

The audit confirms:
- IndicatorSettingsPanel.tsx has BOTH Kuri path (line 555) and legacy fallback (line 747)
- The Indicator interface HAS `kuriInputDefs`, `kuriPlots`, `kuriHlines`, `kuriTitle` fields
- When adding an indicator, Step 3-4 DOES attempt to run Kuri and extract metadata
- But the settings panel STILL shows "Period", "Style", "Color" (legacy hardcoded)

This means `indicator.kuriInputDefs` is undefined when the settings panel opens. Find out WHY.

## Diagnostic — Run These Checks In Order

### Check 1: Is Kuri metadata extracted when adding the indicator?

Find the `handleAddIndicator` function (or wherever indicators are added). Add this log right after the Kuri bridge runs:

```typescript
console.log('[ADD INDICATOR] Kuri metadata:', {
  type: newIndicator.type,
  kuriInputDefs: newIndicator.kuriInputDefs?.length ?? 'UNDEFINED',
  kuriPlots: newIndicator.kuriPlots?.length ?? 'UNDEFINED',
  kuriHlines: newIndicator.kuriHlines?.length ?? 'UNDEFINED',
  kuriTitle: newIndicator.kuriTitle ?? 'UNDEFINED',
  kuriSource: newIndicator.kuriSource ? 'SET' : 'UNDEFINED',
  dataKeys: Object.keys(newIndicator.data || {}),
});
```

**If kuriInputDefs shows a number (e.g., 5)** → metadata IS extracted at add time → the problem is it gets LOST later (Check 2).

**If kuriInputDefs shows "UNDEFINED"** → metadata is NOT being extracted → the Kuri engine is failing or the code doesn't set it (Check 3).

### Check 2: Is Kuri metadata lost when passed to the settings panel?

Find where the settings panel is opened (where `<IndicatorSettingsModal indicator={...}` is rendered). Add this log:

```typescript
console.log('[SETTINGS OPEN] indicator:', {
  type: settingsIndicator.type,
  kuriInputDefs: settingsIndicator.kuriInputDefs?.length ?? 'UNDEFINED',
  kuriPlots: settingsIndicator.kuriPlots?.length ?? 'UNDEFINED',
  kuriTitle: settingsIndicator.kuriTitle ?? 'UNDEFINED',
  settingsKeys: Object.keys(settingsIndicator.settings || {}),
});
```

**If kuriInputDefs is UNDEFINED here but was SET in Check 1** → the data is being lost somewhere between adding and opening settings. Common causes:

**Cause A — Supabase round-trip strips Kuri fields:**
When indicators are saved to Supabase (`indicatorService.saveUserIndicators()`), the `kuriInputDefs`, `kuriPlots`, `kuriHlines` fields may not be in the database schema. When indicators are loaded back on page refresh, these fields are missing.

**Fix A:** When the gear icon is clicked, ALWAYS re-extract Kuri metadata from the `.kuri` source (which IS saved as `indicator.kuriSource`):

```typescript
function handleSettingsClick(indicator: Indicator) {
  // Re-hydrate Kuri metadata from the saved source
  if (indicator.kuriSource && (!indicator.kuriInputDefs || indicator.kuriInputDefs.length === 0)) {
    const bridge = getKuriBridge();
    const result = bridge.run(indicator.kuriSource, candles);
    if (result.errors.filter(e => e.phase !== 'runtime').length === 0) {
      indicator.kuriInputDefs = result.inputDefs || [];
      indicator.kuriPlots = result.plots?.map(p => ({ title: p.title, color: p.color, linewidth: p.linewidth, style: p.style })) || [];
      indicator.kuriHlines = result.hlines || [];
      indicator.kuriTitle = result.indicator?.title || indicator.type;
    }
  }
  
  // If STILL no kuriInputDefs (no kuriSource saved), try loading from registry
  if (!indicator.kuriInputDefs || indicator.kuriInputDefs.length === 0) {
    const registryEntry = DEFAULT_INDICATORS.find(i => 
      i.id === indicator.registryId || 
      i.type?.toUpperCase() === indicator.type?.toUpperCase()
    );
    if (registryEntry?.kuriSource) {
      const bridge = getKuriBridge();
      const result = bridge.run(registryEntry.kuriSource, candles);
      if (result.errors.filter(e => e.phase !== 'runtime').length === 0) {
        indicator.kuriInputDefs = result.inputDefs || [];
        indicator.kuriPlots = result.plots?.map(p => ({ title: p.title, color: p.color, linewidth: p.linewidth, style: p.style })) || [];
        indicator.kuriHlines = result.hlines || [];
        indicator.kuriTitle = result.indicator?.title || indicator.type;
        indicator.kuriSource = registryEntry.kuriSource;
      }
    }
  }
  
  setSettingsIndicator({ ...indicator }); // spread to trigger re-render
}
```

**Cause B — State doesn't include Kuri fields:**
React state (`allActiveIndicators`) may be set with a spread that drops the Kuri fields, or the state update creates a new object without them.

**Fix B:** Check every place `allActiveIndicators` is updated. Make sure `kuriInputDefs`, `kuriPlots`, `kuriHlines`, `kuriTitle`, `kuriSource` are preserved.

**Cause C — The indicator passed to settings is a copy without Kuri fields:**
The gear icon handler might do something like:
```typescript
// WRONG — only copies basic fields:
setSettingsIndicator({ id, type, settings, data });
// CORRECT — copies everything including Kuri fields:
setSettingsIndicator({ ...indicator });
```

### Check 3: Is the Kuri engine actually running successfully?

If kuriInputDefs is UNDEFINED at add time (Check 1), the engine is failing. Add this log in the add handler:

```typescript
const bridge = getKuriBridge();
const kuriSource = registryEntry?.kuriSource;
console.log('[KURI RUN] source length:', kuriSource?.length);
const result = bridge.run(kuriSource, candles);
console.log('[KURI RUN] errors:', result.errors);
console.log('[KURI RUN] inputDefs:', result.inputDefs?.length);
console.log('[KURI RUN] plots:', result.plots?.length);
```

**If errors are shown** → the engine can't compile the .kuri file. Check if the .kuri source is correctly loaded from the registry.

**If kuriSource is undefined** → the registry lookup failed. Check that `DEFAULT_INDICATORS` in `src/indicators/index.ts` correctly loads the `.kuri` files with Vite's `?raw` import.

### Check 4: Are the Kuri fields on the Indicator type definition?

Verify `src/components/market-chart/types.ts` has:

```typescript
interface Indicator {
  // ... existing fields ...
  kuriSource?: string;
  kuriTitle?: string;
  kuriInputDefs?: InputDef[];
  kuriPlots?: Array<{ title: string; color: string; linewidth: number; style?: string }>;
  kuriHlines?: Array<{ title: string; price: number; color: string }>;
}
```

## The Guaranteed Fix

If the diagnostics are too complex, here's the **guaranteed fix** — always re-extract Kuri metadata when opening settings, regardless of whether it was set before:

In the gear icon click handler:

```typescript
import { getKuriBridge } from '@/src/lib/kuri/kuri-bridge';
import { DEFAULT_INDICATORS } from '@/src/indicators';

function handleSettingsClick(indicator: Indicator) {
  // Type → registry ID mapping
  const typeMap: Record<string, string> = {
    'MA': 'sma', 'SMA': 'sma', 'EMA': 'ema', 'WMA': 'wma',
    'HMA': 'hma', 'VWMA': 'vwma', 'RSI': 'rsi', 'MACD': 'macd',
    'BB': 'bb', 'ATR': 'atr', 'ADR': 'adr', 'CCI': 'cci',
    'MFI': 'mfi', 'OBV': 'obv', 'SuperTrend': 'supertrend',
    'Stochastic': 'stochastic', 'Donchian': 'donchian',
    'Ichimoku': 'ichimoku', 'KC': 'keltner', 'MA Ribbon': 'ma-ribbon',
    'VWAP': 'vwap', 'Volume': 'volume', 'ADX': 'adx',
  };
  
  const source = indicator.kuriSource 
    || DEFAULT_INDICATORS.find(i => i.id === typeMap[indicator.type])?.kuriSource;
  
  if (source) {
    const bridge = getKuriBridge();
    const result = bridge.run(source, candles);
    
    if (result.errors.filter(e => e.phase !== 'runtime').length === 0) {
      // Always set fresh Kuri metadata
      const enriched: Indicator = {
        ...indicator,
        kuriSource: source,
        kuriTitle: result.indicator?.title || indicator.type,
        kuriInputDefs: result.inputDefs || [],
        kuriPlots: (result.plots || []).map(p => ({
          title: p.title || 'Plot',
          color: p.color || '#2962FF',
          linewidth: p.linewidth || 1,
          style: p.style || 'line',
        })),
        kuriHlines: result.hlines || [],
      };
      setSettingsIndicator(enriched);
      return;
    }
  }
  
  // Fallback — open with whatever we have
  setSettingsIndicator(indicator);
}
```

This runs the engine EVERY time settings are opened. It's a few milliseconds of overhead but guarantees the Kuri path always has data.

## After Fixing — Expected Result

Click ⚙ on MA(20):
- Title: "Simple Moving Average Settings" (not "MA Settings")
- Inputs tab shows 5 fields:
  - Length: 9 (number spinner)
  - Source: close (dropdown)
  - Smoothing Type: None (dropdown with 6 options)
  - Smoothing Length: 14 (number spinner)
  - BB StdDev: 2.0 (decimal spinner)
- Style tab shows 4 plots:
  - SMA (blue, width 2)
  - Smoothing MA (yellow)
  - Upper BB (green)
  - Lower BB (green)

Click ⚙ on RSI(14):
- Title: "Relative Strength Index Settings"
- Inputs tab: RSI Length (14), Source (close)
- Style tab: RSI line (purple) + 3 hlines (Overbought 70, Middle 50, Oversold 30)
