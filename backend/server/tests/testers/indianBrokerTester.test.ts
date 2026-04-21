import { testIndianBroker } from '../../src/engine/brokerAdapters/testers/indianBrokerTester';

const fakeFetch = jest.fn();
beforeEach(() => {
    fakeFetch.mockReset();
    global.fetch = fakeFetch as any;
});

describe('testIndianBroker', () => {
    it('zerodha: ok:true with products returned as permissions', async () => {
        fakeFetch.mockResolvedValue({
            ok: true, status: 200,
            json: async () => ({ data: { user_name: 'N', products: ['MIS', 'NRML'] } }),
        });
        const r = await testIndianBroker({
            id: '1', userId: 'u', broker: 'zerodha', environment: 'live',
            apiKey: 'k', accessToken: 't',
        } as any);
        expect(r.ok).toBe(true);
        expect(r.permissions).toEqual(expect.arrayContaining(['MIS', 'NRML']));
    });

    it('fyers: ok:false on 401 token expired', async () => {
        fakeFetch.mockResolvedValue({
            ok: false, status: 401,
            text: async () => 'Token expired',
        });
        const r = await testIndianBroker({
            id: '1', userId: 'u', broker: 'fyers', environment: 'live',
            apiKey: 'k', accessToken: 'expired',
        } as any);
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/expired|401/i);
    });

    it('dhan: ok:true default permissions when no products in body', async () => {
        fakeFetch.mockResolvedValue({
            ok: true, status: 200,
            json: async () => ({ accountType: 'individual' }),
        });
        const r = await testIndianBroker({
            id: '1', userId: 'u', broker: 'dhan', environment: 'live',
            apiKey: 'k', accessToken: 't',
        } as any);
        expect(r.ok).toBe(true);
        expect(r.permissions).toEqual(expect.arrayContaining(['Read', 'Trade']));
    });

    it('unsupported broker returns ok:false with message', async () => {
        const r = await testIndianBroker({
            id: '1', userId: 'u', broker: 'unknown', environment: 'live',
        } as any);
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/unsupported/i);
    });
});
