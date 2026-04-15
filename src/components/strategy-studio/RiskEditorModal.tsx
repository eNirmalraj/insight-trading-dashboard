// src/components/strategy-studio/RiskEditorModal.tsx
// Edits the risk_settings JSON on a watchlist_strategies assignment.
//
// Three supported modes (matches backend/server/src/engine/riskCalculator.ts):
//   - candle:  SL at entry candle low/high + optional R:R ratio for TP
//   - percent: SL and TP as percentages of entry price
//   - fixed:   SL and TP as fixed price distances from entry
//
// Also supports lot size and leverage which are passed through to the broker.

import React, { useState, useEffect } from 'react';

export type RiskMode = 'candle' | 'percent' | 'fixed';

export interface RiskSettings {
    mode?: RiskMode;
    rrRatio?: number;        // candle mode: reward:risk ratio (e.g. 2 = 1:2)
    slPercent?: number;      // percent mode: e.g. 0.02 = 2%
    tpPercent?: number;
    slDistance?: number;     // fixed mode: absolute price units
    tpDistance?: number;
    lotSize?: number;
    leverage?: number;
}

interface RiskEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    assignmentLabel: string;             // e.g. "SMA Trend — 1H — Test 2"
    initialSettings: RiskSettings;
    onSave: (settings: RiskSettings) => void | Promise<void>;
}

const DEFAULT: Required<Pick<RiskSettings, 'mode' | 'rrRatio' | 'slPercent' | 'tpPercent' | 'slDistance' | 'tpDistance'>> = {
    mode: 'candle',
    rrRatio: 2,
    slPercent: 0.02,
    tpPercent: 0.04,
    slDistance: 100,
    tpDistance: 200,
};

