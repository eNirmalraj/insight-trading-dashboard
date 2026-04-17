import React, { useState, useEffect } from 'react';
import { CloseIcon } from './IconComponents';
import { Watchlist } from '../types';
import { STRATEGY_REGISTRY } from '../strategies';
import { ParamEditorModal } from './strategy-studio/ParamEditorModal';
import { RiskEditorModal, RiskSettings } from './strategy-studio/RiskEditorModal';
import {
    getWatchlistStrategies,
    addWatchlistStrategy,
    updateWatchlistStrategyParams,
    updateWatchlistStrategyRiskSettings,
    removeWatchlistStrategy,
    WatchlistStrategyAssignment,
} from '../services/watchlistService';

interface StrategyRow {
    id: string;
    name: string;
    isBuiltIn: boolean;
    paramSchema: import('../strategies').ParamDef[];
}

interface AssignStrategiesModalProps {
    watchlists: Watchlist[];
    onClose: () => void;
}

type Step = 'assigned' | 'pick' | 'configure';

const AVAILABLE_TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1H', '4H', '1D', '1W'];

const AssignStrategiesModal: React.FC<AssignStrategiesModalProps> = ({
    watchlists,
    onClose,
}) => {
    const [step, setStep] = useState<Step>('assigned');
    const [availableStrategies, setAvailableStrategies] = useState<StrategyRow[]>([]);
    const [assignments, setAssignments] = useState<WatchlistStrategyAssignment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Configure step state
    const [selectedStrategy, setSelectedStrategy] = useState<StrategyRow | null>(null);
    const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>(['1H']);
    const [selectedWatchlistId, setSelectedWatchlistId] = useState<string>(watchlists[0]?.id || '');
    const [configParams, setConfigParams] = useState<Record<string, any>>({});
    const [showParamEditor, setShowParamEditor] = useState(false);

    // Edit/Risk state
    const [pendingEdit, setPendingEdit] = useState<{
        assignment: WatchlistStrategyAssignment;
        strategy: StrategyRow;
    } | null>(null);
    const [pendingRisk, setPendingRisk] = useState<{
        assignment: WatchlistStrategyAssignment;
        strategy: StrategyRow;
    } | null>(null);

    // Load strategies and ALL assignments across all watchlists
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const { getStrategies } = await import('../services/strategyService');
                const dbStrategies = await getStrategies();
                const rows: StrategyRow[] = dbStrategies
                    .filter((s: any) => s.type === 'STRATEGY')
                    .map((s: any) => {
                        const meta = STRATEGY_REGISTRY.find((r) => r.name === s.name);
                        return {
                            id: s.id,
                            name: s.name,
                            isBuiltIn: !!meta,
                            paramSchema: meta?.paramSchema || [],
                        };
                    });
                if (cancelled) return;
                setAvailableStrategies(rows);

                // Load assignments from all watchlists
                const allAssignments: WatchlistStrategyAssignment[] = [];
                for (const wl of watchlists) {
                    const existing = await getWatchlistStrategies(wl.id);
                    allAssignments.push(...existing);
                }
                if (cancelled) return;
                setAssignments(allAssignments);
            } catch (err) {
                console.error('[AssignStrategiesModal] load failed:', err);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [watchlists]);

    // --- Handlers ---

    const handlePickStrategy = (strat: StrategyRow) => {
        setSelectedStrategy(strat);
        setSelectedTimeframes(['1H']);
        setSelectedWatchlistId(watchlists[0]?.id || '');
        setConfigParams({});
        setStep('configure');
    };

    const toggleTimeframe = (tf: string) => {
        setSelectedTimeframes((prev) =>
            prev.includes(tf) ? prev.filter((t) => t !== tf) : [...prev, tf]
        );
    };

    const handleConfirmAssign = async () => {
        if (!selectedStrategy || selectedTimeframes.length === 0 || !selectedWatchlistId) return;

        // If strategy has params and user hasn't set them yet, open param editor
        if (selectedStrategy.paramSchema.length > 0 && Object.keys(configParams).length === 0) {
            setShowParamEditor(true);
            return;
        }

        setErrorMessage(null);
        for (const tf of selectedTimeframes) {
            try {
                const newId = await addWatchlistStrategy(
                    selectedWatchlistId,
                    selectedStrategy.id,
                    configParams,
                    tf,
                    {}
                );
                const newAssignment: WatchlistStrategyAssignment = {
                    id: newId,
                    watchlistId: selectedWatchlistId,
                    strategyId: selectedStrategy.id,
                    params: configParams,
                    timeframe: tf,
                    riskSettings: {},
                    lastError: null,
                    lastErrorAt: null,
                };
                setAssignments((prev) => [...prev, newAssignment]);
            } catch (err: any) {
                setErrorMessage(`Failed (${tf}): ${err?.message || String(err)}`);
            }
        }
        setStep('assigned');
    };

    const handleParamSave = (values: Record<string, any>) => {
        setConfigParams(values);
        setShowParamEditor(false);
    };

    const handleEditClick = (a: WatchlistStrategyAssignment) => {
        const strat = availableStrategies.find((s) => s.id === a.strategyId);
        if (!strat) return;
        setPendingEdit({ assignment: a, strategy: strat });
    };

    const updateAssignment = async (a: WatchlistStrategyAssignment, params: Record<string, any>) => {
        try {
            await updateWatchlistStrategyParams(a.id, params);
            setAssignments((prev) => prev.map((x) => (x.id === a.id ? { ...x, params } : x)));
        } catch (err: any) {
            setErrorMessage(`Update failed: ${err?.message || String(err)}`);
        }
    };

    const handleRemove = async (a: WatchlistStrategyAssignment) => {
        try {
            await removeWatchlistStrategy(a.id);
            setAssignments((prev) => prev.filter((x) => x.id !== a.id));
        } catch (err: any) {
            setErrorMessage(`Remove failed: ${err?.message || String(err)}`);
        }
    };

    const handleRiskClick = (a: WatchlistStrategyAssignment) => {
        const strat = availableStrategies.find((s) => s.id === a.strategyId);
        if (!strat) return;
        setPendingRisk({ assignment: a, strategy: strat });
    };

    const updateRiskSettings = async (a: WatchlistStrategyAssignment, rs: RiskSettings) => {
        try {
            await updateWatchlistStrategyRiskSettings(a.id, rs);
            setAssignments((prev) => prev.map((x) => (x.id === a.id ? { ...x, riskSettings: rs } : x)));
        } catch (err: any) {
            setErrorMessage(`Risk update failed: ${err?.message || String(err)}`);
            throw err;
        }
    };

    const getWatchlistName = (wlId: string) => watchlists.find((w) => w.id === wlId)?.name || 'Unknown';

    // --- Render ---

    return (
        <>
            <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
                <div className="bg-gray-800 rounded-xl w-full max-w-lg border border-gray-700 shadow-2xl">
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
                        <div className="flex items-center gap-3">
                            {step !== 'assigned' && (
                                <button
                                    type="button"
                                    onClick={() => setStep(step === 'configure' ? 'pick' : 'assigned')}
                                    className="p-1 rounded-lg hover:bg-gray-700 text-gray-400"
                                    aria-label="Go back"
                                    title="Go back"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                </button>
                            )}
                            <h3 className="text-lg font-bold text-white">
                                {step === 'assigned' && 'Assigned Strategies'}
                                {step === 'pick' && 'Select Strategy'}
                                {step === 'configure' && 'Configure'}
                            </h3>
                        </div>
                        <button
                            onClick={onClose}
                            title="Close"
                            aria-label="Close"
                            className="p-1.5 rounded-lg hover:bg-gray-700 transition-colors"
                        >
                            <CloseIcon className="w-5 h-5 text-gray-400" />
                        </button>
                    </div>

                    {/* Error banner */}
                    {errorMessage && (
                        <div className="mx-6 mt-4 px-4 py-3 rounded bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-start gap-2">
                            <span className="flex-1">{errorMessage}</span>
                            <button type="button" onClick={() => setErrorMessage(null)} className="text-red-200 hover:text-white">x</button>
                        </div>
                    )}

                    {/* Body */}
                    <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
                        {isLoading ? (
                            <div className="text-center py-8 text-gray-400">Loading...</div>
                        ) : step === 'assigned' ? (
                            /* ── STEP 1: Assigned list ── */
                            <>
                                {assignments.length === 0 ? (
                                    <div className="text-center py-8">
                                        <p className="text-gray-400 text-sm mb-4">No strategies assigned yet.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2 mb-4">
                                        {assignments.map((a) => {
                                            const strat = availableStrategies.find((s) => s.id === a.strategyId);
                                            const paramsText =
                                                Object.keys(a.params || {}).length > 0
                                                    ? Object.entries(a.params).map(([k, v]) => `${k}:${v}`).join(' · ')
                                                    : 'defaults';
                                            return (
                                                <div
                                                    key={a.id}
                                                    className="flex items-center gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30"
                                                >
                                                    <span className="text-sm font-medium text-white flex-1 min-w-0">
                                                        <span className="truncate">{strat?.name || 'Unknown'}</span>
                                                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 border border-gray-600">
                                                            {a.timeframe}
                                                        </span>
                                                        <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
                                                            {getWatchlistName(a.watchlistId)}
                                                        </span>
                                                        <span className="ml-2 text-xs text-blue-300">[{paramsText}]</span>
                                                    </span>
                                                    <div className="flex items-center gap-1 flex-shrink-0">
                                                        {strat && strat.paramSchema.length > 0 && (
                                                            <button type="button" onClick={() => handleEditClick(a)} className="text-[10px] px-2 py-1 rounded bg-white/5 text-gray-300 hover:bg-white/10">Params</button>
                                                        )}
                                                        <button type="button" onClick={() => handleRiskClick(a)} className="text-[10px] px-2 py-1 rounded bg-purple-500/10 text-purple-300 hover:bg-purple-500/20">Risk</button>
                                                        <button type="button" onClick={() => handleRemove(a)} className="text-[10px] px-2 py-1 rounded bg-red-500/10 text-red-300 hover:bg-red-500/20">Remove</button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        ) : step === 'pick' ? (
                            /* ── STEP 2: Pick a strategy ── */
                            <>
                                {availableStrategies.length === 0 ? (
                                    <div className="text-center py-8">
                                        <p className="text-gray-400 text-sm">No strategies found.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {availableStrategies.map((strat) => (
                                            <button
                                                key={strat.id}
                                                type="button"
                                                onClick={() => handlePickStrategy(strat)}
                                                className="w-full flex items-center gap-3 p-3 rounded-lg bg-gray-700/30 border border-transparent hover:bg-gray-700/50 hover:border-gray-600 transition-colors text-left"
                                            >
                                                <span className="text-sm font-medium text-white flex-1">
                                                    {strat.name}
                                                    {strat.isBuiltIn && (
                                                        <span className="ml-2 text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">Built-in</span>
                                                    )}
                                                </span>
                                                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : (
                            /* ── STEP 3: Configure (timeframe + watchlist + params) ── */
                            selectedStrategy && (
                                <div className="space-y-5">
                                    {/* Strategy name */}
                                    <div className="text-center">
                                        <p className="text-white font-bold text-base">{selectedStrategy.name}</p>
                                        {selectedStrategy.isBuiltIn && (
                                            <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">Built-in</span>
                                        )}
                                    </div>

                                    {/* Timeframes */}
                                    <div>
                                        <label className="block text-xs text-gray-400 uppercase tracking-wide mb-2">Timeframes</label>
                                        <div className="flex flex-wrap gap-2">
                                            {AVAILABLE_TIMEFRAMES.map((tf) => (
                                                <button
                                                    key={tf}
                                                    type="button"
                                                    onClick={() => toggleTimeframe(tf)}
                                                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                                                        selectedTimeframes.includes(tf)
                                                            ? 'bg-blue-500 border-blue-400 text-white'
                                                            : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:bg-gray-700'
                                                    }`}
                                                >
                                                    {tf}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Watchlist */}
                                    <div>
                                        <label className="block text-xs text-gray-400 uppercase tracking-wide mb-2">Watchlist</label>
                                        <select
                                            value={selectedWatchlistId}
                                            onChange={(e) => setSelectedWatchlistId(e.target.value)}
                                            title="Select watchlist"
                                            aria-label="Select watchlist"
                                            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                            {watchlists.map((wl) => (
                                                <option key={wl.id} value={wl.id}>{wl.name} ({wl.items.length} symbols)</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Params preview */}
                                    {selectedStrategy.paramSchema.length > 0 && (
                                        <div>
                                            <label className="block text-xs text-gray-400 uppercase tracking-wide mb-2">Parameters</label>
                                            <button
                                                type="button"
                                                onClick={() => setShowParamEditor(true)}
                                                className="w-full flex items-center justify-between bg-gray-700/50 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white hover:bg-gray-700 transition-colors"
                                            >
                                                <span>
                                                    {Object.keys(configParams).length > 0
                                                        ? Object.entries(configParams).map(([k, v]) => `${k}: ${v}`).join(', ')
                                                        : 'defaults (click to edit)'}
                                                </span>
                                                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                </svg>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between px-6 py-4 border-t border-gray-700">
                        {step === 'assigned' ? (
                            <>
                                <button
                                    type="button"
                                    onClick={() => setStep('pick')}
                                    className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                                >
                                    + Add Strategy
                                </button>
                                <button
                                    onClick={onClose}
                                    className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-700 transition-colors"
                                >
                                    Done
                                </button>
                            </>
                        ) : step === 'configure' ? (
                            <>
                                <div />
                                <button
                                    type="button"
                                    disabled={selectedTimeframes.length === 0 || !selectedWatchlistId}
                                    onClick={handleConfirmAssign}
                                    className="px-4 py-2 rounded-lg text-sm font-medium bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 transition-colors"
                                >
                                    Assign ({selectedTimeframes.length} TF)
                                </button>
                            </>
                        ) : (
                            <div />
                        )}
                    </div>
                </div>
            </div>

            {/* Param editor for configuring new assignment */}
            {showParamEditor && selectedStrategy && (
                <ParamEditorModal
                    isOpen
                    onClose={() => setShowParamEditor(false)}
                    strategyName={selectedStrategy.name}
                    paramSchema={selectedStrategy.paramSchema}
                    initialValues={configParams}
                    onSave={handleParamSave}
                />
            )}

            {/* Param editor for editing existing assignment */}
            {pendingEdit && (
                <ParamEditorModal
                    isOpen
                    onClose={() => setPendingEdit(null)}
                    strategyName={pendingEdit.strategy.name}
                    paramSchema={pendingEdit.strategy.paramSchema}
                    initialValues={pendingEdit.assignment.params}
                    onSave={(values) => {
                        void updateAssignment(pendingEdit.assignment, values);
                    }}
                />
            )}

            {/* Risk editor */}
            {pendingRisk && (
                <RiskEditorModal
                    isOpen
                    onClose={() => setPendingRisk(null)}
                    assignmentLabel={`${pendingRisk.strategy.name} — ${pendingRisk.assignment.timeframe} — ${getWatchlistName(pendingRisk.assignment.watchlistId)}`}
                    initialSettings={pendingRisk.assignment.riskSettings as RiskSettings}
                    onSave={(settings) => updateRiskSettings(pendingRisk.assignment, settings)}
                />
            )}
        </>
    );
};

export default AssignStrategiesModal;
