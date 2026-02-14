
import React, { useMemo, useState, useEffect } from 'react';
import { Position, PositionStatus, TradeDirection } from '../../types';
import {
    ArrowUpIcon, ArrowDownIcon, CrossingIcon,
    BriefcaseIcon, ClockIcon, CalendarIcon,
    PencilIcon, IndicatorIcon, WatchlistIcon, MoreHorizontalIcon,
    UndoIcon, RedoIcon, SettingsIcon
} from '../IconComponents';

interface EditableRowProps {
    position: Position;
    onModify: (positionId: string, newValues: { sl: number; tp: number }) => void;
    onClose: (positionId: string) => void;
    onCancel: (positionId: string) => void;
    onReverse: (positionId: string) => void;
}

const EditableRow: React.FC<EditableRowProps> = ({ position, onModify, onClose, onCancel, onReverse }) => {
    const [editableSl, setEditableSl] = useState(position.stopLoss.toString());
    const [editableTp, setEditableTp] = useState(position.takeProfit.toString());

    useEffect(() => {
        setEditableSl(position.stopLoss.toString());
        setEditableTp(position.takeProfit.toString());
    }, [position.stopLoss, position.takeProfit]);

    const isModified = position.stopLoss.toString() !== editableSl || position.takeProfit.toString() !== editableTp;

    const handleUpdate = () => {
        const newSl = parseFloat(editableSl);
        const newTp = parseFloat(editableTp);
        if (!isNaN(newSl) && !isNaN(newTp)) {
            onModify(position.id, { sl: newSl, tp: newTp });
        }
    };

    const pnlColor = position.pnl >= 0 ? 'text-green-400' : 'text-red-400';
    const dirColor = position.direction === TradeDirection.BUY ? 'text-green-400' : 'text-red-400';
    const isEditable = position.status === PositionStatus.OPEN || position.status === PositionStatus.PENDING;

    return (
        <tr className="border-b border-gray-700/50 hover:bg-gray-800 text-xs">
            <td className="px-2 py-1.5 font-semibold text-white">{position.symbol}</td>
            <td className={`px-2 py-1.5 font-semibold ${dirColor}`}>{position.direction}</td>
            <td className="px-2 py-1.5">{position.quantity}</td>
            <td className="px-2 py-1.5">{position.entryPrice}</td>
            <td className="px-2 py-1.5">
                {isEditable ? (
                    <input type="number" value={editableSl} onChange={e => setEditableSl(e.target.value)} className="w-16 bg-gray-800 border border-gray-700 rounded p-1 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                ) : (
                    position.stopLoss
                )}
            </td>
            <td className="px-2 py-1.5">
                {isEditable ? (
                    <input type="number" value={editableTp} onChange={e => setEditableTp(e.target.value)} className="w-16 bg-gray-800 border border-gray-700 rounded p-1 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                ) : (
                    position.takeProfit
                )}
            </td>
            <td className={`px-2 py-1.5 font-semibold ${pnlColor}`}>{position.pnl.toFixed(2)}</td>
            <td className="px-2 py-1.5">
                {position.status === PositionStatus.OPEN && (
                    <div className="flex items-center gap-2">
                        <button onClick={handleUpdate} disabled={!isModified} className="px-2 py-0.5 font-semibold rounded bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-600">Update</button>
                        <button onClick={() => onReverse(position.id)} className="px-2 py-0.5 font-semibold rounded bg-yellow-500 text-white hover:bg-yellow-600">Rev</button>
                        <button onClick={() => onClose(position.id)} className="text-gray-400 hover:text-white"><CrossingIcon className="w-4 h-4" /></button>
                    </div>
                )}
                {position.status === PositionStatus.PENDING && (
                    <div className="flex items-center gap-2">
                        <button onClick={handleUpdate} disabled={!isModified} className="px-2 py-0.5 font-semibold rounded bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-600">Update</button>
                        <button onClick={() => onCancel(position.id)} className="text-gray-400 hover:text-white"><CrossingIcon className="w-4 h-4" /></button>
                    </div>
                )}
            </td>
        </tr>
    );
}

