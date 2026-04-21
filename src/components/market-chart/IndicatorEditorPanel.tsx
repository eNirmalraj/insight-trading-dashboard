/**
 * IndicatorEditorPanel — Indicator Code Editor for the Market page.
 * Built to exact UI/UX spec. One script at a time, no tabs, no split view.
 * Replaces the chart completely when open.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import { saveStrategy, getStrategies, deleteStrategy } from '../../services/strategyService';
import { Strategy } from '../../types';
import { BottomConsole } from '../strategy-studio/BottomConsole';
import { DEFAULT_INDICATORS } from '../../indicators';
import IndicatorVisualBuilder from './visual-indicator-builder/IndicatorVisualBuilder';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface IndicatorEditorPanelProps {
    isOpen: boolean;
    onToggle: () => void;
    onAddToChart: (script: Strategy) => void;
    onScriptSaved: () => void;
}

interface LogEntry {
    timestamp: string;
    message: string;
    type: 'info' | 'error' | 'success' | 'warn';
    line?: number;
    column?: number;
    code?: string;
    suggestion?: string;
    category?: string;
}

/* ------------------------------------------------------------------ */
/*  Script validator (compile-time diagnostics via Kuri bridge)        */
/* ------------------------------------------------------------------ */
const validateScript = async (content: string) => {
    try {
        const { getKuriBridge } = await import('../../lib/kuri/kuri-bridge');
        const bridge = getKuriBridge();
        const { errors } = bridge.compile(content);
        return errors.map((e: any) => ({
            severity: e.phase === 'runtime' ? 'warning' : 'error',
            message: e.message,
            line: e.line || 1,
            column: e.col || 1,
        }));
    } catch (err: any) {
        return [{ severity: 'error', message: err.message, line: 1, column: 1 }];
    }
};

