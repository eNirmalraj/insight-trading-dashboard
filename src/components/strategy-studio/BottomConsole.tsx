import React from 'react';

// Icons
const TerminalIcon = ({ className }: { className?: string }) => (
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
            d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
    </svg>
);
const ChevronUpIcon = ({ className }: { className?: string }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
    >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
    </svg>
);
const ChevronDownIcon = ({ className }: { className?: string }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
    >
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
);
const TrashIcon = ({ className }: { className?: string }) => (
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
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
        />
    </svg>
);

// Error/Warning icons for log entries
const ErrorIcon = () => (
    <svg
        className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5"
        viewBox="0 0 16 16"
        fill="currentColor"
    >
        <path
            fillRule="evenodd"
            d="M8 15A7 7 0 108 1a7 7 0 000 14zm0-9.5a.75.75 0 01.75.75v3a.75.75 0 01-1.5 0v-3A.75.75 0 018 5.5zm0 7a.75.75 0 100-1.5.75.75 0 000 1.5z"
        />
    </svg>
);
const WarningIcon = () => (
    <svg
        className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5"
        viewBox="0 0 16 16"
        fill="currentColor"
    >
        <path
            fillRule="evenodd"
            d="M8.22 1.754a.25.25 0 00-.44 0L1.698 13.132a.25.25 0 00.22.368h12.164a.25.25 0 00.22-.368L8.22 1.754zm-1.763-.707c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0114.082 15H1.918a1.75 1.75 0 01-1.543-2.575L6.457 1.047zM9 11a1 1 0 11-2 0 1 1 0 012 0zm-.25-5.25a.75.75 0 00-1.5 0v2.5a.75.75 0 001.5 0v-2.5z"
        />
    </svg>
);
const InfoIcon = () => (
    <svg
        className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5"
        viewBox="0 0 16 16"
        fill="currentColor"
    >
        <path
            fillRule="evenodd"
            d="M8 15A7 7 0 108 1a7 7 0 000 14zm.75-10.25a.75.75 0 00-1.5 0v.5a.75.75 0 001.5 0v-.5zM8 8a.75.75 0 01.75.75v2.5a.75.75 0 01-1.5 0v-2.5A.75.75 0 018 8z"
        />
    </svg>
);
const SuccessIcon = () => (
    <svg
        className="w-3.5 h-3.5 text-green-400 flex-shrink-0 mt-0.5"
        viewBox="0 0 16 16"
        fill="currentColor"
    >
        <path
            fillRule="evenodd"
            d="M8 15A7 7 0 108 1a7 7 0 000 14zm3.844-8.791a.75.75 0 00-1.188-.918l-3.7 4.79-1.649-1.833a.75.75 0 10-1.114 1.004l2.25 2.5a.75.75 0 001.15-.043l4.25-5.5z"
        />
    </svg>
);

export interface ConsoleLog {
    timestamp: string;
    message: string;
    type: 'info' | 'error' | 'success' | 'warn';
    line?: number;
    column?: number;
    code?: string; // Error code like K012
    suggestion?: string;
    category?: string;
}

interface BottomConsoleProps {
    logs: ConsoleLog[];
    isOpen: boolean;
    height: number;
    errorCount?: number;
    warningCount?: number;
    onToggle: () => void;
    onClear: () => void;
    onResizeStart: (e: React.MouseEvent) => void;
    onNavigateToLine?: (line: number, column?: number) => void;
    onSendErrorToAI?: (errors: string[]) => void;
}

