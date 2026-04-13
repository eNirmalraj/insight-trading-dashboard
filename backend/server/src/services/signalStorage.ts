// backend/server/src/services/signalStorage.ts
// Writes event rows to the signals table.
// Execution state (SL, TP, status, close_reason, P&L) lives in signal_executions now.
// Legacy columns still exist on signals and are populated for compatibility until
// migration 054 drops them in Phase 5.

import { supabaseAdmin } from './supabaseAdmin';
import { eventBus } from '../utils/eventBus';
import { TradeDirection, Market } from '../constants/enums';

export interface InsertSignalInput {
    strategyId: string;          // uuid — use builtinStrategyUuid() for built-ins
    strategyName: string;        // legacy signals.strategy column (NOT NULL until 054)
    symbol: string;              // Binance-native, e.g. 'BTCUSDT'
    market: Market;
    direction: TradeDirection;
    entryPrice: number;
    timeframe: string;
    candleTime: string;          // ISO timestamp of the triggering candle
    paramsSnapshot: Record<string, any>;
    templateVersion: string;     // 8-char hash from strategyLoader
}

export interface SignalRow {
    id: string;
    strategy_id: string;
    symbol: string;
    market: string;
    direction: string;
    entry_price: number;
    timeframe: string;
    candle_time: string;
    params_snapshot: Record<string, any>;
    template_version: string | null;
    created_at: string;
}

/**
 * Insert a new signal event row.
 * Returns the inserted row, or null if deduped by the unique index.
 *
 * The unique index (strategy_id, params_snapshot, symbol, timeframe, candle_time)
 * guarantees one row per trigger event across cold-start, restart-replay, and
 * concurrent writes. Duplicate inserts are silently rejected (Postgres 23505).
 */
export async function insertSignal(input: InsertSignalInput): Promise<SignalRow | null> {
    // Populate legacy NOT-NULL columns (strategy, status) for compatibility with
    // the unmerged pre-054 schema. They're ignored by the new engine.
    const payload: Record<string, any> = {
        strategy_id: input.strategyId,
        strategy: input.strategyName, // legacy, NOT NULL until 054
        symbol: input.symbol,
        market: input.market,
        direction: input.direction,
        entry_price: input.entryPrice,
        timeframe: input.timeframe,
        candle_time: input.candleTime,
        params_snapshot: input.paramsSnapshot,
        template_version: input.templateVersion,
        // status relies on DB default 'pending' — event has no status
        // entry_type relies on DB default 'market'
    };

    const { data, error } = await supabaseAdmin
        .from('signals')
        .insert(payload)
        .select('*')
        .maybeSingle();

    if (error) {
        // 23505 = unique violation (dedupe) — silent skip, not an error
        if (error.code === '23505') {
            return null;
        }
        console.error('[signalStorage] insertSignal failed:', error.message);
        return null;
    }

    if (!data) {
        return null;
    }

    const row: SignalRow = {
        id: data.id,
        strategy_id: data.strategy_id,
        symbol: data.symbol,
        market: data.market,
        direction: data.direction,
        entry_price: data.entry_price,
        timeframe: data.timeframe,
        candle_time: data.candle_time,
        params_snapshot: data.params_snapshot || {},
        template_version: data.template_version,
        created_at: data.created_at,
    };

    console.log(
        `[SignalStorage] ✅ Signal event: ${row.symbol} ${row.direction} strategy=${input.strategyName}`,
    );

    // Notify Execution Engine via event bus (uses new single-arg signature)
    eventBus.emitSignalCreated(row, 'candle');

    return row;
}
