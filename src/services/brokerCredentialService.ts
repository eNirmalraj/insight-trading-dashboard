import { db } from './supabaseClient';

export type BrokerId = 'binance' | 'bitget' | 'mt5' | 'zerodha' | 'angelone' | 'upstox' | 'dhan' | 'fyers';
export type Environment = 'testnet' | 'live' | 'mainnet' | 'demo';

export interface BrokerCredentialInfo {
    id: string;
    broker: BrokerId;
    nickname: string;
    environment: Environment | null;
    is_active: boolean;
    last_test_status: 'success' | 'failed' | null;
    last_test_error: string | null;
    last_verified_at: string | null;
    permissions: string[];
    api_key_preview: string;
}

export interface TestResult {
    ok: boolean;
    latencyMs: number;
    permissions: string[];
    error?: string;
    balancePreview?: { asset: string; free: string }[];
}

async function authHeader(): Promise<Record<string, string>> {
    const { data } = await db().auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function listBrokerCredentials(): Promise<BrokerCredentialInfo[]> {
    const r = await fetch('/api/broker-credentials', { headers: await authHeader() });
    if (!r.ok) throw new Error(await r.text());
    return (await r.json()).credentials;
}

export interface CreateBody {
    broker: BrokerId;
    nickname: string;
    environment: Environment;
    apiKey?: string;
    apiSecret?: string;
    passphrase?: string;
    mt5Login?: string;
    mt5Password?: string;
    mt5Server?: string;
    clientId?: string;
    accessToken?: string;
    totpSecret?: string;
}

export async function createBrokerCredential(body: CreateBody): Promise<{ id: string } | { error: string; field?: string; code?: string }> {
    const r = await fetch('/api/broker-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) return { error: data.error, field: data.field, code: data.code };
    return { id: data.id };
}

export async function patchBrokerCredential(id: string, body: { nickname?: string; environment?: Environment }): Promise<{ id: string } | { error: string; field?: string; code?: string }> {
    const r = await fetch(`/api/broker-credentials/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) return { error: data.error, field: data.field, code: data.code };
    return { id: data.id };
}

export async function deleteBrokerCredential(id: string): Promise<{ ok: true } | { error: string; code?: string; count?: number }> {
    const r = await fetch(`/api/broker-credentials/${id}`, { method: 'DELETE', headers: await authHeader() });
    const data = await r.json();
    if (!r.ok) return { error: data.error, code: data.code, count: data.count };
    return { ok: true };
}

export async function testBrokerCredential(id: string): Promise<TestResult> {
    const r = await fetch(`/api/broker-credentials/${id}/test`, { method: 'POST', headers: await authHeader() });
    if (!r.ok) {
        const text = await r.text().catch(() => 'failed');
        return { ok: false, latencyMs: 0, permissions: [], error: text };
    }
    return r.json();
}

export async function testBrokerBatch(ids: string[]): Promise<Array<TestResult & { id: string }>> {
    if (ids.length === 0) return [];
    const r = await fetch('/api/broker-credentials/test-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ ids }),
    });
    if (!r.ok) return ids.map((id) => ({ id, ok: false, latencyMs: 0, permissions: [], error: 'batch test failed' }));
    return (await r.json()).results;
}

export async function startOAuth(broker: 'zerodha' | 'upstox' | 'fyers', nickname: string, clientId: string, clientSecret: string): Promise<{ authorizeUrl: string } | { error: string }> {
    const r = await fetch(`/api/broker-credentials/oauth/${broker}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ nickname, clientId, clientSecret }),
    });
    const data = await r.json();
    if (!r.ok) return { error: data.error };
    return { authorizeUrl: data.authorizeUrl };
}

export async function completeOAuth(broker: 'zerodha' | 'upstox' | 'fyers', code: string, state: string): Promise<{ id: string } | { error: string }> {
    const r = await fetch(`/api/broker-credentials/oauth/${broker}/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ code, state }),
    });
    const data = await r.json();
    if (!r.ok) return { error: data.error };
    return { id: data.id };
}

export async function executeSignalLive(params: {
    signalId: string;
    brokerCredentialId: string | null;
    sizingMode: 'fixed_notional' | 'risk_pct' | 'risk_fixed' | 'fixed_qty';
    sizingParams: { notional?: number; riskPct?: number; riskFixed?: number; fixedQty?: number };
    leverage: number;
}): Promise<{ executionId: string }> {
    const r = await fetch('/api/execute-signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify(params),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'execute failed');
    return data;
}
