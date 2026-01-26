
import { supabaseAdmin } from '../services/supabaseAdmin';
import { updateSignalStatus } from '../services/signalStorage';
import { eventBus, EngineEvents } from '../utils/eventBus';
import { Candle } from './indicators';
import { createAlert } from '../services/alertService';

interface Signal {
    id: string;
    symbol: string;
    direction: 'BUY' | 'SELL';
    entry_price: number;
    stop_loss: number | null;
    take_profit: number | null;
    status: 'Pending' | 'Active';
}

// Optimized cache: symbol -> Array of active signals
let activeSignalsBySymbol: Map<string, Signal[]> = new Map();

/**
 * Load all monitoring candidates from DB
 */
export const loadMonitoredSignals = async () => {
    try {
        const { data, error } = await supabaseAdmin
            .from('signals')
            .select('*')
            .select('*')
            .in('status', ['Active', 'Pending']);

        if (error) throw error;

        // Group signals by symbol for O(1) lookup during price updates
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

/**
 * Handle individual price tick events
 */
export const handlePriceTick = async (symbol: string, currentPrice: number) => {
    const signals = activeSignalsBySymbol.get(symbol);
    if (!signals || signals.length === 0) return;

    for (const signal of signals) {
        let closeReason = '';
        let profitLoss = 0;
        let shouldClose = false;

        if (signal.direction === 'BUY') {
            if (signal.take_profit !== null && currentPrice >= signal.take_profit) {
                closeReason = 'TP';
                profitLoss = ((currentPrice - signal.entry_price) / signal.entry_price) * 100;
                shouldClose = true;
            } else if (signal.stop_loss !== null && currentPrice <= signal.stop_loss) {
                closeReason = 'SL';
                profitLoss = ((currentPrice - signal.entry_price) / signal.entry_price) * 100;
                shouldClose = true;
            }
        } else if (signal.direction === 'SELL') {
            if (signal.take_profit !== null && currentPrice <= signal.take_profit) {
                closeReason = 'TP';
                profitLoss = ((signal.entry_price - currentPrice) / signal.entry_price) * 100;
                shouldClose = true;
            } else if (signal.stop_loss !== null && currentPrice >= signal.stop_loss) {
                closeReason = 'SL';
                profitLoss = ((signal.entry_price - currentPrice) / signal.entry_price) * 100;
                shouldClose = true;
            }
        }

        if (shouldClose) {
            console.log(`[SignalMonitor] 🔥 Closing Signal ${signal.symbol} (${signal.direction}) Reason: ${closeReason} PnL: ${profitLoss.toFixed(2)}%`);

            // Update DB
            const success = await updateSignalStatus(signal.id, 'Closed', closeReason, profitLoss);

            if (success) {
                // Alert
                const alertType = closeReason === 'TP' ? 'CLOSED_TP' : closeReason === 'SL' ? 'CLOSED_SL' : 'CLOSED_OTHER';
                await createAlert(signal.id, alertType, signal.symbol, { pnl: profitLoss });

                // Remove from cache
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
 * Handle Candle Closure (Robust High/Low Evaluation)
 */
export const handleCandleClosure = async (symbol: string, candle: Candle) => {
    const signals = activeSignalsBySymbol.get(symbol);
    if (!signals || signals.length === 0) return;

    for (const signal of signals) {
        // ---------------------------------------------------------
        // 1. PENDING SIGNALS -> Check for Entry Trigger
        // ---------------------------------------------------------
        if (signal.status === 'Pending') {
            let triggered = false;

            if (signal.direction === 'BUY') {
                // If price reached Entry (High >= Entry)
                if (candle.high >= signal.entry_price) {
                    triggered = true;
                }
            } else if (signal.direction === 'SELL') {
                // If price reached Entry (Low <= Entry)
                if (candle.low <= signal.entry_price) {
                    triggered = true;
                }
            }

            if (triggered) {
                console.log(`[SignalMonitor] 🚀 Activating Signal ${signal.symbol} (${signal.direction}) at ${signal.entry_price}`);

                // Update DB
                const success = await updateSignalStatus(signal.id, 'Active');

                if (success) {
                    await createAlert(signal.id, 'ACTIVATED', signal.symbol, { entry_price: signal.entry_price });

                    // Update Cache in place
                    signal.status = 'Active';
                    // Note: We do NOT check TP/SL in the same candle to ensure clear state transition.
                    // Next candle will monitor for exit.
                }
            }
            continue; // Move to next signal, don't process TP/SL for this one yet
        }

        // ---------------------------------------------------------
        // 2. ACTIVE SIGNALS -> Check for TP / SL
        // ---------------------------------------------------------
        if (signal.status !== 'Active') continue;

        let closeReason = '';
        let profitLoss = 0;
        let shouldClose = false;
        let closePrice = 0;

        if (signal.direction === 'BUY') {
            // Check High for TP (Did price wick up to target?)
            if (signal.take_profit !== null && candle.high >= signal.take_profit) {
                closeReason = 'TP';
                closePrice = signal.take_profit; // Assume filled at TP
                shouldClose = true;
            }
            // Check Low for SL (Did price wick down to stop?)
            else if (signal.stop_loss !== null && candle.low <= signal.stop_loss) {
                closeReason = 'SL';
                closePrice = signal.stop_loss; // Assume filled at SL
                shouldClose = true;
            }
        } else if (signal.direction === 'SELL') {
            // Check Low for TP (Did price wick down to target?)
            if (signal.take_profit !== null && candle.low <= signal.take_profit) {
                closeReason = 'TP';
                closePrice = signal.take_profit;
                shouldClose = true;
            }
            // Check High for SL (Did price wick up to stop?)
            else if (signal.stop_loss !== null && candle.high >= signal.stop_loss) {
                closeReason = 'SL';
                closePrice = signal.stop_loss;
                shouldClose = true;
            }
        }

        if (shouldClose) {
            // Calculate PnL based on the specific close price (TP or SL level)
            if (signal.direction === 'BUY') {
                profitLoss = ((closePrice - signal.entry_price) / signal.entry_price) * 100;
            } else {
                profitLoss = ((signal.entry_price - closePrice) / signal.entry_price) * 100;
            }

            console.log(`[SignalMonitor] 🕯️ Candle Close (${symbol}) trigger: ${closeReason} at ${closePrice}`);
            console.log(`[SignalMonitor] 🔥 Closing Signal ${signal.id} PnL: ${profitLoss.toFixed(2)}%`);

            // Update DB
            const success = await updateSignalStatus(signal.id, 'Closed', closeReason, profitLoss);

            if (success) {
                // Alert
                const alertType = closeReason === 'TP' ? 'CLOSED_TP' : closeReason === 'SL' ? 'CLOSED_SL' : 'CLOSED_OTHER';
                await createAlert(signal.id, alertType, signal.symbol, { pnl: profitLoss });

                // Remove from cache
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

// Initialize Event Listeners
export const initSignalMonitor = () => {
    console.log('[SignalMonitor] Initializing event listeners...');

    // Price Ticks
    eventBus.on(EngineEvents.PRICE_TICK, ({ symbol, price }) => {
        handlePriceTick(symbol, price);
    });

    // Candle Closed (Robust Evaluator)
    eventBus.on(EngineEvents.CANDLE_CLOSED, ({ symbol, candle }) => {
        handleCandleClosure(symbol, candle);
    });

    // New Signal Created - Auto add to cache
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

    // Manual Cache Refresh if needed
    eventBus.on(EngineEvents.SIGNAL_STATUS_CHANGED, () => {
        // Debounce or just reload? For status changes like manual cancellation.
        loadMonitoredSignals();
    });
};
