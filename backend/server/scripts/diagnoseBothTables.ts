// backend/server/scripts/diagnoseBothTables.ts
// Dumps rows from user_exchange_keys (legacy) and user_exchange_keys_v2 (vault)
// so we can see exactly which credentials the Execute modal is picking up.
//
//   npx tsx scripts/diagnoseBothTables.ts

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
    const [legacy, v2] = await Promise.all([
        supabase.from('user_exchange_keys')
            .select('id, user_id, exchange, nickname, environment, is_active, created_at')
            .order('created_at', { ascending: false }),
        supabase.from('user_exchange_keys_v2')
            .select('id, user_id, broker, nickname, network, is_active, created_at')
            .order('created_at', { ascending: false }),
    ]);

    console.log('╔══ user_exchange_keys (LEGACY) ══', legacy.data?.length ?? 0, 'rows');
    if (legacy.error) console.log('  error:', legacy.error.message);
    for (const r of legacy.data ?? []) {
        console.log(`  [${r.id.slice(0, 8)}] ${r.exchange.padEnd(8)} ${(r.environment || '').padEnd(8)} "${r.nickname}" active=${r.is_active} user=${r.user_id.slice(0, 8)}`);
    }

    console.log();
    console.log('╔══ user_exchange_keys_v2 (VAULT) ══', v2.data?.length ?? 0, 'rows');
    if (v2.error) console.log('  error:', v2.error.message);
    for (const r of v2.data ?? []) {
        console.log(`  [${r.id.slice(0, 8)}] ${r.broker.padEnd(8)} ${(r.network || '').padEnd(8)} "${r.nickname}" active=${r.is_active} user=${r.user_id.slice(0, 8)}`);
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
