import React, { useState, useRef, useMemo } from 'react';
import { useOutsideAlerter } from './hooks';

interface Tool {
    icon: React.ReactNode;
    name: string;
    category: string;
}

interface LeftToolbarProps {
    tools: Tool[];
    activeTool: string | null;
    onToolSelect: (name: string | null) => void;
}

interface ToolGroupProps {
    category: string;
    tools: Tool[];
    activeTool: string | null;
    onToolSelect: (name: string | null) => void;
    currentDefault: string;
    onSetDefault: (name: string) => void;
}

const ToolGroup: React.FC<ToolGroupProps> = ({
    category,
    tools,
    activeTool,
    onToolSelect,
    currentDefault,
    onSetDefault,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    useOutsideAlerter(wrapperRef, () => setIsOpen(false));

    // The tool to display on the face of the button
    const activeToolInGroup = tools.find((t) => t.name === activeTool);
    const displayTool =
        activeToolInGroup || tools.find((t) => t.name === currentDefault) || tools[0];
    const isActive = !!activeToolInGroup;

    const handleMainClick = () => {
        onToolSelect(isActive ? null : displayTool.name);
        onSetDefault(displayTool.name);
    };

    const handleMenuClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsOpen(!isOpen);
    };

    const handleSubSelect = (toolName: string) => {
        onSetDefault(toolName);
        onToolSelect(toolName);
        setIsOpen(false);
    };

    return (
        <div className="relative" ref={wrapperRef}>
            <div className="flex relative group">
                <button
                    onClick={handleMainClick}
                    className={`p-2 rounded-md flex items-center justify-center transition-colors relative ${isActive ? 'bg-[#2C2C2C] text-[#c4b5f0]' : 'text-[#E0E0E0] hover:bg-[#2C2C2C] hover:text-white'}`}
                    title={displayTool.name}
                >
                    {displayTool.icon}
                    {/* Small triangle indicator for group */}
                    <div
                        className={`absolute bottom-[2px] right-[2px] w-[6px] h-[6px] pointer-events-none transition-colors ${isActive ? 'text-[#c4b5f0]' : 'text-[#4C525E] group-hover:text-[#E0E0E0]'}`}
                    >
                        <svg viewBox="0 0 6 6" fill="currentColor" className="w-full h-full">
                            <path d="M6 6L0 6L6 0Z" />
                        </svg>
                    </div>
                </button>
                {/* Hit area for menu */}
                <button
                    onClick={handleMenuClick}
                    className="absolute bottom-0 right-0 w-5 h-5 opacity-0 hover:opacity-100 flex items-end justify-end p-0.5 cursor-pointer z-10"
                    title="More tools"
                ></button>
            </div>

            {isOpen && (
                <div className="absolute left-full top-0 ml-2 bg-[#1E1E1E] border border-[#2A2A2A] rounded-md shadow-[0_4px_16px_rgba(0,0,0,0.5)] z-50 flex flex-col min-w-[180px] py-1 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-2 text-[10px] font-bold text-[#4C525E] uppercase border-b border-[#2A2A2A] mb-1 tracking-wider">
                        {category}
                    </div>
                    {tools.map((tool) => (
                        <button
                            key={tool.name}
                            onClick={() => handleSubSelect(tool.name)}
                            className={`flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors hover:bg-[#2C2C2C] ${tool.name === displayTool.name ? 'bg-[rgba(196,181,240,0.1)] text-[#c4b5f0]' : 'text-[#E0E0E0]'}`}
                        >
                            <span className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                                {tool.icon}
                            </span>
                            <span>{tool.name}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

const LeftToolbar: React.FC<LeftToolbarProps> = ({ tools, activeTool, onToolSelect }) => {
    const grouped = useMemo(() => {
        const groups: Record<string, Tool[]> = {};
        tools.forEach((t) => {
            const cat = t.category || 'Other';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(t);
        });
        return groups;
    }, [tools]);

    const [defaults, setDefaults] = useState<Record<string, string>>({});

    const handleSetDefault = (category: string, toolName: string) => {
        setDefaults((prev) => ({ ...prev, [category]: toolName }));
    };

    const order = [
        'Trend lines',
        'Gann and Fibonacci',
        'Geometric shapes',
        'Annotation',
        'Forecasting and Measurement',
    ];

    return (
        <div className="w-12 border-r border-[#2A2A2A] flex flex-col items-center gap-2 py-2 bg-[#0f0f0f] z-10">
            {order.map((cat) => {
                if (!grouped[cat]) return null;
                return (
                    <ToolGroup
                        key={cat}
                        category={cat}
                        tools={grouped[cat]}
                        activeTool={activeTool}
                        onToolSelect={onToolSelect}
                        currentDefault={defaults[cat] || grouped[cat][0].name}
                        onSetDefault={(name) => handleSetDefault(cat, name)}
                    />
                );
            })}
        </div>
    );
};

export default LeftToolbar;
