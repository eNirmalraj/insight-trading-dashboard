// backend/server/tests/routes/brokerCredentials.test.ts
import express from 'express';
import request from 'supertest';

jest.mock('../../src/services/credentialHealth', () => ({
    testCredential: jest.fn(async (id: string) => {
        if (id === 'ok')  return { ok: true,  latencyMs: 123, permissions: ['Futures'] };
        if (id === 'bad') return { ok: false, latencyMs: 50,  permissions: [], error: 'Invalid Api-Key ID' };
        return { ok: false, latencyMs: 0, permissions: [], error: 'timeout' };
    }),
}));

jest.mock('../../src/services/supabaseAdmin', () => {
    const updateSpy = jest.fn().mockReturnValue({ eq: () => ({ eq: async () => ({ error: null }) }) });
    return {
        supabaseAdmin: {
            auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
            from: jest.fn(() => ({ update: updateSpy })),
            __updateSpy: updateSpy,
        },
    };
});

jest.mock('../../src/services/credentialBridge', () => ({
    credentialBridge: {
        listAllForUser: jest.fn(async () => []),
        getBrokerAndNetwork: jest.fn(async () => null),
        retrieveById: jest.fn(async () => null),
    },
}));

jest.mock('../../src/services/credentialVault', () => ({
    credentialVault: {
        store: jest.fn(async () => ({ id: 'new-id' })),
        retrieve: jest.fn(async () => null),
        remove: jest.fn(async () => {}),
        markVerified: jest.fn(async () => {}),
    },
}));

jest.mock('../../src/engine/brokerAdapters', () => ({
    getBrokerAdapter: jest.fn(() => ({ ping: jest.fn(async () => true) })),
}));

import brokerCredentialsRouter from '../../src/routes/brokerCredentials';

const app = express().use(express.json()).use('/api/broker-credentials', brokerCredentialsRouter);

describe('POST /api/broker-credentials/:id/test', () => {
    it('200 + ok:true + latency on success', async () => {
        const r = await request(app)
            .post('/api/broker-credentials/ok/test')
            .set('Authorization', 'Bearer x');
        expect(r.status).toBe(200);
        expect(r.body.ok).toBe(true);
        expect(r.body.latencyMs).toBeGreaterThan(0);
    });

    it('200 + ok:false + error when credential rejected', async () => {
        const r = await request(app)
            .post('/api/broker-credentials/bad/test')
            .set('Authorization', 'Bearer x');
        expect(r.status).toBe(200);
        expect(r.body.ok).toBe(false);
        expect(r.body.error).toMatch(/Invalid/);
    });

    it('401 when no bearer token', async () => {
        const r = await request(app).post('/api/broker-credentials/ok/test');
        expect(r.status).toBe(401);
    });
});

describe('POST /api/broker-credentials/test-batch', () => {
    it('returns a result for every id, distinguishing success from failure', async () => {
        const r = await request(app)
            .post('/api/broker-credentials/test-batch')
            .set('Authorization', 'Bearer x')
            .send({ ids: ['ok', 'bad', 'ok'] });
        expect(r.status).toBe(200);
        expect(Array.isArray(r.body.results)).toBe(true);
        expect(r.body.results).toHaveLength(3);
        expect(r.body.results[0].ok).toBe(true);
        expect(r.body.results[0].id).toBe('ok');
        expect(r.body.results[1].ok).toBe(false);
        expect(r.body.results[1].error).toMatch(/Invalid/);
        expect(r.body.results[2].ok).toBe(true);
    });

    it('returns empty array for empty ids', async () => {
        const r = await request(app)
            .post('/api/broker-credentials/test-batch')
            .set('Authorization', 'Bearer x')
            .send({ ids: [] });
        expect(r.status).toBe(200);
        expect(r.body.results).toEqual([]);
    });

    it('401 without bearer', async () => {
        const r = await request(app)
            .post('/api/broker-credentials/test-batch')
            .send({ ids: ['ok'] });
        expect(r.status).toBe(401);
    });
});

describe('POST /api/broker-credentials (create)', () => {
    const mockHealth = require('../../src/services/credentialHealth').testCredential as jest.Mock;
    const mockSupa = require('../../src/services/supabaseAdmin').supabaseAdmin;

    beforeEach(() => {
        mockHealth.mockReset();
        // Default the credentialVault.store mock to return a fake id.
        jest.doMock('../../src/services/credentialVault', () => ({
            credentialVault: {
                store: jest.fn(async () => ({ id: 'new-cred-id' })),
                retrieveById: jest.fn(async () => null),
                remove: jest.fn(async () => {}),
                markVerified: jest.fn(async () => {}),
            },
        }));
        // Reset supabase from() to return chainable update with no error, and delete too.
        mockSupa.from = jest.fn(() => ({
            update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
            delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
        }));
    });

    it('rejects missing broker', async () => {
        const r = await request(app)
            .post('/api/broker-credentials')
            .set('Authorization', 'Bearer x')
            .send({ nickname: 'X', environment: 'testnet' });
        expect(r.status).toBe(400);
        expect(r.body.code).toBe('validation');
        expect(r.body.field).toBe('broker');
    });

    it('rejects MT5 missing server', async () => {
        const r = await request(app)
            .post('/api/broker-credentials')
            .set('Authorization', 'Bearer x')
            .send({ broker: 'mt5', nickname: 'X', environment: 'demo',
                mt5Login: '1', mt5Password: 'pw' });
        expect(r.status).toBe(400);
        expect(r.body.field).toBe('mt5Server');
    });

    it('rejects Bitget without passphrase', async () => {
        const r = await request(app)
            .post('/api/broker-credentials')
            .set('Authorization', 'Bearer x')
            .send({ broker: 'bitget', nickname: 'X', environment: 'mainnet',
                apiKey: 'k', apiSecret: 's' });
        expect(r.status).toBe(400);
        expect(r.body.field).toBe('passphrase');
    });

    it('rejects unsupported broker', async () => {
        const r = await request(app)
            .post('/api/broker-credentials')
            .set('Authorization', 'Bearer x')
            .send({ broker: 'robinhood', nickname: 'X', environment: 'live', apiKey: 'k', apiSecret: 's' });
        expect(r.status).toBe(400);
        expect(r.body.field).toBe('broker');
    });
});
