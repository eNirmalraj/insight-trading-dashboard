// backend/server/src/services/credentialVault.ts
// Encrypted storage of exchange API credentials using Supabase Vault (pgsodium).
// Secrets are decrypted only in-process when an adapter needs them.
// They are never logged or returned to the frontend.

import { supabaseAdmin } from './supabaseAdmin';
import { BrokerCredentials } from '../engine/brokerAdapters/types';

export interface CredentialInfo {
    id: string;
    broker: string;
    nickname: string;
    is_active: boolean;
    last_verified_at: string | null;
}

// Extended input type covering all broker credential shapes.
export interface StoreInput {
    userId: string;
    broker: string;
    nickname: string;
    environment: 'testnet' | 'live' | 'mainnet' | 'demo';
    // Crypto brokers (Binance, Bitget, …)
    apiKey?: string;
    apiSecret?: string;
    passphrase?: string;
    // MT5
    mt5Login?: string;
    mt5Password?: string;
    mt5Server?: string;
    // Indian brokers (Zerodha, AngelOne, Upstox, Dhan, Fyers)
    clientId?: string;
    accessToken?: string;
    totpSecret?: string;
}

// Richer return type that includes all encrypted fields, decrypted.
// Exported so downstream tasks (e.g. broker adapters) can import the type.
export interface BrokerCredentialsFull {
    id: string;
    userId: string;
    broker: string;
    environment: string | null;
    apiKey?: string;
    apiSecret?: string;
    passphrase?: string;
    mt5Login?: string;
    mt5Password?: string;
    mt5Server?: string;
    clientId?: string;
    accessToken?: string;
    totpSecret?: string;
}

// We use pgsodium.crypto_aead_det_encrypt + decrypt. A single nonce is
// generated per row (via credential_gen_nonce) and shared across all encrypted
// columns of that row. Each field is then encrypted independently using
// credential_encrypt_with_nonce and decrypted with credential_decrypt_one.

export async function store(params: StoreInput): Promise<{ id: string }> {
    // 1. Generate one nonce for the entire row.
    const { data: nonceData, error: nonceErr } = await supabaseAdmin.rpc('credential_gen_nonce');
    if (nonceErr || nonceData == null) {
        throw new Error(`credentialVault.store: credential_gen_nonce failed — ${nonceErr?.message ?? 'no data'}`);
    }
    const nonce = nonceData as Buffer;

    // 2. Helper: encrypt one optional field using the row nonce.
    const encryptWith = async (plain: string | undefined): Promise<Buffer | null> => {
        if (plain == null || plain === '') return null;
        const { data, error } = await supabaseAdmin.rpc('credential_encrypt_with_nonce', {
            p_plain: plain,
            p_nonce: nonce,
        });
        if (error || data == null) {
            throw new Error(`credentialVault.store: credential_encrypt_with_nonce failed — ${error?.message ?? 'no data'}`);
        }
        return data as Buffer;
    };

    const apiKeyCt    = await encryptWith(params.apiKey);
    const apiSecretCt = await encryptWith(params.apiSecret);
    const passphraseCt = await encryptWith(params.passphrase);
    const mt5PasswordCt = await encryptWith(params.mt5Password);
    const accessTokenCt = await encryptWith(params.accessToken);
    const totpSecretCt  = await encryptWith(params.totpSecret);

    const { data, error } = await supabaseAdmin
        .from('user_exchange_keys_v2')
        .insert({
            user_id: params.userId,
            broker: params.broker,
            nickname: params.nickname,
            environment: params.environment,
            api_key_encrypted: apiKeyCt,
            api_secret_encrypted: apiSecretCt,
            passphrase_encrypted: passphraseCt,
            mt5_login: params.mt5Login ?? null,
            mt5_password_encrypted: mt5PasswordCt,
            mt5_server: params.mt5Server ?? null,
            client_id: params.clientId ?? null,
            access_token_encrypted: accessTokenCt,
            totp_secret_encrypted: totpSecretCt,
            nonce,
            is_active: true,
        })
        .select('id')
        .single();

    if (error || !data) {
        throw new Error(`credentialVault.store: insert failed — ${error?.message ?? 'no row'}`);
    }
    return { id: data.id };
}

