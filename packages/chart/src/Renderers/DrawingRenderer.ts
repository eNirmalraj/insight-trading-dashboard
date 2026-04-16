import { CoordinateSystem } from '../Core/CoordinateSystem';
import { Drawing, Point, Candle } from '../types';

export class DrawingRenderer {
    constructor(private ctx: CanvasRenderingContext2D) {}

    public drawDrawings(
        drawings: Drawing[],
        coord: CoordinateSystem,
        dimensions: { width: number; height: number },
        data: Candle[],
        selectedId?: string | null,
        hoveredId?: string | null
    ) {
        drawings.forEach((d) => {
            if (d.isVisible === false) return;
            const isSelected = selectedId === d.id;
            const isHovered = hoveredId === d.id;
            this.drawDrawing(d, coord, dimensions, data, isSelected, isHovered);
        });
    }

    private drawDrawing(
        d: Drawing,
        coord: CoordinateSystem,
        dim: { width: number; height: number },
        data: Candle[],
        isSelected: boolean = false,
        isHovered: boolean = false
    ) {
        this.ctx.save();
        const { style } = d;
        this.ctx.strokeStyle = style.color;
        this.ctx.lineWidth = style.width;

        if (style.lineStyle === 'dashed') {
            this.ctx.setLineDash([8, 4]);
        } else if (style.lineStyle === 'dotted') {
            this.ctx.setLineDash([2, 4]);
        } else {
            this.ctx.setLineDash([]);
        }

        switch (d.type) {
            case 'Trend Line':
            case 'Ray':
                this.drawTrendLine(d as any, coord, dim, data);
                break;
            case 'Horizontal Line':
                this.drawHorizontalLine(d as any, coord, dim);
                break;
            case 'Vertical Line':
                this.drawVerticalLine(d as any, coord, dim, data);
                break;
            case 'Rectangle':
                this.drawRectangle(d as any, coord, dim, data);
                break;
            case 'Long Position':
                this.drawLongPosition(d as any, coord, dim, data, isSelected, isHovered);
                break;
            case 'Short Position':
                this.drawShortPosition(d as any, coord, dim, data, isSelected, isHovered);
                break;
            case 'Price Range':
                this.drawPriceRange(d as any, coord, dim, data);
                break;
            case 'Date Range':
                this.drawDateRange(d as any, coord, dim, data);
                break;
            case 'Date & Price Range':
                this.drawDatePriceRange(d as any, coord, dim, data);
                break;
            case 'Arrow':
                this.drawArrow(d as any, coord, dim, data);
                break;
            // Add other types gradually
        }
        this.ctx.restore();
    }

    private drawTrendLine(
        d: { type: string; start: Point; end: Point },
        coord: CoordinateSystem,
        dim: { width: number; height: number },
        data: Candle[]
    ) {
        if (!d.start || !d.end) return;

        const x1 = coord.timeToX(d.start.time, data);
        const y1 = coord.priceToY(d.start.price);
        const x2 = coord.timeToX(d.end.time, data);
        const y2 = coord.priceToY(d.end.price);

        let targetX = x2;
        let targetY = y2;

        if (d.type === 'Ray') {
            const dx = x2 - x1;
            const dy = y2 - y1;
            if (Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6) {
                const len = Math.sqrt(dx * dx + dy * dy);
                const extension = dim.width + dim.height; // Sufficiently large
                targetX = x1 + (dx / len) * extension;
                targetY = y1 + (dy / len) * extension;
            }
        }

        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(targetX, targetY);
        this.ctx.stroke();
    }

    private drawHorizontalLine(
        d: { price: number },
        coord: CoordinateSystem,
        dim: { width: number; height: number }
    ) {
        const y = coord.priceToY(d.price);
        this.ctx.beginPath();
        this.ctx.moveTo(0, y);
        this.ctx.lineTo(dim.width, y);
        this.ctx.stroke();
    }

