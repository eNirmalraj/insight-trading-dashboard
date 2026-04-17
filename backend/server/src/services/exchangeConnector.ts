import ccxt, { Exchange } from 'ccxt';
import { supabaseAdmin } from './supabaseAdmin';
import crypto from 'crypto';

// ── Encryption ──────────────────────────────────────────
// AES-256-GCM encryption for API secrets at rest.
// Key is derived from EXCHANGE_ENCRYPTION_KEY env var (32-byte hex or 64-char string).
// If not set, falls back to raw storage (dev-only).

const ENC_KEY_HEX = process.env.EXCHANGE_ENCRYPTION_KEY || '';
const ENC_KEY = ENC_KEY_HEX.length === 64
    ? Buffer.from(ENC_KEY_HEX, 'hex')
    : null;

export const encrypt = (plaintext: string): string => {
    if (!ENC_KEY) return plaintext; // dev fallback
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    // Format: iv:tag:ciphertext (all hex)
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
};

export const decrypt = (encoded: string): string => {
    if (!ENC_KEY) return encoded; // dev fallback (stored as plaintext)
    const parts = encoded.split(':');
    if (parts.length !== 3) return encoded; // not encrypted, return as-is
    const [ivHex, tagHex, ciphertextHex] = parts;
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        ENC_KEY,
        Buffer.from(ivHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(ciphertextHex, 'hex')),
        decipher.final(),
    ]);
    return decrypted.toString('utf8');
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

const createExchange = (row: StoredKey): Exchange => {
    const isTestnet = row.environment === 'testnet';
    const apiKey = decrypt(row.api_key);
    const secret = decrypt(row.api_secret);
    const passphrase = row.passphrase ? decrypt(row.passphrase) : undefined;

    switch (row.exchange) {
        case 'binance': {
            const ex = new ccxt.binance({
                apiKey,
                secret,
                enableRateLimit: true,
            });
            if (isTestnet) {
                ex.setSandboxMode(true);
            }
            return ex;
        }
        case 'bitget': {
            const ex = new ccxt.bitget({
                apiKey,
                secret,
                password: passphrase,
                enableRateLimit: true,
            });
            if (isTestnet) {
                ex.setSandboxMode(true);
            }
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
    // Fetch stored key (service-role bypasses RLS)
    const { data: row, error: fetchErr } = await supabaseAdmin
        .from('user_exchange_keys')
        .select('*')
        .eq('id', exchangeKeyId)
        .single();

    if (fetchErr || !row) {
        return {
            ok: false,
            latencyMs: 0,
            permissions: [],
            balances: [],
            error: 'Exchange connection not found.',
        };
    }

    const start = performance.now();

    try {
        const exchange = createExchange(row as StoredKey);

        // Fetch balance — this validates the key, returns balances, and
        // implicitly confirms "read" + "spot" permissions if it succeeds.
        const balance = await exchange.fetchBalance();
        const latencyMs = Math.round(performance.now() - start);

        // Detect permissions from exchange-specific account info
        const permissions: string[] = ['Read'];

        try {
            if (row.exchange === 'binance') {
                // Binance: GET /api/v3/account returns canTrade, canWithdraw, permissions[]
                const accountInfo = await (exchange as any).privateGetAccount();
                if (accountInfo) {
                    if (accountInfo.canTrade) permissions.push('Spot Trading');
                    if (accountInfo.permissions?.includes('MARGIN')) permissions.push('Margin');
                    if (accountInfo.canWithdraw) permissions.push('Withdraw');
                }
                // Check futures separately
                try {
                    await (exchange as any).fapiPrivateGetAccount();
                    permissions.push('Futures');
                } catch {
                    // No futures permission or account not opened
                }
            } else if (row.exchange === 'bitget') {
                // If fetchBalance succeeded, spot trading is enabled
                permissions.push('Spot Trading');
                // Check futures
                try {
                    await (exchange as any).privateMixGetAccountAccounts({ productType: 'umcbl' });
                    permissions.push('Futures');
                } catch {
                    // No futures
                }
            }
        } catch {
            // Permission detection is best-effort — balance fetch already confirmed the key works
            permissions.push('Spot Trading');
        }

        // Top 5 non-zero balances
        const nonZero = Object.entries(balance.free || {})
            .filter(([, amt]) => Number(amt) > 0)
            .sort(([, a], [, b]) => Number(b) - Number(a))
            .slice(0, 5)
            .map(([asset, free]) => ({
                asset,
                free: Number(free).toFixed(6).replace(/\.?0+$/, ''),
            }));

        // Persist result
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
        const message =
            err?.message?.includes('API-key')
                ? 'Invalid API key or secret.'
                : err?.message?.includes('timestamp')
                    ? 'Clock sync error — check your system time.'
                    : err?.message?.includes('IP')
                        ? 'IP not whitelisted on exchange.'
                        : err?.message || 'Connection failed.';

        await supabaseAdmin
            .from('user_exchange_keys')
            .update({
                last_tested_at: new Date().toISOString(),
                last_test_status: 'failed',
            })
            .eq('id', exchangeKeyId);

        return {
            ok: false,
            latencyMs,
            permissions: [],
            balances: [],
            error: message,
        };
    }
};

// ── Encrypt on save (middleware) ─────────────────────────

export const encryptKeyFields = (payload: {
    api_key: string;
    api_secret: string;
    passphrase?: string | null;
}) => ({
    api_key: encrypt(payload.api_key),
    api_secret: encrypt(payload.api_secret),
    passphrase: payload.passphrase ? encrypt(payload.passphrase) : null,
});
