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
