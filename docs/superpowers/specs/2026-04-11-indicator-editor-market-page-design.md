# Indicator Editor on Market Page — Design Spec

**Date:** 2026-04-11
**Status:** Approved
**Scope:** Market page UI + Strategy Studio restriction + indicator script management

---

## Problem

The Strategy Studio currently handles both indicators and strategies. Users need a dedicated, quick-access indicator editor embedded in the Market page so they can write and test indicators while viewing the chart. The Strategy Studio should be reserved for strategies only.

## Solution

Add a split-view indicator editor panel to the Market page, toggled via a `</>` icon at the bottom of the right toolbar. Lock Strategy Studio to strategy scripts only.

---

## 1. Right Toolbar — Editor Icon

### File: `src/components/market-chart/RightToolbar.tsx`

- Add a `</>` icon button at the **bottom** of the right toolbar, below a separator
- The icon toggles the indicator editor panel open/closed
- When editor is open, icon shows active state (purple highlight, same as other active tools)

### Props change

Add to `RightToolbarProps`:

```typescript
onToggleIndicatorEditor?: () => void;
isIndicatorEditorOpen?: boolean;
```

### Icon placement

After the existing panel buttons and drawing tools, at the bottom:

```
[Watchlist] [Alerts] [DataWindow] [ObjectTree] [OrderPanel]
─── separator ───
[Drawing tools...]
─── spacer (flex:1) ───
─── separator ───
[</> Editor Icon]    ← NEW, at very bottom
```

---

## 2. Indicator Editor Panel

### File: `src/components/market-chart/IndicatorEditorPanel.tsx` (NEW)

A 380px wide panel that sits between the chart area and the right toolbar. Contains:

### 2.1 Header

- Title: "Indicator Editor"
- Buttons: "Save" (gray) + "Add to Chart" (green)
- Save button disabled if no changes

### 2.2 Tabs

- Each open indicator is a tab showing its name
- Modified indicator tab shows a yellow dot
- "+ New" tab creates a new indicator with default template:

```kuri
---
version: kuri 1.0
name: My Indicator
type: indicator
pane: overlay
---

src = param.source(close, title="Source")
len = param.int(14, title="Length")
out = kuri.sma(src, len)
mark(out, title="SMA", color=color.blue)
```

- Tabs are closeable (x button)
- Tab state stored in component state (not persisted to DB until save)

### 2.3 Monaco Editor

- Uses `@monaco-editor/react` (already a project dependency)
- Language: Kuri (reuse existing Monaco language config from Strategy Studio if available)
- Theme: dark (match existing Strategy Studio theme)
- Editor options: minimap off, line numbers on, word wrap off, font size 12

### 2.4 Console

- 100px height at bottom of panel, collapsible
- Shows compilation result: errors, warnings, plot count, hline count, execution time
- Red for errors, green for success
- Auto-compiles on code change (debounced 500ms)

### 2.5 Status Bar

- Shows filename (e.g., "Custom RSI.kuri")
- Shows save status: "Saved" (green dot) or "Modified" (yellow dot) or "New" (gray)

---

## 3. Add to Chart Logic

### File: `src/components/market-chart/IndicatorEditorPanel.tsx`

The "Add to Chart" button implements smart-save behavior:

```
Click "Add to Chart"
  ├── Is indicator new (no ID)?
  │     → Save to scripts table first (INSERT)
  │     → Get back the script ID
  │     → Then add to chart
  ├── Is indicator edited (dirty)?
  │     → Save changes to scripts table (UPDATE)
  │     → Then add to chart
  └── Is indicator unchanged?
        → Just add to chart directly
```

### Save to database

Uses existing `scripts` table via strategy service or a dedicated indicator service:

```typescript
// Insert or update in scripts table
{
    name: headerName,
    script_type: 'INDICATOR',
    source_code: editorContent,
    description: '',
    is_active: true,
    user_id: currentUser.id,
}
```

### Add to chart

Calls existing chart indicator system — the Market page already has `onAddIndicator` or similar mechanism used by the indicator picker modal. The editor should use the same pathway, passing the Kuri script source to the chart renderer.

---

## 4. Market Page Layout Changes

### File: `src/pages/Market.tsx`

### State additions

```typescript
const [isIndicatorEditorOpen, setIsIndicatorEditorOpen] = useState(false);
```

### Layout change

When `isIndicatorEditorOpen` is true, the chart area shrinks horizontally and the IndicatorEditorPanel renders between the chart and right toolbar:

```
[LeftToolbar] [Chart Area (flex:1)] [IndicatorEditorPanel (380px)] [RightToolbar (44px)]
```

When closed:

```
[LeftToolbar] [Chart Area (flex:1)] [RightToolbar (44px)]
```

### Props passed to RightToolbar

```typescript
onToggleIndicatorEditor={() => setIsIndicatorEditorOpen(prev => !prev)}
isIndicatorEditorOpen={isIndicatorEditorOpen}
```

### Props passed to IndicatorEditorPanel

```typescript
<IndicatorEditorPanel
    onClose={() => setIsIndicatorEditorOpen(false)}
    onAddToChart={(scriptSource: string, scriptName: string) => { /* add indicator to chart */ }}
    currentSymbol={currentSymbol}
    ohlcvData={currentOhlcvData}
/>
```

---

## 5. Strategy Studio — Lock to Strategies Only

### File: `src/pages/StrategyStudio.tsx`

### Changes

- When saving or validating a script, check the YAML header `type` field
- If `type: indicator`, show an error/toast: "Indicators should be created in the Market page editor. Use the </> icon on the chart."
- Block save for indicator scripts
- Default template changed to strategy-only template (with `type: strategy` and `strategy.entry()`)

### File: `src/components/strategy-studio/OpenScriptModal.tsx`

### Changes

- Filter the script list to only show scripts where `script_type === 'STRATEGY'` or `script_type === 'KURI'` (legacy strategy type)
- Exclude scripts where `script_type === 'INDICATOR'`
- Remove the "Built-in" section (already emptied in previous task)

---

## 6. Indicator Script Loading in Market Page Editor

### Loading saved indicators

When the editor panel opens, fetch user's saved indicator scripts:

```typescript
const indicators = await getStrategies(); // from strategyService
const indicatorScripts = indicators.filter(s => s.type === 'INDICATOR');
```

Show these as available tabs or in a "Open" dropdown within the editor panel.

### Opening an indicator

User can:
1. Click "+ New" tab to create from template
2. Select from a dropdown of saved indicators to open in a tab

---

## 7. Type Enforcement

The indicator editor panel enforces `type: indicator` in the YAML header:

- When creating a new indicator, the template has `type: indicator` pre-filled
- If the user changes `type` to `strategy`, show a warning: "This editor is for indicators only. Use the Strategy Studio for strategies."
- The "Add to Chart" button is disabled if type is not `indicator`

---

## 8. Files to Create

| File | Purpose |
|------|---------|
| `src/components/market-chart/IndicatorEditorPanel.tsx` | Split-view editor panel component |

## 9. Files to Modify

| File | Change |
|------|--------|
| `src/components/market-chart/RightToolbar.tsx` | Add `</>` icon at bottom, toggle props |
| `src/pages/Market.tsx` | Add editor state, layout split, pass props |
| `src/pages/StrategyStudio.tsx` | Block indicator creation, strategy-only validation |
| `src/components/strategy-studio/OpenScriptModal.tsx` | Filter out indicator scripts |

## 10. Out of Scope

- AI chat sidebar for indicator editor
- Visual builder for indicators
- Indicator marketplace/sharing
- Drag-to-resize editor panel width
- Multiple editor instances
- Indicator backtesting
