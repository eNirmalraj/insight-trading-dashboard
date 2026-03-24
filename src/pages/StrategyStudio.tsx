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
    BUILT_IN_INDICATORS,
    indicatorToJSON,
    indicatorToKuri,
} from '../services/builtInIndicators';
import { BUILTIN_STRATEGY_NAMES } from '../constants';
import { kuriLanguageDef, kuriLanguageConfig } from '../config/kuriLanguage';
import { KURI_DOCS } from '../config/kuriDocs';
import { Kuri } from '@insight/kuri-engine';
import type { KuriDiagnostic } from '@insight/kuri-engine';

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
    const [kuriContent, setKuriContent] = useState(
        () => localStorage.getItem('strategyStudio_kuriContent') || ''
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
        if (!kuriContent.trim()) return 'KURI';
        const lines = kuriContent.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('//') || trimmed === '') continue;
            if (/^indicator\s*\(/.test(trimmed)) return 'INDICATOR';
            if (/^strategy\s*\(/.test(trimmed)) return 'STRATEGY';
            break;
        }
        if (/\bindicator\s*\(/.test(kuriContent)) return 'INDICATOR';
        if (/\bstrategy\s*\(/.test(kuriContent)) return 'STRATEGY';
        return 'KURI';
    }, [kuriContent]);

    // --- Effects ---

    useEffect(() => {
        if (!monaco) return;

        // Guard against duplicate language registration
        const registeredLanguages = monaco.languages.getLanguages();
        const alreadyRegistered = registeredLanguages.some((lang: any) => lang.id === 'kuri');
        if (!alreadyRegistered) {
            monaco.languages.register({ id: 'kuri' });
        }

        monaco.languages.setMonarchTokensProvider('kuri', kuriLanguageDef);
        monaco.languages.setLanguageConfiguration('kuri', kuriLanguageConfig as any);

        // Register Hover Provider (store disposable for cleanup)
        const hoverDisposable = monaco.languages.registerHoverProvider('kuri', {
            provideHover: (model: any, position: any) => {
                const word = model.getWordAtPosition(position);
                if (!word) return null;

                const lineContent = model.getLineContent(position.lineNumber);
                const wordStart = word.startColumn - 1; // 0-based index
                let fullWord = word.word;

                // Detect namespace prefix by scanning backwards from the word
                const prefixes = ['strategy.', 'ta.', 'math.', 'array.', 'map.', 'request.', 'ml.'];
                for (const prefix of prefixes) {
                    const prefixLen = prefix.length;
                    if (
                        wordStart >= prefixLen &&
                        lineContent.substring(wordStart - prefixLen, wordStart) === prefix
                    ) {
                        fullWord = prefix + word.word;
                        break;
                    }
                }

                const doc = (KURI_DOCS as any)[fullWord];
                if (doc) {
                    const contents = [{ value: `**${fullWord}**` }, { value: doc.description }];

                    if (doc.params && doc.params.length > 0) {
                        let paramsMd = '**Parameters:**\n';
                        doc.params.forEach((p: any) => {
                            paramsMd += `- \`${p.name || ''}\`${p.type ? ` (${p.type})` : ''}: ${p.desc}\n`;
                        });
                        contents.push({ value: paramsMd });
                    }

                    if (doc.example) {
                        contents.push({
                            value: `**Example:**\n\`\`\`kuri\n${doc.example}\n\`\`\``,
                        });
                    }

                    return {
                        range: new monaco.Range(
                            position.lineNumber,
                            word.startColumn,
                            position.lineNumber,
                            word.endColumn
                        ),
                        contents: contents,
                    };
                }

                return null;
            },
        });

        // Register Completion Provider for Kuri built-in functions
        const completionDisposable = monaco.languages.registerCompletionItemProvider('kuri', {
            triggerCharacters: ['.'],
            provideCompletionItems: (model: any, position: any) => {
                const word = model.getWordUntilPosition(position);
                const lineContent = model.getLineContent(position.lineNumber);
                const textBefore = lineContent.substring(0, position.column - 1);
                const range = {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: word.startColumn,
                    endColumn: word.endColumn,
                };

                const suggestions: any[] = [];

                // Check if user typed a namespace prefix (e.g. "ta.")
                const nsPrefixMatch = textBefore.match(
                    /\b(ta|strategy|math|array|map|request|ml)\.\s*$/
                );
                const nsPrefix = nsPrefixMatch ? nsPrefixMatch[1] + '.' : null;

                // Add matching docs entries as completions
                for (const [key, doc] of Object.entries(KURI_DOCS as Record<string, any>)) {
                    // Skip internal VM methods (no dot = internal unless it's a top-level Kuri function)
                    if (/^execute|^apply|^resolve|^evaluate/.test(key)) continue;

                    if (nsPrefix) {
                        // Only suggest functions matching the typed namespace
                        if (key.startsWith(nsPrefix)) {
                            const funcName = key.substring(nsPrefix.length);
                            suggestions.push({
                                label: funcName,
                                kind: monaco.languages.CompletionItemKind.Function,
                                insertText: funcName,
                                documentation: doc.description,
                                detail: key,
                                range,
                            });
                        }
                    } else {
                        suggestions.push({
                            label: key,
                            kind: key.includes('.')
                                ? monaco.languages.CompletionItemKind.Method
                                : monaco.languages.CompletionItemKind.Function,
                            insertText: key,
                            documentation: doc.description,
                            range,
                        });
                    }
                }

                // Add keyword completions when not in namespace context
                if (!nsPrefix) {
                    const keywords = [
                        'if',
                        'else',
                        'for',
                        'while',
                        'return',
                        'break',
                        'continue',
                        'var',
                        'func',
                        'plot',
                        'input',
                    ];
                    for (const kw of keywords) {
                        suggestions.push({
                            label: kw,
                            kind: monaco.languages.CompletionItemKind.Keyword,
                            insertText: kw,
                            range,
                        });
                    }
                    // Add namespace suggestions
                    const namespaces = ['ta', 'strategy', 'math', 'array', 'map', 'request', 'ml'];
                    for (const ns of namespaces) {
                        suggestions.push({
                            label: ns,
                            kind: monaco.languages.CompletionItemKind.Module,
                            insertText: ns,
                            range,
                        });
                    }
                }

                return { suggestions };
            },
        });

        // Define Theme
        monaco.editor.defineTheme('kuri-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: 'keyword', foreground: 'C586C0' },
                { token: 'type', foreground: '4EC9B0' },
                { token: 'identifier', foreground: '9CDCFE' },
                { token: 'string', foreground: 'CE9178' },
                { token: 'number', foreground: 'B5CEA8' },
                { token: 'comment', foreground: '6A9955' },
            ],
            colors: {
                'editor.background': '#0f0f0f',
            },
        });

        // Cleanup: dispose providers to prevent stacking on re-render/HMR
        return () => {
            hoverDisposable.dispose();
            completionDisposable.dispose();
        };
    }, [monaco]);

    // Validate script type — mark strategy.* calls as errors in indicator scripts
    useEffect(() => {
        if (!monaco || !activeScript) return;
        const model = editorRef.current?.getModel?.();
        if (!model) return;

        if (detectedScriptType === 'INDICATOR') {
            const markers: any[] = [];
            const lines = kuriContent.split('\n');
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
                        message: `'${match[0]}()' is not allowed in indicator scripts. Indicators should only use plot() — remove strategy functions or change to strategy().`,
                        severity: monaco.MarkerSeverity.Error,
                    });
                }
            });
            monaco.editor.setModelMarkers(model, 'kuri-type-check', markers);
        } else {
            const model2 = editorRef.current?.getModel?.();
            if (model2) monaco.editor.setModelMarkers(model2, 'kuri-type-check', []);
        }
    }, [monaco, kuriContent, detectedScriptType, activeScript]);

    // Real-time Kuri diagnostics — parse/typecheck on every content change (debounced)
    useEffect(() => {
        if (!monaco) return;
        const model = editorRef.current?.getModel?.();
        if (!model) return;
        if (!kuriContent || kuriContent.trim().length === 0) {
            monaco.editor.setModelMarkers(model, 'kuri-diagnostics', []);
            setDiagnosticCounts({ errors: 0, warnings: 0 });
            return;
        }

        const timeoutId = setTimeout(() => {
            try {
                const diagnostics = Kuri.provideDiagnostics(kuriContent);
                const markers = diagnostics.map((d: KuriDiagnostic) => ({
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
                const errors = diagnostics.filter((d: KuriDiagnostic) => d.severity === 'error');
                const warnings = diagnostics.filter(
                    (d: KuriDiagnostic) => d.severity === 'warning'
                );
                setDiagnosticCounts({ errors: errors.length, warnings: warnings.length });

                // Surface errors and warnings in bottom console (deduplicated)
                if (diagnostics.length > 0) {
                    const summaryKey = diagnostics
                        .map((d: KuriDiagnostic) => `${d.severity}:${d.line}:${d.message}`)
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
    }, [monaco, kuriContent]);

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
            localStorage.setItem('strategyStudio_kuriContent', kuriContent);
            localStorage.setItem('strategyStudio_strategyName', strategyName);
            localStorage.setItem('strategyStudio_isDirty', String(isDirty));
        } else {
            localStorage.removeItem('strategyStudio_activeScript');
            localStorage.removeItem('strategyStudio_kuriContent');
            localStorage.removeItem('strategyStudio_strategyName');
            localStorage.removeItem('strategyStudio_isDirty');
        }
    }, [activeScript, kuriContent, strategyName, isDirty]);

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

    const createNew = (type: 'STRATEGY' | 'INDICATOR' = 'STRATEGY') => {
        if (type === 'INDICATOR') {
            setKuriContent(
                `//@version=3\nindicator("My Indicator", shorttitle="Ind", overlay=true)\n`
            );
            setStrategyName('New Indicator');
        } else {
            setKuriContent(
                `//@version=3\nstrategy("My Strategy", shorttitle="Strat", overlay=true, initial_capital=10000)\n`
            );
            setStrategyName('New Strategy');
        }
        setActiveScript('new-' + Date.now());
        setIsDirty(true);
        addLog({ message: `Created new Kuri ${type.toLowerCase()}.`, type: 'success' });
    };

    const loadStrategy = (s: Strategy) => {
        const content = s.kuriScript || '';
        setKuriContent(content);
        setStrategyName(s.name);
        setActiveScript(s.id);
        setIsDirty(false);
        if (!content.trim()) {
            addLog({ message: `Loaded "${s.name}" — script is empty.`, type: 'info' });
        } else {
            addLog({ message: `Loaded strategy: ${s.name}`, type: 'info' });
        }
    };

    const loadHelper = (json: string, name: string, id: string) => {
        try {
            const indicator = JSON.parse(json);
            const code = indicatorToKuri(indicator);

            setKuriContent(code);
            setStrategyName(name);
            setActiveScript(id);
            setIsDirty(true);
            addLog({ message: `Loaded built-in indicator: ${name}`, type: 'success' });
        } catch (e) {
            addLog({ message: `Failed to load indicator: ${(e as Error).message}`, type: 'error' });
        }
    };

    const loadTemplate = (code: string, name: string, id: string) => {
        setKuriContent(code.trim());
        setStrategyName(name);
        setActiveScript(id);
        setIsDirty(true);
        addLog({ message: `Loaded template: ${name}`, type: 'success' });
    };

    const requestSave = async (): Promise<string | null> => {
        try {
            if (!kuriContent.trim()) throw new Error('Script is empty');
            if (!strategyName.trim()) throw new Error('Script name cannot be empty');

            // Pre-save compilation check — block saving scripts with errors
            // Warnings are shown but don't block saving (e.g., unused variables)
            const diagnostics = Kuri.provideDiagnostics(kuriContent);
            const errors = diagnostics.filter((d: KuriDiagnostic) => d.severity === 'error');
            const warnings = diagnostics.filter((d: KuriDiagnostic) => d.severity === 'warning');

            // Log warnings to console but don't block
            if (warnings.length > 0) {
                warnings.forEach((w: KuriDiagnostic) =>
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
                    .map((e: KuriDiagnostic) => `Line ${e.line}: ${e.message}`)
                    .join('\n');
                errors.forEach((e: KuriDiagnostic) =>
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

            // Must declare as indicator() or strategy() — no untyped scripts allowed
            const scriptType = detectedScriptType;
            if (scriptType !== 'INDICATOR' && scriptType !== 'STRATEGY') {
                throw new Error(
                    'Script must start with indicator("Name") or strategy("Name"). Add a declaration at the top of your script.'
                );
            }

            // Script-type-specific checks
            if (scriptType === 'STRATEGY' && !/\bstrategy\.entry\s*\(/.test(kuriContent)) {
                throw new Error(
                    'Strategy must have at least one strategy.entry() call to generate signals.'
                );
            }
            if (
                scriptType === 'INDICATOR' &&
                !/\bplot\s*\(|\bline\.new\s*\(|\blabel\.new\s*\(|\bbox\.new\s*\(|\bplotshape\s*\(|\bplotchar\s*\(|\bhline\s*\(/.test(
                    kuriContent
                )
            ) {
                throw new Error(
                    'Indicator must have at least one plot() or drawing call (line.new, label.new) to display output on the chart.'
                );
            }

            setIsSaving(true);
            const strategyToSave = {
                name: strategyName,
                description: `Kuri ${scriptType.toLowerCase()}: ${strategyName}`,
                type: scriptType as 'INDICATOR' | 'STRATEGY',
                id:
                    activeScript &&
                    !activeScript.startsWith('new-') &&
                    !activeScript.startsWith('builtin-')
                        ? activeScript
                        : undefined,
                kuriScript: kuriContent,
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
                setKuriContent('');
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
        if (!kuriContent.trim()) {
            addLog({ message: 'Script is empty — nothing to check.', type: 'error' });
            return;
        }
        setIsChecking(true);
        try {
            // 1. Must have indicator() or strategy() declaration
            const scriptType = detectedScriptType;
            if (scriptType !== 'INDICATOR' && scriptType !== 'STRATEGY') {
                addLog({
                    message: '✗ Script must start with indicator("Name") or strategy("Name").',
                    type: 'error',
                });
                return;
            }

            // 2. Run full diagnostics (lexer → parser → type checker → IR → semantic)
            const diagnostics = Kuri.provideDiagnostics(kuriContent);
            const errors = diagnostics.filter((d: KuriDiagnostic) => d.severity === 'error');
            const warnings = diagnostics.filter((d: KuriDiagnostic) => d.severity === 'warning');

            if (errors.length > 0) {
                errors.forEach((e: KuriDiagnostic) =>
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
                warnings.forEach((w: KuriDiagnostic) =>
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
            if (
                scriptType === 'INDICATOR' &&
                !/\bplot\s*\(|\bline\.new\s*\(|\blabel\.new\s*\(|\bbox\.new\s*\(|\bplotshape\s*\(|\bplotchar\s*\(|\bhline\s*\(/.test(
                    kuriContent
                )
            ) {
                addLog({
                    message:
                        '✗ Indicator must have at least one plot() or drawing call (line.new, label.new).',
                    type: 'error',
                });
                return;
            }
            if (scriptType === 'STRATEGY' && !/\bstrategy\.entry\s*\(/.test(kuriContent)) {
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
        if (!kuriContent.trim()) {
            addLog({ message: 'Script is empty — nothing to add.', type: 'error' });
            return;
        }
        try {
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
                    isChecking={isChecking}
                    onSave={requestSave}
                    onOpenScript={() => setIsScriptModalOpen(true)}
                    onRun={handleAddToChart}
                    onCheck={handleCheck}
                    errorCount={diagnosticCounts.errors}
                    warningCount={diagnosticCounts.warnings}
                    onCreateNew={createNew}
                    scriptType={detectedScriptType}
                    editorMode={editorMode}
                    onModeChange={setEditorMode}
                    isAIOpen={isAIOpen}
                    onToggleAI={() => setIsAIOpen(!isAIOpen)}
                />

                {/* Main Editor Area + AI Sidebar */}
                <div className="flex-1 overflow-hidden relative flex">
                    {/* Editor */}
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
                                <Editor
                                    height="100%"
                                    defaultLanguage="kuri"
                                    language="kuri"
                                    value={kuriContent}
                                    theme="kuri-dark"
                                    beforeMount={(m) => {
                                        m.editor.defineTheme('kuri-dark', {
                                            base: 'vs-dark',
                                            inherit: true,
                                            rules: [
                                                { token: 'keyword', foreground: 'C586C0' },
                                                { token: 'type', foreground: '4EC9B0' },
                                                { token: 'identifier', foreground: '9CDCFE' },
                                                { token: 'string', foreground: 'CE9178' },
                                                { token: 'number', foreground: 'B5CEA8' },
                                                { token: 'comment', foreground: '6A9955' },
                                            ],
                                            colors: { 'editor.background': '#0f0f0f' },
                                        });
                                    }}
                                    onMount={(editor) => {
                                        editorRef.current = editor;
                                    }}
                                    onChange={(value) => {
                                        if (value !== undefined) {
                                            setKuriContent(value);
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
                            )
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                <div className="mb-4 text-6xl opacity-10">Waiting for Script</div>
                                <h2 className="text-xl font-medium mb-4">No Script Selected</h2>
                                <div className="flex gap-4">
                                    <button
                                        onClick={() => createNew('STRATEGY')}
                                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded shadow-lg transition-colors"
                                    >
                                        New Strategy
                                    </button>
                                    <button
                                        onClick={() => createNew('INDICATOR')}
                                        className="px-6 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded shadow-lg transition-colors"
                                    >
                                        New Indicator
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
                        currentCode={kuriContent}
                        consoleErrors={logs
                            .filter((l) => l.type === 'error')
                            .slice(-5)
                            .map((l) => l.message)}
                        onApplyCode={(code) => {
                            setKuriContent(code);
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
                        const prompt = `Fix the errors in this Kuri script. Here are the console errors:\n${errors.join('\n')}\n\nCode:\n\`\`\`kuri\n${kuriContent}\n\`\`\``;
                        setAiExternalMessage(prompt);
                    }}
                />

                <OpenScriptModal
                    isOpen={isScriptModalOpen}
                    onClose={() => setIsScriptModalOpen(false)}
                    savedStrategies={savedStrategies}
                    onLoadStrategy={loadStrategy}
                    onLoadIndicator={loadHelper}
                    onDelete={deleteStrategyHandler}
                />
            </div>
        </>
    );
};

export default StrategyStudio;
