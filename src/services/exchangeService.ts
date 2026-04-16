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

    const { data, error } = await db()
        .from('user_exchange_keys')
        .insert({
            user_id: user.id,
            exchange: payload.exchange,
            nickname: payload.nickname,
            api_key: payload.api_key,
            api_secret: payload.api_secret,
            passphrase: payload.passphrase || null,
            environment: payload.environment,
            is_active: true,
            permissions: [],
            last_tested_at: null,
            last_test_status: null,
        })
        .select()
        .single();

    if (error) throw new Error(error.message);

    // Ask backend to encrypt the stored keys (keys were saved in plain via RLS insert,
    // backend re-encrypts them with the server-side encryption key)
    try {
        await fetch('/api/exchange/encrypt-keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                exchange_key_id: data.id,
                api_key: payload.api_key,
                api_secret: payload.api_secret,
                passphrase: payload.passphrase || null,
            }),
        });
    } catch {
        // Non-blocking — keys still work unencrypted
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
            signal: AbortSignal.timeout(15_000),
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
        return {
            ok: true,
            latencyMs,
            permissions: data.permissions || [],
            balancePreview: data.balances?.slice(0, 5) || [],
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
