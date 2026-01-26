import React, { useState, useRef, useEffect } from 'react';
import { PencilIcon, SignalIcon, TrashIcon, SettingsIcon, CloneIcon } from '../IconComponents';
import { useOutsideAlerter } from './hooks';
import { parseRgba } from './helpers';
import { Drawing, DrawingStyle, LineStyle, Point, CalloutDrawing, LongPositionDrawing, ShortPositionDrawing, FibonacciRetracementDrawing } from './types';
import { ColorPicker } from './ColorPicker';
import { DrawingSettingsModal } from './DrawingSettingsModal';

const GripIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg width="6" height="16" viewBox="0 0 6 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <title>Drag Handle</title>
        <circle cx="3" cy="3" r="1.5" fill="currentColor" />
        <circle cx="3" cy="8" r="1.5" fill="currentColor" />
        <circle cx="3" cy="13" r="1.5" fill="currentColor" />
    </svg>
);

const StyleButton: React.FC<{
    onClick: () => void;
    isActive: boolean;
    children: React.ReactNode;
    title?: string;
}> = ({ onClick, isActive, children, title }) => (
    <button title={title} onClick={onClick} className={`p-1.5 rounded-md flex items-center justify-center transition-colors ${isActive ? 'bg-blue-500/30' : 'hover:bg-gray-700/50'}`}>
        {children}
    </button>
);

interface FloatingDrawingToolbarProps {
    drawing: Drawing;
    position: { x: number; y: number };
    setPosition: (newPosition: { x: number; y: number }) => void;
    onUpdateStyle: (newStyle: Drawing['style']) => void;
    onDelete: () => void;
    onAlert: () => void;
    onClone: (id: string) => void;
    onUpdateDrawing: (newDrawing: Drawing) => void;
    onDragEnd?: (position: { x: number; y: number }) => void;
}

function rgbToHex(r: number, g: number, b: number): string {
    const toHex = (c: number) => `0${c.toString(16)}`.slice(-2);
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}