    private drawVerticalLine(
        d: { time: number },
        coord: CoordinateSystem,
        dim: { width: number; height: number },
        data: Candle[]
    ) {
        const x = coord.timeToX(d.time, data);
        this.ctx.beginPath();
        this.ctx.moveTo(x, 0);
        this.ctx.lineTo(x, dim.height);
        this.ctx.stroke();
    }

    private drawRectangle(
        d: { start: Point; end: Point; style: any },
        coord: CoordinateSystem,
        dim: { width: number; height: number },
        data: Candle[]
    ) {
        if (!d.start || !d.end) return;

        const x1 = coord.timeToX(d.start.time, data);
        const y1 = coord.priceToY(d.start.price);
        const x2 = coord.timeToX(d.end.time, data);
        const y2 = coord.priceToY(d.end.price);

        const x = Math.min(x1, x2);
        const y = Math.min(y1, y2);
        const w = Math.abs(x1 - x2);
        const h = Math.abs(y1 - y2);

        if (d.style.fillColor) {
            this.ctx.fillStyle = d.style.fillColor;
            this.ctx.fillRect(x, y, w, h);
        }

        this.ctx.strokeRect(x, y, w, h);
    }

    private drawLongPosition(
        d: { entry: Point; profit: Point; stop: Point; style: any },
        coord: CoordinateSystem,
        dim: { width: number; height: number },
        data: Candle[],
        isSelected: boolean = false,
        isHovered: boolean = false
    ) {
        if (!d.entry || !d.profit || !d.stop) return;

        const entryX = coord.timeToX(d.entry.time, data);
        const entryY = coord.priceToY(d.entry.price);
        const profitY = coord.priceToY(d.profit.price);
        const stopY = coord.priceToY(d.stop.price);

        // Calculate position metrics
        const profitPips = d.profit.price - d.entry.price;
        const stopPips = d.entry.price - d.stop.price;
        const riskReward = stopPips > 0 ? (profitPips / stopPips).toFixed(2) : 'N/A';

        // Enhanced visual feedback when selected/hovered
        const lineWidthMultiplier = isSelected ? 1.5 : isHovered ? 1.2 : 1;
        const alphaMultiplier = isSelected ? 1 : isHovered ? 0.9 : 0.7;

        // Draw entry line (solid, thicker)
        this.ctx.strokeStyle = '#2962FF';
        this.ctx.globalAlpha = alphaMultiplier;
        this.ctx.lineWidth = 2 * lineWidthMultiplier;
        this.ctx.setLineDash([]);
        this.ctx.beginPath();
        this.ctx.moveTo(0, entryY);
        this.ctx.lineTo(dim.width, entryY);
        this.ctx.stroke();

        // Draw profit target line (green, dashed)
        this.ctx.strokeStyle = '#10B981';
        this.ctx.lineWidth = 1.5 * lineWidthMultiplier;
        this.ctx.setLineDash([8, 4]);
        this.ctx.beginPath();
        this.ctx.moveTo(0, profitY);
        this.ctx.lineTo(dim.width, profitY);
        this.ctx.stroke();

        // Draw stop loss line (red, dashed)
        this.ctx.strokeStyle = '#EF4444';
        this.ctx.lineWidth = 1.5 * lineWidthMultiplier;
        this.ctx.setLineDash([8, 4]);
        this.ctx.beginPath();
        this.ctx.moveTo(0, stopY);
        this.ctx.lineTo(dim.width, stopY);
        this.ctx.stroke();

        this.ctx.globalAlpha = 1; // Reset alpha

        // Draw connecting arrows from entry
        this.ctx.setLineDash([]);
        this.drawArrowLine(entryX, entryY, entryX, profitY, '#10B981');
        this.drawArrowLine(entryX, entryY, entryX, stopY, '#EF4444');

        // Draw labels with background
        this.ctx.font = 'bold 11px sans-serif';
        this.drawLabel(
            `ENTRY: ${d.entry.price.toFixed(5)}`,
            dim.width - 10,
            entryY,
            '#2962FF',
            'right'
        );
        this.drawLabel(
            `TP: ${d.profit.price.toFixed(5)} (+${profitPips.toFixed(5)})`,
            dim.width - 10,
            profitY,
            '#10B981',
            'right'
        );
        this.drawLabel(
            `SL: ${d.stop.price.toFixed(5)} (-${stopPips.toFixed(5)})`,
            dim.width - 10,
            stopY,
            '#EF4444',
            'right'
        );

        // Draw R:R ratio badge
        this.drawBadge(`R:R ${riskReward}`, entryX + 10, entryY - 25, '#2962FF');

        // Draw interactive drag handles (always visible when selected or hovered)
        if (isSelected || isHovered) {
            this.drawHandle(entryX, entryY, '#2962FF', isSelected ? 10 : 8);
            this.drawHandle(entryX, profitY, '#10B981', isSelected ? 10 : 8);
            this.drawHandle(entryX, stopY, '#EF4444', isSelected ? 10 : 8);
        }
    }

