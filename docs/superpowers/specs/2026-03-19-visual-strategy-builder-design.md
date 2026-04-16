# Visual Strategy Builder — Design Spec

## Overview

A visual, N8N-style node builder for the Strategy Studio that lets users create trading strategies and indicators without writing code. It integrates as a **toggle mode** (Visual / Code) in the existing Strategy Studio page. Visual mode generates Kuri code one-directionally (Visual → Code). Code → Visual parsing is deferred to v2.

## Architecture

### Integration Point

The Visual Builder lives inside `src/pages/StrategyStudio.tsx` as an alternative view to the Monaco editor. A **Visual / Code** toggle button is added to the `TopToolbar` component between the Save icon and the Run button.

```
TopToolbar: [Script Name ▾] | [Save] | [Visual | Code] | [Run] | [Add to chart] | [STRATEGY badge]
```

When "Visual" is active, the Monaco editor is hidden and the Visual Builder canvas is shown. When "Code" is active, the current Monaco editor is shown. In Visual mode, a **read-only code preview** panel can optionally be shown at the bottom, replacing the console area.

### Component Tree

```
StrategyStudio (existing)
├── TopToolbar (modified — adds mode toggle)
├── MonacoEditor (existing — shown in Code mode)
├── VisualBuilder (NEW — shown in Visual mode)
│   ├── PipelineBar (top-level N8N node row)
│   │   ├── PipelineNode (Indicator)
│   │   ├── PipelineNode (Math Calc)
│   │   ├── PipelineNode (Entry Condition)
│   │   ├── PipelineNode (Plot)
│   │   ├── PipelineNode (Alert)
│   │   └── AddNodeButton
│   ├── NodeSubPage (full-page drill-down for active node)
│   │   ├── Breadcrumb (← Strategy / Entry Condition)
│   │   ├── SubNodeCanvas (N8N flow for this node type)
│   │   │   ├── SubNode (Variable, Compare, Logic, Branch, Action, Risk, etc.)
│   │   │   ├── SubNodeWire (connections between sub-nodes)
│   │   │   └── AddSubNodeButton
│   │   └── AvailableVariables (tag list of usable variables)
│   └── AddNodeModal (dropdown to pick new node type)
└── BottomConsole (existing — stays in both modes)
```

### State Model

New state added to `StrategyStudio.tsx`:

```typescript
// Visual mode state
const [editorMode, setEditorMode] = useState<'visual' | 'code'>(() =>
  localStorage.getItem('strategyStudio_editorMode') as 'visual' | 'code' || 'code'
);
const [visualGraph, setVisualGraph] = useState<VisualGraph | null>(() => {
  const saved = localStorage.getItem('strategyStudio_visualGraph');
  return saved ? JSON.parse(saved) : null;
});
const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

// Undo stack for visual mode
const [graphHistory, setGraphHistory] = useState<VisualGraph[]>([]);
const [graphHistoryIndex, setGraphHistoryIndex] = useState(-1);

// All persisted to localStorage:
// - strategyStudio_editorMode
// - strategyStudio_visualGraph
```

### Undo/Redo

Visual mode maintains its own undo stack:
- Every graph mutation pushes a snapshot to `graphHistory` and increments `graphHistoryIndex`
- `Ctrl+Z` pops back, `Ctrl+Shift+Z` moves forward
- Stack is capped at 50 entries to limit memory
- Managed inside `useVisualGraph` hook

### Data Model — VisualGraph

