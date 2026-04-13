import React, { useState, useEffect } from 'react';
import { CloseIcon } from './IconComponents';
import { Watchlist } from '../types';
import { STRATEGY_REGISTRY, BuiltInStrategyMeta } from '../strategies';
import { ParamEditorModal } from './strategy-studio/ParamEditorModal';
import {
    getWatchlistStrategies,
    addWatchlistStrategy,
    updateWatchlistStrategyParams,
    removeWatchlistStrategy,
    WatchlistStrategyAssignment,
} from '../services/watchlistService';

interface StrategyRow {
    id: string;              // strategy_id (uuid or string for built-ins)
    name: string;
    isBuiltIn: boolean;
    paramSchema: import('../strategies').ParamDef[];
}

interface AssignStrategiesModalProps {
    watchlist: Watchlist;
    onClose: () => void;
    // onSave kept optional for backward compatibility with callers that
    // expect a legacy (watchlistId, strategyIds[]) callback. The new flow
    // persists per-assignment inline via the service functions.
    onSave?: (watchlistId: string, strategyIds: string[]) => void;
}

const AssignStrategiesModal: React.FC<AssignStrategiesModalProps> = ({
    watchlist,
    onClose,
    onSave,
}) => {
    const [availableStrategies, setAvailableStrategies] = useState<StrategyRow[]>([]);
    const [assignments, setAssignments] = useState<WatchlistStrategyAssignment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [pendingAdd, setPendingAdd] = useState<StrategyRow | null>(null);
    const [pendingEdit, setPendingEdit] = useState<{
        assignment: WatchlistStrategyAssignment;
        strategy: StrategyRow;
    } | null>(null);

    // Load built-ins from the frontend registry and existing assignments from DB.
    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            try {
                // Built-in strategies from .kuri registry — map to uuid via the same
                // uuidv5 scheme the backend uses, so strategy_id lines up.
                // For now we don't have the uuidv5 helper on the frontend, so we
                // rely on the scripts table: each built-in has is_builtin=true and
                // the frontend fetches the resolved uuid via getStrategies().
                const { getStrategies } = await import('../services/strategyService');
                const dbStrategies = await getStrategies();

                // Match DB rows to registry entries by NAME to pick up param schema.
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

                const existing = await getWatchlistStrategies(watchlist.id);
                if (cancelled) return;
                setAssignments(existing);
            } catch (err) {
                console.error('[AssignStrategiesModal] load failed:', err);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [watchlist.id]);

    const assignmentsByStrategy = new Map<string, WatchlistStrategyAssignment[]>();
    for (const a of assignments) {
        const list = assignmentsByStrategy.get(a.strategyId) || [];
        list.push(a);
        assignmentsByStrategy.set(a.strategyId, list);
    }

    const handleAddClick = (strat: StrategyRow) => {
        // If there are editable params, open the modal to collect them.
        // Otherwise just create the assignment with empty params immediately.
        if (strat.paramSchema.length > 0) {
            setPendingAdd(strat);
        } else {
            void createAssignment(strat, {});
        }
    };

    const createAssignment = async (strat: StrategyRow, params: Record<string, any>) => {
        try {
            const newId = await addWatchlistStrategy(
                watchlist.id,
                strat.id,
                params,
                '1H',
                {}
            );
            const newAssignment: WatchlistStrategyAssignment = {
                id: newId,
                watchlistId: watchlist.id,
                strategyId: strat.id,
                params,
                timeframe: '1H',
                riskSettings: {},
                lastError: null,
                lastErrorAt: null,
            };
            setAssignments((prev) => [...prev, newAssignment]);
        } catch (err) {
            console.error('[AssignStrategiesModal] add failed:', err);
        }
    };

    const handleEditClick = (assignment: WatchlistStrategyAssignment) => {
        const strat = availableStrategies.find((s) => s.id === assignment.strategyId);
        if (!strat) return;
        setPendingEdit({ assignment, strategy: strat });
    };

    const updateAssignment = async (
        assignment: WatchlistStrategyAssignment,
        params: Record<string, any>
    ) => {
        try {
            await updateWatchlistStrategyParams(assignment.id, params);
            setAssignments((prev) =>
                prev.map((a) => (a.id === assignment.id ? { ...a, params } : a))
            );
        } catch (err) {
            console.error('[AssignStrategiesModal] update failed:', err);
        }
    };

    const handleRemove = async (assignment: WatchlistStrategyAssignment) => {
        try {
            await removeWatchlistStrategy(assignment.id);
            setAssignments((prev) => prev.filter((a) => a.id !== assignment.id));
        } catch (err) {
            console.error('[AssignStrategiesModal] remove failed:', err);
        }
    };

    const handleClose = () => {
        // Notify legacy callers that something changed.
        if (onSave) {
            onSave(
                watchlist.id,
                assignments.map((a) => a.strategyId)
            );
        }
        onClose();
    };

    return (
        <>
            <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
                <div className="bg-gray-800 rounded-xl w-full max-w-lg border border-gray-700 shadow-2xl">
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
                        <div>
                            <h3 className="text-lg font-bold text-white">Assign Strategies</h3>
                            <p className="text-sm text-gray-400 mt-0.5">{watchlist.name}</p>
                        </div>
                        <button
                            onClick={handleClose}
                            title="Close"
                            aria-label="Close"
                            className="p-1.5 rounded-lg hover:bg-gray-700 transition-colors"
                        >
                            <CloseIcon className="w-5 h-5 text-gray-400" />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
                        {isLoading ? (
                            <div className="text-center py-8 text-gray-400">Loading strategies...</div>
                        ) : (
                            <>
                                {/* Current assignments */}
                                {assignments.length > 0 && (
                                    <div className="mb-5">
                                        <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">
                                            Assigned ({assignments.length})
                                        </h4>
                                        <div className="space-y-2">
                                            {assignments.map((a) => {
                                                const strat = availableStrategies.find(
                                                    (s) => s.id === a.strategyId
                                                );
                                                const paramsText =
                                                    Object.keys(a.params || {}).length > 0
                                                        ? Object.entries(a.params)
                                                              .map(([k, v]) => `${k}:${v}`)
                                                              .join(' · ')
                                                        : 'defaults';
                                                return (
                                                    <div
                                                        key={a.id}
                                                        className="flex items-center gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30"
                                                    >
                                                        <span className="text-sm font-medium text-white flex-1">
                                                            {strat?.name || 'Unknown'}
                                                            <span className="ml-2 text-xs text-blue-300">
                                                                [{paramsText}]
                                                            </span>
                                                            {a.lastError && (
                                                                <span
                                                                    title={a.lastError}
                                                                    className="ml-2 text-xs text-red-400 cursor-help"
                                                                >
                                                                    ⚠ error
                                                                </span>
                                                            )}
                                                        </span>
                                                        {strat && strat.paramSchema.length > 0 && (
                                                            <button
                                                                onClick={() => handleEditClick(a)}
                                                                className="text-xs px-2 py-1 rounded bg-white/5 text-gray-300 hover:bg-white/10"
                                                            >
                                                                Edit
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleRemove(a)}
                                                            className="text-xs px-2 py-1 rounded bg-red-500/10 text-red-300 hover:bg-red-500/20"
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Available to add */}
                                <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">
                                    Available
                                </h4>
                                {availableStrategies.length === 0 ? (
                                    <div className="text-center py-6">
                                        <p className="text-gray-400 text-sm">No strategies found.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {availableStrategies.map((strat) => (
                                            <div
                                                key={strat.id}
                                                className="flex items-center gap-3 p-3 rounded-lg bg-gray-700/30 border border-transparent hover:bg-gray-700/50 transition-colors"
                                            >
                                                <span className="text-sm font-medium text-white flex-1">
                                                    {strat.name}
                                                    {strat.isBuiltIn && (
                                                        <span className="ml-2 text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">
                                                            Built-in
                                                        </span>
                                                    )}
                                                </span>
                                                <button
                                                    onClick={() => handleAddClick(strat)}
                                                    className="text-xs px-3 py-1.5 rounded bg-blue-500 text-white hover:bg-blue-600"
                                                >
                                                    + Add
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end px-6 py-4 border-t border-gray-700">
                        <button
                            onClick={handleClose}
                            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-700 transition-colors"
                        >
                            Done
                        </button>
                    </div>
                </div>
            </div>

            {/* Param editor for ADDING a new assignment */}
            {pendingAdd && (
                <ParamEditorModal
                    isOpen
                    onClose={() => setPendingAdd(null)}
                    strategyName={pendingAdd.name}
                    paramSchema={pendingAdd.paramSchema}
                    initialValues={{}}
                    onSave={(values) => {
                        void createAssignment(pendingAdd, values);
                    }}
                />
            )}

            {/* Param editor for EDITING an existing assignment */}
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
        </>
    );
};

export default AssignStrategiesModal;
