

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Position, PositionStatus, TradeDirection } from '../types';
import { PositionMonitoringIcon } from '../components/IconComponents';
import * as api from '../api';
import Loader from '../components/Loader';

type AccountType = 'Forex' | 'Binance';

interface PositionRowProps {
    position: Position;
    onModify: (positionId: string, newValues: { sl: number; tp: number }) => void;
    onClose: (positionId: string, closingPrice: number) => void;
    onCancel: (positionId: string) => void;
    onReverse: (positionId: string, closingPrice: number) => void;
}

const PositionRow: React.FC<PositionRowProps> = ({ position, onModify, onClose, onCancel, onReverse }) => {
    const [currentPrice, setCurrentPrice] = useState(position.entryPrice);
    const [editableSl, setEditableSl] = useState(position.stopLoss.toString());
    const [editableTp, setEditableTp] = useState(position.takeProfit.toString());

    useEffect(() => {
        setEditableSl(position.stopLoss.toString());
        setEditableTp(position.takeProfit.toString());
    }, [position.stopLoss, position.takeProfit]);

    const isModified = position.stopLoss.toString() !== editableSl || position.takeProfit.toString() !== editableTp;

    useEffect(() => {
        if (position.status !== PositionStatus.OPEN) {
            setCurrentPrice(position.entryPrice);
            return;
        }

        const interval = setInterval(() => {
            setCurrentPrice(prevPrice => {
                const fluctuation = (Math.random() - 0.5) * 0.0005;
                const newPrice = prevPrice * (1 + fluctuation);
                return newPrice;
            });
        }, 2500);

        return () => clearInterval(interval);
    }, [position.status, position.entryPrice]);

    const pnl = React.useMemo(() => {
        if (position.status !== PositionStatus.OPEN) {
            return position.pnl;
        }

        const contractSize = position.account === 'Forex' ? 100000 : 1;
        const priceDifference = currentPrice - position.entryPrice;

        if (position.direction === TradeDirection.BUY) {
            return priceDifference * position.quantity * contractSize;
        } else {
            return -priceDifference * position.quantity * contractSize;
        }
    }, [currentPrice, position]);

    const handleUpdate = () => {
        const newSl = parseFloat(editableSl);
        const newTp = parseFloat(editableTp);
        if (!isNaN(newSl) && !isNaN(newTp)) {
            onModify(position.id, { sl: newSl, tp: newTp });
        } else {
            alert("Invalid Stop Loss or Take Profit value.");
        }
    };


    const pnlColor = pnl >= 0 ? 'text-green-400' : 'text-red-400';
    const directionColor = position.direction === TradeDirection.BUY ? 'text-green-400' : 'text-red-400';
    const isEditable = position.status === PositionStatus.OPEN || position.status === PositionStatus.PENDING;

    return (
        <tr className="border-b border-gray-700 last:border-b-0 hover:bg-gray-700/50 text-sm">
            <td className="px-4 py-3 font-medium text-white">{position.symbol}</td>
            <td className={`px-4 py-3 font-medium ${directionColor}`}>{position.direction}</td>
            <td className="px-4 py-3">{position.quantity}</td>
            <td className="px-4 py-3">{position.entryPrice}</td>
            <td className="px-4 py-3">
                {isEditable ? (
                    <input
                        type="number"
                        value={editableSl}
                        onChange={(e) => setEditableSl(e.target.value)}
                        className="w-24 bg-gray-900/50 border border-gray-600 rounded-md p-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                ) : (
                    position.stopLoss
                )}
            </td>
            <td className="px-4 py-3">
                {isEditable ? (
                    <input
                        type="number"
                        value={editableTp}
                        onChange={(e) => setEditableTp(e.target.value)}
                        className="w-24 bg-gray-900/50 border border-gray-600 rounded-md p-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                ) : (
                    position.takeProfit
                )}
            </td>
            <td className={`px-4 py-3 font-semibold ${pnlColor}`}>${pnl.toFixed(2)}</td>
            <td className="px-4 py-3">{new Date(position.openTime).toLocaleString()}</td>
            <td className="px-4 py-3">{position.closeTime ? new Date(position.closeTime).toLocaleString() : 'N/A'}</td>
            <td className="px-4 py-3">
                {position.status === PositionStatus.OPEN && (
                    <div className="flex items-center gap-2">
                        <button onClick={handleUpdate} disabled={!isModified} className="px-3 py-1 text-xs font-semibold rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed">Update</button>
                        <button onClick={() => onReverse(position.id, currentPrice)} className="px-3 py-1 text-xs font-semibold rounded-md bg-yellow-500 text-white hover:bg-yellow-600">Reverse</button>
                        <button onClick={() => onClose(position.id, currentPrice)} className="px-3 py-1 text-xs font-semibold rounded-md bg-red-500 text-white hover:bg-red-600">Close</button>
                    </div>
                )}
                {position.status === PositionStatus.PENDING && (
                    <div className="flex items-center gap-2">
                        <button onClick={handleUpdate} disabled={!isModified} className="px-3 py-1 text-xs font-semibold rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed">Update</button>
                        <button onClick={() => onCancel(position.id)} className="px-3 py-1 text-xs font-semibold rounded-md bg-yellow-500 text-white hover:bg-yellow-600">Cancel</button>
                    </div>
                )}
            </td>
        </tr>
    );
};

