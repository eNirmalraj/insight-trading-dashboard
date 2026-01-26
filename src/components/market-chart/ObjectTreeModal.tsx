import React from 'react';
import { CloseIcon, EyeIcon, EyeOffIcon, TrashIcon } from '../IconComponents';
import { Drawing, Indicator } from './types';

interface ObjectTreeModalProps {
    isOpen: boolean;
    onClose: () => void;
    drawings: Drawing[];
    indicators: Indicator[];
    onDeleteDrawing: (id: string) => void;
    onToggleDrawingVisibility: (id: string) => void;
    onDeleteIndicator: (id: string) => void;
    onToggleIndicatorVisibility: (id: string) => void;
}

const ObjectTreeModal: React.FC<ObjectTreeModalProps> = ({ isOpen, onClose, drawings, indicators, onDeleteDrawing, onToggleDrawingVisibility, onDeleteIndicator, onToggleIndicatorVisibility }) => {
    if (!isOpen) return null;

    const getDrawingName = (d: Drawing): string => {
        switch(d.type) {
            case 'Horizontal Line': return `${d.type} (${d.price.toFixed(5)})`;
            case 'Text Note': return `${d.type} ("${d.text.substring(0, 15)}...")`;
            default: return d.type;
        }
    }

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div 
              className="bg-gray-800/90 backdrop-blur-sm border border-gray-700 rounded-lg shadow-2xl w-full max-w-md flex flex-col max-h-[70vh]"
              onClick={e => e.stopPropagation()}
              onPointerDown={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center p-4 border-b border-gray-700">
                    <h2 className="font-semibold text-white text-lg">Object Tree</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><CloseIcon className="w-5 h-5" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                    {drawings.length === 0 && indicators.length === 0 ? (
                         <div className="text-center py-16 px-6 text-gray-500">
                            <h3 className="text-lg font-semibold text-gray-400">No Objects on Chart</h3>
                            <p className="mt-2 text-sm">Use the toolbar to add drawings or indicators.</p>
                        </div>
                    ) : (
                    <>
                        {drawings.length > 0 && (
                            <section className="mb-4">
                                <h3 className="px-2 text-sm font-semibold text-gray-400 mb-2">Drawings ({drawings.length})</h3>
                                <ul className="space-y-1">
                                    {drawings.map(d => (
                                        <li key={d.id} className="flex items-center justify-between p-2 rounded-md hover:bg-gray-700/50 group">
                                            <span className="text-sm text-gray-300">{getDrawingName(d)}</span>
                                            <div className="flex items-center gap-2 opacity-50 group-hover:opacity-100">
                                                <button onClick={() => onToggleDrawingVisibility(d.id)} title={d.isVisible === false ? "Show" : "Hide"}>
                                                    {d.isVisible === false ? <EyeOffIcon className="w-4 h-4 text-gray-400 hover:text-white" /> : <EyeIcon className="w-4 h-4 text-gray-400 hover:text-white" />}
                                                </button>
                                                <button onClick={() => onDeleteDrawing(d.id)} title="Delete">
                                                    <TrashIcon className="w-4 h-4 text-gray-400 hover:text-red-400" />
                                                </button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}
                        {indicators.length > 0 && (
                            <section>
                                <h3 className="px-2 text-sm font-semibold text-gray-400 mb-2">Indicators ({indicators.length})</h3>
                                <ul className="space-y-1">
                                    {indicators.map(i => (
                                        <li key={i.id} className="flex items-center justify-between p-2 rounded-md hover:bg-gray-700/50 group">
                                            <span className="text-sm" style={{color: i.isVisible ? i.settings.color : '#6B7280'}}>{i.type} ({i.settings.period})</span>
                                            <div className="flex items-center gap-2 opacity-50 group-hover:opacity-100">
                                                <button onClick={() => onToggleIndicatorVisibility(i.id)} title={i.isVisible ? "Hide" : "Show"}>
                                                    {i.isVisible ? <EyeIcon className="w-4 h-4 text-gray-400 hover:text-white" /> : <EyeOffIcon className="w-4 h-4 text-gray-400 hover:text-white" />}
                                                </button>
                                                <button onClick={() => onDeleteIndicator(i.id)} title="Delete">
                                                    <TrashIcon className="w-4 h-4 text-gray-400 hover:text-red-400" />
                                                </button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}
                    </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ObjectTreeModal;
