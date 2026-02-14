
import React, { useState } from 'react';
import { Strategy } from '../../types';
import { BUILT_IN_INDICATORS, indicatorToJSON } from '../../services/builtInIndicators';
import { BUILTIN_STRATEGY_NAMES } from '../../constants';

// Reusing Icons
const FolderOpenIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
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
const LoaderIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
);

interface OpenScriptModalProps {
    isOpen: boolean;
    onClose: () => void;
    savedStrategies: Strategy[];
    onLoadStrategy: (strategy: Strategy) => void;
    onLoadHelper: (json: string, name: string, id: string) => void;
    onDelete: (strategy: Strategy) => void;
    loading: boolean;
}

export const OpenScriptModal: React.FC<OpenScriptModalProps> = ({
    isOpen,
    onClose,
    savedStrategies,
    onLoadStrategy,
    onLoadHelper,
    onDelete,
    loading
}) => {
    const [view, setView] = useState<'BUILT_IN' | 'MY_SCRIPTS'>('BUILT_IN');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-[#18181b] border border-white/10 rounded-lg w-[600px] h-[500px] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                    <h3 className="text-lg font-medium text-white flex items-center gap-2">
                        <FolderOpenIcon className="w-5 h-5 text-purple-400" />
                        Open Script
                    </h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
                        <CloseIcon className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex items-center px-6 border-b border-white/10">
                    <button
                        onClick={() => setView('BUILT_IN')}
                        className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${view === 'BUILT_IN'
                                ? 'border-purple-500 text-purple-400'
                                : 'border-transparent text-gray-400 hover:text-white'
                            }`}
                    >
                        Built-in
                    </button>
                    <button
                        onClick={() => setView('MY_SCRIPTS')}
                        className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${view === 'MY_SCRIPTS'
                                ? 'border-blue-500 text-blue-400'
                                : 'border-transparent text-gray-400 hover:text-white'
                            }`}
                    >
                        My Scripts
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                    {view === 'BUILT_IN' && (
                        <div>
                            {/* Built-in Strategies */}
                            <div className="mb-6">
                                <div className="text-xs font-bold tracking-wider text-gray-500 uppercase mb-3">Strategies</div>
                                <div className="space-y-1">
                                    {savedStrategies.filter(s => BUILTIN_STRATEGY_NAMES.includes(s.name)).map(s => (
                                        <button
                                            key={s.id}
                                            onClick={() => { onLoadStrategy(s); onClose(); }}
                                            className="w-full text-left px-4 py-3 rounded-md bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-all flex items-center justify-between group"
                                        >
                                            <span className="text-gray-200 text-sm font-medium">{s.name}</span>
                                            <span className="text-xs text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity">Open</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Built-in Indicators */}
                            <div>
                                <div className="text-xs font-bold tracking-wider text-gray-500 uppercase mb-3">Indicators</div>
                                <div className="space-y-1">
                                    {BUILT_IN_INDICATORS.map(ind => (
                                        <button
                                            key={ind.id}
                                            onClick={() => {
                                                const json = indicatorToJSON(ind);
                                                onLoadHelper(json, ind.name, 'builtin-' + ind.id);
                                                onClose();
                                            }}
                                            className="w-full text-left px-4 py-3 rounded-md bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-all flex items-center justify-between group"
                                        >
                                            <span className="text-gray-200 text-sm font-medium">{ind.name}</span>
                                            <span className="text-xs text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity">Open</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {view === 'MY_SCRIPTS' && (
                        <div>
                            {loading ? (
                                <div className="flex justify-center py-10">
                                    <LoaderIcon className="w-6 h-6 animate-spin text-gray-500" />
                                </div>
                            ) : (
                                <>
                                    {/* User Strategies */}
                                    {savedStrategies.filter(s => s.type !== 'INDICATOR' && !BUILTIN_STRATEGY_NAMES.includes(s.name)).length > 0 && (
                                        <div className="mb-6">
                                            <div className="text-xs font-bold tracking-wider text-gray-500 uppercase mb-3">Strategies</div>
                                            <div className="space-y-1">
                                                {savedStrategies.filter(s => s.type !== 'INDICATOR' && !BUILTIN_STRATEGY_NAMES.includes(s.name)).map(s => (
                                                    <div key={s.id} className="flex items-center gap-2 group">
                                                        <button
                                                            onClick={() => { onLoadStrategy(s); onClose(); }}
                                                            className="flex-1 text-left px-4 py-3 rounded-md bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-all flex items-center justify-between"
                                                        >
                                                            <span className="text-gray-200 text-sm font-medium">{s.name}</span>
                                                            <span className="text-xs text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">Open</span>
                                                        </button>
                                                        <button
                                                            onClick={() => onDelete(s)}
                                                            className="p-3 rounded-md bg-white/5 hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                                                            title="Delete"
                                                        >
                                                            <TrashIcon className="w-5 h-5" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* User Indicators */}
                                    {savedStrategies.filter(s => s.type === 'INDICATOR' && !BUILTIN_STRATEGY_NAMES.includes(s.name)).length > 0 && (
                                        <div className="mb-6">
                                            <div className="text-xs font-bold tracking-wider text-gray-500 uppercase mb-3">Indicators</div>
                                            <div className="space-y-1">
                                                {savedStrategies.filter(s => s.type === 'INDICATOR' && !BUILTIN_STRATEGY_NAMES.includes(s.name)).map(s => (
                                                    <div key={s.id} className="flex items-center gap-2 group">
                                                        <button
                                                            onClick={() => { onLoadStrategy(s); onClose(); }}
                                                            className="flex-1 text-left px-4 py-3 rounded-md bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-all flex items-center justify-between"
                                                        >
                                                            <span className="text-gray-200 text-sm font-medium">{s.name}</span>
                                                            <span className="text-xs text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">Open</span>
                                                        </button>
                                                        <button
                                                            onClick={() => onDelete(s)}
                                                            className="p-3 rounded-md bg-white/5 hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                                                            title="Delete"
                                                        >
                                                            <TrashIcon className="w-5 h-5" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {savedStrategies.filter(s => !BUILTIN_STRATEGY_NAMES.includes(s.name)).length === 0 && (
                                        <div className="text-center py-10 text-gray-500 italic">
                                            No saved scripts found.
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
