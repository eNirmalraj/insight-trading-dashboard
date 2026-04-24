import ccxt, { Exchange } from 'ccxt';
import { supabaseAdmin } from './supabaseAdmin';
import crypto from 'crypto';

// ── Encryption (AES-256-GCM at rest) ───────────────────

const ENC_KEY_HEX = process.env.EXCHANGE_ENCRYPTION_KEY || '';
const ENC_KEY = ENC_KEY_HEX.length === 64 ? Buffer.from(ENC_KEY_HEX, 'hex') : null;

export const encrypt = (plaintext: string): string => {
    if (!ENC_KEY) return plaintext;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
};

export const decrypt = (encoded: string): string => {
    if (!ENC_KEY) return encoded;
    const parts = encoded.split(':');
    if (parts.length !== 3) return encoded;
    const [ivHex, tagHex, ciphertextHex] = parts;
    try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(ivHex, 'hex'));
        decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
        const decrypted = Buffer.concat([
            decipher.update(Buffer.from(ciphertextHex, 'hex')),
            decipher.final(),
        ]);
        return decrypted.toString('utf8');
    } catch {
        return encoded;
    }
};

// ── Exchange factory ────────────────────────────────────

interface StoredKey {
    id: string;
    exchange: string;
    api_key: string;
    api_secret: string;
    passphrase: string | null;
    environment: string;
    user_id: string;
}

export const buildBinanceFutures = (
    apiKey: string,
    secret: string,
    env: 'demo' | 'live',
): Exchange => {
    const ex = new ccxt.binance({
        apiKey,
        secret,
        enableRateLimit: true,
        options: { defaultType: 'future' },
    });
    if (env === 'demo') {
        const urls = ex.urls['api'] as Record<string, string>;
        urls['fapiPrivate']   = 'https://demo-fapi.binance.com/fapi/v1';
        urls['fapiPublic']    = 'https://demo-fapi.binance.com/fapi/v1';
        urls['fapiPrivateV2'] = 'https://demo-fapi.binance.com/fapi/v2';
        urls['fapiPublicV2']  = 'https://demo-fapi.binance.com/fapi/v2';
        urls['fapiData']      = 'https://demo-fapi.binance.com/futures/data';
    }
    return ex;
};

const createExchange = (row: StoredKey): Exchange => {
    const isTestnet = row.environment === 'testnet';
    const apiKey = decrypt(row.api_key);
    const secret = decrypt(row.api_secret);
    const passphrase = row.passphrase ? decrypt(row.passphrase) : undefined;

    switch (row.exchange) {
        case 'binance': {
            const env: 'demo' | 'live' = row.environment === 'live' ? 'live' : 'demo';
            return buildBinanceFutures(apiKey, secret, env);
        }
        case 'bitget': {
            const ex = new ccxt.bitget({
                apiKey, secret, password: passphrase, enableRateLimit: true,
            });
            if (isTestnet) ex.setSandboxMode(true);
            return ex;
        }
        default:
            throw new Error(`Unsupported exchange: ${row.exchange}`);
    }
};

// ── Test connection ─────────────────────────────────────

export interface TestResult {
    ok: boolean;
    latencyMs: number;
    permissions: string[];
    balances: { asset: string; free: string }[];
    error?: string;
}

export const testConnection = async (exchangeKeyId: string): Promise<TestResult> => {
    const { data: row, error: fetchErr } = await supabaseAdmin
        .from('user_exchange_keys')
        .select('*')
        .eq('id', exchangeKeyId)
        .single();

    if (fetchErr || !row) {
        return { ok: false, latencyMs: 0, permissions: [], balances: [], error: 'Connection not found.' };
    }

    const start = performance.now();

    try {
        const exchange = createExchange(row as StoredKey);
        const balance = await exchange.fetchBalance();
        const latencyMs = Math.round(performance.now() - start);

        const permissions: string[] = ['Read'];
        try {
            if (row.exchange === 'binance') {
                await (exchange as any).fapiPrivateV2GetAccount();
                permissions.push('Futures');
                try {
                    const spotInfo = await (exchange as any).privateGetAccount();
                    if (spotInfo?.canTrade) permissions.push('Spot Trading');
                    if (spotInfo?.permissions?.includes('MARGIN')) permissions.push('Margin');
                    if (spotInfo?.canWithdraw) permissions.push('Withdraw');
                } catch { /* no spot perm — informational only */ }
            } else if (row.exchange === 'bitget') {
                permissions.push('Spot Trading');
            }
        } catch {
            /* futures probe failed; permissions stays at ['Read'] */
        }

        const nonZero = Object.entries(balance.free || {})
            .filter(([, amt]) => Number(amt) > 0)
            .sort(([, a], [, b]) => Number(b) - Number(a))
            .slice(0, 5)
            .map(([asset, free]) => ({
                asset,
                free: Number(free).toFixed(6).replace(/\.?0+$/, ''),
            }));

        await supabaseAdmin
            .from('user_exchange_keys')
            .update({
                last_tested_at: new Date().toISOString(),
                last_test_status: 'success',
                permissions,
            })
            .eq('id', exchangeKeyId);

        return { ok: true, latencyMs, permissions, balances: nonZero };
    } catch (err: any) {
        const latencyMs = Math.round(performance.now() - start);
        const msg = err?.message || '';
        const message = msg.includes('API-key')
            ? 'Invalid API key or secret.'
            : msg.includes('timestamp')
              ? 'Clock sync error — check your system time.'
              : msg.includes('IP')
                ? 'IP not whitelisted on exchange.'
                : msg || 'Connection failed.';

        await supabaseAdmin
            .from('user_exchange_keys')
            .update({
                last_tested_at: new Date().toISOString(),
                last_test_status: 'failed',
            })
            .eq('id', exchangeKeyId);

        return { ok: false, latencyMs, permissions: [], balances: [], error: message };
    }
};

// ── Encrypt fields before DB storage ────────────────────

export const encryptKeyFields = (payload: {
    api_key?: string;
    api_secret?: string;
    passphrase?: string | null;
}) => {
    const out: Record<string, any> = {};
    if (payload.api_key) out.api_key = encrypt(payload.api_key);
    if (payload.api_secret) out.api_secret = encrypt(payload.api_secret);
    out.passphrase = payload.passphrase ? encrypt(payload.passphrase) : null;
    return out;
};
