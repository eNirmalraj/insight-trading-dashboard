import express from 'express';
import dotenv from 'dotenv';
import { syncToDatabase as syncStrategies } from './engine/strategyLoader';
import {
    prepareExecutionEngine,
    startExecutionEngine,
    getExecutionEngineStatus,
} from './engine/executionEngine';
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
        execution: getExecutionEngineStatus(),
    });
});

// Start Server
app.listen(PORT, async () => {
    console.log(`🚀 Trading Engine running on port ${PORT}`);
    console.log(`🔗 Connected to Supabase...`);

    // 1. Sync .kuri files into scripts table
    await syncStrategies();

    // 2. Prepare Execution Engine (replay missed candles)
    await prepareExecutionEngine();

    // 3. Start Execution Engine (listeners)
    await startExecutionEngine();

    // 4. Start Signal Engine (scanner)
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log('       SIGNAL ENGINE STARTING              ');
    console.log('═══════════════════════════════════════════');
    await startSignalEngine();
});
