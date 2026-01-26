import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { validateStrategyJson, saveStrategy, getStrategies, deleteStrategy } from '../services/strategyService';
import { getStrategyAssistantResponse } from '../api';
import { Strategy } from '../types';
import { BUILT_IN_INDICATORS, indicatorToJSON, BuiltInIndicator } from '../services/builtInIndicators';
import { BUILTIN_STRATEGY_NAMES } from '../constants';

// --- Icons ---
const SaveIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
);
const EditIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
);
const TrashIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);
const CloseIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
);
const BrainIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
);
const TerminalIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 17v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
);
const PlusIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
);
const SidebarIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
);
const PanelCloseIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
    </svg>
);
const FolderOpenIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
);
const CodeIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
);
const LoaderIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
);
const SendIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
);
const SidebarCloseIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
    </svg>
);
const ChevronUpIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
    </svg>
);
const TrendUpIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
);
const StrategyIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
);
const PlayIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);
const MagicWandIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
);


const DEFAULT_STRATEGY = {
    name: "New Strategy",
    type: "STRATEGY",
    description: "Describe your strategy here",
    timeframe: "1H",
    symbolScope: ["EURUSD"],
    indicators: [
        { "id": "rsi_1", "type": "RSI", "parameters": { "period": 14 } }
    ],
    entryRules: [
        { "condition": "rsi_1 < 30", "type": "BUY" }
    ],
    exitRules: [
        { "condition": "rsi_1 > 70", "type": "close" }
    ],
    isActive: false
};

const DEFAULT_INDICATOR = {
    name: "New Indicator",
    type: "INDICATOR",
    description: "Custom Indicator Logic",
    outputs: [
        { "id": "main_line", "color": "blue" }
    ],
    logic: [
        { "calculation": "close > open", "output": "main_line" }
    ]
};

