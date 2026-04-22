// src/services/signalService.ts
// Frontend-facing signal queries. Reads from the `signals` table — immutable
// event rows written by the Signal Engine. Trading execution has been removed;
// the app is now a signal-notification platform only.

import { db } from './supabaseClient';
import { Signal } from '../types';

/**
 * Fetch the most recent signal events from the `signals` table.
 * Also batch-fetches strategy names from `scripts` for display.
 */
export const getSignals = async (): Promise<Signal[]> => {
    const { data: rows, error } = await db()
        .from('signals')
        .select(
            `
            id,
            strategy_id,
            symbol,
            market,
            direction,
            entry_price,
            timeframe,
            stop_loss,
            take_profit,
            params_snapshot,
            template_version,
            candle_time,
            created_at
        `
        )
        .order('created_at', { ascending: false })
        .limit(200);

    if (error) {
        console.warn('[signalService] getSignals failed:', error.message);
        return [];
    }

    if (!rows || rows.length === 0) return [];

    // Batch-fetch strategy names from the scripts table
    const stratIds = Array.from(new Set(rows.map((r: any) => r.strategy_id).filter(Boolean)));
    const stratNamesById = new Map<string, string>();
    if (stratIds.length > 0) {
        const { data: scripts } = await db()
            .from('scripts')
            .select('id, name')
            .in('id', stratIds);
        (scripts || []).forEach((s: any) => stratNamesById.set(s.id, s.name));
    }

    return rows.map((d: any) => ({
        id: d.id,
        pair: d.symbol,
        strategy: stratNamesById.get(d.strategy_id) || '',
        strategyId: d.strategy_id || undefined,
        direction: d.direction,
        entry: d.entry_price,
        entryType: 'Market' as any,
        stopLoss: d.stop_loss ?? 0,
        takeProfit: d.take_profit ?? 0,
        // Signals are events; they don't have execution status — use PENDING as default
        status: 'Pending' as any,
        timestamp: d.created_at,
        timeframe: d.timeframe,
        isPinned: false,
        paramsSnapshot: d.params_snapshot || {},
        templateVersion: d.template_version || undefined,
        signalEventId: d.id,
        market: d.market as 'spot' | 'futures',
    } as Signal));
};

/**
 * Toggle the pinned state. The `signals` table has no is_pinned column
 * (it is immutable), so this is a no-op in the stripped app. Kept so call
 * sites in the UI don't need changes right now.
 */
export const toggleSignalPinned = async (_id: string, _pinned: boolean): Promise<void> => {
    // No-op: signals table is immutable event log; pinning is not supported.
};

/**
 * Back-compat alias for toggleSignalPinned.
 */
export const toggleSignalPin = toggleSignalPinned;

/**
 * Fetch signal events for a specific strategy.
 */
export const getSignalsByStrategy = async (strategyId: string): Promise<Signal[]> => {
    const { data: rows, error } = await db()
        .from('signals')
        .select(
            `
            id,
            strategy_id,
            symbol,
            market,
            direction,
            entry_price,
            timeframe,
            stop_loss,
            take_profit,
            params_snapshot,
            template_version,
            candle_time,
            created_at
        `
        )
        .eq('strategy_id', strategyId)
        .order('created_at', { ascending: false })
        .limit(200);

    if (error || !rows) {
        if (error) console.warn('[signalService] getSignalsByStrategy failed:', error.message);
        return [];
    }

    const { data: scripts } = await db()
        .from('scripts')
        .select('id, name')
        .eq('id', strategyId);
    const strategyName = scripts && scripts[0] ? scripts[0].name : '';

    return rows.map((d: any) => ({
        id: d.id,
        pair: d.symbol,
        strategy: strategyName,
        strategyId: d.strategy_id || undefined,
        direction: d.direction,
        entry: d.entry_price,
        entryType: 'Market' as any,
        stopLoss: d.stop_loss ?? 0,
        takeProfit: d.take_profit ?? 0,
        status: 'Pending' as any,
        timestamp: d.created_at,
        timeframe: d.timeframe,
        isPinned: false,
        paramsSnapshot: d.params_snapshot || {},
        templateVersion: d.template_version || undefined,
        signalEventId: d.id,
        market: d.market as 'spot' | 'futures',
    } as Signal));
};
