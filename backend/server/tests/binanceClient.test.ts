import { buildBinanceFutures } from '../src/services/exchangeConnector';

describe('buildBinanceFutures', () => {
    it('uses live fapi URL by default', () => {
        const ex = buildBinanceFutures('test-key', 'test-secret', 'live');
        const urls = ex.urls['api'] as Record<string, string>;
        expect(urls['fapiPrivate']).toContain('fapi.binance.com');
        expect(urls['fapiPrivate']).not.toContain('demo-fapi');
    });

    it('uses demo-fapi URL when env is demo', () => {
        const ex = buildBinanceFutures('test-key', 'test-secret', 'demo');
        const urls = ex.urls['api'] as Record<string, string>;
        expect(urls['fapiPrivate']).toBe('https://demo-fapi.binance.com/fapi/v1');
        expect(urls['fapiPublic']).toBe('https://demo-fapi.binance.com/fapi/v1');
        expect(urls['fapiPrivateV2']).toBe('https://demo-fapi.binance.com/fapi/v2');
        expect(urls['fapiPublicV2']).toBe('https://demo-fapi.binance.com/fapi/v2');
        // V3 endpoints come for free from ccxt's canonical urls.demo block.
        expect(urls['fapiPrivateV3']).toBe('https://demo-fapi.binance.com/fapi/v3');
        expect(urls['fapiPublicV3']).toBe('https://demo-fapi.binance.com/fapi/v3');
    });

    it('configures futures as the default type', () => {
        const ex = buildBinanceFutures('test-key', 'test-secret', 'live');
        expect((ex as any).options?.defaultType).toBe('future');
    });
});
