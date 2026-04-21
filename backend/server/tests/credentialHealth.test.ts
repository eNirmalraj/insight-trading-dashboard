// backend/server/tests/credentialHealth.test.ts
import { testCredential } from '../src/services/credentialHealth';

jest.mock('../src/services/credentialVault', () => ({
    credentialVault: {
        retrieveById: jest.fn(async (id: string) => {
            if (id === 'missing') return null;
            return { id, userId: 'u', broker: 'binance', environment: 'testnet',
                     apiKey: 'k', apiSecret: 's' };
        }),
    },
}));

jest.mock('../src/engine/brokerAdapters/testers/binanceTester', () => ({
    testBinance: jest.fn(async () => ({ ok: true, latencyMs: 100, permissions: ['Futures'] })),
}));

describe('credentialHealth.testCredential', () => {
    it('returns not-found for unknown id', async () => {
        const r = await testCredential('missing');
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/not found/i);
    });

    it('dispatches binance broker to testBinance', async () => {
        const r = await testCredential('any');
        expect(r.ok).toBe(true);
        expect(r.permissions).toContain('Futures');
    });
});
