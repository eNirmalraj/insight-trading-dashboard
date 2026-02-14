
import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { validateStrategyJson, saveStrategy, getStrategies, deleteStrategy } from '../services/strategyService';
import { Strategy } from '../types';
import { BUILT_IN_INDICATORS, indicatorToJSON, indicatorToKuri } from '../services/builtInIndicators';
import { BUILTIN_STRATEGY_NAMES } from '../constants';

// --- Components ---
import { TopToolbar } from '../components/strategy-studio/TopToolbar';
import { BottomConsole } from '../components/strategy-studio/BottomConsole';
import { OpenScriptModal } from '../components/strategy-studio/OpenScriptModal';

// Icons (keep CodeIcon for empty state)
const CodeIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
);

const StrategyStudio = () => {
    // Editor State - Persisted
    const [kuriContent, setKuriContent] = useState(() => localStorage.getItem('strategyStudio_kuriContent') || '');
    const [strategyName, setStrategyName] = useState(() => localStorage.getItem('strategyStudio_strategyName') || 'Untitled');
    const [isDirty, setIsDirty] = useState(() => localStorage.getItem('strategyStudio_isDirty') === 'true');
    const [activeScript, setActiveScript] = useState<string | null>(() => localStorage.getItem('strategyStudio_activeScript'));

    // UI State
    const [logs, setLogs] = useState<{ timestamp: string, message: string, type: 'info' | 'error' | 'success' }[]>([]);
    const [savedStrategies, setSavedStrategies] = useState<Strategy[]>([]);

    // Modal State (Replaces Sidebar)
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
    const [loadingHistory, setLoadingHistory] = useState(false);

    // --- Effects ---

    useEffect(() => {
        localStorage.setItem('strategyStudio_consoleHeight', consoleHeight.toString());
    }, [consoleHeight]);

    useEffect(() => {
        localStorage.setItem('strategyStudio_isConsoleOpen', isConsoleOpen.toString());
    }, [isConsoleOpen]);

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
        addLog('Strategy Studio initialized. Ready.', 'info');
    }, []);

    // Auto-update name from Kuri script comments
    // Future: Parse // @name directive

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

    const createNew = () => {
        setKuriContent('');
        setStrategyName("New Strategy");
        setActiveScript('new-' + Date.now());
        setIsDirty(true);
        addLog(`Created new Kuri strategy.`, 'success');
    };

    const loadStrategy = (s: Strategy) => {
        setKuriContent(s.kuriScript || '');
        setStrategyName(s.name);
        setActiveScript(s.id);
        setIsDirty(false);
        addLog(`Loaded strategy: ${s.name}`, 'info');
    };

    const loadHelper = (json: string, name: string, id: string) => {
        try {
            // Parse the JSON representation of the built-in indicator
            const indicator = JSON.parse(json);

            // Generate valid Kuri code
            // Note: We need to import indicatorToKuri first (I'll add the import in a separate edit or verify it's there)
            // Wait, I need to add the import to the top of the file as well.
            // Since replace_file_content does one contiguous block, I should check if I can do both.
            // I'll do the import update first, then this function. 
            // Or I can just do this function assuming I update import later.
            // I'll assume the helper function `indicatorToKuri` is available if imported.

            // Wait, I cannot add import easily with single block replace if lines are far apart.
            // Helper logic:
            const code = indicatorToKuri(indicator);

            setKuriContent(code);
            setStrategyName(name);
            setActiveScript(id);
            setIsDirty(true); // Treat as new/unsaved changes so user can save a copy if desired
            addLog(`Loaded built-in indicator: ${name}`, 'success');
        } catch (e) {
            addLog(`Failed to load indicator: ${(e as Error).message}`, 'error');
        }
    };

    const requestSave = async () => {
        try {
            if (!kuriContent.trim()) throw new Error("Script is empty");

            setIsSaving(true);
            const strategyToSave = {
                name: strategyName,
                description: `Kuri strategy: ${strategyName}`,
                type: 'KURI' as const,
                id: (activeScript && !activeScript.startsWith('new-') && !activeScript.startsWith('builtin-')) ? activeScript : undefined,
                kuriScript: kuriContent,
                // Empty JSON fields for backwards compatibility
                timeframe: '1h',
                symbolScope: [],
                indicators: [],
                entryRules: [],
                exitRules: [],
                isActive: false
            };

            await saveStrategy(strategyToSave);

            addLog('Kuri strategy saved successfully to cloud!', 'success');
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
                setKuriContent('');
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
            {/* Desktop Restriction Message (Optional - can be kept or removed) */}
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
                />

                {/* Main Editor Area - Kuri Only */}
                <div className="flex-1 overflow-hidden relative">
                    {activeScript ? (
                        <Editor
                            height="100%"
                            defaultLanguage="python"
                            language="python"
                            value={kuriContent}
                            theme="vs-dark"
                            onChange={(value) => {
                                if (value !== undefined) {
                                    setKuriContent(value);
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
                            <div className="mb-4 text-6xl opacity-10">Waiting for Script</div>
                            <h2 className="text-xl font-medium mb-4">No Script Selected</h2>
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
                    onDelete={deleteStrategyHandler}
                    loading={loadingHistory}
                />

            </div>
        </>
    );
};

export default StrategyStudio;