const PositionsTable: React.FC<{
    positions: Position[];
    onModify: (positionId: string, newValues: { sl: number; tp: number }) => void;
    onClose: (positionId: string) => void;
    onCancel: (positionId: string) => void;
    onReverse: (positionId: string) => void;
    statusFilter: PositionStatus;
}> = ({ positions, onModify, onClose, onCancel, onReverse, statusFilter }) => {
    if (positions.length === 0) {
        return <div className="p-4 text-center text-gray-500 text-sm">No {statusFilter.toLowerCase()} positions to display for this symbol.</div>
    }
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[600px]">
                <thead className="text-gray-400 uppercase bg-gray-900/50">
                    <tr>
                        <th className="px-2 py-2">Symbol</th>
                        <th className="px-2 py-2">Side</th>
                        <th className="px-2 py-2">Qty</th>
                        <th className="px-2 py-2">Entry</th>
                        <th className="px-2 py-2">SL</th>
                        <th className="px-2 py-2">TP</th>
                        <th className="px-2 py-2">P/L</th>
                        <th className="px-2 py-2">Actions</th>
                    </tr>
                </thead>
                <tbody className="text-gray-300">
                    {positions.map(p => (
                        <EditableRow key={p.id} position={p} onModify={onModify} onClose={onClose} onCancel={onCancel} onReverse={onReverse} />
                    ))}
                </tbody>
            </table>
        </div>
    )
}


interface BottomPanelProps {
    isOpen: boolean;
    onToggle: () => void;
    activeTab: string;
    setActiveTab: (tab: string) => void;
    currentTime: Date;
    symbol: string;
    height: number;
    setHeight: (height: number) => void;
    positions: Position[];
    onModifyPosition: (positionId: string, newValues: { sl: number; tp: number }) => void;
    onClosePosition: (positionId: string) => void;
    onCancelOrder: (positionId: string) => void;
    onReversePosition: (positionId: string) => void;
    isMobile?: boolean;
    onToolAction?: (action: string) => void;
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;

}

