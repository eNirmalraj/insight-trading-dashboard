// backend/server/src/services/credentialHealth.ts
// Unified health-check dispatcher. Given a credential id, loads the secret
// from the vault and routes to the correct per-broker tester. Returns a
// TestResult with a uniform shape so route handlers and batch endpoints
// can persist outcomes without knowing broker specifics.

import { credentialVault, BrokerCredentialsFull } from './credentialVault';

export interface TestResult {
    ok: boolean;
    latencyMs: number;
    permissions: string[];
    error?: string;
    balancePreview?: { asset: string; free: string }[];
}

type Tester = (cred: BrokerCredentialsFull) => Promise<TestResult>;

// Lazy imports keep tests fast and let callers mock individual testers.
async function dispatcher(broker: string): Promise<Tester> {
    switch (broker) {
        case 'binance': return (await import('./testers/binanceTester')).testBinance;
        case 'bitget':  return (await import('./testers/bitgetTester')).testBitget;
        case 'mt5':     return (await import('./testers/mt5Tester')).testMT5;
        case 'zerodha':
        case 'angelone':
        case 'upstox':
        case 'dhan':
        case 'fyers':
            return (await import('./testers/indianBrokerTester')).testIndianBroker;
        default:
            throw new Error(`Unsupported broker: ${broker}`);
    }
}

export async function testCredential(id: string): Promise<TestResult> {
    const cred = await credentialVault.retrieveById(id);
    if (!cred) {
        return { ok: false, latencyMs: 0, permissions: [], error: 'Credential not found' };
    }
    try {
        const tester = await dispatcher(cred.broker);
        return await tester(cred);
    } catch (e: any) {
        return { ok: false, latencyMs: 0, permissions: [], error: e?.message ?? 'unknown error' };
    }
}
