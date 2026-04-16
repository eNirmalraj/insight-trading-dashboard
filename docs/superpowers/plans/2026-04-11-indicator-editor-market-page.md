# Indicator Editor on Market Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a split-view indicator editor panel to the Market page (toggled via `</>` icon at bottom of right toolbar), and lock Strategy Studio to strategy scripts only.

**Architecture:** The IndicatorEditorPanel component renders inside CandlestickChart, between the chart content area and the RightToolbar. It uses Monaco editor for Kuri code editing, auto-compiles with debounce, and saves/adds indicators to the chart. Strategy Studio is modified to reject indicator scripts with a redirect message.

**Tech Stack:** React 19, TypeScript, Monaco Editor (`@monaco-editor/react`), Tailwind CSS, Supabase

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/market-chart/IndicatorEditorPanel.tsx` | Create | Split-view editor panel with Monaco, tabs, console, save/add-to-chart logic |
| `src/components/market-chart/RightToolbar.tsx` | Modify | Add `</>` icon at bottom with toggle |
| `src/components/market-chart/CandlestickChart.tsx` | Modify | Add editor panel state, render IndicatorEditorPanel, wire up add-to-chart |
| `src/pages/StrategyStudio.tsx` | Modify | Block indicator creation, strategy-only validation |
| `src/components/strategy-studio/OpenScriptModal.tsx` | Modify | Filter out indicator scripts |

---

### Task 1: Add Editor Icon to RightToolbar

**Files:**
- Modify: `src/components/market-chart/RightToolbar.tsx`

- [ ] **Step 1: Update RightToolbarProps interface**

Add two new optional props after `onToolSelect`:

```typescript
    onToggleIndicatorEditor?: () => void;
    isIndicatorEditorOpen?: boolean;
```

- [ ] **Step 2: Destructure new props in the component**

In the `RightToolbar` component destructuring, add:

```typescript
    onToggleIndicatorEditor,
    isIndicatorEditorOpen = false,
```

- [ ] **Step 3: Add the editor icon at the bottom of the toolbar**

In the JSX return, find the closing `</div>` of the scrollable drawing tools container (the `<div className="flex flex-col items-center gap-0.5 flex-1 overflow-y-auto...">` div). After that closing `</div>`, add before the final `</div>` of the component:

```tsx
            {/* Spacer to push editor icon to bottom */}
            <div className="flex-1" />

            {/* Separator */}
            <div className="w-6 border-t border-[#2A2A2A] my-2" />

            {/* Indicator Editor Toggle */}
            {onToggleIndicatorEditor && (
                <button
                    onClick={onToggleIndicatorEditor}
                    title="Indicator Editor"
                    className={`flex items-center justify-center p-2.5 rounded transition-all duration-150 ${
                        isIndicatorEditorOpen
                            ? 'bg-[#2C2C2C] text-[#c4b5f0]'
                            : 'text-[#E0E0E0] hover:bg-[#2C2C2C] hover:text-white'
                    }`}
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="16 18 22 12 16 6" />
                        <polyline points="8 6 2 12 8 18" />
                    </svg>
                </button>
            )}
```

Note: Remove the existing `<div className="flex-1" />` spacer if one exists in the drawing tools section, since we're adding our own spacer here. The drawing tools div already has `flex-1` and `overflow-y-auto`, so the editor icon will sit below it at the very bottom.

---

### Task 2: Create IndicatorEditorPanel Component

**Files:**
- Create: `src/components/market-chart/IndicatorEditorPanel.tsx`

- [ ] **Step 1: Create the component file**

```tsx
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { CloseIcon } from '../IconComponents';
import { Strategy } from '../../types';
import { useAuth } from '../../context/AuthContext';

interface IndicatorTab {
    id: string;
    name: string;
    source: string;
    savedSource: string;
    isNew: boolean;
}

interface CompileResult {
    success: boolean;
    errors: { message: string; line?: number; phase?: string }[];
    plotCount: number;
    hlineCount: number;
    executeTime: number;
}