    private drawShortPosition(
        d: { entry: Point; profit: Point; stop: Point; style: any },
        coord: CoordinateSystem,
        dim: { width: number; height: number },
        data: Candle[],
        isSelected: boolean = false,
        isHovered: boolean = false
    ) {
        if (!d.entry || !d.profit || !d.stop) return;

        const entryX = coord.timeToX(d.entry.time, data);
        const entryY = coord.priceToY(d.entry.price);
        const profitY = coord.priceToY(d.profit.price);
        const stopY = coord.priceToY(d.stop.price);

        // Calculate position metrics
        const profitPips = d.entry.price - d.profit.price;
        const stopPips = d.stop.price - d.entry.price;
        const riskReward = stopPips > 0 ? (profitPips / stopPips).toFixed(2) : 'N/A';

        // Enhanced visual feedback when selected/hovered
        const lineWidthMultiplier = isSelected ? 1.5 : isHovered ? 1.2 : 1;
        const alphaMultiplier = isSelected ? 1 : isHovered ? 0.9 : 0.7;

        // Draw entry line (solid, thicker)
        this.ctx.strokeStyle = '#EF4444';
        this.ctx.globalAlpha = alphaMultiplier;
        this.ctx.lineWidth = 2 * lineWidthMultiplier;
        this.ctx.setLineDash([]);
        this.ctx.beginPath();
        this.ctx.moveTo(0, entryY);
        this.ctx.lineTo(dim.width, entryY);
        this.ctx.stroke();

        // Draw profit target line (green, dashed)
        this.ctx.strokeStyle = '#10B981';
        this.ctx.lineWidth = 1.5 * lineWidthMultiplier;
        this.ctx.setLineDash([8, 4]);
        this.ctx.beginPath();
        this.ctx.moveTo(0, profitY);
        this.ctx.lineTo(dim.width, profitY);
        this.ctx.stroke();

        // Draw stop loss line (red, dashed)
        this.ctx.strokeStyle = '#FF6B6B';
        this.ctx.lineWidth = 1.5 * lineWidthMultiplier;
        this.ctx.setLineDash([8, 4]);
        this.ctx.beginPath();
        this.ctx.moveTo(0, stopY);
        this.ctx.lineTo(dim.width, stopY);
        this.ctx.stroke();

        this.ctx.globalAlpha = 1; // Reset alpha

        // Draw connecting arrows from entry
        this.ctx.setLineDash([]);
        this.drawArrowLine(entryX, entryY, entryX, profitY, '#10B981');
        this.drawArrowLine(entryX, entryY, entryX, stopY, '#FF6B6B');

        // Draw labels with background
        this.ctx.font = 'bold 11px sans-serif';
        this.drawLabel(
            `ENTRY: ${d.entry.price.toFixed(5)}`,
            dim.width - 10,
            entryY,
            '#EF4444',
            'right'
        );
        this.drawLabel(
            `TP: ${d.profit.price.toFixed(5)} (+${profitPips.toFixed(5)})`,
            dim.width - 10,
            profitY,
            '#10B981',
            'right'
        );
        this.drawLabel(
            `SL: ${d.stop.price.toFixed(5)} (-${stopPips.toFixed(5)})`,
            dim.width - 10,
            stopY,
            '#FF6B6B',
            'right'
        );

        // Draw R:R ratio badge
        this.drawBadge(`R:R ${riskReward}`, entryX + 10, entryY + 15, '#EF4444');

        // Draw interactive drag handles (always visible when selected or hovered)
        if (isSelected || isHovered) {
            this.drawHandle(entryX, entryY, '#EF4444', isSelected ? 10 : 8);
            this.drawHandle(entryX, profitY, '#10B981', isSelected ? 10 : 8);
            this.drawHandle(entryX, stopY, '#FF6B6B', isSelected ? 10 : 8);
        }
    }

