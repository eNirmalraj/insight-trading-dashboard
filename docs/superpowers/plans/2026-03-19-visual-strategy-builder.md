# Visual Strategy Builder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an N8N-style visual node builder to the Strategy Studio, letting users create strategies via drag-and-drop pipeline nodes instead of writing Kuri code.

**Architecture:** Toggle between Visual and Code modes in the existing StrategyStudio page. Visual mode shows a horizontal pipeline of nodes (Indicator → Math → Condition → Plot → Alert). Clicking any node opens a full sub-page with N8N-style internal nodes. Visual changes generate Kuri code one-directionally.

**Tech Stack:** React, TypeScript, Tailwind CSS, existing `@insight/kuri-engine`, localStorage persistence

**Spec:** `docs/superpowers/specs/2026-03-19-visual-strategy-builder-design.md`

---

## File Structure

```text
src/components/strategy-studio/
├── visual-builder/
│   ├── types.ts                   — All TypeScript types (VisualGraph, NodeConfig, etc.)
│   ├── VisualBuilder.tsx          — Main container, routes between pipeline and sub-pages
│   ├── PipelineBar.tsx            — Horizontal N8N pipeline row
│   ├── PipelineNode.tsx           — Individual pipeline node
│   ├── PipelineWire.tsx           — Wire connecting two pipeline nodes
│   ├── NodeSubPage.tsx            — Full-page drill-down with breadcrumb
│   ├── sub-nodes/
│   │   ├── SubNode.tsx            — Reusable sub-node shell (header + body + ports)
│   │   └── SubNodeWire.tsx        — Wire connecting two sub-nodes
│   ├── pages/
│   │   ├── IndicatorPage.tsx      — Indicator node sub-page
│   │   ├── MathCalcPage.tsx       — Math calc sub-page
│   │   ├── ConditionPage.tsx      — Entry/exit condition sub-page
│   │   ├── PlotPage.tsx           — Plot config sub-page
│   │   └── AlertPage.tsx          — Alert config sub-page
│   ├── hooks/
│   │   └── useVisualGraph.ts      — Graph state + undo/redo
│   └── utils/
│       ├── graphToKuri.ts         — VisualGraph → Kuri script generator
│       └── nodeDefaults.ts        — Default configs for each node type

Modified:
├── src/pages/StrategyStudio.tsx               — Add editorMode state, render VisualBuilder
├── src/components/strategy-studio/TopToolbar.tsx — Add Visual/Code toggle
```

---

## Task 1: Types

**Files:**
- Create: `src/components/strategy-studio/visual-builder/types.ts`

- [ ] **Step 1: Create the types file with all interfaces**

```typescript
// src/components/strategy-studio/visual-builder/types.ts

export interface VisualGraph {
  nodes: PipelineNodeData[];
  scriptType: 'strategy' | 'indicator';
  scriptName: string;
  version: 1;
}

export type PipelineNodeType = 'indicator' | 'math' | 'entry' | 'plot' | 'alert';

export interface PipelineNodeData {
  id: string;
  type: PipelineNodeType;
  label: string;
  config: NodeConfig;
}

export type NodeConfig =
  | IndicatorNodeConfig
  | MathNodeConfig
  | EntryNodeConfig
  | PlotNodeConfig
  | AlertNodeConfig;

export interface IndicatorNodeConfig {
  type: 'indicator';
  indicators: IndicatorDef[];
}

export interface IndicatorDef {
  id: string;
  function: string;
  source: string;
  params: Record<string, number>;
  outputName: string;
}

export interface MathNodeConfig {
  type: 'math';
  formulas: MathFormula[];
}

export interface MathFormula {
  id: string;
  left: string;
  operator: '+' | '-' | '*' | '/' | '%' | 'crossover' | 'crossunder';
  right: string;
  outputName: string;
}

export interface EntryNodeConfig {
  type: 'entry';
  rules: EntryRule[];
}

export interface EntryRule {
  id: string;
  label: string;
  ruleType: 'entry' | 'exit';
  direction?: 'LONG' | 'SHORT';
  conditions: ConditionData[];
  logicOperator: 'AND' | 'OR';
  action: EntryAction;
  risk?: RiskConfig;
}

export interface ConditionData {
  id: string;
  left: string;
  operator: 'crosses_above' | 'crosses_below' | '>' | '<' | '>=' | '<=' | '==' | '!=';
  right: string;
}

export interface EntryAction {
  type: 'entry' | 'close' | 'close_all';
  tradeId: string;
}

export interface RiskConfig {
  stopLoss?: number;
  takeProfit?: number;
}

export interface PlotNodeConfig {
  type: 'plot';
  plots: PlotDef[];
}

export interface PlotDef {
  id: string;
  variable: string;
  color: string;
  lineWidth: number;
  style: 'line' | 'histogram' | 'circles' | 'area';
  overlay: boolean;
}

export interface AlertNodeConfig {
  type: 'alert';
  alerts: AlertDef[];
}

export interface AlertDef {
  id: string;
  condition: string;
  message: string;
  frequency: 'once_per_bar' | 'once_per_bar_close' | 'all';
}

// Pipeline node visual metadata
export const PIPELINE_NODE_META: Record<PipelineNodeType, { color: string; icon: string; label: string }> = {
  indicator: { color: '#089981', icon: 'ƒ', label: 'Indicator' },
  math:      { color: '#D4A017', icon: 'Σ', label: 'Math Calc' },
  entry:     { color: '#2962ff', icon: '?', label: 'Condition' },
  plot:      { color: '#6B7280', icon: '▬', label: 'Plot' },
  alert:     { color: '#f23645', icon: '!', label: 'Alert' },
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd "c:/Users/nirma/OneDrive/Desktop/My Project" && npx tsc --noEmit src/components/strategy-studio/visual-builder/types.ts 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/components/strategy-studio/visual-builder/types.ts
git commit -m "feat(visual-builder): add TypeScript types for visual graph"
```

