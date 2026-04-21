# Chart Settings Sub-Project 4 — Status Line Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the 5 existing `StatusLineSettings` flags (currently stored but ignored), add 3 new fields (bar-change %, symbol description, market status), render symbol description / bar-change values + % / market-status badge / per-indicator title + value in the chart header.

**Architecture:** All new behavior is gated by the `chartSettings.statusLine.*` flags. New helper files for the static symbol-description dictionary and the asset-class-aware market-status calculator. `ChartHeader.tsx` receives `statusLineSettings` + `indicators` + `onEditIndicator` props; render code reads the flags and renders accordingly. Migration via the existing normaliser pattern from sub-projects 1 and 3.

**Tech Stack:** React + TypeScript, HTML Canvas chart, Vite, Supabase for settings persistence.

**Spec:** `docs/superpowers/specs/2026-04-21-chart-settings-subproject-4-status-line.md`

---

## File Map

| File | Change |
|------|--------|
| `src/components/market-chart/types.ts` | Add 3 fields to `StatusLineSettings` |
| `src/components/market-chart/CandlestickChart.tsx` | Defaults; pass `statusLineSettings`, `indicators`, `onEditIndicator` to `<ChartHeader />` |
| `src/services/marketStateService.ts` | Add `normaliseStatusLineSettings`; wire into `normaliseChartSettings` |
| `src/components/market-chart/ChartHeader.tsx` | New props; gate OHLC/Volume render on flags; add bar-change/bar-change-%/symbol-description/market-status/indicator rendering |
| `src/components/market-chart/ChartSettingsModal.tsx` | Add 3 new checkbox rows to Status-line tab |
| `src/components/market-chart/symbolDescriptions.ts` | **Create** — static dictionary + `getSymbolDescription` |
| `src/utils/marketStatus.ts` | **Create** — `classifyAsset`, `getMarketStatus`, `marketStatusDotColor` |

---

## Task 1: Types + defaults + migration helper

**Files:**
- Modify: `src/components/market-chart/types.ts`
- Modify: `src/components/market-chart/CandlestickChart.tsx` (`getDefaultChartSettings` around line 135)
- Modify: `src/services/marketStateService.ts`

After this task: types compile with the 3 new fields. No runtime behavior change yet.

- [ ] **Step 1: Extend `StatusLineSettings` in `types.ts`**

Find the `StatusLineSettings` interface around line 436:

```typescript
export interface StatusLineSettings {
    showOhlc: boolean;
    showBarChange: boolean;
    showVolume: boolean;
    showIndicatorTitles: boolean;
    showIndicatorValues: boolean;
}
```

Append three fields:

```typescript
export interface StatusLineSettings {
    showOhlc: boolean;
    showBarChange: boolean;
    showVolume: boolean;
    showIndicatorTitles: boolean;
    showIndicatorValues: boolean;
    showBarChangePercent: boolean;
    showSymbolDescription: boolean;
    showMarketStatus: boolean;
}
```

- [ ] **Step 2: Update `getDefaultChartSettings` in `CandlestickChart.tsx`**

Find the `statusLine:` block inside `getDefaultChartSettings` (around line 155). Append 3 fields:

```typescript
        statusLine: {
            showOhlc: true,
            showBarChange: true,
            showVolume: true,
            showIndicatorTitles: true,
            showIndicatorValues: true,
            showBarChangePercent: false,
            showSymbolDescription: true,
            showMarketStatus: true,
        },
```

- [ ] **Step 3: Add `normaliseStatusLineSettings` to `marketStateService.ts`**

Open `src/services/marketStateService.ts`. Add `StatusLineSettings` to the existing type-imports block at the top:

```typescript
import type {
    ChartSettings,
    SymbolSettings,
    ScalesAndLinesSettings,
    StatusLineSettings,
} from '../components/market-chart/types';
```

Then add this helper at module scope, near the existing `normaliseSymbolSettings` and `normaliseScalesAndLinesSettings`:

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

Find the existing `normaliseChartSettings`:

```typescript
export function normaliseChartSettings(raw: any, defaults: ChartSettings): ChartSettings {
    if (!raw || typeof raw !== 'object') return { ...defaults };
    return {
        ...defaults,
        ...raw,
        symbol: normaliseSymbolSettings(raw.symbol, defaults.symbol),
        scalesAndLines: normaliseScalesAndLinesSettings(raw.scalesAndLines, defaults.scalesAndLines),
    };
}
```

Append the `statusLine` line:

```typescript
export function normaliseChartSettings(raw: any, defaults: ChartSettings): ChartSettings {
    if (!raw || typeof raw !== 'object') return { ...defaults };
    return {
        ...defaults,
        ...raw,
        symbol: normaliseSymbolSettings(raw.symbol, defaults.symbol),
        scalesAndLines: normaliseScalesAndLinesSettings(raw.scalesAndLines, defaults.scalesAndLines),
        statusLine: normaliseStatusLineSettings(raw.statusLine, defaults.statusLine),
    };
}
```

- [ ] **Step 4: Verify build**

```bash
cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm build 2>&1 | grep -E "error TS" | head -10
```

Expected: no errors.

- [ ] **Step 5: Verify scope**

```bash
git status --short
```

Expected: only the 3 files modified above.

- [ ] **Step 6: Commit**

```bash
git add src/components/market-chart/types.ts src/components/market-chart/CandlestickChart.tsx src/services/marketStateService.ts
git commit -m "feat(status-line): add 3 new StatusLineSettings fields + normaliser"
```

---

## Task 2: Symbol description + market status helpers

**Files:**
- Create: `src/components/market-chart/symbolDescriptions.ts`
- Create: `src/utils/marketStatus.ts`

After this task: two new utility modules exist. No render integration yet — Task 4 wires them into ChartHeader.

- [ ] **Step 1: Create `symbolDescriptions.ts`**

Create the file `src/components/market-chart/symbolDescriptions.ts` with this exact content:

```typescript
const SYMBOL_DESCRIPTIONS: Record<string, string> = {
    BTCUSDT: 'Bitcoin / Tether USD',
    ETHUSDT: 'Ethereum / Tether USD',
    BNBUSDT: 'BNB / Tether USD',
    SOLUSDT: 'Solana / Tether USD',
    XRPUSDT: 'XRP / Tether USD',
    ADAUSDT: 'Cardano / Tether USD',
    DOGEUSDT: 'Dogecoin / Tether USD',
    AVAXUSDT: 'Avalanche / Tether USD',
    DOTUSDT: 'Polkadot / Tether USD',
    MATICUSDT: 'Polygon / Tether USD',
    LTCUSDT: 'Litecoin / Tether USD',
    LINKUSDT: 'Chainlink / Tether USD',
    TRXUSDT: 'TRON / Tether USD',
    NEARUSDT: 'NEAR Protocol / Tether USD',
    UNIUSDT: 'Uniswap / Tether USD',
};

/**
 * Look up a human-readable description for a Binance trading pair.
 * Strips Binance Futures suffixes like ".P" before the lookup so
 * "BTCUSDT.P" returns the same description as "BTCUSDT".
 * Returns null when the symbol isn't in the static dictionary.
 */
export function getSymbolDescription(symbol: string): string | null {
    const base = symbol.replace(/\.[A-Z]+$/, '');
    return SYMBOL_DESCRIPTIONS[base] ?? null;
}
```

- [ ] **Step 2: Create `marketStatus.ts`**

Create the file `src/utils/marketStatus.ts` with this exact content:

```typescript
export type MarketState = 'open' | 'closed' | 'pre-market' | 'after-hours';
export type AssetClass = 'crypto' | 'us-stock' | 'forex' | 'futures' | 'unknown';

export interface MarketStatus {
    state: MarketState;
    label: string;
}

/**
 * Classify a symbol into an asset class by string pattern. Crypto detection
 * relies on USDT/USDC/BTC/ETH suffixes or the Binance ".P" perpetual suffix.
 * US stocks are 1–5 uppercase letters with no suffix. Forex is 6 letters
 * (e.g., USDEUR, GBPJPY). Everything else is "unknown".
 */
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
    const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const dow = et.getDay();
    if (dow === 0 || dow === 6) return { state: 'closed', label: 'Closed' };
    const minutes = et.getHours() * 60 + et.getMinutes();
    const PRE_OPEN = 4 * 60;
    const REG_OPEN = 9 * 60 + 30;
    const REG_CLOSE = 16 * 60;
    const POST_CLOSE = 20 * 60;
    if (minutes >= REG_OPEN && minutes < REG_CLOSE) return { state: 'open', label: 'Open' };
    if (minutes >= PRE_OPEN && minutes < REG_OPEN) return { state: 'pre-market', label: 'Pre-market' };
    if (minutes >= REG_CLOSE && minutes < POST_CLOSE) return { state: 'after-hours', label: 'After-hours' };
    return { state: 'closed', label: 'Closed' };
}

function getForexStatus(now: Date): MarketStatus {
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
    return getForexStatus(now);
}

export function marketStatusDotColor(state: MarketState): string {
    switch (state) {
        case 'open':
            return 'bg-green-500';
        case 'closed':
            return 'bg-red-500';
        case 'pre-market':
        case 'after-hours':
            return 'bg-yellow-500';
    }
}
```

