# Visual Builder — Indicator Parameters & Logic Section Design

**Date:** 2026-04-12
**Status:** Draft
**Scope:** Visual Builder Steps 1 (Indicator Selection + Parameters) and new Step 1.5 (Logic/Conditions)

---

## Problem

The Visual Builder currently lets users add indicators from the registry but doesn't:
1. Show the indicator's actual configurable parameters (extracted from its `.kuri` source)
2. Let users lock/unlock parameters as hardcoded vs user-adjustable
3. Understand what each indicator outputs (plots, levels, variables) for use in entry/exit conditions
4. Provide a smart condition builder that knows the indicator's output structure

## Solution

Parse each indicator's `.kuri` source at add-time to extract:
- **Parameters** (`param.int`, `param.float`, `param.source`, `param.string`, `param.bool`, `param.color`)
- **Outputs** (`mark()` plots, `mark.level()` levels, computed variables like BA/SB/RS)
- **Alerts** (`kuri.alert()` / `alertcondition()` — pre-built conditions)

Show parameters in the indicator card for configuration. Expose outputs in the Logic section for building entry/exit conditions.

---

## 1. Kuri Source Parser

### What it extracts

A function `parseKuriSource(source: string)` that returns:

```typescript
interface ParsedIndicator {
    params: ParsedParam[];
    outputs: ParsedOutput[];    // computed values the indicator produces
    levels: ParsedLevel[];      // reference levels (mark.level)
}

interface ParsedParam {
    varName: string;        // e.g., "rsiLengthInput"
    type: 'int' | 'float' | 'source' | 'string' | 'bool' | 'color';
    title: string;          // e.g., "RSI Length"
    defaultValue: any;      // e.g., 14
    min?: number;
    max?: number;
    options?: string[];     // for param.string with options
}

interface ParsedOutput {
    varName: string;        // e.g., "rsi", "upper", "macd", "BA", "SB"
    title: string;          // from mark() title, e.g., "RSI", "Upper", "BA"
}

interface ParsedLevel {
    value: number;          // e.g., 70, 30, 0
    title: string;          // e.g., "Overbought", "Oversold"
}
```

The key insight: **outputs are the computed values** an indicator produces.
- SMA produces 1 output: the SMA line value
- BB produces 3 outputs: Basis, Upper, Lower
- MFL produces 6 outputs: BA, SB, RS, RSL, RB, RBL
- MACD produces 3 outputs: MACD, Signal, Histogram

These outputs are what users select in the Logic section for building conditions.

### Parsing rules

**Parameters** — match lines like:
```
varName = param.int(defaultValue, title="Title", min=N, max=N)
varName = param.float(defaultValue, title="Title")
varName = param.source(close, title="Title")
varName = param.string("default", title="Title", options=["A","B"])
varName = param.bool(true, title="Title")
varName = param.color(color.red, title="Title")
```

Regex: `(\w+)\s*=\s*param\.(int|float|source|string|bool|color)\(([^)]+)\)`

Parse arguments to extract default, title, min, max, options.

**Outputs** — match `mark()` calls to find what values are plotted:
```
mark(varName, title="Title")
mark(hist, title="Histogram", ...)
mark.bar(varName, ...)
```

Regex: `mark(?:\.\w+)?\(([^,)]+)[^)]*title\s*=\s*"([^"]+)"`

The first argument is the variable name — this is the computed value.
The title is the human-readable label.

For complex expressions like `mark(direction < 0 ? supertrend : na, title="Up Trend")`, extract the key variable name (`supertrend`).

**Levels** — match `mark.level()`:
```
mark.level(70, title="Overbought")
```

Regex: `mark\.level\(([^,)]+)[^)]*title\s*=\s*"([^"]+)"`

### Where it lives

File: `src/components/strategy-studio/visual-builder/kuriSourceParser.ts`

This is a pure function with no React dependencies. It takes a string (Kuri source) and returns a `ParsedIndicator` object.

