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
import { testConnection, encryptKeyFields } from './services/exchangeConnector';
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

// ── Exchange / Broker Connect endpoints ─────────────────

// Test an exchange connection
app.post('/api/exchange/test', async (req, res) => {
    const { exchange_key_id } = req.body;
    if (!exchange_key_id) {
        return res.status(400).json({ error: 'exchange_key_id is required' });
    }
    try {
        const result = await testConnection(exchange_key_id);
        return res.json(result);
    } catch (err: any) {
        return res.status(500).json({ error: err.message || 'Test failed' });
    }
});

// Encrypt keys before storage (called by frontend on add)
app.post('/api/exchange/encrypt-keys', async (req, res) => {
    const { api_key, api_secret, passphrase, exchange_key_id } = req.body;
    if (!exchange_key_id) {
        return res.status(400).json({ error: 'exchange_key_id is required' });
    }
    try {
        const encrypted = encryptKeyFields({ api_key, api_secret, passphrase });
        const { error } = await supabaseAdmin
            .from('user_exchange_keys')
            .update(encrypted)
            .eq('id', exchange_key_id);

        if (error) return res.status(500).json({ error: error.message });
        return res.json({ ok: true });
    } catch (err: any) {
        return res.status(500).json({ error: err.message || 'Encryption failed' });
    }
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