- [ ] **Step 3: Verify build**

```bash
cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm build 2>&1 | grep -E "error TS" | head -5
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/market-chart/symbolDescriptions.ts src/utils/marketStatus.ts
git commit -m "feat(status-line): add symbolDescriptions + marketStatus helpers"
```

---

## Task 3: Settings modal — 3 new checkbox toggles

**Files:**
- Modify: `src/components/market-chart/ChartSettingsModal.tsx`

After this task: the Status-line tab in the settings modal has 8 toggles instead of 5. The 3 new toggles persist via the existing onSave path.

- [ ] **Step 1: Add 3 new checkbox rows to `StatusLineSettingsComponent`**

Find `StatusLineSettingsComponent` in `ChartSettingsModal.tsx` (search for the component name). It currently renders 4-5 `CheckboxSettingRow` instances. Append three more at the bottom of the existing list:

```tsx
<CheckboxSettingRow
    label="Symbol description"
    isChecked={settings.showSymbolDescription}
    onToggle={(v) => onChange('showSymbolDescription', v)}
/>
<CheckboxSettingRow
    label="Bar change %"
    isChecked={settings.showBarChangePercent}
    onToggle={(v) => onChange('showBarChangePercent', v)}
/>
<CheckboxSettingRow
    label="Market status"
    isChecked={settings.showMarketStatus}
    onToggle={(v) => onChange('showMarketStatus', v)}
/>
```

- [ ] **Step 2: Verify build**

```bash
cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm build 2>&1 | grep -E "error TS" | head -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/market-chart/ChartSettingsModal.tsx
git commit -m "feat(status-line): add 3 new checkboxes to Status-line settings tab"
```

---

## Task 4: ChartHeader — wire existing flags + bar change + symbol description + market status

**Files:**
- Modify: `src/components/market-chart/ChartHeader.tsx`
- Modify: `src/components/market-chart/CandlestickChart.tsx` (just the `<ChartHeader />` props pass-through around line 9767)

After this task: header reflects all status-line toggles for the items in this task (OHLC, BarChange, BarChangePercent, Volume, SymbolDescription, MarketStatus). Indicator titles + values land in Task 5.

- [ ] **Step 1: Add new props to `ChartHeader`**

Find the props interface for `ChartHeader` (search `interface ChartHeaderProps` or similar — likely near the top of `ChartHeader.tsx`). Add:

```typescript
statusLineSettings: StatusLineSettings;
```

Add `StatusLineSettings` to the existing import from `./types`:

```typescript
import type { ChartType, StatusLineSettings } from './types';
```

In the component destructuring, pull the new prop:

```typescript
const ChartHeader: React.FC<ChartHeaderProps> = ({
    // ...existing props...
    statusLineSettings,
    // ...
}) => {
```

- [ ] **Step 2: Pass `statusLineSettings` from `CandlestickChart.tsx`**

Find `<ChartHeader` JSX at line 9767. Add this prop alongside the existing ones (e.g., right after `headerOhlc={headerOhlc}`):

```tsx
statusLineSettings={chartSettings.statusLine}
```

- [ ] **Step 3: Add new helper imports to `ChartHeader.tsx`**

Near the top of the file with other imports, add:

```typescript
import { getSymbolDescription } from './symbolDescriptions';
import {
    getMarketStatus,
    marketStatusDotColor,
    type MarketStatus,
} from '../../utils/marketStatus';
```

- [ ] **Step 4: Add market-status state + auto-refresh effect**

Inside the `ChartHeader` component body, near the other `useState` declarations, add:

```typescript
const [marketStatus, setMarketStatus] = useState<MarketStatus>(() => getMarketStatus(symbol));
useEffect(() => {
    setMarketStatus(getMarketStatus(symbol));
    const id = setInterval(() => setMarketStatus(getMarketStatus(symbol)), 60_000);
    return () => clearInterval(id);
}, [symbol]);
```

If `useState` and `useEffect` aren't already imported, add them to the existing React import.

- [ ] **Step 5: Update the symbol button block to add description**

