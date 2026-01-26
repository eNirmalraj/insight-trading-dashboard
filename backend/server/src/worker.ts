import dotenv from 'dotenv';
import { supabaseAdmin } from './services/supabaseAdmin';
import { startCryptoEngine, stopCryptoEngine, getCryptoEngineStatus } from './engine/cryptoEngine';

dotenv.config();

const HEARTBEAT_INTERVAL = 300000; // 5 minutes

async function startWorker() {
    console.log('═══════════════════════════════════════════');
    console.log('       24/7 SIGNAL ENGINE WORKER           ');
    console.log('═══════════════════════════════════════════');
    console.log(`[Worker] PID: ${process.pid}`);
    console.log(`[Worker] Environment: ${process.env.NODE_ENV || 'development'}`);

    // Check Supabase Connection
    try {
        const { error } = await supabaseAdmin.from('signals').select('id').limit(1);
        if (error) {
            console.error('[Worker] CRITICAL: Failed to connect to Supabase:', error.message);
            process.exit(1);
        }
        console.log('[Worker] ✅ Connected to Supabase');
    } catch (err) {
        console.error('[Worker] CRITICAL: Database connection failed:', err);
        process.exit(1);
    }

    // Start Engine
    await startCryptoEngine();

    // Heartbeat Loop
    setInterval(() => {
        const status = getCryptoEngineStatus();
        console.log(`[Worker] ❤️ Heartbeat | ${(status as any).running ? 'Running' : 'Stopped'} | Buffered Pairs: ${(status as any).bufferedPairs}`);
    }, HEARTBEAT_INTERVAL);

    // Graceful Shutdown
    const shutdown = () => {
        console.log('[Worker] Received shutdown signal. Stopping engine...');
        stopCryptoEngine();
        console.log('[Worker] Goodbye.');
        process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}

startWorker().catch(err => {
    console.error('[Worker] Fatal Error:', err);
    process.exit(1);
});
