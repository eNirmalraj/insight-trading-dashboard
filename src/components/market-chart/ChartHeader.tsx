

import React, { useState, useRef } from 'react';
import * as ReactRouterDOM from 'react-router-dom';
// Note: ChartHeader receives isMobile as prop from parent (CandlestickChart)
import { Candle } from './types';
import { useOutsideAlerter } from './hooks';
import {
    ChevronDownIcon, UndoIcon, RedoIcon, IndicatorIcon, CandlesIcon,
    SaveLayoutIcon, FullscreenIcon, CameraIcon, LineChartIcon, MenuIcon, StarIcon
} from '../IconComponents';
import SymbolSearchModal from './SymbolSearchModal';

const HeaderButton: React.FC<{ children: React.ReactNode, className?: string, title?: string, onClick?: () => void, disabled?: boolean }> = ({ children, className, title, onClick, disabled }) => (
    <button title={title} onClick={onClick} disabled={disabled} className={`flex items-center justify-center p-1.5 rounded-md text-gray-400 hover:bg-gray-700 hover:text-white transition-colors disabled:text-gray-600 disabled:cursor-not-allowed disabled:hover:bg-transparent ${className}`}>
        {children}
    </button>
);

interface ChartHeaderProps {
    symbol: string;
    onSymbolChange: (symbol: string) => void;
    allTimeframes: string[];
    favoriteTimeframes: string[];
    activeTimeframe: string;
    onTimeframeChange: (tf: string) => void;
    onToggleFavorite: (tf: string) => void;
    onAddCustomTimeframe: (tf: string) => void;
    onLogout: () => void;
    headerOhlc: Candle | null;
    onUndo: () => void;
    onRedo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    onToggleIndicators: () => void;
    chartType: 'Candle' | 'Line';
    onToggleChartType: () => void;
    onSaveLayout: () => void;
    onToggleSettings: () => void;
    onToggleFullscreen: () => void;
    onTakeSnapshot: () => void;
    isMobile: boolean;
    onToggleMobileSidebar: () => void;
    precision?: string;
}