const BottomPanel: React.FC<BottomPanelProps> = (props) => {
    const {
        isOpen, onToggle, activeTab, setActiveTab, currentTime, symbol, height, setHeight, positions,
        onModifyPosition, onClosePosition, onCancelOrder, onReversePosition, isMobile, onToolAction,
        onUndo, onRedo, canUndo, canRedo
    } = props;

    const TAB_CONFIG: Record<string, { label: string, icon: React.ReactNode }> = {
        'Positions': { label: 'Positions', icon: <BriefcaseIcon className="w-5 h-5" /> },
        'Pending Orders': { label: 'Pending', icon: <ClockIcon className="w-5 h-5" /> },
        'History': { label: 'History', icon: <CalendarIcon className="w-5 h-5" /> },
    };

    const tabs = Object.keys(TAB_CONFIG);

    const formatCurrentTime = (date: Date) => {
        const timeString = date.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
        return timeString.toUpperCase();
    };

    const { positionsToDisplay, statusFilter } = useMemo(() => {
        const normalizedSymbol = symbol.replace('/', '').toUpperCase();

        if (activeTab === 'Positions') return { positionsToDisplay: positions.filter(p => p.status === PositionStatus.OPEN && p.symbol.replace('/', '').toUpperCase() === normalizedSymbol), statusFilter: PositionStatus.OPEN };
        if (activeTab === 'Pending Orders') return { positionsToDisplay: positions.filter(p => p.status === PositionStatus.PENDING && p.symbol.replace('/', '').toUpperCase() === normalizedSymbol), statusFilter: PositionStatus.PENDING };
        if (activeTab === 'History') return { positionsToDisplay: positions.filter(p => p.status === PositionStatus.CLOSED && p.symbol.replace('/', '').toUpperCase() === normalizedSymbol), statusFilter: PositionStatus.CLOSED };

        return { positionsToDisplay: [], statusFilter: PositionStatus.OPEN };
    }, [activeTab, symbol, positions]);

    const handlePointerDown = (e: React.PointerEvent) => {
        if (!isOpen || window.innerWidth < 768) return;
        if ((e.target as HTMLElement).closest('button, input')) return;

        e.preventDefault();
        const startY = e.clientY;
        const startHeight = height;

        const handlePointerMove = (moveEvent: PointerEvent) => {
            const dy = startY - moveEvent.clientY;
            const newHeight = startHeight + dy;
            setHeight(Math.max(40, Math.min(newHeight, 600)));
        };

        const handlePointerUp = () => {
            document.removeEventListener('pointermove', handlePointerMove);
            document.removeEventListener('pointerup', handlePointerUp);
        };

        document.addEventListener('pointermove', handlePointerMove);
        document.addEventListener('pointerup', handlePointerUp);
    };

    const mobileTools = [
        { id: 'draw', icon: <PencilIcon className="w-5 h-5" /> },
        { id: 'indicators', icon: <IndicatorIcon className="w-5 h-5" /> },
        { id: 'watchlist', icon: <WatchlistIcon className="w-5 h-5" /> },
        { id: 'more', icon: <MoreHorizontalIcon className="w-5 h-5" /> },
    ];

    return (
        <div
            className="border-t border-gray-700/50 flex flex-col flex-shrink-0 bg-gray-900 z-30 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]"
            style={{ height: isOpen ? `${height}px` : 'auto' }}
        >
            <div
                onPointerDown={handlePointerDown}
                className={`flex items-center justify-between px-3 py-2 border-b border-gray-800 ${isOpen && !isMobile ? 'md:cursor-row-resize' : ''}`}
            >
                <div className="flex items-center gap-4 overflow-x-auto no-scrollbar flex-1">
                    {isMobile && onToolAction ? (
                        <div className="flex items-center gap-3 w-full">
                            {/* Mobile Tools */}
                            <div className="flex items-center gap-4 flex-shrink-0">
                                {mobileTools.map(tool => (
                                    <button key={tool.id} onClick={() => onToolAction(tool.id)} className="text-gray-400 hover:text-white transition-colors p-1">
                                        {tool.icon}
                                    </button>
                                ))}
                            </div>

                            <div className="w-px h-5 bg-gray-700 flex-shrink-0"></div>

                            {/* Mobile Undo/Redo & Trades */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <button onClick={onUndo} disabled={!canUndo} className="text-gray-400 hover:text-white disabled:text-gray-700 transition-colors p-1" title="Undo">
                                    <UndoIcon className="w-5 h-5" />
                                </button>
                                <button onClick={onRedo} disabled={!canRedo} className="text-gray-400 hover:text-white disabled:text-gray-700 transition-colors p-1" title="Redo">
                                    <RedoIcon className="w-5 h-5" />
                                </button>

                                <div className="w-px h-5 bg-gray-700 flex-shrink-0 mx-1"></div>

                                <button
                                    onClick={() => { if (!isOpen) onToggle(); }}
                                    className={`transition-colors p-1 ${isOpen ? 'text-blue-500' : 'text-gray-500'}`}
                                    title="Trades"
                                >
                                    <BriefcaseIcon className="w-5 h-5" />
                                </button>


                            </div>
                        </div>
                    ) : (
                        !isOpen && <span className="text-xs font-bold text-gray-300 cursor-pointer" onClick={onToggle}>{activeTab}</span>
                    )}
                </div>

                <div className="flex items-center gap-3 text-gray-400 text-xs flex-shrink-0 ml-2">
                    {!isMobile && <span className="hidden sm:inline">{formatCurrentTime(currentTime)} (UTC+5:30)</span>}

                    <button
                        onClick={onToggle}
                        className="p-1 text-gray-400 hover:bg-gray-800 rounded-md flex items-center gap-2"
                    >
                        {!isMobile && !isOpen && TAB_CONFIG[activeTab].icon}
                        {isOpen ? <ArrowDownIcon className="w-5 h-5" /> : <ArrowUpIcon className="w-5 h-5" />}
                    </button>
                </div>
            </div>
            {isOpen && (
                <div className="flex-grow flex flex-col min-h-0">
                    <div className="flex items-center gap-1 p-2 border-b border-gray-800/50 bg-gray-900">
                        {tabs.map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === tab ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
                                title={tab}
                            >
                                {TAB_CONFIG[tab].label}
                            </button>
                        ))}
                    </div>
                    <div className="flex-grow bg-gray-900 min-h-0 overflow-y-auto">
                        <PositionsTable
                            positions={positionsToDisplay}
                            onModify={onModifyPosition}
                            onClose={onClosePosition}
                            onCancel={onCancelOrder}
                            onReverse={onReversePosition}
                            statusFilter={statusFilter}
                        />
                    </div>
                </div>
            )}
        </div>
    )
};

export default BottomPanel;

