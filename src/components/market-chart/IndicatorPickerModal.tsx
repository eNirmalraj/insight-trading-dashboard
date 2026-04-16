import React, { useState, useMemo } from 'react';
import { IndicatorType } from './types';
import { Strategy } from '../../types';
import { DEFAULT_INDICATORS, INDICATOR_CATEGORIES, type IndicatorCategory } from '../../indicators';

interface IndicatorPickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (type: IndicatorType) => void;
    customScripts?: Strategy[];
    onAddCustom?: (script: Strategy) => void;
}

const CATEGORY_LABELS: Record<IndicatorCategory, string> = {
    trend: 'Trend',
    volatility: 'Volatility',
    oscillator: 'Oscillators',
    volume: 'Volume',
};

const CATEGORY_ICONS: Record<IndicatorCategory, string> = {
    trend: '\u2197', // ↗
    volatility: '\u2195', // ↕
    oscillator: '\u223F', // ∿
    volume: '\u2581', // ▁
};

const IndicatorPickerModal: React.FC<IndicatorPickerModalProps> = ({
    isOpen,
    onClose,
    onAdd,
    customScripts,
    onAddCustom,
}) => {
    const [search, setSearch] = useState('');
    const [activeCategory, setActiveCategory] = useState<IndicatorCategory | 'custom' | 'all'>(
        'all'
    );

    const filteredIndicators = useMemo(() => {
        let indicators = DEFAULT_INDICATORS;
        if (activeCategory !== 'all' && activeCategory !== 'custom') {
            indicators = indicators.filter((ind) => ind.category === activeCategory);
        }
        if (search.trim()) {
            const q = search.toLowerCase();
            indicators = indicators.filter(
                (ind) =>
                    ind.name.toLowerCase().includes(q) || ind.shortname.toLowerCase().includes(q)
            );
        }
        return indicators;
    }, [activeCategory, search]);

    const filteredCustom = useMemo(() => {
        if (!customScripts) return [];
        if (!search.trim()) return customScripts;
        const q = search.toLowerCase();
        return customScripts.filter((s) => s.name.toLowerCase().includes(q));
    }, [customScripts, search]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-[#1a1a1a] border border-[#2A2A2A] rounded-lg w-[480px] max-h-[600px] flex flex-col shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#2A2A2A]">
                    <h2 className="text-sm font-semibold text-white">Indicators</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        title="Close"
                        className="text-gray-400 hover:text-white transition-colors"
                    >
                        <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>
                </div>

                {/* Search */}
                <div className="px-4 py-2 border-b border-[#2A2A2A]">
                    <input
                        type="text"
                        placeholder="Search indicators..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-[#0f0f0f] border border-[#333] rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:border-[#2962FF] focus:outline-none"
                        autoFocus
                    />
                </div>

                {/* Category tabs */}
                <div className="flex gap-1 px-4 py-2 border-b border-[#2A2A2A] overflow-x-auto">
                    <button
                        type="button"
                        onClick={() => setActiveCategory('all')}
                        className={`px-2.5 py-1 text-xs rounded whitespace-nowrap transition-colors ${
                            activeCategory === 'all'
                                ? 'bg-[#2962FF] text-white'
                                : 'text-gray-400 hover:text-white hover:bg-[#222]'
                        }`}
                    >
                        All
                    </button>
                    {INDICATOR_CATEGORIES.map((cat) => (
                        <button
                            type="button"
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`px-2.5 py-1 text-xs rounded whitespace-nowrap transition-colors ${
                                activeCategory === cat
                                    ? 'bg-[#2962FF] text-white'
                                    : 'text-gray-400 hover:text-white hover:bg-[#222]'
                            }`}
                        >
                            {CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]}
                        </button>
                    ))}
                    {customScripts && customScripts.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setActiveCategory('custom')}
                            className={`px-2.5 py-1 text-xs rounded whitespace-nowrap transition-colors ${
                                activeCategory === 'custom'
                                    ? 'bg-[#2962FF] text-white'
                                    : 'text-gray-400 hover:text-white hover:bg-[#222]'
                            }`}
                        >
                            Custom
                        </button>
                    )}
                </div>

                {/* Indicator list */}
                <div className="flex-1 overflow-y-auto p-2 min-h-0">
                    {activeCategory !== 'custom' && filteredIndicators.length > 0 && (
                        <div className="space-y-0.5">
                            {filteredIndicators.map((ind) => {
                                return (
                                    <button
                                        type="button"
                                        key={ind.id}
                                        onClick={() => {
                                            onAdd(ind.shortname as any);
                                            onClose();
                                        }}
                                        className="w-full flex items-center gap-3 px-3 py-2 rounded text-left hover:bg-[#222] transition-colors group"
                                    >
                                        <span className="text-xs text-gray-500 w-6 text-center">
                                            {CATEGORY_ICONS[ind.category]}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm text-white truncate">
                                                {ind.name}
                                            </div>
                                            <div className="text-xs text-gray-500">
                                                {ind.shortname}{' '}
                                                {ind.overlay ? '· Overlay' : '· Separate pane'}
                                            </div>
                                        </div>
                                        <span className="text-xs text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                            + Add
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Custom scripts */}
                    {(activeCategory === 'custom' || activeCategory === 'all') &&
                        filteredCustom.length > 0 && (
                            <div className="mt-2">
                                {activeCategory === 'all' && (
                                    <div className="px-3 py-1.5 text-xs text-gray-500 font-medium uppercase">
                                        Custom Scripts
                                    </div>
                                )}
                                {filteredCustom.map((script) => (
                                    <button
                                        type="button"
                                        key={script.id}
                                        onClick={() => {
                                            onAddCustom?.(script);
                                            onClose();
                                        }}
                                        className="w-full flex items-center gap-3 px-3 py-2 rounded text-left hover:bg-[#222] transition-colors group"
                                    >
                                        <span className="text-xs text-[#2962FF] w-6 text-center">
                                            K
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm text-white truncate">
                                                {script.name}
                                            </div>
                                            <div className="text-xs text-gray-500">Kuri Script</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}

                    {filteredIndicators.length === 0 && filteredCustom.length === 0 && (
                        <div className="text-center text-gray-500 text-sm py-8">
                            No indicators found
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default IndicatorPickerModal;
