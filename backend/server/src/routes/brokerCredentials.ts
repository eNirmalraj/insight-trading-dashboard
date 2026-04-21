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

type CreateBody = {
    broker: string;
    nickname: string;
    environment: 'testnet' | 'live' | 'mainnet' | 'demo';
    // crypto
    apiKey?: string;
    apiSecret?: string;
    passphrase?: string;
    // mt5
    mt5Login?: string;
    mt5Password?: string;
    mt5Server?: string;
    // indian brokers
    clientId?: string;
    accessToken?: string;
    totpSecret?: string;
};

const CRYPTO_BROKERS = ['binance', 'bitget'];
const INDIAN_BROKERS_DIRECT = ['angelone', 'dhan']; // non-OAuth Indian brokers
const INDIAN_BROKERS_OAUTH = ['zerodha', 'upstox', 'fyers'];
const VALID_ENVIRONMENTS = ['testnet', 'live', 'mainnet', 'demo'];

function validateCreate(b: CreateBody): { field?: string; error?: string } {
    if (!b.broker) return { field: 'broker', error: 'broker required' };
    if (!b.nickname) return { field: 'nickname', error: 'nickname required' };
    if (!VALID_ENVIRONMENTS.includes(b.environment)) {
        return { field: 'environment', error: 'environment must be testnet|live|mainnet|demo' };
    }

    if (CRYPTO_BROKERS.includes(b.broker)) {
        if (!b.apiKey) return { field: 'apiKey', error: 'apiKey required' };
        if (!b.apiSecret) return { field: 'apiSecret', error: 'apiSecret required' };
        if (b.broker === 'bitget' && !b.passphrase) {
            return { field: 'passphrase', error: 'passphrase required for Bitget' };
        }
    } else if (b.broker === 'mt5') {
        if (!b.mt5Login) return { field: 'mt5Login', error: 'mt5Login required' };
        if (!b.mt5Password) return { field: 'mt5Password', error: 'mt5Password required' };
        if (!b.mt5Server) return { field: 'mt5Server', error: 'mt5Server required' };
    } else if (INDIAN_BROKERS_DIRECT.includes(b.broker)) {
        if (!b.apiKey) return { field: 'apiKey', error: 'apiKey required' };
    } else if (INDIAN_BROKERS_OAUTH.includes(b.broker)) {
        // OAuth brokers go through /oauth/:broker/callback, not direct POST.
        return { field: 'broker', error: `${b.broker} must use OAuth flow (/oauth/${b.broker}/start)` };
    } else {
        return { field: 'broker', error: `unsupported broker: ${b.broker}` };
    }
    return {};
}

// POST /api/broker-credentials — store a new encrypted credential for any supported broker.
// Per-broker validation runs first. Then we store, run a live pre-persist test, and roll back
// if the broker rejects the credentials. OAuth brokers (zerodha/upstox/fyers) are rejected here
// with a redirect hint — they must go through /oauth/:broker/start.
// NOTE: store-then-test rollback path is verified manually in Task 26.
router.post('/', async (req: Request, res: Response) => {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const body = req.body as CreateBody;
    const v = validateCreate(body);
    if (v.error) {
        return res.status(400).json({ error: v.error, code: 'validation', field: v.field });
    }

    // Store first (encrypted). If the pre-persist test fails, roll back.
    const { id } = await credentialVault.store({
        userId,
        broker: body.broker,
        nickname: body.nickname,
        environment: body.environment,
        apiKey: body.apiKey,
        apiSecret: body.apiSecret,
        passphrase: body.passphrase,
        mt5Login: body.mt5Login,
        mt5Password: body.mt5Password,
        mt5Server: body.mt5Server,
        clientId: body.clientId,
        accessToken: body.accessToken,
        totpSecret: body.totpSecret,
    });

    // Pre-persist test. If the broker rejects the credential, delete the row
    // so the user doesn't end up with a Disconnected credential on day one.
    const test = await testCredential(id);
    if (!test.ok) {
        await supabaseAdmin
            .from('user_exchange_keys_v2')
            .delete()
            .eq('id', id)
            .eq('user_id', userId);
        return res.status(400).json({ error: test.error ?? 'test failed', code: 'adapter' });
    }

    // Persist permissions + verified timestamp.
    await supabaseAdmin
        .from('user_exchange_keys_v2')
        .update({
            last_test_status: 'success',
            last_test_error: null,
            last_verified_at: new Date().toISOString(),
            permissions: test.permissions,
        })
        .eq('id', id);

    return res.status(201).json({ id });
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

// POST /api/broker-credentials/test-batch
// Runs testCredential for every id in parallel. Promise.allSettled ensures
// a hung broker doesn't block responses for fast ones. Persistence is
// fire-and-forget with the same transient-filtering logic as /:id/test.
router.post('/test-batch', async (req: Request, res: Response) => {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const ids = Array.isArray(req.body?.ids) ? (req.body.ids as string[]) : [];
    if (ids.length === 0) return res.json({ results: [] });

    const settled = await Promise.allSettled(ids.map((id) => testCredential(id)));
    const results = settled.map((s, i) => ({
        id: ids[i],
        ...(s.status === 'fulfilled'
            ? s.value
            : { ok: false, latencyMs: 0, permissions: [], error: String(s.reason) }),
    }));

    // Fire-and-forget persistence. Errors are logged, not thrown, so the
    // response isn't held up waiting for DB writes.
    const TRANSIENT_RE = /timeout|fetch failed|ETIMEDOUT|ECONNRESET|ENOTFOUND/i;
    void Promise.all(results.map(async (r) => {
        if (TRANSIENT_RE.test(r.error ?? '')) return;
        const update: Record<string, unknown> = {
            last_test_status: r.ok ? 'success' : 'failed',
            last_test_error: r.ok ? null : (r.error ?? null),
            permissions: r.permissions,
        };
        if (r.ok) update.last_verified_at = new Date().toISOString();
        const { error } = await supabaseAdmin
            .from('user_exchange_keys_v2')
            .update(update)
            .eq('id', r.id)
            .eq('user_id', userId);
        if (error) console.warn('[test-batch] persist error:', error.message);
    })).catch((e) => console.warn('[test-batch] persist error:', e?.message));

    return res.json({ results });
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
