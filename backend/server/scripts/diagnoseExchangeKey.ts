// backend/server/scripts/diagnoseExchangeKey.ts
// Dumps the state of every user_exchange_keys row for a user and tests
// the decrypt path so we can isolate Supabase vs. Binance issues.
//
// Usage:
//   cd backend/server
//   npx tsx scripts/diagnoseExchangeKey.ts <user_email_or_id>

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from '../src/services/exchangeConnector';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const ENC_KEY = process.env.EXCHANGE_ENCRYPTION_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in env');
    process.exit(1);
}

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
    const arg = process.argv[2];
    if (!arg) {
        console.error('Usage: tsx scripts/diagnoseExchangeKey.ts <email_or_user_id>');
        process.exit(1);
    }

    console.log('── Environment ──────────────────────────────');
    console.log('SUPABASE_URL       :', SUPABASE_URL);
    console.log('SERVICE_KEY set    :', !!SUPABASE_SERVICE_KEY);
    console.log('EXCHANGE_ENC_KEY   :', ENC_KEY ? `set (len=${ENC_KEY.length}, expects 64)` : 'MISSING → decrypt is a passthrough');
    console.log();

    // Resolve user id (pagination-safe)
    let userId = arg;
    if (arg.includes('@')) {
        let match: any = null;
        for (let page = 1; page <= 20; page++) {
            const { data: list } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
            if (!list?.users?.length) break;
            match = list.users.find((u) => u.email?.toLowerCase() === arg.toLowerCase());
            if (match) break;
        }
        if (!match) { console.error('User not found:', arg); process.exit(1); }
        userId = match.id;
        console.log('Resolved email →', userId);
    }

    // Pull rows
    const { data, error } = await supabase
        .from('user_exchange_keys')
        .select('id, exchange, nickname, environment, is_active, api_key, api_secret, passphrase, last_test_status')
        .eq('user_id', userId);

    if (error) { console.error('Query failed:', error.message); process.exit(1); }
    if (!data?.length) { console.log('No rows for this user.'); return; }

    for (const row of data) {
        console.log('─── Row', row.id, '─────────────────────────');
        console.log('exchange    :', row.exchange);
        console.log('nickname    :', row.nickname);
        console.log('environment :', row.environment);
        console.log('is_active   :', row.is_active);
        console.log('last_test   :', row.last_test_status);
        console.log('api_key     :', shape(row.api_key));
        console.log('api_secret  :', shape(row.api_secret));
        console.log('passphrase  :', shape(row.passphrase));

        // Attempt decrypt
        try {
            const k = decrypt(row.api_key);
            const s = decrypt(row.api_secret);
            console.log('decrypt key   :', k ? `ok (len=${k.length}, prefix=${k.slice(0, 6)}…)` : 'empty');
            console.log('decrypt secret:', s ? `ok (len=${s.length}, prefix=${s.slice(0, 6)}…)` : 'empty');
            // Binance API keys are typically 64 alphanumeric chars
            const looksValid = /^[A-Za-z0-9]{40,80}$/.test(k);
            console.log('key charset ok:', looksValid, looksValid ? '' : '← NOT alphanumeric / wrong length → decrypt corrupted OR stored wrong');
        } catch (e: any) {
            console.log('decrypt FAILED:', e.message, '← encryption key mismatch');
        }
        console.log();
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
