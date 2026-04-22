import dotenv from 'dotenv';
dotenv.config();

import { supabaseAdmin } from './services/supabaseAdmin';
import { syncToDatabase as syncStrategies } from './engine/strategyLoader';
import {
    startSignalEngine,
    stopSignalEngine,
    getSignalEngineStatus,
} from './engine/signalEngine';
import { startPriceAlertMonitor, stopPriceAlertMonitor } from './services/priceAlertMonitor';

const HEARTBEAT_INTERVAL = 300_000; // 5 minutes

async function startWorker() {
    console.log('═══════════════════════════════════════════');
    console.log('       24/7 SIGNAL ENGINE WORKER           ');
    console.log('═══════════════════════════════════════════');
    console.log(`[Worker] PID: ${process.pid}`);
    console.log(`[Worker] Environment: ${process.env.NODE_ENV || 'development'}`);

    // 1. DB connectivity check
    try {
        const { error } = await supabaseAdmin.from('signals').select('id').limit(1);
        if (error) {
            console.error('[Worker] CRITICAL: Supabase connection failed:', error.message);
            process.exit(1);
        }
        console.log('[Worker] ✅ Connected to Supabase');
    } catch (err) {
        console.error('[Worker] CRITICAL: Database connection failed:', err);
        process.exit(1);
    }

    // 2. Sync .kuri files into scripts table (idempotent upsert)
    await syncStrategies();

    // 3. Start Price Alert Monitor
    startPriceAlertMonitor();

    // 4. Start Signal Engine (scanner): loads assignments, fills buffers, runs
    //    cold-start scan (which may emit SIGNAL_CREATED events into the event bus),
    //    then subscribes to Binance kline streams for ongoing candles.
    //    Signals are written to the `signals` table only — no auto-execution.
    await startSignalEngine();

    // Heartbeat
    setInterval(() => {
        const sig = getSignalEngineStatus() as any;
        console.log(
            `[Worker] ❤️ Heartbeat | signal:${sig.running ? 'up' : 'down'} ` +
                `assignments:${sig.assignments} buffers:${sig.bufferedPairs}`,
        );
    }, HEARTBEAT_INTERVAL);

    // Graceful shutdown
    const shutdown = () => {
        console.log('[Worker] Received shutdown signal. Stopping engines...');
        stopPriceAlertMonitor();
        stopSignalEngine();
        console.log('[Worker] Goodbye.');
        process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}

startWorker().catch((err) => {
    console.error('[Worker] Fatal Error:', err);
    process.exit(1);
});
