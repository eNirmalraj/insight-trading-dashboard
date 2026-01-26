import React from 'react';

interface MobileMoreMenuProps {
    isOpen: boolean;
    onClose: () => void;
    onAction: (action: string) => void;
}

export const MobileMoreMenu: React.FC<MobileMoreMenuProps> = ({ isOpen, onClose, onAction }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-2 w-48 flex flex-col gap-1" onClick={e => e.stopPropagation()}>
                <button onClick={() => onAction('orderPanel')} className="flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-gray-700 rounded-lg w-full text-left">
                    <span>Order Panel</span>
                </button>
                <button onClick={() => onAction('alerts')} className="flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-gray-700 rounded-lg w-full text-left">
                    <span>Alerts</span>
                </button>
                <button onClick={() => onAction('objectTree')} className="flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-gray-700 rounded-lg w-full text-left">
                    <span>Object Tree</span>
                </button>
                <button onClick={() => onAction('dataWindow')} className="flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-gray-700 rounded-lg w-full text-left">
                    <span>Data Window</span>
                </button>
            </div>
        </div>
    );
};