Find the existing symbol button area in `ChartHeader.tsx` (around line 242-255 — the `<button>` wrapping the `<h2>{symbol}</h2>`). The current structure:

```tsx
<div className="bg-gray-800 p-0.5 rounded-lg flex items-center gap-1">
    <div className="relative">
        <button onClick={() => setSymbolSearchOpen(true)} className="px-2 py-0.5 rounded-md hover:bg-gray-700">
            <h2 className="text-base font-semibold text-white">{symbol}</h2>
        </button>
        <SymbolSearchModal ... />
    </div>
    ...
```

Just AFTER the closing `</div>` of `<div className="relative">` (which wraps the symbol button + search modal), but BEFORE the `<div className="flex items-center gap-1">` that holds favorite timeframes — insert a description span:

```tsx
{statusLineSettings.showSymbolDescription && getSymbolDescription(symbol) && (
    <span className="text-xs text-gray-500 hidden md:inline px-1">
        {getSymbolDescription(symbol)}
    </span>
)}
```

If the timeframes block layout differs, place the description right after the symbol button so it visually sits next to the symbol name.

- [ ] **Step 6: Replace the OHLC/Volume render block (around line 345)**

Find the existing OHLC block:

```tsx
{headerOhlc && (
    <div className={`hidden md:flex items-center gap-3 ml-4 text-xs font-mono font-medium ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
        <span><span className="text-gray-500 mr-1">O</span>{format(ohlc.open)}</span>
        <span><span className="text-gray-500 mr-1">H</span>{format(ohlc.high)}</span>
        <span><span className="text-gray-500 mr-1">L</span>{format(ohlc.low)}</span>
        <span><span className="text-gray-500 mr-1">C</span>{format(ohlc.close)}</span>
        {ohlc.volume !== undefined && (
            <span className="text-gray-400 ml-1">
                <span className="text-gray-500 mr-1">Vol</span>
                {formatVolume(ohlc.volume)}
            </span>
        )}
    </div>
)}
```

Replace with the gated version including bar-change + bar-change-%:

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
            <span>
                {ohlc.close - ohlc.open >= 0 ? '+' : ''}
                {format(ohlc.close - ohlc.open)}
            </span>
        )}
        {statusLineSettings.showBarChangePercent && ohlc.open > 0 && (
            <span>
                {((ohlc.close - ohlc.open) / ohlc.open) * 100 >= 0 ? '+' : ''}
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

- [ ] **Step 7: Add market-status badge to the right-side action group**

Find the right-side action area (around line 374, which starts `<div className="flex items-center gap-2">`). Insert the badge BEFORE the existing `<div className="bg-gray-800 p-1 rounded-lg">` that holds Undo/Redo etc:

```tsx
{statusLineSettings.showMarketStatus && (
    <div
        className="hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium"
        title={`Market status: ${marketStatus.label}`}
    >
        <span className={`w-2 h-2 rounded-full ${marketStatusDotColor(marketStatus.state)}`} />
        <span className="text-gray-400">{marketStatus.label}</span>
    </div>
)}
```

- [ ] **Step 8: Verify build**

```bash
cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm build 2>&1 | grep -E "error TS" | head -10
```

Expected: no errors.

- [ ] **Step 9: Verify scope**

```bash
git status --short
```

Expected: only `M src/components/market-chart/ChartHeader.tsx` and `M src/components/market-chart/CandlestickChart.tsx`.

- [ ] **Step 10: Commit**

```bash
git add src/components/market-chart/ChartHeader.tsx src/components/market-chart/CandlestickChart.tsx
git commit -m "feat(status-line): wire existing flags + add bar-change/symbol-desc/market-status"
```

---

## Task 5: Indicator titles + values rendering in ChartHeader

**Files:**
- Modify: `src/components/market-chart/ChartHeader.tsx`
- Modify: `src/components/market-chart/CandlestickChart.tsx` (pass new props to `<ChartHeader />`)

After this task: the header shows one inline span per active indicator with its title (e.g. `MA(20)`) and latest numeric value (e.g. `48,239.50`). Click on the indicator opens its settings.

- [ ] **Step 1: Add `indicators` and `onEditIndicator` props to `ChartHeader`**

In the props interface, add:

```typescript
indicators: Indicator[];
onEditIndicator?: (id: string) => void;
```

Add `Indicator` to the existing import from `./types`:

```typescript
import type { ChartType, StatusLineSettings, Indicator } from './types';
```

In the destructuring at the top of the component:

```typescript
const ChartHeader: React.FC<ChartHeaderProps> = ({
    // ...existing props...
    statusLineSettings,
    indicators,
    onEditIndicator,
    // ...
}) => {
```

- [ ] **Step 2: Pass new props from `CandlestickChart.tsx`**

In the `<ChartHeader>` JSX (around line 9767), add:

```tsx
indicators={allActiveIndicators}
onEditIndicator={(id) => {
    const ind = allActiveIndicators.find((i) => i.id === id);
    if (ind) setIndicatorToEdit(ind);
}}
```

(`allActiveIndicators` and `setIndicatorToEdit` are already in scope in `CandlestickChart.tsx`.)

- [ ] **Step 3: Add helper functions in `ChartHeader.tsx`**

Above the `ChartHeader` component declaration (or inside the component, before the return — wherever fits the file structure), add:

```typescript
const formatIndicatorTitle = (ind: Indicator): string => {
    // Build "TYPE(param1,param2,...)". Skip non-numeric/non-string params.
    const params = ind.settings && typeof ind.settings === 'object'
        ? Object.values(ind.settings as Record<string, unknown>).filter(
              (v) => typeof v === 'number' || typeof v === 'string'
          )
        : [];
    if (params.length === 0) return String(ind.type);
    return `${ind.type}(${params.join(',')})`;
};

const formatIndicatorLatestValue = (ind: Indicator): string => {
    // ind.data is Record<string, (number | null)[]>. Use the first non-empty key
    // and return its last non-null value, formatted with at most 2 decimals.
    if (!ind.data || typeof ind.data !== 'object') return '—';
    for (const key of Object.keys(ind.data)) {
        const arr = ind.data[key];
        if (!Array.isArray(arr)) continue;
        for (let i = arr.length - 1; i >= 0; i--) {
            const v = arr[i];
            if (typeof v === 'number' && Number.isFinite(v)) {
                return v.toFixed(Math.abs(v) >= 100 ? 2 : 4);
            }
        }
    }
    return '—';
};
```

- [ ] **Step 4: Add the indicator row inside the header**

After the OHLC/Volume block (the `{headerOhlc && ( ... )}` from Task 4), insert another conditional block:

```tsx
{headerOhlc &&
    (statusLineSettings.showIndicatorTitles || statusLineSettings.showIndicatorValues) &&
    indicators.length > 0 && (
        <div className="hidden md:flex items-center gap-3 ml-3 pl-3 border-l border-gray-700/50 text-xs font-mono font-medium text-gray-400">
            {indicators.map((ind) => (
                <span
                    key={ind.id}
                    className="cursor-pointer hover:text-white"
                    onClick={() => onEditIndicator?.(ind.id)}
                >
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

- [ ] **Step 5: Verify build**

```bash
cd "c:/Users/nirma/OneDrive/Desktop/My Project - Copy 1/My Project" && pnpm build 2>&1 | grep -E "error TS" | head -10
```

Expected: no errors.

- [ ] **Step 6: Visual test (final, end-to-end)**

```bash
pnpm dev
```

- Open the chart settings modal → Status-line tab → confirm 8 toggles present (5 existing + 3 new)
- Toggle OHLC values OFF → header OHLC numbers disappear; bar-change span (if on) still shown
- Toggle Bar change % ON → "+0.55%" appears alongside "+231.50"
- Toggle Symbol description OFF → "Bitcoin / Tether USD" disappears next to BTCUSDT
- Toggle Symbol description ON → reappears
- Add an MA(20) indicator → header shows "MA(20) 48239.50" inline (right of OHLC, left of action buttons)
- Toggle Indicator titles OFF → only the value remains; toggle values OFF → nothing for that indicator
- Click on an indicator name in the status row → its settings modal opens
- Look at right side of header → "● Live" badge for crypto
- Save settings → reload → all toggles persist

- [ ] **Step 7: Commit**

```bash
git add src/components/market-chart/ChartHeader.tsx src/components/market-chart/CandlestickChart.tsx
git commit -m "feat(status-line): render indicator titles + latest values in header"
```

---

## Out of Scope

Per the spec (§"Out of Scope"):

- Indicator arguments rendering (per Q1.B; just title + value)
- Buy/Sell quick action buttons (per Q1.B)
- User-editable symbol description dictionary (static only)
- Market hours for exotic markets beyond NYSE/NASDAQ + forex 24/5 + simplified futures
- Sub-projects 5 and 6