export const BottomConsole: React.FC<BottomConsoleProps> = ({
    logs,
    isOpen,
    height,
    errorCount = 0,
    warningCount = 0,
    onToggle,
    onClear,
    onResizeStart,
    onNavigateToLine,
    onSendErrorToAI,
}) => {
    const scrollRef = React.useRef<HTMLDivElement>(null);
    const [activeFilter, setActiveFilter] = React.useState<'all' | 'error' | 'warn' | 'info'>(
        'all'
    );
    const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(new Set());

    const filteredLogs = React.useMemo(() => {
        if (activeFilter === 'all') return logs;
        return logs.filter((l) => l.type === activeFilter);
    }, [logs, activeFilter]);

    const groupedEntries = React.useMemo(() => {
        const counts = new Map<string, { count: number; indices: number[] }>();

        filteredLogs.forEach((log, i) => {
            if (!log.code) return;
            const key = `${log.code}:${log.message}`;
            const entry = counts.get(key) || { count: 0, indices: [] };
            entry.count++;
            entry.indices.push(i);
            counts.set(key, entry);
        });

        const collapsed = new Set<number>();
        const groupHeaders = new Map<number, { key: string; count: number; sample: ConsoleLog }>();

        counts.forEach((entry, key) => {
            if (entry.count >= 8 && !expandedGroups.has(key)) {
                groupHeaders.set(entry.indices[0], {
                    key,
                    count: entry.count,
                    sample: filteredLogs[entry.indices[0]],
                });
                entry.indices.slice(1).forEach((i) => collapsed.add(i));
            }
        });

        return { collapsed, groupHeaders };
    }, [filteredLogs, expandedGroups]);

    // Auto-scroll to bottom when new logs arrive
    React.useEffect(() => {
        if (scrollRef.current && isOpen) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs.length, isOpen]);

    const handleDoubleClick = (log: ConsoleLog) => {
        if (log.line && onNavigateToLine) {
            onNavigateToLine(log.line, log.column);
        } else if (onNavigateToLine) {
            // Try to extract line number from message like "Line 5:" or "(Line 5)"
            const lineMatch = log.message.match(/[Ll]ine\s+(\d+)/);
            if (lineMatch) {
                onNavigateToLine(parseInt(lineMatch[1], 10));
            }
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'error':
                return <ErrorIcon />;
            case 'warn':
                return <WarningIcon />;
            case 'success':
                return <SuccessIcon />;
            default:
                return <InfoIcon />;
        }
    };

    const getTextColor = (type: string) => {
        switch (type) {
            case 'error':
                return 'text-red-300';
            case 'warn':
                return 'text-yellow-300';
            case 'success':
                return 'text-green-300';
            default:
                return 'text-gray-300';
        }
    };

    const getBgColor = (type: string) => {
        switch (type) {
            case 'error':
                return 'hover:bg-red-500/10 border-l-2 border-l-red-500/50';
            case 'warn':
                return 'hover:bg-yellow-500/10 border-l-2 border-l-yellow-500/50';
            case 'success':
                return 'hover:bg-green-500/10 border-l-2 border-l-transparent';
            default:
                return 'hover:bg-white/5 border-l-2 border-l-transparent';
        }
    };

    // Format message: highlight line references and error codes
    const formatMessage = (log: ConsoleLog) => {
        const parts: React.ReactNode[] = [];
        let msg = log.message;

        // Highlight error code like [K012]
        const codeMatch = msg.match(/^\[([A-Z]\d{3})\]\s*/);
        if (codeMatch) {
            parts.push(
                <span key="code" className="text-gray-500 font-bold mr-1">
                    {codeMatch[0].trim()}
                </span>
            );
            msg = msg.slice(codeMatch[0].length);
        }

        // Highlight "Line N:" references
        const lineRegex = /\b(Line\s+\d+)/gi;
        let lastIdx = 0;
        let match;
        while ((match = lineRegex.exec(msg)) !== null) {
            if (match.index > lastIdx) {
                parts.push(<span key={`t${lastIdx}`}>{msg.slice(lastIdx, match.index)}</span>);
            }
            parts.push(
                <span
                    key={`l${match.index}`}
                    className="text-blue-400 underline decoration-dotted cursor-pointer"
                    onClick={() => {
                        const ln = parseInt(match![0].replace(/\D/g, ''), 10);
                        if (ln && onNavigateToLine) onNavigateToLine(ln);
                    }}
                >
                    {match[0]}
                </span>
            );
            lastIdx = match.index + match[0].length;
        }
        if (lastIdx < msg.length) {
            parts.push(<span key={`t${lastIdx}`}>{msg.slice(lastIdx)}</span>);
        }

        return parts.length > 0 ? parts : msg;
    };

    return (
        <div
            className="flex-shrink-0 bg-[#0a0a0a] border-t border-white/10 flex flex-col transition-all duration-300 ease-in-out"
            style={{ height: isOpen ? height : '32px' }}
        >
            {/* Header */}
            <div
                className="h-8 flex items-center justify-between px-3 bg-[#0f0f0f] hover:bg-[#121215] cursor-pointer select-none border-b border-white/5"
                onMouseDown={(e) => {
                    if (isOpen) onResizeStart(e);
                }}
            >
                <div
                    className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors flex-1"
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggle();
                    }}
                >
                    <TerminalIcon className="w-4 h-4" />
                    <span className="text-xs font-bold tracking-wider uppercase">Console</span>

                    {/* Error/Warning counts */}
                    {errorCount > 0 && (
                        <span className="flex items-center gap-1 bg-red-500/20 text-red-400 text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                            <svg className="w-2.5 h-2.5" viewBox="0 0 16 16" fill="currentColor">
                                <circle cx="8" cy="8" r="7" />
                            </svg>
                            {errorCount}
                        </span>
                    )}
                    {warningCount > 0 && (
                        <span className="flex items-center gap-1 bg-yellow-500/20 text-yellow-400 text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                            <svg className="w-2.5 h-2.5" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M8 1l7 14H1L8 1z" />
                            </svg>
                            {warningCount}
                        </span>
                    )}
                    {errorCount === 0 && warningCount === 0 && logs.length > 0 && (
                        <span className="bg-white/10 text-gray-400 text-[10px] px-1.5 py-0.5 rounded-full">
                            {logs.length}
                        </span>
                    )}

                    <div className="flex gap-1 ml-2">
                        {(['all', 'error', 'warn', 'info'] as const).map((filter) => (
                            <button
                                type="button"
                                key={filter}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveFilter(filter);
                                }}
                                className={`px-2 py-0.5 text-[10px] rounded ${
                                    activeFilter === filter
                                        ? 'bg-[#3c3c3c] text-white'
                                        : 'text-gray-500 hover:text-gray-300'
                                }`}
                            >
                                {filter === 'all'
                                    ? 'All'
                                    : filter === 'error'
                                      ? 'Errors'
                                      : filter === 'warn'
                                        ? 'Warnings'
                                        : 'Info'}
                            </button>
                        ))}
                    </div>

                    {isOpen ? (
                        <ChevronDownIcon className="w-3 h-3 ml-1" />
                    ) : (
                        <ChevronUpIcon className="w-3 h-3 ml-1" />
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {/* Fix with AI button — shown when errors exist */}
                    {errorCount > 0 && onSendErrorToAI && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                const errorMessages = logs
                                    .filter((l) => l.type === 'error')
                                    .map((l) =>
                                        l.line ? `Line ${l.line}: ${l.message}` : l.message
                                    );
                                onSendErrorToAI(errorMessages);
                            }}
                            className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-[#2962ff]/15 text-[#2962ff] border border-[#2962ff]/25 hover:bg-[#2962ff]/25 transition-colors"
                            title="Send errors to AI for fixing"
                        >
                            <svg
                                className="w-3 h-3"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={2}
                            >
                                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                                <path d="M2 17l10 5 10-5" />
                                <path d="M2 12l10 5 10-5" />
                            </svg>
                            Fix with AI
                        </button>
                    )}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onClear();
                        }}
                        className="text-gray-500 hover:text-red-400 transition-colors p-1 rounded hover:bg-white/5"
                        title="Clear Console"
                    >
                        <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Console Content */}
            {isOpen && (
                <div
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto py-1 font-mono text-[11px] custom-scrollbar bg-[#0a0a0a]"
                >
                    {filteredLogs.length === 0 ? (
                        <div className="text-gray-600 italic px-4 py-2">
                            {logs.length === 0
                                ? 'No output yet. Write a script and click Run.'
                                : 'No matching logs for this filter.'}
                        </div>
                    ) : (
                        filteredLogs.map((log, i) => {
                            if (groupedEntries.collapsed.has(i)) return null;

                            const groupHeader = groupedEntries.groupHeaders.get(i);
                            if (groupHeader) {
                                return (
                                    <div
                                        key={i}
                                        className="flex items-center gap-2 px-2 py-1 text-[11px] text-gray-400"
                                    >
                                        {getIcon(groupHeader.sample.type)}
                                        <span className="text-gray-500 font-bold">
                                            [{groupHeader.sample.code}]
                                        </span>
                                        <span>
                                            {groupHeader.sample.message} ({groupHeader.count}{' '}
                                            occurrences)
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setExpandedGroups((prev) => {
                                                    const next = new Set(prev);
                                                    next.add(groupHeader.key);
                                                    return next;
                                                })
                                            }
                                            className="text-blue-400 text-[10px] hover:underline"
                                        >
                                            [expand]
                                        </button>
                                        {groupHeader.sample.suggestion && (
                                            <div className="ml-6 text-blue-400 text-[10px] italic">
                                                Hint: {groupHeader.sample.suggestion}
                                            </div>
                                        )}
                                    </div>
                                );
                            }

                            return (
                                <div key={i}>
                                    <div
                                        className={`flex items-start gap-2 py-1 px-3 cursor-pointer transition-colors ${getBgColor(log.type)} ${log.line ? 'cursor-pointer' : ''}`}
                                        onClick={() => handleDoubleClick(log)}
                                        title={
                                            log.line ? `Click to go to line ${log.line}` : undefined
                                        }
                                    >
                                        {getIcon(log.type)}
                                        <span className="text-gray-500 select-none text-[10px] mt-0.5 w-16 flex-shrink-0">
                                            {log.timestamp}
                                        </span>
                                        {log.line && (
                                            <span
                                                className="text-blue-400/70 text-[10px] mt-0.5 w-12 flex-shrink-0 hover:text-blue-300 cursor-pointer"
                                                onClick={() =>
                                                    onNavigateToLine?.(log.line!, log.column)
                                                }
                                                title={`Go to line ${log.line}`}
                                            >
                                                Ln {log.line}
                                            </span>
                                        )}
                                        <span
                                            className={`${getTextColor(log.type)} flex-1 leading-relaxed`}
                                        >
                                            {formatMessage(log)}
                                        </span>
                                    </div>
                                    {log.suggestion && (
                                        <div className="ml-6 text-blue-400 text-[10px] italic mt-0.5 px-3 pb-1">
                                            Hint: {log.suggestion}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
};
