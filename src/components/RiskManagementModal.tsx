import React, { useState, useEffect } from 'react';
import { WatchlistItem, AccountType } from '../types';
import { CloseIcon, RiskIcon } from './IconComponents';
import {
    calculateForexLotSize,
    calculateForexRiskPercent,
    calculateCryptoPositionSize,
    calculateCryptoRiskPercent
} from '../utils/riskCalculator';

interface RiskManagementModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: WatchlistItem;
    accountType: AccountType;
    onSave: (itemId: string, settings: Partial<WatchlistItem>) => Promise<void>;
}

export const RiskManagementModal: React.FC<RiskManagementModalProps> = ({
    isOpen,
    onClose,
    item,
    accountType,
    onSave
}) => {
    const [lotSize, setLotSize] = useState(item.lot_size || 0.01);
    const [riskPercent, setRiskPercent] = useState(item.risk_percent || 1.0);
    const [tpDistance, setTpDistance] = useState(item.take_profit_distance || 0);
    const [slDistance, setSlDistance] = useState(item.stop_loss_distance || 0);
    const [tslDistance, setTslDistance] = useState(item.trailing_stop_loss_distance || 0);
    const [leverage, setLeverage] = useState(item.leverage || 1);
    const [isSaving, setIsSaving] = useState(false);

    // Constants (could be fetched from user profile settings in future)
    const ACCOUNT_BALANCE = 10000;

    const isForex = accountType === AccountType.FOREX;
    const isCrypto = accountType === AccountType.CRYPTO;

    // Sync calculations
    const handleLotSizeChange = (val: number) => {
        setLotSize(val);
        if (isForex && slDistance > 0) {
            const calculatedRisk = calculateForexRiskPercent(ACCOUNT_BALANCE, val, slDistance);
            setRiskPercent(calculatedRisk);
        } else if (isCrypto && item.price > 0 && slDistance > 0) {
            const slPrice = item.price - (slDistance * (item.isPositive ? 1 : -1)); // Simple approximation
            const calculatedRisk = calculateCryptoRiskPercent(ACCOUNT_BALANCE, val, item.price, slPrice);
            setRiskPercent(calculatedRisk);
        }
    };

    const handleRiskPercentChange = (val: number) => {
        setRiskPercent(val);
        if (isForex && slDistance > 0) {
            const calculatedLot = calculateForexLotSize(ACCOUNT_BALANCE, val, slDistance);
            setLotSize(calculatedLot);
        } else if (isCrypto && item.price > 0 && slDistance > 0) {
            const slPrice = item.price - (slDistance * (item.isPositive ? 1 : -1));
            const calculatedQty = calculateCryptoPositionSize(ACCOUNT_BALANCE, val, leverage, item.price, slPrice);
            setLotSize(calculatedQty);
        }
    };

    const handleSlDistanceChange = (val: number) => {
        setSlDistance(val);
        // Recalculate lot size based on risk % and new SL
        if (isForex) {
            const calculatedLot = calculateForexLotSize(ACCOUNT_BALANCE, riskPercent, val);
            setLotSize(calculatedLot);
        } else if (isCrypto && item.price > 0) {
            const slPrice = item.price - (val * (item.isPositive ? 1 : -1));
            const calculatedQty = calculateCryptoPositionSize(ACCOUNT_BALANCE, riskPercent, leverage, item.price, slPrice);
            setLotSize(calculatedQty);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await onSave(item.id, {
                lot_size: lotSize,
                risk_percent: riskPercent,
                take_profit_distance: tpDistance,
                stop_loss_distance: slDistance,
                trailing_stop_loss_distance: tslDistance,
                leverage: leverage
            });
            onClose();
        } catch (error) {
            alert('Failed to save risk settings');
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-[#1a1b1e] border border-gray-800 rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900/50">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-blue-500/10 rounded-lg">
                            <RiskIcon className="w-5 h-5 text-blue-500" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-100">Risk Management</h3>
                            <p className="text-xs text-gray-400">{item.symbol} • {accountType}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-gray-800 rounded-lg transition-colors">
                        <CloseIcon className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6">
                    {/* Main Risk Toggle */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                                {isForex ? 'Lot Size' : 'Quantity'}
                            </label>
                            <input
                                type="number"
                                value={lotSize}
                                onChange={(e) => handleLotSizeChange(parseFloat(e.target.value))}
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                                step={isForex ? "0.01" : "0.0001"}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Risk %</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    value={riskPercent}
                                    onChange={(e) => handleRiskPercentChange(parseFloat(e.target.value))}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-right pr-8"
                                    step="0.1"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">%</span>
                            </div>
                        </div>
                    </div>

                    {isCrypto && (
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Leverage</label>
                            <div className="flex items-center gap-4">
                                <input
                                    type="range"
                                    min="1"
                                    max="125"
                                    value={leverage}
                                    onChange={(e) => setLeverage(parseInt(e.target.value))}
                                    className="flex-1 accent-blue-500 h-1.5 bg-gray-700 rounded-lg cursor-pointer"
                                />
                                <span className="text-sm font-mono text-blue-400 w-12 text-right">{leverage}x</span>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 pt-2">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                                Stop Loss {isForex ? '(Pips)' : '(Points)'}
                            </label>
                            <input
                                type="number"
                                value={slDistance}
                                onChange={(e) => handleSlDistanceChange(parseFloat(e.target.value))}
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500/30 transition-all"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                                Take Profit {isForex ? '(Pips)' : '(Points)'}
                            </label>
                            <input
                                type="number"
                                value={tpDistance}
                                onChange={(e) => setTpDistance(parseFloat(e.target.value))}
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500/30 transition-all"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Trailing SL (Distance)</label>
                        <input
                            type="number"
                            value={tslDistance}
                            onChange={(e) => setTslDistance(parseFloat(e.target.value))}
                            placeholder="0 = Disabled"
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-yellow-500/30 transition-all"
                        />
                    </div>

                    <div className="p-3 bg-blue-500/5 rounded-lg border border-blue-500/10">
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                            <span>Account Equity</span>
                            <span className="text-gray-200">${ACCOUNT_BALANCE.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-400">
                            <span>Estimated Risk</span>
                            <span className="text-red-400">-${(ACCOUNT_BALANCE * (riskPercent / 100)).toFixed(2)}</span>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-800 bg-gray-900/50 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg font-medium transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium shadow-lg shadow-blue-900/20 transition-all disabled:opacity-50"
                    >
                        {isSaving ? 'Saving...' : 'Save Settings'}
                    </button>
                </div>
            </div>
        </div>
    );
};
