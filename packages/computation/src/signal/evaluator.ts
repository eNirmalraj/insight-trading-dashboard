// @insight/computation — Signal Status Evaluation (Pure Computation)
// Unified TP/SL hit detection and signal status transitions.
// Extracts the pure math from both frontend signalEngine and backend signalMonitor.

import { Candle } from '@insight/types';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface SignalInput {
    id: string;
    symbol: string;
    direction: 'BUY' | 'SELL';
    entry_price: number;
    stop_loss: number | null;
    take_profit: number | null;
    status: 'Pending' | 'Active';
    entryType?: 'MARKET' | 'LIMIT' | 'STOP';
    trailing_stop_loss?: number;
}

export interface SignalStatusResult {
    action: 'NONE' | 'ACTIVATE' | 'CLOSE_TP' | 'CLOSE_SL' | 'TRAIL_SL';
    reason: string;
    profitLoss?: number;
    closePrice?: number;
    newStopLoss?: number;
}

// ─────────────────────────────────────────────────────────────
// Price-Tick Evaluation (Real-Time)
// ─────────────────────────────────────────────────────────────

/**
 * Evaluate a signal against a current price tick (real-time monitoring).
 * Used for both frontend and backend real-time price monitoring.
 */
export const evaluateSignalAtPrice = (
    signal: SignalInput,
    currentPrice: number
): SignalStatusResult => {
    // Only evaluate Active signals for TP/SL
    if (signal.status !== 'Active') {
        return { action: 'NONE', reason: '' };
    }

    if (signal.direction === 'BUY') {
        if (signal.take_profit !== null && currentPrice >= signal.take_profit) {
            const pnl = ((currentPrice - signal.entry_price) / signal.entry_price) * 100;
            return { action: 'CLOSE_TP', reason: 'TP', profitLoss: pnl, closePrice: currentPrice };
        }
        if (signal.stop_loss !== null && currentPrice <= signal.stop_loss) {
            const pnl = ((currentPrice - signal.entry_price) / signal.entry_price) * 100;
            return { action: 'CLOSE_SL', reason: 'SL', profitLoss: pnl, closePrice: currentPrice };
        }
    } else {
        if (signal.take_profit !== null && currentPrice <= signal.take_profit) {
            const pnl = ((signal.entry_price - currentPrice) / signal.entry_price) * 100;
            return { action: 'CLOSE_TP', reason: 'TP', profitLoss: pnl, closePrice: currentPrice };
        }
        if (signal.stop_loss !== null && currentPrice >= signal.stop_loss) {
            const pnl = ((signal.entry_price - currentPrice) / signal.entry_price) * 100;
            return { action: 'CLOSE_SL', reason: 'SL', profitLoss: pnl, closePrice: currentPrice };
        }
    }

    // Trailing Stop Loss
    if (signal.trailing_stop_loss && signal.trailing_stop_loss > 0 && signal.stop_loss !== null) {
        const distance = signal.trailing_stop_loss;
        if (signal.direction === 'BUY') {
            const potentialSL = currentPrice - distance;
            if (potentialSL > signal.stop_loss) {
                return { action: 'TRAIL_SL', reason: 'Trailing SL adjusted', newStopLoss: potentialSL };
            }
        } else {
            const potentialSL = currentPrice + distance;
            if (potentialSL < signal.stop_loss) {
                return { action: 'TRAIL_SL', reason: 'Trailing SL adjusted', newStopLoss: potentialSL };
            }
        }
    }

    return { action: 'NONE', reason: '' };
};

// ─────────────────────────────────────────────────────────────
// Candle-Close Evaluation (Robust — uses High/Low)
// ─────────────────────────────────────────────────────────────

/**
 * Evaluate a signal against a closed candle (uses High/Low for robust TP/SL checking).
 * This is the more accurate evaluation used when a candle closes.
 */
export const evaluateSignalAtCandle = (
    signal: SignalInput,
    candle: Candle
): SignalStatusResult => {
    // --- PENDING: Check for entry trigger ---
    if (signal.status === 'Pending') {
        let triggered = false;

        if (signal.direction === 'BUY') {
            triggered = candle.high >= signal.entry_price;
        } else {
            triggered = candle.low <= signal.entry_price;
        }

        if (triggered) {
            return { action: 'ACTIVATE', reason: `Entry triggered at ${signal.entry_price}` };
        }
        return { action: 'NONE', reason: '' };
    }

    // --- ACTIVE: Check for TP/SL ---
    if (signal.status !== 'Active') {
        return { action: 'NONE', reason: '' };
    }

    if (signal.direction === 'BUY') {
        // Check High for TP (did price wick up to target?)
        if (signal.take_profit !== null && candle.high >= signal.take_profit) {
            const pnl = ((signal.take_profit - signal.entry_price) / signal.entry_price) * 100;
            return { action: 'CLOSE_TP', reason: 'TP', profitLoss: pnl, closePrice: signal.take_profit };
        }
        // Check Low for SL (did price wick down to stop?)
        if (signal.stop_loss !== null && candle.low <= signal.stop_loss) {
            const pnl = ((signal.stop_loss - signal.entry_price) / signal.entry_price) * 100;
            return { action: 'CLOSE_SL', reason: 'SL', profitLoss: pnl, closePrice: signal.stop_loss };
        }
    } else {
        // Check Low for TP
        if (signal.take_profit !== null && candle.low <= signal.take_profit) {
            const pnl = ((signal.entry_price - signal.take_profit) / signal.entry_price) * 100;
            return { action: 'CLOSE_TP', reason: 'TP', profitLoss: pnl, closePrice: signal.take_profit };
        }
        // Check High for SL
        if (signal.stop_loss !== null && candle.high >= signal.stop_loss) {
            const pnl = ((signal.entry_price - signal.stop_loss) / signal.entry_price) * 100;
            return { action: 'CLOSE_SL', reason: 'SL', profitLoss: pnl, closePrice: signal.stop_loss };
        }
    }

    return { action: 'NONE', reason: '' };
};

// ─────────────────────────────────────────────────────────────
// Pending Entry Trigger (for order types)
// ─────────────────────────────────────────────────────────────

/**
 * Check if a pending signal's entry condition is met at the current price.
 * Supports MARKET, LIMIT, and STOP order types.
 */
export const checkEntryTrigger = (
    signal: SignalInput,
    currentPrice: number
): boolean => {
    if (signal.status !== 'Pending') return false;

    const isBuy = signal.direction === 'BUY';
    const entryType = signal.entryType || 'MARKET';

    switch (entryType) {
        case 'MARKET':
            return true; // Market orders always trigger immediately

        case 'LIMIT':
            // LIMIT: Buy low, sell high
            return isBuy ? currentPrice <= signal.entry_price : currentPrice >= signal.entry_price;

        case 'STOP':
            // STOP: Breakout/breakdown
            return isBuy ? currentPrice >= signal.entry_price : currentPrice <= signal.entry_price;

        default:
            return false;
    }
};

// ─────────────────────────────────────────────────────────────
// PnL Calculation
// ─────────────────────────────────────────────────────────────

/**
 * Calculate PnL percentage for a closed signal.
 */
export const calculatePnlPercent = (
    entryPrice: number,
    closePrice: number,
    direction: 'BUY' | 'SELL'
): number => {
    if (direction === 'BUY') {
        return ((closePrice - entryPrice) / entryPrice) * 100;
    } else {
        return ((entryPrice - closePrice) / entryPrice) * 100;
    }
};
