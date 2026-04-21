// backend/server/src/routes/brokerCredentials.ts
// REST routes for managing user exchange credentials (Phase 1: Binance).

import type { Request, Response, Router } from 'express';
import express from 'express';
import { credentialVault } from '../services/credentialVault';
import { credentialBridge } from '../services/credentialBridge';
import { getBrokerAdapter } from '../engine/brokerAdapters';
import { supabaseAdmin } from '../services/supabaseAdmin';
import { testCredential } from '../services/credentialHealth';

const router: Router = express.Router();

// Resolve userId from Bearer token. Uses Supabase admin.getUser.
async function resolveUserId(req: Request): Promise<string | null> {
    const auth = req.header('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) return null;
    const { data } = await supabaseAdmin.auth.getUser(token);
    return data?.user?.id ?? null;
}

// GET /api/broker-credentials — list user's credentials (metadata only).
// Returns credentials from BOTH the legacy user_exchange_keys table (managed
// by the Broker Connect page) and the v2 vault table, so the Execute modal
// sees every connected broker regardless of where it was originally saved.
router.get('/', async (req: Request, res: Response) => {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    try {
        const rows = await credentialBridge.listAllForUser(userId);
        return res.json({ credentials: rows });
    } catch (err: any) {
        return res.status(500).json({ error: err?.message || 'list failed' });
    }
});

// POST /api/broker-credentials — store a new encrypted credential
router.post('/', async (req: Request, res: Response) => {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const { broker, network, nickname, apiKey, apiSecret } = req.body || {};
    if (!broker || !nickname || !apiKey || !apiSecret) {
        return res.status(400).json({ error: 'broker, nickname, apiKey, apiSecret required' });
    }
    const net = network === 'testnet' ? 'testnet' : 'mainnet';
    const env: 'testnet' | 'mainnet' = net;

    try {
        const { id } = await credentialVault.store({
            userId, broker, nickname, apiKey, apiSecret, environment: env,
        });

        // Update the network column (credentialVault.store doesn't know about it)
        await supabaseAdmin
            .from('user_exchange_keys_v2')
            .update({ network: net })
            .eq('id', id);

        return res.json({ id });
    } catch (err: any) {
        return res.status(500).json({ error: err?.message || 'store failed' });
    }
});

// POST /api/broker-credentials/:id/verify — call adapter.ping() to test.
// Works against both v2 and legacy credentials via the bridge.
router.post('/:id/verify', async (req: Request, res: Response) => {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const { id } = req.params;

    try {
        const meta = await credentialBridge.getBrokerAndNetwork(id, userId);
        if (!meta) return res.status(404).json({ error: 'credential not found' });

        const creds = await credentialBridge.retrieveById(id);
        if (!creds) return res.status(500).json({ error: 'decrypt failed' });

        const adapter = getBrokerAdapter(meta.broker);
        const ok = await adapter.ping(creds);

        if (ok && meta.source === 'v2') {
            await credentialVault.markVerified(id);
        }
        return res.json({ ok });
    } catch (err: any) {
        return res.status(500).json({ error: err?.message || 'verify failed' });
    }
});

// POST /api/broker-credentials/:id/test
// Runs a live health probe against the broker. Returns the TestResult directly.
// Persists last_test_status + error + permissions + last_verified_at — but NOT
// for transient failures (timeout, network) so a brief outage doesn't flip a
// working credential's badge to red.
router.post('/:id/test', async (req: Request, res: Response) => {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const { id } = req.params;
    const result = await testCredential(id);

    const transient = /timeout|fetch failed|ETIMEDOUT|ECONNRESET|ENOTFOUND/i
        .test(result.error ?? '');
    if (!transient) {
        const update: Record<string, unknown> = {
            last_test_status: result.ok ? 'success' : 'failed',
            last_test_error: result.ok ? null : (result.error ?? null),
            permissions: result.permissions,
        };
        if (result.ok) update.last_verified_at = new Date().toISOString();
        await supabaseAdmin
            .from('user_exchange_keys_v2')
            .update(update)
            .eq('id', id)
            .eq('user_id', userId);
    }

    return res.json(result);
});

// DELETE /api/broker-credentials/:id — removes from whichever table owns the id.
router.delete('/:id', async (req: Request, res: Response) => {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const { id } = req.params;
    try {
        const meta = await credentialBridge.getBrokerAndNetwork(id, userId);
        if (!meta) return res.status(404).json({ error: 'credential not found' });

        if (meta.source === 'v2') {
            await credentialVault.remove(id, userId);
        } else {
            const { error } = await supabaseAdmin
                .from('user_exchange_keys')
                .delete()
                .eq('id', id)
                .eq('user_id', userId);
            if (error) throw new Error(error.message);
        }
        return res.json({ ok: true });
    } catch (err: any) {
        return res.status(500).json({ error: err?.message || 'delete failed' });
    }
});

export default router;
