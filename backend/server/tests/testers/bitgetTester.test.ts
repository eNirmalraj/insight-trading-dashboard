import { testBitget } from '../../src/services/testers/bitgetTester';

jest.mock('ccxt', () => ({
    __esModule: true,
    default: {
        bitget: class {
            constructor(public opts: any) {}
            setSandboxMode = jest.fn();
            async fetchBalance() {
                if (this.opts.apiKey === 'bad') throw new Error('sign signature error');
                return { free: { USDT: '250' } };
            }
            async privateMixGetAccountAccounts() {
                return [{ marginCoin: 'USDT' }];
            }
        },
    },
    bitget: class {
        constructor(public opts: any) {}
        setSandboxMode = jest.fn();
        async fetchBalance() {
            if (this.opts.apiKey === 'bad') throw new Error('sign signature error');
            return { free: { USDT: '250' } };
        }
        async privateMixGetAccountAccounts() {
            return [{ marginCoin: 'USDT' }];
        }
    },
}));

describe('testBitget', () => {
    it('returns ok with Spot+Futures when both probes succeed', async () => {
        const r = await testBitget({
            id: '1', userId: 'u', broker: 'bitget', environment: 'mainnet',
            apiKey: 'good', apiSecret: 's', passphrase: 'p',
        } as any);
        expect(r.ok).toBe(true);
        expect(r.permissions).toEqual(expect.arrayContaining(['Spot Trading', 'Futures']));
    });
    it('returns ok:false on bad signature', async () => {
        const r = await testBitget({
            id: '1', userId: 'u', broker: 'bitget', environment: 'mainnet',
            apiKey: 'bad', apiSecret: 's', passphrase: 'p',
        } as any);
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/signature/);
    });
});
