// backend/server/src/engine/signalMonitor.ts
// Signal Monitor — Uses @insight/computation for TP/SL evaluation.

import { supabaseAdmin } from '../services/supabaseAdmin';
import { updateSignalStatus } from '../services/signalStorage';
import { eventBus, EngineEvents } from '../utils/eventBus';
import { Candle } from '@insight/types';
import { createAlert } from '../services/alertService';
import {
    evaluateSignalAtPrice,
    evaluateSignalAtCandle,
} from '@insight/computation';
import type { SignalInput } from '@insight/computation';

interface Signal {
    id: string;
    symbol: string;
    direction: 'BUY' | 'SELL';
    entry_price: number;
    stop_loss: number | null;
    take_profit: number | null;
    status: 'Pending' | 'Active';
}

let activeSignalsBySymbol: Map<string, Signal[]> = new Map();

/**
 * Load all monitoring candidates from DB (I/O layer)
 */
export const loadMonitoredSignals = async () => {
    try {
        const { data, error } = await supabaseAdmin
            .from('signals')
            .select('*')
            .in('status', ['Active', 'Pending']);

        if (error) throw error;

        const grouped = new Map<string, Signal[]>();
        data.forEach((s: Signal) => {
            const existing = grouped.get(s.symbol) || [];
            grouped.set(s.symbol, [...existing, s]);
        });

        activeSignalsBySymbol = grouped;
        console.log(`[SignalMonitor] Loaded ${data.length} signals into optimized cache`);
    } catch (e) {
        console.error('[SignalMonitor] Error loading signals:', e);
    }
};

export const getMonitoredSymbols = (): string[] => {
    return Array.from(activeSignalsBySymbol.keys());
};

/**
 * Handle individual price tick events.
 * Uses @insight/computation for pure TP/SL logic.
 */
export const handlePriceTick = async (symbol: string, currentPrice: number) => {
    const signals = activeSignalsBySymbol.get(symbol);
    if (!signals || signals.length === 0) return;

    for (const signal of signals) {
        // Use shared computation for signal evaluation
        const signalInput: SignalInput = {
            id: signal.id,
            symbol: signal.symbol,
            direction: signal.direction,
            entry_price: signal.entry_price,
            stop_loss: signal.stop_loss,
            take_profit: signal.take_profit,
            status: signal.status,
        };

        const result = evaluateSignalAtPrice(signalInput, currentPrice);

        if (result.action === 'CLOSE_TP' || result.action === 'CLOSE_SL') {
            const closeReason = result.action === 'CLOSE_TP' ? 'TP' : 'SL';
            console.log(`[SignalMonitor] 🔥 Closing Signal ${signal.symbol} (${signal.direction}) Reason: ${closeReason} PnL: ${result.profitLoss?.toFixed(2)}%`);

            const success = await updateSignalStatus(signal.id, 'Closed', closeReason, result.profitLoss || 0);
            if (success) {
                const alertType = closeReason === 'TP' ? 'CLOSED_TP' : 'CLOSED_SL';
                await createAlert(signal.id, alertType, signal.symbol, { pnl: result.profitLoss });

                const remaining = signals.filter(s => s.id !== signal.id);
                if (remaining.length === 0) {
                    activeSignalsBySymbol.delete(symbol);
                } else {
                    activeSignalsBySymbol.set(symbol, remaining);
                }
            }
        }
    }
};

/**
 * Handle Candle Closure.
 * Uses @insight/computation for robust High/Low evaluation.
 */
export const handleCandleClosure = async (symbol: string, candle: Candle) => {
    const signals = activeSignalsBySymbol.get(symbol);
    if (!signals || signals.length === 0) return;

    for (const signal of signals) {
        const signalInput: SignalInput = {
            id: signal.id,
            symbol: signal.symbol,
            direction: signal.direction,
            entry_price: signal.entry_price,
            stop_loss: signal.stop_loss,
            take_profit: signal.take_profit,
            status: signal.status,
        };

        const result = evaluateSignalAtCandle(signalInput, candle);

        if (result.action === 'ACTIVATE') {
            console.log(`[SignalMonitor] 🚀 Activating Signal ${signal.symbol} (${signal.direction}) at ${signal.entry_price}`);
            const success = await updateSignalStatus(signal.id, 'Active');
            if (success) {
                await createAlert(signal.id, 'ACTIVATED', signal.symbol, { entry_price: signal.entry_price });
                signal.status = 'Active';
            }
            continue;
        }

        if (result.action === 'CLOSE_TP' || result.action === 'CLOSE_SL') {
            const closeReason = result.action === 'CLOSE_TP' ? 'TP' : 'SL';
            console.log(`[SignalMonitor] 🕯️ Candle Close (${symbol}) trigger: ${closeReason} at ${result.closePrice}`);
            console.log(`[SignalMonitor] 🔥 Closing Signal ${signal.id} PnL: ${result.profitLoss?.toFixed(2)}%`);

            const success = await updateSignalStatus(signal.id, 'Closed', closeReason, result.profitLoss || 0);
            if (success) {
                const alertType = closeReason === 'TP' ? 'CLOSED_TP' : 'CLOSED_SL';
                await createAlert(signal.id, alertType, signal.symbol, { pnl: result.profitLoss });

                const remaining = signals.filter(s => s.id !== signal.id);
                if (remaining.length === 0) {
                    activeSignalsBySymbol.delete(symbol);
                } else {
                    activeSignalsBySymbol.set(symbol, remaining);
                }
            }
        }
    }
};

/**
 * Initialize Event Listeners (I/O wiring)
 */
export const initSignalMonitor = () => {
    console.log('[SignalMonitor] Initializing event listeners...');

    eventBus.on(EngineEvents.PRICE_TICK, ({ symbol, price }) => {
        handlePriceTick(symbol, price);
    });

    eventBus.on(EngineEvents.CANDLE_CLOSED, ({ symbol, candle }) => {
        handleCandleClosure(symbol, candle);
    });

    eventBus.on(EngineEvents.SIGNAL_CREATED, ({ signalId, signalData }) => {
        const symbol = signalData.symbol;
        const newSignal: Signal = {
            id: signalId,
            ...signalData,
            status: 'Active'
        };
        const existing = activeSignalsBySymbol.get(symbol) || [];
        activeSignalsBySymbol.set(symbol, [...existing, newSignal]);
        console.log(`[SignalMonitor] Auto-tracked new signal for ${symbol}`);
    });

    eventBus.on(EngineEvents.SIGNAL_STATUS_CHANGED, () => {
        loadMonitoredSignals();
    });
};
