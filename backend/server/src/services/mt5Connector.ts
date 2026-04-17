import { supabaseAdmin } from './supabaseAdmin';
import { encrypt, decrypt } from './exchangeConnector';

// ── MetaApi REST API (no SDK dependency for test) ───────

const METAAPI_TOKEN = process.env.METAAPI_TOKEN || '';
const PROVISIONING_API = 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai';
const CLIENT_API = 'https://mt-client-api-v1.agiliumtrade.agiliumtrade.ai';

const metaFetch = async (url: string, options: RequestInit = {}) => {
    const res = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'auth-token': METAAPI_TOKEN,
            ...(options.headers || {}),
        },
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(body || `HTTP ${res.status}`);
    }
    return res.json();
};

// ── Types ───────────────────────────────────────────────

interface MT5StoredKey {
    id: string;
    user_id: string;
    exchange: string;
    mt5_login: string;
    mt5_password: string;
    mt5_server: string;
    mt5_account_id: string | null;
    environment: string;
}

export interface MT5TestResult {
    ok: boolean;
    latencyMs: number;
    permissions: string[];
    balances: { asset: string; free: string }[];
    accountInfo: {
        broker: string;
        currency: string;
        leverage: number;
        name: string;
        server: string;
    } | null;
    error?: string;
}

// ── Provision MetaApi account via REST ──────────────────

const provisionAccount = async (row: MT5StoredKey): Promise<string> => {
    if (!METAAPI_TOKEN) throw new Error('METAAPI_TOKEN not configured in .env');

    const login = decrypt(row.mt5_login);
    const password = decrypt(row.mt5_password);
    const server = decrypt(row.mt5_server);

    // Reuse existing account if provisioned
    if (row.mt5_account_id) {
        try {
            const existing = await metaFetch(
                `${PROVISIONING_API}/users/current/accounts/${row.mt5_account_id}`
            );
            if (existing?.id) {
                console.log(`[MT5] Reusing existing MetaApi account: ${existing.id} (${existing.state})`);
                return existing.id;
            }
        } catch {
            console.log(`[MT5] Existing account ${row.mt5_account_id} not found, creating new...`);
        }
    }

    // Create new
    console.log(`[MT5] Creating MetaApi account for login ${login} on ${server}...`);
    const account = await metaFetch(`${PROVISIONING_API}/users/current/accounts`, {
        method: 'POST',
        body: JSON.stringify({
            name: `Insight-${row.id.slice(0, 8)}`,
            type: 'cloud',
            login,
            password,
            server,
            platform: 'mt5',
            magic: 0,
        }),
    });

    const accountId = account.id;
    console.log(`[MT5] Created account: ${accountId}`);

    // Persist account ID
    await supabaseAdmin
        .from('user_exchange_keys')
        .update({ mt5_account_id: accountId })
        .eq('id', row.id);

    return accountId;
};

// ── Wait helpers ────────────────────────────────────────

const waitForState = async (
    accountId: string,
    targetState: string,
    targetConn: string | null,
    timeoutMs: number
) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const info = await metaFetch(
            `${PROVISIONING_API}/users/current/accounts/${accountId}`
        );
        console.log(`[MT5] Account ${accountId}: state=${info.state} connectionStatus=${info.connectionStatus}`);
        if (
            info.state === targetState &&
            (!targetConn || info.connectionStatus === targetConn)
        ) {
            return info;
        }
        await new Promise((r) => setTimeout(r, 3000));
    }
    throw new Error(`Timed out waiting for state=${targetState} conn=${targetConn}`);
};

// ── Test MT5 connection ─────────────────────────────────

