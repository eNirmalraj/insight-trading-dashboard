// src/services/positionService.ts
// Position service with Supabase integration

import { supabase, isSupabaseConfigured } from './supabaseClient';
import { Position, PositionStatus, TradeDirection } from '../types';

// --- Type definitions for DB rows ---
interface DbPosition {
    id: string;
    user_id: string;
    symbol: string;
    account: string;
    direction: string;
    quantity: number;
    entry_price: number;
    stop_loss: number;
    take_profit: number;
    pnl: number;
    status: string;
    opened_at: string;
    closed_at: string | null;
    created_at: string;
    updated_at: string;
}

// --- Data Mappers ---

/**
 * Convert DB position row to frontend Position type
 */
const mapDbToPosition = (row: DbPosition): Position => ({
    id: row.id,
    symbol: row.symbol,
    account: row.account === 'binance' ? 'Binance' : 'Forex',
    direction: row.direction.toUpperCase() === 'BUY' ? TradeDirection.BUY : TradeDirection.SELL,
    quantity: Number(row.quantity) || 0,
    entryPrice: Number(row.entry_price) || 0,
    stopLoss: Number(row.stop_loss) || 0,
    takeProfit: Number(row.take_profit) || 0,
    pnl: Number(row.pnl) || 0,
    status: mapDbStatus(row.status),
    openTime: row.opened_at,
    closeTime: row.closed_at ?? undefined,
});

/**
 * Map DB status string to PositionStatus enum
 */
const mapDbStatus = (status: string): PositionStatus => {
    const normalized = status.toLowerCase();
    if (normalized === 'open') return PositionStatus.OPEN;
    if (normalized === 'pending') return PositionStatus.PENDING;
    return PositionStatus.CLOSED;
};

/**
 * Map frontend PositionStatus to DB status string
 */
const mapStatusToDb = (status: PositionStatus): string => {
    switch (status) {
        case PositionStatus.OPEN: return 'open';
        case PositionStatus.PENDING: return 'pending';
        case PositionStatus.CLOSED: return 'closed';
        default: return 'open';
    }
};

// --- Service Functions ---

/**
 * Get all positions for the current user
 */
export const getPositions = async (): Promise<Position[]> => {
    if (!supabase) throw new Error('Supabase not configured');

    const { data, error } = await supabase
        .from('positions')
        .select('*')
        .order('opened_at', { ascending: false });

    if (error) throw new Error(error.message);

    return (data || []).map(mapDbToPosition);
};

/**
 * Create a new position
 */
export const createPosition = async (
    position: Omit<Position, 'id'>
): Promise<Position> => {
    if (!supabase) throw new Error('Supabase not configured');

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
        .from('positions')
        .insert({
            user_id: user.id,
            symbol: position.symbol,
            account: position.account.toLowerCase(),
            direction: position.direction.toLowerCase(),
            quantity: position.quantity,
            entry_price: position.entryPrice,
            stop_loss: position.stopLoss,
            take_profit: position.takeProfit,
            pnl: position.pnl || 0,
            status: mapStatusToDb(position.status),
            opened_at: position.openTime || new Date().toISOString(),
        })
        .select()
        .single();

    if (error) throw new Error(error.message);

    return mapDbToPosition(data);
};

/**
 * Update a position's stop loss and take profit
 */
export const updatePosition = async (
    id: string,
    data: { sl: number; tp: number }
): Promise<Position | undefined> => {
    if (!supabase) throw new Error('Supabase not configured');

    const { data: updatedData, error } = await supabase
        .from('positions')
        .update({
            stop_loss: data.sl,
            take_profit: data.tp,
        })
        .eq('id', id)
        .select()
        .single();

    if (error) throw new Error(error.message);

    return mapDbToPosition(updatedData);
};

/**
 * Close a position with a closing price
 * Calculates PnL based on direction and entry price
 */
export const closePosition = async (
    id: string,
    closingPrice: number
): Promise<Position | undefined> => {
    if (!supabase) throw new Error('Supabase not configured');

    // First fetch the position to calculate PnL
    const { data: existingPos, error: fetchError } = await supabase
        .from('positions')
        .select('*')
        .eq('id', id)
        .single();

    if (fetchError) throw new Error(fetchError.message);
    if (!existingPos) throw new Error('Position not found');

    // Calculate PnL
    const contractSize = existingPos.account === 'forex' ? 100000 : 1;
    const priceDiff = closingPrice - Number(existingPos.entry_price);
    const pnl = existingPos.direction.toLowerCase() === 'buy'
        ? priceDiff * Number(existingPos.quantity) * contractSize
        : -priceDiff * Number(existingPos.quantity) * contractSize;

    // Update position
    const { data, error } = await supabase
        .from('positions')
        .update({
            status: 'closed',
            pnl,
            closed_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

    if (error) throw new Error(error.message);

    return mapDbToPosition(data);
};

/**
 * Cancel a position (close with 0 PnL)
 */
export const cancelPosition = async (id: string): Promise<Position | undefined> => {
    if (!supabase) throw new Error('Supabase not configured');

    const { data, error } = await supabase
        .from('positions')
        .update({
            status: 'closed',
            pnl: 0,
            closed_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

    if (error) throw new Error(error.message);

    return mapDbToPosition(data);
};

/**
 * Reverse a position (close current and open opposite)
 */
export const reversePosition = async (
    id: string,
    closingPrice: number
): Promise<Position> => {
    if (!supabase) throw new Error('Supabase not configured');

    // Fetch the current position
    const { data: pos, error: fetchError } = await supabase
        .from('positions')
        .select('*')
        .eq('id', id)
        .single();

    if (fetchError) throw new Error(fetchError.message);
    if (!pos) throw new Error('Position not found');

    // Close the current position
    await closePosition(id, closingPrice);

    // Create new position with opposite direction
    const newDirection = pos.direction.toLowerCase() === 'buy' ? TradeDirection.SELL : TradeDirection.BUY;
    const entryPrice = Number(pos.entry_price);
    const stopLoss = Number(pos.stop_loss);
    const takeProfit = Number(pos.take_profit);

    const newPosition = await createPosition({
        symbol: pos.symbol,
        account: pos.account === 'forex' ? 'Forex' : 'Binance',
        direction: newDirection,
        quantity: Number(pos.quantity),
        entryPrice: closingPrice,
        stopLoss: closingPrice + (closingPrice - stopLoss),
        takeProfit: closingPrice + (closingPrice - takeProfit),
        pnl: 0,
        status: PositionStatus.OPEN,
        openTime: new Date().toISOString(),
    });

    return newPosition;
};

export default {
    getPositions,
    createPosition,
    updatePosition,
    closePosition,
    cancelPosition,
    reversePosition,
};
