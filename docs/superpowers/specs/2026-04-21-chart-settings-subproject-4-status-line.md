# Chart Settings — Sub-Project 4: Status Line Full Feature Set

**Date:** 2026-04-21
**Status:** Approved

## Goal

Wire up the existing 5 `StatusLineSettings` flags (currently stored but ignored by the render code) and add 3 new features — bar change percent, symbol description, market status badge — to the chart header. Plus render indicator titles and values inline below the OHLC row.

## Context

This is sub-project **4 of 6** in the Chart Settings expansion. Sub-projects 1-3 shipped Symbol display controls, the chart-type switcher, and scale modes.

Current state:
- `StatusLineSettings` (in `src/components/market-chart/types.ts:436`) declares: `showOhlc`, `showBarChange`, `showVolume`, `showIndicatorTitles`, `showIndicatorValues`
- `ChartHeader.tsx:345-372` renders OHLC + Volume **unconditionally** — the existing flags are ignored
- No bar-change, bar-change-percent, symbol-description, indicator-titles, indicator-values, or market-status rendering today
- Symbol description: no static dictionary yet
- Market status: no helper yet

This sub-project produces a header that reflects every status-line toggle in the settings modal and adds a richer information surface for traders.

---

## State Model & Settings Fields

### `types.ts` additions

Extend the existing `StatusLineSettings` interface:

```typescript
export interface StatusLineSettings {
    showOhlc: boolean;
    showBarChange: boolean;
    showVolume: boolean;
    showIndicatorTitles: boolean;
    showIndicatorValues: boolean;
    showBarChangePercent: boolean;   // NEW: "+0.55%" after bar change values
    showSymbolDescription: boolean;  // NEW: "Bitcoin / Tether USD" next to symbol
    showMarketStatus: boolean;       // NEW: "● Live" / "● Closed" badge
}
```

### Defaults (in `getDefaultChartSettings`)

```typescript
statusLine: {
    showOhlc: true,
    showBarChange: true,
    showVolume: true,
    showIndicatorTitles: true,
    showIndicatorValues: true,
    showBarChangePercent: false,    // off by default — opt-in
    showSymbolDescription: true,
    showMarketStatus: true,
},
```

### Migration

Add `normaliseStatusLineSettings(raw, defaults)` to `src/services/marketStateService.ts`, alongside the existing normalisers. Wire into `normaliseChartSettings`:

```typescript
export function normaliseStatusLineSettings(
    raw: any,
    defaults: StatusLineSettings
): StatusLineSettings {
    if (!raw || typeof raw !== 'object') return { ...defaults };
    return {
        ...defaults,
        ...raw,
        showOhlc: typeof raw.showOhlc === 'boolean' ? raw.showOhlc : defaults.showOhlc,
        showBarChange: typeof raw.showBarChange === 'boolean' ? raw.showBarChange : defaults.showBarChange,
        showVolume: typeof raw.showVolume === 'boolean' ? raw.showVolume : defaults.showVolume,
        showIndicatorTitles: typeof raw.showIndicatorTitles === 'boolean' ? raw.showIndicatorTitles : defaults.showIndicatorTitles,
        showIndicatorValues: typeof raw.showIndicatorValues === 'boolean' ? raw.showIndicatorValues : defaults.showIndicatorValues,
        showBarChangePercent: typeof raw.showBarChangePercent === 'boolean' ? raw.showBarChangePercent : defaults.showBarChangePercent,
        showSymbolDescription: typeof raw.showSymbolDescription === 'boolean' ? raw.showSymbolDescription : defaults.showSymbolDescription,
        showMarketStatus: typeof raw.showMarketStatus === 'boolean' ? raw.showMarketStatus : defaults.showMarketStatus,
    };
}
```

`normaliseChartSettings` adds:

```typescript
statusLine: normaliseStatusLineSettings(raw.statusLine, defaults.statusLine),
```

---

## Header Layout

File: `src/components/market-chart/ChartHeader.tsx`

### Symbol + description block (replace existing symbol button area)

Currently the symbol button stands alone. Add an optional description span next to it, gated on `showSymbolDescription`:

```tsx
<div className="flex items-center gap-2">
    <button onClick={() => setSymbolSearchOpen(true)} className="px-2 py-0.5 rounded-md hover:bg-gray-700">
        <h2 className="text-base font-semibold text-white">{symbol}</h2>
    </button>
    {statusLineSettings.showSymbolDescription && (
        <span className="text-xs text-gray-500 hidden md:inline">
            {getSymbolDescription(symbol) ?? ''}
        </span>
    )}
</div>
```

