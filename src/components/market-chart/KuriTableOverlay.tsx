import React from 'react';
import type { KuriTable, KuriTableCell } from '../../lib/kuri/types';

interface KuriTableOverlayProps {
    tables: KuriTable[];
}

const POSITION_STYLES: Record<string, React.CSSProperties> = {
    'position.top_left': { top: 8, left: 8 },
    'position.top_center': { top: 8, left: '50%', transform: 'translateX(-50%)' },
    'position.top_right': { top: 8, right: 8 },
    'position.middle_left': { top: '50%', left: 8, transform: 'translateY(-50%)' },
    'position.middle_center': { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
    'position.middle_right': { top: '50%', right: 8, transform: 'translateY(-50%)' },
    'position.bottom_left': { bottom: 8, left: 8 },
    'position.bottom_center': { bottom: 8, left: '50%', transform: 'translateX(-50%)' },
    'position.bottom_right': { bottom: 8, right: 8 },
};

const renderCell = (cell: KuriTableCell | null) => {
    if (!cell) return null;
    return (
        <td
            style={{
                backgroundColor: cell.bgcolor || 'transparent',
                color: cell.text_color || '#E0E0E0',
                padding: '2px 6px',
                fontSize:
                    cell.text_size === 'small'
                        ? '10px'
                        : cell.text_size === 'large'
                          ? '14px'
                          : '11px',
                textAlign: (cell.text_halign as any) || 'center',
                verticalAlign: (cell.text_valign as any) || 'middle',
                whiteSpace: 'nowrap',
            }}
        >
            {cell.text}
        </td>
    );
};

const KuriTableOverlay: React.FC<KuriTableOverlayProps> = ({ tables }) => {
    if (!tables || tables.length === 0) return null;

    return (
        <>
            {tables
                .filter((t) => !t.deleted)
                .map((table) => {
                    const posStyle =
                        POSITION_STYLES[table.position] || POSITION_STYLES['position.top_right'];
                    return (
                        <div
                            key={table.id}
                            className="absolute z-20 pointer-events-none"
                            style={{ ...posStyle, position: 'absolute' }}
                        >
                            <table
                                style={{
                                    borderCollapse: 'collapse',
                                    backgroundColor: table.bgcolor || 'rgba(0,0,0,0.7)',
                                    border: `${table.border_width || 0}px solid ${table.border_color || 'transparent'}`,
                                    borderRadius: '3px',
                                }}
                            >
                                <tbody>
                                    {table.cells.map((row, ri) => (
                                        <tr key={ri}>
                                            {row.map((cell, ci) => (
                                                <React.Fragment key={ci}>
                                                    {renderCell(cell)}
                                                </React.Fragment>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    );
                })}
        </>
    );
};

export default KuriTableOverlay;
