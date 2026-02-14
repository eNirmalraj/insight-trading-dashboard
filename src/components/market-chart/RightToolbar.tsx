
import React from 'react';
import { WatchlistIcon, AlertIcon, DataWindowIcon, OrderPanelIcon, ObjectTreeIcon } from '../IconComponents';

const HeaderButton: React.FC<{ children: React.ReactNode, title?: string, onClick?: () => void }> = ({ children, title, onClick }) => (
    <button title={title} onClick={onClick} className={`flex items-center justify-center p-2 rounded-md text-gray-400 hover:bg-gray-800 hover:text-white transition-colors`}>
        {children}
    </button>
);

interface RightToolbarProps {
    onTogglePanel: (panel: 'watchlist' | 'alerts' | 'dataWindow' | 'orderPanel' | 'objectTree') => void;

}

const RightToolbar: React.FC<RightToolbarProps> = ({ onTogglePanel }) => {
    const tools = [
        { icon: <WatchlistIcon className="w-5 h-5" />, name: "Watchlist & Details", action: () => onTogglePanel('watchlist') },
        { icon: <AlertIcon className="w-5 h-5" />, name: "Alerts", action: () => onTogglePanel('alerts') },
        { icon: <DataWindowIcon className="w-5 h-5" />, name: "Data Window", action: () => onTogglePanel('dataWindow') },
        { icon: <ObjectTreeIcon className="w-5 h-5" />, name: "Object Tree", action: () => onTogglePanel('objectTree') },
        { icon: <OrderPanelIcon className="w-5 h-5" />, name: "Order Panel", action: () => onTogglePanel('orderPanel') },

    ];
    return (
        <div className="w-12 border-l border-gray-700/50 flex flex-col items-center gap-2 py-2 bg-gray-900 h-full">
            {tools.map(tool => (
                <HeaderButton key={tool.name} title={tool.name} onClick={tool.action}>
                    {tool.icon}
                </HeaderButton>
            ))}
        </div>
    );
};

export default RightToolbar;
