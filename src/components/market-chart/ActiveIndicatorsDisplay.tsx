import React, { useState, useRef } from 'react';
import { Indicator } from './types';
import { SettingsIcon, CloseIcon, ChevronDownIcon, EyeIcon, EyeOffIcon, BellIcon } from '../IconComponents';
import { useOutsideAlerter } from './hooks';

interface ActiveIndicatorsDisplayProps {
    indicators: Indicator[];
    onEdit: (indicator: Indicator) => void;
    onRemove: (id: string) => void;
    onToggleVisibility: (id: string) => void;
    onToggleAllVisibility: (isVisible: boolean) => void;
    onCreateAlert?: (indicator: Indicator) => void; // NEW: For creating indicator alerts
}

const getIndicatorLabel = (indicator: Indicator): string => {
    const s = indicator.settings;
    switch (indicator.type) {
        case 'MA':
        case 'EMA':
        case 'RSI':
        case 'BB':
            return `${indicator.type} (${s.period})`;
        case 'MACD':
            return `${indicator.type} (${s.fastPeriod}, ${s.slowPeriod}, ${s.signalPeriod})`;
        case 'Stochastic':
            return `${indicator.type} (${s.kPeriod}, ${s.kSlowing}, ${s.dPeriod})`;
        case 'SuperTrend':
            return `${indicator.type} (${s.atrPeriod}, ${s.factor})`;
        default:
            return indicator.type;
    }
};

const getIndicatorColor = (indicator: Indicator): string => {
    if (!indicator.isVisible) return '#6B7280';
    const s = indicator.settings;
    return s.color || s.macdColor || s.kColor || s.upColor || '#FFFFFF';
};

const ActiveIndicatorsDisplay: React.FC<ActiveIndicatorsDisplayProps> = ({
    indicators,
    onEdit,
    onRemove,
    onToggleVisibility,
    onToggleAllVisibility,
    onCreateAlert
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    useOutsideAlerter(wrapperRef, () => setIsExpanded(false));

    if (indicators.length === 0) {
        return null;
    }

    const areAllVisible = indicators.every(ind => ind.isVisible);

    const handleToggleAll = () => {
        onToggleAllVisibility(!areAllVisible);
    };

    return (
        <div ref={wrapperRef} className="absolute top-2 left-2 z-20 min-w-[150px]">
            <div className="relative bg-gray-800/70 backdrop-blur-sm border border-gray-700/50 rounded-md">
                <div className={`flex items-center w-full p-2 text-xs text-gray-300 transition-colors ${isExpanded ? 'rounded-t-md' : 'rounded-md'}`}>
                    <button
                        onClick={handleToggleAll}
                        className="p-1 mr-2 text-gray-400 hover:text-white"
                        title={areAllVisible ? 'Hide All Indicators' : 'Show All Indicators'}
                    >
                        {areAllVisible ? <EyeIcon className="w-4 h-4" /> : <EyeOffIcon className="w-4 h-4" />}
                    </button>
                    <button
                        onClick={() => setIsExpanded(prev => !prev)}
                        className="flex-grow flex items-center justify-between font-semibold"
                        aria-expanded={isExpanded}
                        aria-controls="indicator-list"
                    >
                        <span>Indicators ({indicators.length})</span>
                        <ChevronDownIcon className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                </div>

                {isExpanded && (
                    <div id="indicator-list" className="p-2 border-t border-gray-700/50 space-y-2">
                        {indicators.map(ind => (
                            <div key={ind.id} className="flex items-center justify-between text-xs group">
                                <span
                                    style={{ color: getIndicatorColor(ind) }}
                                    className="font-semibold cursor-pointer transition-colors"
                                    onClick={() => onEdit(ind)}
                                    title={`Edit ${getIndicatorLabel(ind)}`}
                                >
                                    {getIndicatorLabel(ind)}
                                </span>

                                <div className="flex items-center opacity-60 group-hover:opacity-100 transition-opacity">
                                    {onCreateAlert && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onCreateAlert(ind);
                                            }}
                                            className="p-0.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-sm"
                                            title="Create Alert"
                                        >
                                            <BellIcon className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onToggleVisibility(ind.id);
                                        }}
                                        className="p-0.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-sm"
                                        title={ind.isVisible ? "Hide" : "Show"}
                                    >
                                        {ind.isVisible ? <EyeIcon className="w-3.5 h-3.5" /> : <EyeOffIcon className="w-3.5 h-3.5" />}
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onEdit(ind);
                                        }}
                                        className="p-0.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-sm"
                                        title="Settings"
                                    >
                                        <SettingsIcon className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={() => onRemove(ind.id)}
                                        className="p-0.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-sm"
                                        title="Remove"
                                    >
                                        <CloseIcon className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ActiveIndicatorsDisplay;
