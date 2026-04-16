import React, { useState, useEffect, useRef, useMemo } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import * as ReactRouterDOM from 'react-router-dom';
import {
    validateStrategyJson,
    saveStrategy,
    getStrategies,
    deleteStrategy,
} from '../services/strategyService';
import { Strategy } from '../types';
import {
    registerKuriLanguage,
    setKuriDiagnostics,
    clearKuriDiagnostics,
} from '../lib/kuri/kuri-monaco';
import { getKuriBridge } from '../lib/kuri/kuri-bridge';
import type { KuriError } from '../lib/kuri/types';
type ScriptDiagnostic = {
    severity: string;
    message: string;
    line: number;
    column: number;
    endLine: number;
    endColumn: number;
    code: string;
    suggestion?: string;
};
const ScriptEngine = {
    provideDiagnostics: (script: string): ScriptDiagnostic[] => {
        try {
            const bridge = getKuriBridge();
            const { errors } = bridge.compile(script);
            return errors.map((e: KuriError) => ({
                severity: e.phase === 'runtime' ? 'warning' : 'error',
                message: e.message,
                line: e.line || 1,
                column: e.col || 1,
                endLine: e.line || 1,
                endColumn: 1000,
                code: e.phase,
                suggestion: undefined,
            }));
        } catch {
            return [];
        }
    },
};

// --- Components ---
import { TopToolbar } from '../components/strategy-studio/TopToolbar';
import { BottomConsole } from '../components/strategy-studio/BottomConsole';
import { OpenScriptModal } from '../components/strategy-studio/OpenScriptModal';
import { VisualBuilder } from '../components/strategy-studio/visual-builder/VisualBuilder';
import { AIChatSidebar } from '../components/strategy-studio/AIChatSidebar';

// Icons (keep CodeIcon for empty state)
const CodeIcon = ({ className }: { className?: string }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
    >
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
        />
    </svg>
);