interface IndicatorEditorPanelProps {
    onClose: () => void;
    onAddToChart: (script: Strategy) => void;
    savedIndicators: Strategy[];
    onIndicatorSaved: () => void;
}

const DEFAULT_TEMPLATE = `---
version: kuri 1.0
name: My Indicator
type: indicator
pane: overlay
---

src = param.source(close, title="Source")
len = param.int(14, title="Length")
out = kuri.sma(src, len)
mark(out, title="SMA", color=color.blue, linewidth=2)
`;

const IndicatorEditorPanel: React.FC<IndicatorEditorPanelProps> = ({
    onClose,
    onAddToChart,
    savedIndicators,
    onIndicatorSaved,
}) => {
    const { user } = useAuth();
    const [tabs, setTabs] = useState<IndicatorTab[]>([
        { id: 'new-' + Date.now(), name: 'My Indicator', source: DEFAULT_TEMPLATE, savedSource: '', isNew: true },
    ]);
    const [activeTabId, setActiveTabId] = useState(tabs[0].id);
    const [compileResult, setCompileResult] = useState<CompileResult | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [MonacoEditor, setMonacoEditor] = useState<any>(null);
    const compileTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Lazy-load Monaco
    useEffect(() => {
        import('@monaco-editor/react').then((mod) => {
            setMonacoEditor(() => mod.default);
        });
    }, []);

    const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId), [tabs, activeTabId]);
    const isDirty = activeTab ? activeTab.source !== activeTab.savedSource : false;

    // Extract name from YAML header
    const extractName = (source: string): string => {
        const match = source.match(/^---[\s\S]*?name:\s*(.+?)[\s\S]*?---/m);
        return match ? match[1].replace(/['"]/g, '').trim() : 'Untitled';
    };

    // Check if type is indicator
    const isIndicatorType = (source: string): boolean => {
        const match = source.match(/^---[\s\S]*?type:\s*(\w+)[\s\S]*?---/m);
        return match ? match[1] === 'indicator' : false;
    };

    // Auto-compile on code change
    const handleCodeChange = useCallback((value: string | undefined) => {
        if (!value || !activeTabId) return;
        setTabs((prev) =>
            prev.map((t) =>
                t.id === activeTabId ? { ...t, source: value, name: extractName(value) } : t
            )
        );

        // Debounced compile
        if (compileTimerRef.current) clearTimeout(compileTimerRef.current);
        compileTimerRef.current = setTimeout(async () => {
            try {
                const { getKuriBridge } = await import('../../lib/kuri/kuri-bridge');
                const bridge = getKuriBridge();
                const ohlcv = {
                    open: Array(50).fill(100),
                    high: Array(50).fill(105),
                    low: Array(50).fill(95),
                    close: Array(50).fill(102),
                    volume: Array(50).fill(1000),
                    time: Array.from({ length: 50 }, (_, i) => Date.now() / 1000 - (50 - i) * 3600),
                };
                const result = await bridge.run(value, ohlcv);
                setCompileResult({
                    success: result.success,
                    errors: result.errors || [],
                    plotCount: result.plots?.length || 0,
                    hlineCount: result.hlines?.length || 0,
                    executeTime: result.executeTime || 0,
                });
            } catch (err: any) {
                setCompileResult({
                    success: false,
                    errors: [{ message: err.message }],
                    plotCount: 0,
                    hlineCount: 0,
                    executeTime: 0,
                });
            }
        }, 500);
    }, [activeTabId]);

    // Save indicator to DB
    const saveIndicator = useCallback(async (tab: IndicatorTab): Promise<string> => {
        const { saveStrategy } = await import('../../services/strategyService');
        const id = await saveStrategy({
            id: tab.isNew ? undefined : tab.id,
            name: tab.name,
            description: '',
            type: 'INDICATOR',
            scriptSource: tab.source,
            timeframe: '1H',
            symbolScope: [],
            entryRules: [],
            exitRules: [],
            indicators: [],
            isActive: true,
        });
        return id;
    }, []);

    // Add to Chart (smart save)
    const handleAddToChart = useCallback(async () => {
        if (!activeTab) return;
        if (!isIndicatorType(activeTab.source)) {
            alert('This editor is for indicators only. Use the Strategy Studio for strategies.');
            return;
        }

        setIsSaving(true);
        try {
            let scriptId = activeTab.id;

            // Save if new or dirty
            if (activeTab.isNew || isDirty) {
                scriptId = await saveIndicator(activeTab);
                setTabs((prev) =>
                    prev.map((t) =>
                        t.id === activeTab.id
                            ? { ...t, id: scriptId, isNew: false, savedSource: t.source }
                            : t
                    )
                );
                setActiveTabId(scriptId);
                onIndicatorSaved();
            }

            // Add to chart
            onAddToChart({
                id: scriptId,
                name: activeTab.name,
                type: 'INDICATOR',
                scriptSource: activeTab.source,
                timeframe: '1H',
                symbolScope: [],
                entryRules: [],
                exitRules: [],
                indicators: [],
                isActive: true,
            });
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        } finally {
            setIsSaving(false);
        }
    }, [activeTab, isDirty, saveIndicator, onAddToChart, onIndicatorSaved]);

    // Save only
    const handleSave = useCallback(async () => {
        if (!activeTab || !isDirty) return;
        setIsSaving(true);
        try {
            const scriptId = await saveIndicator(activeTab);
            setTabs((prev) =>
                prev.map((t) =>
                    t.id === activeTab.id
                        ? { ...t, id: scriptId, isNew: false, savedSource: t.source }
                        : t
                )
            );
            setActiveTabId(scriptId);
            onIndicatorSaved();
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        } finally {
            setIsSaving(false);
        }
    }, [activeTab, isDirty, saveIndicator, onIndicatorSaved]);

    // Open saved indicator
    const openIndicator = useCallback((indicator: Strategy) => {
        const existing = tabs.find((t) => t.id === indicator.id);
        if (existing) {
            setActiveTabId(existing.id);
            return;
        }
        const source = indicator.scriptSource || '';
        const newTab: IndicatorTab = {
            id: indicator.id,
            name: indicator.name,
            source,
            savedSource: source,
            isNew: false,
        };
        setTabs((prev) => [...prev, newTab]);
        setActiveTabId(indicator.id);
    }, [tabs]);

    // New tab
    const createNewTab = useCallback(() => {
        const newTab: IndicatorTab = {
            id: 'new-' + Date.now(),
            name: 'My Indicator',
            source: DEFAULT_TEMPLATE,
            savedSource: '',
            isNew: true,
        };
        setTabs((prev) => [...prev, newTab]);
        setActiveTabId(newTab.id);
    }, []);

    // Close tab
    const closeTab = useCallback((tabId: string) => {
        setTabs((prev) => {
            const remaining = prev.filter((t) => t.id !== tabId);
            if (remaining.length === 0) {
                onClose();
                return prev;
            }
            if (activeTabId === tabId) {
                setActiveTabId(remaining[remaining.length - 1].id);
            }
            return remaining;
        });
    }, [activeTabId, onClose]);

    const indicatorScripts = useMemo(
        () => savedIndicators.filter((s) => s.type === 'INDICATOR'),
        [savedIndicators]
    );

    const [showOpenDropdown, setShowOpenDropdown] = useState(false);

    return (
        <div className="w-[380px] border-l-2 border-[#a78bfa50] bg-[#0f0f18] flex flex-col h-full flex-shrink-0">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#1e1e2e] bg-[#12121a] flex-shrink-0">
                <h3 className="text-[13px] font-semibold text-white">Indicator Editor</h3>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleSave}
                        disabled={!isDirty || isSaving}
                        className="text-[11px] px-3 py-1 rounded bg-[#1e1e2e] text-gray-400 hover:text-white disabled:opacity-40 transition-colors"
                    >
                        Save
                    </button>
                    <button
                        onClick={handleAddToChart}
                        disabled={isSaving || (compileResult !== null && !compileResult.success)}
                        className="text-[11px] px-3 py-1 rounded bg-[#4ade8020] text-[#4ade80] border border-[#4ade8040] hover:bg-[#4ade8030] disabled:opacity-40 transition-colors font-semibold"
                    >
                        {isSaving ? 'Saving...' : '\u25B6 Add to Chart'}
                    </button>
                    <button
                        onClick={onClose}
                        title="Close"
                        aria-label="Close editor"
                        className="p-1 rounded hover:bg-[#2c2c2c] text-gray-500 hover:text-white transition-colors"
                    >
                        <CloseIcon className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[#1e1e2e] flex-shrink-0 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                {tabs.map((tab) => (
                    <div
                        key={tab.id}
                        onClick={() => setActiveTabId(tab.id)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] cursor-pointer whitespace-nowrap transition-colors ${
                            tab.id === activeTabId
                                ? 'bg-[#1e1e2e] text-white'
                                : 'text-gray-500 hover:text-gray-300'
                        }`}
                    >
                        {tab.source !== tab.savedSource && (
                            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 flex-shrink-0" />
                        )}
                        <span>{tab.name}</span>
                        <button
                            onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                            className="ml-1 text-gray-600 hover:text-white"
                            title="Close tab"
                        >
                            ×
                        </button>
                    </div>
                ))}
                <button
                    onClick={createNewTab}
                    className="px-2 py-1 text-[11px] text-gray-500 hover:text-white rounded hover:bg-[#1e1e2e] transition-colors"
                    title="New indicator"
                >
                    +
                </button>
                <div className="relative ml-auto">
                    <button
                        onClick={() => setShowOpenDropdown(!showOpenDropdown)}
                        className="px-2 py-1 text-[11px] text-gray-500 hover:text-white rounded hover:bg-[#1e1e2e] transition-colors"
                        title="Open saved indicator"
                    >
                        Open
                    </button>
                    {showOpenDropdown && (
                        <div className="absolute right-0 top-full mt-1 w-52 bg-[#1a1a1a] border border-[#2a2a2a] rounded-md shadow-xl z-50 max-h-48 overflow-y-auto">
                            {indicatorScripts.length === 0 ? (
                                <div className="px-3 py-2 text-[11px] text-gray-500">No saved indicators</div>
                            ) : (
                                indicatorScripts.map((ind) => (
                                    <button
                                        key={ind.id}
                                        onClick={() => { openIndicator(ind); setShowOpenDropdown(false); }}
                                        className="w-full text-left px-3 py-2 text-[12px] text-gray-300 hover:bg-[#2c2c2c] transition-colors"
                                    >
                                        {ind.name}
                                    </button>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Editor */}
            <div className="flex-1 min-h-0">
                {MonacoEditor && activeTab ? (
                    <MonacoEditor
                        height="100%"
                        language="plaintext"
                        theme="vs-dark"
                        value={activeTab.source}
                        onChange={handleCodeChange}
                        options={{
                            minimap: { enabled: false },
                            lineNumbers: 'on',
                            wordWrap: 'off',
                            fontSize: 12,
                            scrollBeyondLastLine: false,
                            renderLineHighlight: 'line',
                            padding: { top: 8 },
                        }}
                    />
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                        Loading editor...
                    </div>
                )}
            </div>

            {/* Console */}
            <div className="h-[100px] border-t border-[#1e1e2e] flex flex-col flex-shrink-0">
                <div className="flex items-center justify-between px-3 py-1 border-b border-[#1e1e2e] bg-[#12121a]">
                    <span className="text-[11px] text-gray-500">Console</span>
                    {compileResult && (
                        <span className={`text-[11px] ${compileResult.success ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>
                            {compileResult.success ? '0 errors' : `${compileResult.errors.length} error${compileResult.errors.length > 1 ? 's' : ''}`}
                        </span>
                    )}
                </div>
                <div className="flex-1 overflow-y-auto px-3 py-2 text-[11px]">
                    {!compileResult && <span className="text-gray-600">Write code to see compile results...</span>}
                    {compileResult?.success && (
                        <>
                            <div className="text-[#4ade80]">{'\u2713'} Compiled successfully</div>
                            <div className="text-gray-500">{compileResult.plotCount} plot{compileResult.plotCount !== 1 ? 's' : ''}, {compileResult.hlineCount} hline{compileResult.hlineCount !== 1 ? 's' : ''}</div>
                            <div className="text-gray-600">{compileResult.executeTime.toFixed(1)}ms execution</div>
                        </>
                    )}
                    {compileResult && !compileResult.success && compileResult.errors.map((err, i) => (
                        <div key={i} className="text-[#f87171]">
                            {err.line ? `Line ${err.line}: ` : ''}{err.message}
                        </div>
                    ))}
                </div>
            </div>

            {/* Status Bar */}
            <div className="flex items-center justify-between px-3 py-1 border-t border-[#1e1e2e] bg-[#12121a] flex-shrink-0">
                <span className="text-[11px] text-gray-600">{activeTab?.name || 'Untitled'}.kuri</span>
                <span className={`text-[11px] flex items-center gap-1 ${
                    activeTab?.isNew ? 'text-gray-500' : isDirty ? 'text-yellow-500' : 'text-[#4ade80]'
                }`}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{
                        background: activeTab?.isNew ? '#666' : isDirty ? '#f59e0b' : '#4ade80'
                    }} />
                    {activeTab?.isNew ? 'New' : isDirty ? 'Modified' : 'Saved'}
                </span>
            </div>
        </div>
    );
};