---

## 2. Indicator Section (Step 1) — Rebuilt

### When user adds an indicator from the picker

1. Get the indicator's `kuriSource` from `DEFAULT_INDICATORS` (or `scriptSource` for custom scripts)
2. Run `parseKuriSource(source)` to extract parameters and outputs
3. Store the parsed data alongside the indicator config

### Updated IndicatorConfig type

```typescript
interface IndicatorConfig {
    id: string;
    name: string;           // display name (e.g., "RSI", "Bollinger Bands")
    type: string;           // shortname (e.g., "RSI", "BB")
    kuriSource: string;     // full .kuri source code
    parsed: ParsedIndicator;
    paramValues: Record<string, any>;    // current values for each param
    paramLocked: Record<string, boolean>; // locked = hardcoded, unlocked = user-adjustable
}
```

### UI for each indicator card

Each indicator card in Step 1 shows:

**Header row:**
- Type badge (e.g., `[RSI]`) in blue
- Indicator name (e.g., "Relative Strength Index")
- Remove (×) button

**Parameters section** (only if indicator has params):
For each `ParsedParam`, render a row:

```
[Lock icon] [Title label]  [Input control]  [Default badge]
```

- **Lock icon** — Toggle between locked (padlock closed, blue) and unlocked (padlock open, gray). Default: unlocked.
  - Locked = this value is hardcoded in the generated strategy code
  - Unlocked = this value becomes a `param.*` in the strategy, user can change it later

- **Title label** — The param's title (e.g., "RSI Length", "Source")

- **Input control** — Based on param type:
  - `int` / `float` → number input with min/max/step constraints
  - `source` → dropdown: close, open, high, low, hl2, hlc3, ohlc4
  - `string` with options → dropdown with the options
  - `string` without options → text input
  - `bool` → toggle switch
  - `color` → color swatch (not critical for strategy builder, can be simplified)

- **Default badge** — Small gray text showing the default value (e.g., "default: 14")

**Example: RSI indicator card**
```
[RSI]  Relative Strength Index                    ×
────────────────────────────────────────────────────
🔓 RSI Length     [14     ]     default: 14
🔓 Source         [close ▾]     default: close
```

**Example: Money Flow Levels card**
```
[MFL]  Money Flow Levels                          ×
────────────────────────────────────────────────────
🔒 Period         [Auto   ▾]     default: Auto       LOCKED
🔓 Sensitivity    [20     ]     default: 20
🔒 Open Type      [Auto   ▾]     default: Auto       LOCKED
🔓 Line Width     [2      ]     default: 2
🔓 Show Labels    [■ on   ]     default: true
```

### Empty state (no indicators added)

Same as current — chart icon + "No indicators added yet" + "Add from Indicator Registry" button.

---

## 3. Logic Section (New Step — between Indicators and Entry Rules)

### Purpose

This section lets users build conditions using the **outputs** of their selected indicators. It's the bridge between "I have these indicators" and "enter/exit when X happens."

### What it shows

For each added indicator, the Logic section automatically knows its **computed values**:

- **SMA** → 1 value: `SMA` (the line)
- **EMA** → 1 value: `EMA`
- **RSI** → 1 value: `RSI` + reference levels (30, 50, 70)
- **BB** → 3 values: `Basis`, `Upper`, `Lower`
- **MACD** → 3 values: `MACD`, `Signal`, `Histogram` + level (0)
- **Stochastic** → 2 values: `%K`, `%D` + levels (20, 50, 80)
- **MFL** → 6 values: `BA`, `SB`, `RS`, `RSL`, `RB`, `RBL`
- **Supertrend** → 2 values: `Up Trend`, `Down Trend`

These are parsed automatically from `mark()` calls in the indicator's `.kuri` source.

### UI Layout

The Logic section replaces the old Steps 2 and 3. New flow:

