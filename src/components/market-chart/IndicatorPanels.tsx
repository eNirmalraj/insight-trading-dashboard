
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Indicator, IndicatorSettings, IndicatorType } from './types';
import { useOutsideAlerter } from './hooks';
import { SettingsIcon, TrashIcon, CloseIcon, SearchIcon, ChevronLeftIcon } from '../IconComponents';
import { ColorPicker } from './ColorPicker';

// --- Constants & Helpers ---
const COLOR_PALETTE = [
    '#EF4444', '#F87171', '#FBBF24', '#34D399', '#10B981', '#3B82F6', '#60A5FA', '#8B5CF6',
    '#A78BFA', '#EC4899', '#F472B6', '#F3F4F6', '#9CA3AF', '#4B5563', '#1F2937', '#111827'
];

// --- Enhanced UI Components ---

const TabButton: React.FC<{ label: string, active: boolean, onClick: () => void }> = ({ label, active, onClick }) => (
    <button
        onClick={onClick}
        className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${active
            ? 'border-blue-500 text-blue-500'
            : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
    >
        {label}
    </button>
);

const ModernNumberInput: React.FC<{ label: string, value: number, onChange: (val: number) => void, min?: number, step?: number, max?: number }> = ({ label, value, onChange, min, step = 1, max }) => (
    <div className="flex items-center justify-between mb-4">
        <label className="text-sm text-gray-300">{label}</label>
        <div className="flex items-center bg-[#2a2e39] border border-gray-700 rounded focus-within:border-blue-500 hover:border-gray-600 transition-colors w-24">
            <input
                type="number"
                value={value}
                min={min}
                max={max}
                step={step}
                onChange={(e) => onChange(parseFloat(e.target.value) || (min ?? 0))}
                className="w-full bg-transparent text-gray-100 p-1.5 text-right text-sm outline-none"
            />
        </div>
    </div>
);

const ModernTextInput: React.FC<{ label: string, value: string, onChange: (val: string) => void, placeholder?: string }> = ({ label, value, onChange, placeholder }) => (
    <div className="flex flex-col gap-2 mb-4">
        <label className="text-sm text-gray-300">{label}</label>
        <div className="flex items-center bg-[#2a2e39] border border-gray-700 rounded focus-within:border-blue-500 hover:border-gray-600 transition-colors">
            <input
                type="text"
                value={value}
                placeholder={placeholder}
                onChange={(e) => onChange(e.target.value)}
                className="w-full bg-transparent text-gray-100 p-2 text-sm outline-none"
            />
        </div>
    </div>
);

const EnhancedColorPicker: React.FC<{ label: string, value: string, onChange: (val: string) => void }> = ({ label, value, onChange }) => {
    return (
        <div className="flex items-center justify-between mb-4 relative">
            <div className="flex items-center gap-2">
                <input type="checkbox" checked readOnly className="rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500 w-4 h-4 cursor-pointer" />
                <label className="text-sm text-gray-300">{label}</label>
            </div>
            <ColorPicker color={value} onChange={onChange} />
        </div>
    );
};

const VisibilityRow: React.FC<{ label: string, defaultChecked?: boolean }> = ({ label, defaultChecked = true }) => (
    <div className="flex items-center justify-between mb-3 last:mb-0">
        <div className="flex items-center gap-2">
            <input type="checkbox" defaultChecked={defaultChecked} className="rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500 w-4 h-4" />
            <label className="text-sm text-gray-300">{label}</label>
        </div>
    </div>
);


const IndicatorSettingsModal: React.FC<{
    indicator: Indicator;
    onSave: (id: string, newSettings: IndicatorSettings) => void;
    onClose: () => void;
}> = ({ indicator, onSave, onClose }) => {
    const [settings, setSettings] = useState(indicator.settings);
    const initialSettings = useRef<IndicatorSettings | null>(null);
    const [activeTab, setActiveTab] = useState<'inputs' | 'style' | 'visibility'>('inputs');

    useEffect(() => {
        setSettings(indicator.settings);
        initialSettings.current = JSON.parse(JSON.stringify(indicator.settings));
    }, [indicator]);

    const applyUpdate = (newSettings: IndicatorSettings) => {
        setSettings(newSettings);
        onSave(indicator.id, newSettings); // Live preview
    };

    const updateSettings = (updater: (prev: IndicatorSettings) => IndicatorSettings) => {
        const newSettings = updater(settings);
        applyUpdate(newSettings);
    };

    const handleCancel = () => {
        if (initialSettings.current) {
            onSave(indicator.id, initialSettings.current);
        }
        onClose();
    };

    const handleSave = () => {
        onClose(); // Settings already applied
    };

    const renderInputs = () => {
        switch (indicator.type) {
            case 'MA':
            case 'EMA':
            case 'RSI':
            case 'CCI':
            case 'MFI':
                return (
                    <>
                        <ModernNumberInput label="Length" value={settings.period || 14} onChange={val => updateSettings(s => ({ ...s, period: val }))} min={1} />
                        <div className="mt-4 p-3 bg-blue-500/10 rounded border border-blue-500/20">
                            <p className="text-xs text-blue-400">Wait for timeframe closes is enabled by default.</p>
                        </div>
                    </>
                );
            case 'MA Ribbon':
                return (
                    <>
                        <ModernTextInput
                            label="Periods (Comma Separated)"
                            value={settings.ribbonPeriods || "10,20,30,40,50,60"}
                            onChange={val => updateSettings(s => ({ ...s, ribbonPeriods: val }))}
                            placeholder="e.g. 10, 20, 50, 100"
                        />
                    </>
                );
            case 'BB':

                return (
                    <>
                        <ModernNumberInput label="Length" value={settings.period || 20} onChange={val => updateSettings(s => ({ ...s, period: val }))} min={1} />
                        <ModernNumberInput label="StdDev" value={settings.stdDev || 2} step={0.1} onChange={val => updateSettings(s => ({ ...s, stdDev: val }))} />
                    </>
                );
            case 'MACD':
                return (
                    <>
                        <ModernNumberInput label="Fast Length" value={settings.fastPeriod || 12} onChange={val => updateSettings(s => ({ ...s, fastPeriod: val }))} min={1} />
                        <ModernNumberInput label="Slow Length" value={settings.slowPeriod || 26} onChange={val => updateSettings(s => ({ ...s, slowPeriod: val }))} min={1} />
                        <ModernNumberInput label="Signal Smoothing" value={settings.signalPeriod || 9} onChange={val => updateSettings(s => ({ ...s, signalPeriod: val }))} min={1} />
                    </>
                );
            case 'Stochastic':
                return (
                    <>
                        <ModernNumberInput label="%K Length" value={settings.kPeriod || 14} onChange={val => updateSettings(s => ({ ...s, kPeriod: val }))} min={1} />
                        <ModernNumberInput label="%K Smoothing" value={settings.kSlowing || 3} onChange={val => updateSettings(s => ({ ...s, kSlowing: val }))} min={1} />
                        <ModernNumberInput label="%D Smoothing" value={settings.dPeriod || 3} onChange={val => updateSettings(s => ({ ...s, dPeriod: val }))} min={1} />
                    </>
                );
            case 'SuperTrend':
                return (
                    <>
                        <ModernNumberInput label="ATR Length" value={settings.atrPeriod || 10} onChange={val => updateSettings(s => ({ ...s, atrPeriod: val }))} min={1} />
                        <ModernNumberInput label="Factor" value={settings.factor || 3} step={0.1} onChange={val => updateSettings(s => ({ ...s, factor: val }))} />
                    </>
                );
            default:
                return (
                    <div className="flex flex-col items-center justify-center h-40 text-gray-500">
                        <SettingsIcon className="w-8 h-8 mb-2 opacity-50" />
                        <p className="text-sm">No input settings available</p>
                    </div>
                )
        }
    };

    const renderStyle = () => {
        switch (indicator.type) {
            case 'MA':
            case 'EMA':
            case 'RSI':
            case 'CCI':
            case 'MFI':
            case 'VWAP':
            case 'OBV':
                return (
                    <>
                        <EnhancedColorPicker label="Plot" value={settings.color || '#ffffff'} onChange={val => updateSettings(s => ({ ...s, color: val }))} />
                    </>
                );
            case 'MA Ribbon':
                return (
                    <>
                        <EnhancedColorPicker label="Ribbon Base Color" value={settings.ribbonBaseColor || '#2962FF'} onChange={val => updateSettings(s => ({ ...s, ribbonBaseColor: val }))} />
                    </>
                );
            case 'Volume':
                return (
                    <>
                        <EnhancedColorPicker label="Up Color" value={settings.volumeUpColor || '#4CAF50'} onChange={val => updateSettings(s => ({ ...s, volumeUpColor: val }))} />
                        <EnhancedColorPicker label="Down Color" value={settings.volumeDownColor || '#F44336'} onChange={val => updateSettings(s => ({ ...s, volumeDownColor: val }))} />
                    </>
                );
            case 'BB':

                return (
                    <>
                        <EnhancedColorPicker label="Upper Band" value={settings.upperColor || '#2962FF'} onChange={val => updateSettings(s => ({ ...s, upperColor: val }))} />
                        <EnhancedColorPicker label="Middle Band" value={settings.middleColor || '#FF6D00'} onChange={val => updateSettings(s => ({ ...s, middleColor: val }))} />
                        <EnhancedColorPicker label="Lower Band" value={settings.lowerColor || '#2962FF'} onChange={val => updateSettings(s => ({ ...s, lowerColor: val }))} />
                    </>
                );
            case 'MACD':
                return (
                    <>
                        <EnhancedColorPicker label="MACD Line" value={settings.macdColor || '#2962FF'} onChange={val => updateSettings(s => ({ ...s, macdColor: val }))} />
                        <EnhancedColorPicker label="Signal Line" value={settings.signalColor || '#FF6D00'} onChange={val => updateSettings(s => ({ ...s, signalColor: val }))} />
                        <EnhancedColorPicker label="Histogram Up" value={settings.histogramUpColor || '#4CAF50'} onChange={val => updateSettings(s => ({ ...s, histogramUpColor: val }))} />
                        <EnhancedColorPicker label="Histogram Down" value={settings.histogramDownColor || '#F44336'} onChange={val => updateSettings(s => ({ ...s, histogramDownColor: val }))} />
                    </>
                );
            case 'Stochastic':
                return (
                    <>
                        <EnhancedColorPicker label="%K Line" value={settings.kColor || '#2962FF'} onChange={val => updateSettings(s => ({ ...s, kColor: val }))} />
                        <EnhancedColorPicker label="%D Line" value={settings.dColor || '#FF6D00'} onChange={val => updateSettings(s => ({ ...s, dColor: val }))} />
                    </>
                );
            case 'SuperTrend':
                return (
                    <>
                        <EnhancedColorPicker label="Up Trend" value={settings.upColor || '#4CAF50'} onChange={val => updateSettings(s => ({ ...s, upColor: val }))} />
                        <EnhancedColorPicker label="Down Trend" value={settings.downColor || '#F44336'} onChange={val => updateSettings(s => ({ ...s, downColor: val }))} />
                    </>
                );
            default:
                return <div className="text-gray-500 italic p-4 text-center">No style settings available</div>;
        }
    };

    const renderVisibility = () => (
        <div className="space-y-4">
            <VisibilityRow label="Seconds" />
            <VisibilityRow label="Minutes" />
            <VisibilityRow label="Hours" />
            <VisibilityRow label="Days" />
            <VisibilityRow label="Weeks" />
            <VisibilityRow label="Months" />
        </div>
    );

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-[#1e222d] w-full max-w-[400px] rounded-lg shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">

                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-5 pb-2">
                    <h3 className="font-semibold text-white text-lg tracking-wide">{indicator.type}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <CloseIcon className="w-6 h-6" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex px-4 border-b border-gray-700/50 mb-4">
                    <TabButton label="Inputs" active={activeTab === 'inputs'} onClick={() => setActiveTab('inputs')} />
                    <TabButton label="Style" active={activeTab === 'style'} onClick={() => setActiveTab('style')} />
                    <TabButton label="Visibility" active={activeTab === 'visibility'} onClick={() => setActiveTab('visibility')} />
                </div>

                {/* Body */}
                <div className="px-6 py-2 overflow-y-auto max-h-[50vh] min-h-[300px] scrollbar-thin scrollbar-thumb-gray-700">
                    {activeTab === 'inputs' && renderInputs()}
                    {activeTab === 'style' && renderStyle()}
                    {activeTab === 'visibility' && renderVisibility()}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-700/50 bg-[#1e222d]">
                    <div className="relative group">
                        <button className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200">
                            Defaults <ChevronLeftIcon className="w-4 h-4 -rotate-90" />
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleCancel}
                            className="px-5 py-2 rounded border border-gray-600 text-sm text-gray-300 hover:border-gray-500 hover:text-white transition-all bg-transparent"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-6 py-2 rounded bg-white text-black text-sm font-medium hover:bg-gray-100 transition-colors shadow-lg"
                        >
                            Ok
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

interface IndicatorSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (type: IndicatorType) => void;
    customScripts?: any[]; // Strategy[]
    onAddCustom?: (script: any) => void;
    strategyVisibility?: Record<string, boolean>;
    onToggleStrategy?: (id: string, visible: boolean) => void;
}

const ALL_INDICATORS: Record<string, { name: string; type: IndicatorType; description: string }[]> = {
    'Trend': [
        { name: 'Simple Moving Average', type: 'MA', description: 'Shows the arithmetic average price over a period (SMA).' },
        { name: 'Exponential Moving Average', type: 'EMA', description: 'A moving average that places more weight on recent data.' },
        { name: 'Moving Average Ribbon', type: 'MA Ribbon', description: 'A series of moving averages of different lengths.' },
        { name: 'Bollinger Bands', type: 'BB', description: 'Measures market volatility using standard deviations.' },
        { name: 'SuperTrend', type: 'SuperTrend', description: 'Identifies the primary trend of the market.' },
        { name: 'VWAP', type: 'VWAP', description: 'Volume-Weighted Average Price, resets daily.' },
    ],
    'Oscillators': [
        { name: 'Relative Strength Index', type: 'RSI', description: 'Measures the speed and change of price movements.' },
        { name: 'MACD', type: 'MACD', description: 'Shows the relationship between two moving averages.' },
        { name: 'Stochastic', type: 'Stochastic', description: 'Compares a price to a range of its prices over time.' },
        { name: 'Commodity Channel Index', type: 'CCI', description: 'Identifies cyclical trends.' },
        { name: 'Money Flow Index', type: 'MFI', description: 'A volume-weighted RSI.' },
    ],
    'Volume': [
        { name: 'Volume', type: 'Volume', description: 'Displays the trading volume for each bar.' },
        { name: 'On-Balance Volume', type: 'OBV', description: 'Relates volume to price change.' },
    ]
};

const ALL_INDICATORS_FLAT = Object.values(ALL_INDICATORS).flat();


export const IndicatorPanel: React.FC<IndicatorSearchModalProps> = ({ isOpen, onClose, onAdd, customScripts = [], onAddCustom, strategyVisibility = {}, onToggleStrategy }) => {
    const modalRef = useRef<HTMLDivElement>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [scriptType, setScriptType] = useState<'INDICATOR' | 'STRATEGY'>('INDICATOR');
    const [sourceFilter, setSourceFilter] = useState<'All' | 'Built-In' | 'My Scripts'>('All');

    useOutsideAlerter(modalRef, onClose);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const filteredIndicators = useMemo(() => {
        const lowerCaseSearch = searchTerm.toLowerCase();

        // Filter by script type first (Indicator = built-in, Strategy = custom)
        let items: any[] = [];

        if (scriptType === 'INDICATOR') {
            // 1. Built-in Indicators
            if (sourceFilter === 'All' || sourceFilter === 'Built-In') {
                items = [...items, ...ALL_INDICATORS_FLAT];
            }
            // 2. Custom Indicators
            if (sourceFilter === 'All' || sourceFilter === 'My Scripts') {
                const customInds = customScripts
                    .filter(s => s.type === 'INDICATOR')
                    .map(s => ({
                        name: s.name,
                        type: 'CUSTOM',
                        description: s.description || 'Custom Indicator',
                        data: s,
                        isIndicator: true
                    }));
                items = [...items, ...customInds];
            }
        } else {
            // Show strategies (custom scripts with type='STRATEGY')
            if (sourceFilter === 'All' || sourceFilter === 'My Scripts') {
                items = customScripts
                    .filter(s => s.type === 'STRATEGY')
                    .map(s => ({
                        name: s.name,
                        type: 'CUSTOM',
                        description: s.description || 'Custom Strategy',
                        data: s
                    }));
            }
        }

        // Apply search filter
        if (lowerCaseSearch) {
            return items.filter(ind =>
                ind.name.toLowerCase().includes(lowerCaseSearch) ||
                (ind.description && ind.description.toLowerCase().includes(lowerCaseSearch)) ||
                (ind.type && ind.type.toLowerCase().includes(lowerCaseSearch))
            );
        }

        return items;
    }, [searchTerm, scriptType, sourceFilter, customScripts]);



    if (!isOpen) return null;



    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div
                ref={modalRef}
                className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl w-[512px] h-[600px] flex flex-col"
                onPointerDown={e => e.stopPropagation()}
            >
                <div className="p-3 border-b border-gray-700/50">
                    <div className="flex justify-between items-center mb-3">
                        <h2 className="font-semibold text-white">Indicators</h2>
                        <button onClick={onClose} className="text-gray-400 hover:text-white"><CloseIcon className="w-5 h-5" /></button>
                    </div>
                    <div className="relative">
                        <SearchIcon className="w-4 h-4 absolute top-1/2 left-3 -translate-y-1/2 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Search indicators..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            autoFocus
                            className="w-full bg-gray-900 border border-gray-700 rounded-md pl-9 pr-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                    </div>
                </div>

                {/* Type Toggle & Source Filters */}
                <div className="border-b border-gray-700/50 flex-shrink-0">
                    {/* Type Toggle */}
                    <div className="flex items-center justify-center gap-1 p-2 bg-gray-900/50">
                        <button
                            onClick={() => setScriptType('INDICATOR')}
                            className={`flex-1 px-4 py-2 text-xs font-medium rounded transition-all ${scriptType === 'INDICATOR'
                                ? 'bg-blue-500 text-white shadow-lg'
                                : 'bg-transparent text-gray-400 hover:text-white hover:bg-gray-700/50'
                                }`}
                        >
                            Indicator
                        </button>
                        <button
                            onClick={() => setScriptType('STRATEGY')}
                            className={`flex-1 px-4 py-2 text-xs font-medium rounded transition-all ${scriptType === 'STRATEGY'
                                ? 'bg-blue-500 text-white shadow-lg'
                                : 'bg-transparent text-gray-400 hover:text-white hover:bg-gray-700/50'
                                }`}
                        >
                            Strategy
                        </button>
                    </div>

                    {/* Source Filters */}
                    <div className="grid grid-cols-3 border-t border-gray-700/50">
                        {(['All', 'Built-In', 'My Scripts'] as const).map(filter => (
                            <button
                                key={filter}
                                onClick={() => setSourceFilter(filter)}
                                className={`px-3 py-2 text-xs font-medium text-center border-b-2 transition-colors ${sourceFilter === filter
                                    ? 'border-blue-500 text-white bg-blue-500/10'
                                    : 'border-transparent text-gray-400 hover:text-white hover:bg-gray-700/30'
                                    }`}
                            >
                                {filter}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto scrollbar-hide">
                    {filteredIndicators.map((item: any) => (
                        <div
                            key={item.name + item.type}
                            onClick={() => {
                                if (item.type === 'CUSTOM') {
                                    // Custom Indicator or Strategy: Add to chart
                                    if (onAddCustom) {
                                        onAddCustom(item.data);
                                        onClose();
                                    }
                                } else {
                                    onAdd(item.type);
                                    onClose();
                                }
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm flex items-center hover:bg-gray-700/50 transition-colors border-b border-gray-700/50 last:border-b-0 cursor-pointer"
                        >
                            <div className="flex-1 min-w-0 text-left group">
                                <div className="flex items-center gap-2">
                                    <p className="font-semibold text-gray-200 group-hover:text-blue-400">{item.name}</p>
                                </div>
                                <p className="text-xs text-gray-400 truncate">{item.description}</p>
                            </div>
                            {/* No additional controls needed */}
                        </div>
                    ))}
                    {filteredIndicators.length === 0 && (
                        <div className="text-center py-16 px-6 text-gray-500">
                            <h3 className="text-lg font-semibold text-gray-400">No Indicators Found</h3>
                            <p className="mt-2 text-sm">Your search for "{searchTerm}" did not match any indicators.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export { IndicatorSettingsModal };