---

## Task 2: Node Defaults Utility

**Files:**
- Create: `src/components/strategy-studio/visual-builder/utils/nodeDefaults.ts`

- [ ] **Step 1: Create defaults factory**

```typescript
// src/components/strategy-studio/visual-builder/utils/nodeDefaults.ts
import type { PipelineNodeData, PipelineNodeType, VisualGraph } from '../types';

let _id = 0;
export const uid = () => `vb_${++_id}_${Date.now()}`;

export function createDefaultNode(type: PipelineNodeType): PipelineNodeData {
  const id = uid();
  switch (type) {
    case 'indicator':
      return { id, type, label: 'Indicator', config: { type: 'indicator', indicators: [] } };
    case 'math':
      return { id, type, label: 'Math Calc', config: { type: 'math', formulas: [] } };
    case 'entry':
      return { id, type, label: 'Condition', config: { type: 'entry', rules: [] } };
    case 'plot':
      return { id, type, label: 'Plot', config: { type: 'plot', plots: [] } };
    case 'alert':
      return { id, type, label: 'Alert', config: { type: 'alert', alerts: [] } };
  }
}

export function createDefaultGraph(scriptType: 'strategy' | 'indicator' = 'strategy', name = 'Untitled'): VisualGraph {
  return {
    nodes: [
      createDefaultNode('indicator'),
      createDefaultNode('math'),
      createDefaultNode('entry'),
      createDefaultNode('plot'),
      createDefaultNode('alert'),
    ],
    scriptType,
    scriptName: name,
    version: 1,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/strategy-studio/visual-builder/utils/nodeDefaults.ts
git commit -m "feat(visual-builder): add node defaults factory"
```

---

## Task 3: useVisualGraph Hook

**Files:**
- Create: `src/components/strategy-studio/visual-builder/hooks/useVisualGraph.ts`

- [ ] **Step 1: Create the hook with state + undo/redo + persistence**

