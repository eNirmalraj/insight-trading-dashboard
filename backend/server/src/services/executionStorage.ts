// backend/server/src/services/executionStorage.ts
// Writes to the signal_executions table.

import { supabaseAdmin } from './supabaseAdmin';
import { TradeDirection, SignalStatus, CloseReason, Market, BrokerType } from '../constants/enums';

export interface InsertExecutionInput {
    signalId: string;
    watchlistStrategyId: string | null;
    userId: string | null;
    symbol: string;
    market: Market;
    direction: TradeDirection;
    entryPrice: number;
    timeframe: string;
    stopLoss: number;
    takeProfit: number;
    lotSize?: number | null;
    leverage?: number | null;
    broker?: BrokerType;
}

export interface SignalExecutionRow {
    id: string;
    signal_id: string;
    watchlist_strategy_id: string | null;
    user_id: string | null;
    symbol: string;
    market: string;
    direction: string;
    entry_price: number;
    timeframe: string;
    stop_loss: number | null;
    take_profit: number | null;
    lot_size: number | null;
    leverage: number | null;
    status: string;
    closed_at: string | null;
    close_reason: string | null;
    close_price: number | null;
    profit_loss: number | null;
    broker: string;
    broker_order_id: string | null;
    created_at: string;
    updated_at: string;
}

export async function insertExecution(input: InsertExecutionInput): Promise<SignalExecutionRow | null> {
    const { data, error } = await supabaseAdmin
        .from('signal_executions')
        .insert({
            signal_id: input.signalId,
            watchlist_strategy_id: input.watchlistStrategyId,
            user_id: input.userId,
            symbol: input.symbol,
            market: input.market,
            direction: input.direction,
            entry_price: input.entryPrice,
            timeframe: input.timeframe,
            stop_loss: input.stopLoss,
            take_profit: input.takeProfit,
            lot_size: input.lotSize ?? null,
            leverage: input.leverage ?? null,
            status: SignalStatus.ACTIVE,
            broker: input.broker || BrokerType.PAPER,
        })
        .select('*')
        .single();

    if (error) {
        console.error('[executionStorage] insertExecution failed:', error.message);
        return null;
    }
    return data as SignalExecutionRow;
}

export async function loadActiveExecutions(): Promise<SignalExecutionRow[]> {
    const { data, error } = await supabaseAdmin
        .from('signal_executions')
        .select('*')
        .eq('status', SignalStatus.ACTIVE);

    if (error) {
        console.error('[executionStorage] loadActiveExecutions failed:', error.message);
        return [];
    }
    return (data || []) as SignalExecutionRow[];
}

/**
 * Atomic close: WHERE status='Active' ensures we don't double-close.
 * Returns true if the row was actually closed, false if it was already closed
 * by another path.
 */
export async function closeExecution(
    id: string,
    reason: CloseReason,
    closePrice: number,
    profitLoss: number | null,
): Promise<boolean> {
    const { data, error } = await supabaseAdmin
        .from('signal_executions')
        .update({
            status: SignalStatus.CLOSED,
            close_reason: reason,
            close_price: closePrice,
            profit_loss: profitLoss,
            closed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('status', SignalStatus.ACTIVE)
        .select('id')
        .maybeSingle();

    if (error) {
        console.error('[executionStorage] closeExecution failed:', error.message);
        return false;
    }
    return !!data;
}
