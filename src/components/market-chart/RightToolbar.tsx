import React, { useState, useRef, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    WatchlistIcon,
    AlertIcon,
    DataWindowIcon,
    OrderPanelIcon,
    ObjectTreeIcon,
} from '../IconComponents';
import { useOutsideAlerter } from './hooks';

interface DrawingTool {
    icon: React.ReactNode;
    name: string;
    category: string;
}

interface RightToolbarProps {
    onTogglePanel: (
        panel: 'watchlist' | 'alerts' | 'dataWindow' | 'orderPanel' | 'objectTree'
    ) => void;
    onTogglePositions?: () => void;
    isPositionsOpen?: boolean;
    onToggleConsole?: () => void;
    isConsoleOpen?: boolean;
    consoleErrorCount?: number;
    drawingTools?: DrawingTool[];
    activeTool?: string | null;
    onToolSelect?: (name: string | null) => void;
    onToggleIndicatorEditor?: () => void;
}

const PanelButton: React.FC<{
    children: React.ReactNode;
    title?: string;
    onClick?: () => void;
}> = ({ children, title, onClick }) => (
    <button
        title={title}
        onClick={onClick}
        className="flex items-center justify-center p-2.5 rounded text-[#E0E0E0] hover:bg-[#2C2C2C] hover:text-white transition-all duration-150"
    >
        {children}
    </button>
);

/* ── Drawing Tool Group (flyout opens LEFT) ── */
const DrawingToolGroup: React.FC<{
    category: string;
    tools: DrawingTool[];
    activeTool: string | null;
    onToolSelect: (name: string | null) => void;
    currentDefault: string;
    onSetDefault: (name: string) => void;
}> = ({ category, tools, activeTool, onToolSelect, currentDefault, onSetDefault }) => {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const anchorRef = useRef<HTMLDivElement>(null);
    const flyoutRef = useRef<HTMLDivElement>(null);
    const [flyoutPos, setFlyoutPos] = useState<{ top: number; right: number } | null>(null);

    useLayoutEffect(() => {
        if (!isOpen || !anchorRef.current) return;
        const rect = anchorRef.current.getBoundingClientRect();
        setFlyoutPos({
            top: rect.top + rect.height / 2,
            right: window.innerWidth - rect.left + 8,
        });
    }, [isOpen]);

    React.useEffect(() => {
        if (!isOpen) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (anchorRef.current?.contains(t)) return;
            if (flyoutRef.current?.contains(t)) return;
            setIsOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [isOpen]);

    const activeInGroup = tools.find((t) => t.name === activeTool);
    const display = activeInGroup || tools.find((t) => t.name === currentDefault) || tools[0];
    const isActive = !!activeInGroup;

    return (
        <div className="relative" ref={ref}>
            <div className="flex relative group" ref={anchorRef}>
                <button
                    onClick={() => {
                        onToolSelect(isActive ? null : display.name);
                        onSetDefault(display.name);
                    }}
                    className={`p-2 rounded flex items-center justify-center transition-all duration-150 relative ${
                        isActive
                            ? 'bg-[#2C2C2C] text-[#c4b5f0]'
                            : 'text-[#E0E0E0] hover:bg-[#2C2C2C] hover:text-white'
                    }`}
                    title={display.name}
                >
                    {display.icon}
                    {/* Triangle indicator (bottom-left, pointing left for right-panel) */}
                    <div
                        className={`absolute bottom-[2px] left-[2px] w-[5px] h-[5px] pointer-events-none transition-colors ${
                            isActive
                                ? 'text-[#c4b5f0]'
                                : 'text-[#4C525E] group-hover:text-[#787B86]'
                        }`}
                    >
                        <svg viewBox="0 0 5 5" fill="currentColor" className="w-full h-full">
                            <path d="M0 5L5 5L0 0Z" />
                        </svg>
                    </div>
                </button>
                {/* Hit area for opening flyout */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsOpen(!isOpen);
                    }}
                    className="absolute bottom-0 left-0 w-4 h-4 opacity-0 cursor-pointer z-10"
                    title="More tools"
                />
            </div>

            {/* Flyout menu — opens to the LEFT (portaled to escape overflow clipping) */}
            {isOpen && flyoutPos && createPortal(
                <div
                    ref={flyoutRef}
                    style={{
                        position: 'fixed',
                        top: flyoutPos.top,
                        right: flyoutPos.right,
                        transform: 'translateY(-50%)',
                    }}
                    className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-md shadow-[0_4px_20px_rgba(0,0,0,0.6)] z-[9999] flex flex-col min-w-[190px] py-1 max-h-[60vh] overflow-y-auto"
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <div className="px-3 py-1.5 text-[9px] font-bold text-[#787B86] uppercase border-b border-[#2A2A2A] mb-0.5 tracking-widest sticky top-0 bg-[#1A1A1A]">
                        {category}
                    </div>
                    {tools.map((tool) => (
                        <button
                            key={tool.name}
                            onClick={() => {
                                onSetDefault(tool.name);
                                onToolSelect(tool.name);
                                setIsOpen(false);
                            }}
                            className={`flex items-center gap-2.5 px-3 py-2 text-[12px] text-left transition-all duration-100 hover:bg-[#2C2C2C] ${
                                tool.name === display.name
                                    ? 'bg-[rgba(196,181,240,0.08)] text-[#c4b5f0]'
                                    : 'text-[#D1D4DC]'
                            }`}
                        >
                            <span className="w-4 h-4 flex items-center justify-center flex-shrink-0 opacity-80">
                                {tool.icon}
                            </span>
                            <span>{tool.name}</span>
                        </button>
                    ))}
                </div>,
                document.body
            )}
        </div>
    );
};