```typescript
// src/components/strategy-studio/visual-builder/hooks/useVisualGraph.ts
import { useState, useCallback, useEffect, useRef } from 'react';
import type { VisualGraph, PipelineNodeData, PipelineNodeType } from '../types';
import { createDefaultNode, createDefaultGraph } from '../utils/nodeDefaults';

const STORAGE_KEY = 'strategyStudio_visualGraph';
const MAX_HISTORY = 50;

function loadFromStorage(): VisualGraph | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function useVisualGraph() {
  const [graph, setGraphRaw] = useState<VisualGraph>(() => loadFromStorage() || createDefaultGraph());
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

  // Undo stack
  const history = useRef<VisualGraph[]>([]);
  const historyIdx = useRef(-1);

  const pushHistory = useCallback((g: VisualGraph) => {
    // Truncate forward history
    history.current = history.current.slice(0, historyIdx.current + 1);
    history.current.push(JSON.parse(JSON.stringify(g)));
    if (history.current.length > MAX_HISTORY) history.current.shift();
    historyIdx.current = history.current.length - 1;
  }, []);

  const setGraph = useCallback((g: VisualGraph) => {
    pushHistory(g);
    setGraphRaw(g);
  }, [pushHistory]);

  // Persist
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(graph));
  }, [graph]);

  // Undo / Redo
  const undo = useCallback(() => {
    if (historyIdx.current > 0) {
      historyIdx.current--;
      setGraphRaw(JSON.parse(JSON.stringify(history.current[historyIdx.current])));
    }
  }, []);

  const redo = useCallback(() => {
    if (historyIdx.current < history.current.length - 1) {
      historyIdx.current++;
      setGraphRaw(JSON.parse(JSON.stringify(history.current[historyIdx.current])));
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.shiftKey && e.key === 'Z') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  // Node operations
  const updateNode = useCallback((nodeId: string, updater: (node: PipelineNodeData) => PipelineNodeData) => {
    setGraph({
      ...graph,
      nodes: graph.nodes.map(n => n.id === nodeId ? updater(n) : n),
    });
  }, [graph, setGraph]);

  const addNode = useCallback((type: PipelineNodeType) => {
    setGraph({ ...graph, nodes: [...graph.nodes, createDefaultNode(type)] });
  }, [graph, setGraph]);

  const removeNode = useCallback((nodeId: string) => {
    setGraph({ ...graph, nodes: graph.nodes.filter(n => n.id !== nodeId) });
    if (activeNodeId === nodeId) setActiveNodeId(null);
  }, [graph, activeNodeId, setGraph]);

  const activeNode = graph.nodes.find(n => n.id === activeNodeId) || null;

  // Collect available variables from indicator + math nodes
  const availableVariables = graph.nodes.reduce<string[]>((vars, node) => {
    if (node.config.type === 'indicator') {
      node.config.indicators.forEach(ind => { if (ind.outputName) vars.push(ind.outputName); });
    }
    if (node.config.type === 'math') {
      node.config.formulas.forEach(f => { if (f.outputName) vars.push(f.outputName); });
    }
    return vars;
  }, []);

  return {
    graph, setGraph,
    activeNodeId, setActiveNodeId, activeNode,
    updateNode, addNode, removeNode,
    availableVariables,
    undo, redo,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/strategy-studio/visual-builder/hooks/useVisualGraph.ts
git commit -m "feat(visual-builder): add useVisualGraph hook with undo/redo"
```

---

## Task 4: graphToKuri — Code Generator

**Files:**
- Create: `src/components/strategy-studio/visual-builder/utils/graphToKuri.ts`

- [ ] **Step 1: Create the Kuri code generator**