const PositionMonitoring: React.FC = () => {
    const [positions, setPositions] = useState<Position[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeAccount, setActiveAccount] = useState<AccountType>('Forex');
    const [activeStatus, setActiveStatus] = useState<PositionStatus>(PositionStatus.OPEN);

    const fetchPositions = useCallback(async () => {
        try {
            setIsLoading(true);
            const data = await api.getPositions();
            setPositions(data);
            setError(null);
        } catch (err) {
            setError("Failed to load positions.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPositions();
    }, [fetchPositions]);

    const handleModifyPosition = async (positionId: string, newValues: { sl: number; tp: number }) => {
        await api.updatePosition(positionId, newValues);
        fetchPositions();
    };

    const handleClosePosition = async (positionId: string, closingPrice: number) => {
        await api.closePosition(positionId, closingPrice);
        fetchPositions();
    };

    const handleCancelOrder = async (positionId: string) => {
        await api.cancelPosition(positionId);
        fetchPositions();
    };

    const handleReversePosition = async (positionId: string, closingPrice: number) => {
        await api.reversePosition(positionId, closingPrice);
        fetchPositions();
    };

    const filteredPositions = positions.filter(p => p.account === activeAccount && p.status === activeStatus);

    const accountTabs: { name: AccountType, label: string }[] = [
        { name: 'Forex', label: 'Forex Positions (MT5)' },
        { name: 'Binance', label: 'Binance Positions' },
    ];

    const statusTabs: { name: PositionStatus, label: string }[] = [
        { name: PositionStatus.OPEN, label: 'Open' },
        { name: PositionStatus.PENDING, label: 'Pending' },
        { name: PositionStatus.CLOSED, label: 'History' },
    ];

    const renderContent = () => {
        if (isLoading) return <Loader />;
        if (error) return <div className="text-center py-16 text-red-400">{error}</div>;
        if (filteredPositions.length === 0) {
            return (
                <div className="text-center py-16 px-6">
                    <PositionMonitoringIcon className="w-12 h-12 mx-auto text-gray-600" />
                    <h3 className="mt-4 text-lg font-semibold text-white">No Positions Found</h3>
                    <p className="mt-2 text-sm text-gray-400">
                        There are no {activeStatus.toLowerCase()} positions for the {activeAccount} account.
                    </p>
                </div>
            );
        }

        return (
            <>
                {/* Desktop Table */}
                <div className="overflow-x-auto hidden md:block">
                    <table className="w-full text-left min-w-[1024px]">
                        <thead className="bg-card-bg/50 text-xs text-gray-400 uppercase">
                            <tr>
                                <th className="px-4 py-2">Symbol</th>
                                <th className="px-4 py-2">Side</th>
                                <th className="px-4 py-2">Quantity</th>
                                <th className="px-4 py-2">Entry</th>
                                <th className="px-4 py-2">SL</th>
                                <th className="px-4 py-2">TP</th>
                                <th className="px-4 py-2">P/L</th>
                                <th className="px-4 py-2">Open Time</th>
                                <th className="px-4 py-2">Close Time</th>
                                <th className="px-4 py-2">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredPositions.map(pos => <PositionRow key={pos.id} position={pos} onModify={handleModifyPosition} onClose={handleClosePosition} onCancel={handleCancelOrder} onReverse={handleReversePosition} />)}
                        </tbody>
                    </table>
                </div>
                {/* Mobile Cards */}
                <div className="md:hidden p-4 space-y-4">
                    {filteredPositions.map(pos => (
                        <PositionCard key={pos.id} position={pos} onModify={handleModifyPosition} onClose={handleClosePosition} onCancel={handleCancelOrder} onReverse={handleReversePosition} />
                    ))}
                </div>
            </>
        )
    }

    return (
        <div className="space-y-6 p-6">
            <div className="bg-card-bg rounded-xl">
                <div className="border-b border-gray-700">
                    <nav className="flex flex-wrap gap-2 p-4" aria-label="Tabs">
                        {accountTabs.map((tab) => (
                            <button
                                key={tab.name}
                                onClick={() => setActiveAccount(tab.name)}
                                className={`px-4 py-2 font-medium text-sm rounded-md transition-colors ${activeAccount === tab.name ? 'bg-blue-500 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>
                <div className="p-4 border-b border-gray-700">
                    <nav className="flex flex-wrap gap-2" aria-label="Tabs">
                        {statusTabs.map((tab) => (
                            <button
                                key={tab.name}
                                onClick={() => setActiveStatus(tab.name)}
                                className={`px-3 py-1 font-medium text-xs rounded-full transition-colors ${activeStatus === tab.name ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-600'}`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>
                {renderContent()}
            </div>
        </div>
    );
};


const PositionCard: React.FC<PositionRowProps> = ({ position, onModify, onClose, onCancel, onReverse }) => {
    // This component contains the same logic as PositionRow but formatted as a card
    const [currentPrice, setCurrentPrice] = useState(position.entryPrice);
    const [editableSl, setEditableSl] = useState(position.stopLoss.toString());
    const [editableTp, setEditableTp] = useState(position.takeProfit.toString());

    useEffect(() => {
        setEditableSl(position.stopLoss.toString());
        setEditableTp(position.takeProfit.toString());
    }, [position.stopLoss, position.takeProfit]);

    const isModified = position.stopLoss.toString() !== editableSl || position.takeProfit.toString() !== editableTp;

    useEffect(() => {
        if (position.status !== PositionStatus.OPEN) {
            setCurrentPrice(position.entryPrice);
            return;
        }
        const interval = setInterval(() => {
            setCurrentPrice(prevPrice => prevPrice * (1 + (Math.random() - 0.5) * 0.0005));
        }, 2500);
        return () => clearInterval(interval);
    }, [position.status, position.entryPrice]);

    const pnl = useMemo(() => {
        if (position.status !== PositionStatus.OPEN) return position.pnl;
        const contractSize = position.account === 'Forex' ? 100000 : 1;
        const priceDifference = currentPrice - position.entryPrice;
        return position.direction === TradeDirection.BUY ? priceDifference * position.quantity * contractSize : -priceDifference * position.quantity * contractSize;
    }, [currentPrice, position]);

    const handleUpdate = () => {
        const newSl = parseFloat(editableSl);
        const newTp = parseFloat(editableTp);
        if (!isNaN(newSl) && !isNaN(newTp)) onModify(position.id, { sl: newSl, tp: newTp });
    };

    const pnlColor = pnl >= 0 ? 'text-green-400' : 'text-red-400';
    const directionColor = position.direction === TradeDirection.BUY ? 'text-green-400' : 'text-red-400';
    const isEditable = position.status === PositionStatus.OPEN || position.status === PositionStatus.PENDING;

    return (
        <div className="bg-gray-800 p-4 rounded-lg space-y-3 text-sm">
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="font-bold text-white">{position.symbol}</h3>
                    <span className="text-xs text-gray-400">Qty: {position.quantity}</span>
                </div>
                <div className="text-right">
                    <span className={`font-bold ${directionColor}`}>{position.direction}</span>
                    <p className={`font-semibold ${pnlColor}`}>${pnl.toFixed(2)}</p>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div className="flex justify-between"><span className="text-gray-400">Entry</span><span>{position.entryPrice}</span></div>
            </div>
            {isEditable && (
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs text-gray-400">Stop Loss</label>
                        <input type="number" value={editableSl} onChange={e => setEditableSl(e.target.value)} className="w-full bg-gray-900/50 border border-gray-600 rounded-md p-1.5 mt-1 text-sm text-white" />
                    </div>
                    <div>
                        <label className="text-xs text-gray-400">Take Profit</label>
                        <input type="number" value={editableTp} onChange={e => setEditableTp(e.target.value)} className="w-full bg-gray-900/50 border border-gray-600 rounded-md p-1.5 mt-1 text-sm text-white" />
                    </div>
                </div>
            )}
            <div className="flex justify-end items-center gap-2 pt-2 border-t border-gray-700">
                {position.status === PositionStatus.OPEN && (
                    <>
                        <button onClick={handleUpdate} disabled={!isModified} className="px-3 py-1 text-xs font-semibold rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-600">Update</button>
                        <button onClick={() => onReverse(position.id, currentPrice)} className="px-3 py-1 text-xs font-semibold rounded-md bg-yellow-500 text-white hover:bg-yellow-600">Reverse</button>
                        <button onClick={() => onClose(position.id, currentPrice)} className="px-3 py-1 text-xs font-semibold rounded-md bg-red-500 text-white hover:bg-red-600">Close</button>
                    </>
                )}
                {position.status === PositionStatus.PENDING && (
                    <>
                        <button onClick={handleUpdate} disabled={!isModified} className="px-3 py-1 text-xs font-semibold rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-600">Update</button>
                        <button onClick={() => onCancel(position.id)} className="px-3 py-1 text-xs font-semibold rounded-md bg-yellow-500 text-white hover:bg-yellow-600">Cancel</button>
                    </>
                )}
                {position.status === PositionStatus.CLOSED && (
                    <p className="text-xs text-gray-500">Closed on {position.closeTime ? new Date(position.closeTime).toLocaleDateString() : ''}</p>
                )}
            </div>
        </div>
    );
};


export default PositionMonitoring;
