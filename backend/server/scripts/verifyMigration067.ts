// backend/server/scripts/verifyMigration067.ts
// After migration 067 runs, confirm each v2 row decrypts cleanly via the
// credentialVault. Exits nonzero if any row fails to round-trip.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { retrieveById } from '../src/services/credentialVault';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function main(): Promise<void> {
    const { data: v2, error } = await supabase
        .from('user_exchange_keys_v2')
        .select('id, nickname, broker, environment');
    if (error) { console.error(error.message); process.exit(1); }
    if (!v2 || v2.length === 0) {
        console.log('v2 table empty — nothing to verify.');
        return;
    }

    let ok = 0, bad = 0;
    for (const row of v2) {
        try {
            const full = await retrieveById(row.id);
            // Consider the row "verified" if retrieveById returned a record
            // with at least one secret field present (or explicitly no-secret
            // brokers like Dhan that only have clientId).
            const hasSecret = full && (full.apiKey || full.apiSecret || full.mt5Login
                || full.accessToken || full.clientId);
            if (hasSecret) {
                console.log(`  ✓ ${row.broker.padEnd(10)} "${row.nickname}"`);
                ok++;
            } else {
                console.log(`  ✗ ${row.broker.padEnd(10)} "${row.nickname}" — retrieveById returned no secrets`);
                bad++;
            }
        } catch (e: any) {
            console.log(`  ✗ ${row.broker.padEnd(10)} "${row.nickname}" — threw: ${e.message}`);
            bad++;
        }
    }
    console.log(`\nVerified ${ok}/${v2.length} rows; ${bad} failed.`);
    if (bad > 0) process.exit(1);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