```
Step 1: Select Indicators (+ configure parameters)
Step 2: Entry & Exit Rules (using indicator computed values)
Step 3: Risk Management
Step 4: Review Code
```

### Entry Rules UI

**Direction selector:** Long / Short toggle

**Condition builder** — each row:

```
[Left operand ▾]  [Condition ▾]  [Right operand ▾]
```

**Left operand dropdown** (grouped by indicator):

```
── Price ──
close
open
high
low

── RSI ──
RSI value

── Bollinger Bands ──
Basis
Upper
Lower

── Money Flow Levels ──
BA
SB
RS
RSL
RB
RBL
```

**Condition dropdown:**

```
crosses above       → kuri.crossover(left, right)
crosses below       → kuri.crossunder(left, right)
is above            → left > right
is below            → left < right
```

**Right operand dropdown** — same grouped list as Left, plus:

```
── Reference Levels ──
RSI: 70 (Overbought)
RSI: 50 (Middle)
RSI: 30 (Oversold)
MACD: 0 (Zero)

── Custom Value ──
[Enter number...]
```

### Exit Rules UI

Same condition builder, below entry rules, with OR logic (any condition triggers exit).

---

## 4. Code Generation Updates

### Parameter handling

For each indicator parameter:
- If **unlocked**: generate a `param.*` line at the top of the strategy
- If **locked**: inline the value directly in the indicator call

Example with RSI (length locked at 14, source unlocked):
```kuri
src = param.source(close, title="Source")
rsiVal = kuri.rsi(src, 14)
```

Example with RSI (both unlocked):
```kuri
rsiLength = param.int(14, title="RSI Length")
src = param.source(close, title="Source")
rsiVal = kuri.rsi(src, rsiLength)
```

### Condition code generation

Each condition row generates a Kuri expression:
- Crossover → `kuri.crossover(left, right)`
- Is above → `left > right`

Multiple entry conditions joined with `and`.
Multiple exit conditions joined with `or`.

### Level references in conditions

When a user compares an output to a level:
- `RSI is below 70 (Overbought)` → `rsiVal < 70`
- `close crosses above BB Upper` → `kuri.crossover(close, upper)`
- `close is above MFL BA` → `close > BA`

---

## 5. Data Flow

```
User adds indicator from picker
  ↓
Get kuriSource from DEFAULT_INDICATORS or custom script
  ↓
parseKuriSource(kuriSource) → ParsedIndicator
  ↓
Store in IndicatorConfig with parsed data
  ↓
Step 1 UI shows parameters with lock/unlock
  ↓
Step 2 (Logic) reads all indicators' parsed.outputs + parsed.levels
  ↓
Condition builder dropdowns populated from parsed data
  ↓
User builds conditions
  ↓
Code generator uses paramValues, paramLocked, conditions to produce Kuri code
  ↓
Live sync to Monaco editor
```

---

## 6. Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/components/strategy-studio/visual-builder/kuriSourceParser.ts` | Create | Parse .kuri source → params, outputs, levels, alerts |
| `src/components/strategy-studio/visual-builder/VisualBuilder.tsx` | Modify | Rebuild Step 1 with params, new Step 2 with logic, reorder steps |

---

## 7. Step Flow Change

**Before:**
1. Select Indicators (just add/remove)
2. Entry Rules (basic dropdowns)
3. Exit Rules (basic dropdowns)
4. Review Code

**After:**
1. Select Indicators (add from registry + configure parameters with lock/unlock)
2. Entry & Exit Rules (smart logic builder using parsed indicator outputs/levels/alerts)
3. Risk Management (SL% / TP%)
4. Review Code

---

## 8. Out of Scope

- Drag-and-drop reordering of indicators
- Nested condition groups (AND within OR)
- Custom function definitions in visual mode
- Indicator-to-indicator connections (use the same indicator's output in another)
- Color parameter editing (simplified to just showing the default, not interactive)
- Backtesting from the visual builder
- Saving/loading visual builder configurations separately from the code