export default IndicatorEditorPanel;
```

---

### Task 3: Wire Up Editor Panel in CandlestickChart

**Files:**
- Modify: `src/components/market-chart/CandlestickChart.tsx`

- [ ] **Step 1: Add import**

At the top of the file, add after existing imports:

```typescript
import IndicatorEditorPanel from './IndicatorEditorPanel';
```

- [ ] **Step 2: Add state for editor panel**

Inside the CandlestickChart component, add state alongside existing state variables:

```typescript
const [isIndicatorEditorOpen, setIsIndicatorEditorOpen] = useState(false);
```

- [ ] **Step 3: Add toggle handler**

Add a toggle handler:

```typescript
const handleToggleIndicatorEditor = useCallback(() => {
    setIsIndicatorEditorOpen((prev) => !prev);
}, []);
```

- [ ] **Step 4: Add callback to refresh indicators after save**

```typescript
const handleIndicatorSaved = useCallback(async () => {
    // Reload custom scripts from DB
    try {
        const { getStrategies } = await import('../../services/strategyService');
        const all = await getStrategies();
        // Update parent's customScripts if a callback exists, otherwise just log
        console.log('[Chart] Indicator saved, scripts reloaded');
    } catch (err) {
        console.error('[Chart] Failed to reload indicators:', err);
    }
}, []);
```

- [ ] **Step 5: Pass new props to RightToolbar**

Find the `<RightToolbar` JSX (around line 9847). Add after `onToolSelect={setActiveTool}`:

```typescript
                            onToggleIndicatorEditor={handleToggleIndicatorEditor}
                            isIndicatorEditorOpen={isIndicatorEditorOpen}
