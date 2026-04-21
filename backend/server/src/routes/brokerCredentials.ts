// backend/server/src/routes/brokerCredentials.ts
// REST routes for managing user exchange credentials (Phase 1: Binance).

import type { Request, Response, Router } from 'express';
import express from 'express';
import { credentialVault } from '../services/credentialVault';
import { supabaseAdmin } from '../services/supabaseAdmin';
import { testCredential } from '../services/credentialHealth';
import { buildAuthorizeUrl, exchangeCode, OauthBroker } from '../services/oauthFlows';
import crypto from 'crypto';

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
// Reads user_exchange_keys_v2 directly (legacy table dropped in Task 25).
// Adds api_key_preview by decrypting each row in memory; decrypt failures
// become empty preview strings — the row is still valid for display.
router.get('/', async (req: Request, res: Response) => {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    try {
        const { data: rows, error } = await supabaseAdmin
            .from('user_exchange_keys_v2')
            .select('id, broker, nickname, environment, is_active, last_test_status, last_test_error, last_verified_at, permissions')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
        if (error) return res.status(500).json({ error: error.message });

        // Add api_key_preview by decrypting each row and taking the last 4 chars
        // of whatever identity field is primary for that broker. Decrypt
        // failures become empty preview strings (row still displays).
        const credentials = await Promise.all((rows ?? []).map(async (row) => {
            let preview = '';
            try {
                const full = await credentialVault.retrieveById(row.id);
                const identity = full?.apiKey ?? full?.mt5Login ?? full?.clientId ?? '';
                preview = identity ? `***${identity.slice(-4)}` : '';
            } catch {
                preview = '';
            }
            return {
                id: row.id,
                broker: row.broker,
                nickname: row.nickname,
                environment: row.environment,
                is_active: row.is_active,
                last_test_status: row.last_test_status,
                last_test_error: row.last_test_error,
                last_verified_at: row.last_verified_at,
                permissions: row.permissions ?? [],
                api_key_preview: preview,
            };
        }));
        return res.json({ credentials });
    } catch (err: any) {
        return res.status(500).json({ error: err?.message ?? 'list failed' });
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

// PATCH /api/broker-credentials/:id
// Edit nickname/environment. Sensitive-key rotation goes through credential
// re-encryption + re-test (so a fat-fingered key update doesn't leave a
// broken connection quietly marked Connected). Skip rotation here if the
// client sent only nickname/environment fields.
router.patch('/:id', async (req: Request, res: Response) => {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const { id } = req.params;
    const body = (req.body ?? {}) as Record<string, unknown>;

    const patch: Record<string, unknown> = {};
    if (typeof body.nickname === 'string') patch.nickname = body.nickname;
    if (typeof body.environment === 'string') {
        if (!['testnet', 'live', 'mainnet', 'demo'].includes(body.environment)) {
            return res.status(400).json({
                error: 'environment must be testnet|live|mainnet|demo',
                code: 'validation',
                field: 'environment',
            });
        }
        patch.environment = body.environment;
    }

    if (Object.keys(patch).length > 0) {
        const { error } = await supabaseAdmin
            .from('user_exchange_keys_v2')
            .update(patch)
            .eq('id', id)
            .eq('user_id', userId);
        if (error) return res.status(500).json({ error: error.message });
    }

    // Key rotation is a post-MVP enhancement — route supports nickname/env
    // edits today. Rotating keys should delete + recreate via the add wizard.
    return res.json({ id });
});

// DELETE /api/broker-credentials/:id
// Hard-deletes from user_exchange_keys_v2. Blocked with HTTP 409 if any
// signal_executions.status='Active' still reference this credential — the
// frontend surfaces this as "Close the execution first" rather than orphaning
// a live trade.
router.delete('/:id', async (req: Request, res: Response) => {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const { id } = req.params;

    const { data: active, error: activeErr } = await supabaseAdmin
        .from('signal_executions')
        .select('id')
        .eq('broker_credential_id', id)
        .eq('status', 'Active');
    if (activeErr) return res.status(500).json({ error: activeErr.message });
    if (active && active.length > 0) {
        return res.status(409).json({
            error: `${active.length} active execution${active.length === 1 ? '' : 's'} still use this credential`,
            code: 'active_executions',
            count: active.length,
        });
    }

    const { error } = await supabaseAdmin
        .from('user_exchange_keys_v2')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
});

// In-memory OAuth state store, 5-minute TTL. For multi-instance production
// this must become Redis or a DB table; single-process dev + small deployments
// work fine with memory and opportunistic cleanup on new-state insert.
interface OauthState {
    userId: string;
    broker: OauthBroker;
    nickname: string;
    clientId: string;
    clientSecret: string;
    expiresAt: number;
}
const oauthStates = new Map<string, OauthState>();

function pruneExpiredOauthStates(): void {
    const now = Date.now();
    for (const [k, v] of oauthStates.entries()) {
        if (v.expiresAt < now) oauthStates.delete(k);
    }
}

// POST /api/broker-credentials/oauth/:broker/start
// Begins an OAuth flow for Zerodha/Upstox/Fyers. Caller supplies nickname,
// clientId (the API key), and clientSecret (the API secret from the broker
// developer portal). Returns an authorize URL; the caller redirects the user
// there, completes login, and the broker posts back to /callback with ?code=.
router.post('/oauth/:broker/start', async (req: Request, res: Response) => {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const broker = req.params.broker as OauthBroker;
    if (!['zerodha', 'upstox', 'fyers'].includes(broker)) {
        return res.status(400).json({ error: 'non-OAuth broker', code: 'validation' });
    }

    const { nickname, clientId, clientSecret } = (req.body ?? {}) as
        { nickname?: string; clientId?: string; clientSecret?: string };
    if (!nickname || !clientId || !clientSecret) {
        return res.status(400).json({
            error: 'nickname, clientId, clientSecret required',
            code: 'validation',
        });
    }

    pruneExpiredOauthStates();
    const state = crypto.randomBytes(16).toString('hex');
    oauthStates.set(state, {
        userId, broker, nickname, clientId, clientSecret,
        expiresAt: Date.now() + 5 * 60_000,
    });

    try {
        const authorizeUrl = buildAuthorizeUrl(broker, { state, clientId });
        return res.json({ authorizeUrl });
    } catch (e: any) {
        return res.status(500).json({ error: e?.message ?? 'failed to build authorize URL' });
    }
});

// POST /api/broker-credentials/oauth/:broker/callback
// Exchange the authorization code for an access token, store the credential,
// run a pre-persist test, roll back on failure (same pattern as regular POST).
router.post('/oauth/:broker/callback', async (req: Request, res: Response) => {
    const broker = req.params.broker as OauthBroker;
    const { code, state } = (req.body ?? {}) as { code?: string; state?: string };
    if (!code || !state) return res.status(400).json({ error: 'code + state required' });

    const entry = oauthStates.get(state);
    if (!entry || entry.expiresAt < Date.now() || entry.broker !== broker) {
        return res.status(400).json({ error: 'invalid or expired state' });
    }
    oauthStates.delete(state);

    try {
        const { accessToken } = await exchangeCode(broker, {
            code, clientId: entry.clientId, clientSecret: entry.clientSecret,
        });

        const { id } = await credentialVault.store({
            userId: entry.userId,
            broker, nickname: entry.nickname, environment: 'live',
            apiKey: entry.clientId, accessToken,
        });

        const result = await testCredential(id);
        if (!result.ok) {
            await supabaseAdmin
                .from('user_exchange_keys_v2')
                .delete()
                .eq('id', id)
                .eq('user_id', entry.userId);
            return res.status(400).json({ error: result.error ?? 'test failed', code: 'adapter' });
        }

        await supabaseAdmin
            .from('user_exchange_keys_v2')
            .update({
                last_test_status: 'success',
                last_test_error: null,
                last_verified_at: new Date().toISOString(),
                permissions: result.permissions,
            })
            .eq('id', id);

        return res.status(201).json({ id });
    } catch (e: any) {
        return res.status(400).json({ error: e?.message ?? 'oauth exchange failed' });
    }
});

export default router;