```typescript
// src/components/strategy-studio/visual-builder/utils/graphToKuri.ts
import type { VisualGraph, IndicatorNodeConfig, MathNodeConfig, EntryNodeConfig, PlotNodeConfig, AlertNodeConfig } from '../types';

export function graphToKuri(graph: VisualGraph): string {
  const lines: string[] = [];

  // Declaration
  lines.push('//@version=3');
  if (graph.scriptType === 'strategy') {
    lines.push(`strategy("${graph.scriptName}", overlay=true)`);
  } else {
    lines.push(`indicator("${graph.scriptName}", overlay=true)`);
  }
  lines.push('');

  for (const node of graph.nodes) {
    switch (node.config.type) {
      case 'indicator': {
        const cfg = node.config as IndicatorNodeConfig;
        for (const ind of cfg.indicators) {
          const paramStr = Object.entries(ind.params).map(([, v]) => String(v)).join(', ');
          lines.push(`${ind.outputName} = ${ind.function}(${ind.source}${paramStr ? ', ' + paramStr : ''})`);
        }
        if (cfg.indicators.length > 0) lines.push('');
        break;
      }
      case 'math': {
        const cfg = node.config as MathNodeConfig;
        for (const f of cfg.formulas) {
          if (f.operator === 'crossover') {
            lines.push(`${f.outputName} = ta.crossover(${f.left}, ${f.right})`);
          } else if (f.operator === 'crossunder') {
            lines.push(`${f.outputName} = ta.crossunder(${f.left}, ${f.right})`);
          } else {
            lines.push(`${f.outputName} = ${f.left} ${f.operator} ${f.right}`);
          }
        }
        if (cfg.formulas.length > 0) lines.push('');
        break;
      }
      case 'entry': {
        const cfg = node.config as EntryNodeConfig;
        for (const rule of cfg.rules) {
          if (rule.conditions.length === 0) continue;
          const condParts = rule.conditions.map(c => {
            const op = c.operator === 'crosses_above' ? 'crosses above'
                     : c.operator === 'crosses_below' ? 'crosses below'
                     : c.operator;
            // For crosses_above/below, use ta.crossover/crossunder
            if (c.operator === 'crosses_above') return `ta.crossover(${c.left}, ${c.right})`;
            if (c.operator === 'crosses_below') return `ta.crossunder(${c.left}, ${c.right})`;
            return `${c.left} ${op} ${c.right}`;
          });
          const joiner = rule.logicOperator === 'AND' ? ' and ' : ' or ';
          const condStr = condParts.join(joiner);
          lines.push(`if ${condStr}`);

          if (rule.ruleType === 'entry' && rule.direction) {
            const dir = rule.direction === 'LONG' ? 'strategy.long' : 'strategy.short';
            let entryArgs = `"${rule.action.tradeId}", ${dir}`;
            if (rule.risk?.stopLoss) entryArgs += `, stop_loss=${rule.risk.stopLoss}`;
            if (rule.risk?.takeProfit) entryArgs += `, take_profit=${rule.risk.takeProfit}`;
            lines.push(`    strategy.entry(${entryArgs})`);
          } else {
            lines.push(`    strategy.close("${rule.action.tradeId}")`);
          }
          lines.push('');
        }
        break;
      }
      case 'plot': {
        const cfg = node.config as PlotNodeConfig;
        for (const p of cfg.plots) {
          lines.push(`plot(${p.variable}, color=${p.color}, linewidth=${p.lineWidth})`);
        }
        if (cfg.plots.length > 0) lines.push('');
        break;
      }
      case 'alert': {
        const cfg = node.config as AlertNodeConfig;
        for (const a of cfg.alerts) {
          lines.push(`alertcondition(${a.condition}, message="${a.message}")`);
        }
        break;
      }
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/strategy-studio/visual-builder/utils/graphToKuri.ts
git commit -m "feat(visual-builder): add graphToKuri code generator"
```

---

## Task 5: SubNode + SubNodeWire Components

**Files:**
- Create: `src/components/strategy-studio/visual-builder/sub-nodes/SubNode.tsx`
- Create: `src/components/strategy-studio/visual-builder/sub-nodes/SubNodeWire.tsx`

- [ ] **Step 1: Create SubNode — reusable shell**

```typescript
// src/components/strategy-studio/visual-builder/sub-nodes/SubNode.tsx
import React from 'react';

interface SubNodeProps {
  header: string;
  headerBg?: string;
  borderColor?: string;
  children: React.ReactNode;
  onClick?: () => void;
}

export const SubNode: React.FC<SubNodeProps> = ({ header, headerBg, borderColor, children, onClick }) => (
  <div
    className="bg-[#1a1a1a] rounded-[5px] border-[1.5px] min-w-[70px] flex-shrink-0 transition-all hover:border-[#333] cursor-pointer"
    style={{ borderColor: borderColor || '#222' }}
    onClick={onClick}
  >
    <div className="px-2 py-[3px] text-[8px] font-semibold text-[#555] rounded-t-[4px]" style={{ background: headerBg }}>
      {header}
    </div>
    <div className="px-2 py-[6px] text-[11px] text-center">
      {children}
    </div>
  </div>
);
```

- [ ] **Step 2: Create SubNodeWire**

```typescript
// src/components/strategy-studio/visual-builder/sub-nodes/SubNodeWire.tsx
import React from 'react';

interface SubNodeWireProps {
  color?: string;
}

export const SubNodeWire: React.FC<SubNodeWireProps> = ({ color = '#555' }) => (
  <div className="w-5 h-[1.5px] flex-shrink-0" style={{ background: color }} />
);
```

- [ ] **Step 3: Commit**

```bash
git add src/components/strategy-studio/visual-builder/sub-nodes/
git commit -m "feat(visual-builder): add SubNode and SubNodeWire components"
```

---

## Task 6: PipelineNode + PipelineWire + PipelineBar

**Files:**
- Create: `src/components/strategy-studio/visual-builder/PipelineNode.tsx`
- Create: `src/components/strategy-studio/visual-builder/PipelineWire.tsx`
- Create: `src/components/strategy-studio/visual-builder/PipelineBar.tsx`