```typescript
interface VisualGraph {
  nodes: PipelineNodeData[];
  scriptType: 'strategy' | 'indicator';
  scriptName: string;
  version: 1;
}

interface PipelineNodeData {
  id: string;
  type: PipelineNodeType;
  label: string;
  config: NodeConfig;
  edges: Edge[]; // connections TO other nodes, stored at graph level per node
}

type PipelineNodeType = 'indicator' | 'math' | 'entry' | 'plot' | 'alert';

// Discriminated union for type-safe node configs
type NodeConfig =
  | IndicatorNodeConfig
  | MathNodeConfig
  | EntryNodeConfig
  | PlotNodeConfig
  | AlertNodeConfig;

interface Edge {
  fromNodeId: string;
  fromPort: string;
  toNodeId: string;
  toPort: string;
}

// ─── Indicator Node ───

interface IndicatorNodeConfig {
  type: 'indicator';
  indicators: IndicatorDef[];
}

interface IndicatorDef {
  id: string;
  function: string;    // 'ta.ema', 'ta.sma', 'ta.rsi', 'ta.bbands', etc.
  source: string;      // 'close', 'open', 'high', 'low', 'volume'
  params: Record<string, number>;  // { period: 9 }
  outputName: string;  // 'fast_ma' — becomes a variable for downstream nodes
}

// ─── Math Calc Node ───

interface MathNodeConfig {
  type: 'math';
  formulas: MathFormula[];
}

interface MathFormula {
  id: string;
  left: string;         // variable name or number
  operator: '+' | '-' | '*' | '/' | '%' | 'crossover' | 'crossunder';
  right: string;        // variable name or number
  outputName: string;   // 'ma_diff', 'cross_up'
}

// ─── Entry Condition Node (handles both entry AND exit) ───

interface EntryNodeConfig {
  type: 'entry';
  rules: EntryRule[];
}

interface EntryRule {
  id: string;
  label: string;                    // 'LONG Entry', 'Exit / Close'
  ruleType: 'entry' | 'exit';      // distinguishes entry vs exit rules
  direction?: 'LONG' | 'SHORT';    // only for ruleType === 'entry'
  conditions: ConditionData[];
  logicOperator: 'AND' | 'OR';
  action: EntryAction;
  risk?: RiskConfig;
}

interface ConditionData {
  id: string;
  left: string;          // variable name
  operator: 'crosses_above' | 'crosses_below' | '>' | '<' | '>=' | '<=' | '==' | '!=';
  right: string;         // variable name or numeric value
}

interface EntryAction {
  type: 'entry' | 'close' | 'close_all';
  tradeId: string;       // e.g. "BUY", "SELL"
}

interface RiskConfig {
  stopLoss?: number;     // percentage
  takeProfit?: number;   // percentage
}

// ─── Plot Node ───

interface PlotNodeConfig {
  type: 'plot';
  plots: PlotDef[];
}

interface PlotDef {
  id: string;
  variable: string;      // 'fast_ma'
  color: string;         // '#f23645'
  lineWidth: number;
  style: 'line' | 'histogram' | 'circles' | 'area';
  overlay: boolean;      // true = on main chart, false = separate panel
}

// ─── Alert Node ───

interface AlertNodeConfig {
  type: 'alert';
  alerts: AlertDef[];
}

interface AlertDef {
  id: string;
  condition: string;     // variable reference (boolean)
  message: string;
  frequency: 'once_per_bar' | 'once_per_bar_close' | 'all';
}

// ─── Sub-Node Types (for N8N canvas inside drill-downs) ───

interface SubNodeData {
  id: string;
  type: SubNodeType;
  config: SubNodeConfig;
  row: number;           // which row in the canvas (for multi-input flows)
  order: number;         // position within the row
}

type SubNodeType = 'variable' | 'compare' | 'logic' | 'branch' | 'action' | 'value' | 'function' | 'risk';

type SubNodeConfig =
  | { type: 'variable'; name: string }
  | { type: 'compare'; operator: ConditionData['operator'] }
  | { type: 'logic'; gate: 'AND' | 'OR' }
  | { type: 'branch'; condition: 'true' | 'false' }
  | { type: 'action'; actionType: EntryAction['type']; tradeId: string; direction?: 'LONG' | 'SHORT' }
  | { type: 'value'; value: string | number }
  | { type: 'function'; name: string; params: Record<string, any> }
  | { type: 'risk'; stopLoss?: number; takeProfit?: number };
```

## Node Types & Sub-Pages

### Pipeline Nodes (Main View)

| Node | Color | Icon | Purpose |
|------|-------|------|---------|
| Indicator | `#089981` (up green) | `ƒ` | Define indicator calculations (EMA, SMA, RSI, etc.) |
| Math Calc | `#D4A017` (gold) | `Σ` | Custom math, crossover detection |
| Entry Condition | `#2962ff` (accent blue) | `?` | Entry AND exit rules (both in one node) |
| Plot | `#6B7280` (gray) | `▬` | Chart visualization config |
| Alert | `#f23645` (down red) | `!` | Alert triggers |

Node order in the pipeline array is the execution order. No `position` field — array index is implicit order.

### Sub-Page: Indicator Node

When drilled in, shows an N8N canvas where each indicator is a row of sub-nodes:

```
[Function ▾] → [Source ▾] → [Period] → [Output Name]
  ta.ema         close        9          fast_ma
  ta.sma         close        21         slow_ma
  ta.rsi         close        14         my_rsi
```

Each row is a chain: Function picker → Source dropdown → Parameter input → Named output. Output names become available as variables in all downstream nodes.

### Sub-Page: Math Calc Node

N8N canvas for math operations:

```
[Variable ▾] → [Operator ▾] → [Variable ▾] → [Output Name]
  fast_ma          -            slow_ma        ma_diff
  fast_ma       crossover       slow_ma        cross_up
```

Operators: arithmetic (`+`, `-`, `*`, `/`, `%`), crossover, crossunder.

### Sub-Page: Entry Condition Node

This node handles BOTH entry and exit rules. Each rule is a separate N8N flow:

```
Rule 1 (LONG Entry):
  [cross_up] → [== true] → [AND] → [IF true] → [Entry LONG] → [SL 5% / TP 10%]
  [my_rsi]   → [< 30]    ↗

Rule 2 (Exit):
  [fast_ma] → [crosses below] → [IF true] → [Close "BUY"]
  [slow_ma] ↗
```

Sub-node types:
- **Variable**: Picks from available variables (outputs of Indicator/Math nodes)
- **Compare**: Operator dropdown (>, <, ==, crosses above, crosses below)
- **Logic**: AND / OR gates (multiple inputs → one output)
- **Branch**: IF true → route to action
- **Action**: Entry LONG, Entry SHORT, Close, Close All
- **Risk**: Stop loss %, take profit % (attached to entry actions)

### Sub-Page: Plot Node

Configure chart overlays:

```
[Variable ▾] → [Style ▾] → [Color] → [Width] → [Overlay ▾]
  fast_ma        line       #f23645     2         true
  slow_ma        line       #2962ff     2         true
  my_rsi         line       #8b5cf6     1         false (separate panel)
```

### Sub-Page: Alert Node

Configure alert triggers:

```
[Condition ▾] → [Frequency ▾] → [Message]
  cross_up       once_per_bar    "MA Crossover BUY signal"
```

## Sync: Visual → Code (One-Way in v1)

When the visual graph changes, the system generates Kuri script and updates `kuriContent`:

```typescript
function generateKuriFromGraph(graph: VisualGraph): string {
  // 1. Generate strategy() or indicator() declaration from graph.scriptType + graph.scriptName
  // 2. Generate indicator variable assignments from Indicator nodes
  // 3. Generate math calculations from Math nodes
  // 4. Generate entry/exit conditions as if-statements from Entry Condition nodes
  // 5. Generate plot() calls from Plot nodes
  // 6. Generate alertcondition() calls from Alert nodes
  return kuriScript;
}
```

Example output:
```kuri
//@version=3
strategy("MA Crossover", overlay=true)

fast_ma = ta.ema(close, 9)
slow_ma = ta.sma(close, 21)
my_rsi = ta.rsi(close, 14)

cross_up = ta.crossover(fast_ma, slow_ma)

if cross_up and my_rsi < 30
    strategy.entry("BUY", strategy.long, stop_loss=5, take_profit=10)

if ta.crossunder(fast_ma, slow_ma)
    strategy.close("BUY")

plot(fast_ma, color=#f23645, linewidth=2)
plot(slow_ma, color=#2962ff, linewidth=2)
plot(my_rsi, color=#8b5cf6, linewidth=1)

alertcondition(cross_up, message="MA Crossover BUY signal")
```

### Code → Visual (v2 — Deferred)

Parsing arbitrary Kuri code into a VisualGraph is complex and deferred. For v1:
- When switching from Code to Visual mode, the **persisted `visualGraph`** is loaded from localStorage
- If the code was edited in Code mode, a warning is shown: "Code was modified manually. Visual graph may be out of sync."
- The user can choose to keep the visual graph or regenerate from defaults

## Navigation Flow

```
Strategy Studio Page
    │
    ├─ [Code Mode] → Monaco Editor (existing)
    │
    └─ [Visual Mode] → PipelineBar (main view)
                           │
                           ├─ Click "Indicator" → Indicator Sub-Page (full canvas)
                           │     └─ Breadcrumb: ← Strategy / ƒ Indicator
                           │
                           ├─ Click "Math Calc" → Math Sub-Page (full canvas)
                           │     └─ Breadcrumb: ← Strategy / Σ Math Calc
                           │
                           ├─ Click "Entry Condition" → Entry Sub-Page (full canvas)
                           │     └─ Breadcrumb: ← Strategy / ? Entry Condition
                           │
                           ├─ Click "Plot" → Plot Sub-Page (full canvas)
                           │     └─ Breadcrumb: ← Strategy / ▬ Plot
                           │
                           └─ Click "Alert" → Alert Sub-Page (full canvas)
                                 └─ Breadcrumb: ← Strategy / ! Alert
```