const StrategyStudio = () => {
    const navigate = ReactRouterDOM.useNavigate();

    // Editor State - Persisted
    const [scriptContent, setScriptContent] = useState(
        () => localStorage.getItem('strategyStudio_scriptContent') || ''
    );
    const [strategyName, setStrategyName] = useState(
        () => localStorage.getItem('strategyStudio_strategyName') || 'Untitled'
    );
    const [isDirty, setIsDirty] = useState(
        () => localStorage.getItem('strategyStudio_isDirty') === 'true'
    );
    const [activeScript, setActiveScript] = useState<string | null>(() =>
        localStorage.getItem('strategyStudio_activeScript')
    );

    // UI State
    const [logs, setLogs] = useState<
        {
            timestamp: string;
            message: string;
            type: 'info' | 'error' | 'success' | 'warn';
            line?: number;
            column?: number;
            code?: string;
            suggestion?: string;
            category?: string;
        }[]
    >([]);
    const [savedStrategies, setSavedStrategies] = useState<Strategy[]>([]);

    // Modal State
    const [isScriptModalOpen, setIsScriptModalOpen] = useState(false);

    // Deletion State
    const [strategyToDelete, setStrategyToDelete] = useState<Strategy | null>(null);
    const [lastActiveScript, setLastActiveScript] = useState<string | null>(() =>
        localStorage.getItem('strategyStudio_lastActiveScript')
    );

    // Console State
    const [consoleHeight, setConsoleHeight] = useState(() => {
        const saved = localStorage.getItem('strategyStudio_consoleHeight');
        return saved ? parseInt(saved) : 160;
    });
    const [isConsoleOpen, setIsConsoleOpen] = useState(() => {
        const saved = localStorage.getItem('strategyStudio_isConsoleOpen');
        return saved !== 'false';
    });

    // Visual Builder mode
    const [editorMode, setEditorMode] = useState<'visual' | 'code'>(() => {
        return (localStorage.getItem('strategyStudio_editorMode') as 'visual' | 'code') || 'code';
    });

    // AI Sidebar
    const [isAIOpen, setIsAIOpen] = useState(() => {
        return localStorage.getItem('strategyStudio_isAIOpen') === 'true';
    });
    const [aiExternalMessage, setAiExternalMessage] = useState<string | null>(null);

    // Loading States
    const [isSaving, setIsSaving] = useState(false);
    const [isChecking, setIsChecking] = useState(false);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [diagnosticCounts, setDiagnosticCounts] = useState({ errors: 0, warnings: 0 });

    // Editor ref for Monaco model access
    const editorRef = useRef<any>(null);
    // Track last diagnostic message to prevent console flooding
    const lastDiagnosticMsg = useRef<string>('');

    // Monaco Hook
    const monaco = useMonaco();

    // Detect script type from content
    const detectedScriptType = useMemo((): 'INDICATOR' | 'STRATEGY' | 'KURI' => {
        if (!scriptContent.trim()) return 'KURI';
        // Kuri v2: detect type from YAML header "type: indicator" or "type: strategy"
        const yamlMatch = scriptContent.match(
            /^---[\s\S]*?type:\s*(indicator|strategy)[\s\S]*?---/m
        );
        if (yamlMatch) {
            return yamlMatch[1] === 'strategy' ? 'STRATEGY' : 'INDICATOR';
        }
        return 'KURI';
    }, [scriptContent]);

    // --- Effects ---

    useEffect(() => {
        if (!monaco) return;

        // Register Kuri v2.0 language (syntax, autocomplete, hover, theme)
        const registeredLanguages = monaco.languages.getLanguages();
        const alreadyRegistered = registeredLanguages.some((lang: any) => lang.id === 'kuri');
        if (!alreadyRegistered) {
            registerKuriLanguage(monaco);
        }

        // Also register legacy 'script' ID pointing to kuri tokenizer for backward compat
        const scriptRegistered = registeredLanguages.some((lang: any) => lang.id === 'script');
        if (!scriptRegistered) {
            monaco.languages.register({ id: 'script' });
        }
    }, [monaco]);

    // Validate script type — mark strategy.* calls as errors in indicator scripts
    useEffect(() => {
        if (!monaco || !activeScript) return;
        const model = editorRef.current?.getModel?.();
        if (!model) return;

        if (detectedScriptType === 'INDICATOR') {
            const markers: any[] = [];
            const lines = scriptContent.split('\n');
            lines.forEach((line, i) => {
                // Skip comment lines — don't flag strategy.* inside comments
                const trimmed = line.trim();
                if (trimmed.startsWith('//')) return;
                // Strip inline comments before checking
                const codePart = line.includes('//') ? line.substring(0, line.indexOf('//')) : line;
                const pattern = /\bstrategy\.(entry|close|exit_sl|exit_tp|risk)\b/g;
                let match;
                while ((match = pattern.exec(codePart)) !== null) {
                    markers.push({
                        startLineNumber: i + 1,
                        startColumn: match.index + 1,
                        endLineNumber: i + 1,
                        endColumn: match.index + match[0].length + 1,
                        message: `'${match[0]}()' is not allowed in indicator scripts. Indicators should only use mark() — remove strategy functions or change type to strategy in the YAML header.`,
                        severity: monaco.MarkerSeverity.Error,
                    });
                }
            });
            monaco.editor.setModelMarkers(model, 'kuri-type-check', markers);
        } else {
            const model2 = editorRef.current?.getModel?.();
            if (model2) monaco.editor.setModelMarkers(model2, 'kuri-type-check', []);
        }
    }, [monaco, scriptContent, detectedScriptType, activeScript]);

    // Real-time ScriptEngine diagnostics — parse/typecheck on every content change (debounced)
    useEffect(() => {
        if (!monaco) return;
        const model = editorRef.current?.getModel?.();
        if (!model) return;
        if (!scriptContent || scriptContent.trim().length === 0) {
            monaco.editor.setModelMarkers(model, 'kuri-diagnostics', []);
            setDiagnosticCounts({ errors: 0, warnings: 0 });
            return;
        }

        const timeoutId = setTimeout(() => {
            try {
                const diagnostics = ScriptEngine.provideDiagnostics(scriptContent);
                const markers = diagnostics.map((d: ScriptDiagnostic) => ({
                    startLineNumber: d.line,
                    startColumn: d.column,
                    endLineNumber: d.endLine,
                    endColumn: d.endColumn,
                    message: d.message,
                    severity:
                        d.severity === 'error'
                            ? monaco.MarkerSeverity.Error
                            : d.severity === 'warning'
                              ? monaco.MarkerSeverity.Warning
                              : monaco.MarkerSeverity.Info,
                }));
                const currentModel = editorRef.current?.getModel?.();
                if (currentModel) {
                    monaco.editor.setModelMarkers(currentModel, 'kuri-diagnostics', markers);
                }

                // Update error/warning counts for toolbar badge
                const errors = diagnostics.filter((d: ScriptDiagnostic) => d.severity === 'error');
                const warnings = diagnostics.filter(
                    (d: ScriptDiagnostic) => d.severity === 'warning'
                );
                setDiagnosticCounts({ errors: errors.length, warnings: warnings.length });

                // Surface errors and warnings in bottom console (deduplicated)
                if (diagnostics.length > 0) {
                    const summaryKey = diagnostics
                        .map((d: ScriptDiagnostic) => `${d.severity}:${d.line}:${d.message}`)
                        .join('|');
                    if (summaryKey !== lastDiagnosticMsg.current) {
                        lastDiagnosticMsg.current = summaryKey;
                        // Log each error/warning individually with line info
                        for (const d of errors) {
                            addLog({
                                message: d.message,
                                type: 'error',
                                line: d.line,
                                column: d.column,
                                code: d.code,
                                suggestion: d.suggestion,
                            });
                        }
                        for (const w of warnings) {
                            addLog({
                                message: w.message,
                                type: 'warn',
                                line: w.line,
                                column: w.column,
                                code: w.code,
                                suggestion: w.suggestion,
                            });
                        }
                    }
                } else {
                    lastDiagnosticMsg.current = '';
                }
            } catch (e) {
                // Diagnostics provider itself crashed — surface to console
                addLog({ message: `Diagnostics error: ${(e as Error).message}`, type: 'error' });
            }
        }, 500); // 500ms debounce

        return () => clearTimeout(timeoutId);
    }, [monaco, scriptContent]);

    useEffect(() => {
        localStorage.setItem('strategyStudio_consoleHeight', consoleHeight.toString());
    }, [consoleHeight]);

    useEffect(() => {
        localStorage.setItem('strategyStudio_isConsoleOpen', isConsoleOpen.toString());
    }, [isConsoleOpen]);

    useEffect(() => {
        localStorage.setItem('strategyStudio_editorMode', editorMode);
    }, [editorMode]);

    useEffect(() => {
        localStorage.setItem('strategyStudio_isAIOpen', isAIOpen.toString());
    }, [isAIOpen]);

    useEffect(() => {
        if (activeScript) {
            localStorage.setItem('strategyStudio_activeScript', activeScript);
            localStorage.setItem('strategyStudio_scriptContent', scriptContent);
            localStorage.setItem('strategyStudio_strategyName', strategyName);
            localStorage.setItem('strategyStudio_isDirty', String(isDirty));
        } else {
            localStorage.removeItem('strategyStudio_activeScript');
            localStorage.removeItem('strategyStudio_scriptContent');
            localStorage.removeItem('strategyStudio_strategyName');
            localStorage.removeItem('strategyStudio_isDirty');
        }
    }, [activeScript, scriptContent, strategyName, isDirty]);

    useEffect(() => {
        if (lastActiveScript) {
            localStorage.setItem('strategyStudio_lastActiveScript', lastActiveScript);
        } else {
            localStorage.removeItem('strategyStudio_lastActiveScript');
        }
    }, [lastActiveScript]);

    useEffect(() => {
        loadHistory();
        addLog({ message: 'Strategy Studio initialized. Ready.', type: 'info' });
    }, []);

    // --- Handlers ---

    const isResizingConsole = useRef(false);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isResizingConsole.current) {
                const newHeight = Math.min(
                    Math.max(window.innerHeight - e.clientY, 32),
                    window.innerHeight - 100
                );
                setConsoleHeight(newHeight);
            }
        };

        const handleMouseUp = () => {
            isResizingConsole.current = false;
            document.body.style.cursor = 'default';
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    const startResizingConsole = (e: React.MouseEvent) => {
        isResizingConsole.current = true;
        document.body.style.cursor = 'row-resize';
        e.preventDefault();
    };

    const loadHistory = async () => {
        setLoadingHistory(true);
        try {
            const list = await getStrategies();
            setSavedStrategies(list);
        } catch (e) {
            addLog({ message: `Failed to load history: ${(e as Error).message}`, type: 'error' });
        } finally {
            setLoadingHistory(false);
        }
    };

    const addLog = (opts: {
        message: string;
        type: 'info' | 'error' | 'success' | 'warn';
        line?: number;
        column?: number;
        code?: string;
        suggestion?: string;
        category?: string;
    }) => {
        const timestamp = new Date().toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
        setLogs((prev) => [
            ...prev,
            {
                timestamp,
                message: opts.message,
                type: opts.type,
                line: opts.line,
                column: opts.column,
                code: opts.code,
                suggestion: opts.suggestion,
                category: opts.category,
            },
        ]);
    };

    // Navigate editor to a specific line/column (called from console double-click)
    const navigateToLine = (line: number, column?: number) => {
        const editor = editorRef.current;
        if (!editor) return;
        const col = column || 1;
        editor.revealLineInCenter(line);
        editor.setPosition({ lineNumber: line, column: col });
        editor.focus();
        // Highlight the line briefly
        const decorations = editor.deltaDecorations(
            [],
            [
                {
                    range: {
                        startLineNumber: line,
                        startColumn: 1,
                        endLineNumber: line,
                        endColumn: 1,
                    },
                    options: {
                        isWholeLine: true,
                        className: 'error-line-highlight',
                        glyphMarginClassName: 'error-glyph-margin',
                    },
                },
            ]
        );
        // Remove highlight after 2 seconds
        setTimeout(() => {
            editor.deltaDecorations(decorations, []);
        }, 2000);
    };

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

    const loadStrategy = (s: Strategy) => {
        const content = s.scriptSource || '';
        setScriptContent(content);
        setStrategyName(s.name);
        setActiveScript(s.id);
        setIsDirty(false);
        if (!content.trim()) {
            addLog({ message: `Loaded "${s.name}" — script is empty.`, type: 'info' });
        } else {
            addLog({ message: `Loaded strategy: ${s.name}`, type: 'info' });
        }
    };

    const loadHelper = (kuriScript: string, name: string, id: string) => {
        setScriptContent(kuriScript.trim());
        setStrategyName(name);
        setActiveScript(id);
        setIsDirty(true);
        addLog({ message: `Loaded built-in indicator: ${name}`, type: 'success' });
    };

    const loadTemplate = (code: string, name: string, id: string) => {
        setScriptContent(code.trim());
        setStrategyName(name);
        setActiveScript(id);
        setIsDirty(true);
        addLog({ message: `Loaded template: ${name}`, type: 'success' });
    };

    const requestSave = async (): Promise<string | null> => {
        try {
            if (!scriptContent.trim()) throw new Error('Script is empty');
            if (!strategyName.trim()) throw new Error('Script name cannot be empty');

            // Pre-save compilation check — block saving scripts with errors
            // Warnings are shown but don't block saving (e.g., unused variables)
            const diagnostics = ScriptEngine.provideDiagnostics(scriptContent);
            const errors = diagnostics.filter((d: ScriptDiagnostic) => d.severity === 'error');
            const warnings = diagnostics.filter((d: ScriptDiagnostic) => d.severity === 'warning');

            // Log warnings to console but don't block
            if (warnings.length > 0) {
                warnings.forEach((w: ScriptDiagnostic) =>
                    addLog({
                        message: w.message,
                        type: 'warn',
                        line: w.line,
                        column: w.column,
                        code: w.code,
                        suggestion: w.suggestion,
                    })
                );
            }

            // Block save on errors
            if (errors.length > 0) {
                const msg = errors
                    .map((e: ScriptDiagnostic) => `Line ${e.line}: ${e.message}`)
                    .join('\n');
                errors.forEach((e: ScriptDiagnostic) =>
                    addLog({
                        message: e.message,
                        type: 'error',
                        line: e.line,
                        column: e.column,
                        code: e.code,
                        suggestion: e.suggestion,
                    })
                );
                throw new Error(
                    `Script has ${errors.length} error${errors.length > 1 ? 's' : ''} — fix before saving.\n${msg}`
                );
            }

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

            // Script-type-specific checks
            if (scriptType === 'STRATEGY' && !/\bstrategy\.entry\s*\(/.test(scriptContent)) {
                throw new Error(
                    'Strategy must have at least one strategy.entry() call to generate signals.'
                );
            }
            // Indicator validation removed — indicators are created in Market page editor

            setIsSaving(true);
            const strategyToSave = {
                name: strategyName,
                description: `ScriptEngine ${scriptType.toLowerCase()}: ${strategyName}`,
                type: scriptType as 'INDICATOR' | 'STRATEGY',
                id:
                    activeScript &&
                    !activeScript.startsWith('new-') &&
                    !activeScript.startsWith('builtin-')
                        ? activeScript
                        : undefined,
                scriptSource: scriptContent,
                timeframe: '1h',
                symbolScope: [],
                indicators: [],
                entryRules: [],
                exitRules: [],
                isActive: false,
            };

            const savedId = await saveStrategy(strategyToSave);

            // Update activeScript with the real DB ID (important for new and built-in scripts)
            if (
                savedId &&
                (activeScript?.startsWith('new-') || activeScript?.startsWith('builtin-'))
            ) {
                setActiveScript(savedId);
            }

            addLog({ message: `${scriptType} "${strategyName}" saved to cloud!`, type: 'success' });

            loadHistory();
            setIsDirty(false);
            return savedId;
        } catch (e) {
            addLog({ message: `Save failed: ${(e as Error).message}`, type: 'error' });
            return null;
        } finally {
            setIsSaving(false);
        }
    };

    const deleteStrategyHandler = async (strategy: Strategy) => {
        try {
            await deleteStrategy(strategy.id);
            addLog({ message: `Deleted strategy: ${strategy.name}`, type: 'success' });
            if (activeScript === strategy.id) {
                setScriptContent('');
                setStrategyName('New Strategy');
                setActiveScript(null);
            }
            loadHistory();
        } catch (e) {
            addLog({
                message: `Failed to delete strategy: ${(e as Error).message}`,
                type: 'error',
            });
        }
    };

    const handleCheck = () => {
        if (!scriptContent.trim()) {
            addLog({ message: 'Script is empty — nothing to check.', type: 'error' });
            return;
        }
        setIsChecking(true);
        try {
            // 1. Must have YAML header with type: indicator or type: strategy
            const scriptType = detectedScriptType;
            if (scriptType !== 'INDICATOR' && scriptType !== 'STRATEGY') {
                addLog({
                    message:
                        '✗ Script must have a YAML header with type: indicator or type: strategy.',
                    type: 'error',
                });
                return;
            }

            // 2. Run full diagnostics (lexer → parser → type checker → IR → semantic)
            const diagnostics = ScriptEngine.provideDiagnostics(scriptContent);
            const errors = diagnostics.filter((d: ScriptDiagnostic) => d.severity === 'error');
            const warnings = diagnostics.filter((d: ScriptDiagnostic) => d.severity === 'warning');

            if (errors.length > 0) {
                errors.forEach((e: ScriptDiagnostic) =>
                    addLog({
                        message: e.message,
                        type: 'error',
                        line: e.line,
                        column: e.column,
                        code: e.code,
                        suggestion: e.suggestion,
                    })
                );
                addLog({
                    message: `Check failed — ${errors.length} error${errors.length > 1 ? 's' : ''} found.`,
                    type: 'error',
                });
                return;
            }
            if (warnings.length > 0) {
                warnings.forEach((w: ScriptDiagnostic) =>
                    addLog({
                        message: w.message,
                        type: 'warn',
                        line: w.line,
                        column: w.column,
                        code: w.code,
                        suggestion: w.suggestion,
                    })
                );
                addLog({
                    message: `Check complete — ${warnings.length} warning${warnings.length > 1 ? 's' : ''} found.`,
                    type: 'warn',
                });
                return;
            }

            // 3. Script-type-specific checks
            if (scriptType === 'INDICATOR' && !/\bmark\s*\(|\bmark\.\w+\s*\(/.test(scriptContent)) {
                addLog({
                    message:
                        '✗ Indicator must have at least one mark() or mark.*() call to display output on the chart.',
                    type: 'error',
                });
                return;
            }
            if (scriptType === 'STRATEGY' && !/\bstrategy\.entry\s*\(/.test(scriptContent)) {
                addLog({
                    message: '✗ Strategy must have at least one strategy.entry() call.',
                    type: 'error',
                });
                return;
            }

            // All checks passed
            addLog({
                message: `✓ ${scriptType} "${strategyName}" — no errors found. Ready to save.`,
                type: 'success',
            });
        } catch (e) {
            addLog({ message: `Check error: ${(e as Error).message}`, type: 'error' });
        } finally {
            setIsChecking(false);
        }
    };

    const handleAddToChart = async () => {
        if (!scriptContent.trim()) {
            addLog({ message: 'Script is empty — nothing to add.', type: 'error' });
            return;
        }
        try {
            // Compile first to catch errors before saving
            const bridge = getKuriBridge();
            const { errors } = bridge.compile(scriptContent);
            const compileErrors = errors.filter((e: KuriError) => e.phase !== 'runtime');
            if (compileErrors.length > 0) {
                compileErrors.forEach((e: KuriError) =>
                    addLog({
                        message: e.message,
                        type: 'error',
                        line: e.line,
                        column: e.col,
                    })
                );
                addLog({
                    message: `Compilation failed — ${compileErrors.length} error${compileErrors.length > 1 ? 's' : ''}. Fix errors before adding to chart.`,
                    type: 'error',
                });
                return;
            }

            const savedId = await requestSave();
            if (savedId) {
                navigate(`/market?addScript=${savedId}`);
                addLog({ message: 'Opening chart...', type: 'info' });
            } else {
                addLog({ message: 'Save failed — cannot add to chart.', type: 'error' });
            }
        } catch (e) {
            addLog({ message: `Failed to add to chart: ${(e as Error).message}`, type: 'error' });
        }
    };

    return (
        <>
            {/* Desktop Restriction Message */}
            <div className="lg:hidden flex items-center justify-center h-full bg-dark-bg p-6 text-white">
                Desktop View Only
            </div>

            <div className="hidden lg:flex flex-col h-full bg-[#0f0f0f] text-gray-300 font-sans overflow-hidden">
                <TopToolbar
                    strategyName={strategyName}
                    setStrategyName={setStrategyName}
                    activeScript={activeScript}
                    isDirty={isDirty}
                    isSaving={isSaving}
                    onSave={requestSave}
                    onOpenScript={() => setIsScriptModalOpen(true)}
                    onRun={handleAddToChart}
                    onCreateNew={createNew}
                    editorMode={editorMode}
                    onModeChange={setEditorMode}
                />

                {/* Main Editor Area + AI Sidebar */}
                <div className="flex-1 overflow-hidden relative flex">
                    {/* Editor */}
                    <div className="flex-1 overflow-hidden relative">
                        {activeScript ? (
                            <>
                            <div className={editorMode === 'visual' ? 'h-full' : 'hidden'}>
                                <VisualBuilder
                                    onCodeChange={() => {
                                        // Disabled: Visual Builder → Code Editor sync is turned off
                                    }}
                                    strategyName={strategyName}
                                />
                            </div>
                            {editorMode === 'code' && (
                                <Editor
                                    height="100%"
                                    defaultLanguage="kuri"
                                    language="kuri"
                                    value={scriptContent}
                                    theme="kuri-dark"
                                    beforeMount={(m) => {
                                        registerKuriLanguage(m);
                                    }}
                                    onMount={(editor) => {
                                        editorRef.current = editor;
                                    }}
                                    onChange={(value) => {
                                        if (value !== undefined) {
                                            setScriptContent(value);
                                            setIsDirty(true);
                                        }
                                    }}
                                    options={{
                                        minimap: { enabled: false },
                                        fontSize: 13,
                                        lineNumbers: 'on',
                                        scrollBeyondLastLine: false,
                                        automaticLayout: true,
                                        padding: { top: 16, bottom: 16 },
                                        fontFamily:
                                            "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                                    }}
                                />
                            )}
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                <div className="mb-4 text-6xl opacity-10">Waiting for Script</div>
                                <h2 className="text-xl font-medium mb-4">No Script Selected</h2>
                                <div className="flex gap-4">
                                    <button
                                        onClick={() => createNew()}
                                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded shadow-lg transition-colors"
                                    >
                                        New Strategy
                                    </button>
                                    <button
                                        onClick={() => setIsScriptModalOpen(true)}
                                        className="px-6 py-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded border border-white/10 transition-colors"
                                    >
                                        Open Existing...
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* AI Chat Sidebar */}
                    <AIChatSidebar
                        isOpen={isAIOpen}
                        onClose={() => setIsAIOpen(false)}
                        currentCode={scriptContent}
                        consoleErrors={logs
                            .filter((l) => l.type === 'error')
                            .slice(-5)
                            .map((l) => l.message)}
                        onApplyCode={(code) => {
                            setScriptContent(code);
                            setIsDirty(true);
                            addLog({ message: 'AI code applied to editor.', type: 'success' });
                        }}
                        externalMessage={aiExternalMessage}
                        onExternalMessageHandled={() => setAiExternalMessage(null)}
                    />
                </div>

                {/* Bottom Console */}
                <BottomConsole
                    logs={logs}
                    isOpen={isConsoleOpen}
                    height={consoleHeight}
                    errorCount={diagnosticCounts.errors}
                    warningCount={diagnosticCounts.warnings}
                    onToggle={() => setIsConsoleOpen(!isConsoleOpen)}
                    onClear={() => setLogs([])}
                    onResizeStart={startResizingConsole}
                    onNavigateToLine={navigateToLine}
                    onSendErrorToAI={(errors) => {
                        setIsAIOpen(true);
                        const prompt = `Fix the errors in this script. Here are the console errors:\n${errors.join('\n')}\n\nCode:\n\`\`\`kuri\n${scriptContent}\n\`\`\``;
                        setAiExternalMessage(prompt);
                    }}
                />

                <OpenScriptModal
                    isOpen={isScriptModalOpen}
                    onClose={() => setIsScriptModalOpen(false)}
                    savedStrategies={savedStrategies.filter((s) => s.type !== 'INDICATOR')}
                    onLoadStrategy={loadStrategy}
                    onLoadHelper={loadHelper}
                    onDelete={deleteStrategyHandler}
                    loading={loadingHistory}
                />
            </div>
        </>
    );
};

export default StrategyStudio;
