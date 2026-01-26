import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Check } from 'lucide-react';


const PRESET_COLORS = [
    '#EF4444', '#F87171', '#FBBF24', '#34D399', '#10B981', '#3B82F6', '#60A5FA', '#8B5CF6',
    '#EC4899', '#F472B6', '#FFFFFF', '#9CA3AF', '#6B7280', '#374151', '#1F2937', '#111827',
    '#7F1D1D', '#991B1B', '#B45309', '#047857', '#065F46', '#1E40AF', '#1E3A8A', '#5B21B6',
    '#831843', '#9D174D', '#000000', '#4B5563', '#374151', '#1F2937', '#111827', '#000000'
];

interface ColorPickerProps {
    color: string;
    onChange: (color: string) => void;
}

// Helper types and functions 
type HSV = { h: number; s: number; v: number };
type RGB = { r: number; g: number; b: number };

const hexToRgb = (hex: string): RGB => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
};

const rgbToHsv = ({ r, g, b }: RGB): HSV => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s, v = max;
    const d = max - min;
    s = max === 0 ? 0 : d / max;
    if (max === min) {
        h = 0;
    } else {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: h * 360, s: s * 100, v: v * 100 };
};

const hsvToRgb = ({ h, s, v }: HSV): RGB => {
    let r = 0, g = 0, b = 0;
    const i = Math.floor(h / 60);
    const f = h / 60 - i;
    const p = v * (1 - s / 100);
    const q = v * (1 - f * s / 100);
    const t = v * (1 - (1 - f) * s / 100);
    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
    }
    return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
};

const rgbToHex = ({ r, g, b }: RGB): string => {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
};