const StrategyStudio = () => {
    // Editor State
    // Editor State - Persisted
    const [jsonContent, setJsonContent] = useState(() => localStorage.getItem('strategyStudio_jsonContent') || '');
    const [strategyName, setStrategyName] = useState(() => localStorage.getItem('strategyStudio_strategyName') || 'Untitled');
    const [isDirty, setIsDirty] = useState(() => localStorage.getItem('strategyStudio_isDirty') === 'true');
    const [activeScript, setActiveScript] = useState<string | null>(() => localStorage.getItem('strategyStudio_activeScript'));

    // UI State
    const [logs, setLogs] = useState<{ timestamp: string, message: string, type: 'info' | 'error' | 'success' }[]>([]);
    const [savedStrategies, setSavedStrategies] = useState<Strategy[]>([]);

    // UI Persistence
    const [sidebarView, setSidebarView] = useState<'BUILT_IN' | 'MY_SCRIPTS'>(() =>
        (localStorage.getItem('strategyStudio_sidebarView') as 'BUILT_IN' | 'MY_SCRIPTS') || 'BUILT_IN'
    );
    const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
        const saved = localStorage.getItem('strategyStudio_isSidebarOpen');
        return saved !== null ? saved === 'true' : false;
    });

    const [isAiPanelOpen, setIsAiPanelOpen] = useState(false); // Don't persist AI panel for now, usually ephemeral
    const [showNewScriptModal, setShowNewScriptModal] = useState(false);

    // Deletion State
    const [strategyToDelete, setStrategyToDelete] = useState<Strategy | null>(null);
    const [lastActiveScript, setLastActiveScript] = useState<string | null>(() => localStorage.getItem('strategyStudio_lastActiveScript'));

    // Resizing State
    const [sidebarWidth, setSidebarWidth] = useState(260); // Default width
    const [aiWidth, setAiWidth] = useState(320); // Default AI width
    // Load persisted state
    const [consoleHeight, setConsoleHeight] = useState(() => {
        const saved = localStorage.getItem('strategyStudio_consoleHeight');
        return saved ? parseInt(saved) : 160;
    });
    const [isConsoleOpen, setIsConsoleOpen] = useState(() => {
        const saved = localStorage.getItem('strategyStudio_isConsoleOpen');
        return saved !== 'false'; // Default true
    });

    useEffect(() => {
        localStorage.setItem('strategyStudio_consoleHeight', consoleHeight.toString());
    }, [consoleHeight]);

    useEffect(() => {
        localStorage.setItem('strategyStudio_isConsoleOpen', isConsoleOpen.toString());
    }, [isConsoleOpen]);

    // Persist Editor State
    useEffect(() => {
        if (activeScript) {
            localStorage.setItem('strategyStudio_activeScript', activeScript);
            localStorage.setItem('strategyStudio_jsonContent', jsonContent);
            localStorage.setItem('strategyStudio_strategyName', strategyName);
            localStorage.setItem('strategyStudio_isDirty', String(isDirty));
        } else {
            localStorage.removeItem('strategyStudio_activeScript');
            localStorage.removeItem('strategyStudio_jsonContent');
            localStorage.removeItem('strategyStudio_strategyName');
            localStorage.removeItem('strategyStudio_isDirty');
        }
    }, [activeScript, jsonContent, strategyName, isDirty]);

    // Persist UI State
    useEffect(() => {
        localStorage.setItem('strategyStudio_sidebarView', sidebarView);
    }, [sidebarView]);

    useEffect(() => {
        localStorage.setItem('strategyStudio_isSidebarOpen', String(isSidebarOpen));
    }, [isSidebarOpen]);

    useEffect(() => {
        if (lastActiveScript) {
            localStorage.setItem('strategyStudio_lastActiveScript', lastActiveScript);
        } else {
            localStorage.removeItem('strategyStudio_lastActiveScript');
        }
    }, [lastActiveScript]);

    const isResizingSidebar = useRef(false);
    const isResizingAi = useRef(false);
    const isResizingConsole = useRef(false);

    // Loading States
    const [isSaving, setIsSaving] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [loadingHistory, setLoadingHistory] = useState(false);

    // AI State
    const [aiPrompt, setAiPrompt] = useState('');

    useEffect(() => {
        loadHistory();
        addLog('Strategy Studio initialized. Ready.', 'info');
    }, []);

    // Global resizing event listeners
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isResizingSidebar.current) {
                const newWidth = Math.min(Math.max(e.clientX, 150), 600);
                setSidebarWidth(newWidth);
            }
            if (isResizingAi.current) {
                const newWidth = Math.min(Math.max(window.innerWidth - e.clientX, 250), 800);
                setAiWidth(newWidth);
            }
            if (isResizingConsole.current) {
                // Resize from top, so height = windowH - mouseY - (header? no, from bottom)
                // Actually it's simpler: We are dragging the TOP of the console.
                // Distance from bottom of screen = window.innerHeight - e.clientY
                const newHeight = Math.min(Math.max(window.innerHeight - e.clientY, 32), window.innerHeight - 100);
                setConsoleHeight(newHeight);
            }
        };

        const handleMouseUp = () => {
            isResizingSidebar.current = false;
            isResizingAi.current = false;
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

    const startResizingLeft = (e: React.MouseEvent) => {
        isResizingSidebar.current = true;
        document.body.style.cursor = 'col-resize';
        e.preventDefault();
    };

    const startResizingRight = (e: React.MouseEvent) => {
        isResizingAi.current = true;
        document.body.style.cursor = 'col-resize';
        e.preventDefault();
    };

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

    const handleDeleteClick = (e: React.MouseEvent, strategy: Strategy) => {
        e.stopPropagation(); // Prevent opening the strategy
        setStrategyToDelete(strategy);
    };

    const confirmDelete = async () => {
        if (!strategyToDelete) return;
        try {
            await deleteStrategy(strategyToDelete.id);
            addLog(`Deleted strategy: ${strategyToDelete.name}`, 'success');

            // Clear editor if deleted script was active
            if (activeScript === strategyToDelete.id) {
                setJsonContent('');
                setStrategyName("New Strategy");
                setActiveScript(null);
            }

            await loadHistory();
        } catch (e) {
            addLog(`Failed to delete strategy: ${(e as Error).message}`, 'error');
        } finally {
            setStrategyToDelete(null);
        }
    };

    const addLog = (message: string, type: 'info' | 'error' | 'success' = 'info') => {
        const timestamp = new Date().toLocaleTimeString();
        setLogs(prev => [...prev, { timestamp, message, type }]);
    };

    const handleJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setJsonContent(e.target.value);
        setIsDirty(true);
    };

    // Auto-update name from JSON
    useEffect(() => {
        try {
            const parsed = JSON.parse(jsonContent);
            if (parsed.name && parsed.name !== strategyName) {
                setStrategyName(parsed.name);
            }
        } catch (e) { }
    }, [jsonContent]);

    const createNew = (type: 'STRATEGY' | 'INDICATOR') => {
        setJsonContent('');
        setStrategyName(type === 'STRATEGY' ? "New Strategy" : "New Indicator");
        setActiveScript('new-' + Date.now());
        setIsDirty(true);
        setShowNewScriptModal(false);
        addLog(`Created new ${type} (Empty).`, 'success');
        setIsAiPanelOpen(true);
    };

    const loadStrategy = (s: Strategy) => {
        const content = JSON.stringify({
            name: s.name,
            description: s.description,
            timeframe: s.timeframe,
            symbolScope: s.symbolScope,
            markers: s.type === 'INDICATOR' ? undefined : undefined, // Example
            indicators: s.indicators,
            entryRules: s.entryRules,
            exitRules: s.exitRules,
            isActive: s.isActive,
            type: s.type || 'STRATEGY', // Ensure type is present
            ...s
        }, null, 2);

        setJsonContent(content);
        setStrategyName(s.name);
        setActiveScript(s.id);
        setIsDirty(false);
        addLog(`Loaded strategy: ${s.name}`, 'info');
        setIsSidebarOpen(false);
    };

    const requestSave = async () => {
        try {
            if (!jsonContent.trim()) throw new Error("Script is empty");
            const parsed = JSON.parse(jsonContent);

            // Validate Type
            if (!parsed.type) {
                // Infer type logic if missing, or default. 
                // But better to enforce it or adding it.
                // For now, let's trust strict JSON or DEFAULT template.
            }

            if (parsed.name !== strategyName) {
                parsed.name = strategyName;
                setJsonContent(JSON.stringify(parsed, null, 2));
            }

            setIsSaving(true);
            const strategyToSave = {
                ...parsed,
                // If activeScript is a UUID (not new-...), pass it as ID for UPDATE
                id: (activeScript && !activeScript.startsWith('new-') && !activeScript.startsWith('builtin-')) ? activeScript : undefined
            };

            await saveStrategy(strategyToSave);

            addLog('Strategy saved successfully to cloud!', 'success');
            loadHistory(); // Reload list to show changes
            setIsDirty(false);
        } catch (e) {
            addLog(`Save failed: ${(e as Error).message}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleAiSubmit = async () => {
        if (!aiPrompt.trim()) return;
        setIsGenerating(true);
        addLog('AI is generating...', 'info');

        try {
            const response = await getStrategyAssistantResponse(aiPrompt, jsonContent);
            JSON.parse(response);
            setJsonContent(response);
            addLog('AI successfully updated the script.', 'success');
            setAiPrompt('');
        } catch (e) {
            addLog('AI generation failed.', 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    const lineCount = jsonContent.split('\n').length;

    return (
        <>
            {/* Desktop-only message for mobile and tablet */}
            <div className="lg:hidden flex items-center justify-center h-full bg-dark-bg p-6">
                <div className="max-w-md text-center">
                    <div className="mb-6 flex justify-center">
                        <CodeIcon className="w-20 h-20 text-gray-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-3">Desktop Only</h2>
                    <p className="text-gray-400 mb-6 leading-relaxed">
                        The Script Editor is designed for desktop devices with larger screens.
                        Please use a desktop or laptop computer to access this feature.
                    </p>
                    <div className="text-sm text-gray-500 bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                        <p className="mb-2">💡 <strong>Why?</strong></p>
                        <p>Code editing requires a larger workspace for the best experience with multiple panels, syntax highlighting, and debugging tools.</p>
                    </div>
                </div>
            </div>

            {/* Main Editor - Desktop only */}
            <div className="hidden lg:flex h-full bg-[#09090b] text-gray-300 font-sans overflow-hidden select-none">

                {/* Mobile Backdrop */}
                {isSidebarOpen && (
                    <div
                        onClick={() => setIsSidebarOpen(false)}
                        className="md:hidden fixed inset-0 bg-black/60 z-30"
                    />
                )}

                {/* Left Sidebar: EDITOR */}
                {isSidebarOpen && (
                    <div
                        className="fixed md:relative left-0 top-0 bottom-0 w-[280px] md:w-auto md:flex-shrink-0 bg-[#09090b] border-r border-white/10 flex flex-col z-40"
                        style={{ width: window.innerWidth >= 768 ? sidebarWidth : '280px' }}
                    >
                        <div className="border-b border-white/10">
                            <div className="h-12 px-4 flex items-center justify-between">
                                <h2 className="text-xs font-bold tracking-wider text-gray-400 ml-10 md:ml-0">LIBRARY</h2>
                                <div className="flex items-center gap-1">
                                    <button onClick={loadHistory} className="p-1.5 hover:bg-white/5 rounded-md text-gray-400 hover:text-white transition-colors" title="Load Existing Scripts (Refresh)">
                                        <FolderOpenIcon className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => setShowNewScriptModal(true)} className="p-1.5 hover:bg-white/5 rounded-md text-gray-400 hover:text-white transition-colors" title="New Script">
                                        <PlusIcon className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => setIsSidebarOpen(false)} className="p-1.5 hover:bg-white/5 rounded-md text-gray-400 hover:text-white transition-colors" title="Close Panel">
                                        <SidebarIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            {/* Toggle Buttons */}
                            <div className="flex items-center gap-1 px-3 py-2 border-t border-white/5">
                                <button
                                    onClick={() => setSidebarView('BUILT_IN')}
                                    className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-all ${sidebarView === 'BUILT_IN'
                                        ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                        : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                                        }`}
                                >
                                    Built-In
                                </button>
                                <button
                                    onClick={() => setSidebarView('MY_SCRIPTS')}
                                    className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-all ${sidebarView === 'MY_SCRIPTS'
                                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                        : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                                        }`}
                                >
                                    My Scripts
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 py-3">
                            {/* Built-in Section */}
                            {sidebarView === 'BUILT_IN' && (
                                <div>
                                    {/* Built-in Strategies from DB */}
                                    {savedStrategies.filter(s => BUILTIN_STRATEGY_NAMES.includes(s.name)).length > 0 && (
                                        <div className="mb-4">
                                            <div className="px-3 py-2 text-[10px] font-bold tracking-wider text-gray-500 uppercase">Strategies</div>
                                            <div className="space-y-0.5 px-2">
                                                {savedStrategies.filter(s => BUILTIN_STRATEGY_NAMES.includes(s.name)).map(s => (
                                                    <div
                                                        key={s.id}
                                                        className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-2 group transition-all text-sm relative select-none ${activeScript === s.id
                                                            ? 'bg-purple-500/10 text-purple-400'
                                                            : (!activeScript && lastActiveScript === s.id)
                                                                ? 'bg-white/10 text-white border border-white/10 shadow-sm'
                                                                : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                                                            }`}
                                                    >
                                                        <span className="truncate flex-1 pr-16">{s.name}</span>
                                                        <div className="absolute right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                            <button
                                                                onClick={() => loadStrategy(s)}
                                                                className="p-1 rounded hover:bg-purple-500/20 text-gray-500 hover:text-purple-400"
                                                                title="View Strategy"
                                                            >
                                                                <EditIcon className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="px-3 py-2 text-[10px] font-bold tracking-wider text-gray-500 uppercase">Indicators</div>
                                    <div className="space-y-0.5 px-2">
                                        {BUILT_IN_INDICATORS.map(ind => (
                                            <div
                                                key={ind.id}
                                                className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-2 group transition-all text-xs relative select-none ${activeScript === 'builtin-' + ind.id
                                                    ? 'bg-purple-500/10 text-purple-400'
                                                    : (!activeScript && lastActiveScript === 'builtin-' + ind.id)
                                                        ? 'bg-white/10 text-white border border-white/10 shadow-sm'
                                                        : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                                                    }`}
                                            >
                                                <span className="truncate flex-1 pr-16">{ind.name}</span>
                                                <div className="absolute right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                    <button
                                                        onClick={() => {
                                                            const json = indicatorToJSON(ind);
                                                            setJsonContent(json);
                                                            setStrategyName(ind.name);
                                                            setActiveScript('builtin-' + ind.id);
                                                            setIsDirty(false);
                                                            addLog(`Loaded built-in indicator: ${ind.name}`, 'info');
                                                        }}
                                                        className="p-1 rounded hover:bg-purple-500/20 text-gray-500 hover:text-purple-400"
                                                        title="View Indicator"
                                                    >
                                                        <EditIcon className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* User Scripts Section */}
                            {sidebarView === 'MY_SCRIPTS' && (
                                <div>
                                    {loadingHistory ? (
                                        <div className="flex justify-center p-4"><LoaderIcon className="w-4 h-4 animate-spin text-gray-600" /></div>
                                    ) : (
                                        <div className="space-y-4">
                                            {/* Strategies Group - Filter out builtin */}
                                            {savedStrategies.filter(s => s.type !== 'INDICATOR' && !BUILTIN_STRATEGY_NAMES.includes(s.name)).length > 0 && (
                                                <div>
                                                    <div className="px-3 py-2 text-[10px] font-bold tracking-wider text-gray-500 uppercase">Strategies</div>
                                                    <div className="space-y-0.5 px-2">
                                                        {savedStrategies.filter(s => s.type !== 'INDICATOR' && !BUILTIN_STRATEGY_NAMES.includes(s.name)).map(s => (
                                                            <div
                                                                key={s.id}
                                                                className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-2 group transition-all text-sm relative select-none ${activeScript === s.id
                                                                    ? 'bg-blue-500/10 text-blue-400'
                                                                    : (!activeScript && lastActiveScript === s.id)
                                                                        ? 'bg-white/10 text-white border border-white/10 shadow-sm'
                                                                        : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                                                                    }`}
                                                            >
                                                                <span className="truncate flex-1 pr-16">{s.name}</span>
                                                                <div className="absolute right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                                    <button
                                                                        onClick={() => loadStrategy(s)}
                                                                        className="p-1 rounded hover:bg-blue-500/20 text-gray-500 hover:text-blue-400"
                                                                        title="Edit Strategy"
                                                                    >
                                                                        <EditIcon className="w-3.5 h-3.5" />
                                                                    </button>
                                                                    <button
                                                                        onClick={(e) => handleDeleteClick(e, s)}
                                                                        className="p-1 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400"
                                                                        title="Delete Strategy"
                                                                    >
                                                                        <TrashIcon className="w-3.5 h-3.5" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Indicators Group - Filter out builtin */}
                                            {savedStrategies.filter(s => s.type === 'INDICATOR' && !BUILTIN_STRATEGY_NAMES.includes(s.name)).length > 0 && (
                                                <div>
                                                    <div className="px-3 py-2 text-[10px] font-bold tracking-wider text-gray-500 uppercase">Indicators</div>
                                                    <div className="space-y-0.5 px-2">
                                                        {savedStrategies.filter(s => s.type === 'INDICATOR' && !BUILTIN_STRATEGY_NAMES.includes(s.name)).map(s => (
                                                            <div
                                                                key={s.id}
                                                                className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-2 group transition-all text-sm relative select-none ${activeScript === s.id
                                                                    ? 'bg-purple-500/10 text-purple-400'
                                                                    : (!activeScript && lastActiveScript === s.id)
                                                                        ? 'bg-white/10 text-white border border-white/10 shadow-sm'
                                                                        : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                                                                    }`}
                                                            >
                                                                <span className="truncate flex-1 pr-16">{s.name}</span>
                                                                <div className="absolute right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                                    <button
                                                                        onClick={() => loadStrategy(s)}
                                                                        className="p-1 rounded hover:bg-purple-500/20 text-gray-500 hover:text-purple-400"
                                                                        title="Edit Indicator"
                                                                    >
                                                                        <EditIcon className="w-3.5 h-3.5" />
                                                                    </button>
                                                                    <button
                                                                        onClick={(e) => handleDeleteClick(e, s)}
                                                                        className="p-1 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400"
                                                                        title="Delete Indicator"
                                                                    >
                                                                        <TrashIcon className="w-3.5 h-3.5" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {savedStrategies.filter(s => !BUILTIN_STRATEGY_NAMES.includes(s.name)).length === 0 && (
                                                <div className="px-3 py-6 text-center text-xs text-gray-600 italic">
                                                    No saved scripts yet.
                                                    <br />
                                                    Create one to get started!
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Resizer Handle - Desktop only */}
                        <div
                            onMouseDown={startResizingLeft}
                            className="hidden md:block absolute right-0 top-0 bottom-0 w-1 bg-transparent hover:bg-blue-500/50 cursor-col-resize z-20 group"
                        >
                            <div className="w-px h-full bg-white/5 group-hover:bg-blue-500 ml-auto pointer-events-none"></div>
                        </div>
                    </div>
                )}

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col min-w-0 bg-[#0c0c0e]">
                    {/* Header */}
                    <header className="h-auto md:h-12 flex-shrink-0 bg-[#09090b] border-b border-white/10 flex flex-col md:flex-row md:items-center px-3 md:px-4 py-2 md:py-0 gap-2 md:gap-0 md:justify-between select-none">
                        <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0 ml-10 md:ml-0">
                            {/* Show Sidebar Open button ONLY if sidebar is closed AND no script is open */}
                            {!isSidebarOpen && !activeScript && (
                                <button onClick={() => setIsSidebarOpen(true)} className="text-gray-500 hover:text-white transition-colors p-1 rounded hover:bg-white/5" title="Open File Explorer">
                                    <SidebarIcon className="w-5 h-5" />
                                </button>
                            )}

                            {activeScript ? (
                                <div className="flex items-center gap-2 text-sm text-gray-500">
                                    <span>scripts</span>
                                    <span className="text-gray-700">/</span>
                                    <input
                                        type="text"
                                        value={strategyName}
                                        onChange={(e) => setStrategyName(e.target.value)}
                                        className="bg-transparent border-none focus:outline-none text-gray-200 font-medium w-64 hover:text-white transition-colors placeholder-gray-700"
                                        placeholder="Untitled Strategy"
                                    />
                                    <button
                                        onClick={requestSave}
                                        disabled={isSaving}
                                        className={`px-3 py-1 rounded text-xs font-bold tracking-wide flex items-center gap-1.5 transition-all disabled:opacity-50 ${isDirty
                                            ? "bg-white text-black hover:bg-gray-200"
                                            : "bg-zinc-800 hover:bg-zinc-700 text-gray-300 hover:text-white border border-white/10"
                                            }`}
                                    >
                                        {isSaving ? <LoaderIcon className="w-3 h-3 animate-spin" /> : <SaveIcon className="w-3 h-3" />}
                                        <span className="hidden sm:inline">SAVE</span>
                                    </button>
                                    <button
                                        onClick={() => {
                                            setLastActiveScript(activeScript);
                                            setActiveScript(null);
                                            setJsonContent('');
                                            setIsSidebarOpen(true);
                                        }}
                                        className={`px-3 py-1 rounded text-xs font-bold transition-all ml-2 border border-white/10 ${!isDirty
                                            ? "bg-white text-black hover:bg-gray-200"
                                            : "bg-zinc-800 hover:bg-zinc-700 text-gray-300 hover:text-white"
                                            }`}
                                        title="Close Script"
                                    >
                                        CLOSE
                                    </button>
                                </div>
                            ) : (
                                <span className="text-sm text-gray-500">No script selected</span>
                            )}
                        </div>
                        {activeScript && (
                            <div className="flex items-center gap-2 md:gap-3 flex-wrap md:flex-nowrap">
                                {/* <div className={`hidden sm:flex items-center gap-1.5 text-xs px-2 md:px-3 py-1 md:py-1.5 rounded-full border transition-all ${isDirty ? 'border-yellow-500/20 bg-yellow-500/10 text-yellow-500' : 'border-green-500/20 bg-green-500/10 text-green-500'}`}>
                                    <div className={`w-1.5 h-1.5 rounded-full ${isDirty ? 'bg-yellow-500' : 'bg-green-500'}`}></div>
                                    <span className="hidden sm:inline">{isDirty ? 'Unsaved' : 'Synced'}</span>
                                </div> */}

                                <button
                                    onClick={() => addLog('Backtesting engine coming soon...', 'info')}
                                    className="bg-blue-600 text-white hover:bg-blue-500 px-3 md:px-4 py-1.5 rounded text-xs font-bold tracking-wide flex items-center gap-1.5 md:gap-2 transition-all shadow-lg shadow-blue-900/20"
                                >
                                    <PlayIcon className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">RUN</span>
                                </button>
                                <button
                                    onClick={() => setIsAiPanelOpen(!isAiPanelOpen)}
                                    className={`p-1.5 md:p-2 rounded transition-colors ${isAiPanelOpen ? 'text-blue-400 bg-blue-500/10' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                                    title="Toggle AI Assistant"
                                >
                                    <MagicWandIcon className="w-4 h-4 md:w-5 md:h-5" />
                                </button>
                            </div>
                        )}
                    </header>

                    {/* Editor Area with Interaction Block */}
                    <div className="flex-1 flex overflow-hidden relative group">
                        {/* Active Script State */}
                        {activeScript ? (
                            <>
                                {/* Monaco Editor */}
                                <div className="flex-1 overflow-hidden">
                                    <Editor
                                        height="100%"
                                        defaultLanguage="json"
                                        language="json"
                                        value={jsonContent}
                                        theme="vs-dark"
                                        onChange={(value) => {
                                            if (value !== undefined) {
                                                setJsonContent(value);
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
                                            renderLineHighlight: 'all',
                                            smoothScrolling: true,
                                            cursorBlinking: 'smooth',
                                            formatOnPaste: true,
                                            formatOnType: true
                                        }}
                                    />
                                </div>
                            </>
                        ) : (
                            // Empty State
                            <div className="flex-1 flex flex-col items-center justify-center text-gray-500 select-none">
                                <CodeIcon className="w-16 h-16 mb-4 opacity-20" />
                                <h3 className="text-lg font-medium text-gray-400">No Script Open</h3>
                                <button
                                    onClick={() => setShowNewScriptModal(true)}
                                    className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-900/20"
                                >
                                    Create New Script
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Bottom Console Panel (Resizable) */}
                    <div
                        className="bg-[#09090b] border-t border-white/10 flex flex-col flex-shrink-0 relative"
                        style={{ height: isConsoleOpen ? consoleHeight : '32px' }}
                    >
                        {/* Console Resizer Handle - Desktop only */}
                        {isConsoleOpen && (
                            <div
                                onMouseDown={startResizingConsole}
                                className="hidden md:block absolute left-0 right-0 top-[-4px] h-[8px] bg-transparent hover:bg-blue-500/10 cursor-row-resize z-40 group flex items-center justify-center transition-colors"
                                title="Drag to resize"
                            >
                                <div className="w-12 h-1 bg-gray-600/50 rounded-full group-hover:bg-blue-500 transition-colors"></div>
                            </div>
                        )}

                        <div
                            className="h-8 px-4 flex items-center justify-between text-xs font-semibold text-gray-500 border-b border-black bg-[#111113] cursor-pointer hover:text-gray-300 select-none relative z-30"
                            onClick={() => setIsConsoleOpen(!isConsoleOpen)}
                        >
                            <div className="flex items-center gap-2">
                                <TerminalIcon className="w-3 h-3" /> CONSOLE OUTPUT
                            </div>
                            <ChevronUpIcon className={`w-3 h-3 transition-transform ${isConsoleOpen ? 'rotate-180' : ''}`} />
                        </div>
                        {isConsoleOpen && (
                            <div className="flex-1 overflow-x-auto overflow-y-auto font-mono text-xs p-0 bg-[#0c0c0e]">
                                {/* Table Header */}
                                <div className="flex border-b border-white/5 px-2 md:px-4 py-2 text-gray-500 font-semibold sticky top-0 bg-[#0c0c0e] min-w-[500px]">
                                    <div className="w-16 md:w-24 flex-shrink-0">Time</div>
                                    <div className="w-14 md:w-20 flex-shrink-0">Type</div>
                                    <div className="flex-1 min-w-0">Message</div>
                                </div>

                                {/* Table Body */}
                                {logs.length === 0 && <div className="p-4 text-gray-700 italic min-w-[500px]">Console ready. Logs will appear here.</div>}
                                {logs.map((log, i) => (
                                    <div key={i} className="flex px-2 md:px-4 py-1.5 border-b border-white/5 hover:bg-white/5 transition-colors min-w-[500px]">
                                        <div className="w-16 md:w-24 text-gray-600 flex-shrink-0 truncate text-[10px] md:text-xs">{log.timestamp}</div>
                                        <div className={`w-14 md:w-20 font-bold flex-shrink-0 text-[10px] md:text-xs ${log.type === 'error' ? 'text-red-400' :
                                            log.type === 'success' ? 'text-green-400' :
                                                'text-blue-300'
                                            }`}>
                                            {log.type.toUpperCase()}
                                        </div>
                                        <div className="flex-1 text-gray-300 break-all min-w-0">{log.message}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Sidebar: AI Assistant - Bottom sheet on mobile, side panel on desktop */}
                {isAiPanelOpen && (
                    <div
                        className="fixed md:relative bottom-0 md:bottom-auto left-0 right-0 md:left-auto md:right-0 md:top-0 h-[70vh] md:h-auto bg-[#0e0e0e] border-t md:border-t-0 md:border-l border-white/10 flex flex-col shadow-2xl z-50 rounded-t-2xl md:rounded-none"
                        style={{ width: window.innerWidth >= 768 ? aiWidth : '100%' }}
                    >
                        {/* Resizer Handle (Left side of AI panel) - Desktop only */}
                        <div
                            onMouseDown={startResizingRight}
                            className="hidden md:block absolute left-0 top-0 bottom-0 w-1 bg-transparent hover:bg-blue-500/50 cursor-col-resize z-20 group"
                        >
                            <div className="w-px h-full bg-white/5 group-hover:bg-blue-500 pointer-events-none"></div>
                        </div>

                        {/* Mobile drag handle */}
                        <div className="md:hidden w-12 h-1 bg-gray-600 rounded-full mx-auto my-2 flex-shrink-0"></div>

                        <div className="p-4 border-b border-white/5 flex items-center justify-between bg-[#09090b]">
                            <h3 className="font-semibold text-gray-200 flex items-center gap-2 text-sm">
                                <BrainIcon className="text-blue-400 w-4 h-4" /> AI Assistant
                            </h3>
                            <button onClick={() => setIsAiPanelOpen(false)} className="text-gray-500 hover:text-white">
                                <SidebarCloseIcon className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex-1 flex flex-col p-4">
                            <div className="flex-1 bg-white/5 rounded-lg p-3 overflow-y-auto mb-3">
                                {/* Chat history could go here, for now placeholder */}
                                <p className="text-xs text-gray-500 italic">
                                    I can help you write strategies or indicators.
                                    Try saying "Create an RSI strategy" or "Adding moving average cross logic".
                                </p>
                                {isGenerating && <div className="mt-2 text-blue-400 text-xs animate-pulse">Generating code...</div>}
                            </div>
                            <div className="relative">
                                <textarea
                                    value={aiPrompt}
                                    onChange={(e) => setAiPrompt(e.target.value)}
                                    placeholder="Instructions..."
                                    className="w-full h-24 bg-[#09090b] border border-white/10 rounded-lg p-2 text-xs text-white focus:border-blue-500 focus:outline-none resize-none"
                                />
                                <button
                                    onClick={handleAiSubmit}
                                    disabled={!aiPrompt.trim() || isGenerating}
                                    className="absolute bottom-2 right-2 p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md disabled:opacity-50 transition-colors"
                                >
                                    <SendIcon className="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* New Script Modal */}
                {showNewScriptModal && (
                    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="bg-[#1E1E2E] w-full max-w-md rounded-xl border border-white/10 shadow-2xl overflow-hidden p-6 text-center">
                            <h3 className="text-xl font-bold text-white mb-2">Create New Script</h3>
                            <p className="text-gray-400 text-sm mb-6">What type of script would you like to build?</p>

                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={() => createNew('STRATEGY')}
                                    className="group relative p-6 bg-[#09090b] hover:bg-blue-600/10 border border-white/10 hover:border-blue-500/50 rounded-xl transition-all flex flex-col items-center gap-3"
                                >
                                    <div className="p-3 bg-blue-500/10 rounded-full text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                        <TrendUpIcon className="w-6 h-6" />
                                    </div>
                                    <span className="font-semibold text-gray-300 group-hover:text-white">Strategy</span>
                                    <span className="text-xs text-gray-500">Buy/Sell signals & backtesting</span>
                                </button>

                                <button
                                    onClick={() => createNew('INDICATOR')}
                                    className="group relative p-6 bg-[#09090b] hover:bg-purple-600/10 border border-white/10 hover:border-purple-500/50 rounded-xl transition-all flex flex-col items-center gap-3"
                                >
                                    <div className="p-3 bg-purple-500/10 rounded-full text-purple-400 group-hover:bg-purple-500 group-hover:text-white transition-colors">
                                        <StrategyIcon className="w-6 h-6" />
                                    </div>
                                    <span className="font-semibold text-gray-300 group-hover:text-white">Indicator</span>
                                    <span className="text-xs text-gray-500">Visuals & custom lines</span>
                                </button>
                            </div>

                            <button onClick={() => setShowNewScriptModal(false)} className="mt-6 text-sm text-gray-500 hover:text-white underline">Cancel</button>
                        </div>
                    </div>
                )}

                {/* Delete Confirmation Modal */}
                {strategyToDelete && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
                        <div className="bg-[#1E1E2E] w-full max-w-sm rounded-xl border border-white/10 shadow-2xl p-6 text-center transform scale-100 transition-all">
                            <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                <TrashIcon className="w-6 h-6 text-red-500" />
                            </div>
                            <h3 className="text-lg font-bold text-white mb-2">Delete Script?</h3>
                            <p className="text-gray-400 text-sm mb-6">
                                Are you sure you want to delete <span className="text-white font-medium">"{strategyToDelete.name}"</span>?
                                <br />This action cannot be undone.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setStrategyToDelete(null)}
                                    className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmDelete}
                                    className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-red-900/20"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};

export default StrategyStudio;