```

- [ ] **Step 6: Render IndicatorEditorPanel before RightToolbar**

In the JSX, find the `{!isMobile && (<RightToolbar ...` block. Add the IndicatorEditorPanel just before RightToolbar, inside the same `{!isMobile && (` block:

```tsx
                    {!isMobile && isIndicatorEditorOpen && (
                        <IndicatorEditorPanel
                            onClose={() => setIsIndicatorEditorOpen(false)}
                            onAddToChart={handleAddCustomIndicator}
                            savedIndicators={customScripts || []}
                            onIndicatorSaved={handleIndicatorSaved}
                        />
                    )}
                    {!isMobile && (
                        <RightToolbar
```

This places the editor panel between the chart area and the right toolbar.

---

### Task 4: Lock Strategy Studio to Strategies Only

**Files:**
- Modify: `src/pages/StrategyStudio.tsx`

- [ ] **Step 1: Block indicator scripts in the save flow**

Find the validation block that checks `scriptType` (around line 538-542). Replace the existing check with:

```typescript
            // Must have YAML header with type: strategy
            const scriptType = detectedScriptType;
            if (scriptType === 'INDICATOR') {
                throw new Error(
                    'Indicators should be created in the Market page editor.\n\nUse the </> icon on the chart\'s right toolbar to open the Indicator Editor.'
                );
            }
            if (scriptType !== 'STRATEGY') {
                throw new Error(
                    'Script must have a YAML header with type: strategy.\n\nExample:\n---\nversion: kuri 1.0\ntype: strategy\nname: "My Strategy"\n---'
                );
            }
```

- [ ] **Step 2: Lock createNew to strategy only**

Find the `createNew` function (around line 450). Change it to always create strategies:

```typescript
    const createNew = () => {
        setScriptContent(`---
version: kuri 1.0
name: New Strategy
type: strategy
---

fastMA = kuri.sma(close, 10)
slowMA = kuri.sma(close, 20)

if kuri.crossover(fastMA, slowMA)
    strategy.entry("Long", strategy.long)
if kuri.crossunder(fastMA, slowMA)
    strategy.close("Long")
`);
        setStrategyName('New Strategy');
        setActiveScript('new-' + Date.now());
        setIsDirty(false);
        addLog({ message: 'Created new strategy.', type: 'success' });
    };
```

---

### Task 5: Filter Indicators from OpenScriptModal

**Files:**
- Modify: `src/components/strategy-studio/OpenScriptModal.tsx`

- [ ] **Step 1: Filter out indicator scripts**

Find where `savedStrategies` is used in the component. Add a filter to exclude indicators. Look for any `.filter()` or `.map()` on `savedStrategies` and ensure indicator scripts are excluded.

Find the `savedStrategies` prop usage and create a filtered list:

```typescript
const strategyScripts = useMemo(
    () => savedStrategies.filter((s) => s.type !== 'INDICATOR'),
    [savedStrategies]
);
```

Then replace all references to `savedStrategies` in the JSX rendering (the list that shows scripts to the user) with `strategyScripts`. This ensures only strategy scripts appear in the Strategy Studio's Open modal.

---

### Task 6: Verify & Clean Up

- [ ] **Step 1: Verify TypeScript compilation**

Run: `cd "c:\Users\nirma\OneDrive\Desktop\My Project - Copy 1\My Project" && npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "IndicatorEditorPanel|RightToolbar|StrategyStudio|OpenScriptModal" | head -10`

Expected: No new errors for these files.

- [ ] **Step 2: Manual verification checklist**

Open the app in browser and verify:

1. Market page: `</>` icon appears at bottom of right toolbar
2. Click `</>` → editor panel opens (380px, right side)
3. Editor has Monaco with default indicator template
4. Console shows compile result on typing
5. "Add to Chart" saves and adds indicator
6. Close editor with `</>` or X button
7. Strategy Studio: try saving `type: indicator` → shows error with redirect message
8. Strategy Studio: OpenScriptModal only shows strategy scripts

- [ ] **Step 3: Clean up temp mockup file**

```bash
rm "c:\Users\nirma\OneDrive\Desktop\My Project - Copy 1\My Project\indicator-editor-layouts.html" 2>/dev/null
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add indicator editor panel to Market page

- Add </> toggle icon at bottom of right toolbar
- Create IndicatorEditorPanel with Monaco editor, tabs, console
- Smart save: auto-saves on Add to Chart if new/edited
- Lock Strategy Studio to strategy scripts only
- Filter indicators from Strategy Studio's Open modal"
```
