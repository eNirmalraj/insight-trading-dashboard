// src/services/signalService.ts
// Frontend-facing signal queries. Writes to the legacy `signals` table were
// removed when the signal/execution split landed in migration 054 — that
// table is now event-only (immutable). Frontend writes go to
// `signal_executions` (see toggleSignalPinned). All other state changes
// (Active → Closed, SL/TP updates, P&L) are owned by the backend execution
// engine and propagate to the UI via Supabase Realtime.

import { db } from './supabaseClient';
import { Signal, Timeframe } from '../types';

/**
 * Read signal executions (what the UI calls "signals") joined with their
 * underlying signal event row for params_snapshot and template_version.
 *
 * The Signals page originally read from the `signals` table; after the
 * signal/execution split the user-facing "signal card" IS an execution row,
 * so this function queries signal_executions + joins signals for metadata.
 */
export const getSignals = async (): Promise<Signal[]> => {

    // Step 1: fetch executions (what the UI calls "signal cards").
    // Columns dropped (not consumed by the UI mapping): watchlist_strategy_id,
    // user_id, updated_at. Kept list mirrors every field used in the map below.
    const { data: execs, error: execErr } = await db()
        .from('signal_executions')
        .select(
            `
            id,
            signal_id,
            symbol,
            market,
            direction,
            entry_price,
            timeframe,
            stop_loss,
            take_profit,
            lot_size,
            leverage,
            status,
            closed_at,
            close_reason,
            close_price,
            profit_loss,
            broker,
            is_pinned,
            created_at
        `
        )
        .order('created_at', { ascending: false })
        .limit(50);

    if (execErr) {
        console.warn('[signalService] getSignals (executions) failed:', execErr.message);
        return [];
    }

    if (!execs || execs.length === 0) return [];

    // Step 2: batch-fetch metadata from signals (params_snapshot, template_version, strategy_id)
    const signalIds = Array.from(new Set(execs.map((e: any) => e.signal_id).filter(Boolean)));
    const eventsById = new Map<string, any>();

    if (signalIds.length > 0) {
        const { data: events } = await db()
            .from('signals')
            .select('id, params_snapshot, template_version, strategy_id')
            .in('id', signalIds);
        (events || []).forEach((ev: any) => eventsById.set(ev.id, ev));
    }

    // Step 3: batch-fetch strategy names from the scripts table
    const stratIds = Array.from(
        new Set(Array.from(eventsById.values()).map((e) => e.strategy_id).filter(Boolean))
    );
    const stratNamesById = new Map<string, string>();
    if (stratIds.length > 0) {
        const { data: scripts } = await db()
            .from('scripts')
            .select('id, name')
            .in('id', stratIds);
        (scripts || []).forEach((s: any) => stratNamesById.set(s.id, s.name));
    }

    return execs.map((d: any) => {
        const event = eventsById.get(d.signal_id) || {};
        const strategyName = stratNamesById.get(event.strategy_id) || '';
        return {
            id: d.id,
            pair: d.symbol,
            strategy: strategyName,
            strategyId: event.strategy_id || undefined,
            direction: d.direction,
            entry: d.entry_price,
            entryType: 'Market' as any,
            stopLoss: d.stop_loss ?? 0,
            takeProfit: d.take_profit ?? 0,
            status: d.status,
            timestamp: d.created_at,
            timeframe: d.timeframe,
            closeReason: d.close_reason || undefined,
            profitLoss: d.profit_loss ?? undefined,
            closePrice: d.close_price ?? undefined,
            isPinned: !!d.is_pinned,
            closedAt: d.closed_at || undefined,
            lotSize: d.lot_size ?? undefined,
            leverage: d.leverage ?? undefined,
            paramsSnapshot: event.params_snapshot || {},
            templateVersion: event.template_version || undefined,
            signalEventId: d.signal_id,
            market: d.market as 'spot' | 'futures',
        } as Signal;
    });
};

/**
 * Toggle the pinned state on an execution row.
 * Users can only toggle pins on their own executions (RLS enforced).
 */
export const toggleSignalPinned = async (id: string, pinned: boolean): Promise<void> => {
    const { error } = await db()
        .from('signal_executions')
        .update({ is_pinned: pinned })
        .eq('id', id);
    if (error) {
        console.warn('[signalService] toggleSignalPinned failed:', error.message);
        throw new Error(error.message);
    }
};

/**
 * Back-compat alias for toggleSignalPinned.
 */
export const toggleSignalPin = toggleSignalPinned;

// Get signal executions filtered by strategy ID
export const getSignalsByStrategy = async (strategyId: string): Promise<Signal[]> => {

    // Step 1: find the signal events for this strategy
    const { data: events, error: evErr } = await db()
        .from('signals')
        .select('id, params_snapshot, template_version, strategy_id')
        .eq('strategy_id', strategyId)
        .order('created_at', { ascending: false })
        .limit(200);

    if (evErr || !events || events.length === 0) {
        if (evErr) console.warn('[signalService] getSignalsByStrategy (events) failed:', evErr.message);
        return [];
    }

    const eventsById = new Map<string, any>();
    events.forEach((e: any) => eventsById.set(e.id, e));

    // Step 2: fetch executions referencing those events
    const { data: execs, error: execErr } = await db()
        .from('signal_executions')
        .select('*')
        .in('signal_id', Array.from(eventsById.keys()))
        .order('created_at', { ascending: false });

    if (execErr || !execs) {
        if (execErr) console.warn('[signalService] getSignalsByStrategy (execs) failed:', execErr.message);
        return [];
    }

    // Step 3: fetch strategy name
    const { data: scripts } = await db()
        .from('scripts')
        .select('id, name')
        .eq('id', strategyId);
    const strategyName = scripts && scripts[0] ? scripts[0].name : '';

    return execs.map((d: any) => {
        const event = eventsById.get(d.signal_id) || {};
        return {
            id: d.id,
            pair: d.symbol,
            strategy: strategyName,
            strategyId: event.strategy_id || undefined,
            direction: d.direction,
            entry: d.entry_price,
            entryType: 'Market' as any,
            stopLoss: d.stop_loss ?? 0,
            takeProfit: d.take_profit ?? 0,
            status: d.status,
            timestamp: d.created_at,
            timeframe: d.timeframe,
            closeReason: d.close_reason || undefined,
            profitLoss: d.profit_loss ?? undefined,
            closedAt: d.closed_at || undefined,
            paramsSnapshot: event.params_snapshot || {},
            templateVersion: event.template_version || undefined,
            signalEventId: d.signal_id,
            market: d.market as 'spot' | 'futures',
        } as Signal;
    });
};

