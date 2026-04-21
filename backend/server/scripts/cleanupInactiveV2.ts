// backend/server/scripts/cleanupInactiveV2.ts
// One-off cleanup: remove inactive rows from user_exchange_keys_v2.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function main() {
    const { data: before } = await supabase
        .from('user_exchange_keys_v2')
        .select('id, broker, nickname, is_active')
        .eq('is_active', false);

    console.log('Inactive rows to delete:', before?.length ?? 0);
    for (const r of before ?? []) {
        console.log(`  [${r.id.slice(0, 8)}] ${r.broker} "${r.nickname}"`);
    }

    if (!before?.length) { console.log('Nothing to delete.'); return; }

    const { error, count } = await supabase
        .from('user_exchange_keys_v2')
        .delete({ count: 'exact' })
        .eq('is_active', false);

    if (error) { console.error('Delete failed:', error.message); process.exit(1); }
    console.log(`Deleted ${count} row(s).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