- [ ] **Step 1: Create PipelineNode**

```typescript
// src/components/strategy-studio/visual-builder/PipelineNode.tsx
import React from 'react';
import type { PipelineNodeData } from './types';
import { PIPELINE_NODE_META } from './types';

interface Props {
  node: PipelineNodeData;
  isActive: boolean;
  summary: string;
  onClick: () => void;
}

export const PipelineNode: React.FC<Props> = ({ node, isActive, summary, onClick }) => {
  const meta = PIPELINE_NODE_META[node.type];
  return (
    <div
      className={`bg-[#141414] rounded-md min-w-[120px] cursor-pointer transition-all flex-shrink-0 hover:-translate-y-[1px] ${
        isActive ? 'shadow-[0_0_12px_rgba(41,98,255,0.12)]' : ''
      }`}
      style={{ border: `1.5px solid ${isActive ? '#2962ff' : `${meta.color}33`}` }}
      onClick={onClick}
    >
      <div className="px-3 py-[6px] rounded-t-[5px] flex items-center gap-[7px] text-[11px] font-bold"
           style={{ background: `${meta.color}0F` }}>
        <div className="w-5 h-5 rounded flex items-center justify-center text-[10px] flex-shrink-0"
             style={{ background: meta.color, color: node.type === 'entry' || node.type === 'alert' || node.type === 'plot' ? 'white' : '#0a0a0a' }}>
          {meta.icon}
        </div>
        <span style={{ color: meta.color }}>{meta.label}</span>
      </div>
      <div className="px-3 py-[5px] text-[10px] text-[#555]">{summary}</div>
    </div>
  );
};
```

- [ ] **Step 2: Create PipelineWire**

```typescript
// src/components/strategy-studio/visual-builder/PipelineWire.tsx
import React from 'react';

interface Props {
  colorFrom: string;
  colorTo: string;
}

export const PipelineWire: React.FC<Props> = ({ colorFrom, colorTo }) => (
  <div className="w-7 h-[1.5px] flex-shrink-0" style={{ background: `linear-gradient(to right, ${colorFrom}, ${colorTo})` }} />
);
```

- [ ] **Step 3: Create PipelineBar**

```typescript
// src/components/strategy-studio/visual-builder/PipelineBar.tsx
import React from 'react';
import type { VisualGraph, PipelineNodeType } from './types';
import { PIPELINE_NODE_META } from './types';
import { PipelineNode } from './PipelineNode';
import { PipelineWire } from './PipelineWire';

interface Props {
  graph: VisualGraph;
  activeNodeId: string | null;
  onNodeClick: (nodeId: string) => void;
  onAddNode: (type: PipelineNodeType) => void;
}

function getNodeSummary(node: { config: { type: string } & Record<string, any> }): string {
  const c = node.config;
  if (c.type === 'indicator') return c.indicators?.length ? `${c.indicators.length} indicator${c.indicators.length > 1 ? 's' : ''}` : 'Click to add';
  if (c.type === 'math') return c.formulas?.length ? `${c.formulas.length} formula${c.formulas.length > 1 ? 's' : ''}` : 'Click to add';
  if (c.type === 'entry') return c.rules?.length ? `${c.rules.length} rule${c.rules.length > 1 ? 's' : ''}` : 'Click to add';
  if (c.type === 'plot') return c.plots?.length ? `${c.plots.length} plot${c.plots.length > 1 ? 's' : ''}` : 'Click to add';
  if (c.type === 'alert') return c.alerts?.length ? `${c.alerts.length} alert${c.alerts.length > 1 ? 's' : ''}` : 'Click to add';
  return '';
}

export const PipelineBar: React.FC<Props> = ({ graph, activeNodeId, onNodeClick, onAddNode }) => {
  const nodes = graph.nodes;
  return (
    <div className="bg-[#111] border-b border-[#1a1a1a] px-4 py-3 flex items-center gap-0 overflow-x-auto flex-shrink-0">
      {nodes.map((node, i) => {
        const meta = PIPELINE_NODE_META[node.type];
        const nextMeta = i < nodes.length - 1 ? PIPELINE_NODE_META[nodes[i + 1].type] : null;
        return (
          <React.Fragment key={node.id}>
            <PipelineNode
              node={node}
              isActive={node.id === activeNodeId}
              summary={getNodeSummary(node)}
              onClick={() => onNodeClick(node.id)}
            />
            {nextMeta && <PipelineWire colorFrom={meta.color} colorTo={nextMeta.color} />}
          </React.Fragment>
        );
      })}
      <button
        className="bg-[#141414] border border-dashed border-[#333] rounded-md px-3 py-[6px] text-[11px] text-[#555] cursor-pointer flex-shrink-0 ml-2 hover:border-[#555] hover:text-[#888]"
        onClick={() => onAddNode('indicator')}
      >
        + Add Node
      </button>
    </div>
  );
};
```

