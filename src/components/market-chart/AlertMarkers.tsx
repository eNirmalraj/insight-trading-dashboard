import React from 'react';
import { PriceAlert, Drawing } from './types';
import { Candle } from './types';
import { BellIcon, CheckIcon } from '../IconComponents';
import { calculateDrawingPriceAtTime } from './helpers';

interface AlertMarkersProps {
    alerts: PriceAlert[];
    drawings?: Drawing[];
    yScale: (price: number) => number;
    timeToX: (time: number) => number;
    data: Candle[];
    chartHeight: number;
    currentPrice?: number;
    activeDrawingOverride?: Drawing | null;
    onEditAlert?: (alert: PriceAlert) => void;
}

export const AlertMarkers: React.FC<AlertMarkersProps> = ({ alerts, drawings = [], yScale, timeToX, data, chartHeight, currentPrice, activeDrawingOverride, onEditAlert }) => {
    // If no data, we can't position alerts correctly on the X axis
    if (!data || data.length === 0) return null;

    const latestCandleTime = data[data.length - 1].time;

    return (
        <div className="absolute inset-0 pointer-events-none fade-in" style={{ zIndex: 20 }}>
            {alerts.map(alert => {
                let price = alert.value;
                let isDrawingAlert = false;
                let activeDrawing: Drawing | undefined;

                // Resolve price for Drawing Alerts
                if (alert.drawingId) {
                    // Check override first (instant response during drag)
                    if (activeDrawingOverride && activeDrawingOverride.id === alert.drawingId) {
                        const drawing = activeDrawingOverride;
                        // Use start time for price calculation
                        const timeBasis = (drawing as any).start?.time || latestCandleTime;
                        const calculatedPrice = calculateDrawingPriceAtTime(drawing, timeBasis);
                        if (calculatedPrice !== null) {
                            price = calculatedPrice;
                            isDrawingAlert = true;
                        }
                        activeDrawing = drawing; // Set active drawing for X positioning below
                    } else {
                        // Fallback to saved state
                        const drawing = drawings.find(d => d.id === alert.drawingId);
                        if (drawing) {
                            const timeBasis = (drawing as any).start?.time || latestCandleTime;
                            const calculatedPrice = calculateDrawingPriceAtTime(drawing, timeBasis);
                            if (calculatedPrice !== null) {
                                price = calculatedPrice;
                                isDrawingAlert = true;
                            }
                            activeDrawing = drawing;
                        }
                    }
                }

                // Check if price is defined (either static or calculated)
                if (price === undefined) return null;

                const y = yScale(price);

                // Determine X position
                // Calculate X based on the resolved active drawing (either override or normal)
                let x: number;

                // activeDrawing is already set derived from either override or drawings list
                if (activeDrawing && 'start' in activeDrawing && (activeDrawing as any).start?.time) {
                    // For drawings with a start point (Trend Line, Ray, etc.), position at the start
                    x = timeToX((activeDrawing as any).start.time);
                } else {
                    // Default fallback
                    x = timeToX(latestCandleTime) + 20;
                }

                // Check visibility bounds
                if (y < -20 || y > chartHeight + 20) return null; // Simple visibility check

                const isTriggered = alert.triggered;
                const colorClass = isTriggered ? 'text-red-500' : 'text-yellow-500'; // Active = Yellow, Triggered = Red

                return (
                    <div
                        key={alert.id}
                        className={`absolute flex items-center group pointer-events-auto cursor-pointer transition-transform duration-300 hover:scale-110`}
                        style={{
                            left: x,
                            top: y - 24, // Position ABOVE the line (icon height approx 24px)
                        }}
                        title={`Alert: ${alert.condition} ${price?.toFixed(2)}\nStatus: ${isTriggered ? 'Triggered' : 'Active'}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            onEditAlert?.(alert);
                        }}
                    >
                        {/* Line connecting to candle level */}
                        <div className={`w-3 h-0.5 mr-1 ${isTriggered ? 'bg-red-500' : 'bg-yellow-500'} opacity-50`}></div>

                        <div className={`p-1 rounded-full bg-gray-900 border border-gray-700 shadow-lg ${colorClass}`}>
                            {isTriggered ? <BellIcon className="w-4 h-4" /> : <BellIcon className="w-4 h-4" />}
                            {isTriggered && (
                                <div className="absolute -top-1 -right-1 bg-red-600 rounded-full p-0.5">
                                    <CheckIcon className="w-2 h-2 text-white" />
                                </div>
                            )}
                        </div>

                        {/* Tooltip on Hover */}
                        <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 border border-gray-700 rounded shadow-xl text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none">
                            <div className="font-semibold text-gray-200">
                                {isTriggered ? 'Alert Triggered' : 'Price Alert'}
                            </div>
                            <div className="text-gray-400">
                                {alert.condition} <span className="text-white">{price?.toFixed(4)}</span>
                                {isDrawingAlert && <span className="block text-gray-500 italic text-[10px]">linked to drawing</span>}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
