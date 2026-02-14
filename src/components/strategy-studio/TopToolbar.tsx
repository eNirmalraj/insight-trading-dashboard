
import React, { useState } from 'react';
import { Strategy } from '../../types';

// Icons (You might want to move these to a separate file later)
const SaveIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
);
const PlayIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);
const ChevronDownIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
);
const LoaderIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
);

interface TopToolbarProps {
    strategyName: string;
    setStrategyName: (name: string) => void;
    activeScript: string | null;
    isDirty: boolean;
    isSaving: boolean;
    onSave: () => void;
    onOpenScript: () => void;
    onRun: () => void;
    onCreateNew: () => void;
}

export const TopToolbar: React.FC<TopToolbarProps> = ({
    strategyName,
    setStrategyName,
    activeScript,
    isDirty,
    isSaving,
    onSave,
    onOpenScript,
    onRun,
    onCreateNew
}) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    return (
        <header className="h-14 flex-shrink-0 bg-[#09090b] border-b border-white/10 flex items-center px-4 justify-between select-none">
            {/* Left Section: Script Info & Menu */}
            <div className="flex items-center gap-4 flex-1 min-w-0">

                {/* File Menu Dropdown */}
                <div className="relative z-50">
                    <button
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        className="flex items-center gap-2 hover:bg-white/5 px-2 py-1 rounded transition-colors"
                    >
                        <div className="flex flex-col items-start">
                            {activeScript ? (
                                <span className="text-sm font-medium text-gray-200">
                                    {strategyName || "Untitled"}
                                    {isDirty && <span className="ml-2 text-yellow-500 text-xs">●</span>}
                                </span>
                            ) : (
                                <span className="text-sm font-medium text-gray-500">No Script Selected</span>
                            )}
                        </div>
                        <ChevronDownIcon className="w-4 h-4 text-gray-500" />
                    </button>

                    {/* Menu Items */}
                    {isMenuOpen && (
                        <>
                            <div
                                className="fixed inset-0 z-40"
                                onClick={() => setIsMenuOpen(false)}
                            />
                            <div className="absolute top-full left-0 mt-1 w-48 bg-[#18181b] border border-white/10 rounded-md shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                                <button
                                    onClick={() => { onCreateNew(); setIsMenuOpen(false); }}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-white/10 hover:text-white"
                                >
                                    New Script...
                                </button>
                                <button
                                    onClick={() => { onOpenScript(); setIsMenuOpen(false); }}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-white/10 hover:text-white"
                                >
                                    Open...
                                </button>
                                <div className="h-px bg-white/10 my-1" />
                                <button
                                    onClick={() => { onSave(); setIsMenuOpen(false); }}
                                    disabled={!activeScript}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-white/10 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Save
                                </button>
                                <button
                                    className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-white/10 hover:text-white"
                                    onClick={() => setIsMenuOpen(false)}
                                >
                                    Make a copy...
                                </button>
                                <div className="h-px bg-white/10 my-1" />
                                <button
                                    className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-white/10 hover:text-white"
                                    onClick={() => setIsMenuOpen(false)}
                                >
                                    Export / Download
                                </button>
                            </div>
                        </>
                    )}
                </div>

                {/* Vertical Divider */}
                <div className="w-px h-6 bg-white/10 mx-2" />

                {/* Quick Actions */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={onSave}
                        disabled={isSaving || !activeScript}
                        className="text-gray-400 hover:text-white p-2 rounded hover:bg-white/5 transition-colors disabled:opacity-50"
                        title="Save Script (Ctrl+S)"
                    >
                        {isSaving ? <LoaderIcon className="w-5 h-5 animate-spin" /> : <SaveIcon className="w-5 h-5" />}
                    </button>

                    {/* Add to Chart / Run */}
                    <button
                        onClick={onRun}
                        disabled={!activeScript}
                        className="flex items-center gap-2 bg-[#2962ff] hover:bg-[#1e54e8] text-white px-3 py-1.5 rounded text-sm font-medium transition-colors shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:bg-gray-800"
                    >
                        <PlayIcon className="w-4 h-4" />
                        Add to chart
                    </button>
                </div>

            </div>

            {/* Right Section: Kuri Badge */}
            {activeScript && (
                <div className="flex items-center gap-2 bg-purple-600/20 border border-purple-500/30 rounded-lg px-3 py-1.5">
                    <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></span>
                    <span className="text-xs font-semibold text-purple-300 tracking-wide">KURI</span>
                </div>
            )}
        </header>
    );
};
