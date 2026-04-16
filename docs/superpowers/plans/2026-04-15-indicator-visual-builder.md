# Indicator Visual Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a no-code wizard on the Market page that lets non-technical traders create advanced `.kuri` indicator scripts (Level + Pattern archetype, MFL-capable), emitting valid Kuri source that round-trips through the existing parser.

**Architecture:** A multi-step wizard mounted inside [IndicatorEditorPanel.tsx](../../../src/components/market-chart/IndicatorEditorPanel.tsx) behind a Visual/Code toggle. State-preserving across toggles; visual state is the source of truth when visual is active; code regenerates live into Monaco. Wizard shell is generic; step definitions are local components. Codegen is a pure function that assembles `.kuri` text from the builder model.

**Tech Stack:** React 19 + TypeScript, Tailwind CSS, Monaco Editor, Kuri scripting language. No new deps.

**Spec:** [2026-04-15-indicator-visual-builder-design.md](../specs/2026-04-15-indicator-visual-builder-design.md)

**Reference implementation:** The Strategy Visual Builder in [src/components/strategy-studio/visual-builder/](../../../src/components/strategy-studio/visual-builder/) is the closest analog — the wizard shell, step pattern, Monaco sync, parser round-trip, and codegen approach all carry over. Re-read it before starting.

**Testing note:** This codebase has no unit-test harness for visual React components. Each task ends with a manual browser verification checkpoint instead of an automated test. Run `pnpm dev` and follow the "Verify" instructions.

---

## File Structure

```
src/components/market-chart/visual-indicator-builder/
  IndicatorVisualBuilder.tsx        — wizard shell + step router + Monaco sync
  types.ts                          — IndicatorModel, Level, PatternCell, AlertRow, etc.
  codegen.ts                        — pure fn: IndicatorModel → .kuri string
  patterns.ts                       — FR/FB/TW/BF/SR helper function templates
  presets.ts                        — level preset library (Above Open ATR, Session High, …)
  steps/
    StepInfo.tsx
    StepParameters.tsx
    StepDataSource.tsx
    StepLevels.tsx
    StepPatterns.tsx
    StepAlerts.tsx
    StepReview.tsx
```

Plus edits to:
- `src/components/market-chart/IndicatorEditorPanel.tsx` — add Visual/Code toggle and mount `IndicatorVisualBuilder` above the Monaco editor.

**Reuse (don't reimplement):**
- Parser: `src/components/strategy-studio/visual-builder/kuriSourceParser.ts` — already extracts params, outputs, levels, conditions. The builder hydrates from this on open-existing.

---

## Task 1: Create the type model and scaffolding

**Files:**
- Create: `src/components/market-chart/visual-indicator-builder/types.ts`
- Create: `src/components/market-chart/visual-indicator-builder/IndicatorVisualBuilder.tsx` (stub)

- [ ] **Step 1: Write `types.ts`**

```typescript
export type HtfTimeframe = 'current' | 'daily' | 'weekly' | 'monthly' | 'prev_session' | 'custom';
export type AnchorType = 'window_open' | 'prev_window_close' | 'rolling_n';
export type OhlcBase = 'open' | 'high' | 'low' | 'close' | 'hl2' | 'hlc3' | 'ohlc4';
export type OffsetSource = 'atr' | 'range' | 'points' | 'percent' | 'none';
export type PatternType = 'fr' | 'fb' | 'tw' | 'bf' | 'sr';
export type PatternSide = 'buy' | 'sell';
export type ParamType = 'int' | 'float' | 'bool' | 'source' | 'string' | 'color';

export interface ParameterDef {
    id: string;
    varName: string;           // e.g. "length"
    title: string;             // e.g. "Length"
    type: ParamType;
    defaultValue: any;
    min?: number;
    max?: number;
    options?: string[];
    locked: boolean;           // locked = hardcoded in generated source
}

export interface DataSourceDef {
    timeframe: HtfTimeframe;
    customTf?: string;         // e.g. "4h" when timeframe === 'custom'
    anchor: AnchorType;
    rollingN?: number;         // when anchor === 'rolling_n'
}

export interface LevelRecipe {
    base: OhlcBase;
    sign: '+' | '-';
    multiplier: number | string;   // number literal OR a param varName
    offsetSource: OffsetSource;
    offsetParam?: string;          // period for ATR/range (ATR(14))
}

export interface LevelDef {
    id: string;
    name: string;              // e.g. "BA" (Buy Anchor)
    title: string;             // e.g. "Buy Anchor"
    presetId: string | 'custom';
    recipe: LevelRecipe;
    color: string;             // hex
    lineStyle: 'solid' | 'dashed' | 'dotted';
}

export interface PatternCell {
    enabled: boolean;
    sides: { buy: boolean; sell: boolean };
}

// levelId → (patternType → cell)
export type PatternMatrix = Record<string, Record<PatternType, PatternCell>>;

export type AlertTrigger =
    | { kind: 'pattern'; levelId: string; pattern: PatternType; side: PatternSide }
    | { kind: 'cross_level'; levelId: string; direction: 'above' | 'below' | 'touch' }
    | { kind: 'breakout_close'; levelId: string; direction: 'above' | 'below' }
    | { kind: 'new_window' };

export interface AlertRow {
    id: string;
    trigger: AlertTrigger;
    title: string;
    message: string;           // supports {level}, {price}, {symbol}
    autoGenerated: boolean;    // true = derived from Step 5, message editable but row not deletable
}

export interface IndicatorModel {
    info: {
        name: string;
        shortname: string;
        overlay: boolean;
    };
    parameters: ParameterDef[];
    dataSource: DataSourceDef;
    levels: LevelDef[];
    patternMatrix: PatternMatrix;
    alerts: AlertRow[];
}

export const createEmptyModel = (): IndicatorModel => ({
    info: { name: 'My Indicator', shortname: 'MI', overlay: true },
    parameters: [],
    dataSource: { timeframe: 'daily', anchor: 'window_open' },
    levels: [],
    patternMatrix: {},
    alerts: [],
});
```

- [ ] **Step 2: Write `IndicatorVisualBuilder.tsx` stub**

```tsx
import React, { useState } from 'react';
import { IndicatorModel, createEmptyModel } from './types';

interface Props {
    initialSource?: string;
    onSourceChange: (source: string) => void;
}

const STEPS = [
    { num: 1, label: 'Info' },
    { num: 2, label: 'Parameters' },
    { num: 3, label: 'Data Source' },
    { num: 4, label: 'Levels' },
    { num: 5, label: 'Patterns' },
    { num: 6, label: 'Alerts' },
    { num: 7, label: 'Review' },
];

const IndicatorVisualBuilder: React.FC<Props> = ({ onSourceChange }) => {
    const [step, setStep] = useState(1);
    const [model, setModel] = useState<IndicatorModel>(createEmptyModel());
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _unused = { model, setModel, onSourceChange };

    return (
        <div className="flex flex-col h-full bg-[#09090b] text-white">
            <div className="flex items-center justify-center gap-0 py-3 px-6 border-b border-white/5">
                {STEPS.map((s, i) => (
                    <React.Fragment key={s.num}>
                        {i > 0 && <div className="w-10 h-px bg-white/10 mx-2" />}
                        <button type="button" onClick={() => setStep(s.num)} className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                                step === s.num ? 'bg-[#2962FF] text-white' : step > s.num ? 'bg-emerald-600 text-white' : 'bg-white/5 text-gray-600'
                            }`}>{step > s.num ? '\u2713' : s.num}</div>
                            <span className={`text-xs font-medium ${step === s.num ? 'text-white' : step > s.num ? 'text-emerald-400' : 'text-gray-600'}`}>{s.label}</span>
                        </button>
                    </React.Fragment>
                ))}
            </div>
            <div className="flex-1 p-6 text-sm text-gray-400">
                Step {step} — placeholder
            </div>
        </div>
    );
};

