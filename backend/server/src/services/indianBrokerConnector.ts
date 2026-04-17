import { supabaseAdmin } from './supabaseAdmin';
import { encrypt, decrypt } from './exchangeConnector';

// ── Types ───────────────────────────────────────────────

interface IndianBrokerKey {
    id: string;
    user_id: string;
    exchange: string;
    api_key: string;
    api_secret: string;
    client_id: string | null;
    access_token: string | null;
    totp_secret: string | null;
    passphrase: string | null; // reused for Angel One password/MPIN
    environment: string;
}

export interface IndianBrokerTestResult {
    ok: boolean;
    latencyMs: number;
    permissions: string[];
    balances: { asset: string; free: string }[];
    accountInfo: {
        broker: string;
        currency: string;
        leverage: number;
        name: string;
        server: string;
    } | null;
    error?: string;
}

// ── Broker-specific test implementations ────────────────

const testZerodha = async (row: IndianBrokerKey): Promise<IndianBrokerTestResult> => {
    const apiKey = decrypt(row.api_key);
    const accessToken = row.access_token ? decrypt(row.access_token) : '';

    if (!accessToken) {
        return {
            ok: true, latencyMs: 0,
            permissions: ['Saved (Token Required)'],
            balances: [],
            accountInfo: { broker: 'Zerodha', currency: 'INR', leverage: 0, name: '', server: 'Kite Connect' },
            error: undefined,
        };
    }

    const start = performance.now();
    try {
        const res = await fetch('https://api.kite.trade/user/profile', {
            headers: {
                'X-Kite-Version': '3',
                'Authorization': `token ${apiKey}:${accessToken}`,
            },
            signal: AbortSignal.timeout(10000),
        });
        const latencyMs = Math.round(performance.now() - start);
        const data = await res.json();

        if (data.status === 'error') {
            return {
                ok: false, latencyMs, permissions: [], balances: [],
                accountInfo: null, error: data.message || 'Authentication failed. Token may be expired.',
            };
        }

        const profile = data.data || {};
        const permissions = ['Read'];
        if (profile.exchanges?.length > 0) permissions.push('Trading');

        // Fetch margins
        const marginsRes = await fetch('https://api.kite.trade/user/margins', {
            headers: { 'X-Kite-Version': '3', 'Authorization': `token ${apiKey}:${accessToken}` },
        });
        const margins = await marginsRes.json();
        const balances: { asset: string; free: string }[] = [];

        if (margins.data?.equity) {
            const eq = margins.data.equity;
            balances.push({ asset: 'Equity (INR)', free: Number(eq.net || eq.available?.cash || 0).toFixed(2) });
        }
        if (margins.data?.commodity) {
            const cm = margins.data.commodity;
            balances.push({ asset: 'Commodity (INR)', free: Number(cm.net || cm.available?.cash || 0).toFixed(2) });
        }

        return {
            ok: true, latencyMs, permissions, balances,
            accountInfo: {
                broker: 'Zerodha',
                currency: 'INR',
                leverage: 0,
                name: profile.user_name || profile.user_shortname || '',
                server: 'Kite Connect',
            },
        };
    } catch (err: any) {
        return {
            ok: false, latencyMs: Math.round(performance.now() - start),
            permissions: [], balances: [], accountInfo: null,
            error: err?.message || 'Connection failed',
        };
    }
};

