import express from 'express';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { startSignalListener } from './services/signalQueue';
import { startCryptoEngine, getCryptoEngineStatus } from './engine/cryptoEngine';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

import { supabaseAdmin } from './services/supabaseAdmin';

app.use(express.json());

// Health Check
app.get('/', (req, res) => {
    res.json({ status: 'Online', service: 'Insight Trading Engine' });
});

// Engine Status Endpoint
app.get('/engine/status', (req, res) => {
    res.json({
        crypto: getCryptoEngineStatus()
    });
});

// Start Server
app.listen(PORT, async () => {
    console.log(`🚀 Trading Engine running on port ${PORT}`);
    console.log(`🔗 Connected to Supabase...`);

    // Start Listening for Signals (existing functionality)
    startSignalListener();

    // Start Crypto Signal Engine
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log('       CRYPTO SIGNAL ENGINE STARTING       ');
    console.log('═══════════════════════════════════════════');
    await startCryptoEngine();
});