export default IndicatorVisualBuilder;
```

- [ ] **Step 3: Verify compile**

Run `pnpm build` (or rely on IDE type-check). Expected: no type errors introduced by the new files.

- [ ] **Step 4: Commit**

```bash
git add src/components/market-chart/visual-indicator-builder/
git commit -m "feat(indicator-builder): scaffold types and wizard shell"
```

---

## Task 2: Wire the Visual/Code toggle into IndicatorEditorPanel

**Files:**
- Modify: `src/components/market-chart/IndicatorEditorPanel.tsx`

- [ ] **Step 1: Add the mode state and toggle UI**

Find the top-level layout where the Monaco `Editor` is rendered. Above it, add a toggle row mirroring the Strategy Studio Visual/Code toggle. Add:

```tsx
const [editorMode, setEditorMode] = useState<'visual' | 'code'>('code');
```

Add a toggle button in the panel header (right side):

```tsx
<div className="flex items-center gap-1 rounded bg-white/5 p-0.5">
    <button type="button" onClick={() => setEditorMode('visual')}
        className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${editorMode === 'visual' ? 'bg-[#2962FF] text-white' : 'text-gray-400 hover:text-white'}`}>
        Visual
    </button>
    <button type="button" onClick={() => setEditorMode('code')}
        className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${editorMode === 'code' ? 'bg-[#2962FF] text-white' : 'text-gray-400 hover:text-white'}`}>
        Code
    </button>
</div>
```

- [ ] **Step 2: Mount `IndicatorVisualBuilder` above Monaco, both always mounted**

Both components must stay mounted (state preserved on toggle). Use `display: none` / `display: flex` via className, not unmount:

```tsx
import IndicatorVisualBuilder from './visual-indicator-builder/IndicatorVisualBuilder';
// …
<div className={editorMode === 'visual' ? 'flex-1 min-h-0' : 'hidden'}>
    <IndicatorVisualBuilder
        initialSource={editorContent}
        onSourceChange={setEditorContent}
    />
</div>
<div className={editorMode === 'code' ? 'flex-1 min-h-0' : 'hidden'}>
    <Editor
        /* existing Monaco props */
    />
</div>
```

Use the exact prop/state names already in `IndicatorEditorPanel.tsx` (the variable might be `content` / `setContent` — grep the file first).

- [ ] **Step 3: Verify in browser**

Run `pnpm dev`. Open the Market page, open the Indicator Editor (Ctrl+E or `</>` icon in the right toolbar). Expected:
- Visual/Code toggle appears in the panel header.
- Clicking "Visual" shows the stepper wizard with placeholder content.
- Clicking "Code" shows the Monaco editor as before.
- Switching back does not lose editor content.

- [ ] **Step 4: Commit**

```bash
git add src/components/market-chart/IndicatorEditorPanel.tsx
git commit -m "feat(indicator-builder): add Visual/Code toggle to IndicatorEditorPanel"
```

---

## Task 3: Implement Step 1 — Info

**Files:**
- Create: `src/components/market-chart/visual-indicator-builder/steps/StepInfo.tsx`
- Modify: `src/components/market-chart/visual-indicator-builder/IndicatorVisualBuilder.tsx`

- [ ] **Step 1: Write `StepInfo.tsx`**

```tsx
import React from 'react';
import { IndicatorModel } from '../types';

interface Props {
    model: IndicatorModel;
    update: (patch: Partial<IndicatorModel>) => void;
}

const StepInfo: React.FC<Props> = ({ model, update }) => (
    <div className="max-w-xl space-y-4">
        <h2 className="text-sm font-semibold text-white">Indicator Info</h2>
        <p className="text-xs text-gray-500">Name your indicator and choose how it renders on the chart.</p>

        <label className="block">
            <span className="text-[11px] text-gray-400">Name</span>
            <input type="text" value={model.info.name}
                onChange={(e) => update({ info: { ...model.info, name: e.target.value } })}
                className="mt-1 w-full bg-[#1e222d] border border-white/[0.08] rounded px-3 py-2 text-sm text-white outline-none focus:border-[#2962FF]" />
        </label>

        <label className="block">
            <span className="text-[11px] text-gray-400">Short Name (badge)</span>
            <input type="text" value={model.info.shortname} maxLength={8}
                onChange={(e) => update({ info: { ...model.info, shortname: e.target.value } })}
                className="mt-1 w-full bg-[#1e222d] border border-white/[0.08] rounded px-3 py-2 text-sm text-white outline-none focus:border-[#2962FF]" />
        </label>

        <label className="flex items-center gap-3">
            <input type="checkbox" checked={model.info.overlay}
                onChange={(e) => update({ info: { ...model.info, overlay: e.target.checked } })} />
            <span className="text-xs text-gray-300">Overlay on price chart (uncheck for a separate pane)</span>
        </label>
    </div>
);

export default StepInfo;
```

- [ ] **Step 2: Wire into `IndicatorVisualBuilder.tsx`**

Replace the placeholder `<div>Step {step} — placeholder</div>` with a step router:

```tsx
import StepInfo from './steps/StepInfo';
// …
const update = (patch: Partial<IndicatorModel>) => setModel((prev) => ({ ...prev, ...patch }));
// inside render:
<div className="flex-1 overflow-y-auto p-6">
    {step === 1 && <StepInfo model={model} update={update} />}
    {step > 1 && <div className="text-sm text-gray-400">Step {step} — coming next</div>}
</div>
```

- [ ] **Step 3: Verify in browser**

Reload the page. On Step 1: change name, shortname, toggle overlay. Navigate to Step 2 then back — values persist.

- [ ] **Step 4: Commit**

```bash
git add src/components/market-chart/visual-indicator-builder/
git commit -m "feat(indicator-builder): Step 1 (Info)"
```

---

## Task 4: Implement Step 2 — Parameters

**Files:**
- Create: `src/components/market-chart/visual-indicator-builder/steps/StepParameters.tsx`
- Modify: `src/components/market-chart/visual-indicator-builder/IndicatorVisualBuilder.tsx`

- [ ] **Step 1: Write `StepParameters.tsx`**

The step manages a list of `ParameterDef` rows. Each row shows: varName input, title input, type dropdown (int/float/bool/source), default input, min/max (for int/float), lock toggle, remove button. "Add Parameter" button at bottom.

```tsx
import React from 'react';
import { IndicatorModel, ParameterDef } from '../types';

interface Props {
    model: IndicatorModel;
    update: (patch: Partial<IndicatorModel>) => void;
}

const makeParam = (): ParameterDef => ({
    id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    varName: 'length',
    title: 'Length',
    type: 'int',
    defaultValue: 14,
    min: 1,
    max: 500,
    locked: false,
});

