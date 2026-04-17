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
import { testMT5Connection, encryptMT5Fields } from './services/mt5Connector';
import { isIndianBroker, testIndianBrokerConnection, encryptIndianBrokerFields } from './services/indianBrokerConnector';
import {
    getUpstoxAuthUrl, handleUpstoxCallback,
    getFyersAuthUrl, handleFyersCallback,
    getZerodhaAuthUrl, handleZerodhaCallback,
    getOAuthStatus,
} from './services/oauthBrokers';
import { executeTradeOrder, TradeOrder } from './services/tradeAdapter';
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

// Return server's public IP for exchange IP whitelisting
app.get('/api/exchange/server-ip', async (_req, res) => {
    const configuredIp = process.env.BACKEND_PUBLIC_IP;
    if (configuredIp) {
        return res.json({ ip: configuredIp });
    }
    // Auto-detect if not configured
    try {
        const resp = await fetch('https://api.ipify.org?format=json', {
            signal: AbortSignal.timeout(5000),
        });
        const data = await resp.json() as { ip: string };
        return res.json({ ip: data.ip });
    } catch {
        return res.json({ ip: null, error: 'Could not detect server IP' });
    }
});

// Test an exchange connection (routes to crypto or MT5 handler)
app.post('/api/exchange/test', async (req, res) => {
    const { exchange_key_id } = req.body;
    if (!exchange_key_id) {
        return res.status(400).json({ error: 'exchange_key_id is required' });
    }
    try {
        // Check which exchange type to determine handler
        const { data: row } = await supabaseAdmin
            .from('user_exchange_keys')
            .select('exchange')
            .eq('id', exchange_key_id)
            .single();

        if (!row) return res.status(404).json({ error: 'Connection not found' });

        const result = row.exchange === 'mt5'
            ? await testMT5Connection(exchange_key_id)
            : isIndianBroker(row.exchange)
              ? await testIndianBrokerConnection(exchange_key_id)
              : await testConnection(exchange_key_id);

        console.log(`[Exchange Test] Response for ${row.exchange}:`, JSON.stringify(result, null, 2));
        return res.json(result);
    } catch (err: any) {
        return res.status(500).json({ error: err.message || 'Test failed' });
    }
});

// Encrypt keys before storage (routes to crypto or MT5 handler)
app.post('/api/exchange/encrypt-keys', async (req, res) => {
    const { exchange_key_id } = req.body;
    if (!exchange_key_id) {
        return res.status(400).json({ error: 'exchange_key_id is required' });
    }
    try {
        // Check exchange type
        const { data: row } = await supabaseAdmin
            .from('user_exchange_keys')
            .select('exchange')
            .eq('id', exchange_key_id)
            .single();

        if (!row) return res.status(404).json({ error: 'Connection not found' });

        let encrypted: Record<string, any>;
        if (row.exchange === 'mt5') {
            const { mt5_login, mt5_password, mt5_server } = req.body;
            encrypted = encryptMT5Fields({ mt5_login, mt5_password, mt5_server });
        } else if (isIndianBroker(row.exchange)) {
            encrypted = encryptIndianBrokerFields(req.body);
        } else {
            const { api_key, api_secret, passphrase } = req.body;
            encrypted = encryptKeyFields({ api_key, api_secret, passphrase });
        }

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

// ── Trade execution endpoint ────────────────────────────

app.post('/api/trade/execute', async (req, res) => {
    const order = req.body as TradeOrder;
    if (!order.exchangeKeyId || !order.symbol || !order.side || !order.quantity) {
        return res.status(400).json({
            error: 'exchangeKeyId, symbol, side, quantity are required',
        });
    }
    try {
        const result = await executeTradeOrder(order);
        return res.status(result.ok ? 200 : 400).json(result);
    } catch (err: any) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

// ── OAuth flow endpoints ────────────────────────────────

// Check which OAuth brokers are configured
app.get('/api/oauth/status', (_req, res) => {
    res.json(getOAuthStatus());
});

// Upstox OAuth
app.get('/api/oauth/upstox/start', async (req, res) => {
    const { user_id, nickname, environment } = req.query as Record<string, string>;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    try {
        const url = getUpstoxAuthUrl(user_id, nickname || 'My Upstox', environment || 'live');
        return res.json({ url });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

app.get('/api/oauth/upstox/callback', async (req, res) => {
    const { code, state } = req.query as Record<string, string>;
    try {
        const result = await handleUpstoxCallback(code, state);
        return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?tab=Broker+Connect&connected=upstox&name=${encodeURIComponent(result.userName)}`);
    } catch (err: any) {
        return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?tab=Broker+Connect&error=${encodeURIComponent(err.message)}`);
    }
});

// Fyers OAuth
app.get('/api/oauth/fyers/start', async (req, res) => {
    const { user_id, nickname, environment } = req.query as Record<string, string>;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    try {
        const url = getFyersAuthUrl(user_id, nickname || 'My Fyers', environment || 'live');
        return res.json({ url });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

app.get('/api/oauth/fyers/callback', async (req, res) => {
    const { code, state, auth_code } = req.query as Record<string, string>;
    const authCode = code || auth_code; // Fyers uses auth_code param
    try {
        const result = await handleFyersCallback(authCode, state);
        return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?tab=Broker+Connect&connected=fyers&name=${encodeURIComponent(result.userName)}`);
    } catch (err: any) {
        return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?tab=Broker+Connect&error=${encodeURIComponent(err.message)}`);
    }
});

// Zerodha OAuth (ready for when kite.trade is registered)
app.get('/api/oauth/zerodha/start', async (req, res) => {
    const { user_id, nickname, environment } = req.query as Record<string, string>;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    try {
        const url = getZerodhaAuthUrl(user_id, nickname || 'My Zerodha', environment || 'live');
        return res.json({ url });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

app.get('/api/oauth/zerodha/callback', async (req, res) => {
    const { request_token, state } = req.query as Record<string, string>;
    try {
        const result = await handleZerodhaCallback(request_token, state);
        return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?tab=Broker+Connect&connected=zerodha&name=${encodeURIComponent(result.userName)}`);
    } catch (err: any) {
        return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?tab=Broker+Connect&error=${encodeURIComponent(err.message)}`);
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