    private drawPriceRange(
        d: { start: Point; end: Point; style: any },
        coord: CoordinateSystem,
        dim: { width: number; height: number },
        data: Candle[]
    ) {
        if (!d.start || !d.end) return;

        const y1 = coord.priceToY(d.start.price);
        const y2 = coord.priceToY(d.end.price);
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);

        // Draw background fill
        this.ctx.fillStyle = d.style.fillColor || 'rgba(41, 98, 255, 0.1)';
        this.ctx.fillRect(0, minY, dim.width, maxY - minY);

        // Draw horizontal lines at both price levels
        this.ctx.strokeStyle = d.style.color || '#2962FF';
        this.ctx.lineWidth = d.style.width || 1.5;
        this.ctx.setLineDash([]);

        this.ctx.beginPath();
        this.ctx.moveTo(0, y1);
        this.ctx.lineTo(dim.width, y1);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.moveTo(0, y2);
        this.ctx.lineTo(dim.width, y2);
        this.ctx.stroke();

        // Calculate metrics
        const priceDiff = Math.abs(d.end.price - d.start.price);
        const percentage = ((priceDiff / Math.min(d.start.price, d.end.price)) * 100).toFixed(2);

        // Draw center measurement line with arrows
        const centerX = dim.width - 50;
        this.drawMeasurementLine(centerX, y1, centerX, y2, d.style.color || '#2962FF');

        // Draw measurement label
        const labelY = (y1 + y2) / 2;
        const labelText = `${priceDiff.toFixed(5)} (${percentage}%)`;
        this.drawBadge(labelText, centerX + 10, labelY, d.style.color || '#2962FF');

