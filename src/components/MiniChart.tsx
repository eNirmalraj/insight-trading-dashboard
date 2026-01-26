import React, { useRef, useEffect, useMemo } from 'react';
import { Candle } from './market-chart/types';

interface MiniChartProps {
    data: Candle[];
    entry: number;
    stopLoss: number;
    takeProfit: number;
    indicatorData?: { type: string; data: any };
}

const MiniChart: React.FC<MiniChartProps> = ({ data, entry, stopLoss, takeProfit, indicatorData }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const mainChartContainerRef = useRef<HTMLDivElement>(null);
    const rsiContainerRef = useRef<HTMLDivElement>(null);
    
    const chartCanvasRef = useRef<HTMLCanvasElement>(null);
    const yAxisCanvasRef = useRef<HTMLCanvasElement>(null);
    const rsiCanvasRef = useRef<HTMLCanvasElement>(null);
    const rsiYAxisCanvasRef = useRef<HTMLCanvasElement>(null);
    
    const hasRsi = indicatorData?.type === 'RSI';

    const priceRange = useMemo(() => {
        if (!data || data.length === 0) return { min: 0, max: 1 };
        let relevantPrices = [entry, stopLoss, takeProfit];
        if (indicatorData?.type === 'MOMENTUM_BREAKOUT' && indicatorData.data.levels) {
            relevantPrices = [...relevantPrices, ...indicatorData.data.levels];
        }
        const lows = data.map(d => d.low);
        const highs = data.map(d => d.high);
        const dataMin = Math.min(...lows, ...relevantPrices);
        const dataMax = Math.max(...highs, ...relevantPrices);
        const buffer = (dataMax - dataMin) * 0.15;
        return { min: dataMin - buffer, max: dataMax + buffer };
    }, [data, entry, stopLoss, takeProfit, indicatorData]);

    useEffect(() => {
        const chartCanvas = chartCanvasRef.current;
        const yAxisCanvas = yAxisCanvasRef.current;
        const container = containerRef.current;
        
        if (!chartCanvas || !yAxisCanvas || !container || data.length === 0) return;

        const resizeObserver = new ResizeObserver(() => {
            const chartCtx = chartCanvas.getContext('2d');
            const yAxisCtx = yAxisCanvas.getContext('2d');

            if (!chartCtx || !yAxisCtx) return;

            const chartContainer = mainChartContainerRef.current!;
            const chartWidth = chartContainer.clientWidth;
            const chartHeight = chartContainer.clientHeight;
            const yAxisWidth = yAxisCanvas.parentElement!.clientWidth;

            const dpr = window.devicePixelRatio || 1;
            chartCanvas.width = chartWidth * dpr;
            chartCanvas.height = chartHeight * dpr;
            yAxisCanvas.width = yAxisWidth * dpr;
            yAxisCanvas.height = chartHeight * dpr;
            chartCtx.scale(dpr, dpr);
            yAxisCtx.scale(dpr, dpr);

            const xStep = chartWidth / data.length;
            const yScale = (price: number) => {
                if (priceRange.max === priceRange.min) return chartHeight / 2;
                return chartHeight - ((price - priceRange.min) / (priceRange.max - priceRange.min)) * chartHeight;
            };

            const formatPrice = (p: number) => p.toFixed(p > 100 ? 2 : 5);

            // Clear canvases
            chartCtx.clearRect(0, 0, chartWidth, chartHeight);
            yAxisCtx.clearRect(0, 0, yAxisWidth, chartHeight);
            chartCtx.fillStyle = '#1f1f1f'; // gray-800
            chartCtx.fillRect(0, 0, chartWidth, chartHeight);
            yAxisCtx.fillStyle = '#1f1f1f';
            yAxisCtx.fillRect(0, 0, yAxisWidth, chartHeight);

            // Draw candlesticks
            data.forEach((d, i) => {
                const x = (i + 0.5) * xStep;
                const isBullish = d.close >= d.open;
                const color = isBullish ? '#10B981' : '#EF4444';

                chartCtx.beginPath();
                chartCtx.strokeStyle = color;
                chartCtx.lineWidth = 1;
                chartCtx.moveTo(x, yScale(d.high));
                chartCtx.lineTo(x, yScale(d.low));
                chartCtx.stroke();

                const bodyY = isBullish ? yScale(d.close) : yScale(d.open);
                const bodyHeight = Math.max(1, Math.abs(yScale(d.open) - yScale(d.close)));
                chartCtx.fillStyle = color;
                chartCtx.fillRect(x - xStep * 0.4, bodyY, xStep * 0.8, bodyHeight);
            });

            // Draw indicators on main chart
            if (indicatorData) {
                 if (indicatorData.type === 'MA_CROSSOVER') {
                    const { fastMA, slowMA } = indicatorData.data;
                    const drawLine = (maData: (number|null)[], color: string) => {
                        chartCtx.beginPath();
                        chartCtx.strokeStyle = color;
                        chartCtx.lineWidth = 1.5;
                        let firstPoint = true;
                        maData.forEach((val, i) => {
                            if (val !== null) {
                                const x = (i + 0.5) * xStep;
                                const y = yScale(val);
                                if (firstPoint) {
                                    chartCtx.moveTo(x, y);
                                    firstPoint = false;
                                } else {
                                    chartCtx.lineTo(x, y);
                                }
                            }
                        });
                        chartCtx.stroke();
                    }
                    drawLine(fastMA, '#60A5FA'); // blue-400
                    drawLine(slowMA, '#FBBF24'); // yellow-400
                }
                if (indicatorData.type === 'MOMENTUM_BREAKOUT') {
                    indicatorData.data.levels.forEach((level: number) => {
                        const y = yScale(level);
                        chartCtx.beginPath();
                        chartCtx.strokeStyle = '#A78BFA'; // purple-400
                        chartCtx.lineWidth = 1;
                        chartCtx.setLineDash([6, 6]);
                        chartCtx.moveTo(0, y);
                        chartCtx.lineTo(chartWidth, y);
                        chartCtx.stroke();
                        chartCtx.setLineDash([]);
                    });
                }
            }


            // Draw Y-axis labels and trade lines
            yAxisCtx.font = "10px Inter, sans-serif";
            yAxisCtx.textAlign = "left";

            const lines = [
                { price: takeProfit, color: '#10B981', label: 'TP' },
                { price: entry, color: '#3B82F6', label: 'Entry' },
                { price: stopLoss, color: '#EF4444', label: 'SL' },
            ];
            
            let lastY = -Infinity;

            lines.forEach(({ price, color, label }) => {
                const y = yScale(price);
                if (y > 0 && y < chartHeight) {
                    chartCtx.beginPath();
                    chartCtx.strokeStyle = color;
                    chartCtx.lineWidth = 1;
                    chartCtx.setLineDash([4, 4]);
                    chartCtx.moveTo(0, y);
                    chartCtx.lineTo(chartWidth, y);
                    chartCtx.stroke();
                    chartCtx.setLineDash([]);
                    
                    if (Math.abs(y - lastY) > 12) {
                        yAxisCtx.fillStyle = color;
                        yAxisCtx.fillText(`${label}: ${formatPrice(price)}`, 5, y + 3);
                        lastY = y;
                    }
                }
            });

            // Draw RSI Panel if needed
            if (hasRsi) {
                const rsiCanvas = rsiCanvasRef.current!;
                const rsiYAxisCanvas = rsiYAxisCanvasRef.current!;
                const rsiCtx = rsiCanvas.getContext('2d')!;
                const rsiYAxisCtx = rsiYAxisCanvas.getContext('2d')!;
                const rsiContainer = rsiContainerRef.current!;

                const rsiWidth = rsiContainer.clientWidth;
                const rsiHeight = rsiContainer.clientHeight;
                const rsiYAxisWidth = rsiYAxisCanvas.parentElement!.clientWidth;

                rsiCanvas.width = rsiWidth * dpr;
                rsiCanvas.height = rsiHeight * dpr;
                rsiYAxisCanvas.width = rsiYAxisWidth * dpr;
                rsiYAxisCanvas.height = rsiHeight * dpr;
                rsiCtx.scale(dpr, dpr);
                rsiYAxisCtx.scale(dpr, dpr);

                rsiCtx.clearRect(0, 0, rsiWidth, rsiHeight);
                rsiYAxisCtx.clearRect(0, 0, rsiYAxisWidth, rsiHeight);
                rsiCtx.fillStyle = '#1f1f1f';
                rsiCtx.fillRect(0, 0, rsiWidth, rsiHeight);
                rsiYAxisCtx.fillStyle = '#1f1f1f';
                rsiYAxisCtx.fillRect(0, 0, rsiYAxisWidth, rsiHeight);

                const rsiYScale = (val: number) => rsiHeight - (val / 100) * rsiHeight;

                // Draw RSI 30/70 bands
                rsiCtx.fillStyle = 'rgba(167, 139, 250, 0.1)';
                rsiCtx.fillRect(0, rsiYScale(70), rsiWidth, rsiYScale(30) - rsiYScale(70));
                
                // Draw RSI lines
                [30, 70].forEach(level => {
                    const y = rsiYScale(level);
                    rsiCtx.beginPath();
                    rsiCtx.strokeStyle = 'rgba(169, 169, 169, 0.4)';
                    rsiCtx.lineWidth = 1;
                    rsiCtx.setLineDash([2, 4]);
                    rsiCtx.moveTo(0, y);
                    rsiCtx.lineTo(rsiWidth, y);
                    rsiCtx.stroke();
                });
                rsiCtx.setLineDash([]);

                // Draw RSI data line
                const rsiData = indicatorData.data.rsi as (number | null)[];
                rsiCtx.beginPath();
                rsiCtx.strokeStyle = '#A78BFA';
                rsiCtx.lineWidth = 1.5;
                let firstPoint = true;
                rsiData.forEach((val, i) => {
                    if (val !== null) {
                        const x = (i + 0.5) * xStep;
                        const y = rsiYScale(val);
                        if (firstPoint) {
                            rsiCtx.moveTo(x, y);
                            firstPoint = false;
                        } else {
                            rsiCtx.lineTo(x, y);
                        }
                    }
                });
                rsiCtx.stroke();
                
                // Draw RSI Y-Axis
                rsiYAxisCtx.font = "10px Inter, sans-serif";
                rsiYAxisCtx.fillStyle = '#9CA3AF';
                [0, 30, 70, 100].forEach(level => {
                     rsiYAxisCtx.fillText(level.toString(), 5, rsiYScale(level) - 2);
                });
            }
        });

        resizeObserver.observe(container);

        return () => resizeObserver.disconnect();
    }, [data, priceRange, indicatorData, entry, stopLoss, takeProfit]);

    return (
        <div className="w-full h-full flex" ref={containerRef}>
            <div className="flex-1 h-full flex flex-col min-w-0">
                <div className="flex-1 min-h-0" ref={mainChartContainerRef}>
                    <canvas ref={chartCanvasRef} className="w-full h-full" />
                </div>
                {hasRsi && (
                    <div className="h-[120px] border-t-2 border-gray-700 flex-shrink-0" ref={rsiContainerRef}>
                        <canvas ref={rsiCanvasRef} className="w-full h-full" />
                    </div>
                )}
            </div>
            <div className="w-24 h-full flex-shrink-0 flex flex-col">
                <div className="flex-1 min-h-0">
                    <canvas ref={yAxisCanvasRef} className="w-full h-full" />
                </div>
                {hasRsi && (
                    <div className="h-[120px] border-t-2 border-gray-700 flex-shrink-0">
                        <canvas ref={rsiYAxisCanvasRef} className="w-full h-full" />
                    </div>
                )}
            </div>
        </div>
    );
};

export default MiniChart;