const RightToolbar: React.FC<RightToolbarProps> = ({
    onTogglePanel,
    drawingTools = [],
    activeTool = null,
    onToolSelect,
    onToggleIndicatorEditor,
}) => {
    const panelButtons = [
        {
            icon: <WatchlistIcon className="w-5 h-5" />,
            name: 'Watchlist & Details',
            action: () => onTogglePanel('watchlist'),
        },
        {
            icon: <AlertIcon className="w-5 h-5" />,
            name: 'Alerts',
            action: () => onTogglePanel('alerts'),
        },
        {
            icon: <DataWindowIcon className="w-5 h-5" />,
            name: 'Data Window',
            action: () => onTogglePanel('dataWindow'),
        },
        {
            icon: <ObjectTreeIcon className="w-5 h-5" />,
            name: 'Object Tree',
            action: () => onTogglePanel('objectTree'),
        },
        {
            icon: <OrderPanelIcon className="w-5 h-5" />,
            name: 'Order Panel',
            action: () => onTogglePanel('orderPanel'),
        },
    ];

    const grouped = useMemo(() => {
        const groups: Record<string, DrawingTool[]> = {};
        drawingTools.forEach((t) => {
            const cat = t.category || 'Other';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(t);
        });
        return groups;
    }, [drawingTools]);

    const [defaults, setDefaults] = useState<Record<string, string>>({});
    const categoryOrder = [
        'Trend lines',
        'Gann and Fibonacci',
        'Geometric shapes',
        'Annotation',
        'Forecasting and Measurement',
    ];

    return (
        <div className="w-12 border-l border-[#2A2A2A] flex flex-col items-center py-2 bg-[#0f0f0f] h-full">
            {/* Panel toggle buttons */}
            <div className="flex flex-col items-center gap-0.5">
                {panelButtons.map((btn) => (
                    <PanelButton key={btn.name} title={btn.name} onClick={btn.action}>
                        {btn.icon}
                    </PanelButton>
                ))}
            </div>

            {/* Separator */}
            {drawingTools.length > 0 && <div className="w-6 border-t border-[#2A2A2A] my-2" />}

            {/* Drawing tools — scrollable if many */}
            <div
                className="flex flex-col items-center gap-0.5 flex-1 overflow-y-auto overflow-x-hidden"
                style={{ scrollbarWidth: 'none' }}
            >
                {categoryOrder.map((cat) => {
                    if (!grouped[cat]) return null;
                    return (
                        <DrawingToolGroup
                            key={cat}
                            category={cat}
                            tools={grouped[cat]}
                            activeTool={activeTool}
                            onToolSelect={onToolSelect || (() => {})}
                            currentDefault={defaults[cat] || grouped[cat][0].name}
                            onSetDefault={(name) =>
                                setDefaults((prev) => ({ ...prev, [cat]: name }))
                            }
                        />
                    );
                })}
            </div>

            {/* Indicator Editor Toggle */}
            {onToggleIndicatorEditor && (
                <>
                    <div className="w-6 border-t border-[#2A2A2A] my-2" />
                    <button
                        type="button"
                        onClick={onToggleIndicatorEditor}
                        title="Indicator Editor (Ctrl+E)"
                        className="flex items-center justify-center p-2.5 rounded text-[#E0E0E0] hover:bg-[#2C2C2C] hover:text-white transition-all duration-150"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="16 18 22 12 16 6" />
                            <polyline points="8 6 2 12 8 18" />
                        </svg>
                    </button>
                </>
            )}
        </div>
    );
};

export default RightToolbar;