const StepParameters: React.FC<Props> = ({ model, update }) => {
    const add = () => update({ parameters: [...model.parameters, makeParam()] });
    const patch = (id: string, p: Partial<ParameterDef>) =>
        update({ parameters: model.parameters.map((x) => (x.id === id ? { ...x, ...p } : x)) });
    const remove = (id: string) => update({ parameters: model.parameters.filter((x) => x.id !== id) });

    return (
        <div className="max-w-3xl">
            <h2 className="text-sm font-semibold text-white mb-1">Parameters</h2>
            <p className="text-xs text-gray-500 mb-4">Add inputs users can adjust. Lock to hardcode the value in generated code.</p>

            <div className="space-y-2">
                {model.parameters.map((p) => (
                    <div key={p.id} className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 flex flex-wrap items-center gap-2">
                        <input value={p.varName} placeholder="varName"
                            onChange={(e) => patch(p.id, { varName: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
                            className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-white w-24" />
                        <input value={p.title} placeholder="Title"
                            onChange={(e) => patch(p.id, { title: e.target.value })}
                            className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-white flex-1 min-w-[120px]" />
                        <select value={p.type}
                            onChange={(e) => patch(p.id, { type: e.target.value as any })}
                            className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-white">
                            <option value="int">int</option>
                            <option value="float">float</option>
                            <option value="bool">bool</option>
                            <option value="source">source</option>
                        </select>
                        <input value={String(p.defaultValue)} placeholder="default"
                            onChange={(e) => {
                                const v = p.type === 'int' ? parseInt(e.target.value) || 0
                                        : p.type === 'float' ? parseFloat(e.target.value) || 0
                                        : p.type === 'bool' ? e.target.value === 'true'
                                        : e.target.value;
                                patch(p.id, { defaultValue: v });
                            }}
                            className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-white w-20" />
                        {(p.type === 'int' || p.type === 'float') && (
                            <>
                                <input type="number" value={p.min ?? ''} placeholder="min"
                                    onChange={(e) => patch(p.id, { min: parseFloat(e.target.value) || undefined })}
                                    className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-white w-16" />
                                <input type="number" value={p.max ?? ''} placeholder="max"
                                    onChange={(e) => patch(p.id, { max: parseFloat(e.target.value) || undefined })}
                                    className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-white w-16" />
                            </>
                        )}
                        <button type="button" onClick={() => patch(p.id, { locked: !p.locked })}
                            title={p.locked ? 'Locked (hardcoded)' : 'Unlocked (user-adjustable)'}
                            className={`text-[10px] px-2 py-1 rounded ${p.locked ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
                            {p.locked ? 'LOCKED' : 'UNLOCKED'}
                        </button>
                        <button type="button" onClick={() => remove(p.id)} className="text-gray-500 hover:text-red-400 ml-auto">×</button>
                    </div>
                ))}
            </div>

            <button type="button" onClick={add}
                className="mt-3 w-full py-2 border border-dashed border-white/10 rounded-lg text-xs text-gray-400 hover:bg-white/5">
                + Add Parameter
            </button>
        </div>
    );
};

export default StepParameters;
```

- [ ] **Step 2: Wire into router**

Add `{step === 2 && <StepParameters model={model} update={update} />}` in `IndicatorVisualBuilder.tsx`.

- [ ] **Step 3: Verify in browser**

Add a parameter, edit varName/title/default, toggle lock, remove, add multiple. Navigate away and back — state persists.

- [ ] **Step 4: Commit**

```bash
git add src/components/market-chart/visual-indicator-builder/
git commit -m "feat(indicator-builder): Step 2 (Parameters)"
```

---

## Task 5: Implement Step 3 — Data Source

**Files:**
- Create: `src/components/market-chart/visual-indicator-builder/steps/StepDataSource.tsx`
- Modify: `src/components/market-chart/visual-indicator-builder/IndicatorVisualBuilder.tsx`

- [ ] **Step 1: Write `StepDataSource.tsx`**

Two dropdowns (timeframe + anchor), plus conditional inputs for custom TF and rolling N.

```tsx
import React from 'react';
import { IndicatorModel, HtfTimeframe, AnchorType } from '../types';

interface Props {
    model: IndicatorModel;
    update: (patch: Partial<IndicatorModel>) => void;
}

const TIMEFRAMES: { value: HtfTimeframe; label: string }[] = [
    { value: 'current', label: 'Current Timeframe' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'prev_session', label: 'Previous Session' },
    { value: 'custom', label: 'Custom' },
];

const ANCHORS: { value: AnchorType; label: string; desc: string }[] = [
    { value: 'window_open', label: "This window's open", desc: 'Anchor to the start of the current HTF window' },
    { value: 'prev_window_close', label: "Previous window's close", desc: 'Anchor to the close of the prior HTF window' },
    { value: 'rolling_n', label: 'Rolling N bars', desc: 'Anchor to a sliding window of N recent bars' },
];

const StepDataSource: React.FC<Props> = ({ model, update }) => {
    const ds = model.dataSource;
    const set = (patch: Partial<typeof ds>) => update({ dataSource: { ...ds, ...patch } });

    return (
        <div className="max-w-xl space-y-5">
            <div>
                <h2 className="text-sm font-semibold text-white mb-1">Data Source</h2>
                <p className="text-xs text-gray-500">Choose the timeframe and anchor point for the level calculations.</p>
            </div>

            <label className="block">
                <span className="text-[11px] text-gray-400">Timeframe</span>
                <select value={ds.timeframe}
                    onChange={(e) => set({ timeframe: e.target.value as HtfTimeframe })}
                    className="mt-1 w-full bg-[#1e222d] border border-white/[0.08] rounded px-3 py-2 text-sm text-white outline-none focus:border-[#2962FF]">
                    {TIMEFRAMES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
            </label>

            {ds.timeframe === 'custom' && (
                <label className="block">
                    <span className="text-[11px] text-gray-400">Custom TF (e.g. 4h, 15m)</span>
                    <input type="text" value={ds.customTf || ''}
                        onChange={(e) => set({ customTf: e.target.value })}
                        className="mt-1 w-full bg-[#1e222d] border border-white/[0.08] rounded px-3 py-2 text-sm text-white outline-none focus:border-[#2962FF]" />
                </label>
            )}

            <div>
                <span className="text-[11px] text-gray-400">Anchor Type</span>
                <div className="mt-1 space-y-1.5">
                    {ANCHORS.map((a) => (
                        <label key={a.value}
                            className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors ${
                                ds.anchor === a.value ? 'border-[#2962FF] bg-[#2962FF]/10' : 'border-white/[0.08] hover:border-white/[0.16]'
                            }`}>
                            <input type="radio" name="anchor" checked={ds.anchor === a.value}
                                onChange={() => set({ anchor: a.value })} className="mt-0.5" />
                            <div>
                                <div className="text-xs font-medium text-white">{a.label}</div>
                                <div className="text-[10px] text-gray-500">{a.desc}</div>
                            </div>
                        </label>
                    ))}
                </div>
            </div>

            {ds.anchor === 'rolling_n' && (
                <label className="block">
                    <span className="text-[11px] text-gray-400">Rolling window size</span>
                    <input type="number" value={ds.rollingN || 20}
                        onChange={(e) => set({ rollingN: parseInt(e.target.value) || 20 })}
                        className="mt-1 w-32 bg-[#1e222d] border border-white/[0.08] rounded px-3 py-2 text-sm text-white outline-none focus:border-[#2962FF]" />
                </label>
            )}
        </div>
    );
};

export default StepDataSource;
```

- [ ] **Step 2: Wire into router**

Add `{step === 3 && <StepDataSource model={model} update={update} />}`.

- [ ] **Step 3: Verify in browser**

Switch timeframes (custom reveals input), switch anchors (rolling_n reveals input).

- [ ] **Step 4: Commit**

```bash
git add src/components/market-chart/visual-indicator-builder/
git commit -m "feat(indicator-builder): Step 3 (Data Source)"
```

---

## Task 6: Create the preset library and Step 4 — Levels

**Files:**
- Create: `src/components/market-chart/visual-indicator-builder/presets.ts`
- Create: `src/components/market-chart/visual-indicator-builder/steps/StepLevels.tsx`
- Modify: `src/components/market-chart/visual-indicator-builder/IndicatorVisualBuilder.tsx`

- [ ] **Step 1: Write `presets.ts`**

```typescript
import { LevelRecipe } from './types';

export interface LevelPreset {
    id: string;
    label: string;
    description: string;
    recipe: LevelRecipe;
    defaultColor: string;
}

export const LEVEL_PRESETS: LevelPreset[] = [
    {
        id: 'above_open_atr',
        label: 'Above Open (ATR)',
        description: "open + k × ATR — typical buy anchor",
        recipe: { base: 'open', sign: '+', multiplier: 0.5, offsetSource: 'atr', offsetParam: '14' },
        defaultColor: '#22c55e',
    },
    {
        id: 'below_open_atr',
        label: 'Below Open (ATR)',
        description: "open - k × ATR — typical sell anchor",
        recipe: { base: 'open', sign: '-', multiplier: 0.5, offsetSource: 'atr', offsetParam: '14' },
        defaultColor: '#ef4444',
    },
    {
        id: 'session_high',
        label: 'Session High',
        description: 'high of the current HTF window',
        recipe: { base: 'high', sign: '+', multiplier: 0, offsetSource: 'none' },
        defaultColor: '#f59e0b',
    },
    {
        id: 'session_low',
        label: 'Session Low',
        description: 'low of the current HTF window',
        recipe: { base: 'low', sign: '+', multiplier: 0, offsetSource: 'none' },
        defaultColor: '#f59e0b',
    },
    {
        id: 'prev_close_percent',
        label: 'Previous Close + %',
        description: 'previous close shifted by a percentage',
        recipe: { base: 'close', sign: '+', multiplier: 1, offsetSource: 'percent' },
        defaultColor: '#8b5cf6',
    },
    {
        id: 'pivot',
        label: 'Pivot (HLC/3)',
        description: 'classic pivot: (high + low + close) / 3',
        recipe: { base: 'hlc3', sign: '+', multiplier: 0, offsetSource: 'none' },
        defaultColor: '#06b6d4',
    },
    {
        id: 'custom',
        label: 'Custom',
        description: 'build from scratch',
        recipe: { base: 'close', sign: '+', multiplier: 0, offsetSource: 'none' },
        defaultColor: '#60a5fa',
    },
];

export const getPreset = (id: string) => LEVEL_PRESETS.find((p) => p.id === id) || LEVEL_PRESETS[LEVEL_PRESETS.length - 1];
```

- [ ] **Step 2: Write `StepLevels.tsx`**

List of level cards; each has preset dropdown, name/title inputs, recipe row (base, sign, multiplier, ×, offset source, offset param), color picker, line style dropdown, remove button. "Add Level" at bottom.

```tsx
import React from 'react';
import { IndicatorModel, LevelDef, OhlcBase, OffsetSource } from '../types';
import { LEVEL_PRESETS, getPreset } from '../presets';

interface Props {
    model: IndicatorModel;
    update: (patch: Partial<IndicatorModel>) => void;
}

const BASES: { value: OhlcBase; label: string }[] = [
    { value: 'open', label: 'Open' },
    { value: 'high', label: 'High' },
    { value: 'low', label: 'Low' },
    { value: 'close', label: 'Close' },
    { value: 'hl2', label: '(H+L)/2' },
    { value: 'hlc3', label: '(H+L+C)/3' },
    { value: 'ohlc4', label: '(O+H+L+C)/4' },
];

const OFFSETS: { value: OffsetSource; label: string }[] = [
    { value: 'none', label: '—' },
    { value: 'atr', label: 'ATR' },
    { value: 'range', label: 'Range' },
    { value: 'points', label: 'Points' },
    { value: 'percent', label: '%' },
];

const makeLevel = (): LevelDef => {
    const preset = LEVEL_PRESETS[0];
    return {
        id: `lv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: 'BA',
        title: 'Buy Anchor',
        presetId: preset.id,
        recipe: { ...preset.recipe },
        color: preset.defaultColor,
        lineStyle: 'solid',
    };
};

const StepLevels: React.FC<Props> = ({ model, update }) => {
    const add = () => update({ levels: [...model.levels, makeLevel()] });
    const patch = (id: string, p: Partial<LevelDef>) =>
        update({ levels: model.levels.map((x) => (x.id === id ? { ...x, ...p } : x)) });
    const patchRecipe = (id: string, p: Partial<LevelDef['recipe']>) =>
        update({ levels: model.levels.map((x) => (x.id === id ? { ...x, recipe: { ...x.recipe, ...p }, presetId: 'custom' } : x)) });
    const remove = (id: string) => update({ levels: model.levels.filter((x) => x.id !== id) });

    const applyPreset = (id: string, presetId: string) => {
        const preset = getPreset(presetId);
        patch(id, { presetId, recipe: { ...preset.recipe }, color: preset.defaultColor });
    };

    return (
        <div className="max-w-4xl">
            <h2 className="text-sm font-semibold text-white mb-1">Levels</h2>
            <p className="text-xs text-gray-500 mb-4">Define the price levels this indicator computes and draws.</p>

            <div className="space-y-3">
                {model.levels.map((lv) => (
                    <div key={lv.id} className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 space-y-2">
                        <div className="flex items-center gap-2">
                            <input value={lv.name} placeholder="BA" maxLength={8}
                                onChange={(e) => patch(lv.id, { name: e.target.value.replace(/[^a-zA-Z0-9]/g, '') })}
                                className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-white w-16 font-mono" />
                            <input value={lv.title} placeholder="Buy Anchor"
                                onChange={(e) => patch(lv.id, { title: e.target.value })}
                                className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-white flex-1" />
                            <select value={lv.presetId} onChange={(e) => applyPreset(lv.id, e.target.value)}
                                className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-purple-300">
                                {LEVEL_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                            </select>
                            <input type="color" value={lv.color}
                                onChange={(e) => patch(lv.id, { color: e.target.value })}
                                className="w-8 h-7 rounded cursor-pointer" />
                            <select value={lv.lineStyle}
                                onChange={(e) => patch(lv.id, { lineStyle: e.target.value as any })}
                                className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-white">
                                <option value="solid">solid</option>
                                <option value="dashed">dashed</option>
                                <option value="dotted">dotted</option>
                            </select>
                            <button type="button" onClick={() => remove(lv.id)}
                                className="text-gray-500 hover:text-red-400">×</button>
                        </div>

                        <div className="flex items-center gap-2 pl-1 text-xs text-gray-400">
                            <span>Recipe:</span>
                            <select value={lv.recipe.base}
                                onChange={(e) => patchRecipe(lv.id, { base: e.target.value as OhlcBase })}
                                className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-white">
                                {BASES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                            </select>
                            <select value={lv.recipe.sign}
                                onChange={(e) => patchRecipe(lv.id, { sign: e.target.value as '+' | '-' })}
                                className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-purple-300 font-bold">
                                <option value="+">+</option>
                                <option value="-">−</option>
                            </select>
                            <input type="number" value={String(lv.recipe.multiplier)}
                                onChange={(e) => patchRecipe(lv.id, { multiplier: parseFloat(e.target.value) || 0 })}
                                className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-white w-20" />
                            <span className="text-gray-500">×</span>
                            <select value={lv.recipe.offsetSource}
                                onChange={(e) => patchRecipe(lv.id, { offsetSource: e.target.value as OffsetSource })}
                                className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-white">
                                {OFFSETS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                            {(lv.recipe.offsetSource === 'atr' || lv.recipe.offsetSource === 'range') && (
                                <input type="text" value={lv.recipe.offsetParam || ''} placeholder="period"
                                    onChange={(e) => patchRecipe(lv.id, { offsetParam: e.target.value })}
                                    className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-xs text-white w-16" />
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <button type="button" onClick={add}
                className="mt-3 w-full py-2 border border-dashed border-white/10 rounded-lg text-xs text-gray-400 hover:bg-white/5">
                + Add Level
            </button>
        </div>
    );
};

export default StepLevels;
```

- [ ] **Step 3: Wire into router**

Add `{step === 4 && <StepLevels model={model} update={update} />}`.

- [ ] **Step 4: Verify in browser**

Add levels, pick presets, edit recipe fields, change color, change line style, remove. Picking a preset autofills; editing recipe flips preset to "Custom".

- [ ] **Step 5: Commit**

```bash
git add src/components/market-chart/visual-indicator-builder/
git commit -m "feat(indicator-builder): Step 4 (Levels) + preset library"
```

---

## Task 7: Implement Step 5 — Patterns matrix

**Files:**
- Create: `src/components/market-chart/visual-indicator-builder/steps/StepPatterns.tsx`
- Modify: `src/components/market-chart/visual-indicator-builder/IndicatorVisualBuilder.tsx`

- [ ] **Step 1: Write `StepPatterns.tsx`**

Matrix table: levels down the left, 5 pattern columns (FR/FB/TW/BF/SR). Each cell has two toggles (buy, sell). Enabling any side sets `enabled: true`.

```tsx
import React from 'react';
import { IndicatorModel, PatternType, PatternCell } from '../types';

interface Props {
    model: IndicatorModel;
    update: (patch: Partial<IndicatorModel>) => void;
}

const PATTERNS: { type: PatternType; label: string; full: string }[] = [
    { type: 'fr', label: 'FR', full: 'False Rejection' },
    { type: 'fb', label: 'FB', full: 'False Breakout' },
    { type: 'tw', label: 'TW', full: 'Two-Wick Rejection' },
    { type: 'bf', label: 'BF', full: 'Breakout + Follow-through' },
    { type: 'sr', label: 'SR', full: 'Single Rejection' },
];

const emptyCell = (): PatternCell => ({ enabled: false, sides: { buy: false, sell: false } });

const StepPatterns: React.FC<Props> = ({ model, update }) => {
    const getCell = (levelId: string, type: PatternType): PatternCell =>
        model.patternMatrix[levelId]?.[type] || emptyCell();

    const setSide = (levelId: string, type: PatternType, side: 'buy' | 'sell', on: boolean) => {
        const current = getCell(levelId, type);
        const newSides = { ...current.sides, [side]: on };
        const newCell: PatternCell = { sides: newSides, enabled: newSides.buy || newSides.sell };
        const levelRow = { ...(model.patternMatrix[levelId] || {}), [type]: newCell };
        update({ patternMatrix: { ...model.patternMatrix, [levelId]: levelRow as any } });
    };

    if (model.levels.length === 0) {
        return <div className="text-xs text-gray-500 italic">Add levels in Step 4 first.</div>;
    }

    return (
        <div className="max-w-5xl">
            <h2 className="text-sm font-semibold text-white mb-1">Patterns</h2>
            <p className="text-xs text-gray-500 mb-4">Tick which patterns fire on which levels. Each cell has separate Buy and Sell toggles.</p>

            <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="bg-white/[0.04]">
                            <th className="text-left px-3 py-2 text-gray-400 font-semibold">Level</th>
                            {PATTERNS.map((p) => (
                                <th key={p.type} className="text-center px-2 py-2 text-gray-400 font-semibold" title={p.full}>
                                    {p.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {model.levels.map((lv) => (
                            <tr key={lv.id} className="border-t border-white/[0.04]">
                                <td className="px-3 py-2 text-white font-mono">{lv.name}</td>
                                {PATTERNS.map((p) => {
                                    const cell = getCell(lv.id, p.type);
                                    return (
                                        <td key={p.type} className="px-2 py-2 text-center">
                                            <div className="inline-flex gap-1">
                                                <button type="button"
                                                    onClick={() => setSide(lv.id, p.type, 'buy', !cell.sides.buy)}
                                                    className={`w-6 h-5 text-[9px] font-bold rounded ${
                                                        cell.sides.buy ? 'bg-emerald-500/30 text-emerald-300' : 'bg-white/5 text-gray-600 hover:bg-white/10'
                                                    }`}>B</button>
                                                <button type="button"
                                                    onClick={() => setSide(lv.id, p.type, 'sell', !cell.sides.sell)}
                                                    className={`w-6 h-5 text-[9px] font-bold rounded ${
                                                        cell.sides.sell ? 'bg-red-500/30 text-red-300' : 'bg-white/5 text-gray-600 hover:bg-white/10'
                                                    }`}>S</button>
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default StepPatterns;
```

- [ ] **Step 2: Wire into router**

Add `{step === 5 && <StepPatterns model={model} update={update} />}`.

- [ ] **Step 3: Verify in browser**

Add a few levels in Step 4, go to Step 5. Toggle B/S cells. Navigate away and back, values persist.

- [ ] **Step 4: Commit**

```bash
git add src/components/market-chart/visual-indicator-builder/
git commit -m "feat(indicator-builder): Step 5 (Patterns matrix)"
```

---

## Task 8: Implement Step 6 — Alerts

**Files:**
- Create: `src/components/market-chart/visual-indicator-builder/steps/StepAlerts.tsx`
- Modify: `src/components/market-chart/visual-indicator-builder/IndicatorVisualBuilder.tsx`

- [ ] **Step 1: Write `StepAlerts.tsx`**

Derives auto-generated alert rows from `patternMatrix` on mount/change, merges with user-added custom rows. Auto rows have editable title/message but no delete button. Custom rows are fully editable/removable.

```tsx
import React, { useMemo } from 'react';
import { IndicatorModel, AlertRow, PatternType, AlertTrigger } from '../types';

interface Props {
    model: IndicatorModel;
    update: (patch: Partial<IndicatorModel>) => void;
}

const PATTERN_TITLE: Record<PatternType, string> = {
    fr: 'False Rejection', fb: 'False Breakout', tw: 'Two-Wick', bf: 'Breakout + Follow', sr: 'Single Rejection',
};

const deriveAutoAlerts = (model: IndicatorModel): AlertRow[] => {
    const rows: AlertRow[] = [];
    for (const lv of model.levels) {
        const row = model.patternMatrix[lv.id] || {};
        for (const type of Object.keys(row) as PatternType[]) {
            const cell = row[type];
            if (!cell?.enabled) continue;
            if (cell.sides.buy) rows.push({
                id: `auto-${lv.id}-${type}-buy`,
                trigger: { kind: 'pattern', levelId: lv.id, pattern: type, side: 'buy' },
                title: `${PATTERN_TITLE[type]} Buy — ${lv.name}`,
                message: `{symbol}: ${PATTERN_TITLE[type]} Buy on ${lv.title} @ {price}`,
                autoGenerated: true,
            });
            if (cell.sides.sell) rows.push({
                id: `auto-${lv.id}-${type}-sell`,
                trigger: { kind: 'pattern', levelId: lv.id, pattern: type, side: 'sell' },
                title: `${PATTERN_TITLE[type]} Sell — ${lv.name}`,
                message: `{symbol}: ${PATTERN_TITLE[type]} Sell on ${lv.title} @ {price}`,
                autoGenerated: true,
            });
        }
    }
    return rows;
};

const StepAlerts: React.FC<Props> = ({ model, update }) => {
    const autoAlerts = useMemo(() => deriveAutoAlerts(model), [model]);
    // Preserve user edits to auto titles/messages if they exist in model.alerts
    const mergedAuto = autoAlerts.map((auto) => {
        const prior = model.alerts.find((a) => a.id === auto.id);
        return prior ? { ...auto, title: prior.title, message: prior.message } : auto;
    });
    const customAlerts = model.alerts.filter((a) => !a.autoGenerated);

    const patchRow = (id: string, p: Partial<AlertRow>) => {
        // store overrides only (auto rows with modified title/message)
        const allRows = [...mergedAuto, ...customAlerts].map((r) => (r.id === id ? { ...r, ...p } : r));
        update({ alerts: allRows });
    };
    const removeCustom = (id: string) => update({ alerts: model.alerts.filter((a) => a.id !== id) });
    const addCustom = () => {
        const trigger: AlertTrigger = model.levels[0]
            ? { kind: 'cross_level', levelId: model.levels[0].id, direction: 'above' }
            : { kind: 'new_window' };
        update({
            alerts: [...model.alerts, {
                id: `custom-${Date.now()}`,
                trigger,
                title: 'Custom Alert',
                message: '{symbol}: custom alert at {price}',
                autoGenerated: false,
            }],
        });
    };

    return (
        <div className="max-w-4xl">
            <h2 className="text-sm font-semibold text-white mb-1">Alerts</h2>
            <p className="text-xs text-gray-500 mb-4">Pattern alerts auto-populate from Step 5. Add custom alerts below for non-pattern events.</p>

            <div className="mb-5">
                <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Auto-generated ({mergedAuto.length})</h3>
                <div className="space-y-1.5">
                    {mergedAuto.map((row) => (
                        <div key={row.id} className="bg-emerald-500/5 border border-emerald-500/20 rounded px-3 py-2 flex items-center gap-2">
                            <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded">AUTO</span>
                            <input value={row.title} onChange={(e) => patchRow(row.id, { title: e.target.value })}
                                className="bg-transparent text-xs text-white border-b border-white/[0.08] flex-1 outline-none focus:border-[#2962FF]" />
                            <input value={row.message} onChange={(e) => patchRow(row.id, { message: e.target.value })}
                                className="bg-transparent text-[11px] text-gray-400 border-b border-white/[0.08] flex-[2] outline-none focus:border-[#2962FF]" />
                        </div>
                    ))}
                    {mergedAuto.length === 0 && (
                        <div className="text-xs text-gray-500 italic">No pattern alerts — enable patterns in Step 5.</div>
                    )}
                </div>
            </div>

            <div>
                <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Custom ({customAlerts.length})</h3>
                <div className="space-y-1.5">
                    {customAlerts.map((row) => (
                        <div key={row.id} className="bg-white/[0.03] border border-white/[0.06] rounded px-3 py-2 flex items-center gap-2">
                            <select value={row.trigger.kind}
                                onChange={(e) => {
                                    const kind = e.target.value as AlertTrigger['kind'];
                                    const trigger: AlertTrigger = kind === 'cross_level' ? { kind, levelId: model.levels[0]?.id || '', direction: 'above' }
                                        : kind === 'breakout_close' ? { kind, levelId: model.levels[0]?.id || '', direction: 'above' }
                                        : { kind: 'new_window' };
                                    patchRow(row.id, { trigger });
                                }}
                                className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-[11px] text-white">
                                <option value="cross_level">Crosses Level</option>
                                <option value="breakout_close">Breakout + Close</option>
                                <option value="new_window">New HTF Window</option>
                            </select>
                            {(row.trigger.kind === 'cross_level' || row.trigger.kind === 'breakout_close') && (
                                <>
                                    <select value={row.trigger.levelId}
                                        onChange={(e) => patchRow(row.id, { trigger: { ...row.trigger, levelId: e.target.value } as AlertTrigger })}
                                        className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-[11px] text-white">
                                        {model.levels.map((lv) => <option key={lv.id} value={lv.id}>{lv.name}</option>)}
                                    </select>
                                    <select value={row.trigger.direction}
                                        onChange={(e) => patchRow(row.id, { trigger: { ...row.trigger, direction: e.target.value as any } as AlertTrigger })}
                                        className="bg-[#1e222d] border border-white/[0.08] rounded px-2 py-1 text-[11px] text-white">
                                        <option value="above">above</option>
                                        <option value="below">below</option>
                                        {row.trigger.kind === 'cross_level' && <option value="touch">touch</option>}
                                    </select>
                                </>
                            )}
                            <input value={row.title} onChange={(e) => patchRow(row.id, { title: e.target.value })}
                                className="bg-transparent text-xs text-white border-b border-white/[0.08] flex-1 outline-none focus:border-[#2962FF]" />
                            <input value={row.message} onChange={(e) => patchRow(row.id, { message: e.target.value })}
                                className="bg-transparent text-[11px] text-gray-400 border-b border-white/[0.08] flex-[2] outline-none focus:border-[#2962FF]" />
                            <button type="button" onClick={() => removeCustom(row.id)}
                                className="text-gray-500 hover:text-red-400">×</button>
                        </div>
                    ))}
                </div>

                <button type="button" onClick={addCustom}
                    className="mt-3 w-full py-2 border border-dashed border-white/10 rounded-lg text-xs text-gray-400 hover:bg-white/5">
                    + Add Alert
                </button>
            </div>

            <p className="text-[10px] text-gray-600 mt-4">Placeholders: <code>{'{symbol}'}</code>, <code>{'{price}'}</code>, <code>{'{level}'}</code></p>
        </div>
    );
};

export default StepAlerts;
```

- [ ] **Step 2: Wire into router**

Add `{step === 6 && <StepAlerts model={model} update={update} />}`.

- [ ] **Step 3: Verify in browser**

Enable pattern cells in Step 5 → return to Step 6 and see them as AUTO rows. Edit auto titles (persists). Add custom alerts, switch triggers, remove. Navigate away/back persists.

- [ ] **Step 4: Commit**

```bash
git add src/components/market-chart/visual-indicator-builder/
git commit -m "feat(indicator-builder): Step 6 (Alerts)"
```

---

## Task 9: Write `patterns.ts` helper function templates

**Files:**
- Create: `src/components/market-chart/visual-indicator-builder/patterns.ts`

- [ ] **Step 1: Write the helper library**

These are Kuri source snippets the codegen injects when any pattern of that type is used, keyed by pattern type. Buy/sell versions are separate functions for use as `f_falseRejBuy(level)`, etc. Mirror the Strategy Visual Builder's helper generation from `helperDefs` in `visual-builder/VisualBuilder.tsx`.

```typescript
import { PatternType } from './types';

// Each entry: the full Kuri source for both buy and sell helpers of a pattern type.
// Helpers are named f_<patternBuy>, f_<patternSell>, and take one argument: the level value.
export const PATTERN_HELPERS: Record<PatternType, string> = {
    fr: `
// False Rejection — price touches level but closes back on origin side
f_falseRejBuy(level) =>
    low <= level and close > level and close > open

f_falseRejSell(level) =>
    high >= level and close < level and close < open
`.trim(),

    fb: `
// False Breakout — price closes beyond level then reverses
f_falseBrkBuy(level) =>
    low[1] < level and close[1] < level and close > level

f_falseBrkSell(level) =>
    high[1] > level and close[1] > level and close < level
`.trim(),

    tw: `
// Two-Wick Rejection — two consecutive bars wick through level
f_twoWickBuy(level) =>
    low[1] <= level and low <= level and close > level and close[1] > level

f_twoWickSell(level) =>
    high[1] >= level and high >= level and close < level and close[1] < level
`.trim(),

    bf: `
// Breakout + Follow-through — break level and next bar continues
f_bofBuy(level) =>
    close[1] > level and low[1] <= level and close > close[1]

f_bofSell(level) =>
    close[1] < level and high[1] >= level and close < close[1]
`.trim(),

    sr: `
// Single Rejection — one strong wick touches and rejects
f_singleRejBuy(level) =>
    low <= level and close > level and (open - low) > (high - close) * 1.5

f_singleRejSell(level) =>
    high >= level and close < level and (high - open) > (close - low) * 1.5
`.trim(),
};

export const helperFnNames = (type: PatternType, side: 'buy' | 'sell') => {
    const map: Record<string, string> = {
        'fr-buy': 'f_falseRejBuy', 'fr-sell': 'f_falseRejSell',
        'fb-buy': 'f_falseBrkBuy', 'fb-sell': 'f_falseBrkSell',
        'tw-buy': 'f_twoWickBuy', 'tw-sell': 'f_twoWickSell',
        'bf-buy': 'f_bofBuy', 'bf-sell': 'f_bofSell',
        'sr-buy': 'f_singleRejBuy', 'sr-sell': 'f_singleRejSell',
    };
    return map[`${type}-${side}`];
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/market-chart/visual-indicator-builder/patterns.ts
git commit -m "feat(indicator-builder): pattern helper templates"
```

---

## Task 10: Implement `codegen.ts`

**Files:**
- Create: `src/components/market-chart/visual-indicator-builder/codegen.ts`

- [ ] **Step 1: Write the code generator**

```typescript
import { IndicatorModel, LevelDef, ParameterDef, OffsetSource, OhlcBase, PatternType } from './types';
import { PATTERN_HELPERS, helperFnNames } from './patterns';

const ohlcExpr = (base: OhlcBase): string => {
    switch (base) {
        case 'hl2': return '(high + low) / 2';
        case 'hlc3': return '(high + low + close) / 3';
        case 'ohlc4': return '(open + high + low + close) / 4';
        default: return base;
    }
};

const offsetExpr = (src: OffsetSource, period?: string): string => {
    switch (src) {
        case 'atr': return `kuri.atr(${period || '14'})`;
        case 'range': return `kuri.highest(high, ${period || '14'}) - kuri.lowest(low, ${period || '14'})`;
        case 'points': return '1';
        case 'percent': return 'close / 100';
        default: return '0';
    }
};

const levelExpr = (lv: LevelDef, params: ParameterDef[]): string => {
    const base = ohlcExpr(lv.recipe.base);
    if (lv.recipe.offsetSource === 'none' || lv.recipe.multiplier === 0) return base;
    // multiplier can be a param name
    const mult = typeof lv.recipe.multiplier === 'string' && params.some((p) => p.varName === lv.recipe.multiplier)
        ? lv.recipe.multiplier
        : String(lv.recipe.multiplier);
    const offset = offsetExpr(lv.recipe.offsetSource, lv.recipe.offsetParam);
    return `${base} ${lv.recipe.sign} ${mult} * (${offset})`;
};

const paramLine = (p: ParameterDef): string => {
    if (p.locked) return `${p.varName} = ${JSON.stringify(p.defaultValue)}`;
    const parts: string[] = [];
    parts.push(JSON.stringify(p.defaultValue).replace(/"/g, ''));
    parts.push(`title="${p.title}"`);
    if (p.min !== undefined) parts.push(`minval=${p.min}`);
    if (p.max !== undefined) parts.push(`maxval=${p.max}`);
    return `${p.varName} = param.${p.type}(${parts.join(', ')})`;
};

const htfBoilerplate = (model: IndicatorModel): string => {
    const { timeframe, anchor, customTf, rollingN } = model.dataSource;
    if (timeframe === 'current' && anchor !== 'rolling_n') return '';
    if (anchor === 'rolling_n') {
        const n = rollingN || 20;
        return `// Rolling ${n}-bar anchor\n_winHigh = kuri.highest(high, ${n})\n_winLow = kuri.lowest(low, ${n})`;
    }
    const tf = timeframe === 'custom' ? (customTf || 'D') : timeframe === 'prev_session' ? 'D' : timeframe[0].toUpperCase();
    return `// HTF anchor: ${timeframe}${anchor === 'prev_window_close' ? ' (previous close)' : ''}\n_htfOpen = request.security("${tf}", open)\n_htfHigh = request.security("${tf}", high)\n_htfLow = request.security("${tf}", low)\n_htfClose = request.security("${tf}", close)`;
};

const plotShapeLine = (levelName: string, side: 'buy' | 'sell', patternLabel: string): string => {
    const loc = side === 'buy' ? 'plotshape.belowbar' : 'plotshape.abovebar';
    const color = side === 'buy' ? '#22c55e' : '#ef4444';
    const text = `${patternLabel}${side === 'buy' ? '↑' : '↓'}`;
    return `plotshape(${levelName}_${patternLabel.toLowerCase()}_${side}, location=${loc}, color="${color}", text="${text}")`;
};

export function generateKuri(model: IndicatorModel): string {
    const lines: string[] = [];

    // Frontmatter
    lines.push('---');
    lines.push(`name: ${model.info.name}`);
    lines.push(`shortname: ${model.info.shortname}`);
    lines.push(`overlay: ${model.info.overlay}`);
    lines.push('---');
    lines.push('');

    // Params
    if (model.parameters.length > 0) {
        lines.push('// ── Parameters ──');
        for (const p of model.parameters) lines.push(paramLine(p));
        lines.push('');
    }

    // HTF boilerplate
    const htf = htfBoilerplate(model);
    if (htf) { lines.push(htf); lines.push(''); }

    // Level calculations
    if (model.levels.length > 0) {
        lines.push('// ── Levels ──');
        for (const lv of model.levels) {
            lines.push(`${lv.name} = ${levelExpr(lv, model.parameters)}`);
        }
        lines.push('');
        // Draw levels
        for (const lv of model.levels) {
            lines.push(`mark.level(${lv.name}, title="${lv.title}", color="${lv.color}", style=mark.style_${lv.lineStyle})`);
        }
        lines.push('');
    }

    // Pattern helpers (only inject used ones)
    const usedPatterns = new Set<PatternType>();
    for (const levelRow of Object.values(model.patternMatrix)) {
        for (const [type, cell] of Object.entries(levelRow)) {
            if (cell.enabled) usedPatterns.add(type as PatternType);
        }
    }
    if (usedPatterns.size > 0) {
        lines.push('// ── Pattern Helpers ──');
        for (const t of usedPatterns) lines.push(PATTERN_HELPERS[t]);
        lines.push('');
    }

    // Pattern triggers & plotshapes
    if (usedPatterns.size > 0) {
        lines.push('// ── Pattern Triggers ──');
        for (const lv of model.levels) {
            const row = model.patternMatrix[lv.id] || {};
            for (const type of Object.keys(row) as PatternType[]) {
                const cell = row[type];
                if (!cell.enabled) continue;
                if (cell.sides.buy) {
                    const fn = helperFnNames(type, 'buy');
                    const varName = `${lv.name}_${type}_buy`;
                    lines.push(`${varName} = ${fn}(${lv.name})`);
                    lines.push(plotShapeLine(lv.name, 'buy', type.toUpperCase()));
                }
                if (cell.sides.sell) {
                    const fn = helperFnNames(type, 'sell');
                    const varName = `${lv.name}_${type}_sell`;
                    lines.push(`${varName} = ${fn}(${lv.name})`);
                    lines.push(plotShapeLine(lv.name, 'sell', type.toUpperCase()));
                }
            }
        }
        lines.push('');
    }

    // Alerts
    if (model.alerts.length > 0) {
        lines.push('// ── Alerts ──');
        for (const a of model.alerts) {
            if (a.trigger.kind === 'pattern') {
                const varName = `${model.levels.find((l) => l.id === a.trigger.levelId)?.name}_${a.trigger.pattern}_${a.trigger.side}`;
                lines.push(`kuri.alert(${varName}, title="${a.title}", message="${a.message}")`);
            } else if (a.trigger.kind === 'cross_level') {
                const lvName = model.levels.find((l) => l.id === a.trigger.levelId)?.name;
                const fn = a.trigger.direction === 'above' ? 'kuri.crossover' : a.trigger.direction === 'below' ? 'kuri.crossunder' : null;
                const cond = fn ? `${fn}(close, ${lvName})` : `math.abs(close - ${lvName}) < syminfo.mintick`;
                lines.push(`_cross_${a.id} = ${cond}`);
                lines.push(`kuri.alert(_cross_${a.id}, title="${a.title}", message="${a.message}")`);
            } else if (a.trigger.kind === 'breakout_close') {
                const lvName = model.levels.find((l) => l.id === a.trigger.levelId)?.name;
                const op = a.trigger.direction === 'above' ? '>' : '<';
                lines.push(`_bk_${a.id} = close ${op} ${lvName} and close[1] ${op === '>' ? '<=' : '>='} ${lvName}`);
                lines.push(`kuri.alert(_bk_${a.id}, title="${a.title}", message="${a.message}")`);
            } else if (a.trigger.kind === 'new_window') {
                lines.push(`_newwin_${a.id} = ta.change(time("${model.dataSource.timeframe === 'custom' ? (model.dataSource.customTf || 'D') : 'D'}")) != 0`);
                lines.push(`kuri.alert(_newwin_${a.id}, title="${a.title}", message="${a.message}")`);
            }
        }
    }

    return lines.join('\n');
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/market-chart/visual-indicator-builder/codegen.ts
git commit -m "feat(indicator-builder): codegen for .kuri output"
```

---

## Task 11: Wire codegen into live Monaco sync + Step 7 Review

**Files:**
- Create: `src/components/market-chart/visual-indicator-builder/steps/StepReview.tsx`
- Modify: `src/components/market-chart/visual-indicator-builder/IndicatorVisualBuilder.tsx`

- [ ] **Step 1: Write `StepReview.tsx`**

Shows a read-only preview of the generated source using a `<pre>` block (Monaco already hosts the editable version behind the toggle).

```tsx
import React from 'react';
import { IndicatorModel } from '../types';
import { generateKuri } from '../codegen';

interface Props { model: IndicatorModel; }

const StepReview: React.FC<Props> = ({ model }) => {
    const source = generateKuri(model);
    return (
        <div className="max-w-4xl">
            <h2 className="text-sm font-semibold text-white mb-1">Review</h2>
            <p className="text-xs text-gray-500 mb-4">This is the Kuri source your builder will emit. Toggle to Code mode to edit freely.</p>
            <pre className="bg-[#0b0b0f] border border-white/[0.06] rounded-lg p-4 text-[11px] text-gray-200 font-mono overflow-auto max-h-[60vh]">
                {source}
            </pre>
        </div>
    );
};

export default StepReview;
```

- [ ] **Step 2: Wire into router AND add live Monaco sync**

In `IndicatorVisualBuilder.tsx`, add a `useEffect` that regenerates source on every model change and calls `onSourceChange`:

```tsx
import { generateKuri } from './codegen';
// …
useEffect(() => {
    onSourceChange(generateKuri(model));
}, [model, onSourceChange]);
```

Add `{step === 7 && <StepReview model={model} />}` to the router.

- [ ] **Step 3: Verify in browser**

Build an indicator end-to-end: Info → Parameters (add `length` int 14) → Data Source (Daily, window_open) → Levels (add BA = Above Open ATR) → Patterns (tick FR Buy on BA) → Alerts (edit auto title) → Review (see generated code). Toggle to Code mode — Monaco shows the same source. Toggle back — builder state intact.

- [ ] **Step 4: Commit**

```bash
git add src/components/market-chart/visual-indicator-builder/
git commit -m "feat(indicator-builder): Step 7 (Review) + live Monaco sync"
```

---

## Task 12: Wire up Back/Next navigation + parser hydration for open-existing

**Files:**
- Modify: `src/components/market-chart/visual-indicator-builder/IndicatorVisualBuilder.tsx`

- [ ] **Step 1: Add Back/Next footer**

Mirror the Strategy Visual Builder footer:

```tsx
<div className="flex items-center justify-between px-6 py-3 border-t border-white/5 bg-[#0a0a0f] flex-shrink-0">
    <button type="button" onClick={() => setStep((s) => Math.max(s - 1, 1))}
        disabled={step === 1}
        className="text-xs text-gray-400 hover:text-white disabled:opacity-30">← Back</button>
    <span className="text-[10px] text-gray-600">Step {step} of 7</span>
    {step < 7 ? (
        <button type="button" onClick={() => setStep((s) => Math.min(s + 1, 7))}
            className="px-3 py-1.5 bg-[#2962FF] hover:bg-[#2962FF]/90 text-xs font-medium text-white rounded">Next →</button>
    ) : (
        <div className="w-[60px]" />
    )}
</div>
```

- [ ] **Step 2: Hydrate model from `initialSource` prop via kuriSourceParser**

```tsx
import { parseKuriSource } from '../../strategy-studio/visual-builder/kuriSourceParser';

useEffect(() => {
    if (!initialSource) return;
    const parsed = parseKuriSource(initialSource);
    // Best-effort hydration: populate parameters from parsed.params (levels/patterns need richer parsing, skip for v1)
    setModel((prev) => ({
        ...prev,
        parameters: parsed.params.map((p, i) => ({
            id: `p-hydrated-${i}`,
            varName: p.varName,
            title: p.title,
            type: p.type as any,
            defaultValue: p.defaultValue,
            min: p.min,
            max: p.max,
            options: p.options,
            locked: false,
        })),
    }));
    // Deliberately one-shot: only hydrate on first mount with initialSource
    // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

- [ ] **Step 3: Verify in browser**

Open an existing indicator (e.g. SMA from the Open modal). Toggle to Visual mode. Step 2 should show the hydrated `length` parameter. Navigate forward/back via the footer.

- [ ] **Step 4: Commit**

```bash
git add src/components/market-chart/visual-indicator-builder/IndicatorVisualBuilder.tsx
git commit -m "feat(indicator-builder): Back/Next nav + parser hydration"
```

---

## Task 13: End-to-end MFL rebuild acceptance test (manual)

**Files:** no code changes — this is a manual acceptance check.

- [ ] **Step 1: Rebuild MFL from scratch in the Visual Builder**

In Visual mode:
- **Info:** name "MFL Rebuild", shortname "MFL2", overlay on
- **Parameters:** add `atrPeriod` int default 14, `mult` float default 0.5
- **Data Source:** Daily, window's open anchor
- **Levels:** add 4: BA (Above Open ATR, mult=mult), SB (Below Open ATR, mult=mult), RS (Session High), RSL (Above Session High, +0.25*ATR)
- **Patterns:** enable FR buy/sell on BA & SB, FB buy/sell on RS & RSL
- **Alerts:** accept auto-generated; add one custom "cross_level" on BA direction=above
- **Review:** eyeball the generated source

- [ ] **Step 2: Validate the generated source**

Toggle to Code mode. The validator already runs on edit. Expected: 0 or clearly-diagnosable errors. Any error here indicates a codegen bug — fix in `codegen.ts` and re-verify.

- [ ] **Step 3: Save as new indicator**

Click Save, give it a name, confirm it appears in the "My Indicators" list and loads back into the builder (parameters hydrate via Task 12).

- [ ] **Step 4: Commit acceptance notes if any fixes were needed**

```bash
git add .
git commit -m "fix(indicator-builder): codegen/hydration fixes from MFL acceptance"
```

---

## Self-Review Notes

**Spec coverage check:**
- Info (step 1): Task 3 ✓
- Parameters (step 2): Task 4 ✓
- Data Source + HTF + anchor (step 3): Task 5 ✓
- Levels with presets + recipe (step 4): Task 6 ✓
- Pattern matrix (step 5): Task 7 ✓
- Alerts auto + custom (step 6): Task 8 ✓
- Review + codegen (step 7): Tasks 9, 10, 11 ✓
- Shell reuse / wizard: Task 1 scaffolding ✓
- Parser round-trip hydration: Task 12 ✓
- Visual/Code toggle: Task 2 ✓
- MFL acceptance: Task 13 ✓

**Known v1 limitations (intentional, documented in spec):**
- Parser hydration only round-trips parameters, not levels/patterns/alerts (levels need much richer parsing; out of scope for v1).
- Levels use `mark.level()` not `line.new()`. MFL's source uses `line.new()` for dynamic HTF-rollover redraws. v1 generated output uses `mark.level()` which Kuri renders as static horizontal level lines — functionally equivalent for display, simpler for codegen. This is a reasonable v1 compromise; call it out in any user-facing doc.
- No shared wizard shell extraction yet — the shell lives inside `IndicatorVisualBuilder.tsx`. Extracting a generic shell is a future refactor when the 2nd archetype lands.

---

## Execution choice

Plan complete and saved to `docs/superpowers/plans/2026-04-15-indicator-visual-builder.md`. Two execution options:

1. **Subagent-Driven (recommended)** — one fresh subagent per task, review between tasks, fastest iteration for a 13-task plan.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints for review.

Which approach?