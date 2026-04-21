// backend/server/tests/oauthFlows.test.ts
import { buildAuthorizeUrl } from '../src/services/oauthFlows';

beforeAll(() => {
    process.env.UPSTOX_REDIRECT_URI = 'https://app.example.com/api/broker-credentials/oauth/upstox/callback';
    process.env.FYERS_REDIRECT_URI = 'https://app.example.com/api/broker-credentials/oauth/fyers/callback';
});

describe('oauthFlows.buildAuthorizeUrl', () => {
    it('zerodha URL includes api_key and passes state in redirect_params', () => {
        const url = buildAuthorizeUrl('zerodha', { state: 'abc', clientId: 'myapikey' });
        expect(url).toMatch(/kite\.trade\/connect\/login/);
        expect(url).toMatch(/api_key=myapikey/);
        expect(url).toMatch(/v=3/);
        expect(url).toMatch(/redirect_params=state/);
    });

    it('upstox URL includes response_type and redirect_uri', () => {
        const url = buildAuthorizeUrl('upstox', { state: 'abc', clientId: 'cid' });
        expect(url).toContain('response_type=code');
        expect(url).toContain('redirect_uri=');
        expect(url).toContain('state=abc');
    });

    it('fyers URL includes response_type and redirect_uri', () => {
        const url = buildAuthorizeUrl('fyers', { state: 'abc', clientId: 'cid' });
        expect(url).toContain('response_type=code');
        expect(url).toContain('redirect_uri=');
    });
});