### OHLC + bar change + volume block (replace lines 345-372)

```tsx
{headerOhlc && (
    <div className={`hidden md:flex items-center gap-3 ml-4 text-xs font-mono font-medium ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
        {statusLineSettings.showOhlc && (
            <>
                <span><span className="text-gray-500 mr-1">O</span>{format(ohlc.open)}</span>
                <span><span className="text-gray-500 mr-1">H</span>{format(ohlc.high)}</span>
                <span><span className="text-gray-500 mr-1">L</span>{format(ohlc.low)}</span>
                <span><span className="text-gray-500 mr-1">C</span>{format(ohlc.close)}</span>
            </>
        )}
        {statusLineSettings.showBarChange && (
            <span>{(ohlc.close - ohlc.open >= 0 ? '+' : '')}{format(ohlc.close - ohlc.open)}</span>
        )}
        {statusLineSettings.showBarChangePercent && ohlc.open > 0 && (
            <span>
                {(((ohlc.close - ohlc.open) / ohlc.open) * 100 >= 0 ? '+' : '')}
                {(((ohlc.close - ohlc.open) / ohlc.open) * 100).toFixed(2)}%
            </span>
        )}
        {statusLineSettings.showVolume && ohlc.volume !== undefined && (
            <span className="text-gray-400 ml-1">
                <span className="text-gray-500 mr-1">Vol</span>
                {formatVolume(ohlc.volume)}
            </span>
        )}
    </div>
)}
```

The colour (`isPositive ? text-green-400 : text-red-400`) applies to the whole row including bar change spans — matches TradingView convention.

### Indicator titles + values row

Render INSIDE the same `headerOhlc` flex block, AFTER the OHLC/Volume block, separated by a vertical divider when there's at least one indicator and at least one of `showIndicatorTitles` / `showIndicatorValues` is on:

```tsx
{headerOhlc && (statusLineSettings.showIndicatorTitles || statusLineSettings.showIndicatorValues) && indicators.length > 0 && (
    <div className="hidden md:flex items-center gap-3 ml-3 pl-3 border-l border-gray-700/50 text-xs font-mono font-medium text-gray-400">
        {indicators.map((ind) => (
            <span key={ind.id} className="cursor-pointer hover:text-white" onClick={() => onEditIndicator?.(ind.id)}>
                {statusLineSettings.showIndicatorTitles && (
                    <span className="text-gray-300">{formatIndicatorTitle(ind)}</span>
                )}
                {statusLineSettings.showIndicatorTitles && statusLineSettings.showIndicatorValues && ' '}
                {statusLineSettings.showIndicatorValues && (
                    <span>{formatIndicatorLatestValue(ind)}</span>
                )}
            </span>
        ))}
    </div>
)}
```

Helpers:
- `formatIndicatorTitle(ind)`: returns `${ind.type}(${Object.values(ind.params).join(',')})` e.g. `MA(20)`
- `formatIndicatorLatestValue(ind)`: reads the last numeric value from `ind.data` (or wherever the rendered series lives) and runs it through the existing `formatPrice` / equivalent. Returns `'—'` if no data.

`indicators` and `onEditIndicator` need to be passed as new props from `CandlestickChart.tsx` to `ChartHeader.tsx`.

### Market status badge (right side, before action buttons)

Insert in the right-side action group (before the Undo/Redo cluster around line 374):

```tsx
{statusLineSettings.showMarketStatus && (
    <div className="hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium" title={`Market status: ${marketStatus.label}`}>
        <span className={`w-2 h-2 rounded-full ${marketStatusDotColor(marketStatus.state)}`} />
        <span className="text-gray-400">{marketStatus.label}</span>
    </div>
)}
```

`marketStatus` and `marketStatusDotColor` come from the new `marketStatus.ts` helper (next section).

---

## Symbol Description

New file: `src/components/market-chart/symbolDescriptions.ts`

Static lookup dictionary for the most common Binance crypto pairs:

```typescript
const SYMBOL_DESCRIPTIONS: Record<string, string> = {
    'BTCUSDT': 'Bitcoin / Tether USD',
    'ETHUSDT': 'Ethereum / Tether USD',
    'BNBUSDT': 'BNB / Tether USD',
    'SOLUSDT': 'Solana / Tether USD',
    'XRPUSDT': 'XRP / Tether USD',
    'ADAUSDT': 'Cardano / Tether USD',
    'DOGEUSDT': 'Dogecoin / Tether USD',
    'AVAXUSDT': 'Avalanche / Tether USD',
    'DOTUSDT': 'Polkadot / Tether USD',
    'MATICUSDT': 'Polygon / Tether USD',
    'LTCUSDT': 'Litecoin / Tether USD',
    'LINKUSDT': 'Chainlink / Tether USD',
    'TRXUSDT': 'TRON / Tether USD',
    'NEARUSDT': 'NEAR Protocol / Tether USD',
    'UNIUSDT': 'Uniswap / Tether USD',
};

