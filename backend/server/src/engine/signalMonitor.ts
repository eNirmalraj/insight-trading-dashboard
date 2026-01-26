
import { supabaseAdmin } from '../services/supabaseAdmin';
import { updateSignalStatus } from '../services/signalStorage';
import { eventBus, EngineEvents } from '../utils/eventBus';

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
            .in('status', ['Active']);

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
