import dotenv from 'dotenv';
dotenv.config();

import { supabaseAdmin } from './services/supabaseAdmin';
import { syncToDatabase as syncStrategies } from './engine/strategyLoader';
import {
    startSignalEngine,
    stopSignalEngine,
    getSignalEngineStatus,
} from './engine/signalEngine';
import {
    prepareExecutionEngine,
    startExecutionEngine,
    stopExecutionEngine,
    getExecutionEngineStatus,
} from './engine/executionEngine';
import { startPriceAlertMonitor, stopPriceAlertMonitor } from './services/priceAlertMonitor';
import { startFillStreams, stopFillStreams } from './services/fillReconciler';

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

    // 3. Prepare Execution Engine: load active executions into memory and
    //    replay missed candles to close any SL/TP hits that happened during downtime.
    await prepareExecutionEngine();

    // 4. Start Execution Engine FIRST so its eventBus listeners (SIGNAL_CREATED,
    //    PRICE_TICK) are registered before the Signal Engine's cold-start scan
    //    begins emitting. Otherwise the cold-start signals fire into an empty
    //    event bus and executions never get created.
    await startExecutionEngine();

    // 4b. Start Price Alert Monitor
    startPriceAlertMonitor();

    // 4c. Open user-data WebSocket fill streams for every active Binance
    //     credential. ORDER_TRADE_UPDATE events now flow into fillReconciler
    //     which persists them to broker_orders + fills_log + closes executions
    //     on SL/TP fill. Non-fatal if streams fail to open — system keeps
    //     running, we just lose live fill persistence until restart.
    try {
        await startFillStreams();
    } catch (e: any) {
        console.warn('[Worker] startFillStreams failed (non-fatal):', e?.message);
    }

    // 5. Start Signal Engine (scanner): loads assignments, fills buffers, runs
    //    cold-start scan (which may emit dozens of SIGNAL_CREATED events), then
    //    subscribes to Binance kline streams for ongoing candles.
    await startSignalEngine();

    // Heartbeat
    setInterval(() => {
        const sig = getSignalEngineStatus() as any;
        const exec = getExecutionEngineStatus() as any;
        console.log(
            `[Worker] ❤️ Heartbeat | signal:${sig.running ? 'up' : 'down'} ` +
                `assignments:${sig.assignments} buffers:${sig.bufferedPairs} ` +
                `| exec:${exec.running ? 'up' : 'down'} active:${exec.activeExecutions}`,
        );
    }, HEARTBEAT_INTERVAL);

    // Graceful shutdown
    const shutdown = () => {
        console.log('[Worker] Received shutdown signal. Stopping engines...');
        stopFillStreams();
        stopPriceAlertMonitor();
        stopExecutionEngine();
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
