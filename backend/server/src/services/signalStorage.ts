// backend/server/src/services/signalStorage.ts
// Signal Persistence Service using Supabase

import { supabaseAdmin } from './supabaseAdmin';
import { TradeDirection, StrategyCategory } from '../constants/builtInStrategies';
import { eventBus } from '../utils/eventBus';
import { createAlert } from './alertService';

export interface SignalData {
    symbol: string;
    strategy: string;
    strategyId: string;
    strategyCategory: string;
    direction: TradeDirection;
    entryPrice: number;
    stopLoss: number | null;
    takeProfit: number | null;
    timeframe: string;
    status: string;
}

/**
 * Check if a duplicate signal exists within lookback period
 */
export const isDuplicateSignal = async (
    strategyId: string,
    symbol: string,
    direction: string,
    lookbackMinutes: number = 60
): Promise<boolean> => {
    try {
        const lookbackTime = new Date(Date.now() - lookbackMinutes * 60 * 1000).toISOString();

        const { data, error } = await supabaseAdmin
            .from('signals')
            .select('id')
            .eq('strategy_id', strategyId)
            .eq('symbol', symbol)
            .eq('direction', direction)
            .gte('created_at', lookbackTime)
            .limit(1);

        if (error) {
            console.error('Error checking duplicate signal:', error);
            return false; // Fail open to allow signal creation
        }

        return (data?.length || 0) > 0;
    } catch (error) {
        console.error('Error in isDuplicateSignal:', error);
        return false;
    }
};

/**
 * Save a new signal to the database
 */
export const saveSignal = async (signal: SignalData): Promise<string | null> => {
    try {
        // Check for duplicate first
        const isDupe = await isDuplicateSignal(
            signal.strategyId,
            signal.symbol,
            signal.direction,
            60 // 1 hour lookback
        );

        if (isDupe) {
            console.log(`[SignalStorage] Duplicate signal prevented for ${signal.symbol} ${signal.strategy}`);
            return null;
        }

        const { data, error } = await supabaseAdmin
            .from('signals')
            .insert({
                symbol: signal.symbol,
                strategy: signal.strategy,
                strategy_id: signal.strategyId,
                strategy_category: signal.strategyCategory,
                direction: signal.direction,
                entry_price: signal.entryPrice,
                stop_loss: signal.stopLoss,
                take_profit: signal.takeProfit,
                timeframe: signal.timeframe,
                status: signal.status,
                entry_type: 'Market',
                activated_at: signal.status === 'Active' ? new Date().toISOString() : null
            })
            .select('id')
            .single();

        if (error) {
            console.error('Error saving signal:', error);
            return null;
        }

        console.log(`[SignalStorage] ✅ Signal saved: ${signal.symbol} ${signal.direction} ${signal.strategy}`);

        // Notify via EventBus
        eventBus.emitSignalCreated(data.id, signal);

        // Notify via AlertSystem
        await createAlert(data.id, 'CREATED', signal.symbol, {
            direction: signal.direction,
            entry_price: signal.entryPrice
        });

        return data?.id || null;
    } catch (error) {
        console.error('Error in saveSignal:', error);
        return null;
    }
};

/**
 * Update signal status
 */
export const updateSignalStatus = async (
    signalId: string,
    status: string,
    closeReason?: string,
    profitLoss?: number
): Promise<boolean> => {
    try {
        const updateData: Record<string, any> = { status };

        if (status === 'Closed') {
            updateData.closed_at = new Date().toISOString();
            if (closeReason) updateData.close_reason = closeReason;
            if (profitLoss !== undefined) updateData.profit_loss = profitLoss;
        } else if (status === 'Active') {
            updateData.activated_at = new Date().toISOString();
        }

        const { error } = await supabaseAdmin
            .from('signals')
            .update(updateData)
            .eq('id', signalId);

        if (error) {
            console.error('Error updating signal status:', error);
            return false;
        }

        // Notify via EventBus
        eventBus.emitSignalStatusChanged(signalId, status);

        return true;
    } catch (error) {
        console.error('Error in updateSignalStatus:', error);
        return false;
    }
};