- [ ] **Step 4: Commit**

```bash
git add src/components/strategy-studio/visual-builder/PipelineNode.tsx src/components/strategy-studio/visual-builder/PipelineWire.tsx src/components/strategy-studio/visual-builder/PipelineBar.tsx
git commit -m "feat(visual-builder): add pipeline bar with nodes and wires"
```

---

## Task 7: Sub-Pages (Indicator, Math, Condition, Plot, Alert)

**Files:**
- Create: `src/components/strategy-studio/visual-builder/pages/IndicatorPage.tsx`
- Create: `src/components/strategy-studio/visual-builder/pages/MathCalcPage.tsx`
- Create: `src/components/strategy-studio/visual-builder/pages/ConditionPage.tsx`
- Create: `src/components/strategy-studio/visual-builder/pages/PlotPage.tsx`
- Create: `src/components/strategy-studio/visual-builder/pages/AlertPage.tsx`

This is the largest task. Each sub-page is an N8N-style canvas that renders the node's internal config as connected sub-nodes and provides dropdowns/inputs for editing.

- [ ] **Step 1: Create IndicatorPage**

The Indicator page shows rows of sub-nodes: `[Function ▾] → [Source ▾] → [Period] → [Output Name]`. Each row is one indicator. Users add/remove rows and configure via dropdowns.

See spec section "Sub-Page: Indicator Node" for layout.

Key UI elements:
- Dropdown for function (`ta.ema`, `ta.sma`, `ta.rsi`, `ta.bbands`, etc.)
- Dropdown for source (`close`, `open`, `high`, `low`, `volume`)
- Number input for period
- Text input for output variable name
- "+ Add Indicator Row" button
- Available outputs shown at bottom

The component receives `node: PipelineNodeData` (with `IndicatorNodeConfig`) and `onUpdate: (config: IndicatorNodeConfig) => void`.

- [ ] **Step 2: Create MathCalcPage**

Rows: `[Variable ▾] → [Operator ▾] → [Variable ▾] → [Output Name]`. Operators include `+`, `-`, `*`, `/`, `%`, `crossover`, `crossunder`.

Variable dropdowns populated from `availableVariables` prop (outputs of upstream Indicator node) plus built-in (`close`, `open`, `high`, `low`, `volume`).

- [ ] **Step 3: Create ConditionPage**

Shows rules. Each rule is a card with sub-node rows:
- Entry rule: `[Variable] → [Compare] → [AND] → [IF true] → [Entry LONG/SHORT] → [SL/TP]`
- Exit rule: `[Variable] → [Compare] → [IF true] → [Close]`

Supports multiple conditions per rule via AND/OR. "+ Add Rule" button at bottom.

- [ ] **Step 4: Create PlotPage**

Rows: `[Variable ▾] → [Style ▾] → [Color picker] → [Width] → [Overlay ▾]`

- [ ] **Step 5: Create AlertPage**

Rows: `[Condition ▾] → [Frequency ▾] → [Message input]`

- [ ] **Step 6: Commit**

```bash
git add src/components/strategy-studio/visual-builder/pages/
git commit -m "feat(visual-builder): add all 5 node sub-pages"
```

---

## Task 8: NodeSubPage — Drill-Down Container

**Files:**
- Create: `src/components/strategy-studio/visual-builder/NodeSubPage.tsx`

- [ ] **Step 1: Create the container with breadcrumb + page routing**

