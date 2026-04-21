// backend/server/src/engine/brokerAdapters/testers/binanceTester.ts
// Connection health test for Binance USD-M Futures. Routes testnet/demo
// environments to demo-fapi.binance.com (the testnet.binancefuture.com
// endpoint was retired by Binance; ccxt's setSandboxMode for binanceusdm
// now throws NotSupported).
//
// Returns a uniform TestResult: ok + latency + permissions + balancePreview.

import ccxt from 'ccxt';
import type { BrokerCredentialsFull } from '../../../services/credentialVault';
import type { TestResult } from '../../../services/credentialHealth';

const DEMO_FAPI_BASE = 'https://demo-fapi.binance.com';

function applyDemoRouting(client: any): void {
    client.urls.api.fapiPublic = `${DEMO_FAPI_BASE}/fapi/v1`;
    client.urls.api.fapiPublicV2 = `${DEMO_FAPI_BASE}/fapi/v2`;
    client.urls.api.fapiPublicV3 = `${DEMO_FAPI_BASE}/fapi/v3`;
    client.urls.api.fapiPrivate = `${DEMO_FAPI_BASE}/fapi/v1`;
    client.urls.api.fapiPrivateV2 = `${DEMO_FAPI_BASE}/fapi/v2`;
    client.urls.api.fapiPrivateV3 = `${DEMO_FAPI_BASE}/fapi/v3`;
    client.urls.api.fapiData = `${DEMO_FAPI_BASE}/futures/data`;
}

export async function testBinance(cred: BrokerCredentialsFull): Promise<TestResult> {
    const start = performance.now();
    const isTestnet = cred.environment === 'testnet' || cred.environment === 'demo';

    const client = new (ccxt as any).binanceusdm({
        apiKey: cred.apiKey,
        secret: cred.apiSecret,
        enableRateLimit: true,
        timeout: 10_000,
    });
    if (isTestnet) applyDemoRouting(client);

    try {
        const bal = await client.fetchBalance();

        const permissions: string[] = ['Futures'];
        try {
            const acc = await client.fapiPrivateV2GetAccount();
            if (acc?.canTrade) permissions.push('Futures Trading');
        } catch {
            // Permission probe is best-effort; fetchBalance already proved the key works.
        }

        const freeMap: Record<string, unknown> = (bal?.free && typeof bal.free === 'object')
            ? (bal.free as unknown as Record<string, unknown>)
            : {};
        const balancePreview = Object.entries(freeMap)
            .filter(([, v]) => Number(v) > 0)
            .sort(([, a], [, b]) => Number(b) - Number(a))
            .slice(0, 5)
            .map(([asset, free]) => ({
                asset,
                free: Number(free).toFixed(6).replace(/\.?0+$/, ''),
            }));

        return {
            ok: true,
            latencyMs: Math.round(performance.now() - start),
            permissions,
            balancePreview,
        };
    } catch (e: any) {
        return {
            ok: false,
            latencyMs: Math.round(performance.now() - start),
            permissions: [],
            error: e?.message ?? 'Binance test failed',
        };
    }
}
