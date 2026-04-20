import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { ColorPicker } from './ColorPicker';
import { CoordinateInput } from './CoordinateInput';
import { useOutsideAlerter } from './hooks';
import {
    Drawing,
    DrawingStyle,
    Point,
    GannSettings,
    GannLevel,
    FibSettings,
    FibLevel,
    FibExtendMode,
} from './types';

interface DrawingSettingsModalProps {
    isOpen: boolean;
    drawing: Drawing | null;
    onClose: () => void;
    onUpdate: (updatedDrawing: Drawing) => void;
}

const Separator = () => <div className="h-px bg-[#2A2E39] my-4" />;

const GANN_LEVELS = [0, 0.25, 0.382, 0.5, 0.618, 0.75, 1];
const GANN_LEVEL_COLORS = [
    '#2962FF',
    '#2962FF',
    '#2962FF',
    '#2962FF',
    '#2962FF',
    '#2962FF',
    '#2962FF',
];

const DefaultGannSettings: GannSettings = {
    priceLevels: GANN_LEVELS.map((l, i) => ({
        level: l,
        color: GANN_LEVEL_COLORS[i] || '#787B86',
        visible: true,
    })),
    timeLevels: GANN_LEVELS.map((l, i) => ({
        level: l,
        color: GANN_LEVEL_COLORS[i] || '#787B86',
        visible: true,
    })),
    useLeftLabels: true,
    useRightLabels: true,
    useTopLabels: true,
    useBottomLabels: true,
    showBackground: true,
    backgroundTransparency: 0.95,
};

export const DefaultFibSettings: FibSettings = {
    trendLine: { visible: true, color: '#A78BFA', width: 1, style: 'dashed' },
    levels: [
        { level: -0.618, color: '#F0ABFC', visible: false },
        { level: -0.272, color: '#F0ABFC', visible: false },
        { level: 0,      color: '#6366F1', visible: true  },
        { level: 0.236,  color: '#A78BFA', visible: true  },
        { level: 0.382,  color: '#8B5CF6', visible: true  },
        { level: 0.5,    color: '#8B5CF6', visible: true  },
        { level: 0.618,  color: '#C4B5F0', visible: true  },
        { level: 0.705,  color: '#8B5CF6', visible: true  },
        { level: 0.786,  color: '#A78BFA', visible: true  },
        { level: 1,      color: '#6366F1', visible: true  },
        { level: 1.272,  color: '#D8B4FE', visible: true  },
        { level: 1.618,  color: '#D8B4FE', visible: true  },
        { level: 2.618,  color: '#D8B4FE', visible: true  },
    ],
    extendLines: 'right',
    showBackground: true,
    backgroundTransparency: 0.92,
    useLogScale: false,
    snapToSwing: false,
    reverse: false,
};

/**
 * Normalise persisted FibSettings shapes. Handles migration from older schemas
 * where `extendLines` was a boolean and `snapToSwing` / `reverse` didn't exist.
 */
export function normaliseFibSettings(raw: any): FibSettings {
    if (!raw) return DefaultFibSettings;
    const extendLines: FibExtendMode =
        raw.extendLines === true ? 'both'
        : raw.extendLines === false ? 'none'
        : raw.extendLines === 'both' || raw.extendLines === 'right' || raw.extendLines === 'none'
            ? raw.extendLines
            : DefaultFibSettings.extendLines;
    return {
        trendLine: raw.trendLine ?? DefaultFibSettings.trendLine,
        levels: Array.isArray(raw.levels) && raw.levels.length > 0
            ? raw.levels
            : DefaultFibSettings.levels,
        extendLines,
        showBackground: raw.showBackground ?? DefaultFibSettings.showBackground,
        backgroundTransparency: raw.backgroundTransparency ?? DefaultFibSettings.backgroundTransparency,
        useLogScale: raw.useLogScale ?? false,
        snapToSwing: raw.snapToSwing ?? false,
        reverse: raw.reverse ?? false,
    };
}