```typescript
// src/components/strategy-studio/visual-builder/NodeSubPage.tsx
import React from 'react';
import type { PipelineNodeData } from './types';
import { PIPELINE_NODE_META } from './types';
import { IndicatorPage } from './pages/IndicatorPage';
import { MathCalcPage } from './pages/MathCalcPage';
import { ConditionPage } from './pages/ConditionPage';
import { PlotPage } from './pages/PlotPage';
import { AlertPage } from './pages/AlertPage';

interface Props {
  node: PipelineNodeData;
  onBack: () => void;
  onUpdate: (node: PipelineNodeData) => void;
  availableVariables: string[];
}

export const NodeSubPage: React.FC<Props> = ({ node, onBack, onUpdate, availableVariables }) => {
  const meta = PIPELINE_NODE_META[node.type];

  const handleConfigUpdate = (config: any) => {
    onUpdate({ ...node, config });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden animate-[fadeIn_200ms_ease]">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 px-4 py-3 text-xs border-b border-[#1a1a1a] bg-[#0d0d0d] flex-shrink-0">
        <span className="text-[#666] cursor-pointer hover:text-[#ccc] transition-colors" onClick={onBack}>
          ← Strategy
        </span>
        <span className="text-[#333]">/</span>
        <span className="font-semibold" style={{ color: meta.color }}>
          {meta.icon} {meta.label}
        </span>
      </div>

      {/* Sub-page content */}
      <div className="flex-1 overflow-y-auto">
        {node.config.type === 'indicator' && (
          <IndicatorPage config={node.config} onUpdate={handleConfigUpdate} />
        )}
        {node.config.type === 'math' && (
          <MathCalcPage config={node.config} onUpdate={handleConfigUpdate} availableVariables={availableVariables} />
        )}
        {node.config.type === 'entry' && (
          <ConditionPage config={node.config} onUpdate={handleConfigUpdate} availableVariables={availableVariables} />
        )}
        {node.config.type === 'plot' && (
          <PlotPage config={node.config} onUpdate={handleConfigUpdate} availableVariables={availableVariables} />
        )}
        {node.config.type === 'alert' && (
          <AlertPage config={node.config} onUpdate={handleConfigUpdate} availableVariables={availableVariables} />
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/strategy-studio/visual-builder/NodeSubPage.tsx
git commit -m "feat(visual-builder): add NodeSubPage drill-down container"
```

---

## Task 9: VisualBuilder — Main Container

**Files:**
- Create: `src/components/strategy-studio/visual-builder/VisualBuilder.tsx`

- [ ] **Step 1: Create the main component that orchestrates pipeline + sub-pages**

```typescript
// src/components/strategy-studio/visual-builder/VisualBuilder.tsx
import React, { useEffect, useRef } from 'react';
import { PipelineBar } from './PipelineBar';
import { NodeSubPage } from './NodeSubPage';
import { useVisualGraph } from './hooks/useVisualGraph';
import { graphToKuri } from './utils/graphToKuri';
import type { PipelineNodeType } from './types';

interface Props {
  onCodeChange: (code: string) => void;
  strategyName: string;
}

export const VisualBuilder: React.FC<Props> = ({ onCodeChange, strategyName }) => {
  const {
    graph, setGraph,
    activeNodeId, setActiveNodeId, activeNode,
    updateNode, addNode,
    availableVariables,
  } = useVisualGraph();

  // Sync strategy name
  useEffect(() => {
    if (strategyName && strategyName !== graph.scriptName) {
      setGraph({ ...graph, scriptName: strategyName });
    }
  }, [strategyName]);

  // Generate Kuri code on graph change (debounced)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const code = graphToKuri(graph);
      onCodeChange(code);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [graph, onCodeChange]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PipelineBar
        graph={graph}
        activeNodeId={activeNodeId}
        onNodeClick={(id) => setActiveNodeId(activeNodeId === id ? null : id)}
        onAddNode={(type: PipelineNodeType) => addNode(type)}
      />

      {activeNode ? (
        <NodeSubPage
          node={activeNode}
          onBack={() => setActiveNodeId(null)}
          onUpdate={(updated) => updateNode(updated.id, () => updated)}
          availableVariables={availableVariables}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center flex-col gap-3 text-[#333]">
          <div className="text-5xl">▲</div>
          <div className="text-base font-light text-[#444]">Click any node above to configure it</div>
          <div className="text-xs text-[#333]">Each node opens its own N8N-style sub-page</div>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/strategy-studio/visual-builder/VisualBuilder.tsx
git commit -m "feat(visual-builder): add VisualBuilder main container"
```

---

## Task 10: TopToolbar — Add Visual/Code Toggle

**Files:**
- Modify: `src/components/strategy-studio/TopToolbar.tsx`

- [ ] **Step 1: Add `editorMode` and `onModeChange` props**

Add to `TopToolbarProps`:
```typescript
editorMode?: 'visual' | 'code';
onModeChange?: (mode: 'visual' | 'code') => void;
```

