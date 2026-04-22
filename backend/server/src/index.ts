import express from 'express';
import dotenv from 'dotenv';
import { syncToDatabase as syncStrategies } from './engine/strategyLoader';
import {
    startSignalEngine,
    getSignalEngineStatus,
} from './engine/signalEngine';
import { supabaseAdmin } from './services/supabaseAdmin';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());

// Health Check
app.get('/', (req, res) => {
    res.json({ status: 'Online', service: 'Insight Trading Engine' });
});

// Engine Status Endpoint
app.get('/engine/status', (req, res) => {
    res.json({
        engine: getSignalEngineStatus(),
    });
});

// Start Server
app.listen(PORT, async () => {
    console.log(`🚀 Trading Engine running on port ${PORT}`);
    console.log(`🔗 Connected to Supabase...`);

    // 1. Sync .kuri files into scripts table
    await syncStrategies();

    // 2. Start Signal Engine (scanner) — signals are notifications only, no auto-execution
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log('       SIGNAL ENGINE STARTING              ');
    console.log('═══════════════════════════════════════════');
    await startSignalEngine();
});