const testAngelOne = async (row: IndianBrokerKey): Promise<IndianBrokerTestResult> => {
    const apiKey = decrypt(row.api_key);
    const clientId = row.client_id ? decrypt(row.client_id) : '';
    const password = row.passphrase ? decrypt(row.passphrase) : '';
    const totpSecret = row.totp_secret ? decrypt(row.totp_secret) : '';

    if (!clientId || !password) {
        return {
            ok: true, latencyMs: 0,
            permissions: ['Saved (Login Required)'],
            balances: [],
            accountInfo: { broker: 'Angel One', currency: 'INR', leverage: 0, name: '', server: 'SmartAPI' },
        };
    }

    const start = performance.now();
    try {
        // Generate TOTP if secret provided
        let totp = '';
        if (totpSecret) {
            // Dynamic import for TOTP generation
            const { generateTOTP } = await import('../utils/totp');
            totp = generateTOTP(totpSecret);
        }

        // Login to get JWT token
        const loginRes = await fetch('https://apiconnect.angelone.in/rest/auth/angelbroking/user/v1/loginByPassword', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-UserType': 'USER',
                'X-SourceID': 'WEB',
                'X-ClientLocalIP': '127.0.0.1',
                'X-ClientPublicIP': '127.0.0.1',
                'X-MACAddress': '00:00:00:00:00:00',
                'X-PrivateKey': apiKey,
            },
            body: JSON.stringify({ clientcode: clientId, password, totp }),
            signal: AbortSignal.timeout(15000),
        });

        const latencyMs = Math.round(performance.now() - start);
        const loginData = await loginRes.json();

        if (!loginData.data?.jwtToken) {
            return {
                ok: false, latencyMs, permissions: [], balances: [],
                accountInfo: null,
                error: loginData.message || 'Login failed. Check Client ID, MPIN, and TOTP secret.',
            };
        }

        const jwt = loginData.data.jwtToken;
        const permissions = ['Read', 'Trading'];

        // Fetch RMS (risk management / margins)
        const rmsRes = await fetch('https://apiconnect.angelone.in/rest/secure/angelbroking/user/v1/getRMS', {
            headers: {
                'Authorization': `Bearer ${jwt}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-UserType': 'USER',
                'X-SourceID': 'WEB',
                'X-ClientLocalIP': '127.0.0.1',
                'X-ClientPublicIP': '127.0.0.1',
                'X-MACAddress': '00:00:00:00:00:00',
                'X-PrivateKey': apiKey,
            },
        });
        const rmsData = await rmsRes.json();
        const balances: { asset: string; free: string }[] = [];

        if (rmsData.data) {
            const rms = rmsData.data;
            if (rms.net) balances.push({ asset: 'Net (INR)', free: Number(rms.net).toFixed(2) });
            if (rms.availablecash) balances.push({ asset: 'Available Cash (INR)', free: Number(rms.availablecash).toFixed(2) });
            if (rms.utilisedmargin) balances.push({ asset: 'Used Margin (INR)', free: Number(rms.utilisedmargin).toFixed(2) });
        }

        return {
            ok: true, latencyMs, permissions, balances,
            accountInfo: {
                broker: 'Angel One',
                currency: 'INR',
                leverage: 0,
                name: loginData.data.name || clientId,
                server: 'SmartAPI',
            },
        };
    } catch (err: any) {
        return {
            ok: false, latencyMs: Math.round(performance.now() - start),
            permissions: [], balances: [], accountInfo: null,
            error: err?.message || 'Connection failed',
        };
    }
};

const testUpstox = async (row: IndianBrokerKey): Promise<IndianBrokerTestResult> => {
    const accessToken = row.access_token ? decrypt(row.access_token) : '';

    if (!accessToken) {
        return {
            ok: true, latencyMs: 0,
            permissions: ['Saved (Token Required)'],
            balances: [],
            accountInfo: { broker: 'Upstox', currency: 'INR', leverage: 0, name: '', server: 'Upstox API v2' },
        };
    }

    const start = performance.now();
    try {
        const res = await fetch('https://api.upstox.com/v2/user/profile', {
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
            signal: AbortSignal.timeout(10000),
        });
        const latencyMs = Math.round(performance.now() - start);
        const data = await res.json();

        if (data.status !== 'success') {
            return {
                ok: false, latencyMs, permissions: [], balances: [],
                accountInfo: null, error: data.errors?.[0]?.message || 'Token expired. Re-authenticate.',
            };
        }

        const profile = data.data || {};
        const permissions = ['Read'];
        if (profile.is_active) permissions.push('Trading');

        // Fetch funds
        const fundsRes = await fetch('https://api.upstox.com/v2/user/get-funds-and-margin', {
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
        });
        const fundsData = await fundsRes.json();
        const balances: { asset: string; free: string }[] = [];

        if (fundsData.data?.equity) {
            const eq = fundsData.data.equity;
            if (eq.available_margin != null) balances.push({ asset: 'Equity Margin (INR)', free: Number(eq.available_margin).toFixed(2) });
            if (eq.used_margin != null) balances.push({ asset: 'Used Margin (INR)', free: Number(eq.used_margin).toFixed(2) });
        }

        return {
            ok: true, latencyMs, permissions, balances,
            accountInfo: {
                broker: 'Upstox',
                currency: 'INR',
                leverage: 0,
                name: profile.user_name || '',
                server: 'Upstox API v2',
            },
        };
    } catch (err: any) {
        return {
            ok: false, latencyMs: Math.round(performance.now() - start),
            permissions: [], balances: [], accountInfo: null,
            error: err?.message || 'Connection failed',
        };
    }
};

const testDhan = async (row: IndianBrokerKey): Promise<IndianBrokerTestResult> => {
    const accessToken = row.access_token ? decrypt(row.access_token) : '';
    const clientId = row.client_id ? decrypt(row.client_id) : '';

    if (!accessToken || !clientId) {
        return {
            ok: true, latencyMs: 0,
            permissions: ['Saved (Credentials Required)'],
            balances: [],
            accountInfo: { broker: 'Dhan', currency: 'INR', leverage: 0, name: '', server: 'DhanHQ' },
        };
    }

    const start = performance.now();
    try {
        const res = await fetch('https://api.dhan.co/v2/fundlimit', {
            headers: {
                'access-token': accessToken,
                'client-id': clientId,
                'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(10000),
        });
        const latencyMs = Math.round(performance.now() - start);
        const data = await res.json();

        if (!res.ok) {
            return {
                ok: false, latencyMs, permissions: [], balances: [],
                accountInfo: null, error: data.remarks || 'Authentication failed.',
            };
        }

        const permissions = ['Read', 'Trading'];
        const balances: { asset: string; free: string }[] = [];

        if (data.availabelBalance != null) balances.push({ asset: 'Available (INR)', free: Number(data.availabelBalance).toFixed(2) });
        if (data.sodLimit != null) balances.push({ asset: 'SOD Limit (INR)', free: Number(data.sodLimit).toFixed(2) });
        if (data.utilizedAmount != null) balances.push({ asset: 'Utilized (INR)', free: Number(data.utilizedAmount).toFixed(2) });

        return {
            ok: true, latencyMs, permissions, balances,
            accountInfo: {
                broker: 'Dhan',
                currency: 'INR',
                leverage: 0,
                name: clientId,
                server: 'DhanHQ',
            },
        };
    } catch (err: any) {
        return {
            ok: false, latencyMs: Math.round(performance.now() - start),
            permissions: [], balances: [], accountInfo: null,
            error: err?.message || 'Connection failed',
        };
    }
};

const testFyers = async (row: IndianBrokerKey): Promise<IndianBrokerTestResult> => {
    const apiKey = decrypt(row.api_key);
    const accessToken = row.access_token ? decrypt(row.access_token) : '';

    if (!accessToken) {
        return {
            ok: true, latencyMs: 0,
            permissions: ['Saved (Token Required)'],
            balances: [],
            accountInfo: { broker: 'Fyers', currency: 'INR', leverage: 0, name: '', server: 'Fyers API v3' },
        };
    }

    const start = performance.now();
    try {
        const res = await fetch('https://api-t1.fyers.in/api/v3/profile', {
            headers: { 'Authorization': `${apiKey}:${accessToken}` },
            signal: AbortSignal.timeout(10000),
        });
        const latencyMs = Math.round(performance.now() - start);
        const data = await res.json();

        if (data.s !== 'ok') {
            return {
                ok: false, latencyMs, permissions: [], balances: [],
                accountInfo: null, error: data.message || 'Token expired. Re-authenticate.',
            };
        }

        const profile = data.data || {};
        const permissions = ['Read', 'Trading'];

        // Fetch funds
        const fundsRes = await fetch('https://api-t1.fyers.in/api/v3/funds', {
            headers: { 'Authorization': `${apiKey}:${accessToken}` },
        });
        const fundsData = await fundsRes.json();
        const balances: { asset: string; free: string }[] = [];

        if (fundsData.fund_limit) {
            for (const fund of fundsData.fund_limit) {
                if (fund.title === 'Total Balance' && fund.equityAmount != null) {
                    balances.push({ asset: 'Equity (INR)', free: Number(fund.equityAmount).toFixed(2) });
                }
                if (fund.title === 'Available Balance' && fund.equityAmount != null) {
                    balances.push({ asset: 'Available (INR)', free: Number(fund.equityAmount).toFixed(2) });
                }
            }
        }

        return {
            ok: true, latencyMs, permissions, balances,
            accountInfo: {
                broker: 'Fyers',
                currency: 'INR',
                leverage: 0,
                name: profile.name || profile.fy_id || '',
                server: 'Fyers API v3',
            },
        };
    } catch (err: any) {
        return {
            ok: false, latencyMs: Math.round(performance.now() - start),
            permissions: [], balances: [], accountInfo: null,
            error: err?.message || 'Connection failed',
        };
    }
};

// ── Router ──────────────────────────────────────────────

const INDIAN_BROKERS = ['zerodha', 'angelone', 'upstox', 'dhan', 'fyers'];

export const isIndianBroker = (exchange: string) => INDIAN_BROKERS.includes(exchange);

export const testIndianBrokerConnection = async (exchangeKeyId: string): Promise<IndianBrokerTestResult> => {
    const { data: row, error: fetchErr } = await supabaseAdmin
        .from('user_exchange_keys')
        .select('*')
        .eq('id', exchangeKeyId)
        .single();

    if (fetchErr || !row) {
        return {
            ok: false, latencyMs: 0, permissions: [], balances: [], accountInfo: null,
            error: 'Connection not found.',
        };
    }

    const result = await (async () => {
        switch (row.exchange) {
            case 'zerodha': return testZerodha(row as IndianBrokerKey);
            case 'angelone': return testAngelOne(row as IndianBrokerKey);
            case 'upstox': return testUpstox(row as IndianBrokerKey);
            case 'dhan': return testDhan(row as IndianBrokerKey);
            case 'fyers': return testFyers(row as IndianBrokerKey);
            default: return {
                ok: false, latencyMs: 0, permissions: [], balances: [], accountInfo: null,
                error: `Unsupported broker: ${row.exchange}`,
            } as IndianBrokerTestResult;
        }
    })();

    // Persist result
    await supabaseAdmin
        .from('user_exchange_keys')
        .update({
            last_tested_at: new Date().toISOString(),
            last_test_status: result.ok ? 'success' : 'failed',
            permissions: result.permissions,
        })
        .eq('id', exchangeKeyId);

    return result;
};

// ── Encrypt Indian broker fields ────────────────────────

export const encryptIndianBrokerFields = (payload: Record<string, any>) => {
    const encrypted: Record<string, any> = {};
    for (const key of ['api_key', 'api_secret', 'client_id', 'access_token', 'totp_secret', 'passphrase']) {
        if (payload[key]) encrypted[key] = encrypt(payload[key]);
    }
    return encrypted;
};
