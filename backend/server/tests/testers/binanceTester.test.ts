import { testBinance } from '../../src/engine/brokerAdapters/testers/binanceTester';

jest.mock('ccxt', () => ({
    __esModule: true,
    default: {
        binanceusdm: class {
            constructor(public opts: any) {}
            urls = { api: {} as any };
            async fetchBalance() {
                if (this.opts.apiKey === 'bad') {
                    throw new Error('binanceusdm {"code":-2008,"msg":"Invalid Api-Key ID."}');
                }
                return { free: { USDT: '1000', BTC: '0.5', ETH: '0' } };
            }
            async fapiPrivateV2GetAccount() {
                return { canTrade: true };
            }
        },
    },
    binanceusdm: class {
        constructor(public opts: any) {}
        urls = { api: {} as any };
        async fetchBalance() {
            if (this.opts.apiKey === 'bad') {
                throw new Error('binanceusdm {"code":-2008,"msg":"Invalid Api-Key ID."}');
            }
            return { free: { USDT: '1000', BTC: '0.5', ETH: '0' } };
        }
        async fapiPrivateV2GetAccount() {
            return { canTrade: true };
        }
    },
}));

const base = {
    id: '1', userId: 'u', broker: 'binance', environment: 'testnet',
    apiKey: 'good', apiSecret: 's',
};

describe('testBinance', () => {
    it('returns ok with Futures permissions when fetchBalance succeeds', async () => {
        const r = await testBinance(base as any);
        expect(r.ok).toBe(true);
        expect(r.permissions).toEqual(expect.arrayContaining(['Futures', 'Futures Trading']));
        expect(r.balancePreview?.[0]?.asset).toBe('USDT');
    });

    it('returns ok:false with the real Binance error message', async () => {
        const r = await testBinance({ ...base, apiKey: 'bad' } as any);
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/Invalid Api-Key ID/);
    });
});