export async function retrieveById(id: string): Promise<BrokerCredentialsFull | null> {
    const { data: row, error } = await supabaseAdmin
        .from('user_exchange_keys_v2')
        .select('*')
        .eq('id', id)
        .eq('is_active', true)
        .maybeSingle();

    if (error) {
        console.error('[credentialVault] retrieveById failed:', error.message);
        return null;
    }
    if (!row) return null;

    // Decrypt one optional encrypted column using the row's shared nonce.
    //
    // Note on "shared nonce": pgsodium.crypto_aead_det uses AES-SIV underneath,
    // which is explicitly designed to be safe against nonce reuse (that's the
    // whole point of deterministic / SIV constructions). Re-using one nonce for
    // multiple fields in the same row is OK.
    //
    // Decryption failures are thrown, not silently swallowed. A partial decrypt
    // would hand adapters a half-null credential and cause confusing downstream
    // errors at the exchange boundary.
    const decrypt = async (ct: Buffer | null | undefined): Promise<string | undefined> => {
        if (ct == null) return undefined;
        if (row.nonce == null) {
            throw new Error(`[credentialVault] row ${row.id} has encrypted column but null nonce`);
        }
        const { data, error: decErr } = await supabaseAdmin.rpc('credential_decrypt_one', {
            p_ct: ct,
            p_nonce: row.nonce,
        });
        if (decErr || data == null) {
            throw new Error(`[credentialVault] decryption failed for row ${row.id}: ${decErr?.message ?? 'no data'}`);
        }
        return data as string;
    };

    return {
        id: row.id,
        userId: row.user_id,
        broker: row.broker,
        environment: row.environment ?? null,
        apiKey: await decrypt(row.api_key_encrypted),
        apiSecret: await decrypt(row.api_secret_encrypted),
        passphrase: await decrypt(row.passphrase_encrypted),
        mt5Login: row.mt5_login ?? undefined,
        mt5Password: await decrypt(row.mt5_password_encrypted),
        mt5Server: row.mt5_server ?? undefined,
        clientId: row.client_id ?? undefined,
        accessToken: await decrypt(row.access_token_encrypted),
        totpSecret: await decrypt(row.totp_secret_encrypted),
    };
}

// retrieveActiveForUser returns BrokerCredentialsFull (a superset of the old
// BrokerCredentials) so existing callers that only read apiKey/apiSecret still work.
export async function retrieveActiveForUser(
    userId: string,
    broker: string,
): Promise<BrokerCredentialsFull | null> {
    const { data: row, error } = await supabaseAdmin
        .from('user_exchange_keys_v2')
        .select('id')
        .eq('user_id', userId)
        .eq('broker', broker)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error || !row) return null;
    return retrieveById(row.id);
}

export async function listForUser(userId: string): Promise<CredentialInfo[]> {
    const { data, error } = await supabaseAdmin
        .from('user_exchange_keys_v2')
        .select('id, broker, nickname, is_active, last_verified_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error || !data) return [];
    return data as CredentialInfo[];
}

export async function remove(id: string, userId: string): Promise<void> {
    const { error } = await supabaseAdmin
        .from('user_exchange_keys_v2')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
    if (error) throw new Error(`credentialVault.remove: ${error.message}`);
}

export async function markVerified(id: string): Promise<void> {
    await supabaseAdmin
        .from('user_exchange_keys_v2')
        .update({ last_verified_at: new Date().toISOString() })
        .eq('id', id);
}

export const credentialVault = {
    store,
    retrieveById,
    retrieveActiveForUser,
    listForUser,
    remove,
    markVerified,
};
