import { supabase } from './supabaseClient';
import { Signal, PositionStatus } from '../types';

export interface PaperTrade {
    id: string;
    user_id: string;
    signal_id: string;
    strategy_id: string;
    symbol: string;
    direction: 'BUY' | 'SELL';
    entry_price: number;
    quantity: number;
    status: PositionStatus;
    exit_price?: number;
    pnl?: number;
    pnl_percent?: number;
    exit_reason?: string;
    filled_at: string;
    closed_at?: string;
    created_at: string;
    updated_at: string;
}

/**
 * Creates a new paper trade from a signal.
 * IDEMPOTENCY: Checks if a trade already exists for this signal_id to prevent duplicates.
 */
export const createPaperTrade = async (
    signal: Signal,
    userId: string,
    overrides?: { stopLoss?: number; takeProfit?: number; trailingStopLoss?: number },
    quantity: number = 1,
    leverage: number = 1
): Promise<string | null> => {
    if (!supabase) return null;

    // 1. Idempotency Check
    const { data: existing } = await supabase
        .from('paper_trades')
        .select('id')
        .eq('signal_id', signal.id)
        .single();

    if (existing) {
        console.log(`[PaperTrading] Trade already exists for signal ${signal.id}. Skipping.`);
        return existing.id;
    }

    // 2. Create Trade
    // Convert Signal Direction to Trade Direction (if needed, but they match usually)
    const direction = signal.direction;

    const tradeData = {
        user_id: userId,
        signal_id: signal.id,
        strategy_id: signal.strategyId,
        symbol: signal.pair,
        direction: direction,
        entry_price: signal.entry,
        quantity: quantity,
        leverage: leverage, // Ensure DB has this column
        status: PositionStatus.OPEN,
        filled_at: new Date().toISOString(),
        stop_loss: overrides?.stopLoss ?? signal.stopLoss,
        take_profit: overrides?.takeProfit ?? signal.takeProfit,
        trailing_stop_loss: overrides?.trailingStopLoss ?? signal.trailingStopLoss
    };

    const { data, error } = await supabase
        .from('paper_trades')
        .insert(tradeData)
        .select('id')
        .single();

    if (error) {
        console.error(`[PaperTrading] Failed to create trade for signal ${signal.id}:`, error.message);
        return null;
    }

    console.log(`[PaperTrading] Created trade ${data.id} for signal ${signal.id}`);
    return data.id;
};

/**
 * Closes an existing paper trade.
 * Calculates PnL based on exit price.
 */
export const closePaperTrade = async (
    signalId: string,
    exitPrice: number,
    reason: string
): Promise<void> => {
    if (!supabase) return;

    // 1. Find the open trade for this signal
    const { data: trade } = await supabase
        .from('paper_trades')
        .select('*')
        .eq('signal_id', signalId)
        .eq('status', PositionStatus.OPEN)
        .single();

    if (!trade) {
        console.log(`[PaperTrading] No OPEN trade found for signal ${signalId} to close.`);
        return;
    }

    // 2. Calculate PnL
    let pnl = 0;
    let pnlPercent = 0;

    if (trade.direction === 'BUY') {
        pnl = (exitPrice - trade.entry_price) * trade.quantity;
        pnlPercent = ((exitPrice - trade.entry_price) / trade.entry_price) * 100;
    } else {
        pnl = (trade.entry_price - exitPrice) * trade.quantity;
        pnlPercent = ((trade.entry_price - exitPrice) / trade.entry_price) * 100;
    }

    // 3. Update Trade to CLOSED
    const { error } = await supabase
        .from('paper_trades')
        .update({
            status: PositionStatus.CLOSED,
            exit_price: exitPrice,
            pnl: pnl,
            pnl_percent: pnlPercent,
            exit_reason: reason,
            closed_at: new Date().toISOString()
        })
        .eq('id', trade.id);

    if (error) {
        console.error(`[PaperTrading] Failed to close trade ${trade.id}:`, error.message);
    } else {
        console.log(`[PaperTrading] Closed trade ${trade.id}. PnL: ${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);
    }
};

/**
 * Get a paper trade by signal ID
 */
export const getPaperTradeBySignal = async (signalId: string): Promise<PaperTrade | null> => {
    if (!supabase) return null;

    const { data, error } = await supabase
        .from('paper_trades')
        .select('*')
        .eq('signal_id', signalId)
        .single();

    if (error) return null;
    return data as PaperTrade;
};