export const ColorPicker: React.FC<ColorPickerProps> = ({ color, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [view, setView] = useState<'grid' | 'custom'>('grid');
    const wrapperRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const [hsv, setHsv] = useState<HSV>({ h: 0, s: 0, v: 100 });
    const [opacity, setOpacity] = useState(100);

    // Close on outside click is handled differently with Portal
    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (event: MouseEvent) => {
            const dropdown = document.getElementById('color-picker-portal-content');
            if (
                wrapperRef.current &&
                !wrapperRef.current.contains(event.target as Node) &&
                dropdown &&
                !dropdown.contains(event.target as Node)
            ) {
                setIsOpen(false);
                setView('grid');
            }
        };
        window.addEventListener('mousedown', handleClickOutside);
        return () => window.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    // Recalculate position when opening
    useEffect(() => {
        if (isOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            let top = rect.bottom + window.scrollY + 5;
            let left = rect.left + window.scrollX;

            if (left + 256 > window.innerWidth + window.scrollX) {
                left = rect.right - 256 + window.scrollX;
            }
            if (top + 300 > window.innerHeight + window.scrollY) {
                top = rect.top + window.scrollY - 300;
            }

            setPosition({ top, left });
        }
    }, [isOpen]);

    // Initialize HSV
    useEffect(() => {
        if (color.startsWith('#')) {
            const rgb = hexToRgb(color);
            setHsv(rgbToHsv(rgb));
        } else if (color.startsWith('rgba')) {
            const parts = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+(?:\.\d+)?))?\)/);
            if (parts) {
                const rgb = { r: parseInt(parts[1]), g: parseInt(parts[2]), b: parseInt(parts[3]) };
                setHsv(rgbToHsv(rgb));
                if (parts[4]) setOpacity(parseFloat(parts[4]) * 100);
            }
        }
    }, [color]);

    const handleColorChange = (newHsv: HSV) => {
        setHsv(newHsv);
        const rgb = hsvToRgb(newHsv);
        if (opacity < 100) {
            onChange(`rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity / 100})`);
        } else {
            onChange(rgbToHex(rgb));
        }
    };

    const CustomColorView = () => {
        const satRef = useRef<HTMLDivElement>(null);
        const hueRef = useRef<HTMLDivElement>(null);
        const draggingSat = useRef(false);
        const draggingHue = useRef(false);

        const handleSatMove = useCallback((e: MouseEvent | React.MouseEvent) => {
            if (!satRef.current) return;
            const rect = satRef.current.getBoundingClientRect();
            const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
            handleColorChange({ ...hsv, s: x * 100, v: (1 - y) * 100 });
        }, [hsv]);

        const handleHueMove = useCallback((e: MouseEvent | React.MouseEvent) => {
            if (!hueRef.current) return;
            const rect = hueRef.current.getBoundingClientRect();
            const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
            handleColorChange({ ...hsv, h: y * 360 });
        }, [hsv]);

        useEffect(() => {
            const handleUp = () => { draggingSat.current = false; draggingHue.current = false; };
            const handleMove = (e: MouseEvent) => {
                if (draggingSat.current) handleSatMove(e);
                if (draggingHue.current) handleHueMove(e);
            };
            window.addEventListener('mouseup', handleUp);
            window.addEventListener('mousemove', handleMove);
            return () => {
                window.removeEventListener('mouseup', handleUp);
                window.removeEventListener('mousemove', handleMove);
            };
        }, [handleSatMove, handleHueMove]);

        const currentColor = `hsl(${hsv.h}, 100%, 50%)`;
        const rgb = hsvToRgb(hsv);
        const hex = rgbToHex(rgb);

        return (
            <div className="p-3 w-64 bg-[#1E222D] rounded-lg border border-[#2A2E39] shadow-xl">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded border border-[#2A2E39]" style={{ backgroundColor: hex }} />
                        <span className="bg-[#2A2E39] px-2 py-0.5 rounded textxs text-[#D1D4DC] font-mono text-xs">{hex}</span>
                    </div>
                    <button onClick={() => setView('grid')} className="px-3 py-1 bg-white text-black text-xs font-medium rounded hover:bg-gray-200 transition-colors">
                        Add
                    </button>
                </div>

                <div className="flex gap-3 h-40 mb-4">
                    <div
                        ref={satRef}
                        className="flex-1 relative rounded overflow-hidden cursor-crosshair"
                        style={{ backgroundColor: currentColor, backgroundImage: 'linear-gradient(to right, #fff, transparent), linear-gradient(to top, #000, transparent)' }}
                        onMouseDown={e => { draggingSat.current = true; handleSatMove(e); }}
                    >
                        <div
                            className="absolute w-3 h-3 border-2 border-white rounded-full -ml-1.5 -mt-1.5 shadow-sm pointer-events-none"
                            style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%` }}
                        />
                    </div>
                    <div
                        ref={hueRef}
                        className="w-4 relative rounded overflow-hidden cursor-pointer"
                        style={{ background: 'linear-gradient(to bottom, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
                        onMouseDown={e => { draggingHue.current = true; handleHueMove(e); }}
                    >
                        <div
                            className="absolute left-0 right-0 h-1.5 bg-white border border-gray-400 rounded-sm -mt-[3px] pointer-events-none shadow-sm"
                            style={{ top: `${hsv.h / 360 * 100}%` }}
                        />
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div ref={wrapperRef} className="relative inline-block">
            <button
                ref={buttonRef}
                onClick={() => setIsOpen(!isOpen)}
                className="w-8 h-7 rounded border border-[#2A2E39] cursor-pointer shadow-sm relative overflow-hidden"
            >
                <div className="absolute inset-0 z-0 bg-gray-700" style={{
                    backgroundImage: 'linear-gradient(45deg, #374151 25%, transparent 25%), linear-gradient(-45deg, #374151 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #374151 75%), linear-gradient(-45deg, transparent 75%, #374151 75%)',
                    backgroundSize: '8px 8px',
                    backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px'
                }} />
                <div className="absolute inset-0 z-10" style={{ backgroundColor: color }} />
            </button>

            {isOpen && createPortal(
                <div
                    id="color-picker-portal-content"
                    className="fixed z-[9999]"
                    style={{ top: position.top, left: position.left }}
                >
                    {view === 'grid' ? (
                        <div className="bg-[#1E222D] border border-[#2A2E39] rounded-lg p-3 shadow-xl w-64">
                            <div className="grid grid-cols-8 gap-2 mb-3">
                                {PRESET_COLORS.map(preset => (
                                    <button
                                        key={preset}
                                        onClick={() => {
                                            const rgb = hexToRgb(preset);
                                            setHsv(rgbToHsv(rgb));
                                            setOpacity(100);
                                            onChange(preset);
                                        }}
                                        className={`w-6 h-6 rounded border transition-transform ${color.toLowerCase() === preset.toLowerCase() || (color.startsWith(preset) && opacity === 100)
                                            ? 'border-white scale-110'
                                            : 'border-transparent hover:border-[#4B5563] hover:scale-105'
                                            }`}
                                        style={{ backgroundColor: preset }}
                                    />
                                ))}
                            </div>

                            <div className="border-t border-[#2A2E39] pt-3 mt-2">
                                <button className="w-8 h-8 flex items-center justify-center rounded border border-[#2A2E39] hover:bg-[#2A2E39] transition-colors mb-3" onClick={() => setView('custom')}>
                                    <Plus className="text-[#D1D4DC]" size={16} />
                                </button>

                                <div className="space-y-1">
                                    <div className="flex justify-between text-xs text-[#B2B5BE] mb-1">
                                        <span>Opacity</span>
                                        <span>{Math.round(opacity)}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={opacity}
                                        onChange={e => {
                                            const newOp = parseFloat(e.target.value);
                                            setOpacity(newOp);
                                            const rgb = hsvToRgb(hsv);
                                            onChange(`rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${newOp / 100})`);
                                        }}
                                        className="w-full h-1 bg-[#434651] rounded-lg appearance-none cursor-pointer accent-[#2962FF]"
                                    />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <CustomColorView />
                    )}
                </div>,
                document.body
            )}
        </div>
    );
};
