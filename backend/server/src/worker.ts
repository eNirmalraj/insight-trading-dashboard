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

    // 4. Start Signal Engine (scanner): loads assignments, fills buffers, runs
    //    cold-start scan, subscribes to Binance kline streams.
    await startSignalEngine();

    // 5. Start Execution Engine (executor + tick monitor).
    //    MUST happen AFTER signalEngine.start() so the cold-start scan's
    //    SIGNAL_CREATED emissions are heard.
    await startExecutionEngine();

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
