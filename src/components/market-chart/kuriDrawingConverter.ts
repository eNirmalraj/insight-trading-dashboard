/**
 * Kuri Drawing Converter — converts Kuri engine drawing output
 * to the chart's SVG overlay format.
 */
import type { DrawingLine, DrawingLabel, DrawingBox, KuriTable } from '../../lib/kuri/types';

export interface ChartDrawingLine {
    id: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    color: string;
    width: number;
    style: 'solid' | 'dashed' | 'dotted';
    extend: string;
}

export interface ChartDrawingLabel {
    id: string;
    x: number;
    y: number;
    text: string;
    textcolor: string;
    bgcolor: string;
    style: string;
    size: string;
}

export interface ChartDrawingBox {
    id: string;
    left: number;
    top: number;
    right: number;
    bottom: number;
    bgcolor: string;
    borderColor: string;
    borderWidth: number;
    text?: string;
}

const STYLE_MAP: Record<string, 'solid' | 'dashed' | 'dotted'> = {
    solid: 'solid',
    dashed: 'dashed',
    dotted: 'dotted',
    line_style_solid: 'solid',
    line_style_dashed: 'dashed',
    line_style_dotted: 'dotted',
};

export function convertKuriDrawings(drawings: {
    lines?: DrawingLine[];
    labels?: DrawingLabel[];
    boxes?: DrawingBox[];
}): {
    lines: ChartDrawingLine[];
    labels: ChartDrawingLabel[];
    boxes: ChartDrawingBox[];
} {
    if (!drawings) return { lines: [], labels: [], boxes: [] };

    const lines: ChartDrawingLine[] = (drawings.lines || [])
        .filter((l) => !l.deleted)
        .map((l) => ({
            id: `kuri-line-${l.id}`,
            x1: l.x1,
            y1: l.y1,
            x2: l.x2,
            y2: l.y2,
            color: l.color || '#787B86',
            width: l.width || 1,
            style: STYLE_MAP[l.style] || 'solid',
            extend: l.extend || 'none',
        }));

    const labels: ChartDrawingLabel[] = (drawings.labels || [])
        .filter((l) => !l.deleted)
        .map((l) => ({
            id: `kuri-label-${l.id}`,
            x: l.x,
            y: l.y,
            text: l.text || '',
            textcolor: l.textcolor || '#FFFFFF',
            bgcolor: l.color || 'transparent',
            style: l.style || 'label_down',
            size: l.size || 'normal',
        }));

    const boxes: ChartDrawingBox[] = (drawings.boxes || [])
        .filter((b) => !b.deleted)
        .map((b) => ({
            id: `kuri-box-${b.id}`,
            left: b.left,
            top: b.top,
            right: b.right,
            bottom: b.bottom,
            bgcolor: b.bgcolor || 'transparent',
            borderColor: b.border_color || '#787B86',
            borderWidth: b.border_width || 1,
            text: b.text,
        }));

    return { lines, labels, boxes };
}

export function getKuriTables(tables: KuriTable[]): KuriTable[] {
    if (!tables) return [];
    return tables.filter((t) => !t.deleted);
}
