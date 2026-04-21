import { testMT5 } from '../../src/engine/brokerAdapters/testers/mt5Tester';

jest.mock('metaapi.cloud-sdk', () => {
    return {
        __esModule: true,
        default: class MockMetaApi {
            constructor(public token: string) {}
            metatraderAccountApi = {
                createAccount: async (params: any) => ({
                    id: 'fake-mt5-id',
                    deploy: async () => {},
                    waitConnected: async () => {},
                    getAccountInformation: async () => {
                        if (params.login === 'bad') throw new Error('login failed');
                        return {
                            broker: 'FakeBroker',
                            currency: 'USD',
                            balance: 1000,
                            leverage: 100,
                            name: 'Test',
                            server: params.server,
                        };
                    },
                    remove: async () => {},
                }),
            };
        },
    };
});

beforeAll(() => { process.env.METAAPI_TOKEN = 'fake-token-for-tests'; });

describe('testMT5', () => {
    it('returns ok with Trade permission on success', async () => {
        const r = await testMT5({
            id: '1', userId: 'u', broker: 'mt5', environment: 'demo',
            mt5Login: '12345', mt5Password: 'pw', mt5Server: 'ICMarkets-Demo',
        } as any);
        expect(r.ok).toBe(true);
        expect(r.permissions).toContain('Trade');
        expect(r.balancePreview?.[0]).toEqual({ asset: 'USD', free: '1000' });
    });

    it('returns ok:false on MetaAPI failure', async () => {
        const r = await testMT5({
            id: '1', userId: 'u', broker: 'mt5', environment: 'demo',
            mt5Login: 'bad', mt5Password: 'pw', mt5Server: 'ICMarkets-Demo',
        } as any);
        expect(r.ok).toBe(false);
    });

    it('returns ok:false when MT5 fields are missing', async () => {
        const r = await testMT5({
            id: '1', userId: 'u', broker: 'mt5', environment: 'demo',
        } as any);
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/login|password|server/i);
    });
});
