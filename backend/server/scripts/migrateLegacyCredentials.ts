// backend/server/scripts/migrateLegacyCredentials.ts
// Migration 067 — copies rows from user_exchange_keys (legacy AES-GCM table)
// into user_exchange_keys_v2 (pgsodium vault). Uses credential_gen_nonce +
// credential_encrypt_with_nonce so the row-level shared-nonce pattern from
// credentialVault.store() matches (retrieveById decrypts all fields with the
// single row nonce).
//
// Idempotent: skips rows where (user_id, broker, nickname) already exists in v2.
// Non-destructive: does NOT delete from legacy. Task 25 drops the legacy table.
//
// Usage:
//   cd backend/server
//   npx tsx scripts/migrateLegacyCredentials.ts

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { decrypt as legacyDecrypt } from '../src/services/exchangeConnector';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface LegacyRow {
    id: string;
    user_id: string;
    exchange: string;
    nickname: string;
    environment: string | null;
    api_key: string | null;
    api_secret: string | null;
    passphrase: string | null;
    mt5_login: string | null;
    mt5_password: string | null;
    mt5_server: string | null;
    client_id: string | null;
    access_token: string | null;
    totp_secret: string | null;
    permissions: string[] | null;
    last_test_status: string | null;
    is_active: boolean;
}

async function genNonce(): Promise<Buffer> {
    const { data, error } = await supabase.rpc('credential_gen_nonce');
    if (error || !data) throw new Error(`credential_gen_nonce: ${error?.message ?? 'no data'}`);
    return data as Buffer;
}

async function encryptWith(plain: string | null, nonce: Buffer): Promise<Buffer | null> {
    if (!plain) return null;
    const { data, error } = await supabase.rpc('credential_encrypt_with_nonce', {
        p_plain: plain,
        p_nonce: nonce,
    });
    if (error || !data) throw new Error(`credential_encrypt_with_nonce: ${error?.message ?? 'no data'}`);
    return data as Buffer;
}

// Environment mapping — legacy used 'live' | 'testnet'; v2 accepts
// 'testnet' | 'live' | 'mainnet' | 'demo'. Preserve values that already
// match; leave unknown values alone.
function mapEnvironment(legacy: string | null): 'testnet' | 'live' | 'mainnet' | 'demo' {
    if (legacy === 'testnet') return 'testnet';
    if (legacy === 'demo') return 'demo';
    if (legacy === 'mainnet') return 'mainnet';
    // Default (live, null, or anything else) → live. Matches legacy 'live'
    // rows which are the vast majority.
    return 'live';
}

async function main(): Promise<void> {
    console.log('── Migration 067: legacy → v2 ──');
    const { data: legacy, error } = await supabase
        .from('user_exchange_keys')
        .select('*')
        .order('created_at', { ascending: true });
    if (error) {
        console.error('Read legacy failed:', error.message);
        process.exit(1);
    }
    if (!legacy || legacy.length === 0) {
        console.log('Legacy table empty — nothing to migrate.');
        return;
    }
    console.log(`Found ${legacy.length} legacy row(s).\n`);

    let copied = 0, skipped = 0, failed = 0;

    for (const row of legacy as LegacyRow[]) {
        try {
            // Idempotency: skip if v2 already has this (user, broker, nickname).
            const { data: existing } = await supabase
                .from('user_exchange_keys_v2')
                .select('id')
                .eq('user_id', row.user_id)
                .eq('broker', row.exchange)
                .eq('nickname', row.nickname)
                .maybeSingle();
            if (existing) {
                console.log(`  ~ ${row.exchange.padEnd(10)} "${row.nickname}" — already in v2, skip`);
                skipped++;
                continue;
            }

            // Decrypt legacy fields (returns plaintext as-is if the column
            // was never encrypted / EXCHANGE_ENCRYPTION_KEY not set).
            const apiKeyPt = row.api_key ? legacyDecrypt(row.api_key) : null;
            const apiSecretPt = row.api_secret ? legacyDecrypt(row.api_secret) : null;
            const passphrasePt = row.passphrase ? legacyDecrypt(row.passphrase) : null;
            const mt5PasswordPt = row.mt5_password ? legacyDecrypt(row.mt5_password) : null;
            const accessTokenPt = row.access_token ? legacyDecrypt(row.access_token) : null;
            const totpSecretPt = row.totp_secret ? legacyDecrypt(row.totp_secret) : null;

            // One nonce per row, shared across every encrypted field.
            const nonce = await genNonce();

            const apiKeyCt      = await encryptWith(apiKeyPt, nonce);
            const apiSecretCt   = await encryptWith(apiSecretPt, nonce);
            const passphraseCt  = await encryptWith(passphrasePt, nonce);
            const mt5PasswordCt = await encryptWith(mt5PasswordPt, nonce);
            const accessTokenCt = await encryptWith(accessTokenPt, nonce);
            const totpSecretCt  = await encryptWith(totpSecretPt, nonce);

            const { error: insErr } = await supabase.from('user_exchange_keys_v2').insert({
                user_id: row.user_id,
                broker: row.exchange,
                nickname: row.nickname,
                environment: mapEnvironment(row.environment),
                api_key_encrypted: apiKeyCt,
                api_secret_encrypted: apiSecretCt,
                passphrase_encrypted: passphraseCt,
                mt5_login: row.mt5_login,
                mt5_password_encrypted: mt5PasswordCt,
                mt5_server: row.mt5_server,
                client_id: row.client_id,
                access_token_encrypted: accessTokenCt,
                totp_secret_encrypted: totpSecretCt,
                nonce,
                permissions: row.permissions ?? [],
                last_test_status: row.last_test_status === 'success' ? 'success'
                                : row.last_test_status === 'failed' ? 'failed'
                                : null,
                is_active: row.is_active,
            });
            if (insErr) throw new Error(insErr.message);
            console.log(`  ✓ ${row.exchange.padEnd(10)} "${row.nickname}"`);
            copied++;
        } catch (e: any) {
            console.error(`  ✗ ${row.nickname}: ${e.message}`);
            failed++;
        }
    }

    console.log(`\nSummary — copied=${copied}, skipped=${skipped}, failed=${failed}`);
    if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