- [ ] **Step 2: Add toggle UI between Save and Run buttons**

Insert after the save button (line ~189), before the Run button:

```tsx
{/* Visual / Code Toggle */}
{onModeChange && (
  <>
    <div className="w-px h-6 bg-white/10 mx-1" />
    <div className="flex bg-[#141414] rounded-[5px] p-[2px] border border-[#222]">
      <button
        onClick={() => onModeChange('visual')}
        className={`px-3 py-1 rounded text-[11px] font-semibold transition-all ${
          editorMode === 'visual'
            ? 'bg-[#2962ff] text-white shadow-[0_1px_4px_rgba(41,98,255,0.3)]'
            : 'bg-transparent text-[#666] hover:text-[#999]'
        }`}
      >
        Visual
      </button>
      <button
        onClick={() => onModeChange('code')}
        className={`px-3 py-1 rounded text-[11px] font-semibold transition-all ${
          editorMode === 'code'
            ? 'bg-[#2962ff] text-white shadow-[0_1px_4px_rgba(41,98,255,0.3)]'
            : 'bg-transparent text-[#666] hover:text-[#999]'
        }`}
      >
        Code
      </button>
    </div>
  </>
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/strategy-studio/TopToolbar.tsx
git commit -m "feat(visual-builder): add Visual/Code toggle to TopToolbar"
```

---

## Task 11: StrategyStudio Integration

**Files:**
- Modify: `src/pages/StrategyStudio.tsx`

- [ ] **Step 1: Add editorMode state with localStorage persistence**

After `isConsoleOpen` state (line ~85), add:
```typescript
const [editorMode, setEditorMode] = useState<'visual' | 'code'>(() => {
  return (localStorage.getItem('strategyStudio_editorMode') as 'visual' | 'code') || 'code';
});
```

Add persistence effect:
```typescript
useEffect(() => {
  localStorage.setItem('strategyStudio_editorMode', editorMode);
}, [editorMode]);
```

- [ ] **Step 2: Import VisualBuilder**

Add import at top:
```typescript
import { VisualBuilder } from '../components/strategy-studio/visual-builder/VisualBuilder';
```

- [ ] **Step 3: Pass mode props to TopToolbar**

Add to `<TopToolbar>` props (around line ~683):
```typescript
editorMode={editorMode}
onModeChange={setEditorMode}
```

- [ ] **Step 4: Conditionally render VisualBuilder or Monaco editor**

Replace the `{activeScript ? (` block (lines ~699-764) with:

```tsx
<div className="flex-1 overflow-hidden relative">
  {activeScript ? (
    editorMode === 'visual' ? (
      <VisualBuilder
        onCodeChange={(code) => {
          setKuriContent(code);
          setIsDirty(true);
        }}
        strategyName={strategyName}
      />
    ) : (
      <Editor /* ... existing Monaco editor props unchanged ... */ />
    )
  ) : (
    /* ... existing empty state unchanged ... */
  )}
</div>
```

- [ ] **Step 5: Run dev server and verify toggle works**

Run: `cd "c:/Users/nirma/OneDrive/Desktop/My Project" && pnpm dev`

Test:
1. Open Strategy Studio
2. Create a new strategy
3. Click "Visual" toggle — should see pipeline bar
4. Click "Code" toggle — should see Monaco editor
5. Click any pipeline node — should see sub-page

- [ ] **Step 6: Commit**

```bash
git add src/pages/StrategyStudio.tsx
git commit -m "feat(visual-builder): integrate VisualBuilder into StrategyStudio"
```

---

## Task 12: Polish & Verify End-to-End

- [ ] **Step 1: Add fadeIn animation to Tailwind config (if not already present)**

Check if `animate-[fadeIn_200ms_ease]` works with Tailwind. If not, add a keyframe in `src/index.css`:
```css
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 2: Verify full flow**

1. Open Strategy Studio → Create new Strategy
2. Toggle to Visual mode
3. Click Indicator node → add EMA(close, 9) as `fast_ma`
4. Click Math node → add crossover(fast_ma, slow_ma) as `cross_up`
5. Click Condition node → add entry rule with `cross_up == true`
6. Click Plot node → add `fast_ma` with red color
7. Toggle to Code mode → verify generated Kuri code is correct
8. Save → verify code passes diagnostics

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat(visual-builder): polish and verify end-to-end flow"
```
