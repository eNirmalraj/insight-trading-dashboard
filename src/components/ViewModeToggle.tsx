// src/components/ViewModeToggle.tsx
import React from 'react';
import { ViewGridIcon, ViewListIcon } from './IconComponents';
import type { SignalViewMode } from '../hooks/useSignalViewMode';

interface ViewModeToggleProps {
    mode: SignalViewMode;
    onChange: (mode: SignalViewMode) => void;
}

const ViewModeToggle: React.FC<ViewModeToggleProps> = ({ mode, onChange }) => {
    const baseBtn =
        'flex items-center justify-center h-9 w-9 transition-colors focus:outline-none';
    const active = 'bg-blue-500 text-white';
    const inactive = 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200';

    return (
        <div
            role="group"
            aria-label="Signal view mode"
            className="inline-flex rounded-lg border border-gray-700 overflow-hidden"
        >
            <button
                type="button"
                onClick={() => onChange('grid')}
                aria-label="Grid view"
                aria-pressed={mode === 'grid'}
                title="Grid view"
                className={`${baseBtn} ${mode === 'grid' ? active : inactive} border-r border-gray-700`}
            >
                <ViewGridIcon className="w-4 h-4" />
            </button>
            <button
                type="button"
                onClick={() => onChange('list')}
                aria-label="List view"
                aria-pressed={mode === 'list'}
                title="List view"
                className={`${baseBtn} ${mode === 'list' ? active : inactive}`}
            >
                <ViewListIcon className="w-4 h-4" />
            </button>
        </div>
    );
};

export default ViewModeToggle;
