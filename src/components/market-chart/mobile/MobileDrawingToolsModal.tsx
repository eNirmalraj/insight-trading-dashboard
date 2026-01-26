import React from 'react';
import { CloseIcon } from '../../IconComponents';

interface MobileDrawingToolsModalProps {
    isOpen: boolean;
    onClose: () => void;
    tools: { icon: React.ReactNode; name: string; category: string }[];
    onSelect: (toolName: string) => void;
}

export const MobileDrawingToolsModal: React.FC<MobileDrawingToolsModalProps> = ({
    isOpen,
    onClose,
    tools,
    onSelect
}) => {
    if (!isOpen) return null;

    const groupedTools = tools.reduce((acc, tool) => {
        if (!acc[tool.category]) acc[tool.category] = [];
        acc[tool.category].push(tool);
        return acc;
    }, {} as Record<string, typeof tools>);

    return (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex flex-col justify-end animate-slide-in-up" onClick={onClose}>
            <div className="bg-gray-900 rounded-t-2xl p-4 max-h-[70vh] overflow-y-auto border-t border-gray-700" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4 border-b border-gray-800 pb-2">
                    <h3 className="text-lg font-semibold text-white">Drawing Tools</h3>
                    <button onClick={onClose}><CloseIcon className="w-6 h-6 text-gray-400" /></button>
                </div>
                <div className="space-y-6">
                    {Object.entries(groupedTools).map(([category, categoryTools]) => (
                        <div key={category}>
                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">{category}</h4>
                            <div className="grid grid-cols-4 gap-3">
                                {(categoryTools as typeof tools).map(tool => (
                                    <button
                                        key={tool.name}
                                        onClick={() => { onSelect(tool.name); onClose(); }}
                                        className="flex flex-col items-center justify-center p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 active:bg-blue-600 active:text-white transition-colors"
                                    >
                                        <div className="p-2 rounded-full bg-gray-700 mb-1">{tool.icon}</div>
                                        <span className="text-[10px] text-center leading-tight">{tool.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