export const RiskEditorModal: React.FC<RiskEditorModalProps> = ({
    isOpen,
    onClose,
    assignmentLabel,
    initialSettings,
    onSave,
}) => {
    const [mode, setMode] = useState<RiskMode>(initialSettings.mode || DEFAULT.mode);
    const [rrRatio, setRrRatio] = useState<number>(initialSettings.rrRatio ?? DEFAULT.rrRatio);
    const [slPercent, setSlPercent] = useState<number>(initialSettings.slPercent ?? DEFAULT.slPercent);
    const [tpPercent, setTpPercent] = useState<number>(initialSettings.tpPercent ?? DEFAULT.tpPercent);
    const [slDistance, setSlDistance] = useState<number>(initialSettings.slDistance ?? DEFAULT.slDistance);
    const [tpDistance, setTpDistance] = useState<number>(initialSettings.tpDistance ?? DEFAULT.tpDistance);
    const [lotSize, setLotSize] = useState<number | ''>(initialSettings.lotSize ?? '');
    const [leverage, setLeverage] = useState<number | ''>(initialSettings.leverage ?? '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Re-seed state when a different assignment is opened
    useEffect(() => {
        if (!isOpen) return;
        setMode(initialSettings.mode || DEFAULT.mode);
        setRrRatio(initialSettings.rrRatio ?? DEFAULT.rrRatio);
        setSlPercent(initialSettings.slPercent ?? DEFAULT.slPercent);
        setTpPercent(initialSettings.tpPercent ?? DEFAULT.tpPercent);
        setSlDistance(initialSettings.slDistance ?? DEFAULT.slDistance);
        setTpDistance(initialSettings.tpDistance ?? DEFAULT.tpDistance);
        setLotSize(initialSettings.lotSize ?? '');
        setLeverage(initialSettings.leverage ?? '');
        setError(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, initialSettings]);

    if (!isOpen) return null;

    const handleSave = async () => {
        setSaving(true);
        setError(null);

        const payload: RiskSettings = { mode };
        if (mode === 'candle') {
            payload.rrRatio = rrRatio;
        } else if (mode === 'percent') {
            payload.slPercent = slPercent;
            payload.tpPercent = tpPercent;
        } else if (mode === 'fixed') {
            payload.slDistance = slDistance;
            payload.tpDistance = tpDistance;
        }
        if (lotSize !== '' && !Number.isNaN(Number(lotSize))) payload.lotSize = Number(lotSize);
        if (leverage !== '' && !Number.isNaN(Number(leverage))) payload.leverage = Number(leverage);

        try {
            await onSave(payload);
            onClose();
        } catch (err: any) {
            setError(err?.message || String(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-[#18181b] border border-white/10 rounded-lg w-[560px] max-h-[85vh] overflow-y-auto p-6 shadow-2xl">
                <h3 className="text-lg font-medium text-white mb-1">Risk Settings</h3>
                <p className="text-sm text-gray-400 mb-5">{assignmentLabel}</p>

                {error && (
                    <div className="mb-4 px-3 py-2 rounded bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
                        ⚠ {error}
                    </div>
                )}

                {/* Mode selector */}
                <div className="mb-5">
                    <label className="block text-xs text-gray-300 uppercase tracking-wide mb-2">
                        Risk Mode
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                        {(['candle', 'percent', 'fixed'] as RiskMode[]).map((m) => (
                            <button
                                type="button"
                                key={m}
                                onClick={() => setMode(m)}
                                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors border ${
                                    mode === m
                                        ? 'bg-purple-600 border-purple-500 text-white'
                                        : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                                }`}
                            >
                                {m === 'candle' && 'Candle'}
                                {m === 'percent' && 'Percent'}
                                {m === 'fixed' && 'Fixed'}
                            </button>
                        ))}
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                        {mode === 'candle' &&
                            'SL sits just below the entry candle low (BUY) or above the high (SELL). TP is computed from the R:R ratio.'}
                        {mode === 'percent' &&
                            'SL and TP are percentages of the entry price. E.g. 0.02 = 2%.'}
                        {mode === 'fixed' &&
                            'SL and TP are fixed price distances from entry (in quote currency).'}
                    </p>
                </div>

                {/* Mode-specific fields */}
                {mode === 'candle' && (
                    <div className="mb-5">
                        <label
                            htmlFor="rr-ratio"
                            className="block text-xs text-gray-300 uppercase tracking-wide mb-1"
                        >
                            Risk:Reward Ratio
                        </label>
                        <input
                            id="rr-ratio"
                            type="number"
                            min={0.1}
                            step={0.1}
                            value={rrRatio}
                            onChange={(e) => setRrRatio(Number(e.target.value))}
                            className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-purple-500"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            TP distance = SL distance × {rrRatio || 0}
                        </p>
                    </div>
                )}

                {mode === 'percent' && (
                    <div className="grid grid-cols-2 gap-3 mb-5">
                        <div>
                            <label
                                htmlFor="sl-pct"
                                className="block text-xs text-gray-300 uppercase tracking-wide mb-1"
                            >
                                Stop Loss %
                            </label>
                            <input
                                id="sl-pct"
                                type="number"
                                min={0}
                                step={0.001}
                                value={slPercent}
                                onChange={(e) => setSlPercent(Number(e.target.value))}
                                className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-purple-500"
                            />
                            <p className="mt-1 text-xs text-gray-500">{(slPercent * 100).toFixed(2)}%</p>
                        </div>
                        <div>
                            <label
                                htmlFor="tp-pct"
                                className="block text-xs text-gray-300 uppercase tracking-wide mb-1"
                            >
                                Take Profit %
                            </label>
                            <input
                                id="tp-pct"
                                type="number"
                                min={0}
                                step={0.001}
                                value={tpPercent}
                                onChange={(e) => setTpPercent(Number(e.target.value))}
                                className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-purple-500"
                            />
                            <p className="mt-1 text-xs text-gray-500">{(tpPercent * 100).toFixed(2)}%</p>
                        </div>
                    </div>
                )}

                {mode === 'fixed' && (
                    <div className="grid grid-cols-2 gap-3 mb-5">
                        <div>
                            <label
                                htmlFor="sl-dist"
                                className="block text-xs text-gray-300 uppercase tracking-wide mb-1"
                            >
                                SL Distance
                            </label>
                            <input
                                id="sl-dist"
                                type="number"
                                min={0}
                                step="any"
                                value={slDistance}
                                onChange={(e) => setSlDistance(Number(e.target.value))}
                                className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-purple-500"
                            />
                        </div>
                        <div>
                            <label
                                htmlFor="tp-dist"
                                className="block text-xs text-gray-300 uppercase tracking-wide mb-1"
                            >
                                TP Distance
                            </label>
                            <input
                                id="tp-dist"
                                type="number"
                                min={0}
                                step="any"
                                value={tpDistance}
                                onChange={(e) => setTpDistance(Number(e.target.value))}
                                className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-purple-500"
                            />
                        </div>
                    </div>
                )}

                {/* Position sizing (applies to all modes) */}
                <div className="mb-5 pt-4 border-t border-white/10">
                    <p className="text-xs text-gray-300 uppercase tracking-wide mb-2">Position Sizing</p>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label
                                htmlFor="lot-size"
                                className="block text-xs text-gray-400 mb-1"
                            >
                                Lot Size
                            </label>
                            <input
                                id="lot-size"
                                type="number"
                                min={0}
                                step="any"
                                placeholder="default"
                                value={lotSize}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    setLotSize(v === '' ? '' : Number(v));
                                }}
                                className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-purple-500"
                            />
                        </div>
                        <div>
                            <label
                                htmlFor="leverage"
                                className="block text-xs text-gray-400 mb-1"
                            >
                                Leverage
                            </label>
                            <input
                                id="leverage"
                                type="number"
                                min={1}
                                step={1}
                                placeholder="default"
                                value={leverage}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    setLeverage(v === '' ? '' : Number(v));
                                }}
                                className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-purple-500"
                            />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="px-4 py-2 rounded-md bg-white/5 text-gray-300 hover:bg-white/10 transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="px-4 py-2 rounded-md bg-purple-600 text-white hover:bg-purple-500 transition-colors disabled:opacity-50"
                    >
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
};
