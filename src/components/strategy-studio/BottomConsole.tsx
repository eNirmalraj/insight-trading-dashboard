
import React from 'react';

// Icons
const TerminalIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 17v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
);
const ChevronUpIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
    </svg>
);
const ChevronDownIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
);
const TrashIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

interface Log {
    timestamp: string;
    message: string;
    type: 'info' | 'error' | 'success';
}

interface BottomConsoleProps {
    logs: Log[];
    isOpen: boolean;
    height: number;
    onToggle: () => void;
    onClear: () => void;
    onResizeStart: (e: React.MouseEvent) => void;
}

export const BottomConsole: React.FC<BottomConsoleProps> = ({
    logs,
    isOpen,
    height,
    onToggle,
    onClear,
    onResizeStart
}) => {
    return (
        <div
            className="flex-shrink-0 bg-[#09090b] border-t border-white/10 flex flex-col transition-all duration-300 ease-in-out"
            style={{ height: isOpen ? height : '32px' }}
        >
            {/* Header / Resizer */}
            <div
                className="h-8 flex items-center justify-between px-4 bg-[#09090b] hover:bg-[#121215] cursor-pointer select-none border-b border-white/5"
                onMouseDown={(e) => {
                    if (isOpen) onResizeStart(e);
                }}
                onClick={(e) => {
                    // Only toggle if we aren't resizing (simple check)
                    // Ideally check if mouse moved, but for now simple click is fine on the header
                    // We might want to separate the drag handle from the click handle
                }}
            >
                <div
                    className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors flex-1"
                    onClick={(e) => { e.stopPropagation(); onToggle(); }}
                >
                    <TerminalIcon className="w-4 h-4" />
                    <span className="text-xs font-bold tracking-wider uppercase">Console</span>
                    {logs.length > 0 && (
                        <span className="bg-white/10 text-gray-300 text-[10px] px-1.5 rounded-full">{logs.length}</span>
                    )}
                    {isOpen ? <ChevronDownIcon className="w-3 h-3 ml-1" /> : <ChevronUpIcon className="w-3 h-3 ml-1" />}
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={(e) => { e.stopPropagation(); onClear(); }}
                        className="text-gray-500 hover:text-red-400 transition-colors p-1 rounded hover:bg-white/5"
                        title="Clear Console"
                    >
                        <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Console Content */}
            {isOpen && (
                <div className="flex-1 overflow-y-auto p-2 font-mono text-xs custom-scrollbar bg-[#0c0c0e]">
                    {logs.length === 0 ? (
                        <div className="text-gray-600 italic px-2">No logs yet.</div>
                    ) : (
                        logs.map((log, i) => (
                            <div key={i} className="flex gap-2 py-0.5 hover:bg-white/5 px-2 rounded">
                                <span className="text-gray-500 select-none">[{log.timestamp}]</span>
                                <span className={`${log.type === 'error' ? 'text-red-400' :
                                        log.type === 'success' ? 'text-green-400' :
                                            'text-gray-300'
                                    }`}>
                                    {log.message}
                                </span>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};