Clicking "← Strategy" in the breadcrumb returns to the pipeline view. Each sub-page replaces the canvas area entirely — it is NOT a drawer, modal, or sidebar.

## UI/UX Design Tokens

Uses the existing Insight design system:

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#0f0f0f` | Main background |
| `--bg-secondary` | `#1E1E1E` | Node backgrounds |
| `--bg-tertiary` | `#262626` | Sub-node backgrounds |
| `--border` | `#2A2A2A` | All borders |
| `--accent` | `#2962ff` | Active states, primary actions |
| `--up` | `#089981` | Buy/Long signals |
| `--down` | `#f23645` | Sell/Short signals |
| `--gold` | `#D4A017` | Math/variable highlights |
| `--purple` | `#8b5cf6` | Logic gates |
| Font | Trebuchet MS | All UI text |
| Monospace | JetBrains Mono | Code, variable names |
| Radius | 4px / 6px / 8px | sm / md / lg |

## File Structure

New files to create:

```
src/components/strategy-studio/
├── visual-builder/
│   ├── VisualBuilder.tsx          — Main container, routes between pipeline and sub-pages
│   ├── PipelineBar.tsx            — Horizontal N8N pipeline view
│   ├── PipelineNode.tsx           — Individual pipeline node component
│   ├── PipelineWire.tsx           — Connection wire between nodes
│   ├── NodeSubPage.tsx            — Full-page drill-down container with breadcrumb
│   ├── sub-nodes/
│   │   ├── SubNode.tsx            — Base sub-node component
│   │   ├── SubNodeWire.tsx        — Wire between sub-nodes
│   │   ├── VariableNode.tsx       — Variable picker sub-node
│   │   ├── CompareNode.tsx        — Comparison operator sub-node
│   │   ├── LogicNode.tsx          — AND/OR gate sub-node
│   │   ├── BranchNode.tsx         — IF condition sub-node
│   │   ├── ActionNode.tsx         — Entry/Exit/Close action sub-node
│   │   └── RiskNode.tsx           — SL/TP configuration sub-node
│   ├── pages/
│   │   ├── IndicatorPage.tsx      — Indicator node sub-page
│   │   ├── MathCalcPage.tsx       — Math calculation sub-page
│   │   ├── EntryConditionPage.tsx — Entry condition sub-page (includes exit rules)
│   │   ├── PlotPage.tsx           — Plot configuration sub-page
│   │   └── AlertPage.tsx          — Alert configuration sub-page
│   ├── modals/
│   │   ├── AddNodeModal.tsx       — New pipeline node picker
│   │   └── AddSubNodeModal.tsx    — New sub-node picker
│   ├── hooks/
│   │   ├── useVisualGraph.ts      — Graph state management + undo/redo
│   │   └── useKuriSync.ts         — Visual → Code generation (debounced)
│   ├── utils/
│   │   ├── graphToKuri.ts         — VisualGraph → Kuri script generator
│   │   └── nodeDefaults.ts        — Default configs for each node type
│   └── types.ts                   — All visual builder TypeScript types
```

Modified files:

```
src/pages/StrategyStudio.tsx               — Add editorMode state, render VisualBuilder
src/components/strategy-studio/TopToolbar.tsx — Add Visual/Code toggle, pass mode props
```

## Constraints & Edge Cases

1. **One-way sync (v1)**: Visual → Code only. Editing in Code mode does NOT update the visual graph. A warning is shown when switching back to Visual mode if code was manually changed.
2. **Variable scoping**: Variables defined in Indicator/Math nodes are available in downstream nodes. The Available Variables bar shows what's usable at each point in the pipeline.
3. **Node ordering**: Array index in `VisualGraph.nodes` is the execution order. Drag-to-reorder updates the array and regenerates code.
4. **Undo/Redo**: `useVisualGraph` hook manages a snapshot stack (max 50). `Ctrl+Z` / `Ctrl+Shift+Z` in visual mode. Monaco's built-in undo handles code mode.
5. **Empty state**: Visual mode with no graph shows a template selector — "Start with MA Crossover", "Start with RSI Strategy", "Start blank".
6. **Performance**: Graph-to-code sync is debounced (300ms).
7. **Persistence**: Both `visualGraph` and `editorMode` are persisted to localStorage alongside existing `kuriContent`, `strategyName`, etc.
8. **Desktop only**: Visual builder inherits the existing desktop-only gate in StrategyStudio (`lg:hidden`).
9. **Script type detection**: `VisualGraph.scriptType` drives both the `detectedScriptType` display in TopToolbar and the generated code declaration (`strategy()` vs `indicator()`).