const FloatingDrawingToolbar: React.FC<FloatingDrawingToolbarProps> = ({ drawing, position, setPosition, onUpdateStyle, onDelete, onAlert, onClone, onUpdateDrawing, onDragEnd }) => {
    const toolbarRef = useRef<HTMLDivElement>(null);
    const [isStylePopoverOpen, setIsStylePopoverOpen] = useState(false);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

    const stylePopoverRef = useRef<HTMLDivElement>(null);

    const [activeTab, setActiveTab] = useState<'line' | 'fill'>('line');

    useOutsideAlerter(stylePopoverRef, () => setIsStylePopoverOpen(false));

    const dragState = useRef({
        isDragging: false,
        startX: 0,
        startY: 0,
        initialPosition: { x: 0, y: 0 },
    });

    const handleDragPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        e.stopPropagation();
        const target = e.target as HTMLElement;
        if (target.closest('button')) return; // Don't drag if clicking a button inside

        toolbarRef.current?.setPointerCapture(e.pointerId);
        dragState.current = {
            isDragging: true,
            startX: e.clientX,
            startY: e.clientY,
            initialPosition: position,
        };
    };

    // Reusable clamp logic
    const getClampedPosition = (x: number, y: number) => {
        if (toolbarRef.current && toolbarRef.current.offsetParent) {
            const parent = toolbarRef.current.offsetParent as HTMLElement;
            const toolbarWidth = toolbarRef.current.offsetWidth;
            const toolbarHeight = toolbarRef.current.offsetHeight;
            const parentWidth = parent.clientWidth;
            const parentHeight = parent.clientHeight;

            // X is centered (transform: -50%)
            const minX = toolbarWidth / 2;
            const maxX = parentWidth - toolbarWidth / 2;
            const clampedX = Math.max(minX, Math.min(x, maxX));

            // Y is top-aligned
            const minY = 0;
            // Ensure visual margin from bottom
            const maxY = Math.max(0, parentHeight - toolbarHeight - 10);
            const clampedY = Math.max(minY, Math.min(y, maxY));
            return { x: clampedX, y: clampedY };
        }
        return { x, y };
    };

    // Auto-correct position if out of bounds (runs on mount/resize)
    useEffect(() => {
        // slight delay to ensure layout is computed
        const timer = requestAnimationFrame(() => {
            const clamped = getClampedPosition(position.x, position.y);
            // Only update if difference is significant
            if (Math.abs(clamped.x - position.x) > 1 || Math.abs(clamped.y - position.y) > 1) {
                setPosition(clamped);
                if (onDragEnd) onDragEnd(clamped); // Sync back to storage immediately
            }
        });
        return () => cancelAnimationFrame(timer);
    }, [position.x, position.y]);

    useEffect(() => {
        const handlePointerMove = (e: PointerEvent) => {
            if (!dragState.current.isDragging) return;
            const dx = e.clientX - dragState.current.startX;
            const dy = e.clientY - dragState.current.startY;

            const rawX = dragState.current.initialPosition.x + dx;
            const rawY = dragState.current.initialPosition.y + dy;

            const clamped = getClampedPosition(rawX, rawY);
            setPosition(clamped);
        };

        const handlePointerUp = (e: PointerEvent) => {
            if (dragState.current.isDragging) {
                dragState.current.isDragging = false;
                if (toolbarRef.current?.hasPointerCapture(e.pointerId)) {
                    toolbarRef.current.releasePointerCapture(e.pointerId);
                }
                const dx = e.clientX - dragState.current.startX;
                const dy = e.clientY - dragState.current.startY;

                const rawX = dragState.current.initialPosition.x + dx;
                const rawY = dragState.current.initialPosition.y + dy;

                const clamped = getClampedPosition(rawX, rawY);
                if (onDragEnd) onDragEnd(clamped);
            }
        };
        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, []);

    const { style } = drawing;
    const widths = [1, 2, 4];
    const lineStyles: LineStyle[] = ['solid', 'dashed', 'dotted'];
    const fillRgba = style.fillColor ? parseRgba(style.fillColor) : { r: 59, g: 130, b: 246, a: 0.2 };
    const fillHex = rgbToHex(fillRgba.r, fillRgba.g, fillRgba.b);

    const handleStyleChange = <K extends keyof DrawingStyle>(key: K, value: DrawingStyle[K]) => {
        onUpdateStyle({ ...style, [key]: value });
    };

    const handleFillOpacityChange = (opacity: number) => {
        const newFillColor = `rgba(${fillRgba.r}, ${fillRgba.g}, ${fillRgba.b}, ${opacity})`;
        handleStyleChange('fillColor', newFillColor);
    };

    const handleFillColorChange = (color: string) => {
        const { r, g, b } = parseRgba(color);
        const newFillColor = `rgba(${r}, ${g}, ${b}, ${fillRgba.a})`;
        handleStyleChange('fillColor', newFillColor);
    }

    const canHaveAlert = drawing.type !== 'Text Note';
    const canHaveFill = ['Rectangle', 'Parallel Channel', 'Gann Box'].includes(drawing.type);

    return (
        <>
            <div
                ref={toolbarRef}
                className="absolute z-40"
                style={{
                    left: position.x,
                    top: position.y,
                    transform: `translate(-50%, 0)`,
                }}
                onPointerDown={e => e.stopPropagation()}
            >
                <div className="relative bg-[#1E222D] border border-[#2A2E39] rounded-lg shadow-xl flex items-center p-1" >
                    <div className="flex items-center gap-1">
                        <div ref={stylePopoverRef} className="relative">
                            <StyleButton onClick={() => { setIsStylePopoverOpen(p => !p); }} isActive={isStylePopoverOpen} title="Quick Style">
                                <PencilIcon className="w-5 h-5 text-[#B2B5BE] hover:text-[#D1D4DC]" />
                            </StyleButton>
                            {isStylePopoverOpen && (
                                <div className="absolute top-full mt-2 bg-[#1E222D] border border-[#2A2E39] rounded-md p-2 shadow-lg z-10 min-w-[220px]">
                                    <div className="flex border-b border-gray-700 mb-2">
                                        <button onClick={() => setActiveTab('line')} className={`px-3 py-1 text-xs font-semibold ${activeTab === 'line' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400'}`}>Line</button>
                                        {canHaveFill && <button onClick={() => setActiveTab('fill')} className={`px-3 py-1 text-xs font-semibold ${activeTab === 'fill' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400'}`}>Fill</button>}
                                    </div>
                                    {activeTab === 'line' && (
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-gray-400">Color</span>
                                                <ColorPicker color={style.color} onChange={color => handleStyleChange('color', color)} />
                                            </div>
                                            <div className="flex justify-around items-center bg-gray-800/50 p-1 rounded-md">
                                                {widths.map(w => <button key={w} onClick={() => handleStyleChange('width', w)} className={`w-full p-2 rounded-md hover:bg-gray-700/50 flex items-center justify-center ${style.width === w ? 'bg-gray-700' : ''}`}><div style={{ height: w, backgroundColor: style.color }} className="w-full" /></button>)}
                                            </div>
                                            <div className="flex justify-around items-center bg-gray-800/50 p-1 rounded-md">
                                                {lineStyles.map(ls => <button key={ls} onClick={() => handleStyleChange('lineStyle', ls)} className={`w-full p-2 rounded-md hover:bg-gray-700/50 ${style.lineStyle === ls ? 'bg-gray-700' : ''}`}><svg className="w-full h-4" stroke={style.color} strokeWidth={2} strokeDasharray={ls === 'dashed' ? '4 4' : ls === 'dotted' ? '1 4' : undefined}><line x1="0" y1="50%" x2="100%" y2="50%" /></svg></button>)}
                                            </div>
                                        </div>
                                    )}
                                    {activeTab === 'fill' && canHaveFill && (
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-gray-400">Color</span>
                                                <ColorPicker color={fillHex} onChange={handleFillColorChange} />
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-400">Opacity</label>
                                                <input type="range" min="0" max="1" step="0.05" value={fillRgba.a} onChange={e => handleFillOpacityChange(parseFloat(e.target.value))} className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer range-sm accent-blue-500 mt-1" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="w-px h-6 bg-gray-700/80 mx-1"></div>

                    <div className="flex items-center gap-0.5">
                        <StyleButton onClick={() => onClone(drawing.id)} isActive={false} title="Clone"><CloneIcon className="w-5 h-5 text-gray-300" /></StyleButton>
                        <StyleButton onClick={() => { setIsSettingsModalOpen(true); setIsStylePopoverOpen(false); }} isActive={isSettingsModalOpen} title="Settings"><SettingsIcon className="w-5 h-5 text-gray-300" /></StyleButton>
                        {canHaveAlert && <StyleButton onClick={onAlert} isActive={false} title="Create Alert"><SignalIcon className="w-5 h-5 text-gray-300" /></StyleButton>}
                        <StyleButton onClick={onDelete} isActive={false} title="Delete"><TrashIcon className="w-5 h-5 text-red-400" /></StyleButton>
                    </div>
                    <div className="w-px h-6 bg-gray-700/80 mx-1"></div>
                    <div className="p-1.5 cursor-move text-gray-500" onPointerDown={handleDragPointerDown}>
                        <GripIcon />
                    </div>
                </div>
            </div>
            {/* Render Modal outside of toolbar div to avoid position locking/z-index issues if any (but portal or fixed is best) */}
            <DrawingSettingsModal drawing={drawing} isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} onUpdate={onUpdateDrawing} />
        </>
    );
};

export default FloatingDrawingToolbar;