        // Draw price labels
        this.ctx.font = 'bold 11px sans-serif';
        this.drawLabel(d.start.price.toFixed(5), 10, y1, d.style.color || '#2962FF', 'left');
        this.drawLabel(d.end.price.toFixed(5), 10, y2, d.style.color || '#2962FF', 'left');
    }

    private drawDateRange(
        d: { start: Point; end: Point; style: any },
        coord: CoordinateSystem,
        dim: { width: number; height: number },
        data: Candle[]
    ) {
        if (!d.start || !d.end) return;

        const x1 = coord.timeToX(d.start.time, data);
        const x2 = coord.timeToX(d.end.time, data);
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);

        // Draw background fill
        this.ctx.fillStyle = d.style.fillColor || 'rgba(41, 98, 255, 0.1)';
        this.ctx.fillRect(minX, 0, maxX - minX, dim.height);

        // Draw vertical lines at both time points
        this.ctx.strokeStyle = d.style.color || '#2962FF';
        this.ctx.lineWidth = d.style.width || 1.5;
        this.ctx.setLineDash([]);

        this.ctx.beginPath();
        this.ctx.moveTo(x1, 0);
        this.ctx.lineTo(x1, dim.height);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.moveTo(x2, 0);
        this.ctx.lineTo(x2, dim.height);
        this.ctx.stroke();

        // Calculate time difference
        const timeDiff = Math.abs(d.end.time - d.start.time);
        const bars = Math.abs(
            data.findIndex((c) => c.time === d.end.time) -
                data.findIndex((c) => c.time === d.start.time)
        );
        const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

        // Draw center measurement line with arrows
        const centerY = 40;
        this.drawMeasurementLine(x1, centerY, x2, centerY, d.style.color || '#2962FF');

        // Draw measurement label
        const labelX = (x1 + x2) / 2;
        const labelText = bars > 0 ? `${bars} bars (${days}d ${hours}h)` : `${days}d ${hours}h`;
        this.drawBadge(labelText, labelX, centerY - 10, d.style.color || '#2962FF');
    }

    private drawDatePriceRange(
        d: { start: Point; end: Point; style: any },
        coord: CoordinateSystem,
        dim: { width: number; height: number },
        data: Candle[]
    ) {
        if (!d.start || !d.end) return;

        const x1 = coord.timeToX(d.start.time, data);
        const y1 = coord.priceToY(d.start.price);
        const x2 = coord.timeToX(d.end.time, data);
        const y2 = coord.priceToY(d.end.price);

        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);

        // Draw background fill
        this.ctx.fillStyle = d.style.fillColor || 'rgba(41, 98, 255, 0.08)';
        this.ctx.fillRect(minX, minY, maxX - minX, maxY - minY);

        // Draw border
        this.ctx.strokeStyle = d.style.color || '#2962FF';
        this.ctx.lineWidth = d.style.width || 1.5;
        this.ctx.setLineDash([]);
        this.ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);

        // Calculate metrics
        const priceDiff = Math.abs(d.end.price - d.start.price);
        const percentage = ((priceDiff / Math.min(d.start.price, d.end.price)) * 100).toFixed(2);
        const timeDiff = Math.abs(d.end.time - d.start.time);
        const bars = Math.abs(
            data.findIndex((c) => c.time === d.end.time) -
                data.findIndex((c) => c.time === d.start.time)
        );
        const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

        // Draw measurement lines with arrows
        const measureX = maxX - 15;
        const measureY = minY + 15;

        // Vertical price measurement
        this.drawMeasurementLine(measureX, minY, measureX, maxY, d.style.color || '#2962FF');

        // Horizontal time measurement
        this.drawMeasurementLine(minX, measureY, maxX, measureY, d.style.color || '#2962FF');

        // Draw labels
        this.ctx.font = 'bold 11px sans-serif';

        // Price label
        const priceLabel = `${priceDiff.toFixed(5)} (${percentage}%)`;
        this.drawBadge(priceLabel, measureX + 10, (minY + maxY) / 2, d.style.color || '#2962FF');

        // Time label
        const timeLabel = bars > 0 ? `${bars} bars` : `${days}d ${hours}h`;
        this.drawBadge(timeLabel, (minX + maxX) / 2, measureY - 10, d.style.color || '#2962FF');

        // Corner price labels
        this.drawLabel(d.start.price.toFixed(5), minX + 5, y1, d.style.color || '#2962FF', 'left');
        this.drawLabel(d.end.price.toFixed(5), maxX - 5, y2, d.style.color || '#2962FF', 'right');
    }

    private drawArrow(
        d: { start: Point; end: Point; style: any },
        coord: CoordinateSystem,
        dim: { width: number; height: number },
        data: Candle[]
    ) {
        if (!d.start || !d.end) return;

        const x1 = coord.timeToX(d.start.time, data);
        const y1 = coord.priceToY(d.start.price);
        const x2 = coord.timeToX(d.end.time, data);
        const y2 = coord.priceToY(d.end.price);

        this.drawArrowLine(x1, y1, x2, y2, d.style.color || '#2962FF', d.style.width || 2);
    }

    // Helper methods
    private drawArrowLine(
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        color: string,
        lineWidth: number = 1.5
    ) {
        const headLength = 12;
        const angle = Math.atan2(y2 - y1, x2 - x1);

        // Draw line
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = lineWidth;
        this.ctx.setLineDash([]);
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();

        // Draw arrowhead
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.moveTo(x2, y2);
        this.ctx.lineTo(
            x2 - headLength * Math.cos(angle - Math.PI / 6),
            y2 - headLength * Math.sin(angle - Math.PI / 6)
        );
        this.ctx.lineTo(
            x2 - headLength * Math.cos(angle + Math.PI / 6),
            y2 - headLength * Math.sin(angle + Math.PI / 6)
        );
        this.ctx.closePath();
        this.ctx.fill();
    }

    private drawMeasurementLine(x1: number, y1: number, x2: number, y2: number, color: string) {
        const arrowSize = 6;

        this.ctx.strokeStyle = color;
        this.ctx.fillStyle = color;
        this.ctx.lineWidth = 1.5;
        this.ctx.setLineDash([]);

        // Draw main line
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();

        // Draw arrows at both ends
        const angle = Math.atan2(y2 - y1, x2 - x1);

        // Start arrow
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(
            x1 + arrowSize * Math.cos(angle - (Math.PI / 6) * 5),
            y1 + arrowSize * Math.sin(angle - (Math.PI / 6) * 5)
        );
        this.ctx.lineTo(
            x1 + arrowSize * Math.cos(angle + (Math.PI / 6) * 5),
            y1 + arrowSize * Math.sin(angle + (Math.PI / 6) * 5)
        );
        this.ctx.closePath();
        this.ctx.fill();

        // End arrow
        this.ctx.beginPath();
        this.ctx.moveTo(x2, y2);
        this.ctx.lineTo(
            x2 - arrowSize * Math.cos(angle - (Math.PI / 6) * 5),
            y2 - arrowSize * Math.sin(angle - (Math.PI / 6) * 5)
        );
        this.ctx.lineTo(
            x2 - arrowSize * Math.cos(angle + (Math.PI / 6) * 5),
            y2 - arrowSize * Math.sin(angle + (Math.PI / 6) * 5)
        );
        this.ctx.closePath();
        this.ctx.fill();
    }

    private drawLabel(
        text: string,
        x: number,
        y: number,
        color: string,
        align: 'left' | 'right' = 'left'
    ) {
        this.ctx.font = 'bold 11px sans-serif';
        this.ctx.textBaseline = 'middle';
        this.ctx.textAlign = align;

        const metrics = this.ctx.measureText(text);
        const padding = 4;
        const height = 18;

        let bgX = x - padding;
        const bgWidth = metrics.width + padding * 2;

        if (align === 'right') {
            bgX = x - metrics.width - padding;
        }

        // Draw background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        this.ctx.fillRect(bgX, y - height / 2, bgWidth, height);

        // Draw border
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(bgX, y - height / 2, bgWidth, height);

        // Draw text
        this.ctx.fillStyle = color;
        this.ctx.fillText(text, x, y);
    }

    private drawBadge(text: string, x: number, y: number, color: string) {
        this.ctx.font = 'bold 10px sans-serif';
        this.ctx.textBaseline = 'middle';
        this.ctx.textAlign = 'center';

        const metrics = this.ctx.measureText(text);
        const padding = 6;
        const height = 18;
        const width = metrics.width + padding * 2;

        // Draw background
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.roundRect(x - width / 2, y - height / 2, width, height, 4);
        this.ctx.fill();

        // Draw text
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillText(text, x, y);
    }

    private drawHandle(x: number, y: number, color: string, size: number = 8) {
        this.ctx.setLineDash([]);

        // Draw outer circle (white border)
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.beginPath();
        this.ctx.arc(x, y, size / 2 + 1, 0, Math.PI * 2);
        this.ctx.fill();

        // Draw inner circle (colored)
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(x, y, size / 2, 0, Math.PI * 2);
        this.ctx.fill();

        // Draw inner dot for grab indication
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.beginPath();
        this.ctx.arc(x, y, size / 4, 0, Math.PI * 2);
        this.ctx.fill();
    }
}
