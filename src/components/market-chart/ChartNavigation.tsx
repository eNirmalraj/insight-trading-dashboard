
import React from 'react';
import { 
    ChevronLeftIcon, ChevronRightIcon, PlusIcon, MinusIcon, ResetIcon 
} from '../IconComponents';

// Fix: Add disabled prop to NavButton to control its state.
const NavButton: React.FC<{ children: React.ReactNode, title?: string, onClick?: () => void, disabled?: boolean }> = ({ children, title, onClick, disabled }) => (
    <button title={title} onClick={onClick} disabled={disabled} className="flex items-center justify-center w-6 h-6 rounded-full text-gray-300 bg-gray-800/50 hover:bg-gray-700 hover:text-white transition-colors disabled:text-gray-500 disabled:cursor-not-allowed disabled:hover:bg-gray-800/50">
        {children}
    </button>
);

// Fix: Add canPanToOlderData and canPanToNewerData to props to fix type error and allow disabling buttons.
interface ChartNavigationProps {
    onZoom: (dir: number) => void;
    onPan: (dir: number) => void;
    onReset: () => void;
    canPanToOlderData: boolean;
    canPanToNewerData: boolean;
}

const ChartNavigation: React.FC<ChartNavigationProps> = ({ onZoom, onPan, onReset, canPanToOlderData, canPanToNewerData }) => (
    <div className={`flex items-center gap-0.5 p-1 bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-full shadow-lg`}>
        {/* Pan Left (Older Data) - Hidden on Mobile */}
        <div className="hidden md:flex items-center gap-0.5">
            <NavButton onClick={() => onPan(-5)} title="Pan Far Left" disabled={!canPanToOlderData}><ChevronLeftIcon className="w-3.5 h-3.5" /><ChevronLeftIcon className="w-3.5 h-3.5 -ml-2" /></NavButton>
            <NavButton onClick={() => onPan(-1)} title="Pan Left" disabled={!canPanToOlderData}><ChevronLeftIcon className="w-3.5 h-3.5" /></NavButton>
        </div>
        
        <NavButton onClick={onReset} title="Reset Chart View (Alt + R)"><ResetIcon className="w-3.5 h-3.5" /></NavButton>
        
        {/* Zoom Controls - Hidden on Mobile */}
        <div className="hidden md:flex items-center gap-0.5">
            <NavButton onClick={() => onZoom(-1)} title="Zoom Out"><MinusIcon className="w-3.5 h-3.5" /></NavButton>
            <NavButton onClick={() => onZoom(1)} title="Zoom In"><PlusIcon className="w-3.5 h-3.5" /></NavButton>
        </div>

        {/* Pan Right (Newer Data) - Hidden on Mobile */}
        <div className="hidden md:flex items-center gap-0.5">
            <NavButton onClick={() => onPan(1)} title="Pan Right" disabled={!canPanToNewerData}><ChevronRightIcon className="w-3.5 h-3.5" /></NavButton>
            <NavButton onClick={() => onPan(5)} title="Pan Far Right" disabled={!canPanToNewerData}><ChevronRightIcon className="w-3.5 h-3.5" /><ChevronRightIcon className="w-3.5 h-3.5 -ml-2" /></NavButton>
        </div>
    </div>
);

export default ChartNavigation;
