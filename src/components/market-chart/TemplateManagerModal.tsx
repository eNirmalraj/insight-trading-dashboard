import React from 'react';
import { CloseIcon, TrashIcon } from '../IconComponents';
import { Drawing, Indicator } from './types';

interface TemplateManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
    templates: Record<string, { drawings: Drawing[], indicators: Indicator[] }>;
    onLoad: (name: string) => void;
    onDelete: (name: string) => void;
    onSave: () => void;
}

const TemplateManagerModal: React.FC<TemplateManagerModalProps> = ({ isOpen, onClose, templates, onLoad, onDelete, onSave }) => {
    if (!isOpen) return null;

    const templateNames = Object.keys(templates);

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div 
              className="bg-gray-800/90 backdrop-blur-sm border border-gray-700 rounded-lg shadow-2xl w-full max-w-md flex flex-col max-h-[70vh]"
              onClick={e => e.stopPropagation()}
              onPointerDown={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center p-4 border-b border-gray-700">
                    <h2 className="font-semibold text-white text-lg">Chart Templates</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><CloseIcon className="w-5 h-5" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                    {templateNames.length === 0 ? (
                         <div className="text-center py-16 px-6 text-gray-500">
                            <h3 className="text-lg font-semibold text-gray-400">No Saved Templates</h3>
                            <p className="mt-2 text-sm">Save your current layout as a new template to get started.</p>
                        </div>
                    ) : (
                        <ul className="space-y-1">
                            {templateNames.map(name => (
                                <li key={name} className="flex items-center justify-between p-2 rounded-md hover:bg-gray-700/50 group">
                                    <span className="text-sm text-gray-300">{name}</span>
                                    <div className="flex items-center gap-2 opacity-50 group-hover:opacity-100">
                                        <button onClick={() => onLoad(name)} className="text-sm font-semibold text-blue-400 hover:text-blue-300">Load</button>
                                        <button onClick={() => onDelete(name)} title="Delete Template">
                                            <TrashIcon className="w-4 h-4 text-gray-400 hover:text-red-400" />
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="p-4 border-t border-gray-700">
                    <button 
                        onClick={onSave}
                        className="w-full bg-blue-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-600 transition-colors"
                    >
                        Save current layout as template...
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TemplateManagerModal;
