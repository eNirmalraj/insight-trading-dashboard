import React, { useRef, useEffect } from 'react';
import { ChartEngine } from './Core/ChartEngine';
import { Candle, ChartSettings, ViewState, PriceRange, Drawing } from './types';

interface ChartWidgetProps {
    data: Candle[];
    drawings?: Drawing[];
    activeTool?: string | null;
    settings?: ChartSettings['symbol'];
    width: number;
    height: number;
    onViewChange?: (view: ViewState) => void;
    onPriceRangeChange?: (range: PriceRange) => void;
    onDrawingComplete?: (drawing: Drawing) => void;
    onDrawingContextMenu?: (e: MouseEvent, drawing: Drawing) => void;
}

export const ChartWidget: React.FC<ChartWidgetProps> = ({
    data,
    drawings = [],
    activeTool = null,
    settings,
    width,
    height,
    onViewChange,
    onPriceRangeChange,
    onDrawingComplete,
    onDrawingContextMenu
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<ChartEngine | null>(null);

    // Initialize engine
    useEffect(() => {
        if (!canvasRef.current) return;

        // Cleanup previous instance if any (though useEffect [] runs once)
        if (engineRef.current) {
            engineRef.current.destroy();
        }

        engineRef.current = new ChartEngine(canvasRef.current, {
            onViewChange: (view) => {
                if (onViewChange) onViewChange(view);
            },
            onPriceRangeChange: (range) => {
                if (onPriceRangeChange) onPriceRangeChange(range);
            },
            onDrawingComplete: (drawing) => {
                if (onDrawingComplete) onDrawingComplete(drawing);
            },
            onDrawingContextMenu: (e, drawing) => {
                if (onDrawingContextMenu) onDrawingContextMenu(e, drawing);
            }
        });

        // Initial render setup
        engineRef.current.resize(width, height);
        if (data.length > 0) engineRef.current.setData(data);

        return () => {
            if (engineRef.current) {
                engineRef.current.destroy();
                engineRef.current = null;
            }
        };
    }, []); // Empty dependency array means this runs once on mount. 
    // What if callbacks change? They are closures.
    // If callbacks change, we might need to update them in engine.
    // For now assuming stable callbacks or using ref for callbacks inside engine.

    // Handle Resize
    useEffect(() => {
        if (engineRef.current) {
            engineRef.current.resize(width, height);
        }
    }, [width, height]);

    // Handle Data Updates
    useEffect(() => {
        if (engineRef.current) {
            engineRef.current.setData(data);
        }
    }, [data]);

    // Handle Settings Updates
    useEffect(() => {
        if (engineRef.current && settings) {
            engineRef.current.setSettings(settings);
        }
    }, [settings]);

    // Handle Drawings Updates
    useEffect(() => {
        if (engineRef.current) {
            engineRef.current.setDrawings(drawings);
        }
    }, [drawings]);

    // Handle Active Tool Updates
    useEffect(() => {
        if (engineRef.current) {
            engineRef.current.setActiveTool(activeTool);
        }
    }, [activeTool]);

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            style={{ display: 'block', touchAction: 'none' }} // touchAction none for internal handling
        />
    );
};