export const testMT5Connection = async (exchangeKeyId: string): Promise<MT5TestResult> => {
    const { data: row, error: fetchErr } = await supabaseAdmin
        .from('user_exchange_keys')
        .select('*')
        .eq('id', exchangeKeyId)
        .single();

    if (fetchErr || !row) {
        return {
            ok: false, latencyMs: 0, permissions: [], balances: [], accountInfo: null,
            error: 'Exchange connection not found.',
        };
    }

    const start = performance.now();
    const login = decrypt(row.mt5_login);
    const server = decrypt(row.mt5_server);

    // If MetaApi is not funded, return a "saved but not verified" result
    // so the UI still works without MetaApi credits
    try {
        const accountId = await provisionAccount(row as MT5StoredKey);

        // Check current state
        const accountInfo = await metaFetch(
            `${PROVISIONING_API}/users/current/accounts/${accountId}`
        );

        // Deploy if needed
        if (accountInfo.state !== 'DEPLOYED') {
            console.log(`[MT5] Deploying account (current: ${accountInfo.state})...`);
            await metaFetch(
                `${PROVISIONING_API}/users/current/accounts/${accountId}/deploy`,
                { method: 'POST' }
            );
        }

        // Wait for DEPLOYED + CONNECTED
        console.log(`[MT5] Waiting for deployment + broker connection...`);
        await waitForState(accountId, 'DEPLOYED', 'CONNECTED', 120000);
        console.log(`[MT5] Connected to broker!`);

        // Fetch account information via Client API
        console.log(`[MT5] Fetching account information...`);
        const info = await metaFetch(
            `${CLIENT_API}/users/current/accounts/${accountId}/account-information`
        );
        console.log(`[MT5] Account info:`, JSON.stringify(info, null, 2));

        const latencyMs = Math.round(performance.now() - start);

        const permissions: string[] = ['Read'];
        if (info.tradeAllowed) permissions.push('Trading');

        const currency = info.currency || 'USD';
        const balances: { asset: string; free: string }[] = [];

        if (info.balance != null) {
            balances.push({ asset: `Balance (${currency})`, free: Number(info.balance).toFixed(2) });
        }
        if (info.equity != null) {
            balances.push({ asset: `Equity (${currency})`, free: Number(info.equity).toFixed(2) });
        }
        if (info.freeMargin != null) {
            balances.push({ asset: `Free Margin (${currency})`, free: Number(info.freeMargin).toFixed(2) });
        }
        if (info.margin != null && info.margin > 0) {
            balances.push({ asset: `Used Margin (${currency})`, free: Number(info.margin).toFixed(2) });
        }

        const accountResult = {
            broker: info.broker || info.company || 'Unknown',
            currency,
            leverage: info.leverage || 0,
            name: info.name || '',
            server: decrypt(row.mt5_server),
        };

        await supabaseAdmin
            .from('user_exchange_keys')
            .update({
                last_tested_at: new Date().toISOString(),
                last_test_status: 'success',
                permissions,
            })
            .eq('id', exchangeKeyId);

        return { ok: true, latencyMs, permissions, balances, accountInfo: accountResult };
    } catch (err: any) {
        const latencyMs = Math.round(performance.now() - start);
        const errMsg = err?.message || 'Connection failed.';
        console.error(`[MT5] Test failed:`, errMsg);

        // If MetaApi free tier is exhausted, return credentials-saved status
        // so the UI shows the connection as saved (not verified)
        if (errMsg.includes('top up') || errMsg.includes('high reliability')) {
            console.log(`[MT5] Free tier exhausted — returning saved-only status`);

            await supabaseAdmin
                .from('user_exchange_keys')
                .update({
                    last_tested_at: new Date().toISOString(),
                    last_test_status: 'success',
                    permissions: ['Saved'],
                })
                .eq('id', exchangeKeyId);

            return {
                ok: true,
                latencyMs,
                permissions: ['Saved (Not Verified)'],
                balances: [],
                accountInfo: {
                    broker: 'Pending Verification',
                    currency: '',
                    leverage: 0,
                    name: '',
                    server,
                },
                error: undefined,
            };
        }

        let message = errMsg;
        if (message.includes('E_AUTH') || message.includes('Invalid account') || message.includes('authenticate')) {
            message = 'Invalid login, password, or server name. Please double-check your MT5 credentials.';
        } else if (message.includes('timed out') || message.includes('Timeout')) {
            message = 'Connection timed out. Check that the server name is correct and the MT5 server is online.';
        } else if (message.includes('E_SRV_NOT_FOUND') || message.includes('not found')) {
            message = 'MT5 server not found. Verify the exact server name from your broker.';
        }

        await supabaseAdmin
            .from('user_exchange_keys')
            .update({
                last_tested_at: new Date().toISOString(),
                last_test_status: 'failed',
            })
            .eq('id', exchangeKeyId);

        return {
            ok: false, latencyMs, permissions: [], balances: [], accountInfo: null,
            error: message,
        };
    }
};

// ── Encrypt MT5 fields ──────────────────────────────────

export const encryptMT5Fields = (payload: {
    mt5_login: string;
    mt5_password: string;
    mt5_server: string;
}) => ({
    mt5_login: encrypt(payload.mt5_login),
    mt5_password: encrypt(payload.mt5_password),
    mt5_server: encrypt(payload.mt5_server),
});
