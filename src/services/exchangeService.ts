import { supabase } from './supabaseClient';
import { ExchangeKey, CreateExchangeKeyPayload } from '../types/exchange';

const db = () => {
    if (!supabase) throw new Error('Supabase not configured');
    return supabase;
};

// ── CRUD ────────────────────────────────────────────────

export const getExchangeKeys = async (): Promise<ExchangeKey[]> => {
    const { data, error } = await db()
        .from('user_exchange_keys')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []) as ExchangeKey[];
};

export const addExchangeKey = async (
    payload: CreateExchangeKeyPayload
): Promise<ExchangeKey> => {
    const {
        data: { user },
    } = await db().auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const isMT5 = payload.exchange === 'mt5';
    const isIndian = ['zerodha', 'angelone', 'upstox', 'dhan', 'fyers'].includes(payload.exchange);

    const insertRow: Record<string, any> = {
        user_id: user.id,
        exchange: payload.exchange,
        nickname: payload.nickname,
        environment: payload.environment,
        is_active: true,
        permissions: [],
        last_tested_at: null,
        last_test_status: null,
    };

    if (isMT5) {
        insertRow.api_key = payload.mt5_login || '';
        insertRow.api_secret = payload.mt5_password || '';
        insertRow.mt5_login = payload.mt5_login || '';
        insertRow.mt5_password = payload.mt5_password || '';
        insertRow.mt5_server = payload.mt5_server || '';
    } else if (isIndian) {
        insertRow.api_key = payload.api_key || payload.access_token || '';
        insertRow.api_secret = payload.api_secret || '';
        insertRow.client_id = payload.client_id || null;
        insertRow.access_token = payload.access_token || null;
        insertRow.totp_secret = payload.totp_secret || null;
        insertRow.passphrase = payload.password || null; // Angel One MPIN stored in passphrase
    } else {
        insertRow.api_key = payload.api_key;
        insertRow.api_secret = payload.api_secret;
        insertRow.passphrase = payload.passphrase || null;
    }

    const { data, error } = await db()
        .from('user_exchange_keys')
        .insert(insertRow)
        .select()
        .single();

    if (error) throw new Error(error.message);

    // Ask backend to encrypt the stored keys
    try {
        const encryptBody: Record<string, any> = { exchange_key_id: data.id };
        if (isMT5) {
            encryptBody.mt5_login = payload.mt5_login;
            encryptBody.mt5_password = payload.mt5_password;
            encryptBody.mt5_server = payload.mt5_server;
        } else if (isIndian) {
            encryptBody.api_key = payload.api_key;
            encryptBody.api_secret = payload.api_secret;
            encryptBody.client_id = payload.client_id;
            encryptBody.access_token = payload.access_token;
            encryptBody.totp_secret = payload.totp_secret;
            encryptBody.passphrase = payload.password;
        } else {
            encryptBody.api_key = payload.api_key;
            encryptBody.api_secret = payload.api_secret;
            encryptBody.passphrase = payload.passphrase || null;
        }
        await fetch('/api/exchange/encrypt-keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(encryptBody),
        });
    } catch {
        console.warn('Key encryption request failed (non-blocking)');
    }

    return data as ExchangeKey;
};

export const updateExchangeKey = async (
    id: string,
    updates: Partial<Pick<ExchangeKey, 'nickname' | 'environment' | 'api_key' | 'api_secret' | 'passphrase'>>
): Promise<void> => {
    const { error } = await db()
        .from('user_exchange_keys')
        .update(updates)
        .eq('id', id);

    if (error) throw new Error(error.message);

    // Re-encrypt if keys were updated
    if (updates.api_key || updates.api_secret) {
        try {
            await fetch('/api/exchange/encrypt-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    exchange_key_id: id,
                    api_key: updates.api_key,
                    api_secret: updates.api_secret,
                    passphrase: updates.passphrase || null,
                }),
            });
        } catch {
            console.warn('Key encryption request failed (non-blocking)');
        }
    }
};

export const deleteExchangeKey = async (id: string): Promise<void> => {
    const { error } = await db()
        .from('user_exchange_keys')
        .delete()
        .eq('id', id);

    if (error) throw new Error(error.message);
};

export const toggleExchangeKeyStatus = async (
    id: string,
    isActive: boolean
): Promise<void> => {
    const { error } = await db()
        .from('user_exchange_keys')
        .update({ is_active: isActive })
        .eq('id', id);

    if (error) throw new Error(error.message);
};

export const updateExchangeKeyTestResult = async (
    id: string,
    status: 'success' | 'failed',
    permissions: string[]
): Promise<void> => {
    const { error } = await db()
        .from('user_exchange_keys')
        .update({
            last_tested_at: new Date().toISOString(),
            last_test_status: status,
            permissions,
        })
        .eq('id', id);

    if (error) throw new Error(error.message);
};

// ── Test Connection ─────────────────────────────────────

export interface TestConnectionResult {
    ok: boolean;
    latencyMs: number;
    permissions: string[];
    balancePreview: { asset: string; free: string }[];
    accountInfo?: {
        broker: string;
        currency: string;
        leverage: number;
        name: string;
        server: string;
    } | null;
    error?: string;
}

/**
 * Tests an exchange API key by calling the exchange's account endpoint.
 * In production this should go through your backend to avoid exposing
 * secrets client-side. For now, it calls the backend test endpoint.
 */
export const testExchangeConnection = async (
    key: Pick<ExchangeKey, 'id' | 'exchange' | 'api_key'>
): Promise<TestConnectionResult> => {
    const start = performance.now();

    try {
        // Call backend endpoint that will use the stored credentials to test
        const response = await fetch('/api/exchange/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ exchange_key_id: key.id }),
            signal: AbortSignal.timeout(90_000), // MT5 via MetaApi can take up to 60s on first connect
        });

        const latencyMs = Math.round(performance.now() - start);

        if (!response.ok) {
            const err = await response.text().catch(() => 'Unknown error');
            return {
                ok: false,
                latencyMs,
                permissions: [],
                balancePreview: [],
                error: err,
            };
        }

        const data = await response.json();
        console.log('[Exchange Test] Backend response:', data);
        return {
            ok: true,
            latencyMs,
            permissions: data.permissions || [],
            balancePreview: data.balances?.slice(0, 5) || [],
            accountInfo: data.accountInfo || null,
        };
    } catch (err: any) {
        return {
            ok: false,
            latencyMs: Math.round(performance.now() - start),
            permissions: [],
            balancePreview: [],
            error:
                err?.name === 'TimeoutError'
                    ? 'Connection timed out (15s)'
                    : err?.message || 'Network error',
        };
    }
};