/* ================================================================== */
/*  OPEN INDICATOR MODAL                                               */
/* ================================================================== */
const OpenIndicatorModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onLoadIndicator: (s: Strategy) => void;
    onViewSource: (ind: { name: string; id: string; kuriSource: string }) => void;
}> = ({ isOpen, onClose, onLoadIndicator, onViewSource }) => {
    const [search, setSearch] = useState('');
    const [tab, setTab] = useState<'my' | 'builtin'>('my');
    const [savedScripts, setSavedScripts] = useState<Strategy[]>([]);
    const [loading, setLoading] = useState(true);
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        setSearch('');
        setTab('my');
        const load = async () => {
            setLoading(true);
            try {
                const list = await getStrategies();
                setSavedScripts(list.filter((s) => s.type === 'INDICATOR'));
            } catch { /* ignore */ }
            setLoading(false);
        };
        load();
    }, [isOpen]);

    if (!isOpen) return null;

    const q = search.toLowerCase().trim();
    const filteredSaved = savedScripts.filter((s) => !q || s.name.toLowerCase().includes(q));
    const filteredBuiltIn = DEFAULT_INDICATORS.filter(
        (ind) => !q || ind.name.toLowerCase().includes(q) || ind.shortname.toLowerCase().includes(q)
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60" />
            {/* Dialog */}
            <div className="relative bg-[#131722] border border-[#2A2E39] rounded-xl w-[520px] flex flex-col shadow-2xl overflow-hidden"
                style={{ maxHeight: '70vh' }} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e222d]">
                    <span className="text-sm font-semibold text-white">Open Indicator</span>
                    <button type="button" onClick={onClose} title="Close" className="text-gray-500 hover:text-white transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                {/* Search */}
                <div className="px-5 py-3 border-b border-[#1e222d]">
                    <input type="text" placeholder="Search indicators..." title="Search"
                        value={search} onChange={(e) => setSearch(e.target.value)} autoFocus
                        className="w-full bg-[#1e222d] border border-[#2A2E39] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-[#2962FF] focus:outline-none" />
                </div>
                {/* Tabs */}
                <div className="flex border-b border-[#1e222d]">
                    <button type="button" onClick={() => setTab('my')}
                        className={`flex-1 py-2.5 text-xs font-medium text-center border-b-2 transition-colors ${tab === 'my' ? 'border-[#2962FF] text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
                        My Indicators
                    </button>
                    <button type="button" onClick={() => setTab('builtin')}
                        className={`flex-1 py-2.5 text-xs font-medium text-center border-b-2 transition-colors ${tab === 'builtin' ? 'border-[#2962FF] text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
                        Built-in Library
                    </button>
                </div>
                {/* Content */}
                <div className="flex-1 overflow-y-auto p-3 min-h-0">
                    {tab === 'my' && (
                        loading ? (
                            <div className="flex justify-center py-10">
                                <svg className="w-6 h-6 animate-spin text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                            </div>
                        ) : filteredSaved.length === 0 ? (
                            <div className="text-center text-gray-500 text-sm py-10 italic">
                                {q ? 'No matching indicators' : 'No saved indicators yet'}
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                {filteredSaved.map((s) => (
                                    <div key={s.id} className="flex items-center group">
                                        <button type="button" onClick={() => { onLoadIndicator(s); onClose(); }}
                                            className="flex-1 text-left px-4 py-3 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.05] hover:border-white/[0.1] transition-all flex items-center justify-between">
                                            <div>
                                                <div className="text-sm font-medium text-gray-200">{s.name}</div>
                                                <span className="text-xs text-gray-600">Custom Indicator</span>
                                            </div>
                                            <span className="text-xs text-[#2962FF] opacity-0 group-hover:opacity-100 transition-opacity">Open</span>
                                        </button>
                                        {pendingDeleteId === s.id ? (
                                            <>
                                                <button type="button" title="Confirm delete"
                                                    onClick={async () => {
                                                        try {
                                                            await deleteStrategy(s.id);
                                                            setSavedScripts((p) => p.filter((x) => x.id !== s.id));
                                                            setPendingDeleteId(null);
                                                        } catch (err: any) {
                                                            alert(`Failed to delete "${s.name}": ${err?.message || err}`);
                                                            setPendingDeleteId(null);
                                                        }
                                                    }}
                                                    className="p-2.5 ml-1 rounded-lg bg-red-500/80 hover:bg-red-500 text-white text-xs font-semibold">
                                                    Confirm
                                                </button>
                                                <button type="button" title="Cancel"
                                                    onClick={() => setPendingDeleteId(null)}
                                                    className="p-2.5 ml-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-gray-300 text-xs font-semibold">
                                                    Cancel
                                                </button>
                                            </>
                                        ) : (
                                            <button type="button" title="Delete"
                                                onClick={() => setPendingDeleteId(s.id)}
                                                className="p-2.5 ml-1 rounded-lg bg-white/[0.05] hover:bg-red-500/20 text-gray-400 hover:text-red-400 opacity-90 transition-all">
                                                <svg className="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )
                    )}
                    {tab === 'builtin' && (
                        filteredBuiltIn.length === 0 ? (
                            <div className="text-center text-gray-500 text-sm py-10 italic">No matching indicators</div>
                        ) : (
                            <div className="space-y-1.5">
                                {filteredBuiltIn.map((ind) => (
                                    <button type="button" key={ind.id}
                                        onClick={() => { onViewSource(ind); onClose(); }}
                                        disabled={!ind.kuriSource}
                                        className="w-full text-left px-4 py-3 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.05] hover:border-white/[0.1] transition-all flex items-center justify-between group disabled:opacity-40 disabled:cursor-not-allowed">
                                        <div>
                                            <div className="text-sm font-medium text-gray-200">{ind.name}</div>
                                            <span className="text-xs text-gray-600">{ind.shortname} &middot; {ind.overlay ? 'Overlay' : 'Separate pane'}</span>
                                        </div>
                                        <span className="text-xs text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity">View Source</span>
                                    </button>
                                ))}
                            </div>
                        )
                    )}
                </div>
            </div>
        </div>
    );
};

/* ================================================================== */
/*  MAIN EDITOR PANEL                                                  */
/* ================================================================== */
const IndicatorEditorPanel: React.FC<IndicatorEditorPanelProps> = ({
    isOpen, onToggle, onAddToChart, onScriptSaved,
}) => {
    // ── State ──
    const [scriptContent, setScriptContent] = useState('');
    const [scriptName, setScriptName] = useState('New Indicator');
    const [activeScriptId, setActiveScriptId] = useState<string | null>(null);
    const [isDirty, setIsDirty] = useState(false);
    const [isBuiltIn, setIsBuiltIn] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isChecking, setIsChecking] = useState(false);
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState('');
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [consoleOpen, setConsoleOpen] = useState(true);
    const [consoleHeight, setConsoleHeight] = useState(120);
    const [showScriptMenu, setShowScriptMenu] = useState(false);
    const [showOpenList, setShowOpenList] = useState(false);
    const [diagnosticCounts, setDiagnosticCounts] = useState({ errors: 0, warnings: 0 });
    const [editorMode, setEditorMode] = useState<'visual' | 'code'>('code');
    const [visualGeneratedCode, setVisualGeneratedCode] = useState('');

    const editorRef = useRef<any>(null);
    const isResizingConsole = useRef(false);
    const _monaco = useMonaco();

    // ── Helpers ──
    const addLog = useCallback((type: LogEntry['type'], message: string, opts?: { line?: number; column?: number; code?: string; suggestion?: string }) => {
        const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLogs((prev) => [...prev, { timestamp, message, type, ...opts }]);
    }, []);

    const navigateToLine = useCallback((line: number, column?: number) => {
        const ed = editorRef.current;
        if (!ed) return;
        ed.revealLineInCenter(line);
        ed.setPosition({ lineNumber: line, column: column || 1 });
        ed.focus();
    }, []);

    // ── Console resize ──
    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!isResizingConsole.current) return;
            const el = document.getElementById('indicator-editor-panel');
            if (!el) return;
            const r = el.getBoundingClientRect();
            setConsoleHeight(Math.min(Math.max(r.bottom - e.clientY, 60), 250));
        };
        const onUp = () => { isResizingConsole.current = false; document.body.style.cursor = ''; };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    }, []);

    // ── Keyboard shortcuts ──
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSave(); }
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleCheck(); }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    });

    // ── Initialize on open ──
    useEffect(() => {
        if (isOpen && !activeScriptId) {
            setActiveScriptId('new-' + Date.now());
            setScriptContent('');
            setScriptName('New Indicator');
            setIsDirty(false);
            setIsBuiltIn(false);
            setLogs([]);
            addLog('info', 'Indicator Editor ready. Write a script and click Run.');
        }
    }, [isOpen]);

    // ── Actions ──
    const handleNewIndicator = useCallback(() => {
        setScriptContent('');
        setScriptName('New Indicator');
        setActiveScriptId('new-' + Date.now());
        setIsDirty(false);
        setIsBuiltIn(false);
        setLogs([]);
        setShowScriptMenu(false);
        setIsRenaming(true);
        setRenameValue('New Indicator');
        setTimeout(() => {
            const input = document.getElementById('rename-input');
            if (input) (input as HTMLInputElement).select();
        }, 50);
    }, []);

    const handleLoadIndicator = useCallback((s: Strategy) => {
        setScriptContent(s.scriptSource || '');
        setScriptName(s.name);
        setActiveScriptId(s.id);
        setIsDirty(false);
        setIsBuiltIn(false);
        setLogs([]);
        addLog('info', `Loaded: ${s.name}`);
    }, [addLog]);

    const handleViewSource = useCallback((ind: { name: string; id: string; kuriSource: string }) => {
        setScriptContent(ind.kuriSource || '');
        setScriptName(ind.name);
        setActiveScriptId(`builtin-${ind.id}`);
        setIsDirty(false);
        setIsBuiltIn(true);
        setLogs([]);
        addLog('info', `Viewing source: ${ind.name} (read-only)`);
    }, [addLog]);

    const handleRenameCommit = useCallback(() => {
        const trimmed = renameValue.trim();
        if (trimmed && trimmed !== scriptName) {
            setScriptName(trimmed);
            setIsDirty(true);
        }
        setIsRenaming(false);
    }, [renameValue, scriptName]);

    const handleMakeCopy = useCallback(() => {
        const copyName = scriptName + ' (Copy)';
        setScriptName(copyName);
        setActiveScriptId('new-' + Date.now());
        setIsBuiltIn(false);
        setIsDirty(true);
        setShowScriptMenu(false);
        addLog('success', `Created copy: ${copyName}`);
        setIsRenaming(true);
        setRenameValue(copyName);
        setTimeout(() => {
            const input = document.getElementById('rename-input');
            if (input) (input as HTMLInputElement).select();
        }, 50);
    }, [scriptName, addLog]);

    // Active source depends on mode — visual builder's generated code or code editor content
    const activeSource = editorMode === 'visual' ? visualGeneratedCode : scriptContent;

    const handleCheck = useCallback(async (): Promise<boolean> => {
        if (!activeSource.trim()) { addLog('warn', 'Script is empty.'); return false; }
        setIsChecking(true);
        try {
            // 1. Kuri bridge compilation check
            const diagnostics = await validateScript(activeSource);
            const errs = diagnostics.filter((d: any) => d.severity === 'error');
            const warns = diagnostics.filter((d: any) => d.severity === 'warning');

            // 2. Basic syntax checks on the source itself (catches issues Kuri bridge misses)
            // NOTE: Monaco markers are NOT used — Monaco treats .kuri as JS and produces false errors
            const lines = activeSource.split('\n');
            let inFrontmatter = false;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line === '---') { inFrontmatter = !inFrontmatter; continue; }
                if (inFrontmatter || line === '' || line.startsWith('//')) continue;

                // Check for unmatched parentheses
                let depth = 0;
                for (const ch of line) { if (ch === '(') depth++; if (ch === ')') depth--; }
                if (depth !== 0) {
                    errs.push({ severity: 'error', message: `Unmatched parentheses`, line: i + 1, column: 1 });
                }

                // Check for empty assignments
                if (/^[a-zA-Z_]\w*\s*=$/.test(line)) {
                    errs.push({ severity: 'error', message: `Empty assignment — missing right-hand value`, line: i + 1, column: line.length });
                }

                // Check for unknown request.security usage
                if (line.includes('request.security') && !line.includes('"')) {
                    warns.push({ severity: 'warning', message: `request.security timeframe should be a quoted string`, line: i + 1, column: 1 });
                }
            }

            setDiagnosticCounts({ errors: errs.length, warnings: warns.length });
            errs.forEach((e: any) => addLog('error', e.message, { line: e.line, column: e.column }));
            warns.forEach((w: any) => addLog('warn', w.message, { line: w.line, column: w.column }));
            if (errs.length === 0) {
                addLog('success', warns.length > 0 ? `No errors found (${warns.length} warning${warns.length > 1 ? 's' : ''}).` : 'No errors found. Ready to add to chart.');
                return true;
            }
            return false;
        } catch (e: any) {
            addLog('error', e.message);
            return false;
        } finally { setIsChecking(false); }
    }, [activeSource, addLog, _monaco]);

    const handleSave = useCallback(async (): Promise<string | null> => {
        if (isBuiltIn || !activeSource.trim()) return null;
        setIsSaving(true);
        try {
            if (!scriptName.trim()) throw new Error('Script name is empty.');
            const isStrategy = /export\s+(const|let|var)\s+strategy\b/.test(activeSource);
            const id = await saveStrategy({
                id: activeScriptId && !activeScriptId.startsWith('new-') && !activeScriptId.startsWith('builtin-') ? activeScriptId : undefined,
                name: scriptName,
                description: `Indicator: ${scriptName}`,
                type: isStrategy ? 'STRATEGY' : 'INDICATOR',
                scriptSource: activeSource,
                timeframe: '1h', symbolScope: [], indicators: [], entryRules: [], exitRules: [], isActive: true,
            });
            setActiveScriptId(id);
            setIsDirty(false);
            addLog('success', `"${scriptName}" saved!`);
            onScriptSaved();
            return id;
        } catch (e: any) {
            addLog('error', `Save failed: ${e.message}`);
            return null;
        } finally { setIsSaving(false); }
    }, [activeSource, scriptName, activeScriptId, isBuiltIn, addLog, onScriptSaved]);

    const handleAddToChart = useCallback(async () => {
        const ok = await handleCheck();
        if (!ok) return;
        const savedId = await handleSave();
        if (!savedId) return;
        onAddToChart({
            id: savedId, name: scriptName, type: 'INDICATOR', scriptSource: activeSource,
            timeframe: '1h', symbolScope: [], entryRules: [], exitRules: [], indicators: [], isActive: true,
        });
        addLog('success', `"${scriptName}" added to chart!`);
    }, [handleCheck, handleSave, scriptName, activeSource, onAddToChart, addLog]);

    // ── Don't render when closed ──
    if (!isOpen) return null;

    return (
        <div className="flex-1 flex min-h-0">
            {/* ═══ EDITOR PANEL ═══ */}
            <div id="indicator-editor-panel" className="flex-1 flex flex-col bg-[#09090b] text-gray-300 select-none min-w-0">

                {/* ── TOOLBAR (36px) ── */}
                <div className="h-9 flex-shrink-0 bg-[#0f0f0f] border-b border-white/10 flex items-center px-3 gap-2">

                    {/* 1. Script name / dropdown */}
                    <div className="relative z-50">
                        {isRenaming ? (
                            <input id="rename-input" type="text" title="Rename indicator"
                                value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                                onBlur={handleRenameCommit}
                                onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') handleRenameCommit(); if (e.key === 'Escape') setIsRenaming(false); }}
                                autoFocus
                                className="w-36 text-xs font-medium text-white bg-[#1e222d] border border-[#2962FF] rounded px-1.5 py-0.5 outline-none" />
                        ) : (
                            <button type="button" onClick={() => setShowScriptMenu(!showScriptMenu)}
                                onDoubleClick={() => { if (!isBuiltIn) { setRenameValue(scriptName); setIsRenaming(true); setTimeout(() => { const el = document.getElementById('rename-input'); if (el) (el as HTMLInputElement).select(); }, 50); } }}
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium text-gray-300 hover:text-white hover:bg-white/5 transition-colors">
                                <span title={isBuiltIn ? scriptName : 'Double-click to rename'} className="truncate max-w-[160px]">{scriptName}</span>
                                {isDirty && <span className="text-yellow-500 text-[10px]">{'\u25CF'}</span>}
                                {isBuiltIn && <span className="text-[9px] text-gray-600 bg-gray-800 px-1 rounded">READ-ONLY</span>}
                                <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                            </button>
                        )}
                        {showScriptMenu && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowScriptMenu(false)} />
                                <div className="absolute top-full left-0 mt-1 w-48 bg-[#18181b] border border-white/10 rounded-md shadow-xl py-1 z-50">
                                    <button type="button" onClick={handleNewIndicator} className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-white/10 hover:text-white">New Indicator</button>
                                    <button type="button" onClick={() => { setShowOpenList(true); setShowScriptMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-white/10 hover:text-white">Open...</button>
                                    <div className="h-px bg-white/10 my-1" />
                                    <button type="button" onClick={() => { handleSave(); setShowScriptMenu(false); }} disabled={isBuiltIn || !activeSource.trim()} className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-white/10 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed">Save</button>
                                    <button type="button" onClick={() => { setRenameValue(scriptName); setIsRenaming(true); setShowScriptMenu(false); setTimeout(() => { const el = document.getElementById('rename-input'); if (el) (el as HTMLInputElement).select(); }, 0); }} disabled={isBuiltIn || !activeScriptId} className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-white/10 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed">Rename...</button>
                                    <button type="button" onClick={handleMakeCopy} disabled={!activeSource.trim()} className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-white/10 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed">Make a copy...</button>
                                </div>
                            </>
                        )}
                    </div>

                    {/* 2. Vertical divider */}
                    <div className="w-px h-4 bg-white/10 mx-1" />

                    {/* 3. Save button */}
                    <button type="button" onClick={() => handleSave()} disabled={isSaving || isBuiltIn || !activeSource.trim()}
                        title="Save (Ctrl+S)" className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-30">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    </button>

                    {/* 4. Run button */}
                    <button type="button" onClick={() => handleCheck()} disabled={isChecking || !activeSource.trim()}
                        title="Check for errors (Ctrl+Enter)" className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Run
                        {diagnosticCounts.errors > 0 && <span className="ml-0.5 px-1 py-0.5 rounded-full text-[10px] font-bold bg-red-500/80">{diagnosticCounts.errors}</span>}
                        {diagnosticCounts.errors === 0 && diagnosticCounts.warnings > 0 && <span className="ml-0.5 px-1 py-0.5 rounded-full text-[10px] font-bold bg-yellow-500/80 text-black">{diagnosticCounts.warnings}</span>}
                    </button>

                    {/* 5. Add to chart button */}
                    <button type="button" onClick={handleAddToChart} disabled={!activeSource.trim() || isBuiltIn}
                        className="flex items-center gap-1 bg-[#2962FF] hover:bg-[#1e54e8] text-white px-2 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                        Add to chart
                    </button>

                    {/* 6. Spacer */}
                    <div className="flex-1" />

                    {/* Visual/Code toggle */}
                    <div className="flex items-center gap-1 rounded bg-white/5 p-0.5">
                        <button type="button" onClick={() => setEditorMode('visual')}
                            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${editorMode === 'visual' ? 'bg-[#2962FF] text-white' : 'text-gray-400 hover:text-white'}`}>
                            Visual
                        </button>
                        <button type="button" onClick={() => {
                                // When switching to Code: sync visual builder's generated code into the editor
                                if (editorMode === 'visual' && visualGeneratedCode.trim()) {
                                    setScriptContent(visualGeneratedCode);
                                }
                                setEditorMode('code');
                            }}
                            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${editorMode === 'code' ? 'bg-[#2962FF] text-white' : 'text-gray-400 hover:text-white'}`}>
                            Code
                        </button>
                    </div>

                    {/* 7. Collapse button */}
                    <button type="button" onClick={onToggle} title="Collapse editor"
                        className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/5 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                    </button>
                </div>

                {/* ── VISUAL BUILDER ── */}
                <div className={editorMode === 'visual' ? 'flex-1 min-h-0' : 'hidden'}>
                    <IndicatorVisualBuilder
                        onSourceChange={setVisualGeneratedCode}
                    />
                </div>

                {/* ── MONACO EDITOR ── */}
                <div className={editorMode === 'code' ? 'flex-1 min-h-0' : 'hidden'}>
                    <Editor
                        height="100%"
                        language="plaintext"
                        theme="vs-dark"
                        value={scriptContent}
                        onChange={(value) => { if (value !== undefined) { setScriptContent(value); setIsDirty(true); } }}
                        onMount={(editor) => { editorRef.current = editor; }}
                        options={{
                            readOnly: isBuiltIn,
                            minimap: { enabled: false },
                            fontSize: 12,
                            lineNumbers: 'on',
                            scrollBeyondLastLine: false,
                            wordWrap: 'on',
                            tabSize: 2,
                            renderLineHighlight: 'line',
                            padding: { top: 4, bottom: 4 },
                            overviewRulerBorder: false,
                            scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
                        }}
                    />
                </div>

                {/* ── BOTTOM CONSOLE ── */}
                <BottomConsole
                    logs={logs}
                    isOpen={consoleOpen}
                    height={consoleHeight}
                    errorCount={diagnosticCounts.errors}
                    warningCount={diagnosticCounts.warnings}
                    onToggle={() => setConsoleOpen(!consoleOpen)}
                    onClear={() => { setLogs([]); setDiagnosticCounts({ errors: 0, warnings: 0 }); }}
                    onResizeStart={(e) => { isResizingConsole.current = true; document.body.style.cursor = 'row-resize'; e.preventDefault(); }}
                    onNavigateToLine={navigateToLine}
                />
            </div>

            {/* ═══ RIGHT SIDEBAR STRIP (48px) ═══ */}
            <div className="w-12 bg-[#0f0f0f] border-l border-[#2A2A2A] flex flex-col items-center flex-shrink-0">
                <div className="flex-1" />
                <button type="button" onClick={onToggle} title="Close Editor (Ctrl+E)"
                    className="mb-3 w-9 h-9 flex items-center justify-center rounded-lg bg-[#2962FF]/20 text-[#2962FF] hover:bg-[#2962FF]/30 transition-colors">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="16 18 22 12 16 6" />
                        <polyline points="8 6 2 12 8 18" />
                    </svg>
                </button>
            </div>

            {/* ═══ OPEN INDICATOR MODAL ═══ */}
            <OpenIndicatorModal
                isOpen={showOpenList}
                onClose={() => setShowOpenList(false)}
                onLoadIndicator={handleLoadIndicator}
                onViewSource={handleViewSource}
            />
        </div>
    );
};

export default IndicatorEditorPanel;
