// backend/server/src/services/oauthFlows.ts
// Per-broker OAuth URL builders and authorization-code exchange helpers.
// Zerodha/Upstox/Fyers are the 3 Indian brokers we support via OAuth
// (Angel One and Dhan take direct API keys).
//
// Each broker has quirks: Zerodha doesn't accept a plain `state` parameter
// — it forwards query params through the `redirect_params` field. Upstox
// and Fyers take redirect_uri + response_type=code as standard OAuth.
// Token exchange signatures differ: Zerodha/Fyers use SHA-256 checksums;
// Upstox uses a standard client_secret grant.

export type OauthBroker = 'zerodha' | 'upstox' | 'fyers';

export interface AuthorizeParams {
    state: string;
    clientId: string;
}

export function buildAuthorizeUrl(broker: OauthBroker, p: AuthorizeParams): string {
    switch (broker) {
        case 'zerodha': {
            const u = new URL('https://kite.trade/connect/login');
            u.searchParams.set('api_key', p.clientId);
            u.searchParams.set('v', '3');
            u.searchParams.set('redirect_params', `state=${encodeURIComponent(p.state)}`);
            return u.toString();
        }
        case 'upstox': {
            const redirect = process.env.UPSTOX_REDIRECT_URI;
            if (!redirect) throw new Error('UPSTOX_REDIRECT_URI env var not set');
            const u = new URL('https://api.upstox.com/v2/login/authorization/dialog');
            u.searchParams.set('client_id', p.clientId);
            u.searchParams.set('redirect_uri', redirect);
            u.searchParams.set('response_type', 'code');
            u.searchParams.set('state', p.state);
            return u.toString();
        }
        case 'fyers': {
            const redirect = process.env.FYERS_REDIRECT_URI;
            if (!redirect) throw new Error('FYERS_REDIRECT_URI env var not set');
            const u = new URL('https://api.fyers.in/api/v2/generate-authcode');
            u.searchParams.set('client_id', p.clientId);
            u.searchParams.set('redirect_uri', redirect);
            u.searchParams.set('response_type', 'code');
            u.searchParams.set('state', p.state);
            return u.toString();
        }
    }
}

export interface ExchangeResult { accessToken: string; }

export async function exchangeCode(broker: OauthBroker, params: {
    code: string; clientId: string; clientSecret: string;
}): Promise<ExchangeResult> {
    switch (broker) {
        case 'zerodha': {
            const crypto = await import('crypto');
            const checksum = crypto
                .createHash('sha256')
                .update(params.clientId + params.code + params.clientSecret)
                .digest('hex');
            const r = await fetch('https://api.kite.trade/session/token', {
                method: 'POST',
                headers: {
                    'X-Kite-Version': '3',
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    api_key: params.clientId,
                    request_token: params.code,
                    checksum,
                }),
            });
            if (!r.ok) throw new Error(`zerodha token exchange: ${r.status} ${await r.text()}`);
            const body = await r.json() as { data?: { access_token?: string } };
            const accessToken = body.data?.access_token;
            if (!accessToken) throw new Error('zerodha: no access_token in response');
            return { accessToken };
        }
        case 'upstox': {
            const redirect = process.env.UPSTOX_REDIRECT_URI;
            if (!redirect) throw new Error('UPSTOX_REDIRECT_URI env var not set');
            const r = await fetch('https://api.upstox.com/v2/login/authorization/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Accept: 'application/json',
                },
                body: new URLSearchParams({
                    code: params.code,
                    client_id: params.clientId,
                    client_secret: params.clientSecret,
                    redirect_uri: redirect,
                    grant_type: 'authorization_code',
                }),
            });
            if (!r.ok) throw new Error(`upstox token exchange: ${r.status} ${await r.text()}`);
            const body = await r.json() as { access_token?: string };
            if (!body.access_token) throw new Error('upstox: no access_token in response');
            return { accessToken: body.access_token };
        }
        case 'fyers': {
            const crypto = await import('crypto');
            const appIdHash = crypto
                .createHash('sha256')
                .update(`${params.clientId}:${params.clientSecret}`)
                .digest('hex');
            const r = await fetch('https://api.fyers.in/api/v2/validate-authcode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    grant_type: 'authorization_code',
                    appIdHash,
                    code: params.code,
                }),
            });
            if (!r.ok) throw new Error(`fyers token exchange: ${r.status} ${await r.text()}`);
            const body = await r.json() as { access_token?: string };
            if (!body.access_token) throw new Error('fyers: no access_token in response');
            return { accessToken: body.access_token };
        }
    }
}