export const DrawingSettingsModal: React.FC<DrawingSettingsModalProps> = ({
    isOpen,
    drawing,
    onClose,
    onUpdate,
}) => {
    const [localDrawing, setLocalDrawing] = useState<Drawing | null>(null);
    const initialDrawing = useRef<Drawing | null>(null);
    const [activeTab, setActiveTab] = useState<'style' | 'coordinates' | 'visibility'>('style');
    const modalRef = useRef<HTMLDivElement>(null);

    useOutsideAlerter(modalRef, onClose);

    useEffect(() => {
        if (isOpen && drawing) {
            // Only initialize if we're opening fresh or switching to a different drawing
            if (!localDrawing || localDrawing.id !== drawing.id) {
                const deepCopy = JSON.parse(JSON.stringify(drawing));
                setLocalDrawing(deepCopy);
                initialDrawing.current = deepCopy;
                setActiveTab('style');
            }
        } else {
            setLocalDrawing(null);
            initialDrawing.current = null;
        }
    }, [isOpen, drawing]);

    // Live update helper
    const applyUpdate = (updated: Drawing) => {
        setLocalDrawing(updated);
        onUpdate(updated);
    };

    const handleCancel = () => {
        if (initialDrawing.current) {
            onUpdate(initialDrawing.current);
        }
        onClose();
    };

    const handleSave = () => {
        onClose(); // Changes are already applied
    };

    if (!isOpen || !localDrawing) return null;

    const updateStyle = (updates: Partial<DrawingStyle>) => {
        if (!localDrawing) return;
        const updated = { ...localDrawing, style: { ...localDrawing.style, ...updates } };
        applyUpdate(updated);
    };

    const updateGannSettings = (update: Partial<GannSettings>) => {
        const currentSettings = localDrawing.style.gannSettings || DefaultGannSettings;
        updateStyle({ gannSettings: { ...currentSettings, ...update } });
    };

    const updateLevel = (type: 'price' | 'time', index: number, updates: Partial<GannLevel>) => {
        const currentSettings = localDrawing.style.gannSettings || DefaultGannSettings;
        const levels =
            type === 'price' ? [...currentSettings.priceLevels] : [...currentSettings.timeLevels];
        levels[index] = { ...levels[index], ...updates };
        updateGannSettings(type === 'price' ? { priceLevels: levels } : { timeLevels: levels });
    };

    const toggleLevel = (type: 'price' | 'time', index: number) => {
        const currentSettings = localDrawing.style.gannSettings || DefaultGannSettings;
        const levels = type === 'price' ? currentSettings.priceLevels : currentSettings.timeLevels;
        updateLevel(type, index, { visible: !levels[index].visible });
    };

    const updateLevelColor = (type: 'price' | 'time', index: number, color: string) => {
        updateLevel(type, index, { color });
    };

    const updateLevelValue = (type: 'price' | 'time', index: number, level: number) => {
        updateLevel(type, index, { level });
    };

    const updateFibSettings = (update: Partial<FibSettings>) => {
        const currentSettings = localDrawing.style.fibSettings || DefaultFibSettings;
        updateStyle({ fibSettings: { ...currentSettings, ...update } });
    };

    const updateFibLevel = (index: number, updates: Partial<FibLevel>) => {
        const currentSettings = localDrawing.style.fibSettings || DefaultFibSettings;
        const levels = [...currentSettings.levels];
        levels[index] = { ...levels[index], ...updates };
        updateFibSettings({ levels });
    };

    const toggleFibLevel = (index: number) => {
        const currentSettings = localDrawing.style.fibSettings || DefaultFibSettings;
        updateFibLevel(index, { visible: !currentSettings.levels[index].visible });
    };

    const updateFibLevelColor = (index: number, color: string) => {
        updateFibLevel(index, { color });
    };

    const updateFibLevelValue = (index: number, level: number) => {
        updateFibLevel(index, { level });
    };

    const renderHeader = () => (
        <div className="flex items-center justify-between px-5 h-[50px] select-none">
            <h2 className="text-[16px] font-medium text-[#D1D4DC]">{localDrawing.type}</h2>
            <button
                onClick={onClose}
                title="Close"
                className="text-[#B2B5BE] hover:text-[#D1D4DC] transition-colors p-1.5 hover:bg-[#2A2E39] rounded-md"
            >
                <X size={20} />
            </button>
        </div>
    );

    const renderTabs = () => (
        <div className="flex px-5 space-x-6 h-[46px] border-b border-[#2A2E39] mb-4 select-none relative">
            {(['style', 'coordinates', 'visibility'] as const).map((tab) => (
                <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`h-full text-[14px] font-medium capitalize border-b-[2px] -mb-[1px] transition-colors relative z-10 ${
                        activeTab === tab
                            ? 'text-[#2962FF] border-[#2962FF]'
                            : 'text-[#B2B5BE] border-transparent hover:text-[#D1D4DC]'
                    }`}
                >
                    {tab}
                </button>
            ))}
        </div>
    );

    const renderGannSettings = () => {
        const settings = localDrawing.style.gannSettings || DefaultGannSettings;
        const renderRow = (l: GannLevel, i: number, type: 'price' | 'time') => (
            <div key={i} className="flex items-center h-9 gap-3">
                <input
                    type="checkbox"
                    title="Toggle Visibility"
                    checked={l.visible}
                    onChange={() => toggleLevel(type, i)}
                    className="accent-[#2962FF] w-4 h-4 rounded-sm"
                />
                <ColorPicker color={l.color} onChange={(c) => updateLevelColor(type, i, c)} />
                <input
                    type="number"
                    title="Level Value"
                    step="0.001"
                    value={l.level}
                    onChange={(e) => updateLevelValue(type, i, parseFloat(e.target.value))}
                    className="flex-1 bg-[#131722] text-[13px] text-[#D1D4DC] border border-[#2A2E39] rounded px-2 py-1 text-right focus:border-[#2962FF] outline-none transition-colors h-[28px]"
                />
            </div>
        );

        return (
            <div className="px-5 pb-5 space-y-4">
                <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-1">
                        <div className="mb-3 text-[11px] font-bold text-[#787B86] uppercase tracking-wider">
                            Price Levels
                        </div>
                        {settings.priceLevels.map((l, i) => renderRow(l, i, 'price'))}
                    </div>
                    <div className="space-y-1">
                        <div className="mb-3 text-[11px] font-bold text-[#787B86] uppercase tracking-wider">
                            Time Levels
                        </div>
                        {settings.timeLevels.map((l, i) => renderRow(l, i, 'time'))}
                    </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between h-9">
                    <span className="text-[14px] text-[#B2B5BE]">Background</span>
                    <div className="flex items-center gap-3">
                        <input
                            type="range"
                            title="Background Transparency"
                            min="0"
                            max="1"
                            step="0.05"
                            value={settings.backgroundTransparency}
                            onChange={(e) =>
                                updateGannSettings({
                                    backgroundTransparency: parseFloat(e.target.value),
                                })
                            }
                            className="w-24 h-1 bg-[#434651] appearance-none rounded-lg accent-[#2962FF] cursor-pointer"
                        />
                        <input
                            type="checkbox"
                            title="Show Background"
                            checked={settings.showBackground}
                            onChange={(e) =>
                                updateGannSettings({ showBackground: e.target.checked })
                            }
                            className="accent-[#2962FF] w-4 h-4 rounded-sm"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                    <label className="flex items-center justify-between text-[14px] text-[#B2B5BE] cursor-pointer h-9">
                        Left Labels
                        <input
                            type="checkbox"
                            checked={settings.useLeftLabels}
                            onChange={(e) =>
                                updateGannSettings({ useLeftLabels: e.target.checked })
                            }
                            className="accent-[#2962FF] w-4 h-4 rounded-sm"
                        />
                    </label>
                    <label className="flex items-center justify-between text-[14px] text-[#B2B5BE] cursor-pointer h-9">
                        Right Labels
                        <input
                            type="checkbox"
                            checked={settings.useRightLabels}
                            onChange={(e) =>
                                updateGannSettings({ useRightLabels: e.target.checked })
                            }
                            className="accent-[#2962FF] w-4 h-4 rounded-sm"
                        />
                    </label>
                    <label className="flex items-center justify-between text-[14px] text-[#B2B5BE] cursor-pointer h-9">
                        Top Labels
                        <input
                            type="checkbox"
                            checked={settings.useTopLabels}
                            onChange={(e) => updateGannSettings({ useTopLabels: e.target.checked })}
                            className="accent-[#2962FF] w-4 h-4 rounded-sm"
                        />
                    </label>
                    <label className="flex items-center justify-between text-[14px] text-[#B2B5BE] cursor-pointer h-9">
                        Bottom Labels
                        <input
                            type="checkbox"
                            checked={settings.useBottomLabels}
                            onChange={(e) =>
                                updateGannSettings({ useBottomLabels: e.target.checked })
                            }
                            className="accent-[#2962FF] w-4 h-4 rounded-sm"
                        />
                    </label>
                </div>
            </div>
        );
    };

    const renderFibSettings = () => {
        const settings = localDrawing.style.fibSettings || DefaultFibSettings;
        return (
            <div className="space-y-4">
                {/* Trend line */}
                <fieldset className="rounded border border-neutral-700 p-3">
                    <legend className="px-1 text-xs font-medium text-neutral-400">Trend line</legend>
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={settings.trendLine.visible}
                            onChange={(e) =>
                                updateFibSettings({
                                    trendLine: { ...settings.trendLine, visible: e.target.checked },
                                })
                            }
                        />
                        Show trend line
                    </label>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                        <label className="text-xs">
                            Color
                            <input
                                type="color"
                                value={settings.trendLine.color}
                                onChange={(e) =>
                                    updateFibSettings({
                                        trendLine: { ...settings.trendLine, color: e.target.value },
                                    })
                                }
                                className="mt-1 block h-8 w-full"
                            />
                        </label>
                        <label className="text-xs">
                            Width
                            <select
                                value={settings.trendLine.width}
                                onChange={(e) =>
                                    updateFibSettings({
                                        trendLine: { ...settings.trendLine, width: Number(e.target.value) },
                                    })
                                }
                                className="mt-1 block h-8 w-full rounded bg-neutral-800 px-1"
                            >
                                <option value={1}>1</option>
                                <option value={2}>2</option>
                                <option value={3}>3</option>
                            </select>
                        </label>
                        <label className="text-xs">
                            Style
                            <select
                                value={settings.trendLine.style}
                                onChange={(e) =>
                                    updateFibSettings({
                                        trendLine: { ...settings.trendLine, style: e.target.value as FibSettings['trendLine']['style'] },
                                    })
                                }
                                className="mt-1 block h-8 w-full rounded bg-neutral-800 px-1"
                            >
                                <option value="solid">Solid</option>
                                <option value="dashed">Dashed</option>
                                <option value="dotted">Dotted</option>
                            </select>
                        </label>
                    </div>
                </fieldset>

                {/* Behaviour */}
                <fieldset className="rounded border border-neutral-700 p-3">
                    <legend className="px-1 text-xs font-medium text-neutral-400">Behaviour</legend>
                    <label className="mb-2 flex items-center justify-between text-sm">
                        <span>Extend lines</span>
                        <select
                            value={settings.extendLines}
                            onChange={(e) => updateFibSettings({ extendLines: e.target.value as FibExtendMode })}
                            className="h-8 rounded bg-neutral-800 px-2"
                        >
                            <option value="none">None</option>
                            <option value="right">Right only</option>
                            <option value="both">Both</option>
                        </select>
                    </label>
                    <label className="mb-2 flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={settings.useLogScale}
                            onChange={(e) => updateFibSettings({ useLogScale: e.target.checked })}
                        />
                        Log scale
                    </label>
                    <label className="mb-2 flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={settings.snapToSwing}
                            onChange={(e) => updateFibSettings({ snapToSwing: e.target.checked })}
                        />
                        Snap to swing on draw
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={settings.reverse}
                            onChange={(e) => updateFibSettings({ reverse: e.target.checked })}
                        />
                        Reverse labels
                    </label>
                </fieldset>

                {/* Background */}
                <fieldset className="rounded border border-neutral-700 p-3">
                    <legend className="px-1 text-xs font-medium text-neutral-400">Background</legend>
                    <label className="mb-2 flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={settings.showBackground}
                            onChange={(e) => updateFibSettings({ showBackground: e.target.checked })}
                        />
                        Show fills
                    </label>
                    <label className="block text-xs">
                        Transparency
                        <input
                            type="range"
                            min={0} max={1} step={0.01}
                            value={settings.backgroundTransparency}
                            onChange={(e) => updateFibSettings({ backgroundTransparency: Number(e.target.value) })}
                            className="mt-1 block w-full"
                        />
                    </label>
                </fieldset>

                {/* Levels */}
                <fieldset className="rounded border border-neutral-700 p-3">
                    <legend className="px-1 text-xs font-medium text-neutral-400">Levels</legend>
                    <div className="space-y-1">
                        {settings.levels.map((lv, idx) => (
                            <div key={lv.level} className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    title={`Toggle visibility for level ${lv.level.toFixed(3)}`}
                                    checked={lv.visible}
                                    onChange={(e) => {
                                        const next = [...settings.levels];
                                        next[idx] = { ...lv, visible: e.target.checked };
                                        updateFibSettings({ levels: next });
                                    }}
                                />
                                <span className="w-16 font-mono text-xs">{lv.level.toFixed(3)}</span>
                                <input
                                    type="color"
                                    title={`Color for level ${lv.level.toFixed(3)}`}
                                    value={lv.color}
                                    onChange={(e) => {
                                        const next = [...settings.levels];
                                        next[idx] = { ...lv, color: e.target.value };
                                        updateFibSettings({ levels: next });
                                    }}
                                    className="h-6 w-10"
                                />
                            </div>
                        ))}
                    </div>
                </fieldset>
            </div>
        );
    };

    const renderTextSettings = () => {
        return (
            <div className="px-5 pb-5 space-y-4">
                <div className="flex items-center justify-between h-9">
                    <span className="text-[14px] text-[#B2B5BE]">Text Color</span>
                    <ColorPicker
                        color={localDrawing.style.color}
                        onChange={(c) => updateStyle({ color: c })}
                    />
                </div>
                <div className="flex items-center justify-between h-9">
                    <span className="text-[14px] text-[#B2B5BE]">Font Size</span>
                    <input
                        type="number"
                        title="Font Size"
                        value={localDrawing.style.fontSize || 14}
                        onChange={(e) => updateStyle({ fontSize: parseInt(e.target.value) })}
                        className="w-16 bg-[#131722] text-[#D1D4DC] text-xs px-2 py-1 rounded border border-[#2A2E39]"
                    />
                </div>
            </div>
        );
    };

    const renderGeneralSettings = () => (
        <div className="px-5 pb-5 space-y-4">
            <div className="flex items-center justify-between h-9">
                <span className="text-[14px] text-[#B2B5BE]">Line Color</span>
                <ColorPicker
                    color={localDrawing.style.color}
                    onChange={(c) => updateStyle({ color: c })}
                />
            </div>
            <div className="flex items-center justify-between h-9">
                <span className="text-[14px] text-[#B2B5BE]">Line Width</span>
                <div className="flex gap-1">
                    {[1, 2, 3, 4].map((w) => (
                        <button
                            key={w}
                            title={`Line Width ${w}px`}
                            onClick={() => updateStyle({ width: w })}
                            className={`w-7 h-5 flex items-center justify-center rounded-[2px] ${localDrawing.style.width === w ? 'bg-[#2A2E39]' : 'hover:bg-[#2A2E39]'}`}
                        >
                            <div
                                className={`w-4 rounded-full ${
                                    localDrawing.style.width === w ? 'bg-[#D1D4DC]' : 'bg-[#787B86]'
                                } ${
                                    w === 1
                                        ? 'h-[1px]'
                                        : w === 2
                                          ? 'h-[2px]'
                                          : w === 3
                                            ? 'h-[3px]'
                                            : 'h-[4px]'
                                }`}
                            />
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );

    const renderStyleTab = () => {
        const type = localDrawing.type;
        if (type === 'Gann Box') return renderGannSettings();
        if (type === 'Fibonacci Retracement') return renderFibSettings();
        if (['Text Note', 'Callout'].includes(type as string)) return renderTextSettings();
        return renderGeneralSettings();
    };

    const renderCoordinatesTab = () => {
        // Safe check for drawings with start/end points
        if ('start' in localDrawing && 'end' in localDrawing) {
            const d = localDrawing as Drawing & { start: Point; end: Point };
            return (
                <div className="px-5 pb-5 space-y-4">
                    <CoordinateInput
                        label="#1"
                        price={d.start.price}
                        time={d.start.time}
                        onUpdate={(p) => applyUpdate({ ...localDrawing, start: p } as Drawing)}
                    />
                    <CoordinateInput
                        label="#2"
                        price={d.end.price}
                        time={d.end.time}
                        onUpdate={(p) => applyUpdate({ ...localDrawing, end: p } as Drawing)}
                    />
                </div>
            );
        }

        // Handle single point drawings (Text) - 'point' property
        if ('point' in localDrawing) {
            const d = localDrawing as Drawing & { point: Point };
            return (
                <div className="px-5 pb-5 space-y-4">
                    <CoordinateInput
                        label="Point"
                        price={d.point.price}
                        time={d.point.time}
                        onUpdate={(p) => applyUpdate({ ...localDrawing, point: p } as Drawing)}
                    />
                </div>
            );
        }

        // Handle Anchor/Label (Callout)
        if ('anchor' in localDrawing && 'label' in localDrawing) {
            const d = localDrawing as Drawing & { anchor: Point; label: Point };
            return (
                <div className="px-5 pb-5 space-y-4">
                    <CoordinateInput
                        label="Anchor"
                        price={d.anchor.price}
                        time={d.anchor.time}
                        onUpdate={(p) => applyUpdate({ ...localDrawing, anchor: p } as Drawing)}
                    />
                    <CoordinateInput
                        label="Label"
                        price={d.label.price}
                        time={d.label.time}
                        onUpdate={(p) => applyUpdate({ ...localDrawing, label: p } as Drawing)}
                    />
                </div>
            );
        }

        return (
            <div className="p-5 text-[#787B86] text-center text-sm">
                Coordinates settings not available for {localDrawing.type}.
            </div>
        );
    };

    const modalContent = (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-[1px]"
            onWheel={(e) => e.stopPropagation()}
        >
            <div
                ref={modalRef}
                className="bg-[#1E222D] rounded-lg shadow-2xl w-[380px] max-h-[85vh] flex flex-col overflow-hidden border border-[#2A2E39]"
            >
                {renderHeader()}
                {renderTabs()}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {activeTab === 'style' && renderStyleTab()}
                    {activeTab === 'coordinates' && renderCoordinatesTab()}
                    {activeTab === 'visibility' && (
                        <div className="p-5 text-[#787B86] text-center text-sm">
                            Visibility settings coming soon
                        </div>
                    )}
                </div>
                <div className="p-5 flex justify-end gap-3 border-t border-[#2A2E39]">
                    <button
                        onClick={handleCancel}
                        className="px-5 py-2 text-[14px] font-medium text-[#D1D4DC] hover:bg-[#2A2E39] rounded transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-5 py-2 text-[14px] font-medium bg-[#2962FF] text-white rounded hover:bg-[#1E54E8] transition-colors"
                    >
                        OK
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};
