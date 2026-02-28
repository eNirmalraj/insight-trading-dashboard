
import React, { useState, useEffect, useRef } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import { validateStrategyJson, saveStrategy, getStrategies, deleteStrategy } from '../services/strategyService';
import { Strategy } from '../types';
import { BUILT_IN_INDICATORS, indicatorToJSON } from '../services/builtInIndicators';
import { BUILTIN_STRATEGY_NAMES } from '../constants';

// --- Components ---
import { TopToolbar } from '../components/strategy-studio/TopToolbar';
import { BottomConsole } from '../components/strategy-studio/BottomConsole';
import { OpenScriptModal } from '../components/strategy-studio/OpenScriptModal';
import { TutorialPanel } from '../components/strategy-studio/TutorialPanel';

// Icons (keep CodeIcon for empty state)
const CodeIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
);

const StrategyStudio = () => {
    // Editor State - Persisted
    const [editorContent, setEditorContent] = useState(() => localStorage.getItem('strategyStudio_editorContent') || '');
    const [strategyName, setStrategyName] = useState(() => localStorage.getItem('strategyStudio_strategyName') || 'Untitled');
    const [isDirty, setIsDirty] = useState(() => localStorage.getItem('strategyStudio_isDirty') === 'true');
    const [activeScript, setActiveScript] = useState<string | null>(() => localStorage.getItem('strategyStudio_activeScript'));

    // UI State
    const [logs, setLogs] = useState<{ timestamp: string, message: string, type: 'info' | 'error' | 'success' }[]>([]);
    const [savedStrategies, setSavedStrategies] = useState<Strategy[]>([]);

    // Modal State
    const [isScriptModalOpen, setIsScriptModalOpen] = useState(false);

    // Deletion State
    const [strategyToDelete, setStrategyToDelete] = useState<Strategy | null>(null);
    const [lastActiveScript, setLastActiveScript] = useState<string | null>(() => localStorage.getItem('strategyStudio_lastActiveScript'));

    // Console State
    const [consoleHeight, setConsoleHeight] = useState(() => {
        const saved = localStorage.getItem('strategyStudio_consoleHeight');
        return saved ? parseInt(saved) : 160;
    });
    const [isConsoleOpen, setIsConsoleOpen] = useState(() => {
        const saved = localStorage.getItem('strategyStudio_isConsoleOpen');
        return saved !== 'false';
    });

    // Loading States
    const [isSaving, setIsSaving] = useState(false);
    const [isTutorialOpen, setIsTutorialOpen] = useState(false);
    const [loadingHistory, setLoadingHistory] = useState(false);

    // Monaco Hook
    const monaco = useMonaco();

    // --- Effects ---

    useEffect(() => {
        if (monaco) {
            // Define custom dark theme for Strategy Studio
            monaco.editor.defineTheme('strategy-dark', {
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
                colors: {}
            });
        }
    }, [monaco]);

    useEffect(() => {
        localStorage.setItem('strategyStudio_consoleHeight', consoleHeight.toString());
    }, [consoleHeight]);

    useEffect(() => {
        localStorage.setItem('strategyStudio_isConsoleOpen', isConsoleOpen.toString());
    }, [isConsoleOpen]);

    useEffect(() => {
        if (activeScript) {
            localStorage.setItem('strategyStudio_activeScript', activeScript);
            localStorage.setItem('strategyStudio_editorContent', editorContent);
            localStorage.setItem('strategyStudio_strategyName', strategyName);
            localStorage.setItem('strategyStudio_isDirty', String(isDirty));
        } else {
            localStorage.removeItem('strategyStudio_activeScript');
            localStorage.removeItem('strategyStudio_editorContent');
            localStorage.removeItem('strategyStudio_strategyName');
            localStorage.removeItem('strategyStudio_isDirty');
        }
    }, [activeScript, editorContent, strategyName, isDirty]);

    useEffect(() => {
        if (lastActiveScript) {
            localStorage.setItem('strategyStudio_lastActiveScript', lastActiveScript);
        } else {
            localStorage.removeItem('strategyStudio_lastActiveScript');
        }
    }, [lastActiveScript]);

    useEffect(() => {
        loadHistory();
        addLog('Strategy Studio initialized. Ready.', 'info');
    }, []);

    // --- Handlers ---

    const isResizingConsole = useRef(false);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isResizingConsole.current) {
                const newHeight = Math.min(Math.max(window.innerHeight - e.clientY, 32), window.innerHeight - 100);
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
            addLog(`Failed to load history: ${(e as Error).message}`, 'error');
        } finally {
            setLoadingHistory(false);
        }
    };

    const addLog = (message: string, type: 'info' | 'error' | 'success' = 'info') => {
        const timestamp = new Date().toLocaleTimeString();
        setLogs(prev => [...prev, { timestamp, message, type }]);
    };

    const handleInjectCode = (code: string) => {
        if (!activeScript) {
            createNew();
        }
        setEditorContent(code);
        setIsDirty(true);
        addLog('Tutorial code loaded into editor', 'info');
    };

    const createNew = () => {
        setEditorContent('');
        setStrategyName("New Strategy");
        setActiveScript('new-' + Date.now());
        setIsDirty(true);
        addLog(`Created new strategy.`, 'success');
    };

    const loadStrategy = (s: Strategy) => {
        // Load as JSON content for editing
        const content = JSON.stringify({
            name: s.name,
            indicators: s.indicators || [],
            entryRules: s.entryRules || [],
            exitRules: s.exitRules || [],
        }, null, 2);
        setEditorContent(content);
        setStrategyName(s.name);
        setActiveScript(s.id);
        setIsDirty(false);
        addLog(`Loaded strategy: ${s.name}`, 'info');
    };

    const loadHelper = (json: string, name: string, id: string) => {
        try {
            setEditorContent(json);
            setStrategyName(name);
            setActiveScript(id);
            setIsDirty(true);
            addLog(`Loaded built-in indicator: ${name}`, 'success');
        } catch (e) {
            addLog(`Failed to load indicator: ${(e as Error).message}`, 'error');
        }
    };

    const loadTemplate = (code: string, name: string, id: string) => {
        setEditorContent(code.trim());
        setStrategyName(name);
        setActiveScript(id);
        setIsDirty(true);
        addLog(`Loaded template: ${name}`, 'success');
    };

    const requestSave = async () => {
        try {
            if (!editorContent.trim()) throw new Error("Strategy content is empty");

            setIsSaving(true);

            // Parse JSON content to extract strategy definition
            let parsedContent: any = {};
            try {
                parsedContent = JSON.parse(editorContent);
            } catch {
                // Treat as plain text content
                parsedContent = { code: editorContent };
            }

            const strategyToSave = {
                name: strategyName,
                description: `Strategy: ${strategyName}`,
                type: 'STRATEGY' as const,
                id: (activeScript && !activeScript.startsWith('new-') && !activeScript.startsWith('builtin-')) ? activeScript : undefined,
                timeframe: '1h',
                symbolScope: [],
                indicators: parsedContent.indicators || [],
                entryRules: parsedContent.entryRules || [],
                exitRules: parsedContent.exitRules || [],
                isActive: false,
                content: parsedContent
            };

            await saveStrategy(strategyToSave);

            addLog('Strategy saved successfully to cloud!', 'success');
            loadHistory();
            setIsDirty(false);
        } catch (e) {
            addLog(`Save failed: ${(e as Error).message}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const deleteStrategyHandler = async (strategy: Strategy) => {
        try {
            await deleteStrategy(strategy.id);
            addLog(`Deleted strategy: ${strategy.name}`, 'success');
            if (activeScript === strategy.id) {
                setEditorContent('');
                setStrategyName("New Strategy");
                setActiveScript(null);
            }
            loadHistory();
        } catch (e) {
            addLog(`Failed to delete strategy: ${(e as Error).message}`, 'error');
        }
    };

    return (
        <>
            {/* Desktop Restriction Message */}
            <div className="lg:hidden flex items-center justify-center h-full bg-dark-bg p-6 text-white">
                Desktop View Only
            </div>

            <div className="hidden lg:flex flex-col h-full bg-[#0c0c0e] text-gray-300 font-sans overflow-hidden">

                <TopToolbar
                    strategyName={strategyName}
                    setStrategyName={setStrategyName}
                    activeScript={activeScript}
                    isDirty={isDirty}
                    isSaving={isSaving}
                    onSave={requestSave}
                    onOpenScript={() => setIsScriptModalOpen(true)}
                    onRun={() => addLog('Add to chart functionality coming soon...', 'info')}
                    onCreateNew={createNew}
                    onToggleTutorial={() => setIsTutorialOpen(!isTutorialOpen)}
                />

                {/* Main Editor Area - JSON Strategy Editor */}
                <div className="flex-1 overflow-hidden relative">
                    {activeScript ? (
                        <Editor
                            height="100%"
                            defaultLanguage="json"
                            language="json"
                            value={editorContent}
                            theme="strategy-dark"
                            onChange={(value) => {
                                if (value !== undefined) {
                                    setEditorContent(value);
                                    setIsDirty(true);
                                }
                            }}
                            options={{
                                minimap: { enabled: false },
                                fontSize: 14,
                                lineNumbers: 'on',
                                scrollBeyondLastLine: false,
                                automaticLayout: true,
                                padding: { top: 16, bottom: 16 },
                                fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                            }}
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <div className="mb-4 text-6xl opacity-10">Waiting for Strategy</div>
                            <h2 className="text-xl font-medium mb-4">No Strategy Selected</h2>
                            <div className="flex gap-4">
                                <button
                                    onClick={createNew}
                                    className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded shadow-lg transition-colors"
                                >
                                    Create New Strategy
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

                {/* Bottom Console */}
                <BottomConsole
                    logs={logs}
                    isOpen={isConsoleOpen}
                    height={consoleHeight}
                    onToggle={() => setIsConsoleOpen(!isConsoleOpen)}
                    onClear={() => setLogs([])}
                    onResizeStart={startResizingConsole}
                />

                {/* Modals */}
                <OpenScriptModal
                    isOpen={isScriptModalOpen}
                    onClose={() => setIsScriptModalOpen(false)}
                    savedStrategies={savedStrategies}
                    onLoadStrategy={loadStrategy}
                    onLoadHelper={loadHelper}
                    onLoadTemplate={loadTemplate}
                    onDelete={deleteStrategyHandler}
                    loading={loadingHistory}
                />

                <TutorialPanel
                    isOpen={isTutorialOpen}
                    onClose={() => setIsTutorialOpen(false)}
                    onInjectCode={handleInjectCode}
                />

            </div>
        </>
    );
};

export default StrategyStudio;
