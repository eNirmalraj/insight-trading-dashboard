// backend/server/scripts/diagnoseAllKeys.ts
// Dumps every user_exchange_keys row + decrypt test. Run from backend/server:
//   npx tsx scripts/diagnoseAllKeys.ts

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from '../src/services/exchangeConnector';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const ENC_KEY = process.env.EXCHANGE_ENCRYPTION_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function shape(s: string | null | undefined): string {
    if (s == null) return 'NULL';
    if (s === '') return 'EMPTY';
    const parts = s.split(':');
    if (parts.length === 3) {
        const [iv, tag, ct] = parts;
        return `ENCRYPTED (iv=${iv.length}b tag=${tag.length}b ct=${ct.length}b)`;
    }
    return `PLAINTEXT-ish (len=${s.length})`;
}

async function main() {
    console.log('── Environment ──');
    console.log('EXCHANGE_ENC_KEY:', ENC_KEY ? `set (len=${ENC_KEY.length})` : 'MISSING');
    console.log();

    const { data, error } = await supabase
        .from('user_exchange_keys')
        .select('id, user_id, exchange, nickname, environment, is_active, api_key, api_secret, last_test_status, last_tested_at')
        .order('created_at', { ascending: false });

    if (error) { console.error('Query failed:', error.message); process.exit(1); }
    if (!data?.length) { console.log('No rows in user_exchange_keys.'); return; }

    console.log(`Found ${data.length} row(s).`);
    console.log();

    for (const row of data) {
        console.log('─── Row ─────────────────────────');
        console.log('id          :', row.id);
        console.log('user_id     :', row.user_id);
        console.log('exchange    :', row.exchange);
        console.log('nickname    :', row.nickname);
        console.log('environment :', row.environment);
        console.log('is_active   :', row.is_active);
        console.log('last_test   :', row.last_test_status, '@', row.last_tested_at);
        console.log('api_key     :', shape(row.api_key));
        console.log('api_secret  :', shape(row.api_secret));

        try {
            const k = decrypt(row.api_key || '');
            const s = decrypt(row.api_secret || '');
            console.log('decrypt key   : len=%d prefix=%s', k.length, k.slice(0, 6));
            console.log('decrypt secret: len=%d prefix=%s', s.length, s.slice(0, 6));
            const keyLooksValid = /^[A-Za-z0-9]{40,80}$/.test(k);
            const secretLooksValid = /^[A-Za-z0-9]{40,80}$/.test(s);
            console.log('charset ok    : key=%s secret=%s', keyLooksValid, secretLooksValid);
            if (!keyLooksValid || !secretLooksValid) {
                console.log('  ↑ Non-alphanumeric after decrypt → wrong ENC_KEY vs what encrypted this row');
            }
        } catch (e: any) {
            console.log('decrypt FAILED:', e.message, '← AES tag mismatch = ENC_KEY changed since encryption');
        }
        console.log();
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