export function getSymbolDescription(symbol: string): string | null {
    // Strip Binance Futures suffix (e.g., "BTCUSDT.P" → "BTCUSDT")
    const base = symbol.replace(/\.[A-Z]+$/, '');
    return SYMBOL_DESCRIPTIONS[base] ?? null;
}
```

If the symbol isn't in the dictionary, render nothing (helper returns null, JSX shows empty string).

---

## Market Status

New file: `src/utils/marketStatus.ts`

```typescript
export type MarketState = 'open' | 'closed' | 'pre-market' | 'after-hours';
export type AssetClass = 'crypto' | 'us-stock' | 'forex' | 'futures' | 'unknown';

export interface MarketStatus {
    state: MarketState;
    label: string; // e.g. "Live", "Closed", "Pre-market"
}

export function classifyAsset(symbol: string): AssetClass {
    if (/USDT?$|USDC?$|BTC$|ETH$/.test(symbol) || /\.[A-Z]+$/.test(symbol)) return 'crypto';
    if (/^[A-Z]{1,5}$/.test(symbol)) return 'us-stock';
    if (/^[A-Z]{6}$/.test(symbol)) return 'forex';
    return 'unknown';
}

export function getMarketStatus(symbol: string, now: Date = new Date()): MarketStatus {
    const cls = classifyAsset(symbol);
    switch (cls) {
        case 'crypto':
            return { state: 'open', label: 'Live' };
        case 'us-stock':
            return getUsStockStatus(now);
        case 'forex':
            return getForexStatus(now);
        case 'futures':
            return getFuturesStatus(now);
        case 'unknown':
            return { state: 'open', label: 'Live' };
    }
}

function getUsStockStatus(now: Date): MarketStatus {
    // Convert to ET. Assume utility uses Intl.DateTimeFormat for IANA tz.
    const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const dow = et.getDay(); // 0=Sun, 6=Sat
    if (dow === 0 || dow === 6) return { state: 'closed', label: 'Closed' };
    const minutes = et.getHours() * 60 + et.getMinutes();
    const PRE_OPEN = 4 * 60;       // 04:00
    const REG_OPEN = 9 * 60 + 30;  // 09:30
    const REG_CLOSE = 16 * 60;     // 16:00
    const POST_CLOSE = 20 * 60;    // 20:00
    if (minutes >= REG_OPEN && minutes < REG_CLOSE) return { state: 'open', label: 'Open' };
    if (minutes >= PRE_OPEN && minutes < REG_OPEN) return { state: 'pre-market', label: 'Pre-market' };
    if (minutes >= REG_CLOSE && minutes < POST_CLOSE) return { state: 'after-hours', label: 'After-hours' };
    return { state: 'closed', label: 'Closed' };
}

function getForexStatus(now: Date): MarketStatus {
    // Forex 24/5: open Sun 17:00 ET → Fri 17:00 ET
    const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const dow = et.getDay();
    const minutes = et.getHours() * 60 + et.getMinutes();
    const FRI_CLOSE = 17 * 60;
    const SUN_OPEN = 17 * 60;
    if (dow === 6) return { state: 'closed', label: 'Closed' };
    if (dow === 0 && minutes < SUN_OPEN) return { state: 'closed', label: 'Closed' };
    if (dow === 5 && minutes >= FRI_CLOSE) return { state: 'closed', label: 'Closed' };
    return { state: 'open', label: 'Live' };
}

function getFuturesStatus(now: Date): MarketStatus {
    // Simplified: Globex 24h Sun 18:00 ET → Fri 17:00 ET
    return getForexStatus(now); // close enough for v1
}

