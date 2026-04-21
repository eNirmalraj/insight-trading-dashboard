// Health probe for Indian brokers (Zerodha, Angel One, Upstox, Dhan, Fyers).
// Each broker has a different /profile-style endpoint with different auth
// header shape. Success (2xx) → ok:true with permissions (from the body
// where the broker exposes them, else ['Read','Trade'] as a sane default).
// 401 is surfaced distinctly so the frontend can show "Re-authorize".

import type { BrokerCredentialsFull } from '../../../services/credentialVault';
import type { TestResult } from '../../../services/credentialHealth';

interface Probe { url: string; headers: Record<string, string>; }

function probeOf(cred: BrokerCredentialsFull): Probe | null {
    switch (cred.broker) {
        case 'zerodha':
            return {
                url: 'https://api.kite.trade/user/profile',
                headers: {
                    'X-Kite-Version': '3',
                    Authorization: `token ${cred.apiKey}:${cred.accessToken}`,
                },
            };
        case 'upstox':
            return {
                url: 'https://api.upstox.com/v2/user/profile',
                headers: {
                    Authorization: `Bearer ${cred.accessToken}`,
                    Accept: 'application/json',
                },
            };
        case 'fyers':
            return {
                url: 'https://api.fyers.in/api/v2/profile',
                headers: { Authorization: `${cred.apiKey}:${cred.accessToken}` },
            };
        case 'angelone':
            return {
                url: 'https://apiconnect.angelbroking.com/rest/secure/angelbroking/user/v1/getProfile',
                headers: {
                    'X-PrivateKey': cred.apiKey ?? '',
                    'X-UserType': 'USER',
                    'X-SourceID': 'WEB',
                    Authorization: `Bearer ${cred.accessToken}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
            };
        case 'dhan':
            return {
                url: 'https://api.dhan.co/fundlimit',
                headers: { 'access-token': cred.accessToken ?? cred.apiKey ?? '' },
            };
        default:
            return null;
    }
}

export async function testIndianBroker(cred: BrokerCredentialsFull): Promise<TestResult> {
    const start = performance.now();
    const probe = probeOf(cred);
    if (!probe) {
        return {
            ok: false, latencyMs: 0, permissions: [],
            error: `Unsupported broker: ${cred.broker}`,
        };
    }

    try {
        const r = await fetch(probe.url, {
            headers: probe.headers,
            signal: AbortSignal.timeout(10_000),
        });
        const latencyMs = Math.round(performance.now() - start);

        if (!r.ok) {
            const text = await r.text().catch(() => String(r.status));
            const message = r.status === 401
                ? `Token expired (401)`
                : text.slice(0, 200);
            return { ok: false, latencyMs, permissions: [], error: message };
        }

        const body = await r.json().catch(() => ({}));
        const fromBody = Array.isArray(body?.data?.products) ? (body.data.products as string[]) : [];
        const permissions = fromBody.length > 0 ? fromBody : ['Read', 'Trade'];
        return { ok: true, latencyMs, permissions };
    } catch (e: any) {
        return {
            ok: false,
            latencyMs: Math.round(performance.now() - start),
            permissions: [],
            error: e?.message ?? 'Indian broker test failed',
        };
    }
}