const ChartHeader: React.FC<ChartHeaderProps> = (props) => {
    const {
        symbol, onSymbolChange, allTimeframes, favoriteTimeframes, activeTimeframe, onTimeframeChange, onToggleFavorite, onAddCustomTimeframe, headerOhlc, onLogout,
        onUndo, onRedo, canUndo, canRedo, onToggleIndicators,
        chartType, onToggleChartType, onSaveLayout, onToggleSettings, onToggleFullscreen, onTakeSnapshot,
        isMobile, onToggleMobileSidebar, precision = 'Default'
    } = props;
    const ohlc = headerOhlc || { open: 0, high: 0, low: 0, close: 0, volume: 0 };

    const format = (p: number) => {
        if (!p && p !== 0) return '0.00';

        let decimals = 2;
        if (precision !== 'Default') {
            if (precision.includes('/')) {
                const denominator = parseInt(precision.split('/')[1]);
                if (!isNaN(denominator) && denominator > 0) {
                    decimals = Math.log10(denominator);
                }
            } else {
                decimals = parseInt(precision);
            }
            if (isNaN(decimals)) decimals = 2;
        } else {
            // Heuristic for Default
            if (p < 1) decimals = 5;
            else if (p < 10) decimals = 4;
            else if (p > 1000) decimals = 2;
            else decimals = 2;
        }
        return p.toFixed(Math.max(0, Math.floor(decimals)));
    };

    const formatVolume = (v: number | undefined) => {
        if (v === undefined) return 'n/a';
        if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
        if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
        if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K';
        return v.toFixed(2);
    };

    const isPositive = headerOhlc ? headerOhlc.close >= headerOhlc.open : false;

    // ... existing useState ...
    const [isTimeframeDropdownOpen, setTimeframeDropdownOpen] = useState(false);
    const timeframeDropdownRef = useRef<HTMLDivElement>(null);
    useOutsideAlerter(timeframeDropdownRef, () => setTimeframeDropdownOpen(false));

    const [isSymbolSearchOpen, setSymbolSearchOpen] = useState(false);
    const [customInterval, setCustomInterval] = useState('');

    const handleSymbolSelect = (newSymbol: string) => {
        onSymbolChange(newSymbol);
        setSymbolSearchOpen(false);
    };

    const handleAddCustom = () => {
        if (customInterval.trim()) {
            onAddCustomTimeframe(customInterval.trim());
            setCustomInterval('');
            setTimeframeDropdownOpen(false);
        }
    };

    const groupedTimeframes = {
        MINUTES: allTimeframes.filter(tf => tf.includes('m')),
        HOURS: allTimeframes.filter(tf => tf.includes('H')),
        DAYS: allTimeframes.filter(tf => ['D', 'W', 'M'].some(char => tf.includes(char))),
    };

    const formatTimeframeLabel = (tf: string): string => {
        const value = parseInt(tf);
        if (isNaN(value)) return tf;
        const unitChar = tf.match(/[a-zA-Z]+/)?.[0];
        let unitText = '';
        switch (unitChar) {
            case 'm': unitText = 'minute'; break;
            case 'H': unitText = 'hour'; break;
            case 'D': unitText = 'day'; break;
            case 'W': unitText = 'week'; break;
            case 'M': unitText = 'month'; break;
            default: return tf;
        }
        return `${value} ${unitText}${value > 1 ? 's' : ''}`;
    };

    return (
        <div className="flex items-center justify-between p-1.5 border-b border-gray-700/50 flex-wrap gap-1 bg-gray-900">
            <div className="flex items-center gap-1 flex-wrap">
                {isMobile && (
                    <button onClick={onToggleMobileSidebar} className="p-1 text-gray-400 hover:text-white">
                        <MenuIcon className="w-5 h-5" />
                    </button>
                )}
                <div className="bg-gray-800 p-0.5 rounded-lg flex items-center gap-1">
                    <div className="relative">
                        <button onClick={() => setSymbolSearchOpen(true)} className="px-2 py-0.5 rounded-md hover:bg-gray-700">
                            <h2 className="text-base font-semibold text-white">{symbol}</h2>
                        </button>
                        <SymbolSearchModal
                            isOpen={isSymbolSearchOpen}
                            onClose={() => setSymbolSearchOpen(false)}
                            onSymbolSelect={handleSymbolSelect}
                        />
                    </div>

                    <div className="flex items-center gap-1">
                        {favoriteTimeframes.map(tf => (
                            <button
                                key={tf}
                                onClick={() => onTimeframeChange(tf)}
                                className={`px-2 py-0.5 text-xs font-medium rounded-md transition-colors ${activeTimeframe === tf ? 'bg-blue-500/30 text-blue-300 font-semibold' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}>
                                {tf}
                            </button>
                        ))}
                    </div>

                    <div className="relative" ref={timeframeDropdownRef}>
                        <button
                            onClick={() => setTimeframeDropdownOpen(p => !p)}
                            className="flex items-center gap-1 px-1.5 py-1 text-sm rounded-md text-gray-400 hover:bg-gray-700 hover:text-white"
                            title="Select timeframe"
                        >
                            <ChevronDownIcon className={`w-4 h-4 transition-transform ${isTimeframeDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isTimeframeDropdownOpen && (
                            <div className="absolute top-full mt-2 bg-gray-800 border border-gray-700 rounded-md shadow-lg p-2 z-50 w-80">
                                <div className="flex items-center gap-1 p-1 mb-2">
                                    <input
                                        type="text"
                                        value={customInterval}
                                        onChange={(e) => setCustomInterval(e.target.value)}
                                        placeholder="e.g., 10m, 2H, 3D"
                                        className="w-full bg-gray-900 border border-gray-600 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                handleAddCustom();
                                            }
                                        }}
                                    />
                                    <button
                                        onClick={handleAddCustom}
                                        className="px-3 py-1 text-xs font-semibold rounded-md bg-blue-500 text-white hover:bg-blue-600"
                                    >
                                        Add
                                    </button>
                                </div>
                                <div className="border-t border-gray-700"></div>
                                {Object.entries(groupedTimeframes).map(([groupName, tfs]) => (
                                    tfs.length > 0 && (
                                        <div key={groupName} className="mt-2">
                                            <h4 className="text-xs text-gray-500 font-semibold px-2 mb-1">{groupName}</h4>
                                            <div className="space-y-1">
                                                {tfs.map(tf => (
                                                    <div key={tf} className={`flex items-center justify-between p-1 rounded-md transition-colors ${activeTimeframe === tf ? 'bg-blue-500/20' : 'hover:bg-gray-700/50'}`}>
                                                        <button
                                                            onClick={() => { onTimeframeChange(tf); setTimeframeDropdownOpen(false); }}
                                                            className={`flex-1 text-left px-2 py-1 text-sm rounded-md ${activeTimeframe === tf ? 'text-blue-300' : 'text-gray-300'}`}
                                                        >
                                                            {formatTimeframeLabel(tf)}
                                                        </button>
                                                        <button onClick={() => onToggleFavorite(tf)} className="p-1.5 rounded-md" title="Toggle favorite">
                                                            <StarIcon className={`w-4 h-4 transition-colors ${favoriteTimeframes.includes(tf) ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-500'}`} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {headerOhlc && (
                    <div className={`hidden md:flex items-center gap-3 ml-4 text-xs font-mono font-medium ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                        <span><span className="text-gray-500 mr-1">O</span>{format(ohlc.open)}</span>
                        <span><span className="text-gray-500 mr-1">H</span>{format(ohlc.high)}</span>
                        <span><span className="text-gray-500 mr-1">L</span>{format(ohlc.low)}</span>
                        <span><span className="text-gray-500 mr-1">C</span>{format(ohlc.close)}</span>
                        {ohlc.volume !== undefined && (
                            <span className="text-gray-400 ml-1"><span className="text-gray-500 mr-1">Vol</span>{formatVolume(ohlc.volume)}</span>
                        )}
                    </div>
                )}
            </div>
            <div className="flex items-center gap-2">
                <div className="bg-gray-800 p-1 rounded-lg">
                    <div className="hidden md:flex items-center gap-1">
                        <HeaderButton onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)"><UndoIcon className="w-5 h-5" /></HeaderButton>
                        <HeaderButton onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)"><RedoIcon className="w-5 h-5" /></HeaderButton>
                        <div className="h-5 w-px bg-gray-700"></div>
                        <HeaderButton onClick={onToggleIndicators} title="Indicators"><IndicatorIcon className="w-5 h-5" /></HeaderButton>
                        <HeaderButton onClick={onToggleChartType} title="Chart Type">
                            {chartType === 'Candle' ? <CandlesIcon className="w-5 h-5" /> : <LineChartIcon className="w-5 h-5" />}
                        </HeaderButton>
                        <div className="h-5 w-px bg-gray-700"></div>
                        <HeaderButton onClick={onSaveLayout} title="Save Chart"><SaveLayoutIcon className="w-5 h-5" /></HeaderButton>
                        <HeaderButton onClick={onToggleFullscreen} title="Fullscreen"><FullscreenIcon className="w-5 h-5" /></HeaderButton>
                        <HeaderButton onClick={onTakeSnapshot} title="Take a snapshot"><CameraIcon className="w-5 h-5" /></HeaderButton>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ChartHeader;