export function marketStatusDotColor(state: MarketState): string {
    switch (state) {
        case 'open': return 'bg-green-500';
        case 'closed': return 'bg-red-500';
        case 'pre-market':
        case 'after-hours': return 'bg-yellow-500';
    }
}
```

### Live updates

Status changes only at session boundaries (e.g., 9:30 AM open). In `ChartHeader.tsx`:

```tsx
const [marketStatus, setMarketStatus] = useState(() => getMarketStatus(symbol));
useEffect(() => {
    setMarketStatus(getMarketStatus(symbol));
    const id = setInterval(() => setMarketStatus(getMarketStatus(symbol)), 60_000);
    return () => clearInterval(id);
}, [symbol]);
```

Re-evaluates every 60s, plus immediately on symbol change.

---

## Settings Modal Changes

File: `src/components/market-chart/ChartSettingsModal.tsx`, `StatusLineSettingsComponent` (search for the component definition).

Add 3 new `CheckboxSettingRow` entries to the existing list of 4 checkboxes:

```tsx
<CheckboxSettingRow label="Symbol description" isChecked={settings.showSymbolDescription} onToggle={(v) => onChange('showSymbolDescription', v)} />
<CheckboxSettingRow label="Bar change %" isChecked={settings.showBarChangePercent} onToggle={(v) => onChange('showBarChangePercent', v)} />
<CheckboxSettingRow label="Market status" isChecked={settings.showMarketStatus} onToggle={(v) => onChange('showMarketStatus', v)} />
```

Final order in the Status-line tab:
1. Symbol description (new)
2. Title (existing → was rendering nothing, now controls indicator titles via `showIndicatorTitles`)
3. OHLC values (existing)
4. Bar change values (existing)
5. Bar change % (new)
6. Volume (existing)
7. Indicator values (new — was the existing `showIndicatorValues` flag, now actually wired)
8. Market status (new)

Actually the existing modal lists `Title` for `showIndicatorTitles` already. Keep it. Just add the 3 new toggles in a sensible order (e.g., new ones at the bottom).

---

## CandlestickChart → ChartHeader prop additions

`CandlestickChart.tsx` passes new props to `<ChartHeader />`:

```typescript
statusLineSettings={chartSettings.statusLine}
indicators={allActiveIndicators}
onEditIndicator={(id) => { /* existing indicator-edit handler */ }}
```

`ChartHeader.tsx` props interface gains:

```typescript
statusLineSettings: StatusLineSettings;
indicators: Indicator[];
onEditIndicator?: (id: string) => void;
```

If an existing `onEditIndicator` prop or callback flow exists, reuse it.

---

## Files Affected

| File | Change |
|------|--------|
| `src/components/market-chart/types.ts` | Add 3 fields to `StatusLineSettings` |
| `src/components/market-chart/CandlestickChart.tsx` | Update `getDefaultChartSettings`; pass `statusLineSettings` + `indicators` + `onEditIndicator` to `<ChartHeader />` |
| `src/services/marketStateService.ts` | Add `normaliseStatusLineSettings`; wire into `normaliseChartSettings` |
| `src/components/market-chart/ChartHeader.tsx` | New props; gate OHLC/Volume on flags; add bar-change/bar-change-%/symbol-description/market-status/indicator rendering; market-status state + interval |
| `src/components/market-chart/ChartSettingsModal.tsx` | Add 3 new checkboxes to Status-line tab |
| `src/components/market-chart/symbolDescriptions.ts` | **Create** — static dictionary + `getSymbolDescription` |
| `src/utils/marketStatus.ts` | **Create** — `classifyAsset`, `getMarketStatus`, `marketStatusDotColor` |

---

## Migration / Backward Compatibility

Existing Supabase rows have `statusLine` JSON without the 3 new fields. `normaliseStatusLineSettings` fills missing fields with defaults. Existing flag values preserved.

The render-behavior change matters: users who previously had `showOhlc: false` saved but were still seeing OHLC (because the flag was ignored) will now see OHLC HIDDEN. This is correct behavior — settings finally take effect — but worth noting as a "feature, not bug" if a user reports it.

---

## Out of Scope

- Indicator arguments rendering (per Q1.B; just title + value)
- Buy/Sell quick action buttons (per Q1.B)
- User-editable symbol description dictionary (static only)
- Market hours for exotic markets (LSE, TSE, etc.) — only NYSE/NASDAQ + forex 24/5 + futures simplified
- Sub-projects 5 and 6
