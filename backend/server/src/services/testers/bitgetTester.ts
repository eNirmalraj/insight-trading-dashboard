// backend/server/src/engine/brokerAdapters/testers/bitgetTester.ts
// Bitget spot + USD-M futures health check. Uses the passphrase credential
// (Bitget's third field) in addition to apiKey/secret. Testnet supported
// via ccxt's setSandboxMode (Bitget's sandbox is still live, unlike Binance's).

import ccxt from 'ccxt';
import type { BrokerCredentialsFull } from '../credentialVault';
import type { TestResult } from '../credentialHealth';

export async function testBitget(cred: BrokerCredentialsFull): Promise<TestResult> {
    const start = performance.now();

    const client = new (ccxt as any).bitget({
        apiKey: cred.apiKey,
        secret: cred.apiSecret,
        password: cred.passphrase,
        enableRateLimit: true,
        timeout: 10_000,
    });
    if (cred.environment === 'testnet' || cred.environment === 'demo') {
        client.setSandboxMode(true);
    }

    try {
        const bal = await client.fetchBalance();

        const permissions: string[] = ['Spot Trading'];
        try {
            await client.privateMixGetAccountAccounts({ productType: 'umcbl' });
            permissions.push('Futures');
        } catch {
            // No futures permission; best-effort probe.
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
            error: e?.message ?? 'Bitget test failed',
        };
    }
}
